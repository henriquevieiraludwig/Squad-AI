// Execução dos agentes: loop de uso de ferramentas com o Claude, permissões por ação,
// fila de aprovação humana e registro de tudo o que o agente fez.
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db.js';
import { ACTIONS, ACTION_BY_ID, connectionFor } from '../../shared/catalog.js';
import { executeAction, validateInput, credentialsFor, connectors } from '../connectors/index.js';

const MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 60;

export class AgentError extends Error {}

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// ---------- Ferramentas do agente ----------

export function agentToolModes(agentId) {
  return Object.fromEntries(db.prepare('SELECT action_id, mode FROM agent_tools WHERE agent_id = ?').all(agentId).map((r) => [r.action_id, r.mode]));
}

function connectedProviders(orgId) {
  return new Set(db.prepare('SELECT provider FROM integrations WHERE org_id = ?').all(orgId).map((r) => r.provider));
}

// Só entram ações ligadas no agente E cuja plataforma está conectada. Ordem fixa do catálogo (ajuda o cache).
function enabledTools(agent) {
  const modes = agentToolModes(agent.id);
  const connected = connectedProviders(agent.org_id);
  return ACTIONS.filter((a) => modes[a.id] && connected.has(connectionFor(a.provider))).map((a) => ({ action: a, mode: modes[a.id] }));
}

const CHANNEL_NOTES = {
  teste: 'Conversa de teste dentro da plataforma, com alguém da equipe da empresa.',
  telegram: 'Conversa pelo Telegram. Escreva em texto simples, sem Markdown, com mensagens curtas.',
  whatsapp: 'Conversa pelo WhatsApp. Escreva em texto simples, sem Markdown, com mensagens curtas.',
};

function systemPrompt(agent, orgName, channel) {
  const today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo' }).format(new Date());
  return `Você é ${agent.name}, agente de IA da empresa ${orgName}, atuando na área de ${agent.area}.

Sua função, nas palavras da equipe: ${agent.role_description || 'ainda não descrita. Ajude dentro da sua área.'}

Responda sempre em português do Brasil, de forma direta e cordial.

Você pode agir nas plataformas da empresa pelas ferramentas disponíveis. Algumas ações passam por aprovação de uma pessoa da equipe antes de serem executadas. Quando uma ferramenta disser que a ação está aguardando aprovação, avise que o pedido foi registrado e será confirmado pela equipe; não diga que a ação já foi feita. Só afirme que algo foi feito quando a ferramenta confirmar.

Antes de enviar algo em nome da empresa (e-mails, mensagens, convites), confirme com a pessoa os dados que faltarem em vez de supor destinatários, horários ou conteúdo. Se nenhuma ferramenta disponível resolve o pedido, diga isso com clareza.

Canal: ${CHANNEL_NOTES[channel] || channel}
Hoje é ${today}. Fuso horário: ${process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo'}.`;
}

// ---------- Histórico ----------

function loadHistory(conversationId) {
  const rows = db.prepare('SELECT role, content_json FROM messages WHERE conversation_id = ? ORDER BY id').all(conversationId);
  let start = Math.max(0, rows.length - HISTORY_LIMIT);
  // O recorte precisa começar numa mensagem do usuário com texto (não num tool_result),
  // senão a API recusa pares de ferramenta incompletos.
  while (start < rows.length) {
    const r = rows[start];
    const content = JSON.parse(r.content_json);
    const isToolResult = Array.isArray(content) && content.some((b) => b.type === 'tool_result');
    if (r.role === 'user' && !isToolResult) break;
    start++;
  }
  return rows.slice(start).map((r) => ({ role: r.role, content: JSON.parse(r.content_json) }));
}

function append(conversationId, role, content) {
  db.prepare('INSERT INTO messages (conversation_id, role, content_json) VALUES (?, ?, ?)').run(conversationId, role, JSON.stringify(content));
}

// Decisões de aprovação ainda não comunicadas ao agente viram uma mensagem de sistema no próximo turno.
function pendingDecisionNote(conversationId) {
  const runs = db
    .prepare(`SELECT id, action_id, status, result_json FROM action_runs WHERE conversation_id = ? AND notified = 0 AND status != 'pendente'`)
    .all(conversationId);
  if (!runs.length) return null;
  db.prepare(`UPDATE action_runs SET notified = 1 WHERE conversation_id = ? AND notified = 0 AND status != 'pendente'`).run(conversationId);
  const lines = runs.map((r) => {
    const label = ACTION_BY_ID[r.action_id]?.label || r.action_id;
    if (r.status === 'executada') return `Pedido #${r.id} (${label}) foi aprovado e executado. Resultado: ${r.result_json}`;
    if (r.status === 'recusada') return `Pedido #${r.id} (${label}) foi recusado pela equipe e não foi executado.`;
    return `Pedido #${r.id} (${label}) foi aprovado, mas falhou ao executar: ${r.result_json}`;
  });
  return `Atualização das aprovações desde a última mensagem:\n${lines.join('\n')}`;
}

// ---------- Registro de ações ----------

function recordRun({ orgId, agentId, conversationId, actionId, input, status, result, notified = 1 }) {
  const r = db
    .prepare(
      `INSERT INTO action_runs (org_id, agent_id, conversation_id, action_id, input_json, status, result_json, notified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(orgId, agentId, conversationId, actionId, JSON.stringify(input), status, result == null ? null : JSON.stringify(result), notified);
  return Number(r.lastInsertRowid);
}

async function runTool(ctx, block, toolsByName) {
  const entry = toolsByName[block.name];
  const base = { type: 'tool_result', tool_use_id: block.id };
  if (!entry) return { result: { ...base, is_error: true, content: 'Esta ferramenta não está liberada para este agente.' } };

  const problem = validateInput(entry.action, block.input);
  if (problem) return { result: { ...base, is_error: true, content: `Entrada inválida: ${problem}` } };

  const common = { orgId: ctx.orgId, agentId: ctx.agentId, conversationId: ctx.conversationId, actionId: entry.action.id, input: block.input };

  if (entry.mode === 'approval') {
    const id = recordRun({ ...common, status: 'pendente', notified: 0 });
    return {
      run: { id, actionId: entry.action.id, label: entry.action.label, status: 'pendente', input: block.input },
      result: {
        ...base,
        content: `Pedido #${id} registrado e aguardando aprovação de uma pessoa da equipe. A ação ainda não foi executada.`,
      },
    };
  }

  try {
    const output = await executeAction(ctx.orgId, entry.action.id, block.input);
    const id = recordRun({ ...common, status: 'executada', result: output });
    return {
      run: { id, actionId: entry.action.id, label: entry.action.label, status: 'executada', input: block.input },
      result: { ...base, content: JSON.stringify(output) },
    };
  } catch (err) {
    const id = recordRun({ ...common, status: 'erro', result: { erro: err.message } });
    return {
      run: { id, actionId: entry.action.id, label: entry.action.label, status: 'erro', input: block.input, error: err.message },
      result: { ...base, is_error: true, content: err.message },
    };
  }
}

// ---------- Loop principal ----------

async function callModel(params) {
  try {
    return await getClient().beta.messages.create(params);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AgentError('A chave da API do Claude configurada na plataforma foi recusada. Verifique ANTHROPIC_API_KEY.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AgentError('O limite de uso da API do Claude foi atingido. Tente de novo em alguns instantes.');
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AgentError('Não foi possível falar com a API do Claude. Verifique a conexão do servidor.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new AgentError(`A API do Claude retornou um erro (${err.status}): ${err.message}`);
    }
    // Sem credencial nenhuma, o SDK falha antes de enviar a requisição.
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AgentError('A plataforma ainda não tem uma chave da API do Claude. Defina ANTHROPIC_API_KEY no servidor.');
    }
    throw err;
  }
}

const textOf = (content) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

async function runAgentUnlocked({ orgId, agentId, conversationId, text }) {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND org_id = ?').get(agentId, orgId);
  if (!agent) throw new AgentError('Agente não encontrado.');
  const org = db.prepare('SELECT name FROM organizations WHERE id = ?').get(orgId);
  const conv = db.prepare('SELECT channel FROM conversations WHERE id = ?').get(conversationId);

  const tools = enabledTools(agent);
  const toolsByName = Object.fromEntries(tools.map((t) => [t.action.id, t]));
  const toolDefs = tools.map(({ action, mode }) => ({
    name: action.id,
    description: action.description + (mode === 'approval' ? ' Esta ação passa por aprovação humana antes de ser executada.' : ''),
    input_schema: action.input_schema,
  }));

  const messages = loadHistory(conversationId);
  const userMsg = { role: 'user', content: text };
  messages.push(userMsg);
  append(conversationId, 'user', text);
  const note = pendingDecisionNote(conversationId);
  if (note) {
    messages.push({ role: 'system', content: note });
    append(conversationId, 'system', note);
  }

  const ctx = { orgId, agentId, conversationId };
  const runs = [];
  let reply = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callModel({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(agent, org.name, conv.channel),
      tools: toolDefs.length ? toolDefs : undefined,
      messages,
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    // O conteúdo volta para o histórico exatamente como veio (inclui blocos de raciocínio).
    messages.push({ role: 'assistant', content: response.content });
    append(conversationId, 'assistant', response.content);

    if (response.stop_reason === 'refusal') {
      reply = textOf(response.content) || 'Não posso ajudar com esse pedido.';
      break;
    }
    if (response.stop_reason === 'pause_turn') continue;

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) {
      reply = textOf(response.content);
      break;
    }
    if (response.stop_reason === 'max_tokens') {
      reply = 'A resposta ficou longa demais e foi interrompida antes de executar a ação. Tente pedir de forma mais curta.';
      break;
    }

    const results = [];
    for (const block of toolUses) {
      const { result, run } = await runTool(ctx, block, toolsByName);
      results.push(result);
      if (run) runs.push(run);
    }
    // Todos os resultados vão juntos em uma única mensagem do usuário.
    const toolMsg = { role: 'user', content: results };
    messages.push(toolMsg);
    append(conversationId, 'user', results);

    if (round === MAX_TOOL_ROUNDS - 1) reply = 'Precisei de etapas demais para concluir. Pode detalhar melhor o pedido?';
  }

  return { reply: reply || 'Pronto.', actions: runs };
}

// Uma conversa processa uma mensagem por vez, para o histórico não se misturar.
const locks = new Map();

// Se o turno falhar, desfaz o que foi gravado nele para o histórico não ficar com um turno pela metade.
async function runAgentSafely(args) {
  const { last } = db.prepare('SELECT COALESCE(MAX(id), 0) AS last FROM messages WHERE conversation_id = ?').get(args.conversationId);
  try {
    return await runAgentUnlocked(args);
  } catch (err) {
    db.prepare('DELETE FROM messages WHERE conversation_id = ? AND id > ?').run(args.conversationId, last);
    throw err;
  }
}

export function runAgent(args) {
  const prev = locks.get(args.conversationId) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => runAgentSafely(args));
  locks.set(args.conversationId, next);
  next
    .finally(() => {
      if (locks.get(args.conversationId) === next) locks.delete(args.conversationId);
    })
    .catch(() => {}); // o erro é tratado por quem chamou runAgent
  return next;
}

// ---------- Conversas ----------

export function findOrCreateConversation({ orgId, agentId, channel, externalId = null, contact = '' }) {
  if (externalId) {
    const existing = db
      .prepare('SELECT id, agent_id FROM conversations WHERE org_id = ? AND channel = ? AND external_id = ? ORDER BY id DESC LIMIT 1')
      .get(orgId, channel, externalId);
    if (existing && existing.agent_id === agentId) return existing.id;
  }
  const r = db
    .prepare('INSERT INTO conversations (org_id, agent_id, channel, external_id, contact_label) VALUES (?, ?, ?, ?, ?)')
    .run(orgId, agentId, channel, externalId, contact);
  return Number(r.lastInsertRowid);
}

// Mensagem que chegou por um canal (Telegram, WhatsApp): roteia para o agente e responde no mesmo canal.
export async function handleInbound(integration, provider, { externalId, contact, text }) {
  const route = db.prepare('SELECT agent_id FROM channel_routes WHERE org_id = ? AND provider = ?').get(integration.org_id, provider);
  if (!route) return; // nenhum agente atende este canal ainda
  const conversationId = findOrCreateConversation({ orgId: integration.org_id, agentId: route.agent_id, channel: provider, externalId, contact });
  const creds = await credentialsFor(integration.org_id, provider);
  let reply;
  try {
    ({ reply } = await runAgent({ orgId: integration.org_id, agentId: route.agent_id, conversationId, text }));
  } catch (err) {
    console.error(`[${provider}] falha ao responder:`, err.message);
    reply = 'Não consegui responder agora. Uma pessoa da equipe vai retornar em breve.';
  }
  await connectors[provider].reply(creds, externalId, reply);
}

// ---------- Aprovações ----------

export async function decideRun({ orgId, runId, userId, approve }) {
  const run = db.prepare(`SELECT * FROM action_runs WHERE id = ? AND org_id = ?`).get(runId, orgId);
  if (!run) throw new AgentError('Pedido não encontrado.');
  if (run.status !== 'pendente') throw new AgentError('Este pedido já foi decidido.');

  let status = 'recusada';
  let result = null;
  if (approve) {
    try {
      result = await executeAction(orgId, run.action_id, JSON.parse(run.input_json));
      status = 'executada';
    } catch (err) {
      status = 'erro';
      result = { erro: err.message };
    }
  }
  db.prepare(
    `UPDATE action_runs SET status = ?, result_json = ?, decided_by = ?, decided_at = datetime('now'), notified = 0 WHERE id = ?`,
  ).run(status, result == null ? null : JSON.stringify(result), userId, runId);

  // Em canais externos, avisa o contato sobre a decisão.
  const conv = run.conversation_id && db.prepare('SELECT channel, external_id FROM conversations WHERE id = ?').get(run.conversation_id);
  if (conv?.external_id && connectors[conv.channel]?.reply) {
    const label = ACTION_BY_ID[run.action_id]?.label?.toLowerCase() || 'ação';
    const msg =
      status === 'executada'
        ? `Atualização: seu pedido (${label}) foi aprovado e concluído.`
        : status === 'recusada'
          ? `Atualização: a equipe não aprovou o pedido (${label}). Se precisar, fale com a gente por aqui.`
          : `Atualização: o pedido (${label}) foi aprovado, mas houve uma falha ao executar. A equipe vai verificar.`;
    credentialsFor(orgId, conv.channel)
      .then((creds) => connectors[conv.channel].reply(creds, conv.external_id, msg))
      .catch((err) => console.error('falha ao avisar o contato:', err.message));
  }
  return { status, result };
}

// Execução dos agentes: loop de uso de ferramentas com o Claude, contexto da empresa,
// permissões por ação, fila de aprovação humana, medição de uso e registro de tudo.
import Anthropic from '@anthropic-ai/sdk';
import { db, json } from '../db.js';
import { ACTIONS, ACTION_BY_ID, connectionFor } from '../../shared/catalog.js';
import { executeAction, validateInput, credentialsFor, connectors, featuresFor } from '../connectors/index.js';
import { partnerById } from '../brand.js';
import { knowledgeFor } from '../knowledge.js';
import { assertCanRunAgent, recordUsage } from '../usage.js';
import { enqueue } from '../jobs.js';
import { MEMORY_TOOLS, runMemoryTool, memoriesFor, memoryPromptBlock, contactKeyFor } from './memory.js';

const MODEL = process.env.AGENT_MODEL || 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;
const HISTORY_LIMIT = 60;
const TZ = process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo';

export class AgentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

let client = null;
// Chaves de usuário (sk-ant-usr) não são presas a um workspace: aí o ID do workspace
// vai no cabeçalho anthropic-workspace-id (variável ANTHROPIC_WORKSPACE_ID).
const getClient = () =>
  (client ||= new Anthropic(
    process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {},
  ));

// ---------- Ferramentas do agente ----------

export async function agentToolModes(agentId) {
  const rows = await db.all('SELECT action_id, mode FROM agent_tools WHERE agent_id = $1', [agentId]);
  return Object.fromEntries(rows.map((r) => [r.action_id, r.mode]));
}

async function enabledTools(agent, partner) {
  const [modes, conns] = await Promise.all([
    agentToolModes(agent.id),
    db.all('SELECT provider FROM integrations WHERE org_id = $1', [agent.org_id]),
  ]);
  const connected = new Set(conns.map((r) => r.provider));
  const features = featuresFor(partner);
  // Ordem fixa do catálogo: mantém o prefixo estável para o cache de prompt.
  return ACTIONS.filter((a) => modes[a.id] && connected.has(connectionFor(a.provider)) && (!a.requires || features[a.requires])).map((a) => ({
    action: a,
    mode: modes[a.id],
  }));
}

const CHANNEL_NOTES = {
  teste: 'Conversa de teste dentro da plataforma, com alguém da equipe da empresa.',
  telegram: 'Conversa pelo Telegram. Prefira mensagens curtas, como numa conversa de celular.',
  whatsapp: 'Conversa pelo WhatsApp. Prefira mensagens curtas, como numa conversa de celular.',
};

// Instruções em duas partes. A fixa vai no "system" e não muda entre as mensagens (o raciocínio guardado
// do modelo só vale com o mesmo "system"). A que muda (memória, canal e data) entra como mensagem de sistema
// no meio da conversa, só quando muda, e fica gravada no histórico para ele ser sempre o mesmo ao reenviar.
function systemPrompt({ agent, orgName, channel, knowledge, memories }) {
  const today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: TZ }).format(new Date());
  const stable = `Você é ${agent.name}, agente de IA da empresa ${orgName}, atuando na área de ${agent.area}.

Sua função, nas palavras da equipe: ${agent.role_description || 'ainda não descrita. Ajude dentro da sua área.'}

Responda sempre em português do Brasil, de forma direta e cordial.
${
  knowledge
    ? `
A equipe ensinou o contexto da empresa e os processos abaixo. Siga os processos à risca e respeite as regras obrigatórias. Quando a resposta vier de um documento ou processo, mencione o título entre colchetes no fim da frase, por exemplo [Política de reembolso]. Se o que foi ensinado não cobre o pedido, diga isso em vez de supor.

${knowledge}
`
    : ''
}
Você pode agir nas plataformas da empresa pelas ferramentas disponíveis. Algumas ações passam por aprovação de uma pessoa da equipe antes de serem executadas. Quando uma ferramenta disser que a ação está aguardando aprovação, avise que o pedido foi registrado e será confirmado pela equipe; não diga que a ação já foi feita. Só afirme que algo foi feito quando a ferramenta confirmar.

Antes de enviar algo em nome da empresa (e-mails, mensagens, convites), confirme com a pessoa os dados que faltarem em vez de supor destinatários, horários ou conteúdo. Se nenhuma ferramenta disponível resolve o pedido, diga isso com clareza.

Memória: você tem uma memória que continua entre as conversas, e ninguém da equipe vai preenchê-la por você. Aprender sozinho é parte do seu trabalho: a cada conversa, guarde com a ferramenta lembrar, sem anunciar e sem pedir permissão, tudo o que for útil depois, por exemplo:
- sobre a pessoa desta conversa (sobre=contato): nome, cargo, área, como prefere ser chamada, como gosta de receber as coisas, horários, pedidos recorrentes;
- sobre a empresa (sobre=geral): o que ela faz, produtos e serviços, clientes e fornecedores citados, quem é responsável por quê, regras, prazos, valores e combinados, ferramentas que usa, jeito de trabalhar.
Guarde fatos concretos, uma frase por memória, e não repita o que já está na memória. Se algo mudou, apague o antigo com esquecer e guarde o novo. Não guarde senhas, números de cartão, documentos pessoais nem dados de saúde.

Contatos: sempre que aparecer o nome de uma pessoa junto com o e-mail ou telefone dela (numa mensagem, num convite ou no resultado de uma ferramenta), guarde na memória geral no formato "Contato: Nome Sobrenome, e-mail fulano@empresa.com, telefone (se houver), papel ou empresa (se souber)". Se o contato já estiver na memória com dados diferentes, apague o antigo com esquecer e guarde o novo. Quando pedirem para mandar algo, convidar ou marcar reunião com alguém pelo nome, procure o e-mail na sua memória antes de perguntar. Se houver mais de uma pessoa com o mesmo nome, pergunte qual.

Formato das respostas:
- Escreva como numa conversa, em parágrafos curtos.
- Para destacar, use **negrito**, *itálico* ou __sublinhado__, com moderação (só no que realmente importa).
- Para listas, comece cada item com "- ". Não use títulos (#), tabelas, blocos de código nem linhas divisórias.
- Use emojis com naturalidade para deixar a conversa mais simpática (no máximo um ou dois por mensagem, como 😊, 👍, 📅, ✅). Evite emojis em assuntos delicados, como reclamações, cobranças ou problemas graves.`;

  const dynamic = `${memoryPromptBlock(memories)}

Canal: ${CHANNEL_NOTES[channel] || channel}
Hoje é ${today}. Fuso horário: ${TZ}.`;

  return { stable, dynamic };
}

// ---------- Histórico ----------

async function loadHistory(conversationId) {
  const rows = await db.all('SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY id', [conversationId]);
  let start = Math.max(0, rows.length - HISTORY_LIMIT);
  // O recorte precisa começar numa mensagem do usuário com texto (não num tool_result).
  while (start < rows.length) {
    const r = rows[start];
    const isToolResult = Array.isArray(r.content) && r.content.some((b) => b.type === 'tool_result');
    if (r.role === 'user' && !isToolResult) break;
    start++;
  }
  // Mensagens seguidas do mesmo papel (ex.: resposta humana após resposta do agente) são unidas.
  const out = [];
  for (const r of rows.slice(start)) {
    const prev = out[out.length - 1];
    if (prev && prev.role === 'system' && r.role === 'system') {
      // Avisos de sistema seguidos viram um só, como foram enviados.
      prev.content = `${prev.content}\n\n${r.content}`;
    } else if (prev && prev.role === r.role) {
      const toBlocks = (c) => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
      prev.content = [...toBlocks(prev.content), ...toBlocks(r.content)];
    } else out.push({ role: r.role, content: r.content });
  }
  return out;
}

export async function appendMessage(conversationId, role, content, author) {
  await db.run('INSERT INTO messages (conversation_id, role, author, content) VALUES ($1, $2, $3, $4)', [conversationId, role, author, json(content)]);
  await db.run('UPDATE conversations SET last_message_at = now() WHERE id = $1', [conversationId]);
}

async function pendingDecisionNote(conversationId) {
  const runs = await db.all(
    `UPDATE action_runs SET notified = true WHERE conversation_id = $1 AND notified = false AND status != 'pendente'
     RETURNING id, action_id, status, result`,
    [conversationId],
  );
  if (!runs.length) return null;
  const lines = runs.map((r) => {
    const label = ACTION_BY_ID[r.action_id]?.label || r.action_id;
    if (r.status === 'executada') return `Pedido #${r.id} (${label}) foi aprovado e executado. Resultado: ${JSON.stringify(r.result)}`;
    if (r.status === 'recusada') return `Pedido #${r.id} (${label}) foi recusado pela equipe e não foi executado.`;
    return `Pedido #${r.id} (${label}) foi aprovado, mas falhou ao executar: ${JSON.stringify(r.result)}`;
  });
  return `Atualização das aprovações desde a última mensagem:\n${lines.join('\n')}`;
}

// ---------- Registro de ações ----------

async function recordRun({ orgId, agentId, conversationId, actionId, input, status, result, notified = true }) {
  const r = await db.get(
    `INSERT INTO action_runs (org_id, agent_id, conversation_id, action_id, input, status, result, notified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [orgId, agentId, conversationId, actionId, json(input), status, result == null ? null : json(result), notified],
  );
  return r.id;
}

async function runTool(ctx, block, toolsByName) {
  const entry = toolsByName[block.name];
  const base = { type: 'tool_result', tool_use_id: block.id };
  if (!entry) return { result: { ...base, is_error: true, content: 'Esta ferramenta não está liberada para este agente.' } };

  const problem = validateInput(entry.action, block.input);
  if (problem) return { result: { ...base, is_error: true, content: `Entrada inválida: ${problem}` } };

  const common = { orgId: ctx.orgId, agentId: ctx.agentId, conversationId: ctx.conversationId, actionId: entry.action.id, input: block.input };

  if (entry.mode === 'approval') {
    const id = await recordRun({ ...common, status: 'pendente', notified: false });
    await enqueue('aviso_aprovacao', { runId: id });
    return {
      run: { id, actionId: entry.action.id, label: entry.action.label, status: 'pendente', input: block.input },
      result: { ...base, content: `Pedido #${id} registrado e aguardando aprovação de uma pessoa da equipe. A ação ainda não foi executada.` },
    };
  }

  try {
    const output = await executeAction(ctx.orgId, entry.action.id, block.input);
    const id = await recordRun({ ...common, status: 'executada', result: output });
    return {
      run: { id, actionId: entry.action.id, label: entry.action.label, status: 'executada', input: block.input },
      result: { ...base, content: JSON.stringify(output) },
    };
  } catch (err) {
    const id = await recordRun({ ...common, status: 'erro', result: { erro: err.message } });
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
      throw new AgentError('A chave da API do Claude configurada na plataforma foi recusada. Verifique ANTHROPIC_API_KEY.', 503);
    }
    if (err instanceof Anthropic.RateLimitError) throw new AgentError('O limite de uso da API do Claude foi atingido. Tente de novo em alguns instantes.', 503);
    if (err instanceof Anthropic.APIConnectionError) throw new AgentError('Não foi possível falar com a API do Claude. Verifique a conexão do servidor.', 503);
    if (err instanceof Anthropic.APIError) throw new AgentError(`A API do Claude retornou um erro (${err.status}): ${err.message}`, 502);
    if (!process.env.ANTHROPIC_API_KEY) throw new AgentError('A plataforma ainda não tem uma chave da API do Claude. Defina ANTHROPIC_API_KEY no servidor.', 503);
    throw err;
  }
}

const textOf = (content) =>
  content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

async function runAgentUnlocked({ orgId, agentId, conversationId, text, author = 'contato' }) {
  const agent = await db.get('SELECT * FROM agents WHERE id = $1 AND org_id = $2', [agentId, orgId]);
  if (!agent) throw new AgentError('Agente não encontrado.', 404);
  await assertCanRunAgent(orgId);
  const org = await db.get('SELECT name, partner_id FROM organizations WHERE id = $1', [orgId]);
  const partner = await partnerById(org.partner_id);
  const conv = await db.get('SELECT channel, external_id, contact_label FROM conversations WHERE id = $1', [conversationId]);
  const contactKey = contactKeyFor(conv);

  const [tools, knowledge, memories] = await Promise.all([enabledTools(agent, partner), knowledgeFor(orgId, agentId), memoriesFor(agentId, contactKey)]);
  const toolsByName = Object.fromEntries(tools.map((t) => [t.action.id, t]));
  // A memória vem primeiro e é sempre igual: mantém o começo da lista estável para o cache.
  const toolDefs = [
    ...MEMORY_TOOLS,
    ...tools.map(({ action, mode }) => ({
      name: action.id,
      description: action.description + (mode === 'approval' ? ' Esta ação passa por aprovação humana antes de ser executada.' : ''),
      input_schema: action.input_schema,
    })),
  ];
  const { stable: system, dynamic: context } = systemPrompt({ agent, orgName: org.name, channel: conv.channel, knowledge, memories });

  const messages = await loadHistory(conversationId);
  messages.push({ role: 'user', content: text });
  await appendMessage(conversationId, 'user', text, author);
  // Avisos do sistema desta vez: resultado de aprovações e o contexto (memória, canal, data) se mudou.
  const notes = [];
  const note = await pendingDecisionNote(conversationId);
  if (note) notes.push(note);
  const lastContext = await db.get(
    `SELECT content FROM messages WHERE conversation_id = $1 AND author = 'contexto' ORDER BY id DESC LIMIT 1`,
    [conversationId],
  );
  if (note) await appendMessage(conversationId, 'system', note, 'sistema');
  if (!lastContext || lastContext.content !== context) {
    notes.push(context);
    await db.run('INSERT INTO messages (conversation_id, role, author, content) VALUES ($1, $2, $3, $4)', [conversationId, 'system', 'contexto', json(context)]);
  }
  // Mesma junção que loadHistory faz ao reler: o histórico reenviado fica idêntico ao enviado agora.
  if (notes.length) messages.push({ role: 'system', content: notes.join('\n\n') });

  const ctx = { orgId, agentId, conversationId, contactKey, contactLabel: conv.contact_label };
  const runs = [];
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let reply = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callModel({
      model: MODEL,
      max_tokens: 16000,
      system,
      tools: toolDefs,
      messages,
      // Se o raciocínio guardado de uma mensagem antiga não valer mais (instruções ou histórico mudaram),
      // a API descarta esse bloco em vez de recusar a conversa.
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      betas: ['server-side-fallback-2026-07-01', 'thinking-binding-controls-2026-08-01'],
      fallbacks: 'default',
    });
    const u = response.usage || {};
    totals.input += u.input_tokens || 0;
    totals.output += u.output_tokens || 0;
    totals.cacheRead += u.cache_read_input_tokens || 0;
    totals.cacheWrite += u.cache_creation_input_tokens || 0;

    // O conteúdo volta para o histórico exatamente como veio (inclui blocos de raciocínio).
    messages.push({ role: 'assistant', content: response.content });
    await appendMessage(conversationId, 'assistant', response.content, 'agente');

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
      if (block.name === 'lembrar' || block.name === 'esquecer') {
        results.push(await runMemoryTool(ctx, block));
        continue;
      }
      const { result, run } = await runTool(ctx, block, toolsByName);
      results.push(result);
      if (run) runs.push(run);
    }
    messages.push({ role: 'user', content: results });
    await appendMessage(conversationId, 'user', results, 'ferramenta');

    if (round === MAX_TOOL_ROUNDS - 1) reply = 'Precisei de etapas demais para concluir. Pode detalhar melhor o pedido?';
  }

  await recordUsage({ orgId, agentId, conversationId, channel: conv.channel, model: MODEL, totals });
  return { reply: reply || 'Pronto.', actions: runs };
}

const locks = new Map();

// Se o turno falhar, desfaz o que foi gravado nele para o histórico não ficar pela metade.
async function runAgentSafely(args) {
  const { last } = await db.get('SELECT COALESCE(MAX(id), 0)::int AS last FROM messages WHERE conversation_id = $1', [args.conversationId]);
  try {
    return await runAgentUnlocked(args);
  } catch (err) {
    await db.run('DELETE FROM messages WHERE conversation_id = $1 AND id > $2', [args.conversationId, last]);
    throw err;
  }
}

// Uma conversa processa uma mensagem por vez, para o histórico não se misturar.
export function runAgent(args) {
  const prev = locks.get(args.conversationId) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => runAgentSafely(args));
  locks.set(args.conversationId, next);
  next
    .finally(() => {
      if (locks.get(args.conversationId) === next) locks.delete(args.conversationId);
    })
    .catch(() => {});
  return next;
}

// ---------- Conversas ----------

export async function findOrCreateConversation({ orgId, agentId, channel, externalId = null, contact = '', forceNew = false }) {
  if (externalId && !forceNew) {
    const existing = await db.get(
      'SELECT id, agent_id FROM conversations WHERE org_id = $1 AND channel = $2 AND external_id = $3 ORDER BY id DESC LIMIT 1',
      [orgId, channel, externalId],
    );
    if (existing && existing.agent_id === agentId) return existing.id;
  }
  const r = await db.get(
    'INSERT INTO conversations (org_id, agent_id, channel, external_id, contact_label) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [orgId, agentId, channel, externalId, contact],
  );
  return r.id;
}

// Mensagem que chegou por um canal (Telegram, WhatsApp). Roda pela fila de tarefas.
export async function handleInbound(integration, provider, { externalId, contact, text }) {
  const route = await db.get('SELECT agent_id FROM channel_routes WHERE org_id = $1 AND provider = $2', [integration.org_id, provider]);
  if (!route) return; // nenhum agente atende este canal ainda
  const conversationId = await findOrCreateConversation({ orgId: integration.org_id, agentId: route.agent_id, channel: provider, externalId, contact });
  const conv = await db.get('SELECT handled_by FROM conversations WHERE id = $1', [conversationId]);

  // Uma pessoa da equipe assumiu: só registra a mensagem, o agente não responde.
  if (conv.handled_by === 'humano') {
    await appendMessage(conversationId, 'user', text, 'contato');
    return;
  }

  const creds = await credentialsFor(integration.org_id, provider);
  let reply;
  try {
    ({ reply } = await runAgent({ orgId: integration.org_id, agentId: route.agent_id, conversationId, text }));
  } catch (err) {
    console.error(`[${provider}] falha ao responder:`, err.message);
    await appendMessage(conversationId, 'user', text, 'contato');
    reply = 'Não consegui responder agora. Uma pessoa da equipe vai retornar em breve.';
  }
  await connectors[provider].reply(creds, externalId, reply);
}

// ---------- Aprovações ----------

export async function decideRun({ orgId, runId, userId, approve }) {
  const run = await db.get(`SELECT * FROM action_runs WHERE id = $1 AND org_id = $2`, [runId, orgId]);
  if (!run) throw new AgentError('Pedido não encontrado.', 404);
  if (run.status !== 'pendente') throw new AgentError('Este pedido já foi decidido.', 409);

  // Marca como decidido antes de executar, para dois cliques simultâneos não executarem duas vezes.
  const claimed = await db.get(
    `UPDATE action_runs SET status = 'executada', decided_by = $2, decided_at = now() WHERE id = $1 AND status = 'pendente' RETURNING id`,
    [runId, userId],
  );
  if (!claimed) throw new AgentError('Este pedido já foi decidido.', 409);

  let status = 'recusada';
  let result = null;
  if (approve) {
    try {
      result = await executeAction(orgId, run.action_id, run.input);
      status = 'executada';
    } catch (err) {
      status = 'erro';
      result = { erro: err.message };
    }
  }
  await db.run(`UPDATE action_runs SET status = $2, result = $3, notified = false WHERE id = $1`, [runId, status, result == null ? null : json(result)]);

  const conv = run.conversation_id && (await db.get('SELECT channel, external_id FROM conversations WHERE id = $1', [run.conversation_id]));
  if (conv?.external_id && connectors[conv.channel]?.reply) {
    const label = ACTION_BY_ID[run.action_id]?.label?.toLowerCase() || 'ação';
    const text =
      status === 'executada'
        ? `Atualização: seu pedido (${label}) foi aprovado e concluído.`
        : status === 'recusada'
          ? `Atualização: a equipe não aprovou o pedido (${label}). Se precisar, fale com a gente por aqui.`
          : `Atualização: o pedido (${label}) foi aprovado, mas houve uma falha ao executar. A equipe vai verificar.`;
    await enqueue('aviso_contato', { orgId, conversationId: run.conversation_id, text });
  }
  return { status, result };
}

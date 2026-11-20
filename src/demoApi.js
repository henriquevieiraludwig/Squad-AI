// Backend simulado para a versão de demonstração (sem servidor).
// Mesmas rotas e mensagens do servidor real, com dados guardados no navegador.
import { ApiError } from './api.js';
import { PROVIDERS, ACTIONS, ACTION_BY_ID, PROVIDER_BY_ID, connectionFor } from '../shared/catalog.js';

const KEY = 'squad-ai-demo-v1';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AREAS = ['Atendimento', 'Vendas', 'Pessoas e RH', 'Operações', 'Financeiro', 'Jurídico', 'Outra'];

let state = null;

function db() {
  if (state) return state;
  try {
    state = JSON.parse(localStorage.getItem(KEY));
  } catch {
    state = null;
  }
  if (!state) state = { seq: 1, orgs: [], users: [], agents: [], sessionUserId: null };
  state.integrations ??= {};
  state.tools ??= {};
  state.routes ??= {};
  state.runs ??= [];
  state.conversations ??= [];
  return state;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Sem armazenamento disponível: os dados valem só enquanto a página estiver aberta.
  }
}

const nextId = () => db().seq++;
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

async function hash(password, salt) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `plain:${salt}:${password}`;
  }
}

function currentUser() {
  const s = db();
  const u = s.users.find((x) => x.id === s.sessionUserId);
  if (!u) return null;
  const org = s.orgs.find((o) => o.id === u.orgId);
  return { id: u.id, name: u.name, email: u.email, role: u.role, orgId: u.orgId, orgName: org?.name ?? '' };
}

function requireUser() {
  const u = currentUser();
  if (!u) throw new ApiError('Sua sessão expirou. Entre novamente.', 401);
  return u;
}

const publicAgent = (a) => ({
  id: a.id,
  name: a.name,
  area: a.area,
  roleDescription: a.roleDescription,
  status: a.status,
  createdAt: a.createdAt,
});

export async function demoApi(path, { method = 'GET', body = {} } = {}) {
  await new Promise((r) => setTimeout(r, 250)); // simula a latência da rede
  const s = db();
  const route = `${method} ${path}`;

  if (route === 'POST /auth/signup') {
    const name = clean(body.name, 120);
    const company = clean(body.company, 120);
    const email = clean(body.email).toLowerCase();
    const password = String(body.password ?? '');
    const fields = {};
    if (!name) fields.name = 'Informe seu nome.';
    if (!company) fields.company = 'Informe o nome da empresa.';
    if (!EMAIL_RE.test(email)) fields.email = 'Use um e-mail válido, como voce@empresa.com.';
    if (password.length < 8) fields.password = 'A senha precisa ter pelo menos 8 caracteres.';
    if (Object.keys(fields).length) throw new ApiError('Revise os campos destacados.', 400, fields);
    if (s.users.some((u) => u.email === email)) {
      throw new ApiError('Já existe uma conta com este e-mail.', 409, {
        email: 'Este e-mail já tem conta. Entre com ele ou use outro.',
      });
    }
    const org = { id: nextId(), name: company };
    const salt = Math.random().toString(36).slice(2);
    const user = { id: nextId(), orgId: org.id, name, email, role: 'admin', salt, hash: await hash(password, salt) };
    s.orgs.push(org);
    s.users.push(user);
    s.sessionUserId = user.id;
    save();
    return { ok: true };
  }

  if (route === 'POST /auth/login') {
    const email = clean(body.email).toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password) throw new ApiError('Informe e-mail e senha para entrar.', 400);
    const user = s.users.find((u) => u.email === email);
    if (!user || (await hash(password, user.salt)) !== user.hash) {
      throw new ApiError('E-mail ou senha incorretos.', 401);
    }
    s.sessionUserId = user.id;
    save();
    return { ok: true };
  }

  if (route === 'POST /auth/logout') {
    s.sessionUserId = null;
    save();
    return { ok: true };
  }

  if (route === 'GET /auth/me') return { user: currentUser() };

  if (route === 'GET /agents') {
    const u = requireUser();
    const agents = s.agents
      .filter((a) => a.orgId === u.orgId)
      .sort((a, b) => b.id - a.id)
      .map(publicAgent);
    return { agents, areas: AREAS };
  }

  if (route === 'POST /agents') {
    const u = requireUser();
    const name = clean(body.name, 80);
    const area = clean(body.area, 40);
    const roleDescription = clean(body.roleDescription, 600);
    const fields = {};
    if (!name) fields.name = 'Dê um nome ao agente.';
    if (!AREAS.includes(area)) fields.area = 'Escolha a área em que o agente vai atuar.';
    if (Object.keys(fields).length) throw new ApiError('Revise os campos destacados.', 400, fields);
    const agent = {
      id: nextId(),
      orgId: u.orgId,
      name,
      area,
      roleDescription,
      status: 'em_treinamento',
      createdAt: now(),
    };
    s.agents.push(agent);
    save();
    return { agent: publicAgent(agent) };
  }

  const extra = await integrationRoutes(s, method, path, body);
  if (extra !== undefined) {
    save();
    return extra;
  }
  throw new ApiError('Rota não encontrada.', 404);
}

// ---------- Integrações, ferramentas, aprovações e conversa (simulados) ----------

const orgKey = (u) => String(u.orgId);
const rand = () => Math.random().toString(36).slice(2, 12);

function orgIntegrations(s, u) {
  return (s.integrations[orgKey(u)] ??= {});
}

function serviceFor(id) {
  return { teams: 'Teams', gchat: 'Google Chat' }[id];
}

function listIntegrations(s, u) {
  const conns = orgIntegrations(s, u);
  const routes = (s.routes[orgKey(u)] ??= {});
  const providers = PROVIDERS.map((p) => {
    const c = conns[connectionFor(p.id)];
    const out = {
      ...p,
      connected: Boolean(c),
      accountLabel: c?.accountLabel || '',
      connectedAt: c?.createdAt || null,
      platformReady: true,
      missingEnv: [],
      actionCount: ACTIONS.filter((a) => a.provider === p.id || (p.via && a.provider === p.via && a.service === serviceFor(p.id))).length,
    };
    if (p.channel && c) {
      out.webhookUrl = `https://app.squadai.exemplo/api/webhooks/${p.id}/${c.webhookKey}`;
      if (p.id === 'whatsapp') out.verifyToken = c.webhookSecret;
      out.routeAgentId = routes[p.id] || null;
    }
    return out;
  });
  const agents = s.agents.filter((a) => a.orgId === u.orgId).map(({ id, name, area }) => ({ id, name, area }));
  return { providers, actions: ACTIONS.map(({ input_schema, ...a }) => a), agents };
}

function runView(s, r) {
  const action = ACTION_BY_ID[r.actionId];
  const agent = s.agents.find((a) => a.id === r.agentId);
  const decider = s.users.find((x) => x.id === r.decidedBy);
  return {
    id: r.id,
    actionId: r.actionId,
    label: action?.label || r.actionId,
    provider: action?.provider,
    risk: action?.risk,
    input: r.input,
    status: r.status,
    result: r.result,
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt,
    agentName: agent?.name,
    decidedBy: decider?.name,
    channel: 'teste',
    contact: r.contact,
  };
}

const LABELS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.label]));

// Simula o agente: escolhe uma ação liberada pelo assunto da mensagem.
function simulateChat(s, u, agent, text) {
  const tools = s.tools[agent.id] || {};
  const conns = orgIntegrations(s, u);
  const can = (ids) => ids.find((id) => tools[id] && conns[connectionFor(ACTION_BY_ID[id].provider)]);
  const t = text.toLowerCase();
  const runs = [];
  const record = (actionId, input) => {
    const mode = tools[actionId];
    const run = {
      id: nextId(),
      orgId: u.orgId,
      agentId: agent.id,
      actionId,
      input,
      status: mode === 'auto' ? 'executada' : 'pendente',
      result: mode === 'auto' ? { simulado: true } : null,
      requestedAt: now(),
      decidedAt: null,
      decidedBy: null,
      contact: u.name,
    };
    s.runs.push(run);
    runs.push({ id: run.id, actionId, label: LABELS[actionId], status: run.status, input });
    return run;
  };

  if (/e-?mail/.test(t)) {
    const id = can(['outlook_send_email', 'gmail_send_email']);
    if (!id) return { reply: 'Ainda não posso enviar e-mails. Conecte o Microsoft 365 ou o Google Workspace e libere a ação Enviar e-mail nas ferramentas deste agente.', actions: [] };
    const to = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || 'financeiro@empresa.com';
    const run = record(id, { to, subject: 'Pedido de reembolso', body: `Olá,\n\nSegue o pedido: ${text}\n\nAtenciosamente,\n${agent.name}` });
    return {
      reply:
        run.status === 'pendente'
          ? `Preparei o e-mail para ${to}. Ele foi para a fila de aprovação (pedido #${run.id}) e será enviado assim que alguém da equipe aprovar.`
          : `Pronto, enviei o e-mail para ${to}.`,
      actions: runs,
    };
  }
  if (/agenda|compromisso|reuni|calend/.test(t)) {
    const id = can(['outlook_list_events', 'gcal_list_events']);
    if (!id) return { reply: 'Ainda não consigo consultar a agenda. Libere a ação Consultar agenda nas ferramentas deste agente.', actions: [] };
    const run = record(id, { start: 'amanhã 00:00', end: 'amanhã 23:59' });
    if (run.status === 'pendente') return { reply: `Pedi aprovação para consultar a agenda (pedido #${run.id}).`, actions: runs };
    return { reply: 'Amanhã você tem 3 compromissos (dados simulados):\n9h, reunião de status com Operações\n11h30, visita técnica na Casa Aurora Centro\n16h, revisão de reembolsos com o Financeiro', actions: runs };
  }
  if (/avis|canal|teams|slack|chat|mensagem/.test(t)) {
    const id = can(['teams_send_message', 'slack_send_message', 'gchat_send_message', 'telegram_send_message', 'whatsapp_send_message']);
    if (!id) return { reply: 'Ainda não posso enviar mensagens em canais. Libere uma ação de mensagem (Teams, Slack, Google Chat) nas ferramentas deste agente.', actions: [] };
    const run = record(id, { channel: 'operacoes', text: 'Atenção: a visita técnica das 14h foi remarcada para quinta-feira, 10h.' });
    return {
      reply: run.status === 'pendente' ? `Preparei o aviso. Ele aguarda aprovação (pedido #${run.id}).` : 'Aviso publicado no canal de operações.',
      actions: runs,
    };
  }
  return {
    reply: `Entendi. Sou ${agent.name} e cuido de ${agent.area.toLowerCase()}. Na demonstração eu reconheço pedidos de e-mail, agenda e avisos em canais. Na versão completa, respondo qualquer pedido seguindo os processos da empresa.`,
    actions: [],
  };
}

async function integrationRoutes(s, method, path, body) {
  let m;
  if (method === 'GET' && path === '/integrations') return listIntegrations(s, requireUser());

  if (method === 'GET' && path === '/summary') {
    const u = requireUser();
    const agentIds = new Set(s.agents.filter((a) => a.orgId === u.orgId).map((a) => a.id));
    const runs = s.runs.filter((r) => r.orgId === u.orgId);
    return {
      agents: agentIds.size,
      integrations: Object.keys(orgIntegrations(s, u)).length,
      pending: runs.filter((r) => r.status === 'pendente').length,
      executedWeek: runs.filter((r) => r.status === 'executada').length,
      toolsEnabled: [...agentIds].reduce((n, id) => n + Object.keys(s.tools[id] || {}).length, 0),
      conversations: s.conversations.filter((c) => c.orgId === u.orgId).length,
    };
  }

  if ((m = path.match(/^\/integrations\/(\w+)\/oauth$/)) && method === 'POST') {
    const u = requireUser();
    const p = PROVIDER_BY_ID[m[1]];
    const domain = (s.users.find((x) => x.id === u.id)?.email.split('@')[1]) || 'empresa.com';
    const label = m[1] === 'slack' ? `Workspace ${u.orgName}` : `${u.email.split('@')[0]}@${domain}`;
    orgIntegrations(s, u)[m[1]] = { accountLabel: label, createdAt: now() };
    return { connected: true, provider: p.id };
  }

  if ((m = path.match(/^\/integrations\/(\w+)$/))) {
    const u = requireUser();
    const id = m[1];
    if (method === 'DELETE') {
      delete orgIntegrations(s, u)[id];
      delete (s.routes[orgKey(u)] ??= {})[id];
      return { ok: true };
    }
    if (method === 'POST') {
      let accountLabel;
      if (id === 'telegram') {
        if (!/^\d+:[\w-]{20,}$/.test(String(body.botToken || '').trim())) {
          throw new ApiError('O token não parece um token de bot. Ele tem o formato 123456789:ABC-DEF...', 400, { botToken: 'Formato inválido.' });
        }
        accountLabel = `@${u.orgName.toLowerCase().replace(/[^a-z0-9]/g, '')}_bot`;
      } else if (id === 'whatsapp') {
        if (!/^\d{5,}$/.test(String(body.phoneNumberId || '').trim())) {
          throw new ApiError('O ID do número de telefone tem só dígitos. Copie do painel da Meta.', 400, { phoneNumberId: 'Use só dígitos.' });
        }
        if (!String(body.accessToken || '').trim()) throw new ApiError('Informe o token de acesso.', 400, { accessToken: 'Campo obrigatório.' });
        accountLabel = `${u.orgName} (+55 11 4000-0000)`;
      } else throw new ApiError('Esta integração não aceita conexão por token.', 404);
      orgIntegrations(s, u)[id] = { accountLabel, createdAt: now(), webhookKey: rand(), webhookSecret: rand() + rand() };
      return { ok: true, accountLabel, warning: null };
    }
  }

  if ((m = path.match(/^\/channels\/(\w+)$/)) && method === 'PUT') {
    const u = requireUser();
    if (!orgIntegrations(s, u)[m[1]]) throw new ApiError('Conecte o canal antes de escolher o agente.', 409);
    const routes = (s.routes[orgKey(u)] ??= {});
    if (body.agentId) routes[m[1]] = Number(body.agentId);
    else delete routes[m[1]];
    return { ok: true, agentId: body.agentId || null };
  }

  if ((m = path.match(/^\/agents\/(\d+)(\/tools|\/chat)?$/))) {
    const u = requireUser();
    const agent = s.agents.find((a) => a.id === Number(m[1]) && a.orgId === u.orgId);
    if (!agent) throw new ApiError('Agente não encontrado.', 404);
    const routes = (s.routes[orgKey(u)] ??= {});
    if (!m[2] && method === 'GET') {
      return {
        agent: publicAgent(agent),
        tools: s.tools[agent.id] || {},
        channels: Object.entries(routes).filter(([, v]) => v === agent.id).map(([k]) => k),
      };
    }
    if (m[2] === '/tools' && method === 'PUT') {
      if (!ACTION_BY_ID[body.actionId]) throw new ApiError('Ação desconhecida.', 400);
      const tools = (s.tools[agent.id] ??= {});
      if (body.mode === 'off') delete tools[body.actionId];
      else tools[body.actionId] = body.mode;
      return { ok: true, tools };
    }
    if (m[2] === '/chat' && method === 'POST') {
      const text = clean(body.message, 4000);
      if (!text) throw new ApiError('Escreva uma mensagem.', 400);
      let conversationId = Number(body.conversationId) || null;
      if (!conversationId) {
        conversationId = nextId();
        s.conversations.push({ id: conversationId, orgId: u.orgId, agentId: agent.id });
      }
      await new Promise((r) => setTimeout(r, 700));
      return { conversationId, ...simulateChat(s, u, agent, text) };
    }
  }

  if (path.startsWith('/approvals')) {
    const u = requireUser();
    if (method === 'GET') {
      const status = new URLSearchParams(path.split('?')[1] || '').get('status') || 'pendente';
      const runs = s.runs
        .filter((r) => r.orgId === u.orgId && (status === 'todas' || r.status === status))
        .sort((a, b) => b.id - a.id)
        .map((r) => runView(s, r));
      return { runs };
    }
    if ((m = path.match(/^\/approvals\/(\d+)$/)) && method === 'POST') {
      const run = s.runs.find((r) => r.id === Number(m[1]) && r.orgId === u.orgId);
      if (!run) throw new ApiError('Pedido não encontrado.', 404);
      if (run.status !== 'pendente') throw new ApiError('Este pedido já foi decidido.', 400);
      run.status = body.approve ? 'executada' : 'recusada';
      run.result = body.approve ? { simulado: true } : null;
      run.decidedAt = now();
      run.decidedBy = u.id;
      return { status: run.status, result: run.result };
    }
  }
  return undefined;
}

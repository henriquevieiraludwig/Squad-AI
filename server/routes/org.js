// Rotas da empresa cliente: agentes, equipe, contexto, processos, conversas, aprovações e uso.
import { db, json } from '../db.js';
import { requireOrg, rateLimit, ROLES, can } from '../auth.js';
import { ACTION_BY_ID } from '../../shared/catalog.js';
import { runAgent, findOrCreateConversation, decideRun, agentToolModes, appendMessage, AgentError } from '../agent/runtime.js';
import { connectors, credentialsFor, ConnectorError } from '../connectors/index.js';
import { extractText, ExtractError, MAX_DOC_CHARS } from '../knowledge.js';
import { usageSummary, assertCanAddAgent, assertCanAddMember, assertKnowledgeRoom, LimitError } from '../usage.js';
import { createToken, sendTemplate } from './auth.js';

import { AREAS } from '../../shared/areas.js';
import { accessUrlFor } from '../orgs.js';
import { saveMemory, deleteMemory, MEMORY_MAX_CHARS } from '../agent/memory.js';
import { buildUserContent, AttachmentError } from '../agent/attachments.js';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const DAY = 86_400_000;

export function sendError(res, err) {
  if (err instanceof ConnectorError || err instanceof AgentError || err instanceof ExtractError || err instanceof LimitError) {
    return res.status(err.status && err.status >= 400 ? err.status : 400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Algo deu errado no servidor. Tente de novo em instantes.' });
}

// Envolve rotas assíncronas para que erros cheguem ao tratador.
export const h = (fn) => (req, res) => fn(req, res).catch((err) => sendError(res, err));

const AVATAR_IDS = Array.from({ length: 8 }, (_, i) => `avatar-${i + 1}`);

const agentView = (a) => ({
  id: a.id,
  name: a.name,
  area: a.area,
  roleDescription: a.role_description,
  status: a.status,
  avatar: a.avatar || null,
  createdAt: a.created_at,
});

async function orgAgent(req, res) {
  const agent = await db.get('SELECT * FROM agents WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
  if (!agent) res.status(404).json({ error: 'Agente não encontrado.' });
  return agent;
}

function validateAgent(body, { partial = false } = {}) {
  const out = {};
  const fields = {};
  if (!partial || 'name' in body) {
    out.name = clean(body.name, 80);
    if (!out.name) fields.name = 'Dê um nome ao agente.';
  }
  if (!partial || 'area' in body) {
    out.area = clean(body.area, 40);
    if (!AREAS.includes(out.area)) fields.area = 'Escolha a área em que o agente vai atuar.';
  }
  if (!partial || 'roleDescription' in body) out.roleDescription = clean(body.roleDescription, 600);
  if ('avatar' in body) {
    if (body.avatar && !AVATAR_IDS.includes(body.avatar)) fields.avatar = 'Escolha um dos avatares da lista.';
    else out.avatar = body.avatar || null;
  }
  if ('status' in body) {
    if (!['em_treinamento', 'publicado'].includes(body.status)) fields.status = 'Status inválido.';
    else out.status = body.status;
  }
  return { out, fields };
}

export function registerOrgRoutes(app) {
  // ---------- Agentes ----------

  app.get('/api/agents', requireOrg(), h(async (req, res) => {
    const rows = await db.all('SELECT * FROM agents WHERE org_id = $1 ORDER BY created_at DESC, id DESC', [req.user.orgId]);
    res.json({ agents: rows.map(agentView), areas: AREAS });
  }));

  app.post('/api/agents', requireOrg('configurar'), h(async (req, res) => {
    const { out, fields } = validateAgent(req.body);
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    // Ferramentas escolhidas na criação: só as que vierem marcadas ficam liberadas.
    const tools = (Array.isArray(req.body.tools) ? req.body.tools : []).filter(
      (t) => t && ACTION_BY_ID[t.actionId] && ['auto', 'approval'].includes(t.mode),
    );
    await assertCanAddAgent(req.user.orgId);
    const a = await db.get(
      'INSERT INTO agents (org_id, name, area, role_description, avatar, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.orgId, out.name, out.area, out.roleDescription, out.avatar || AVATAR_IDS[0], req.user.id],
    );
    for (const t of tools) {
      await db.run('INSERT INTO agent_tools (agent_id, action_id, mode) VALUES ($1, $2, $3) ON CONFLICT (agent_id, action_id) DO NOTHING', [a.id, t.actionId, t.mode]);
    }
    res.status(201).json({ agent: agentView(a), tools: Object.fromEntries(tools.map((t) => [t.actionId, t.mode])) });
  }));

  app.get('/api/agents/:id', requireOrg(), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const channels = await db.all('SELECT provider FROM channel_routes WHERE org_id = $1 AND agent_id = $2', [req.user.orgId, agent.id]);
    const processes = await db.all('SELECT id, title FROM processes WHERE org_id = $1 AND active AND (agent_id IS NULL OR agent_id = $2) ORDER BY id', [req.user.orgId, agent.id]);
    res.json({ agent: agentView(agent), tools: await agentToolModes(agent.id), channels: channels.map((c) => c.provider), processes, areas: AREAS });
  }));

  app.put('/api/agents/:id', requireOrg('configurar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const { out, fields } = validateAgent(req.body, { partial: true });
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    const a = await db.get(
      `UPDATE agents SET name = COALESCE($2, name), area = COALESCE($3, area), role_description = COALESCE($4, role_description), status = COALESCE($5, status), avatar = COALESCE($6, avatar)
        WHERE id = $1 RETURNING *`,
      [agent.id, out.name ?? null, out.area ?? null, out.roleDescription ?? null, out.status ?? null, out.avatar ?? null],
    );
    res.json({ agent: agentView(a) });
  }));

  app.delete('/api/agents/:id', requireOrg('configurar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    await db.run('DELETE FROM agents WHERE id = $1', [agent.id]);
    res.json({ ok: true });
  }));

  // ---------- Memória do agente ----------

  app.get('/api/agents/:id/memories', requireOrg(), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const rows = await db.all(
      `SELECT m.id, m.content, m.contact_key, m.contact_label, m.source, m.created_at, u.name AS created_by_name
         FROM agent_memories m LEFT JOIN users u ON u.id = m.created_by
        WHERE m.agent_id = $1 AND m.org_id = $2 ORDER BY m.id DESC LIMIT 300`,
      [agent.id, req.user.orgId],
    );
    res.json({
      memories: rows.map((m) => ({
        id: m.id,
        content: m.content,
        scope: m.contact_key ? 'contato' : 'geral',
        contact: m.contact_label || null,
        source: m.source,
        createdBy: m.created_by_name || null,
        createdAt: m.created_at,
      })),
      maxChars: MEMORY_MAX_CHARS,
    });
  }));

  app.post('/api/agents/:id/memories', requireOrg('configurar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const content = clean(req.body?.content, MEMORY_MAX_CHARS);
    if (!content) return res.status(400).json({ error: 'Escreva o que o agente deve lembrar.', fields: { content: 'Escreva o que o agente deve lembrar.' } });
    const id = await saveMemory({ orgId: req.user.orgId, agentId: agent.id, content, source: 'equipe', userId: req.user.id });
    res.status(201).json({ id });
  }));

  app.delete('/api/agents/:id/memories/:memoryId', requireOrg('configurar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const ok = await deleteMemory({ orgId: req.user.orgId, agentId: agent.id, id: req.params.memoryId });
    if (!ok) return res.status(404).json({ error: 'Memória não encontrada.' });
    res.json({ ok: true });
  }));

  app.put('/api/agents/:id/tools', requireOrg('configurar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const { actionId, mode } = req.body || {};
    if (!ACTION_BY_ID[actionId]) return res.status(400).json({ error: 'Ação desconhecida.' });
    if (!['off', 'auto', 'approval'].includes(mode)) return res.status(400).json({ error: 'Modo inválido.' });
    if (mode === 'off') await db.run('DELETE FROM agent_tools WHERE agent_id = $1 AND action_id = $2', [agent.id, actionId]);
    else
      await db.run(
        `INSERT INTO agent_tools (agent_id, action_id, mode) VALUES ($1, $2, $3) ON CONFLICT (agent_id, action_id) DO UPDATE SET mode = EXCLUDED.mode`,
        [agent.id, actionId, mode],
      );
    res.json({ ok: true, tools: await agentToolModes(agent.id) });
  }));

  app.post('/api/agents/:id/chat', requireOrg('conversar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    if (!rateLimit({ key: `chat:${req.user.id}`, max: 20, windowMs: 60_000 })) return res.status(429).json({ error: 'Muitas mensagens em pouco tempo. Aguarde um minuto.' });
    const message = clean(req.body?.message, 4000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (!message && !attachments.length) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    let content = null;
    try {
      content = attachments.length ? await buildUserContent(message, attachments) : null;
    } catch (err) {
      if (err instanceof AttachmentError) return res.status(400).json({ error: err.message });
      throw err;
    }
    let conversationId = Number(req.body?.conversationId) || null;
    if (conversationId) {
      const conv = await db.get('SELECT id, external_id FROM conversations WHERE id = $1 AND org_id = $2 AND agent_id = $3 AND channel = $4', [conversationId, req.user.orgId, agent.id, 'teste']);
      const mine = `user:${req.user.id}`;
      if (!conv || (conv.external_id && conv.external_id !== mine)) conversationId = null;
      // Conversas antigas, de antes de cada pessoa ter as suas, passam a ser de quem as continua.
      else if (!conv.external_id) await db.run('UPDATE conversations SET external_id = $2 WHERE id = $1', [conv.id, mine]);
    }
    if (!conversationId) {
      // A conversa de teste é de cada pessoa com cada agente: continua de onde parou, salvo em "Nova conversa".
      conversationId = await findOrCreateConversation({
        orgId: req.user.orgId,
        agentId: agent.id,
        channel: 'teste',
        externalId: `user:${req.user.id}`,
        contact: req.user.name,
        forceNew: Boolean(req.body?.newConversation),
      });
    }
    const { reply, actions } = await runAgent({ orgId: req.user.orgId, agentId: agent.id, conversationId, text: message, content, author: 'contato' });
    res.json({ conversationId, reply, actions });
  }));

  // Última conversa de teste desta pessoa com o agente, para reabrir onde parou.
  app.get('/api/agents/:id/chat', requireOrg('conversar'), h(async (req, res) => {
    const agent = await orgAgent(req, res);
    if (!agent) return;
    const conv = await db.get(
      `SELECT id FROM conversations WHERE org_id = $1 AND agent_id = $2 AND channel = 'teste' AND external_id = $3 ORDER BY id DESC LIMIT 1`,
      [req.user.orgId, agent.id, `user:${req.user.id}`],
    );
    if (!conv) return res.json({ conversationId: null, messages: [] });
    const rows = await db.all('SELECT id, author, content FROM messages WHERE conversation_id = $1 ORDER BY id', [conv.id]);
    const runs = await db.all('SELECT id, action_id, status, input FROM action_runs WHERE conversation_id = $1 ORDER BY id', [conv.id]);
    const messages = [];
    for (const m of rows) {
      if (!['contato', 'agente', 'humano'].includes(m.author)) continue;
      const text = previewOf(m.content, Infinity);
      if (!text) continue;
      messages.push({ id: m.id, role: m.author === 'contato' ? 'user' : 'agent', text });
    }
    res.json({
      conversationId: conv.id,
      messages,
      actions: runs.map((r) => ({ id: r.id, actionId: r.action_id, label: ACTION_BY_ID[r.action_id]?.label || r.action_id, status: r.status, input: r.input })),
    });
  }));

  // ---------- Equipe ----------

  app.get('/api/team', requireOrg(), h(async (req, res) => {
    const members = await db.all('SELECT id, name, email, role, email_verified_at, created_at FROM users WHERE org_id = $1 ORDER BY created_at', [req.user.orgId]);
    const invites = await db.all(
      `SELECT id, email, role, created_at, expires_at FROM tokens WHERE org_id = $1 AND kind = 'convite' AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC`,
      [req.user.orgId],
    );
    res.json({
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role, roleLabel: ROLES[m.role], verified: Boolean(m.email_verified_at), createdAt: m.created_at })),
      invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, roleLabel: ROLES[i.role], createdAt: i.created_at, expiresAt: i.expires_at })),
      roles: ROLES,
    });
  }));

  app.post('/api/team/invites', requireOrg('equipe'), h(async (req, res) => {
    const email = clean(req.body.email).toLowerCase();
    const role = req.body.role;
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Use um e-mail válido.', fields: { email: 'E-mail inválido.' } });
    if (!['admin', 'approver', 'member'].includes(role)) return res.status(400).json({ error: 'Escolha o papel da pessoa.', fields: { role: 'Papel inválido.' } });
    if (await db.get('SELECT 1 FROM users WHERE partner_id = $1 AND email = $2', [req.partner.id, email])) {
      return res.status(409).json({ error: 'Este e-mail já tem conta na plataforma.', fields: { email: 'Já tem conta.' } });
    }
    await assertCanAddMember(req.user.orgId);
    // Um convite pendente por e-mail: o novo substitui o anterior.
    await db.run(`DELETE FROM tokens WHERE org_id = $1 AND kind = 'convite' AND email = $2 AND used_at IS NULL`, [req.user.orgId, email]);
    const raw = await createToken({ kind: 'convite', partnerId: req.partner.id, orgId: req.user.orgId, email, role, createdBy: req.user.id, ttlMs: 7 * DAY });
    const accessUrl = req.user.orgSlug ? await accessUrlFor(req.partner, req.user.orgSlug) : null;
    await sendTemplate(req.partner.id, email, 'invite', [raw, { orgName: req.user.orgName, inviterName: req.user.name, roleLabel: ROLES[role], accessUrl }]);
    res.status(201).json({ ok: true });
  }));

  app.delete('/api/team/invites/:id', requireOrg('equipe'), h(async (req, res) => {
    await db.run(`DELETE FROM tokens WHERE id = $1 AND org_id = $2 AND kind = 'convite'`, [Number(req.params.id), req.user.orgId]);
    res.json({ ok: true });
  }));

  app.put('/api/team/members/:id', requireOrg('equipe'), h(async (req, res) => {
    const target = await db.get('SELECT id, role FROM users WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!target) return res.status(404).json({ error: 'Pessoa não encontrada.' });
    const role = req.body.role;
    if (!['owner', 'admin', 'approver', 'member'].includes(role)) return res.status(400).json({ error: 'Papel inválido.' });
    if ((target.role === 'owner' || role === 'owner') && req.user.role !== 'owner') return res.status(403).json({ error: 'Só o proprietário pode transferir ou mudar a propriedade.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode mudar o próprio papel. Peça para outro administrador.' });
    await db.tx(async (t) => {
      // Transferir a propriedade: o proprietário atual vira administrador.
      if (role === 'owner') await t.run(`UPDATE users SET role = 'admin' WHERE org_id = $1 AND role = 'owner'`, [req.user.orgId]);
      await t.run('UPDATE users SET role = $1 WHERE id = $2', [role, target.id]);
    });
    res.json({ ok: true });
  }));

  app.delete('/api/team/members/:id', requireOrg('equipe'), h(async (req, res) => {
    const target = await db.get('SELECT id, role FROM users WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!target) return res.status(404).json({ error: 'Pessoa não encontrada.' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode remover a si mesmo.' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Transfira a propriedade antes de remover o proprietário.' });
    await db.run('DELETE FROM users WHERE id = $1', [target.id]);
    res.json({ ok: true });
  }));

  // ---------- Contexto da empresa ----------

  app.get('/api/knowledge', requireOrg(), h(async (req, res) => {
    const docs = await db.all(
      `SELECT d.id, d.title, d.source, d.file_name, d.chars, d.created_at, u.name AS created_by_name
         FROM knowledge_docs d LEFT JOIN users u ON u.id = d.created_by WHERE d.org_id = $1 ORDER BY d.created_at DESC`,
      [req.user.orgId],
    );
    const { limits, counts } = await usageSummary(req.user.orgId);
    res.json({
      docs: docs.map((d) => ({ id: d.id, title: d.title, source: d.source, fileName: d.file_name, chars: d.chars, createdAt: d.created_at, createdBy: d.created_by_name })),
      budget: { used: counts.knowledgeChars, max: limits.knowledgeChars },
    });
  }));

  app.post('/api/knowledge', requireOrg('configurar'), h(async (req, res) => {
    let title = clean(req.body.title, 160);
    let content;
    let source = 'texto';
    let fileName = null;
    if (req.body.data) {
      fileName = clean(req.body.fileName, 200);
      const buffer = Buffer.from(String(req.body.data), 'base64');
      content = await extractText(fileName, buffer);
      source = 'arquivo';
      if (!title) title = fileName.replace(/\.[^.]+$/, '');
    } else {
      content = String(req.body.text ?? '').trim();
      if (content.length > MAX_DOC_CHARS) return res.status(400).json({ error: `O texto passa de ${MAX_DOC_CHARS.toLocaleString('pt-BR')} caracteres.` });
    }
    if (!title) return res.status(400).json({ error: 'Dê um título ao conteúdo.', fields: { title: 'Informe um título.' } });
    if (!content) return res.status(400).json({ error: 'O conteúdo está vazio.', fields: { text: 'Escreva ou cole o conteúdo.' } });
    await assertKnowledgeRoom(req.user.orgId, content.length);
    const d = await db.get(
      `INSERT INTO knowledge_docs (org_id, title, source, file_name, content, chars, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, title, chars`,
      [req.user.orgId, title, source, fileName, content, content.length, req.user.id],
    );
    res.status(201).json({ doc: d });
  }));

  app.get('/api/knowledge/:id', requireOrg(), h(async (req, res) => {
    const d = await db.get('SELECT id, title, source, file_name, content, chars, created_at FROM knowledge_docs WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!d) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.json({ doc: { id: d.id, title: d.title, source: d.source, fileName: d.file_name, chars: d.chars, createdAt: d.created_at, preview: d.content.slice(0, 6000), truncated: d.content.length > 6000 } });
  }));

  app.delete('/api/knowledge/:id', requireOrg('configurar'), h(async (req, res) => {
    await db.run('DELETE FROM knowledge_docs WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    res.json({ ok: true });
  }));

  // ---------- Processos ----------

  const processView = (p) => ({
    id: p.id,
    title: p.title,
    agentId: p.agent_id,
    agentName: p.agent_name || null,
    trigger: p.trigger,
    steps: p.steps,
    stepAgents: (p.steps || []).map((_, i) => (p.step_agents || [])[i] ?? null),
    rules: p.rules,
    active: p.active,
    updatedAt: p.updated_at,
  });

  async function validateProcess(req) {
    const b = req.body || {};
    const fields = {};
    const title = clean(b.title, 160);
    if (!title) fields.title = 'Dê um nome ao processo.';
    const steps = (Array.isArray(b.steps) ? b.steps : []).map((s) => clean(s, 1000)).filter(Boolean).slice(0, 40);
    if (!steps.length) fields.steps = 'Descreva pelo menos uma etapa.';
    let agentId = b.agentId ? Number(b.agentId) : null;
    if (agentId && !(await db.get('SELECT 1 FROM agents WHERE id = $1 AND org_id = $2', [agentId, req.user.orgId]))) fields.agentId = 'Agente não encontrado.';
    // Agente responsável por cada etapa (opcional). Precisa ser da mesma empresa.
    const rawSteps = (Array.isArray(b.steps) ? b.steps : []).map((x) => clean(x, 1000));
    const rawAgents = Array.isArray(b.stepAgents) ? b.stepAgents : [];
    const orgAgents = new Set((await db.all('SELECT id FROM agents WHERE org_id = $1', [req.user.orgId])).map((r) => r.id));
    const stepAgents = [];
    rawSteps.forEach((text, i) => {
      if (!text) return;
      const id = rawAgents[i] ? Number(rawAgents[i]) : null;
      if (id && !orgAgents.has(id)) fields.steps = 'Uma das etapas está com um agente que não existe.';
      stepAgents.push(id || null);
    });
    return { fields, data: { title, steps, stepAgents: stepAgents.slice(0, 40), agentId, trigger: clean(b.trigger, 400), rules: clean(b.rules, 2000), active: b.active !== false } };
  }

  app.get('/api/processes', requireOrg(), h(async (req, res) => {
    const rows = await db.all(
      `SELECT p.*, a.name AS agent_name FROM processes p LEFT JOIN agents a ON a.id = p.agent_id WHERE p.org_id = $1 ORDER BY p.updated_at DESC`,
      [req.user.orgId],
    );
    res.json({ processes: rows.map(processView) });
  }));

  app.post('/api/processes', requireOrg('configurar'), h(async (req, res) => {
    const { fields, data } = await validateProcess(req);
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    const p = await db.get(
      `INSERT INTO processes (org_id, agent_id, title, trigger, steps, rules, active, created_by, step_agents) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.user.orgId, data.agentId, data.title, data.trigger, json(data.steps), data.rules, data.active, req.user.id, json(data.stepAgents)],
    );
    res.status(201).json({ process: processView(p) });
  }));

  app.put('/api/processes/:id', requireOrg('configurar'), h(async (req, res) => {
    const { fields, data } = await validateProcess(req);
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    const p = await db.get(
      `UPDATE processes SET agent_id = $3, title = $4, trigger = $5, steps = $6, rules = $7, active = $8, step_agents = $9, updated_at = now()
        WHERE id = $1 AND org_id = $2 RETURNING *`,
      [Number(req.params.id), req.user.orgId, data.agentId, data.title, data.trigger, json(data.steps), data.rules, data.active, json(data.stepAgents)],
    );
    if (!p) return res.status(404).json({ error: 'Processo não encontrado.' });
    res.json({ process: processView(p) });
  }));

  app.delete('/api/processes/:id', requireOrg('configurar'), h(async (req, res) => {
    await db.run('DELETE FROM processes WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    res.json({ ok: true });
  }));

  // ---------- Conversas ----------

  app.get('/api/conversations', requireOrg(), h(async (req, res) => {
    const params = [req.user.orgId];
    let where = 'c.org_id = $1';
    if (req.query.channel && req.query.channel !== 'todos') {
      params.push(String(req.query.channel));
      where += ` AND c.channel = $${params.length}`;
    }
    if (req.query.status === 'humano' || req.query.status === 'agente') {
      params.push(req.query.status);
      where += ` AND c.handled_by = $${params.length}`;
    }
    if (req.query.q) {
      params.push(`%${String(req.query.q).slice(0, 100)}%`);
      where += ` AND (c.contact_label ILIKE $${params.length} OR a.name ILIKE $${params.length})`;
    }
    const rows = await db.all(
      `SELECT c.id, c.channel, c.contact_label, c.handled_by, c.last_message_at, a.name AS agent_name, a.avatar AS agent_avatar, u.name AS assigned_name,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.author IN ('contato', 'agente', 'humano') ORDER BY m.id DESC LIMIT 1) AS last_content,
              (SELECT COUNT(*)::int FROM action_runs r WHERE r.conversation_id = c.id AND r.status = 'pendente') AS pending
         FROM conversations c JOIN agents a ON a.id = c.agent_id LEFT JOIN users u ON u.id = c.assigned_user
        WHERE ${where} AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)
        ORDER BY c.last_message_at DESC LIMIT 100`,
      params,
    );
    res.json({
      conversations: rows.map((r) => ({
        id: r.id,
        channel: r.channel,
        contact: r.contact_label,
        handledBy: r.handled_by,
        assignedTo: r.assigned_name,
        agentName: r.agent_name,
        agentAvatar: r.agent_avatar || null,
        lastMessageAt: r.last_message_at,
        preview: previewOf(r.last_content),
        pending: r.pending,
      })),
    });
  }));

  app.get('/api/conversations/:id', requireOrg(), h(async (req, res) => {
    const c = await db.get(
      `SELECT c.*, a.name AS agent_name, a.avatar AS agent_avatar, u.name AS assigned_name FROM conversations c JOIN agents a ON a.id = c.agent_id
         LEFT JOIN users u ON u.id = c.assigned_user WHERE c.id = $1 AND c.org_id = $2`,
      [Number(req.params.id), req.user.orgId],
    );
    if (!c) return res.status(404).json({ error: 'Conversa não encontrada.' });
    const msgs = await db.all('SELECT id, role, author, content, created_at FROM messages WHERE conversation_id = $1 ORDER BY id', [c.id]);
    const runs = await db.all('SELECT id, action_id, status, input, requested_at FROM action_runs WHERE conversation_id = $1 ORDER BY id', [c.id]);
    const timeline = [];
    for (const m of msgs) {
      if (m.author === 'ferramenta') continue;
      if (m.role === 'system') continue;
      const text = previewOf(m.content, Infinity);
      if (text) timeline.push({ id: m.id, author: m.author, text, at: m.created_at });
    }
    res.json({
      conversation: {
        id: c.id,
        channel: c.channel,
        contact: c.contact_label,
        handledBy: c.handled_by,
        assignedTo: c.assigned_name,
        agentName: c.agent_name,
        agentAvatar: c.agent_avatar || null,
        agentId: c.agent_id,
        canReply: c.channel !== 'teste',
        // Conversa de teste da própria pessoa: pode continuar a qualquer momento.
        canContinue: c.channel === 'teste' && (!c.external_id || c.external_id === `user:${req.user.id}`) && can(req.user, 'conversar'),
      },
      messages: timeline,
      actions: runs.map((r) => ({ id: r.id, label: ACTION_BY_ID[r.action_id]?.label || r.action_id, status: r.status, input: r.input, at: r.requested_at })),
    });
  }));

  async function orgConversation(req, res) {
    const c = await db.get('SELECT * FROM conversations WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!c) res.status(404).json({ error: 'Conversa não encontrada.' });
    return c;
  }

  app.post('/api/conversations/:id/takeover', requireOrg('atender'), h(async (req, res) => {
    const c = await orgConversation(req, res);
    if (!c) return;
    if (c.channel === 'teste') return res.status(400).json({ error: 'Conversas de teste não podem ser assumidas.' });
    await db.run(`UPDATE conversations SET handled_by = 'humano', assigned_user = $2 WHERE id = $1`, [c.id, req.user.id]);
    res.json({ ok: true });
  }));

  app.post('/api/conversations/:id/release', requireOrg('atender'), h(async (req, res) => {
    const c = await orgConversation(req, res);
    if (!c) return;
    await db.run(`UPDATE conversations SET handled_by = 'agente', assigned_user = NULL WHERE id = $1`, [c.id]);
    res.json({ ok: true });
  }));

  app.post('/api/conversations/:id/reply', requireOrg('atender'), h(async (req, res) => {
    const c = await orgConversation(req, res);
    if (!c) return;
    const text = clean(req.body.text, 4000);
    if (!text) return res.status(400).json({ error: 'Escreva a mensagem.' });
    if (c.handled_by !== 'humano') return res.status(409).json({ error: 'Assuma a conversa antes de responder.' });
    if (!connectors[c.channel]?.reply || !c.external_id) return res.status(400).json({ error: 'Este canal não aceita resposta manual.' });
    const creds = await credentialsFor(req.user.orgId, c.channel);
    await connectors[c.channel].reply(creds, c.external_id, text);
    await appendMessage(c.id, 'assistant', [{ type: 'text', text }], 'humano');
    res.json({ ok: true });
  }));

  // ---------- Aprovações ----------

  app.get('/api/approvals', requireOrg(), h(async (req, res) => {
    const status = String(req.query.status || 'pendente');
    const params = [req.user.orgId];
    let where = '';
    if (status !== 'todas') {
      params.push(status);
      where = 'AND r.status = $2';
    }
    const rows = await db.all(
      `SELECT r.id, r.action_id, r.input, r.status, r.result, r.requested_at, r.decided_at,
              a.name AS agent_name, u.name AS decided_by_name, c.channel, c.contact_label, c.id AS conversation_id
         FROM action_runs r
         LEFT JOIN agents a ON a.id = r.agent_id
         LEFT JOIN users u ON u.id = r.decided_by
         LEFT JOIN conversations c ON c.id = r.conversation_id
        WHERE r.org_id = $1 ${where}
        ORDER BY r.id DESC LIMIT 100`,
      params,
    );
    res.json({
      canDecide: can(req.user, 'aprovar'),
      runs: rows.map((r) => {
        const action = ACTION_BY_ID[r.action_id];
        return {
          id: r.id,
          actionId: r.action_id,
          label: action?.label || r.action_id,
          provider: action?.provider,
          risk: action?.risk,
          input: r.input,
          status: r.status,
          result: r.result,
          requestedAt: r.requested_at,
          decidedAt: r.decided_at,
          agentName: r.agent_name,
          decidedBy: r.decided_by_name,
          channel: r.channel,
          contact: r.contact_label,
          conversationId: r.conversation_id,
        };
      }),
    });
  }));

  app.post('/api/approvals/:id', requireOrg('aprovar'), h(async (req, res) => {
    res.json(await decideRun({ orgId: req.user.orgId, runId: Number(req.params.id), userId: req.user.id, approve: Boolean(req.body?.approve) }));
  }));

  // ---------- Visão geral e uso ----------

  app.get('/api/summary', requireOrg(), h(async (req, res) => {
    const o = req.user.orgId;
    const row = await db.get(
      `SELECT (SELECT COUNT(*)::int FROM agents WHERE org_id = $1) AS agents,
              (SELECT COUNT(*)::int FROM integrations WHERE org_id = $1) AS integrations,
              (SELECT COUNT(*)::int FROM action_runs WHERE org_id = $1 AND status = 'pendente') AS pending,
              (SELECT COUNT(*)::int FROM action_runs WHERE org_id = $1 AND status = 'executada' AND requested_at >= now() - interval '7 days') AS executed_week,
              (SELECT COUNT(*)::int FROM agent_tools t JOIN agents a ON a.id = t.agent_id WHERE a.org_id = $1) AS tools_enabled,
              (SELECT COUNT(DISTINCT c.id)::int FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.org_id = $1) AS conversations,
              (SELECT COUNT(*)::int FROM knowledge_docs WHERE org_id = $1) AS docs,
              (SELECT COUNT(*)::int FROM processes WHERE org_id = $1) AS processes,
              (SELECT COUNT(*)::int FROM conversations WHERE org_id = $1 AND handled_by = 'humano') AS human_conversations`,
      [o],
    );
    res.json({
      agents: row.agents,
      integrations: row.integrations,
      pending: row.pending,
      executedWeek: row.executed_week,
      toolsEnabled: row.tools_enabled,
      conversations: row.conversations,
      docs: row.docs,
      processes: row.processes,
      humanConversations: row.human_conversations,
    });
  }));

  app.get('/api/usage', requireOrg(), h(async (req, res) => res.json(await usageSummary(req.user.orgId))));

  // LGPD: o proprietário baixa todos os dados da empresa guardados na plataforma.
  app.get('/api/org/export', requireOrg('equipe'), h(async (req, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Só o proprietário pode exportar os dados da empresa.' });
    const o = req.user.orgId;
    const [org, users, agents, docs, processes, conversations, messages, runs, usage, memories] = await Promise.all([
      db.get('SELECT id, name, created_at FROM organizations WHERE id = $1', [o]),
      db.all('SELECT id, name, email, role, created_at FROM users WHERE org_id = $1', [o]),
      db.all('SELECT * FROM agents WHERE org_id = $1', [o]),
      db.all('SELECT id, title, source, file_name, content, created_at FROM knowledge_docs WHERE org_id = $1', [o]),
      db.all('SELECT * FROM processes WHERE org_id = $1', [o]),
      db.all('SELECT id, agent_id, channel, contact_label, handled_by, created_at FROM conversations WHERE org_id = $1', [o]),
      db.all('SELECT m.conversation_id, m.role, m.author, m.content, m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.org_id = $1 ORDER BY m.id', [o]),
      db.all('SELECT id, agent_id, conversation_id, action_id, input, status, result, requested_at, decided_at FROM action_runs WHERE org_id = $1', [o]),
      db.all('SELECT agent_id, channel, model, input_tokens, output_tokens, created_at FROM usage_events WHERE org_id = $1', [o]),
      db.all('SELECT id, agent_id, contact_label, content, source, created_at FROM agent_memories WHERE org_id = $1', [o]),
    ]);
    res.set('Content-Disposition', `attachment; filename="dados-${org.id}.json"`);
    res.json({ exportedAt: new Date().toISOString(), organization: org, users, agents, knowledge: docs, processes, conversations, messages, actions: runs, usage, memories });
  }));
}

// Texto curto de uma mensagem guardada no formato da API.
function previewOf(content, max = 140) {
  if (content == null) return '';
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  text = text.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

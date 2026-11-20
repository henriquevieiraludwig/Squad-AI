// Rotas de integrações, ferramentas dos agentes, aprovações, conversa de teste e webhooks.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { requireAuth } from './auth.js';
import { PROVIDERS, ACTIONS, ACTION_BY_ID, PROVIDER_BY_ID, connectionFor } from '../shared/catalog.js';
import {
  connectors,
  platformReady,
  getIntegration,
  saveIntegration,
  newWebhookIds,
  disconnect,
  ConnectorError,
} from './connectors/index.js';
import { PUBLIC_URL, APP_URL } from './connectors/http.js';
import { decrypt } from './crypto.js';
import { runAgent, findOrCreateConversation, handleInbound, decideRun, agentToolModes, AgentError } from './agent/runtime.js';

const redirectUri = (provider) => `${PUBLIC_URL}/api/oauth/callback/${provider}`;
const OAUTH_STATE_TTL = 10 * 60 * 1000;

function sendError(res, err) {
  if (err instanceof ConnectorError || err instanceof AgentError) {
    return res.status(err.status && err.status < 500 ? err.status : 400).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Algo deu errado no servidor. Tente de novo em instantes.' });
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

function orgAgent(req, res) {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND org_id = ?').get(Number(req.params.id), req.user.orgId);
  if (!agent) res.status(404).json({ error: 'Agente não encontrado.' });
  return agent;
}

export function registerIntegrationRoutes(app) {
  // ---------- Catálogo e status ----------

  app.get('/api/integrations', requireAuth, (req, res) => {
    const rows = db.prepare('SELECT * FROM integrations WHERE org_id = ?').all(req.user.orgId);
    const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));
    const routes = Object.fromEntries(
      db.prepare('SELECT provider, agent_id FROM channel_routes WHERE org_id = ?').all(req.user.orgId).map((r) => [r.provider, r.agent_id]),
    );

    const providers = PROVIDERS.map((p) => {
      const conn = byProvider[connectionFor(p.id)];
      const readiness = p.via ? platformReady(p.via) : platformReady(p.id);
      const out = {
        ...p,
        connected: Boolean(conn),
        accountLabel: conn?.account_label || '',
        connectedAt: conn?.created_at || null,
        platformReady: readiness.ready,
        missingEnv: readiness.missing,
        actionCount: ACTIONS.filter((a) => a.provider === p.id || (p.via && a.provider === p.via && a.service === serviceFor(p.id))).length,
      };
      if (p.channel && conn) {
        out.webhookUrl = `${PUBLIC_URL}/api/webhooks/${p.id}/${conn.webhook_key}`;
        if (p.id === 'whatsapp') out.verifyToken = conn.webhook_secret;
        out.routeAgentId = routes[p.id] || null;
      }
      return out;
    });

    const actions = ACTIONS.map(({ input_schema, ...a }) => a);
    const agents = db.prepare('SELECT id, name, area FROM agents WHERE org_id = ? ORDER BY name').all(req.user.orgId);
    res.json({ providers, actions, agents });
  });

  // ---------- Conexão OAuth (Microsoft 365, Google Workspace, Slack) ----------

  app.post('/api/integrations/:provider/oauth', requireAuth, (req, res) => {
    const { provider } = req.params;
    const oauth = connectors[provider]?.oauth;
    if (!oauth) return res.status(404).json({ error: 'Esta integração não usa login externo.' });
    const { ready, missing } = platformReady(provider);
    if (!ready) {
      return res.status(409).json({
        error: `A plataforma ainda não tem o app de ${PROVIDER_BY_ID[provider].name} cadastrado. Defina ${missing.join(' e ')} no servidor.`,
      });
    }
    const state = randomBytes(24).toString('base64url');
    db.prepare('DELETE FROM oauth_states WHERE created_at < ?').run(Date.now() - OAUTH_STATE_TTL);
    db.prepare('INSERT INTO oauth_states (state, org_id, user_id, provider, created_at) VALUES (?, ?, ?, ?, ?)').run(
      state,
      req.user.orgId,
      req.user.id,
      provider,
      Date.now(),
    );
    res.json({ url: oauth.authorizeUrl(state, redirectUri(provider)) });
  });

  app.get('/api/oauth/callback/:provider', async (req, res) => {
    const { provider } = req.params;
    const back = (params) => res.redirect(`${APP_URL}/app/integracoes?${new URLSearchParams(params)}`);
    const { code, state, error, error_description } = req.query;
    if (error) return back({ erro: `A conexão foi cancelada: ${error_description || error}` });

    const row = db.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').get(String(state || ''), provider);
    db.prepare('DELETE FROM oauth_states WHERE state = ?').run(String(state || ''));
    if (!row || Date.now() - row.created_at > OAUTH_STATE_TTL) {
      return back({ erro: 'O pedido de conexão expirou. Clique em Conectar de novo.' });
    }
    try {
      const oauth = connectors[provider].oauth;
      const creds = await oauth.exchange(String(code), redirectUri(provider));
      const accountLabel = await oauth.accountLabel(creds);
      saveIntegration(row.org_id, provider, { creds, accountLabel, userId: row.user_id });
      back({ conectado: provider });
    } catch (err) {
      console.error(err);
      back({ erro: err.message });
    }
  });

  // ---------- Conexão por token (Telegram, WhatsApp) ----------

  app.post('/api/integrations/:provider', requireAuth, async (req, res) => {
    const { provider } = req.params;
    const tokenImpl = connectors[provider]?.token;
    if (!tokenImpl) return res.status(404).json({ error: 'Esta integração não aceita conexão por token.' });
    const def = PROVIDER_BY_ID[provider];
    const fields = {};
    for (const f of def.fields) {
      const v = String(req.body?.[f.key] ?? '').trim();
      if (!v && !f.optional) return res.status(400).json({ error: `Preencha o campo ${f.label}.`, fields: { [f.key]: 'Campo obrigatório.' } });
      fields[f.key] = v;
    }
    try {
      const ids = newWebhookIds();
      const { creds, accountLabel, warning } = await tokenImpl.connect(fields, { integrationKey: ids.webhookKey, webhookSecret: ids.webhookSecret });
      saveIntegration(req.user.orgId, provider, { creds, accountLabel, userId: req.user.id, ...ids });
      res.status(201).json({ ok: true, accountLabel, warning: warning || null });
    } catch (err) {
      sendError(res, err);
    }
  });

  app.delete('/api/integrations/:provider', requireAuth, async (req, res) => {
    await disconnect(req.user.orgId, req.params.provider);
    res.json({ ok: true });
  });

  // Qual agente atende cada canal de entrada.
  app.put('/api/channels/:provider', requireAuth, (req, res) => {
    const { provider } = req.params;
    if (!PROVIDER_BY_ID[provider]?.channel) return res.status(404).json({ error: 'Este canal não recebe mensagens.' });
    if (!getIntegration(req.user.orgId, provider)) return res.status(409).json({ error: 'Conecte o canal antes de escolher o agente.' });
    const agentId = req.body?.agentId ? Number(req.body.agentId) : null;
    if (!agentId) {
      db.prepare('DELETE FROM channel_routes WHERE org_id = ? AND provider = ?').run(req.user.orgId, provider);
      return res.json({ ok: true, agentId: null });
    }
    const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND org_id = ?').get(agentId, req.user.orgId);
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado.' });
    db.prepare(
      `INSERT INTO channel_routes (org_id, provider, agent_id) VALUES (?, ?, ?)
       ON CONFLICT (org_id, provider) DO UPDATE SET agent_id = excluded.agent_id`,
    ).run(req.user.orgId, provider, agentId);
    res.json({ ok: true, agentId });
  });

  // ---------- Ferramentas de cada agente ----------

  app.get('/api/agents/:id', requireAuth, (req, res) => {
    const agent = orgAgent(req, res);
    if (!agent) return;
    const channels = db.prepare('SELECT provider FROM channel_routes WHERE org_id = ? AND agent_id = ?').all(req.user.orgId, agent.id);
    res.json({
      agent: {
        id: agent.id,
        name: agent.name,
        area: agent.area,
        roleDescription: agent.role_description,
        status: agent.status,
        createdAt: agent.created_at,
      },
      tools: agentToolModes(agent.id),
      channels: channels.map((c) => c.provider),
    });
  });

  app.put('/api/agents/:id/tools', requireAuth, (req, res) => {
    const agent = orgAgent(req, res);
    if (!agent) return;
    const { actionId, mode } = req.body || {};
    if (!ACTION_BY_ID[actionId]) return res.status(400).json({ error: 'Ação desconhecida.' });
    if (!['off', 'auto', 'approval'].includes(mode)) return res.status(400).json({ error: 'Modo inválido.' });
    if (mode === 'off') db.prepare('DELETE FROM agent_tools WHERE agent_id = ? AND action_id = ?').run(agent.id, actionId);
    else
      db.prepare(
        `INSERT INTO agent_tools (agent_id, action_id, mode) VALUES (?, ?, ?)
         ON CONFLICT (agent_id, action_id) DO UPDATE SET mode = excluded.mode`,
      ).run(agent.id, actionId, mode);
    res.json({ ok: true, tools: agentToolModes(agent.id) });
  });

  // ---------- Conversa de teste ----------

  app.post('/api/agents/:id/chat', requireAuth, async (req, res) => {
    const agent = orgAgent(req, res);
    if (!agent) return;
    const message = String(req.body?.message ?? '').trim().slice(0, 4000);
    if (!message) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    let conversationId = Number(req.body?.conversationId) || null;
    if (conversationId) {
      const conv = db.prepare('SELECT id FROM conversations WHERE id = ? AND org_id = ? AND agent_id = ?').get(conversationId, req.user.orgId, agent.id);
      if (!conv) conversationId = null;
    }
    if (!conversationId) {
      conversationId = findOrCreateConversation({ orgId: req.user.orgId, agentId: agent.id, channel: 'teste', contact: req.user.name });
    }
    try {
      const { reply, actions } = await runAgent({ orgId: req.user.orgId, agentId: agent.id, conversationId, text: message });
      res.json({ conversationId, reply, actions });
    } catch (err) {
      sendError(res, err);
    }
  });

  // ---------- Aprovações e histórico de ações ----------

  app.get('/api/approvals', requireAuth, (req, res) => {
    const status = String(req.query.status || 'pendente');
    const where = status === 'todas' ? '' : 'AND r.status = ?';
    const params = status === 'todas' ? [req.user.orgId] : [req.user.orgId, status];
    const rows = db
      .prepare(
        `SELECT r.id, r.action_id, r.input_json, r.status, r.result_json, r.requested_at, r.decided_at,
                a.name AS agent_name, u.name AS decided_by_name, c.channel, c.contact_label
           FROM action_runs r
           LEFT JOIN agents a ON a.id = r.agent_id
           LEFT JOIN users u ON u.id = r.decided_by
           LEFT JOIN conversations c ON c.id = r.conversation_id
          WHERE r.org_id = ? ${where}
          ORDER BY r.id DESC LIMIT 100`,
      )
      .all(...params);
    res.json({
      runs: rows.map((r) => {
        const action = ACTION_BY_ID[r.action_id];
        return {
          id: r.id,
          actionId: r.action_id,
          label: action?.label || r.action_id,
          provider: action?.provider,
          risk: action?.risk,
          input: JSON.parse(r.input_json),
          status: r.status,
          result: r.result_json ? JSON.parse(r.result_json) : null,
          requestedAt: r.requested_at,
          decidedAt: r.decided_at,
          agentName: r.agent_name,
          decidedBy: r.decided_by_name,
          channel: r.channel,
          contact: r.contact_label,
        };
      }),
    });
  });

  app.post('/api/approvals/:id', requireAuth, async (req, res) => {
    try {
      const out = await decideRun({ orgId: req.user.orgId, runId: Number(req.params.id), userId: req.user.id, approve: Boolean(req.body?.approve) });
      res.json(out);
    } catch (err) {
      sendError(res, err);
    }
  });

  // Números da visão geral.
  app.get('/api/summary', requireAuth, (req, res) => {
    const o = req.user.orgId;
    const one = (sql, ...p) => Object.values(db.prepare(sql).get(o, ...p))[0];
    res.json({
      agents: one('SELECT COUNT(*) FROM agents WHERE org_id = ?'),
      integrations: one('SELECT COUNT(*) FROM integrations WHERE org_id = ?'),
      pending: one(`SELECT COUNT(*) FROM action_runs WHERE org_id = ? AND status = 'pendente'`),
      executedWeek: one(`SELECT COUNT(*) FROM action_runs WHERE org_id = ? AND status = 'executada' AND requested_at >= datetime('now', '-7 days')`),
      toolsEnabled: one('SELECT COUNT(*) FROM agent_tools t JOIN agents a ON a.id = t.agent_id WHERE a.org_id = ?'),
      conversations: one('SELECT COUNT(DISTINCT c.id) FROM conversations c JOIN messages m ON m.conversation_id = c.id WHERE c.org_id = ?'),
    });
  });

  // ---------- Webhooks dos canais ----------

  const integrationByKey = (provider, key) => db.prepare('SELECT * FROM integrations WHERE provider = ? AND webhook_key = ?').get(provider, String(key));

  app.post('/api/webhooks/telegram/:key', (req, res) => {
    const integ = integrationByKey('telegram', req.params.key);
    if (!integ || !safeEqual(req.get('X-Telegram-Bot-Api-Secret-Token'), integ.webhook_secret)) return res.sendStatus(404);
    res.sendStatus(200); // responde rápido; o agente trabalha em seguida
    const msg = connectors.telegram.parseInbound(req.body);
    if (msg) handleInbound(integ, 'telegram', msg).catch((err) => console.error('[telegram]', err.message));
  });

  // Verificação do webhook exigida pela Meta.
  app.get('/api/webhooks/whatsapp/:key', (req, res) => {
    const integ = integrationByKey('whatsapp', req.params.key);
    if (integ && req.query['hub.mode'] === 'subscribe' && safeEqual(req.query['hub.verify_token'], integ.webhook_secret)) {
      return res.status(200).send(String(req.query['hub.challenge']));
    }
    res.sendStatus(403);
  });

  app.post('/api/webhooks/whatsapp/:key', (req, res) => {
    const integ = integrationByKey('whatsapp', req.params.key);
    if (!integ) return res.sendStatus(404);
    const creds = decrypt(integ.credentials_enc);
    if (!connectors.whatsapp.verifySignature(creds, req.rawBody || Buffer.alloc(0), req.get('X-Hub-Signature-256'))) return res.sendStatus(401);
    res.sendStatus(200);
    for (const msg of connectors.whatsapp.parseInbound(req.body)) {
      handleInbound(integ, 'whatsapp', msg).catch((err) => console.error('[whatsapp]', err.message));
    }
  });
}

// Serviço do provedor-mãe que um provedor "via" representa (Teams -> Teams do Microsoft 365).
function serviceFor(providerId) {
  return { teams: 'Teams', gchat: 'Google Chat' }[providerId];
}

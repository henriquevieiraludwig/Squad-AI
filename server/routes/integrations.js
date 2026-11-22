// Integrações, canais de entrada e webhooks.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db.js';
import { requireOrg } from '../auth.js';
import { PROVIDERS, availableActions, PROVIDER_BY_ID, connectionFor } from '../../shared/catalog.js';
import { connectors, platformReady, featuresFor, getIntegration, saveIntegration, newWebhookIds, disconnect, updateCredentials } from '../connectors/index.js';
import { PUBLIC_URL } from '../connectors/http.js';
import { oauthConfig, partnerById } from '../brand.js';
import { decrypt } from '../crypto.js';
import { enqueue } from '../jobs.js';
import { h } from './org.js';
import { appendMessage } from '../agent/runtime.js';

const redirectUri = (provider) => `${PUBLIC_URL}/api/oauth/callback/${provider}`;
const OAUTH_STATE_TTL_MIN = 10;
const SERVICE_OF = { teams: 'Teams', gchat: 'Google Chat' };

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
};

const originOf = (req) => `${req.protocol}://${req.get('host')}`;

export function registerIntegrationRoutes(app) {
  app.get('/api/integrations', requireOrg(), h(async (req, res) => {
    const [rows, routeRows, agents] = await Promise.all([
      db.all('SELECT * FROM integrations WHERE org_id = $1', [req.user.orgId]),
      db.all('SELECT provider, agent_id FROM channel_routes WHERE org_id = $1', [req.user.orgId]),
      db.all('SELECT id, name, area FROM agents WHERE org_id = $1 ORDER BY name', [req.user.orgId]),
    ]);
    const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));
    const routes = Object.fromEntries(routeRows.map((r) => [r.provider, r.agent_id]));
    const actions = availableActions(featuresFor(req.partner));

    const providers = await Promise.all(PROVIDERS.map(async (p) => {
      const conn = byProvider[connectionFor(p.id)];
      const readiness = platformReady(p.via || p.id, req.partner);
      const out = {
        ...p,
        connected: Boolean(conn),
        accountLabel: conn?.account_label || '',
        connectedAt: conn?.created_at || null,
        platformReady: readiness.ready,
        missingEnv: readiness.missing,
        actionCount: actions.filter((a) => (p.via ? a.provider === p.via && a.service === SERVICE_OF[p.id] : a.provider === p.id)).length,
      };
      if (p.id === 'google' && featuresFor(req.partner).google_restricted) delete out.note;
      if (p.channel && conn) {
        out.webhookUrl = `${PUBLIC_URL}/api/webhooks/${p.id}/${conn.webhook_key}`;
        if (p.id === 'whatsapp') {
          out.verifyToken = conn.webhook_secret;
          const c = decrypt(conn.credentials_enc);
          out.opening = { wabaId: c.wabaId || '', ...(c.opening || {}) };
          out.failures = await db.all(
            "SELECT recipient, reason, created_at FROM delivery_failures WHERE org_id = $1 AND provider = 'whatsapp' AND created_at > now() - interval '7 days' ORDER BY created_at DESC LIMIT 5",
            [req.user.orgId],
          );
        }
        out.routeAgentId = routes[p.id] || null;
      }
      return out;
    }));
    res.json({ providers, actions: actions.map(({ input_schema, ...a }) => a), agents });
  }));

  // ---------- WhatsApp: modelo de abertura (para falar com quem não escreveu nas últimas 24h) ----------

  app.post('/api/integrations/whatsapp/opening-template', requireOrg('configurar'), h(async (req, res) => {
    const row = await getIntegration(req.user.orgId, 'whatsapp');
    if (!row) return res.status(404).json({ error: 'Conecte o WhatsApp primeiro.' });
    let creds = decrypt(row.credentials_enc);
    const wabaId = String(req.body?.wabaId ?? creds.wabaId ?? '').trim();
    if (!/^\d{5,}$/.test(wabaId)) return res.status(400).json({ error: 'O WABA ID tem só dígitos. Ele aparece no painel do provedor (ex.: Datafy) ou no WhatsApp Manager da Meta.' });
    creds = { ...creds, wabaId };
    const category = req.body?.category === 'MARKETING' ? 'MARKETING' : 'UTILITY';
    creds = req.body?.refresh && creds.opening ? await connectors.whatsapp.refreshOpeningTemplate(creds) : await connectors.whatsapp.createOpeningTemplate(creds, category);
    await updateCredentials(req.user.orgId, 'whatsapp', creds);
    res.json({ opening: { wabaId, ...creds.opening } });
  }));

  // ---------- OAuth (Microsoft 365, Google Workspace, Slack) ----------

  app.post('/api/integrations/:provider/oauth', requireOrg('configurar'), h(async (req, res) => {
    const { provider } = req.params;
    const oauth = connectors[provider]?.oauth;
    if (!oauth) return res.status(404).json({ error: 'Esta integração não usa login externo.' });
    const cfg = oauthConfig(req.partner, provider);
    if (!cfg.clientId || !cfg.clientSecret) {
      return res.status(409).json({ error: `O app de ${PROVIDER_BY_ID[provider].name} ainda não foi cadastrado na plataforma. Fale com o suporte.` });
    }
    const state = randomBytes(24).toString('base64url');
    await db.run(`DELETE FROM oauth_states WHERE created_at < now() - interval '${OAUTH_STATE_TTL_MIN} minutes'`);
    await db.run('INSERT INTO oauth_states (state, org_id, user_id, provider, return_origin) VALUES ($1, $2, $3, $4, $5)', [
      state,
      req.user.orgId,
      req.user.id,
      provider,
      originOf(req),
    ]);
    res.json({ url: oauth.authorizeUrl(cfg, state, redirectUri(provider)) });
  }));

  // O retorno chega sempre no endereço da plataforma e volta para o domínio de onde a conexão começou.
  app.get('/api/oauth/callback/:provider', h(async (req, res) => {
    const { provider } = req.params;
    const { code, state, error, error_description } = req.query;
    const row = await db.get(
      `DELETE FROM oauth_states WHERE state = $1 AND provider = $2 AND created_at > now() - interval '${OAUTH_STATE_TTL_MIN} minutes' RETURNING *`,
      [String(state || ''), provider],
    );
    const back = (origin, params) => res.redirect(`${origin}/app/integracoes?${new URLSearchParams(params)}`);
    if (!row) return back(PUBLIC_URL, { erro: 'O pedido de conexão expirou. Clique em Conectar de novo.' });
    if (error) return back(row.return_origin, { erro: `A conexão foi cancelada: ${error_description || error}` });
    try {
      const org = await db.get('SELECT partner_id FROM organizations WHERE id = $1', [row.org_id]);
      const cfg = oauthConfig(await partnerById(org.partner_id), provider);
      const oauth = connectors[provider].oauth;
      const creds = await oauth.exchange(cfg, String(code), redirectUri(provider));
      const accountLabel = await oauth.accountLabel(creds);
      await saveIntegration(row.org_id, provider, { creds, accountLabel, userId: row.user_id });
      back(row.return_origin, { conectado: provider });
    } catch (err) {
      console.error(err);
      back(row.return_origin, { erro: err.message });
    }
  }));

  // ---------- Conexão por token (Telegram, WhatsApp) ----------

  app.post('/api/integrations/:provider', requireOrg('configurar'), h(async (req, res) => {
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
    const ids = newWebhookIds();
    const { creds, accountLabel, warning } = await tokenImpl.connect(fields, { integrationKey: ids.webhookKey, webhookSecret: ids.webhookSecret });
    await saveIntegration(req.user.orgId, provider, { creds, accountLabel, userId: req.user.id, ...ids });
    res.status(201).json({ ok: true, accountLabel, warning: warning || null });
  }));

  app.delete('/api/integrations/:provider', requireOrg('configurar'), h(async (req, res) => {
    await disconnect(req.user.orgId, req.params.provider);
    res.json({ ok: true });
  }));

  app.put('/api/channels/:provider', requireOrg('configurar'), h(async (req, res) => {
    const { provider } = req.params;
    if (!PROVIDER_BY_ID[provider]?.channel) return res.status(404).json({ error: 'Este canal não recebe mensagens.' });
    if (!(await getIntegration(req.user.orgId, provider))) return res.status(409).json({ error: 'Conecte o canal antes de escolher o agente.' });
    const agentId = req.body?.agentId ? Number(req.body.agentId) : null;
    if (!agentId) {
      await db.run('DELETE FROM channel_routes WHERE org_id = $1 AND provider = $2', [req.user.orgId, provider]);
      return res.json({ ok: true, agentId: null });
    }
    if (!(await db.get('SELECT 1 FROM agents WHERE id = $1 AND org_id = $2', [agentId, req.user.orgId]))) return res.status(404).json({ error: 'Agente não encontrado.' });
    await db.run(
      `INSERT INTO channel_routes (org_id, provider, agent_id) VALUES ($1, $2, $3) ON CONFLICT (org_id, provider) DO UPDATE SET agent_id = EXCLUDED.agent_id`,
      [req.user.orgId, provider, agentId],
    );
    res.json({ ok: true, agentId });
  }));

  // ---------- Webhooks: respondem na hora e o trabalho segue pela fila ----------

  const integrationByKey = (provider, key) => db.get('SELECT * FROM integrations WHERE provider = $1 AND webhook_key = $2', [provider, String(key)]);

  app.post('/api/webhooks/telegram/:key', h(async (req, res) => {
    const integ = await integrationByKey('telegram', req.params.key);
    if (!integ || !safeEqual(req.get('X-Telegram-Bot-Api-Secret-Token'), integ.webhook_secret)) return res.sendStatus(404);
    const msg = connectors.telegram.parseInbound(req.body);
    if (msg) await enqueue('mensagem_recebida', { integrationId: integ.id, provider: 'telegram', msg });
    res.sendStatus(200);
  }));

  app.get('/api/webhooks/whatsapp/:key', h(async (req, res) => {
    const integ = await integrationByKey('whatsapp', req.params.key);
    if (integ && req.query['hub.mode'] === 'subscribe' && safeEqual(req.query['hub.verify_token'], integ.webhook_secret)) {
      return res.status(200).send(String(req.query['hub.challenge']));
    }
    res.sendStatus(403);
  }));

  app.post('/api/webhooks/whatsapp/:key', h(async (req, res) => {
    const integ = await integrationByKey('whatsapp', req.params.key);
    if (!integ) return res.sendStatus(404);
    const creds = decrypt(integ.credentials_enc);
    if (!connectors.whatsapp.verifySignature(creds, req.rawBody || Buffer.alloc(0), (name) => req.get(name))) return res.sendStatus(401);
    for (const f of connectors.whatsapp.parseFailures(req.body)) {
      await db.run('INSERT INTO delivery_failures (org_id, provider, recipient, code, reason) VALUES ($1, $2, $3, $4, $5)', [integ.org_id, 'whatsapp', f.recipient, f.code, f.reason]);
      const conv = await db.get('SELECT id FROM conversations WHERE org_id = $1 AND channel = $2 AND external_id = $3 ORDER BY id DESC LIMIT 1', [integ.org_id, 'whatsapp', f.recipient]);
      if (conv) await appendMessage(conv.id, 'system', `A última mensagem do WhatsApp não foi entregue. Motivo: ${f.reason}`, 'sistema');
    }
    for (const msg of connectors.whatsapp.parseInbound(req.body)) {
      await enqueue('mensagem_recebida', { integrationId: integ.id, provider: 'whatsapp', msg });
    }
    res.sendStatus(200);
  }));
}

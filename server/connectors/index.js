// Registro das integrações: guarda e renova credenciais e executa ações do catálogo.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { oauthConfig, partnerById } from '../brand.js';
import { ACTION_BY_ID, connectionFor } from '../../shared/catalog.js';
import { ConnectorError } from './http.js';
import * as microsoft from './microsoft.js';
import * as google from './google.js';
import * as slack from './slack.js';
import * as telegram from './telegram.js';
import * as whatsapp from './whatsapp.js';

export const connectors = { microsoft, google, slack, telegram, whatsapp };
export { ConnectorError };

// O provedor está pronto para conectar? OAuth exige um app cadastrado (do parceiro ou da plataforma).
export function platformReady(providerId, partner) {
  const c = connectors[providerId];
  if (!c) return { ready: false, missing: [] };
  if (c.oauth) {
    const cfg = oauthConfig(partner, providerId);
    const ready = Boolean(cfg.clientId && cfg.clientSecret);
    return { ready, missing: ready ? [] : c.oauth.env, source: cfg.source };
  }
  return { ready: true, missing: [] };
}

// Recursos opcionais liberados para a empresa (hoje: escopos restritos do Google).
export function featuresFor(partner) {
  return { google_restricted: Boolean(oauthConfig(partner, 'google').restricted) };
}

export const getIntegration = (orgId, providerId) => db.get('SELECT * FROM integrations WHERE org_id = $1 AND provider = $2', [orgId, providerId]);

export async function saveIntegration(orgId, providerId, { creds, accountLabel, userId, webhookKey = null, webhookSecret = null }) {
  await db.run(
    `INSERT INTO integrations (org_id, provider, account_label, credentials_enc, webhook_key, webhook_secret, connected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (org_id, provider) DO UPDATE SET
       account_label = EXCLUDED.account_label,
       credentials_enc = EXCLUDED.credentials_enc,
       webhook_key = EXCLUDED.webhook_key,
       webhook_secret = EXCLUDED.webhook_secret,
       connected_by = EXCLUDED.connected_by,
       created_at = now()`,
    [orgId, providerId, accountLabel || '', encrypt(creds), webhookKey, webhookSecret, userId ?? null],
  );
}

export const newWebhookIds = () => ({
  webhookKey: randomBytes(12).toString('base64url'),
  webhookSecret: randomBytes(24).toString('base64url'),
});

export async function disconnect(orgId, providerId) {
  const row = await getIntegration(orgId, providerId);
  if (!row) return;
  const c = connectors[providerId];
  if (c?.token?.disconnect) await c.token.disconnect(decrypt(row.credentials_enc)).catch(() => {});
  await db.run('DELETE FROM integrations WHERE id = $1', [row.id]);
  await db.run('DELETE FROM channel_routes WHERE org_id = $1 AND provider = $2', [orgId, providerId]);
}

async function partnerOfOrg(orgId) {
  const o = await db.get('SELECT partner_id FROM organizations WHERE id = $1', [orgId]);
  return o ? partnerById(o.partner_id) : null;
}

// Devolve credenciais válidas, renovando o token OAuth quando estiver perto de expirar.
export async function credentialsFor(orgId, providerId) {
  const row = await getIntegration(orgId, providerId);
  if (!row) throw new ConnectorError(`A empresa ainda não conectou ${providerId}. Peça para um administrador conectar em Integrações.`);
  let creds = decrypt(row.credentials_enc);
  const oauth = connectors[providerId]?.oauth;
  if (oauth?.refresh && creds.expires_at && creds.expires_at - 60_000 < Date.now()) {
    if (!creds.refresh_token) throw new ConnectorError('A conexão expirou. Conecte a conta de novo em Integrações.', { reconnect: true });
    const cfg = oauthConfig(await partnerOfOrg(orgId), providerId);
    creds = await oauth.refresh(cfg, creds);
    await db.run('UPDATE integrations SET credentials_enc = $1 WHERE id = $2', [encrypt(creds), row.id]);
  }
  return creds;
}

// Confere os campos obrigatórios e os tipos antes de chamar a plataforma.
export function validateInput(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'A entrada precisa ser um objeto.';
  const { properties = {}, required = [] } = action.input_schema;
  for (const key of required) {
    if (!(key in input)) return `Campo obrigatório ausente: ${key}.`;
  }
  for (const [key, value] of Object.entries(input)) {
    if (!(key in properties)) return `Campo desconhecido: ${key}.`;
    if (properties[key].type === 'string' && typeof value !== 'string') return `O campo ${key} precisa ser texto.`;
  }
  return null;
}

export async function executeAction(orgId, actionId, input) {
  const action = ACTION_BY_ID[actionId];
  if (!action) throw new ConnectorError(`Ação desconhecida: ${actionId}`);
  const providerId = connectionFor(action.provider);
  const impl = connectors[providerId]?.actions?.[actionId];
  if (!impl) throw new ConnectorError(`A ação ${actionId} ainda não tem implementação.`);
  const creds = await credentialsFor(orgId, providerId);
  return impl({ creds, token: creds.access_token }, input);
}

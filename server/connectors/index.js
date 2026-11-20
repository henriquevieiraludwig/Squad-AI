// Registro das integrações: guarda e renova credenciais e executa ações do catálogo.
import { randomBytes } from 'node:crypto';
import { db } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { ACTION_BY_ID, connectionFor } from '../../shared/catalog.js';
import { ConnectorError, requireEnv } from './http.js';
import * as microsoft from './microsoft.js';
import * as google from './google.js';
import * as slack from './slack.js';
import * as telegram from './telegram.js';
import * as whatsapp from './whatsapp.js';

export const connectors = { microsoft, google, slack, telegram, whatsapp };
export { ConnectorError };

// O provedor está pronto para conectar? (OAuth exige o app cadastrado pela plataforma)
export function platformReady(providerId) {
  const c = connectors[providerId];
  if (!c) return { ready: false, missing: [] };
  if (c.oauth) {
    const missing = requireEnv(...c.oauth.env);
    return { ready: !missing, missing: missing || [] };
  }
  return { ready: true, missing: [] };
}

export function getIntegration(orgId, providerId) {
  return db.prepare('SELECT * FROM integrations WHERE org_id = ? AND provider = ?').get(orgId, providerId);
}

export function saveIntegration(orgId, providerId, { creds, accountLabel, userId, webhookKey = null, webhookSecret = null }) {
  db.prepare(
    `INSERT INTO integrations (org_id, provider, account_label, credentials_enc, webhook_key, webhook_secret, connected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, provider) DO UPDATE SET
       account_label = excluded.account_label,
       credentials_enc = excluded.credentials_enc,
       webhook_key = excluded.webhook_key,
       webhook_secret = excluded.webhook_secret,
       connected_by = excluded.connected_by,
       created_at = datetime('now')`,
  ).run(orgId, providerId, accountLabel || '', encrypt(creds), webhookKey, webhookSecret, userId ?? null);
}

export const newWebhookIds = () => ({
  webhookKey: randomBytes(12).toString('base64url'),
  webhookSecret: randomBytes(24).toString('base64url'),
});

export async function disconnect(orgId, providerId) {
  const row = getIntegration(orgId, providerId);
  if (!row) return;
  const c = connectors[providerId];
  if (c?.token?.disconnect) await c.token.disconnect(decrypt(row.credentials_enc)).catch(() => {});
  db.prepare('DELETE FROM integrations WHERE id = ?').run(row.id);
  db.prepare('DELETE FROM channel_routes WHERE org_id = ? AND provider = ?').run(orgId, providerId);
}

// Devolve credenciais válidas, renovando o token OAuth quando estiver perto de expirar.
export async function credentialsFor(orgId, providerId) {
  const row = getIntegration(orgId, providerId);
  if (!row) throw new ConnectorError(`A empresa ainda não conectou ${providerId}. Peça para um administrador conectar em Integrações.`);
  let creds = decrypt(row.credentials_enc);
  const oauth = connectors[providerId]?.oauth;
  if (oauth?.refresh && creds.expires_at && creds.expires_at - 60_000 < Date.now()) {
    if (!creds.refresh_token) throw new ConnectorError('A conexão expirou. Conecte a conta de novo em Integrações.', { reconnect: true });
    creds = await oauth.refresh(creds);
    db.prepare('UPDATE integrations SET credentials_enc = ? WHERE id = ?').run(encrypt(creds), row.id);
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

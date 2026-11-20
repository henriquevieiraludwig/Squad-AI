// Slack: o app é instalado no workspace da empresa e age como bot.
import { request, ConnectorError } from './http.js';

const BOT_SCOPES = 'chat:write,channels:read,groups:read';
const P = 'Slack';

// A API do Slack responde 200 com { ok: false } em caso de erro.
async function slack(method, token, { body, query } = {}) {
  const url = `https://slack.com/api/${method}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const data = await request(url, { method: body ? 'POST' : 'GET', token, body, provider: P });
  if (!data.ok) {
    throw new ConnectorError(`Slack recusou a operação: ${data.error}`, { reconnect: ['invalid_auth', 'token_revoked', 'account_inactive'].includes(data.error) });
  }
  return data;
}

export const oauth = {
  env: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'],
  authorizeUrl(cfg, state, redirectUri) {
    const q = new URLSearchParams({ client_id: cfg.clientId, scope: BOT_SCOPES, redirect_uri: redirectUri, state });
    return `https://slack.com/oauth/v2/authorize?${q}`;
  },
  async exchange(cfg, code, redirectUri) {
    const data = await request('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      provider: P,
      form: { client_id: cfg.clientId, client_secret: cfg.clientSecret, code, redirect_uri: redirectUri },
    });
    if (!data.ok) throw new ConnectorError(`Slack recusou a conexão: ${data.error}`);
    // Tokens de bot do Slack não expiram (a menos que a rotação esteja ligada no app).
    return { access_token: data.access_token, team: data.team?.name, expires_at: null };
  },
  async accountLabel(creds) {
    return creds.team ? `Workspace ${creds.team}` : 'Workspace do Slack';
  },
};

export const actions = {
  async slack_list_channels({ token }) {
    const data = await slack('conversations.list', token, { query: { limit: '200', exclude_archived: 'true', types: 'public_channel' } });
    return (data.channels || []).map((c) => ({ nome: `#${c.name}`, id: c.id, bot_no_canal: c.is_member }));
  },
  async slack_send_message({ token }, { channel, text }) {
    const data = await slack('chat.postMessage', token, { body: { channel, text } });
    return { enviado: true, canal: data.channel, ts: data.ts };
  },
};

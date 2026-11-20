// Google Workspace: Gmail, Agenda, Drive e Google Chat.
import { request, splitEmails, localDateTime, TIMEZONE, ConnectorError } from './http.js';

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
].join(' ');

const P = 'Google Workspace';

export const oauth = {
  env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(code, redirectUri) {
    const t = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      provider: P,
      form: {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
    });
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
  },
  async refresh(creds) {
    const t = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      provider: P,
      form: {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token',
      },
    });
    return { ...creds, access_token: t.access_token, expires_at: Date.now() + t.expires_in * 1000 };
  },
  async accountLabel(creds) {
    const me = await request('https://openidconnect.googleapis.com/v1/userinfo', { token: creds.access_token, provider: P });
    return me.email;
  },
};

const b64url = (s) => Buffer.from(s, 'utf8').toString('base64url');
const mimeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);

export const actions = {
  async gmail_send_email({ token }, { to, subject, body }) {
    const recipients = splitEmails(to);
    if (!recipients.length) throw new ConnectorError('Informe ao menos um destinatário.');
    const mime = [
      `To: ${recipients.join(', ')}`,
      `Subject: ${mimeHeader(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(body, 'utf8').toString('base64'),
    ].join('\r\n');
    const sent = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      token,
      provider: P,
      body: { raw: b64url(mime) },
    });
    return { enviado: true, id: sent.id, para: recipients, assunto: subject };
  },

  async gmail_search({ token }, { query }) {
    const list = await request(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(query)}`, {
      token,
      provider: P,
    });
    const out = [];
    for (const m of list.messages || []) {
      const msg = await request(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { token, provider: P },
      );
      const h = Object.fromEntries((msg.payload?.headers || []).map((x) => [x.name, x.value]));
      out.push({ assunto: h.Subject, de: h.From, data: h.Date, previa: msg.snippet });
    }
    return out;
  },

  async gcal_create_event({ token }, { summary, start, end, attendees, description }) {
    const ev = await request('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      token,
      provider: P,
      body: {
        summary,
        description: description || '',
        start: { dateTime: localDateTime(start), timeZone: TIMEZONE },
        end: { dateTime: localDateTime(end), timeZone: TIMEZONE },
        attendees: splitEmails(attendees).map((email) => ({ email })),
      },
    });
    return { criado: true, id: ev.id, link: ev.htmlLink };
  },

  async gcal_list_events({ token }, { start, end }) {
    const toRfc = (v) => (/(Z|[+-]\d{2}:?\d{2})$/.test(v) ? v : `${localDateTime(v)}-03:00`);
    const q = new URLSearchParams({
      timeMin: toRfc(start),
      timeMax: toRfc(end),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '25',
      timeZone: TIMEZONE,
    });
    const data = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${q}`, { token, provider: P });
    return (data.items || []).map((e) => ({
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date,
      fim: e.end?.dateTime || e.end?.date,
      participantes: (e.attendees || []).map((a) => a.email),
      link: e.htmlLink,
    }));
  },

  async gdrive_search_files({ token }, { query }) {
    const q = `fullText contains '${String(query).replace(/['\\]/g, '\\$&')}' and trashed = false`;
    const params = new URLSearchParams({ q, pageSize: '10', fields: 'files(id,name,mimeType,webViewLink,modifiedTime)' });
    const data = await request(`https://www.googleapis.com/drive/v3/files?${params}`, { token, provider: P });
    return (data.files || []).map((f) => ({ nome: f.name, tipo: f.mimeType, link: f.webViewLink, alterado_em: f.modifiedTime }));
  },

  async gchat_list_spaces({ token }) {
    const data = await request('https://chat.googleapis.com/v1/spaces?pageSize=50', { token, provider: P });
    return (data.spaces || []).map((s) => ({ nome: s.displayName || '(conversa direta)', space: s.name, tipo: s.spaceType }));
  },

  async gchat_send_message({ token }, { space, text }) {
    if (!/^spaces\/[\w-]+$/.test(space)) throw new ConnectorError('O espaço precisa estar no formato spaces/XXXX.');
    const msg = await request(`https://chat.googleapis.com/v1/${space}/messages`, { method: 'POST', token, provider: P, body: { text } });
    return { enviado: true, id: msg.name };
  },
};

// Microsoft 365 via Microsoft Graph: Outlook, Calendário, Teams e OneDrive.
import { request, splitEmails, localDateTime, TIMEZONE, ConnectorError } from './http.js';

const authBase = (cfg) => `https://login.microsoftonline.com/${cfg.tenant || 'common'}/oauth2/v2.0`;
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = [
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Calendars.ReadWrite',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Send',
  'Files.Read.All',
].join(' ');

const P = 'Microsoft 365';

function toCreds(t) {
  return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + (t.expires_in || 3600) * 1000 };
}

export const oauth = {
  env: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
  authorizeUrl(cfg, state, redirectUri) {
    const q = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: SCOPES,
      state,
      prompt: 'select_account',
    });
    return `${authBase(cfg)}/authorize?${q}`;
  },
  async exchange(cfg, code, redirectUri) {
    const t = await request(`${authBase(cfg)}/token`, {
      method: 'POST',
      provider: P,
      form: {
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        scope: SCOPES,
      },
    });
    return toCreds(t);
  },
  async refresh(cfg, creds) {
    const t = await request(`${authBase(cfg)}/token`, {
      method: 'POST',
      provider: P,
      form: {
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: creds.refresh_token,
        scope: SCOPES,
      },
    });
    return { ...toCreds(t), refresh_token: t.refresh_token || creds.refresh_token };
  },
  async accountLabel(creds) {
    const me = await request(`${GRAPH}/me?$select=displayName,mail,userPrincipalName`, { token: creds.access_token, provider: P });
    return me.mail || me.userPrincipalName || me.displayName;
  },
};

const g = (path, token, opts = {}) => request(`${GRAPH}${path}`, { token, provider: P, ...opts });

export const actions = {
  async outlook_send_email({ token }, { to, subject, body }) {
    const recipients = splitEmails(to);
    if (!recipients.length) throw new ConnectorError('Informe ao menos um destinatário.');
    await g('/me/sendMail', token, {
      method: 'POST',
      body: {
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      },
    });
    return { enviado: true, para: recipients, assunto: subject };
  },

  async outlook_search_email({ token }, { query }) {
    const q = encodeURIComponent(`"${String(query).replace(/"/g, '')}"`);
    const data = await g(`/me/messages?$search=${q}&$top=10&$select=subject,from,receivedDateTime,bodyPreview,webLink`, token);
    return (data.value || []).map((m) => ({
      assunto: m.subject,
      de: m.from?.emailAddress?.address,
      recebido_em: m.receivedDateTime,
      previa: m.bodyPreview,
      link: m.webLink,
    }));
  },

  async outlook_create_event({ token }, { subject, start, end, attendees, description }) {
    const ev = await g('/me/events', token, {
      method: 'POST',
      body: {
        subject,
        body: { contentType: 'Text', content: description || '' },
        start: { dateTime: localDateTime(start), timeZone: TIMEZONE },
        end: { dateTime: localDateTime(end), timeZone: TIMEZONE },
        attendees: splitEmails(attendees).map((address) => ({ emailAddress: { address }, type: 'required' })),
      },
    });
    return { criado: true, id: ev.id, link: ev.webLink };
  },

  async outlook_list_events({ token }, { start, end }) {
    const q = new URLSearchParams({
      startDateTime: localDateTime(start),
      endDateTime: localDateTime(end),
      $select: 'subject,start,end,location,attendees,organizer',
      $orderby: 'start/dateTime',
      $top: '25',
    });
    const data = await g(`/me/calendarView?${q}`, token, { headers: { Prefer: `outlook.timezone="${TIMEZONE}"` } });
    return (data.value || []).map((e) => ({
      titulo: e.subject,
      inicio: e.start?.dateTime,
      fim: e.end?.dateTime,
      local: e.location?.displayName || '',
      participantes: (e.attendees || []).map((a) => a.emailAddress?.address),
    }));
  },

  async teams_list_channels({ token }) {
    const teams = await g('/me/joinedTeams?$select=id,displayName', token);
    const out = [];
    for (const t of (teams.value || []).slice(0, 15)) {
      const ch = await g(`/teams/${t.id}/channels?$select=id,displayName`, token);
      out.push({ equipe: t.displayName, teamId: t.id, canais: (ch.value || []).map((c) => ({ nome: c.displayName, channelId: c.id })) });
    }
    return out;
  },

  async teams_send_message({ token }, { teamId, channelId, text }) {
    const msg = await g(`/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, token, {
      method: 'POST',
      body: { body: { contentType: 'text', content: text } },
    });
    return { publicado: true, id: msg.id, link: msg.webUrl };
  },

  async onedrive_search_files({ token }, { query }) {
    const q = String(query).replace(/'/g, "''");
    const data = await g(`/me/drive/root/search(q='${encodeURIComponent(q)}')?$top=10&$select=name,webUrl,lastModifiedDateTime,size`, token);
    return (data.value || []).map((f) => ({ nome: f.name, link: f.webUrl, alterado_em: f.lastModifiedDateTime }));
  },
};

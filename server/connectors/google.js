// Google Workspace: Gmail, Agenda, Drive, Google Chat, Planilhas, Documentos, Apresentações e Formulários.
import { request, splitEmails, localDateTime, TIMEZONE, ConnectorError } from './http.js';

// Escopos sensíveis (verificação simples do Google).
const BASE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  // Só os arquivos que o próprio app cria (não é escopo restrito).
  'https://www.googleapis.com/auth/drive.file',
  // Planilhas, Documentos, Apresentações e Formulários (escopos sensíveis, não restritos).
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.responses.readonly',
];
// Escopos restritos: exigem a avaliação de segurança anual (CASA). Só com cfg.restricted.
const RESTRICTED_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/drive.readonly'];
const scopes = (cfg) => [...BASE_SCOPES, ...(cfg.restricted ? RESTRICTED_SCOPES : [])].join(' ');

const P = 'Google Workspace';

export const oauth = {
  env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  authorizeUrl(cfg, state, redirectUri) {
    const q = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes(cfg),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },
  async exchange(cfg, code, redirectUri) {
    const t = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      provider: P,
      form: {
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      },
    });
    return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: Date.now() + t.expires_in * 1000 };
  },
  async refresh(cfg, creds) {
    const t = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      provider: P,
      form: {
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
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
      out.push({ id: m.id, assunto: h.Subject, de: h.From, data: h.Date, previa: msg.snippet });
    }
    return out;
  },

  async gcal_create_event({ token }, { summary, start, end, attendees, description, meet: meetOpt }) {
    // Com convidados, o link do Meet sai por padrão; só não sai se o agente mandar meet=false.
    const meet = meetOpt ?? splitEmails(attendees).length > 0;
    // conferenceDataVersion=1 permite pedir a criação do link do Meet junto com o evento.
    const ev = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all${meet ? '&conferenceDataVersion=1' : ''}`, {
      method: 'POST',
      token,
      provider: P,
      body: {
        summary,
        description: description || '',
        start: { dateTime: localDateTime(start), timeZone: TIMEZONE },
        end: { dateTime: localDateTime(end), timeZone: TIMEZONE },
        attendees: splitEmails(attendees).map((email) => ({ email })),
        ...(meet ? { conferenceData: { createRequest: { requestId: `squadai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
      },
    });
    const meetLink = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null;
    return { criado: true, id: ev.id, link: ev.htmlLink, ...(meet ? { link_meet: meetLink || 'O Google ainda está gerando o link do Meet; ele aparece no evento em instantes.' } : {}) };
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
      id: e.id,
      titulo: e.summary,
      inicio: e.start?.dateTime || e.start?.date,
      fim: e.end?.dateTime || e.end?.date,
      participantes: (e.attendees || []).map((a) => a.email),
      link: e.htmlLink,
    }));
  },

  // Cancela o evento e avisa os convidados.
  async gcal_delete_event({ token }, { eventId }) {
    await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE', token, provider: P });
    return { cancelado: true, id: eventId };
  },

  // Remarca ou altera o evento (só os campos informados) e avisa os convidados.
  async gcal_update_event({ token }, { eventId, summary, start, end, attendees, description }) {
    const body = {};
    if (summary) body.summary = summary;
    if (description) body.description = description;
    if (start) body.start = { dateTime: localDateTime(start), timeZone: TIMEZONE };
    if (end) body.end = { dateTime: localDateTime(end), timeZone: TIMEZONE };
    if (attendees) body.attendees = splitEmails(attendees).map((email) => ({ email }));
    if (!Object.keys(body).length) throw new ConnectorError('Diga o que mudar no evento.');
    const ev = await request(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'PATCH',
      token,
      provider: P,
      body,
    });
    return { atualizado: true, id: ev.id, inicio: ev.start?.dateTime, fim: ev.end?.dateTime, link: ev.htmlLink };
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

  async gmail_reply({ token }, { messageId, body }) {
    const orig = await request(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Message-ID`,
      { token, provider: P },
    );
    const h = Object.fromEntries((orig.payload?.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
    const to = h['reply-to'] || h.from;
    const subject = /^re:/i.test(h.subject || '') ? h.subject : `Re: ${h.subject || ''}`;
    const mime = [
      `To: ${to}`,
      `Subject: ${mimeHeader(subject)}`,
      ...(h['message-id'] ? [`In-Reply-To: ${h['message-id']}`, `References: ${h['message-id']}`] : []),
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
      body: { raw: b64url(mime), threadId: orig.threadId },
    });
    return { respondido: true, id: sent.id, para: to };
  },

  // Cria um Google Docs com o texto informado (escopo drive.file: só arquivos criados pelo app).
  async gdrive_create_doc({ token }, { name, content }) {
    const boundary = `squadai${Date.now()}`;
    const meta = { name: String(name).trim() || 'Documento', mimeType: 'application/vnd.google-apps.document' };
    const raw = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(meta),
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      content,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    const f = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      token,
      provider: P,
      raw,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    return { criado: true, nome: f.name, link: f.webViewLink };
  },
};

// ---------- Planilhas, Documentos, Apresentações e Formulários ----------

// Aceita o ID ou o link do arquivo (…/d/ID/…).
export function fileIdOf(v) {
  const s = String(v || '').trim();
  const m = s.match(/\/d\/(?:e\/)?([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  throw new ConnectorError('Informe o link ou o ID do arquivo do Google.');
}

// Linhas separadas por quebra de linha; células separadas por " | ".
const rowsOf = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()));

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DOCS = 'https://docs.googleapis.com/v1/documents';
const SLIDES = 'https://slides.googleapis.com/v1/presentations';
const FORMS = 'https://forms.googleapis.com/v1/forms';
const gq = (url, token, opts = {}) => request(url, { token, provider: P, ...opts });

function docText(doc, max = 20000) {
  let out = '';
  for (const el of doc.body?.content || []) {
    for (const pe of el.paragraph?.elements || []) out += pe.textRun?.content || '';
    for (const row of el.table?.tableRows || []) {
      out += `${row.tableCells.map((c) => (c.content || []).map((x) => (x.paragraph?.elements || []).map((e) => e.textRun?.content || '').join('')).join(' ').trim()).join(' | ')}\n`;
    }
    if (out.length > max) break;
  }
  return out.slice(0, max).trim();
}

const shapeText = (el) => (el.shape?.text?.textElements || []).map((t) => t.textRun?.content || '').join('').trim();

Object.assign(actions, {
  async sheets_create({ token }, { title, columns }) {
    const s = await gq(SHEETS, token, { method: 'POST', body: { properties: { title: String(title).trim() || 'Planilha' } } });
    const header = rowsOf(columns)[0];
    if (header?.length) {
      await gq(`${SHEETS}/${s.spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, token, { method: 'POST', body: { values: [header] } });
    }
    return { criada: true, id: s.spreadsheetId, link: s.spreadsheetUrl };
  },

  async sheets_read({ token }, { spreadsheet, range }) {
    const id = fileIdOf(spreadsheet);
    const r = String(range || '').trim() || 'A1:Z200';
    const data = await gq(`${SHEETS}/${id}/values/${encodeURIComponent(r)}`, token);
    const values = (data.values || []).slice(0, 200);
    return { intervalo: data.range, linhas: values.length, valores: values };
  },

  async sheets_append_rows({ token }, { spreadsheet, rows, sheet }) {
    const id = fileIdOf(spreadsheet);
    const values = rowsOf(rows);
    if (!values.length) throw new ConnectorError('Informe ao menos uma linha.');
    const range = sheet ? `'${String(sheet).replace(/'/g, "''")}'!A1` : 'A1';
    const r = await gq(`${SHEETS}/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, token, {
      method: 'POST',
      body: { values },
    });
    return { adicionadas: values.length, intervalo: r.updates?.updatedRange };
  },

  async sheets_update_cells({ token }, { spreadsheet, range, rows }) {
    const id = fileIdOf(spreadsheet);
    const values = rowsOf(rows);
    if (!values.length) throw new ConnectorError('Informe os valores.');
    const r = await gq(`${SHEETS}/${id}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, token, { method: 'PUT', body: { values } });
    return { atualizadas: r.updatedCells, intervalo: r.updatedRange };
  },

  async docs_read({ token }, { document }) {
    const id = fileIdOf(document);
    const doc = await gq(`${DOCS}/${id}`, token);
    return { titulo: doc.title, texto: docText(doc), link: `https://docs.google.com/document/d/${id}/edit` };
  },

  async docs_append_text({ token }, { document, text }) {
    const id = fileIdOf(document);
    await gq(`${DOCS}/${id}:batchUpdate`, token, {
      method: 'POST',
      body: { requests: [{ insertText: { endOfSegmentLocation: {}, text: `\n${String(text)}` } }] },
    });
    return { atualizado: true, link: `https://docs.google.com/document/d/${id}/edit` };
  },

  // Cada slide: primeira linha é o título, as demais o texto. Slides separados por uma linha em branco.
  async slides_create({ token }, { title, slides }) {
    const pres = await gq(SLIDES, token, { method: 'POST', body: { title: String(title).trim() || 'Apresentação' } });
    const blocks = String(slides || '')
      .split(/\n\s*\n/)
      .map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean))
      .filter((b) => b.length);
    if (blocks.length) {
      const stamp = Date.now().toString(36);
      const requests = [];
      blocks.forEach((b, i) => {
        const sid = `s${stamp}_${i}`;
        requests.push({
          createSlide: {
            objectId: sid,
            slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
            placeholderIdMappings: [
              { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: `${sid}_t` },
              { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: `${sid}_b` },
            ],
          },
        });
        requests.push({ insertText: { objectId: `${sid}_t`, text: b[0] } });
        if (b.length > 1) requests.push({ insertText: { objectId: `${sid}_b`, text: b.slice(1).map((l) => l.replace(/^[-•]\s*/, '')).join('\n') } });
      });
      // A apresentação nasce com um slide de capa vazio: troca pelo conteúdo.
      if (pres.slides?.[0]?.objectId) requests.push({ deleteObject: { objectId: pres.slides[0].objectId } });
      await gq(`${SLIDES}/${pres.presentationId}:batchUpdate`, token, { method: 'POST', body: { requests } });
    }
    return { criada: true, slides: blocks.length, link: `https://docs.google.com/presentation/d/${pres.presentationId}/edit` };
  },

  async slides_read({ token }, { presentation }) {
    const id = fileIdOf(presentation);
    const p = await gq(`${SLIDES}/${id}`, token);
    return {
      titulo: p.title,
      slides: (p.slides || []).slice(0, 60).map((s, i) => ({ numero: i + 1, texto: (s.pageElements || []).map(shapeText).filter(Boolean).join('\n') })),
      link: `https://docs.google.com/presentation/d/${id}/edit`,
    };
  },

  // Uma pergunta por linha. Múltipla escolha: "Pergunta: opção 1 | opção 2". Termine com * para obrigatória.
  async forms_create({ token }, { title, description, questions }) {
    const form = await gq(FORMS, token, { method: 'POST', body: { info: { title: String(title).trim() || 'Formulário', documentTitle: String(title).trim() || 'Formulário' } } });
    const requests = [];
    if (description) requests.push({ updateFormInfo: { info: { description: String(description) }, updateMask: 'description' } });
    String(questions || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line, index) => {
        const required = /\*\s*$/.test(line);
        const clean = line.replace(/\*\s*$/, '').trim();
        const m = clean.match(/^(.+?):\s*(.+\|.+)$/);
        const question = m
          ? { required, choiceQuestion: { type: 'RADIO', options: m[2].split('|').map((o) => ({ value: o.trim() })).filter((o) => o.value) } }
          : { required, textQuestion: { paragraph: clean.length > 80 } };
        requests.push({ createItem: { item: { title: m ? m[1].trim() : clean, questionItem: { question } }, location: { index } } });
      });
    if (requests.length) await gq(`${FORMS}/${form.formId}:batchUpdate`, token, { method: 'POST', body: { requests } });
    return { criado: true, link_para_responder: form.responderUri, link_para_editar: `https://docs.google.com/forms/d/${form.formId}/edit` };
  },

  async forms_get_responses({ token }, { form }) {
    const id = fileIdOf(form);
    const [f, r] = await Promise.all([gq(`${FORMS}/${id}`, token), gq(`${FORMS}/${id}/responses`, token)]);
    const titles = {};
    for (const it of f.items || []) if (it.questionItem?.question?.questionId) titles[it.questionItem.question.questionId] = it.title;
    const list = (r.responses || []).slice(0, 50).map((resp) => ({
      enviado_em: resp.lastSubmittedTime,
      email: resp.respondentEmail,
      respostas: Object.fromEntries(
        Object.entries(resp.answers || {}).map(([qid, a]) => [titles[qid] || qid, (a.textAnswers?.answers || []).map((x) => x.value).join(', ')]),
      ),
    }));
    return { formulario: f.info?.title, total: (r.responses || []).length, respostas: list };
  },
});

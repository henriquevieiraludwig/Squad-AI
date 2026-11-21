// Ações novas de Microsoft 365 e Google: confere o formato das chamadas com o fetch simulado.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { actions as ms } from '../server/connectors/microsoft.js';
import { actions as google } from '../server/connectors/google.js';

let calls;
let replies;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  replies = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const next = replies.shift() ?? {};
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const ctx = { token: 'tok' };

describe('Microsoft 365', () => {
  it('cria evento com reunião do Teams', async () => {
    replies = [{ id: 'ev1', webLink: 'https://outlook/ev1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } }];
    const r = await ms.outlook_create_event(ctx, { subject: 'Reunião', start: '2026-11-25T14:00:00', end: '2026-11-25T15:00:00', attendees: 'a@b.com', description: '', teams: true });
    const body = JSON.parse(calls[0].body);
    assert.equal(body.isOnlineMeeting, true);
    assert.equal(body.onlineMeetingProvider, 'teamsForBusiness');
    assert.equal(r.link_teams, 'https://teams.microsoft.com/l/meetup-join/x');
  });

  it('responde e-mail do Outlook', async () => {
    await ms.outlook_reply_email(ctx, { messageId: 'AAMk=1', body: 'Obrigado!' });
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/me\/messages\/AAMk%3D1\/reply$/);
    assert.deepEqual(JSON.parse(calls[0].body), { comment: 'Obrigado!' });
  });

  it('envia mensagem direta no Teams criando o chat 1:1', async () => {
    replies = [{ id: 'me-1' }, { id: '19:chat' }, { id: 'm1', webUrl: 'https://teams/x' }];
    const r = await ms.teams_send_chat_message(ctx, { to: 'bruno@empresa.com', text: 'Oi' });
    assert.match(calls[1].url, /\/chats$/);
    const chat = JSON.parse(calls[1].body);
    assert.equal(chat.chatType, 'oneOnOne');
    assert.match(chat.members[1]['user@odata.bind'], /users\('bruno%40empresa\.com'\)/);
    assert.match(calls[2].url, /\/chats\/19%3Achat\/messages$/);
    assert.equal(r.enviado, true);
  });

  it('busca no SharePoint pela Search API', async () => {
    replies = [{ value: [{ hitsContainers: [{ hits: [{ summary: 'contrato <c0>2026</c0>', resource: { name: 'Contrato.docx', webUrl: 'https://sp/c' } }] }] }] }];
    const r = await ms.sharepoint_search_files(ctx, { query: 'contrato' });
    assert.match(calls[0].url, /\/search\/query$/);
    assert.deepEqual(JSON.parse(calls[0].body).requests[0].entityTypes, ['driveItem']);
    assert.deepEqual(r[0], { nome: 'Contrato.docx', link: 'https://sp/c', alterado_em: undefined, trecho: 'contrato 2026' });
  });

  it('salva arquivo de texto no OneDrive', async () => {
    replies = [{ name: 'ata.txt', webUrl: 'https://od/ata' }];
    const r = await ms.onedrive_upload_file(ctx, { fileName: 'ata/1.txt', content: 'Pauta' });
    assert.equal(calls[0].method, 'PUT');
    assert.match(calls[0].url, /\/me\/drive\/root:\/Squad%20AI\/ata-1\.txt:\/content$/);
    assert.equal(calls[0].body, 'Pauta');
    assert.match(calls[0].headers['Content-Type'], /^text\/plain/);
    assert.equal(r.salvo, true);
  });
});

describe('Google Workspace', () => {
  it('cria evento com link do Google Meet', async () => {
    replies = [{ id: 'e1', htmlLink: 'https://cal/e1', hangoutLink: 'https://meet.google.com/abc-defg-hij' }];
    const r = await google.gcal_create_event(ctx, { summary: 'Reunião', start: '2026-11-25T14:00:00', end: '2026-11-25T15:00:00', attendees: 'a@b.com', description: '', meet: true });
    assert.match(calls[0].url, /conferenceDataVersion=1/);
    const body = JSON.parse(calls[0].body);
    assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
    assert.ok(body.conferenceData.createRequest.requestId);
    assert.equal(r.link_meet, 'https://meet.google.com/abc-defg-hij');
  });

  it('sem meet, não pede videochamada', async () => {
    replies = [{ id: 'e2', htmlLink: 'https://cal/e2' }];
    const r = await google.gcal_create_event(ctx, { summary: 'Almoço', start: '2026-11-25T12:00:00', end: '2026-11-25T13:00:00', attendees: '', description: '' });
    assert.doesNotMatch(calls[0].url, /conferenceDataVersion/);
    assert.equal(JSON.parse(calls[0].body).conferenceData, undefined);
    assert.equal(r.link_meet, undefined);
  });

  it('cria documento no Drive (upload multipart)', async () => {
    replies = [{ id: 'f1', name: 'Ata', webViewLink: 'https://docs/f1' }];
    const r = await google.gdrive_create_doc(ctx, { name: 'Ata', content: 'Pauta da reunião' });
    assert.match(calls[0].url, /upload\/drive\/v3\/files\?uploadType=multipart/);
    assert.match(calls[0].headers['Content-Type'], /^multipart\/related; boundary=/);
    assert.ok(calls[0].body.includes('application/vnd.google-apps.document'));
    assert.ok(calls[0].body.includes('Pauta da reunião'));
    assert.equal(r.link, 'https://docs/f1');
  });

  it('responde e-mail do Gmail na mesma conversa', async () => {
    replies = [
      { threadId: 't9', payload: { headers: [{ name: 'Subject', value: 'Proposta' }, { name: 'From', value: 'ana@cliente.com' }, { name: 'Message-ID', value: '<abc@x>' }] } },
      { id: 's1' },
    ];
    const r = await google.gmail_reply(ctx, { messageId: 'm1', body: 'Recebido.' });
    const sent = JSON.parse(calls[1].body);
    assert.equal(sent.threadId, 't9');
    const mime = Buffer.from(sent.raw, 'base64url').toString('utf8');
    assert.match(mime, /To: ana@cliente\.com/);
    assert.match(mime, /Subject: Re: Proposta/);
    assert.match(mime, /In-Reply-To: <abc@x>/);
    assert.equal(r.respondido, true);
  });
});

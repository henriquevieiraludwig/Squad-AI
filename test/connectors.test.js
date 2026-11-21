// Ações novas de Microsoft 365 e Google: confere o formato das chamadas com o fetch simulado.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { actions as ms } from '../server/connectors/microsoft.js';
import { actions as google, fileIdOf } from '../server/connectors/google.js';

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

describe('Google Planilhas, Documentos, Apresentações e Formulários', () => {
  const SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit#gid=0';

  it('aceita link ou ID do arquivo', () => {
    assert.equal(fileIdOf(SHEET), '1AbCdEfGhIjKlMnOp');
    assert.equal(fileIdOf('1AbCdEfGhIjKlMnOp'), '1AbCdEfGhIjKlMnOp');
    assert.throws(() => fileIdOf('planilha'));
  });

  it('cria planilha com cabeçalho e adiciona linhas', async () => {
    replies = [{ spreadsheetId: 'S1', spreadsheetUrl: 'https://sheets/S1' }, {}];
    const r = await google.sheets_create(ctx, { title: 'Leads', columns: 'Nome | E-mail | Data' });
    assert.equal(r.link, 'https://sheets/S1');
    assert.deepEqual(JSON.parse(calls[1].body).values, [['Nome', 'E-mail', 'Data']]);

    calls = [];
    replies = [{ updates: { updatedRange: 'Leads!A2:C3' } }];
    await google.sheets_append_rows(ctx, { spreadsheet: SHEET, rows: 'Ana | ana@x.com | 25/11\nBruno | b@x.com | 26/11', sheet: 'Leads' });
    assert.match(calls[0].url, /1AbCdEfGhIjKlMnOp\/values\/'Leads'!A1:append\?valueInputOption=USER_ENTERED/);
    assert.deepEqual(JSON.parse(calls[0].body).values, [['Ana', 'ana@x.com', '25/11'], ['Bruno', 'b@x.com', '26/11']]);
  });

  it('lê planilha', async () => {
    replies = [{ range: 'Página1!A1:B2', values: [['a', 'b'], ['c', 'd']] }];
    const r = await google.sheets_read(ctx, { spreadsheet: SHEET, range: '' });
    assert.match(calls[0].url, /values\/A1%3AZ200$/);
    assert.equal(r.linhas, 2);
  });

  it('lê e acrescenta texto no Google Docs', async () => {
    replies = [{ title: 'Ata', body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Pauta\n' } }] } }] } }];
    const r = await google.docs_read(ctx, { document: 'https://docs.google.com/document/d/1DocDocDocDoc/edit' });
    assert.equal(r.texto, 'Pauta');
    calls = [];
    replies = [{}];
    await google.docs_append_text(ctx, { document: '1DocDocDocDoc', text: 'Decisões' });
    assert.match(calls[0].url, /1DocDocDocDoc:batchUpdate$/);
    assert.ok(JSON.parse(calls[0].body).requests[0].insertText.endOfSegmentLocation);
  });

  it('cria apresentação com um slide por bloco', async () => {
    replies = [{ presentationId: 'P1', slides: [{ objectId: 'capa' }] }, {}];
    const r = await google.slides_create(ctx, { title: 'Resultados', slides: 'Vendas\n- Subiram 20%\n\nPróximos passos\n- Contratar' });
    const reqs = JSON.parse(calls[1].body).requests;
    assert.equal(reqs.filter((x) => x.createSlide).length, 2);
    assert.ok(reqs.some((x) => x.deleteObject?.objectId === 'capa'));
    assert.ok(reqs.some((x) => x.insertText?.text === 'Subiram 20%'));
    assert.equal(r.slides, 2);
  });

  it('cria formulário com pergunta aberta, múltipla escolha e obrigatória', async () => {
    replies = [{ formId: 'F1', responderUri: 'https://forms/F1/viewform' }, {}];
    const r = await google.forms_create(ctx, { title: 'Pesquisa', description: 'Rápida', questions: 'Seu nome *\nNota: 1 | 2 | 3' });
    const reqs = JSON.parse(calls[1].body).requests;
    const items = reqs.filter((x) => x.createItem).map((x) => x.createItem.item);
    assert.equal(items[0].questionItem.question.required, true);
    assert.equal(items[0].title, 'Seu nome');
    assert.deepEqual(items[1].questionItem.question.choiceQuestion.options.map((o) => o.value), ['1', '2', '3']);
    assert.equal(r.link_para_responder, 'https://forms/F1/viewform');
  });

  it('lê respostas do formulário com o título das perguntas', async () => {
    replies = [
      { info: { title: 'Pesquisa' }, items: [{ title: 'Nota', questionItem: { question: { questionId: 'q1' } } }] },
      { responses: [{ lastSubmittedTime: 't', answers: { q1: { textAnswers: { answers: [{ value: '3' }] } } } }] },
    ];
    const r = await google.forms_get_responses(ctx, { form: 'https://docs.google.com/forms/d/1FormFormForm/edit' });
    assert.deepEqual(r.respostas[0].respostas, { Nota: '3' });
  });
});

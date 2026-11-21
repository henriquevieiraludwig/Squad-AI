// Memória dos agentes e formatação das mensagens.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';
import { toPlainText, toWhatsApp, toTelegramBlocks, parseMessage } from '../shared/format.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 8)}`, name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
// Instruções fixas + avisos de sistema da conversa (onde ficam memória, canal e data).
const systemText = () => {
  const req = P.fakes.claude.requests.at(-1);
  const sys = [].concat(req.system).map((b) => (typeof b === 'string' ? b : b.text));
  const notes = req.messages.filter((m) => m.role === 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
  return [...sys, ...notes].join('\n');
};
const toolNames = () => (P.fakes.claude.requests.at(-1).tools || []).map((t) => t.name);

describe('memória do agente', () => {
  let ana; // proprietária
  let bia; // outra pessoa da mesma empresa
  let agentId;

  it('o agente guarda memórias geral e do contato pela ferramenta lembrar', async () => {
    ana = P.client();
    assert.equal((await ana.post('/api/auth/signup', { name: 'Ana', company: 'Loja Sol', email: 'ana@sol.com', password: 'senhaforte1' })).status, 201);
    agentId = (await ana.post('/api/agents', { name: 'Paulo', area: 'Atendimento' })).body.agent.id;

    P.fakes.claude.queue.push(
      toolUse('lembrar', { conteudo: 'A loja fecha às 18h aos sábados.', sobre: 'geral' }),
      toolUse('lembrar', { conteudo: 'Ana prefere ser chamada de Aninha.', sobre: 'contato' }),
      text('Anotado, **Aninha**! 😊'),
    );
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'Me chama de Aninha. E lembre que no sábado fechamos às 18h.' });
    assert.equal(r.status, 200);
    assert.equal(r.body.reply, 'Anotado, **Aninha**! 😊');
    assert.ok(toolNames().includes('lembrar') && toolNames().includes('esquecer'), 'ferramentas de memória sempre disponíveis');

    const mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    assert.equal(mem.length, 2);
    assert.deepEqual(mem.map((m) => m.scope).sort(), ['contato', 'geral']);
    assert.equal(mem.find((m) => m.scope === 'contato').contact, 'Ana');
  });

  it('numa conversa nova, o agente recebe a memória geral e a do contato', async () => {
    P.fakes.claude.queue.push(text('Olá!'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'Oi de novo' });
    const sys = systemText();
    assert.match(sys, /fecha às 18h aos sábados/);
    assert.match(sys, /Aninha/);
    assert.match(sys, /\*\*negrito\*\*/, 'instruções de formatação');
    assert.match(sys, /emojis/i, 'instruções de emoji');
  });

  it('as instruções fixas não mudam entre mensagens e o contexto só é reenviado quando muda', async () => {
    P.fakes.claude.queue.push(text('Um.'), text('Dois.'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'primeira' });
    const first = P.fakes.claude.requests.at(-1);
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'segunda', conversationId: (await ana.get(`/api/agents/${agentId}/chat`)).body.conversationId });
    const second = P.fakes.claude.requests.at(-1);
    assert.deepEqual(second.system, first.system, 'system idêntico');
    assert.equal(typeof second.system, 'string');
    assert.doesNotMatch(second.system, /Sua memória|Hoje é/, 'memória e data fora do system');
    // O histórico reenviado começa igual ao pedido anterior (mensagens já enviadas não mudam).
    assert.deepEqual(second.messages.slice(0, first.messages.length), first.messages);
    const countCtx = (req) => req.messages.filter((m) => m.role === 'system' && /Hoje é/.test(m.content)).length;
    assert.equal(countCtx(second), countCtx(first), 'contexto não repetido quando não mudou');
    assert.equal(second.thinking.block_binding.prefix_mismatch_behavior, 'drop_block');
  });

  it('a memória de um contato não aparece para outra pessoa', async () => {
    const { createToken } = await import('../server/routes/auth.js');
    const me = (await ana.get('/api/auth/me')).body.user;
    const { db } = await import('../server/db.js');
    const org = await db.get('SELECT partner_id FROM organizations WHERE id = $1', [me.orgId]);
    const raw = await createToken({ kind: 'convite', partnerId: org.partner_id, orgId: me.orgId, email: 'bia@sol.com', role: 'admin', ttlMs: 60_000 });
    bia = P.client();
    assert.equal((await bia.post(`/api/invites/${raw}/accept`, { name: 'Bia', password: 'senhaforte1' })).status, 201);

    P.fakes.claude.queue.push(text('Oi, Bia!'));
    await bia.post(`/api/agents/${agentId}/chat`, { message: 'Oi' });
    const sys = systemText();
    assert.match(sys, /fecha às 18h aos sábados/, 'memória geral vale para todos');
    assert.doesNotMatch(sys, /Aninha/, 'memória da Ana não aparece para a Bia');
  });

  it('o agente esquece e a equipe acrescenta e apaga memórias', async () => {
    const geral = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories.find((m) => m.scope === 'geral');
    P.fakes.claude.queue.push(toolUse('esquecer', { id: geral.id }), text('Esquecido.'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'Esqueça o horário de sábado.' });
    let mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    assert.ok(!mem.some((m) => m.id === geral.id));

    assert.equal((await ana.post(`/api/agents/${agentId}/memories`, { content: '' })).status, 400);
    const add = await ana.post(`/api/agents/${agentId}/memories`, { content: 'Frete grátis acima de R$ 200.' });
    assert.equal(add.status, 201);
    mem = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories;
    const added = mem.find((m) => m.id === add.body.id);
    assert.equal(added.source, 'equipe');
    assert.equal(added.createdBy, 'Ana');
    assert.equal((await ana.del(`/api/agents/${agentId}/memories/${add.body.id}`)).status, 200);
    assert.equal((await ana.del(`/api/agents/${agentId}/memories/${add.body.id}`)).status, 404);
  });

  it('continua uma conversa antiga pela caixa de conversas e o agente sabe com quem fala', async () => {
    const convId = (await ana.get(`/api/agents/${agentId}/chat`)).body.conversationId;
    // Começa outra conversa, deixando a anterior "antiga".
    P.fakes.claude.queue.push(text('Nova.'));
    await ana.post(`/api/agents/${agentId}/chat`, { message: 'outra conversa', newConversation: true });
    const detail = (await ana.get(`/api/conversations/${convId}`)).body.conversation;
    assert.equal(detail.canContinue, true);
    assert.equal(detail.agentId, agentId);

    P.fakes.claude.queue.push(text('Continuando!'));
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'voltei', conversationId: convId });
    assert.equal(r.body.conversationId, convId, 'continuou na mesma conversa');
    assert.match(systemText(), /conversando com Ana \(ana@sol\.com\)/);

    // Outra pessoa vê o histórico, mas não continua a conversa da Ana.
    assert.equal((await bia.get(`/api/conversations/${convId}`)).body.conversation.canContinue, false);
    P.fakes.claude.queue.push(text('Oi.'));
    const other = await bia.post(`/api/agents/${agentId}/chat`, { message: 'posso?', conversationId: convId });
    assert.notEqual(other.body.conversationId, convId);
  });

  it('lê anexos: imagem e PDF vão direto para o modelo, texto é extraído', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 teste').toString('base64')}`;
    const txt = `data:text/plain;base64,${Buffer.from('Faturamento de outubro: R$ 120 mil').toString('base64')}`;
    P.fakes.claude.queue.push(text('Li os arquivos.'));
    const r = await ana.post(`/api/agents/${agentId}/chat`, {
      message: 'Resuma estes arquivos',
      attachments: [
        { name: 'grafico.png', type: 'image/png', data: png },
        { name: 'contrato.pdf', type: 'application/pdf', data: pdf },
        { name: 'notas.txt', type: 'text/plain', data: txt },
      ],
    });
    assert.equal(r.status, 200);
    const req = P.fakes.claude.requests.at(-1);
    const last = [...req.messages].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));
    const types = last.content.map((b) => b.type);
    assert.deepEqual(types, ['text', 'image', 'document', 'text']);
    assert.match(last.content[0].text, /Resuma estes arquivos[\s\S]*Anexos: grafico\.png, contrato\.pdf, notas\.txt/);
    assert.equal(last.content[2].title, 'contrato.pdf');
    assert.match(last.content[3].text, /<arquivo nome="notas\.txt">[\s\S]*R\$ 120 mil/);

    // No histórico da conversa aparece o texto com a lista de anexos.
    const hist = (await ana.get(`/api/agents/${agentId}/chat`)).body.messages;
    assert.ok(hist.some((m) => m.role === 'user' && /📎 Anexos: grafico\.png/.test(m.text)));

    // Qualquer arquivo é aceito: Excel e PowerPoint viram texto; vídeo e formatos desconhecidos chegam como aviso.
    const JSZip = (await import('jszip')).default;
    const xl = new JSZip();
    xl.file('xl/workbook.xml', '<workbook><sheets><sheet name="Vendas" sheetId="1"/></sheets></workbook>');
    xl.file('xl/sharedStrings.xml', '<sst><si><t>Cliente</t></si><si><t>Total</t></si><si><t>Ana &amp; Cia</t></si></sst>');
    xl.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1500</v></c></row></sheetData></worksheet>');
    const pp = new JSZip();
    pp.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Resultados 2026</a:t></a:r></a:p><a:p><a:r><a:t>Crescemos 20%</a:t></a:r></a:p></p:sld>');
    const b64 = async (z) => (await z.generateAsync({ type: 'nodebuffer' })).toString('base64');
    P.fakes.claude.queue.push(text('Li tudo.'));
    const anyFiles = await ana.post(`/api/agents/${agentId}/chat`, {
      message: 'veja',
      attachments: [
        { name: 'vendas.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', data: `data:application/octet-stream;base64,${await b64(xl)}` },
        { name: 'apresentacao.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: `data:application/octet-stream;base64,${await b64(pp)}` },
        { name: 'reuniao.mp4', type: 'video/mp4', size: 52_000_000 },
        { name: 'backup.zip', type: 'application/zip', data: `data:application/zip;base64,${Buffer.from('PK').toString('base64')}` },
      ],
    });
    assert.equal(anyFiles.status, 200);
    const sent = JSON.stringify(P.fakes.claude.requests.at(-1).messages);
    assert.match(sent, /# Aba: Vendas/);
    assert.match(sent, /Cliente \| Total/);
    assert.match(sent, /Ana & Cia \| 1500/);
    assert.match(sent, /Resultados 2026[\s\S]*Crescemos 20%/);
    assert.match(sent, /reuniao\.mp4[\s\S]*não consegue assistir/);
    assert.match(sent, /backup\.zip[\s\S]*não é possível abrir este formato/);
    const many = await ana.post(`/api/agents/${agentId}/chat`, { message: 'x', attachments: Array.from({ length: 6 }, (_, i) => ({ name: `a${i}.txt`, type: 'text/plain', data: txt })) });
    assert.equal(many.status, 400);
  });

  it('outra empresa não vê nem apaga a memória', async () => {
    const out = P.client();
    await out.post('/api/auth/signup', { name: 'Zé', company: 'Outra', email: 'ze@outra.com', password: 'senhaforte1' });
    assert.equal((await out.get(`/api/agents/${agentId}/memories`)).status, 404);
    const any = (await ana.get(`/api/agents/${agentId}/memories`)).body.memories[0];
    assert.equal((await out.del(`/api/agents/${agentId}/memories/${any.id}`)).status, 404);
  });

  it('edita nome, área e status do agente', async () => {
    const r = await ana.put(`/api/agents/${agentId}`, { name: 'Paulo Agenda', area: 'Agendamento', status: 'publicado' });
    assert.equal(r.status, 200);
    assert.equal(r.body.agent.area, 'Agendamento');
    assert.equal(r.body.agent.status, 'publicado');
    assert.equal((await ana.put(`/api/agents/${agentId}`, { area: 'Inexistente' })).status, 400);
    assert.ok((await ana.get(`/api/agents/${agentId}`)).body.areas.includes('Agendamento'));
  });
});

describe('formatação das mensagens', () => {
  const msg = '## Resumo\nOlá **Ana**! Seu pedido *chegou* e o __prazo__ é amanhã 😊\n- **Item:** caneta\n1. Primeiro\n[site](https://x.com) e 2*3=6';

  it('tira as marcações no texto puro e mantém emojis e contas', () => {
    const t = toPlainText(msg);
    assert.ok(!t.includes('**') && !t.includes('__') && !t.includes('##'));
    assert.match(t, /😊/);
    assert.match(t, /2\*3=6/);
    assert.match(t, /• Item: caneta/);
  });

  it('gera o formato do WhatsApp e o HTML do Telegram', () => {
    assert.match(toWhatsApp(msg), /Olá \*Ana\*! Seu pedido _chegou_/);
    const tg = toTelegramBlocks(msg).join('\n');
    assert.match(tg, /<b>Ana<\/b>/);
    assert.match(tg, /<i>chegou<\/i>/);
    assert.match(tg, /<u>prazo<\/u>/);
    assert.match(tg, /<a href="https:\/\/x.com">site<\/a>/);
  });

  it('não confunde nomes com sublinhado e escapa HTML', () => {
    assert.equal(parseMessage('arquivo_final_v2.pdf')[0].segments.map((s) => s.text).join(''), 'arquivo_final_v2.pdf');
    assert.match(toTelegramBlocks('a < b & c')[0], /a &lt; b &amp; c/);
  });
});

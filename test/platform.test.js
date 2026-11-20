// Testes de ponta a ponta da API. Rodam em sequência e compartilham o estado.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';

let P;
const toolUse = (name, input, id = `toolu_${Math.random().toString(36).slice(2, 8)}`) => ({
  content: [{ type: 'tool_use', id, name, input }],
  stop_reason: 'tool_use',
});
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });

before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

describe('plataforma', () => {
  const owner = () => P.client();
  let ana; // proprietária da empresa no parceiro padrão
  let anaOrgAgent;

  it('responde a verificação de saúde e a marca padrão', async () => {
    const c = P.client();
    const health = await c.get('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    const brand = await c.get('/api/brand');
    assert.equal(brand.body.brand.name, 'Squad AI');
    assert.equal(brand.body.brand.allowSignup, true);
  });

  it('cadastra empresa, envia confirmação de e-mail e confirma', async () => {
    ana = owner();
    const r = await ana.post('/api/auth/signup', { name: 'Ana Souza', company: 'Casa Aurora', email: 'ana@aurora.com', password: 'senhaforte1' });
    assert.equal(r.status, 201);
    const me = await ana.get('/api/auth/me');
    assert.equal(me.body.user.role, 'owner');
    assert.equal(me.body.user.emailVerified, false);
    assert.ok(me.body.user.permissions.includes('configurar'));
    await P.drainJobs();
    const token = P.lastLink('ana@aurora.com', '/confirmar-email');
    assert.ok(token, 'e-mail de confirmação enviado');
    assert.equal((await ana.post('/api/auth/verify', { token })).status, 200);
    assert.equal((await ana.post('/api/auth/verify', { token })).status, 400, 'link não pode ser reutilizado');
    assert.equal((await ana.get('/api/auth/me')).body.user.emailVerified, true);
  });

  it('recusa e-mail duplicado e senha curta no cadastro', async () => {
    const c = P.client();
    const dup = await c.post('/api/auth/signup', { name: 'X', company: 'Y', email: 'ANA@aurora.com', password: 'senhaforte1' });
    assert.equal(dup.status, 409);
    const short = await c.post('/api/auth/signup', { name: 'X', company: 'Y', email: 'x@y.com', password: '123' });
    assert.equal(short.status, 400);
    assert.ok(short.body.fields.password);
  });

  it('redefine a senha e encerra as sessões antigas', async () => {
    const c = P.client();
    assert.equal((await c.post('/api/auth/login', { email: 'ana@aurora.com', password: 'errada123' })).status, 401);
    assert.equal((await c.post('/api/auth/forgot', { email: 'ana@aurora.com' })).status, 200);
    assert.equal((await c.post('/api/auth/forgot', { email: 'ninguem@aurora.com' })).status, 200, 'não revela se a conta existe');
    await P.drainJobs();
    const token = P.lastLink('ana@aurora.com', '/redefinir-senha');
    assert.ok(token);
    assert.equal((await c.post('/api/auth/reset', { token, password: 'novasenha99' })).status, 200);
    assert.equal((await ana.get('/api/auth/me')).body.user, null, 'sessão antiga encerrada');
    assert.equal((await ana.post('/api/auth/login', { email: 'ana@aurora.com', password: 'novasenha99' })).status, 200);
  });

  it('cria agente e aplica isolamento entre empresas', async () => {
    const r = await ana.post('/api/agents', { name: 'Agente Financeiro', area: 'Financeiro', roleDescription: 'Cuida de reembolsos.' });
    assert.equal(r.status, 201);
    anaOrgAgent = r.body.agent.id;

    const bruno = P.client();
    await bruno.post('/api/auth/signup', { name: 'Bruno', company: 'Outra Empresa', email: 'bruno@outra.com', password: 'senhaforte1' });
    assert.equal((await bruno.get(`/api/agents/${anaOrgAgent}`)).status, 404);
    assert.equal((await bruno.get('/api/agents')).body.agents.length, 0);
  });

  it('convida pessoas com papéis e aplica as permissões', async () => {
    const inv = await ana.post('/api/team/invites', { email: 'marcos@aurora.com', role: 'member' });
    assert.equal(inv.status, 201);
    await ana.post('/api/team/invites', { email: 'carla@aurora.com', role: 'approver' });
    await P.drainJobs();

    const marcos = P.client();
    const mt = P.lastLink('marcos@aurora.com', '/convite');
    const info = await marcos.get(`/api/invites/${mt}`);
    assert.equal(info.body.orgName, 'Casa Aurora');
    assert.equal((await marcos.post(`/api/invites/${mt}/accept`, { name: 'Marcos', password: 'senhaforte1' })).status, 201);
    assert.equal((await marcos.post('/api/agents', { name: 'X', area: 'Vendas' })).status, 403, 'membro não configura');
    assert.equal((await marcos.post('/api/team/invites', { email: 'z@aurora.com', role: 'member' })).status, 403);

    const carla = P.client();
    const ct = P.lastLink('carla@aurora.com', '/convite');
    await carla.post(`/api/invites/${ct}/accept`, { name: 'Carla', password: 'senhaforte1' });
    const team = await ana.get('/api/team');
    assert.equal(team.body.members.length, 3);
    P.marcos = marcos;
    P.carla = carla;
  });

  it('leva contexto da empresa e processos para o agente', async () => {
    const txt = Buffer.from('Reembolsos até R$ 300 são aprovados pelo gestor direto.').toString('base64');
    const up = await ana.post('/api/knowledge', { fileName: 'politica-reembolso.txt', data: txt });
    assert.equal(up.status, 201);
    assert.equal((await ana.post('/api/knowledge', { title: 'Tom de voz', text: 'Tratamos todos pelo primeiro nome.' })).status, 201);
    assert.equal((await ana.post('/api/knowledge', { fileName: 'planilha.xlsx', data: txt })).status, 400, 'formato não suportado');
    assert.equal((await P.marcos.post('/api/knowledge', { title: 'x', text: 'y' })).status, 403);

    const proc = await ana.post('/api/processes', {
      title: 'Reembolso de despesas',
      agentId: anaOrgAgent,
      trigger: 'Quando alguém pedir reembolso',
      steps: ['Pedir o recibo', 'Conferir o valor', 'Enviar ao Financeiro'],
      rules: 'Nunca aprovar acima de R$ 300 sem a diretoria.',
    });
    assert.equal(proc.status, 201);

    P.fakes.claude.queue.push(text('Pode deixar.'));
    const chat = await P.marcos.post(`/api/agents/${anaOrgAgent}/chat`, { message: 'Como peço reembolso?' });
    assert.equal(chat.status, 200, JSON.stringify(chat.body));
    const sys = P.fakes.claude.requests.at(-1).system;
    assert.match(sys, /Reembolsos até R\$ 300/);
    assert.match(sys, /primeiro nome/);
    assert.match(sys, /<processo titulo="Reembolso de despesas"/);
    assert.match(sys, /Nunca aprovar acima de R\$ 300/);
  });

  it('respeita o limite de espaço de contexto', async () => {
    const huge = 'a'.repeat(199_000);
    // Duas inserções grandes passam do limite padrão de 400 mil caracteres.
    assert.equal((await ana.post('/api/knowledge', { title: 'Grande 1', text: huge })).status, 201);
    assert.equal((await ana.post('/api/knowledge', { title: 'Grande 2', text: huge })).status, 201);
    const over = await ana.post('/api/knowledge', { title: 'Grande 3', text: huge });
    assert.equal(over.status, 402);
    const list = await ana.get('/api/knowledge');
    for (const d of list.body.docs.filter((d) => d.title.startsWith('Grande'))) await ana.del(`/api/knowledge/${d.id}`);
  });

  it('executa ações com aprovação humana, avisa aprovadores e impede decisão dupla', async () => {
    // Conecta um canal (Telegram) e libera o envio com aprovação.
    const tg = await ana.post('/api/integrations/telegram', { botToken: '123456789:ABCdefGHIjklMNOpqrSTUvwxyz' });
    assert.equal(tg.status, 201, JSON.stringify(tg.body));
    await ana.put(`/api/agents/${anaOrgAgent}/tools`, { actionId: 'telegram_send_message', mode: 'approval' });
    assert.equal((await P.marcos.put(`/api/agents/${anaOrgAgent}/tools`, { actionId: 'telegram_send_message', mode: 'auto' })).status, 403);

    P.fakes.claude.queue.push(toolUse('telegram_send_message', { chatId: '999', text: 'Seu reembolso foi aprovado.' }), text('Pedido registrado.'));
    const chat = await ana.post(`/api/agents/${anaOrgAgent}/chat`, { message: 'Avise o Bruno no Telegram' });
    assert.equal(chat.body.actions[0].status, 'pendente');
    const runId = chat.body.actions[0].id;

    await P.drainJobs();
    assert.ok(P.outbox.some((m) => m.to === 'ana@aurora.com' && /aguarda/.test(m.subject)), 'aprovadora avisada por e-mail');

    assert.equal((await P.marcos.post(`/api/approvals/${runId}`, { approve: true })).status, 403, 'membro não aprova');
    const ok = await P.carla.post(`/api/approvals/${runId}`, { approve: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'executada');
    assert.equal(P.fakes.telegram.sent.at(-1).text, 'Seu reembolso foi aprovado.');
    assert.equal((await P.carla.post(`/api/approvals/${runId}`, { approve: true })).status, 409);

    // A decisão chega ao agente no turno seguinte.
    P.fakes.claude.queue.push(text('Já foi enviado.'));
    await ana.post(`/api/agents/${anaOrgAgent}/chat`, { message: 'Foi enviado?', conversationId: chat.body.conversationId });
    const msgs = P.fakes.claude.requests.at(-1).messages;
    assert.ok(msgs.some((m) => m.role === 'system' && /foi aprovado e executado/.test(m.content)));
  });

  it('responde mensagens do Telegram pela fila e permite atendimento humano', async () => {
    const integ = await P.db.get(`SELECT webhook_key, webhook_secret FROM integrations WHERE provider = 'telegram'`);
    await ana.put('/api/channels/telegram', { agentId: anaOrgAgent });
    const path = `/api/webhooks/telegram/${integ.webhook_key}`;
    const post = (body) => P.raw('POST', path, body, { 'X-Telegram-Bot-Api-Secret-Token': integ.webhook_secret });

    // Sem o segredo, o webhook é recusado.
    assert.equal(await P.raw('POST', path, { message: { text: 'oi', chat: { id: 1 } } }), 404);

    assert.equal(await post({ message: { text: 'Quero meu reembolso', chat: { id: 555 }, from: { first_name: 'Joana' } } }), 200);
    P.fakes.claude.queue.push(text('Olá, Joana! Me envie o recibo.'));
    await P.drainJobs();
    assert.equal(P.fakes.telegram.sent.at(-1).text, 'Olá, Joana! Me envie o recibo.');
    assert.equal(P.fakes.telegram.sent.at(-1).chat_id, '555');

    const list = await ana.get('/api/conversations?channel=telegram');
    const conv = list.body.conversations[0];
    assert.equal(conv.contact, 'Joana');

    // Uma pessoa assume: o agente para de responder e a resposta humana sai pelo canal.
    assert.equal((await P.marcos.post(`/api/conversations/${conv.id}/takeover`)).status, 403);
    assert.equal((await P.carla.post(`/api/conversations/${conv.id}/takeover`)).status, 200);
    const before = P.fakes.claude.requests.length;
    await post({ message: { text: 'Mandei o recibo', chat: { id: 555 }, from: { first_name: 'Joana' } } });
    await P.drainJobs();
    assert.equal(P.fakes.claude.requests.length, before, 'agente não respondeu com humano no controle');
    assert.equal((await P.carla.post(`/api/conversations/${conv.id}/reply`, { text: 'Recebido, Joana!' })).status, 200);
    assert.equal(P.fakes.telegram.sent.at(-1).text, 'Recebido, Joana!');
    const detail = await ana.get(`/api/conversations/${conv.id}`);
    assert.deepEqual(
      detail.body.messages.map((m) => m.author),
      ['contato', 'agente', 'contato', 'humano'],
    );
    assert.equal((await P.carla.post(`/api/conversations/${conv.id}/release`)).status, 200);
  });

  it('mede o uso e bloqueia ao atingir o limite do plano', async () => {
    const usage = await ana.get('/api/usage');
    assert.ok(usage.body.month.messages >= 3);
    assert.ok(usage.body.month.inputTokens > 0);
    // Limite definido direto no banco (o console do parceiro é testado abaixo).
    await P.db.run(`UPDATE organizations SET limits = '{"messagesPerMonth": 1}' WHERE name = 'Casa Aurora'`);
    const blocked = await ana.post(`/api/agents/${anaOrgAgent}/chat`, { message: 'oi' });
    assert.equal(blocked.status, 402);
    await P.db.run(`UPDATE organizations SET limits = '{}' WHERE name = 'Casa Aurora'`);
  });

  it('white label: plataforma cria parceiro, parceiro configura marca e cria cliente no próprio domínio', async () => {
    // Administrador da plataforma (criado como pelo script create-admin).
    const { createToken } = await import('../server/routes/auth.js');
    const raw = await createToken({ kind: 'convite', partnerId: P.platform.id, email: 'admin@matriz.ai', role: 'partner_admin', ttlMs: 60_000 });
    const admin = P.client();
    assert.equal((await admin.post(`/api/invites/${raw}/accept`, { name: 'Admin', password: 'senhaforte1' })).status, 201);
    assert.equal((await admin.get('/api/auth/me')).body.user.isPlatformAdmin, true);
    assert.equal((await ana.get('/api/platform/partners')).status, 403);

    const created = await admin.post('/api/platform/partners', { name: 'Acme IA', slug: 'acme', adminEmail: 'dono@acme.com', domain: 'app.acme.test' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await P.drainJobs();

    // O convite do parceiro é aceito no domínio dele.
    const acmeAdmin = P.client('app.acme.test');
    const brand = await acmeAdmin.get('/api/brand');
    assert.equal(brand.body.brand.name, 'Acme IA');
    assert.equal(brand.body.brand.allowSignup, false);
    const tok = P.lastLink('dono@acme.com', '/convite');
    assert.ok(P.outbox.find((m) => m.to === 'dono@acme.com').text.includes('https://app.acme.test/convite'), 'link no domínio do parceiro');
    assert.equal((await acmeAdmin.post(`/api/invites/${tok}/accept`, { name: 'Dono Acme', password: 'senhaforte1' })).status, 201);
    const me = (await acmeAdmin.get('/api/auth/me')).body.user;
    assert.equal(me.isPartnerAdmin, true);
    assert.equal(me.isPlatformAdmin, false);

    // Cadastro aberto está desligado neste parceiro.
    assert.equal((await P.client('app.acme.test').post('/api/auth/signup', { name: 'X', company: 'Y', email: 'x@y.com', password: 'senhaforte1' })).status, 403);

    // Marca própria.
    const upd = await acmeAdmin.put('/api/partner/me/brand', { colors: { action: '#FFB703', dark: '#023047', accent: '#219EBC' }, supportEmail: 'suporte@acme.com' });
    assert.equal(upd.status, 200);
    assert.equal((await P.client('app.acme.test').get('/api/brand')).body.brand.colors.action, '#FFB703');
    assert.equal((await acmeAdmin.put('/api/partner/me/brand', { colors: { action: 'laranja' } })).status, 400);

    // O parceiro não acessa outro parceiro nem a plataforma.
    assert.equal((await acmeAdmin.get(`/api/partner/${P.platform.id}`)).status, 403);
    assert.equal((await acmeAdmin.get('/api/platform/partners')).status, 403);

    // Cliente do parceiro com limite próprio.
    const cl = await acmeAdmin.post('/api/partner/me/clients', { name: 'Padaria Sol', ownerEmail: 'joao@padaria.com', limits: { agents: 1 } });
    assert.equal(cl.status, 201);
    await P.drainJobs();
    const joao = P.client('app.acme.test');
    const jt = P.lastLink('joao@padaria.com', '/convite');
    assert.equal((await joao.post(`/api/invites/${jt}/accept`, { name: 'João', password: 'senhaforte1' })).status, 201);
    assert.equal((await joao.get('/api/auth/me')).body.user.role, 'owner');
    assert.equal((await joao.post('/api/agents', { name: 'Atendente', area: 'Atendimento' })).status, 201);
    assert.equal((await joao.post('/api/agents', { name: 'Outro', area: 'Vendas' })).status, 402, 'limite de agentes do plano');

    // A sessão de um domínio não vale em outro parceiro.
    const leak = P.client('plataforma.test');
    leak.cookie = joao.cookie;
    assert.equal((await leak.get('/api/auth/me')).body.user, null);
    // E o mesmo e-mail pode existir em parceiros diferentes.
    assert.equal((await P.client().post('/api/auth/signup', { name: 'João', company: 'Outra', email: 'joao@padaria.com', password: 'senhaforte1' })).status, 201);

    const clients = await acmeAdmin.get('/api/partner/me/clients');
    assert.equal(clients.body.clients.length, 1);
    assert.equal(clients.body.clients[0].agents, 1);

    // Suspender o cliente bloqueia o acesso dele.
    await acmeAdmin.put(`/api/partner/me/clients/${clients.body.clients[0].id}`, { status: 'suspensa' });
    assert.equal((await joao.get('/api/agents')).status, 403);

    // Exportação (só o proprietário) e exclusão definitiva pelo parceiro.
    await acmeAdmin.put(`/api/partner/me/clients/${clients.body.clients[0].id}`, { status: 'ativa' });
    const exp = await joao.get('/api/org/export');
    assert.equal(exp.status, 200);
    assert.equal(exp.body.organization.name, 'Padaria Sol');
    assert.equal(exp.body.agents.length, 1);
    const orgId = clients.body.clients[0].id;
    assert.equal((await acmeAdmin.del(`/api/partner/me/clients/${orgId}`)).status, 400, 'exige confirmação');
    assert.equal((await acmeAdmin.del(`/api/partner/me/clients/${orgId}`, { confirm: 'Padaria Sol' })).status, 200);
    assert.equal((await joao.get('/api/auth/me')).body.user, null, 'usuários do cliente excluídos');
    assert.equal((await acmeAdmin.get('/api/partner/me/clients')).body.clients.length, 0);

    // App OAuth próprio do parceiro: segredo nunca volta na resposta.
    assert.equal((await acmeAdmin.put('/api/partner/me/oauth/google', { clientId: 'acme-id', clientSecret: 'acme-secret' })).status, 200);
    const view = await acmeAdmin.get('/api/partner/me');
    assert.equal(view.body.partner.oauth.google.configured, true);
    assert.ok(!JSON.stringify(view.body).includes('acme-secret'));
  });
});

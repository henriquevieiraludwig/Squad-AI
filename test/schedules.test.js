// Tarefas agendadas: cálculo dos horários, telas, execução automática e criação pelo chat.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';
import { nextRunAt, describeSchedule } from '../server/schedules.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 8)}`, name, input }], stop_reason: 'tool_use' });
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });

describe('cálculo dos horários (Brasília)', () => {
  const sabado18h = new Date('2026-11-21T21:00:00Z');
  it('diário, dias úteis, semanal, mensal e uma vez', () => {
    assert.equal(nextRunAt({ frequency: 'diario', run_time: '08:00' }, sabado18h).toISOString(), '2026-11-22T11:00:00.000Z');
    assert.equal(nextRunAt({ frequency: 'dias_uteis', run_time: '08:00' }, sabado18h).toISOString(), '2026-11-23T11:00:00.000Z');
    assert.equal(nextRunAt({ frequency: 'semanal', run_time: '09:30', weekdays: [3] }, sabado18h).toISOString(), '2026-11-25T12:30:00.000Z');
    assert.equal(nextRunAt({ frequency: 'mensal', run_time: '10:00', day_of_month: 31 }, sabado18h).toISOString(), '2026-11-30T13:00:00.000Z');
    assert.equal(nextRunAt({ frequency: 'uma_vez', run_time: '17:00', run_date: '2026-11-21' }, sabado18h), null);
    assert.equal(nextRunAt({ frequency: 'diario', run_time: '19:00' }, sabado18h).toISOString(), '2026-11-21T22:00:00.000Z', 'hoje ainda');
    assert.equal(describeSchedule({ frequency: 'semanal', run_time: '09:00', weekdays: [1, 3] }), 'Toda segunda e quarta às 09:00');
  });
});

describe('tarefas agendadas', () => {
  let ana;
  let agentId;
  let scheduleId;

  it('cria, valida e lista', async () => {
    ana = P.client();
    await ana.post('/api/auth/signup', { name: 'Ana', company: 'Loja Sol', email: 'ana@sol.com', password: 'senhaforte1' });
    agentId = (await ana.post('/api/agents', { name: 'Paulo', area: 'Agendamento' })).body.agent.id;

    const bad = await ana.post('/api/schedules', { agentId, title: '', instruction: '', frequency: 'semanal', runTime: '25:00', weekdays: [] });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.fields.title && bad.body.fields.instruction && bad.body.fields.runTime && bad.body.fields.weekdays);

    const r = await ana.post('/api/schedules', {
      agentId,
      title: 'Resumo da agenda',
      instruction: 'Veja minha agenda do dia e me mande um resumo.',
      frequency: 'dias_uteis',
      runTime: '08:00',
      notifyEmail: true,
    });
    assert.equal(r.status, 201);
    scheduleId = r.body.schedule.id;
    assert.equal(r.body.schedule.description, 'Dias úteis (segunda a sexta) às 08:00');
    assert.ok(r.body.schedule.nextRunAt);
    const list = (await ana.get('/api/schedules')).body.schedules;
    assert.equal(list.length, 1);
    assert.equal(list[0].agentName, 'Paulo');
  });

  it('executa sozinho na hora marcada e registra o resultado', async () => {
    const { db } = await import('../server/db.js');
    const { enqueueDueSchedules } = await import('../server/schedules.js');
    await db.run(`UPDATE agent_schedules SET next_run_at = now() - interval '1 minute' WHERE id = $1`, [scheduleId]);
    P.fakes.claude.queue.push(text('Hoje você tem 2 reuniões 📅'));
    assert.equal(await enqueueDueSchedules(), 1);
    assert.equal(await enqueueDueSchedules(), 0, 'não executa duas vezes');
    await P.drainJobs();

    const req = P.fakes.claude.requests.at(-1);
    assert.match(JSON.stringify(req.messages), /Tarefa agendada \\"Resumo da agenda\\"/);
    assert.match(JSON.stringify(req.messages), /Execução automática de uma tarefa agendada/);

    const s = (await ana.get('/api/schedules')).body.schedules[0];
    assert.equal(s.lastStatus, 'ok');
    assert.equal(s.lastResult, 'Hoje você tem 2 reuniões 📅');
    assert.ok(new Date(s.nextRunAt) > new Date(), 'próxima execução recalculada');
    const conv = (await ana.get(`/api/conversations/${s.conversationId}`)).body.conversation;
    assert.equal(conv.channel, 'agendada');
    await P.drainJobs();
    const { outbox } = await import('../server/email.js');
    const mail = outbox.find((m) => m.to === 'ana@sol.com' && /Tarefa agendada: Resumo da agenda/.test(m.subject));
    assert.ok(mail, 'e-mail com o resultado enviado');
    assert.match(mail.text, /2 reuniões/);
  });

  it('dá para conversar com o agente na conversa da tarefa agendada', async () => {
    const s = (await ana.get('/api/schedules')).body.schedules[0];
    const convId = s.conversationId;
    // Mesmo que alguém tenha "assumido" a conversa antes, falar ali devolve o controle ao agente.
    const { db } = await import('../server/db.js');
    await db.run(`UPDATE conversations SET handled_by = 'humano' WHERE id = $1`, [convId]);
    const detail = (await ana.get(`/api/conversations/${convId}`)).body.conversation;
    assert.equal(detail.canContinue, true);
    assert.equal(detail.canReply, false, 'sem botões de assumir/devolver');

    P.fakes.claude.queue.push(text('Combinado, desmarco as duas.'));
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'Desmarque as reuniões com Claudio e Silvia', conversationId: convId });
    assert.equal(r.status, 200);
    assert.equal(r.body.conversationId, convId, 'continua na mesma conversa da tarefa');
    const sent = JSON.stringify(P.fakes.claude.requests.at(-1).messages);
    assert.match(sent, /conversando com Ana \(ana@sol\.com\)/);
    assert.match(sent, /uma pessoa da equipe está falando com você aqui/);
    assert.equal((await ana.get(`/api/conversations/${convId}`)).body.conversation.handledBy, 'agente');
  });

  it('executar agora, pausar e apagar', async () => {
    P.fakes.claude.queue.push(text('Feito.'));
    assert.equal((await ana.post(`/api/schedules/${scheduleId}/run`)).status, 200);
    await P.drainJobs();
    assert.equal((await ana.get('/api/schedules')).body.schedules[0].lastResult, 'Feito.');

    const paused = await ana.put(`/api/schedules/${scheduleId}`, { active: false });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.schedule.active, false);
    assert.equal(paused.body.schedule.nextRunAt, null);
    const resumed = await ana.put(`/api/schedules/${scheduleId}`, { active: true });
    assert.ok(resumed.body.schedule.nextRunAt);
  });

  it('o agente agenda pelo chat da equipe', async () => {
    P.fakes.claude.queue.push(
      toolUse('agendar_tarefa', { titulo: 'E-mails da semana', instrucao: 'Liste os e-mails não respondidos.', frequencia: 'semanal', horario: '09:00', dias_semana: [1] }),
      text('Agendado para toda segunda às 9h ✅'),
    );
    const r = await ana.post(`/api/agents/${agentId}/chat`, { message: 'Toda segunda às 9h me mande os e-mails não respondidos' });
    assert.equal(r.status, 200);
    assert.ok(r.body.actions.some((a) => a.label === 'Agendou: E-mails da semana'));
    const list = (await ana.get('/api/schedules')).body.schedules;
    const created = list.find((s) => s.title === 'E-mails da semana');
    assert.equal(created.description, 'Toda segunda às 09:00');
    assert.equal(created.createdBy, 'Ana');
  });

  it('outra empresa não vê nem mexe', async () => {
    const out = P.client();
    await out.post('/api/auth/signup', { name: 'Zé', company: 'Outra', email: 'ze@outra.com', password: 'senhaforte1' });
    assert.deepEqual((await out.get('/api/schedules')).body.schedules, []);
    assert.equal((await out.put(`/api/schedules/${scheduleId}`, { active: false })).status, 404);
    assert.equal((await out.post(`/api/schedules/${scheduleId}/run`)).status, 404);
    assert.equal((await out.del(`/api/schedules/${scheduleId}`)).status, 404);
    assert.equal((await out.post('/api/schedules', { agentId, title: 'x', instruction: 'y', frequency: 'diario', runTime: '08:00' })).status, 400);
    assert.equal((await ana.del(`/api/schedules/${scheduleId}`)).status, 200);
  });
});

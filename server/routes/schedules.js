// Tarefas agendadas dos agentes: listar, criar, editar, pausar, apagar e executar agora.
import { db, json } from '../db.js';
import { requireOrg } from '../auth.js';
import { enqueue } from '../jobs.js';
import { h } from './org.js';
import { validateSchedule, scheduleView, nextRunAt, createSchedule } from '../schedules.js';

const SELECT = `SELECT s.*, a.name AS agent_name, a.avatar AS agent_avatar, u.name AS created_by_name
                  FROM agent_schedules s JOIN agents a ON a.id = s.agent_id LEFT JOIN users u ON u.id = s.created_by`;

export function registerScheduleRoutes(app) {
  app.get('/api/schedules', requireOrg(), h(async (req, res) => {
    const agentId = Number(req.query.agente) || null;
    const rows = await db.all(`${SELECT} WHERE s.org_id = $1 ${agentId ? 'AND s.agent_id = $2' : ''} ORDER BY s.active DESC, s.next_run_at NULLS LAST, s.id DESC`, agentId ? [req.user.orgId, agentId] : [req.user.orgId]);
    res.json({ schedules: rows.map(scheduleView) });
  }));

  app.post('/api/schedules', requireOrg('configurar'), h(async (req, res) => {
    const agent = await db.get('SELECT id FROM agents WHERE id = $1 AND org_id = $2', [Number(req.body?.agentId), req.user.orgId]);
    const { fields, data } = validateSchedule(req.body);
    if (!agent) fields.agentId = 'Escolha o agente.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    const row = await createSchedule(req.user.orgId, agent.id, data, req.user.id);
    res.status(201).json({ schedule: scheduleView(await db.get(`${SELECT} WHERE s.id = $1`, [row.id])) });
  }));

  app.put('/api/schedules/:id', requireOrg('configurar'), h(async (req, res) => {
    const current = await db.get('SELECT * FROM agent_schedules WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!current) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    // Pausar/retomar sem mandar o resto.
    const body = Object.keys(req.body || {}).length === 1 && 'active' in req.body
      ? {
          title: current.title,
          instruction: current.instruction,
          frequency: current.frequency,
          runTime: current.run_time,
          weekdays: current.weekdays,
          dayOfMonth: current.day_of_month,
          runDate: current.run_date,
          notifyEmail: current.notify_email,
          agentId: current.agent_id,
          active: req.body.active,
        }
      : req.body;
    const agent = await db.get('SELECT id FROM agents WHERE id = $1 AND org_id = $2', [Number(body.agentId ?? current.agent_id), req.user.orgId]);
    const { fields, data } = validateSchedule(body);
    // Reativar uma tarefa "uma vez" que já passou exige uma data nova.
    if (!agent) fields.agentId = 'Escolha o agente.';
    if (Object.keys(fields).length) return res.status(400).json({ error: 'Revise os campos destacados.', fields });
    const next = data.active ? nextRunAt({ frequency: data.frequency, run_time: data.runTime, weekdays: data.weekdays, day_of_month: data.dayOfMonth, run_date: data.runDate }) : null;
    await db.run(
      `UPDATE agent_schedules SET agent_id = $3, title = $4, instruction = $5, frequency = $6, run_time = $7, weekdays = $8, day_of_month = $9,
              run_date = $10, notify_email = $11, active = $12, next_run_at = $13 WHERE id = $1 AND org_id = $2`,
      [current.id, req.user.orgId, agent.id, data.title, data.instruction, data.frequency, data.runTime, json(data.weekdays), data.dayOfMonth, data.runDate, data.notifyEmail, data.active, next],
    );
    res.json({ schedule: scheduleView(await db.get(`${SELECT} WHERE s.id = $1`, [current.id])) });
  }));

  app.delete('/api/schedules/:id', requireOrg('configurar'), h(async (req, res) => {
    const r = await db.get('DELETE FROM agent_schedules WHERE id = $1 AND org_id = $2 RETURNING id', [Number(req.params.id), req.user.orgId]);
    if (!r) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    res.json({ ok: true });
  }));

  // Executa agora, sem mudar o próximo horário.
  app.post('/api/schedules/:id/run', requireOrg('configurar'), h(async (req, res) => {
    const s = await db.get('SELECT id FROM agent_schedules WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!s) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    await enqueue('tarefa_agendada', { scheduleId: s.id });
    res.json({ ok: true });
  }));
}

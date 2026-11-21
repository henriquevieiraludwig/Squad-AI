// Tarefas agendadas: na hora marcada, o agente executa a instrução sozinho, com as ferramentas dele.
// Horários no fuso de Brasília (UTC-3, sem horário de verão desde 2019).
import { db, json } from './db.js';
import { enqueue } from './jobs.js';

import { FREQUENCIES, WEEKDAY_NAMES, nextRunAt, describeSchedule, validateSchedule } from '../shared/schedule.js';

export { FREQUENCIES, WEEKDAY_NAMES, nextRunAt, describeSchedule, validateSchedule };

export const scheduleView = (r) => ({
  id: r.id,
  agentId: r.agent_id,
  agentName: r.agent_name,
  agentAvatar: r.agent_avatar || null,
  title: r.title,
  instruction: r.instruction,
  frequency: r.frequency,
  runTime: r.run_time,
  weekdays: r.weekdays || [],
  dayOfMonth: r.day_of_month,
  runDate: r.run_date,
  notifyEmail: r.notify_email,
  active: r.active,
  description: describeSchedule(r),
  nextRunAt: r.active ? r.next_run_at : null,
  lastRunAt: r.last_run_at,
  lastStatus: r.last_status,
  lastResult: r.last_result,
  conversationId: r.conversation_id,
  createdBy: r.created_by_name || null,
});

export async function createSchedule(orgId, agentId, data, userId) {
  const next = data.active ? nextRunAt({ frequency: data.frequency, run_time: data.runTime, weekdays: data.weekdays, day_of_month: data.dayOfMonth, run_date: data.runDate }) : null;
  return db.get(
    `INSERT INTO agent_schedules (org_id, agent_id, title, instruction, frequency, run_time, weekdays, day_of_month, run_date, notify_email, active, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [orgId, agentId, data.title, data.instruction, data.frequency, data.runTime, json(data.weekdays), data.dayOfMonth, data.runDate, data.notifyEmail, data.active, next, userId],
  );
}

// Verifica as tarefas que chegaram na hora e coloca na fila. Cada uma é reservada (próxima execução
// já recalculada) antes de entrar na fila, então duas instâncias do servidor não executam a mesma.
export async function enqueueDueSchedules(now = new Date()) {
  const due = await db.all(
    `SELECT * FROM agent_schedules WHERE active = true AND next_run_at IS NOT NULL AND next_run_at <= $1 ORDER BY next_run_at LIMIT 20`,
    [now],
  );
  let count = 0;
  for (const s of due) {
    const next = nextRunAt(s, now);
    const claimed = await db.get(
      `UPDATE agent_schedules SET next_run_at = $2, active = $3 WHERE id = $1 AND next_run_at = $4 RETURNING id`,
      [s.id, next, s.frequency === 'uma_vez' ? false : s.active, s.next_run_at],
    );
    if (!claimed) continue;
    await enqueue('tarefa_agendada', { scheduleId: s.id });
    count++;
  }
  return count;
}

let timer = null;
export function startScheduler(intervalMs = 30_000) {
  const tick = () => enqueueDueSchedules().catch((err) => console.error('[agenda] erro ao verificar tarefas:', err.message));
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}

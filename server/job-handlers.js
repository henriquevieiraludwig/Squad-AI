// Tratadores das tarefas da fila.
import { db } from './db.js';
import { registerJob, enqueue } from './jobs.js';
import { partnerById } from './brand.js';
import { sendEmail, emailTemplates } from './email.js';
import { connectors, credentialsFor } from './connectors/index.js';
import { handleInbound, appendMessage, runAgent, findOrCreateConversation } from './agent/runtime.js';
import { describeSchedule } from './schedules.js';
import { toPlainText } from '../shared/format.js';
import { ACTION_BY_ID } from '../shared/catalog.js';

export function registerJobHandlers() {
  // Executa uma tarefa agendada: o agente recebe a instrução numa conversa só dessa tarefa (fica com o histórico).
  registerJob('tarefa_agendada', async ({ scheduleId }) => {
    const s = await db.get(
      `SELECT s.*, a.name AS agent_name, o.partner_id, u.email AS creator_email
         FROM agent_schedules s JOIN agents a ON a.id = s.agent_id JOIN organizations o ON o.id = s.org_id
         LEFT JOIN users u ON u.id = s.created_by WHERE s.id = $1`,
      [scheduleId],
    );
    if (!s) return;
    let ok = true;
    let result;
    let conversationId = null;
    try {
      conversationId = await findOrCreateConversation({
        orgId: s.org_id,
        agentId: s.agent_id,
        channel: 'agendada',
        externalId: `schedule:${s.id}`,
        contact: s.title,
      });
      const out = await runAgent({
        orgId: s.org_id,
        agentId: s.agent_id,
        conversationId,
        text: `Tarefa agendada "${s.title}" (${describeSchedule(s)}). Execute agora:\n\n${s.instruction}`,
        author: 'contato',
      });
      result = out.reply;
    } catch (err) {
      ok = false;
      result = err.message;
    }
    await db.run(`UPDATE agent_schedules SET last_run_at = now(), last_status = $2, last_result = $3, conversation_id = COALESCE($4, conversation_id) WHERE id = $1`, [
      s.id,
      ok ? 'ok' : 'erro',
      String(result || '').slice(0, 4000),
      conversationId,
    ]);
    if (s.notify_email && s.creator_email) {
      await enqueue('email', {
        partnerId: s.partner_id,
        to: s.creator_email,
        template: 'scheduled',
        args: [{ title: s.title, agentName: s.agent_name, result: toPlainText(result), ok, conversationId }],
      });
    }
  });

  registerJob('email', async ({ partnerId, to, template, args = [] }) => {
    const partner = await partnerById(partnerId);
    const templates = await emailTemplates(partner);
    await sendEmail(partner, { to, ...templates[template](...args) });
  });

  // Avisa aprovadores e administradores (com e-mail confirmado) que há uma ação pendente.
  registerJob('aviso_aprovacao', async ({ runId }) => {
    const run = await db.get(
      `SELECT r.action_id, r.status, r.org_id, a.name AS agent_name, o.name AS org_name, o.partner_id
         FROM action_runs r JOIN organizations o ON o.id = r.org_id LEFT JOIN agents a ON a.id = r.agent_id WHERE r.id = $1`,
      [runId],
    );
    if (!run || run.status !== 'pendente') return;
    const { count } = await db.get(`SELECT COUNT(*)::int AS count FROM action_runs WHERE org_id = $1 AND status = 'pendente'`, [run.org_id]);
    const people = await db.all(
      `SELECT email FROM users WHERE org_id = $1 AND role IN ('owner', 'admin', 'approver') AND email_verified_at IS NOT NULL`,
      [run.org_id],
    );
    const args = [{ orgName: run.org_name, agentName: run.agent_name || 'Um agente', label: ACTION_BY_ID[run.action_id]?.label || run.action_id, count }];
    for (const p of people) await enqueue('email', { partnerId: run.partner_id, to: p.email, template: 'approval', args });
  });

  // Mensagem automática para o contato (ex.: resultado de uma aprovação).
  registerJob('aviso_contato', async ({ orgId, conversationId, text }) => {
    const conv = await db.get('SELECT channel, external_id FROM conversations WHERE id = $1 AND org_id = $2', [conversationId, orgId]);
    if (!conv?.external_id || !connectors[conv.channel]?.reply) return;
    const creds = await credentialsFor(orgId, conv.channel);
    await connectors[conv.channel].reply(creds, conv.external_id, text);
    await appendMessage(conversationId, 'assistant', [{ type: 'text', text }], 'sistema');
  });

  registerJob('mensagem_recebida', async ({ integrationId, provider, msg }) => {
    const integ = await db.get('SELECT * FROM integrations WHERE id = $1', [integrationId]);
    if (!integ) return;
    await handleInbound(integ, provider, msg);
  });
}

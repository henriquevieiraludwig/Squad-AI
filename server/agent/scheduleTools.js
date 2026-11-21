// Ferramentas para o agente criar, listar e cancelar as próprias tarefas agendadas pelo chat.
// Só ficam disponíveis para alguém da equipe conversando pela plataforma (nunca para clientes nos canais).
import { db } from '../db.js';
import { validateSchedule, createSchedule, describeSchedule, WEEKDAY_NAMES } from '../schedules.js';

const TZ_NOTE = 'Horários no fuso de Brasília.';

export const SCHEDULE_TOOLS = [
  {
    name: 'agendar_tarefa',
    description: `Cria uma tarefa agendada para você (este agente) executar sozinho no horário marcado, com as suas ferramentas. Use quando a pessoa pedir algo recorrente ("toda segunda às 9h...", "todo dia às 8h...") ou para uma data futura ("amanhã às 15h, lembre..."). Confirme o horário e a frequência antes se o pedido estiver ambíguo. ${TZ_NOTE}`,
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Nome curto da tarefa.' },
        instrucao: { type: 'string', description: 'O que você deve fazer em cada execução, com todos os detalhes (para quem enviar, o que incluir).' },
        frequencia: { type: 'string', enum: ['uma_vez', 'diario', 'dias_uteis', 'semanal', 'mensal'] },
        horario: { type: 'string', description: 'Horário no formato HH:MM, ex.: 08:30.' },
        dias_semana: { type: 'array', items: { type: 'integer' }, description: 'Para semanal: 0=domingo, 1=segunda ... 6=sábado.' },
        dia_mes: { type: 'integer', description: 'Para mensal: dia do mês (1 a 31).' },
        data: { type: 'string', description: 'Para uma_vez: data no formato AAAA-MM-DD.' },
        avisar_email: { type: 'boolean', description: 'true para mandar o resultado por e-mail para a pessoa a cada execução.' },
      },
      required: ['titulo', 'instrucao', 'frequencia', 'horario'],
      additionalProperties: false,
    },
  },
  {
    name: 'listar_tarefas_agendadas',
    description: 'Lista as suas tarefas agendadas, com o número de cada uma.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cancelar_tarefa_agendada',
    description: 'Apaga uma das suas tarefas agendadas, pelo número (veja em listar_tarefas_agendadas).',
    input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false },
  },
];

export const SCHEDULE_TOOL_NAMES = new Set(SCHEDULE_TOOLS.map((t) => t.name));

const fmtWhen = (d) => (d ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(d)) : '—');

export async function runScheduleTool(ctx, block) {
  const base = { type: 'tool_result', tool_use_id: block.id };
  const input = block.input || {};
  if (block.name === 'agendar_tarefa') {
    const { fields, data } = validateSchedule({
      title: input.titulo,
      instruction: input.instrucao,
      frequency: input.frequencia,
      runTime: input.horario,
      weekdays: input.dias_semana,
      dayOfMonth: input.dia_mes,
      runDate: input.data,
      notifyEmail: input.avisar_email,
    });
    if (Object.keys(fields).length) return { result: { ...base, is_error: true, content: `Não deu para agendar: ${Object.values(fields).join(' ')}` } };
    const row = await createSchedule(ctx.orgId, ctx.agentId, data, ctx.userId);
    return {
      run: { id: `agenda-${row.id}`, label: `Agendou: ${row.title}`, status: 'executada', input },
      result: { ...base, content: `Tarefa agendada [${row.id}] criada: ${describeSchedule(row)}. Próxima execução: ${fmtWhen(row.next_run_at)}. Ela aparece em Tarefas agendadas, onde a equipe pode pausar ou editar.` },
    };
  }
  if (block.name === 'listar_tarefas_agendadas') {
    const rows = await db.all('SELECT * FROM agent_schedules WHERE org_id = $1 AND agent_id = $2 ORDER BY id', [ctx.orgId, ctx.agentId]);
    if (!rows.length) return { result: { ...base, content: 'Você não tem tarefas agendadas.' } };
    const lines = rows.map((r) => `[${r.id}] ${r.title} — ${describeSchedule(r)}${r.active ? `, próxima: ${fmtWhen(r.next_run_at)}` : ' (pausada)'}`);
    return { result: { ...base, content: lines.join('\n') } };
  }
  const r = await db.get('DELETE FROM agent_schedules WHERE id = $1 AND org_id = $2 AND agent_id = $3 RETURNING title', [Number(input.id), ctx.orgId, ctx.agentId]);
  return {
    run: r ? { id: `agenda-x-${input.id}`, label: `Cancelou: ${r.title}`, status: 'executada', input } : undefined,
    result: { ...base, ...(r ? { content: `Tarefa [${input.id}] "${r.title}" apagada.` } : { is_error: true, content: `Não encontrei a tarefa [${input.id}].` }) },
  };
}

export { WEEKDAY_NAMES };

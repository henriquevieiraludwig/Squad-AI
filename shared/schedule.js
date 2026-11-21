// Regras das tarefas agendadas (horários em Brasília). Usadas pelo servidor e pela demonstração.
export const FREQUENCIES = ['uma_vez', 'diario', 'dias_uteis', 'semanal', 'mensal'];
export const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const OFFSET_MIN = -180; // America/Sao_Paulo
const MS_MIN = 60_000;

// Data/hora "de parede" em Brasília <-> instante real.
const toLocal = (date) => new Date(date.getTime() + OFFSET_MIN * MS_MIN);
const fromLocal = (y, m, d, hh, mm) => new Date(Date.UTC(y, m, d, hh, mm) - OFFSET_MIN * MS_MIN);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

// Próxima execução depois de "after" (exclusivo). null quando não há mais (uma vez, já passou).
export function nextRunAt(s, after = new Date()) {
  const t = parseTime(s.run_time ?? s.runTime);
  if (!t) return null;
  const freq = s.frequency;
  if (freq === 'uma_vez') {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s.run_date ?? s.runDate ?? ''));
    if (!dm) return null;
    const at = fromLocal(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), t.hh, t.mm);
    return at > after ? at : null;
  }
  const weekdays = (s.weekdays || []).map(Number);
  const dom = Number(s.day_of_month ?? s.dayOfMonth) || 1;
  const local = toLocal(after);
  // Procura dia a dia, a partir de hoje, até 400 dias à frente.
  for (let i = 0; i < 400; i++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth();
    const d = day.getUTCDate();
    const wd = day.getUTCDay();
    let ok = false;
    if (freq === 'diario') ok = true;
    else if (freq === 'dias_uteis') ok = wd >= 1 && wd <= 5;
    else if (freq === 'semanal') ok = weekdays.includes(wd);
    else if (freq === 'mensal') ok = d === Math.min(dom, daysInMonth(y, m));
    if (!ok) continue;
    const at = fromLocal(y, m, d, t.hh, t.mm);
    if (at > after) return at;
  }
  return null;
}

// Frase curta: "Toda segunda e quarta às 09:00".
export function describeSchedule(s) {
  const time = s.run_time ?? s.runTime;
  const wds = (s.weekdays || []).map(Number).sort();
  switch (s.frequency) {
    case 'uma_vez': {
      const [y, m, d] = String(s.run_date ?? s.runDate ?? '').split('-');
      return `Uma vez, em ${d}/${m}/${y} às ${time}`;
    }
    case 'diario':
      return `Todo dia às ${time}`;
    case 'dias_uteis':
      return `Dias úteis (segunda a sexta) às ${time}`;
    case 'semanal': {
      const names = wds.map((w) => WEEKDAY_NAMES[w]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] || '';
      return `Toda ${list} às ${time}`;
    }
    case 'mensal':
      return `Todo dia ${s.day_of_month ?? s.dayOfMonth} do mês às ${time}`;
    default:
      return '';
  }
}

// Confere e normaliza os campos. Devolve { fields, data }.
export function validateSchedule(b = {}) {
  const fields = {};
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  const data = {
    title: clean(b.title, 120),
    instruction: clean(b.instruction, 4000),
    frequency: b.frequency,
    runTime: clean(b.runTime, 5),
    weekdays: [...new Set((Array.isArray(b.weekdays) ? b.weekdays : []).map(Number).filter((n) => n >= 0 && n <= 6))].sort(),
    dayOfMonth: b.dayOfMonth ? Math.min(31, Math.max(1, Number(b.dayOfMonth) || 1)) : null,
    runDate: clean(b.runDate, 10) || null,
    notifyEmail: Boolean(b.notifyEmail),
    active: b.active !== false,
  };
  if (!data.title) fields.title = 'Dê um nome à tarefa.';
  if (!data.instruction) fields.instruction = 'Diga o que o agente deve fazer.';
  if (!FREQUENCIES.includes(data.frequency)) fields.frequency = 'Escolha a frequência.';
  if (!parseTime(data.runTime)) fields.runTime = 'Informe o horário no formato 08:30.';
  if (data.frequency === 'semanal' && !data.weekdays.length) fields.weekdays = 'Escolha ao menos um dia da semana.';
  if (data.frequency === 'mensal' && !data.dayOfMonth) fields.dayOfMonth = 'Escolha o dia do mês.';
  if (data.frequency === 'uma_vez') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.runDate || '')) fields.runDate = 'Escolha a data.';
    else if (!nextRunAt({ frequency: 'uma_vez', run_time: data.runTime, run_date: data.runDate })) fields.runDate = 'Escolha uma data e hora no futuro.';
  }
  return { fields, data };
}


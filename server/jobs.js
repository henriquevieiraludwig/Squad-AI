// Fila de tarefas persistida no banco: sobrevive a reinícios e tenta de novo em caso de falha.
import { db, json } from './db.js';

const handlers = new Map();
const MAX_ATTEMPTS = 5;
let timer = null;
let running = 0;
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 4);

export function registerJob(kind, handler) {
  handlers.set(kind, handler);
}

export async function enqueue(kind, payload = {}, { delayMs = 0 } = {}) {
  const r = await db.get(`INSERT INTO jobs (kind, payload, run_at) VALUES ($1, $2, now() + ($3 || ' milliseconds')::interval) RETURNING id`, [
    kind,
    json(payload),
    String(delayMs),
  ]);
  if (timer) setImmediate(tick); // processa logo, sem esperar o próximo ciclo
  return r.id;
}

async function claim() {
  return db.get(
    `UPDATE jobs SET status = 'executando', attempts = attempts + 1, updated_at = now()
      WHERE id = (SELECT id FROM jobs WHERE status = 'pendente' AND run_at <= now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
  );
}

async function runOne(job) {
  const handler = handlers.get(job.kind);
  try {
    if (!handler) throw new Error(`Tarefa sem tratador: ${job.kind}`);
    await handler(job.payload);
    await db.run(`UPDATE jobs SET status = 'concluida', last_error = NULL, updated_at = now() WHERE id = $1`, [job.id]);
  } catch (err) {
    const final = job.attempts >= MAX_ATTEMPTS;
    const backoffMs = Math.min(60_000 * 2 ** (job.attempts - 1), 30 * 60_000);
    await db.run(
      `UPDATE jobs SET status = $2, last_error = $3, run_at = now() + ($4 || ' milliseconds')::interval, updated_at = now() WHERE id = $1`,
      [job.id, final ? 'falhou' : 'pendente', String(err.message).slice(0, 1000), String(backoffMs)],
    );
    console.error(`[fila] ${job.kind} #${job.id} falhou (tentativa ${job.attempts}):`, err.message);
  }
}

async function tick() {
  while (running < CONCURRENCY) {
    let job;
    try {
      job = await claim();
    } catch (err) {
      console.error('[fila] erro ao buscar tarefa:', err.message);
      return;
    }
    if (!job) return;
    running++;
    runOne(job).finally(() => {
      running--;
      setImmediate(tick);
    });
  }
}

export async function startWorker(intervalMs = 1000) {
  // Tarefas presas em "executando" por um reinício voltam para a fila.
  await db.run(`UPDATE jobs SET status = 'pendente' WHERE status = 'executando' AND updated_at < now() - interval '10 minutes'`);
  timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
}

export function stopWorker() {
  clearInterval(timer);
  timer = null;
}

// Usado nos testes: executa tudo o que estiver pendente, em sequência.
export async function drainJobs() {
  for (let i = 0; i < 100; i++) {
    const job = await claim();
    if (!job) return;
    await runOne(job);
  }
}

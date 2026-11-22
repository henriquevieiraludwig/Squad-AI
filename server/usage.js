// Medição de uso e limites por empresa (definidos pelo parceiro).
import { db } from './db.js';
import { mergeSettings } from './brand.js';
import { costUsd } from '../shared/pricing.js';

export class LimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 402;
  }
}

// Empresa do dono da plataforma (tem um administrador do parceiro padrão como membro): sem limites de
// agentes, pessoas e mensagens. O espaço de contexto continua limitado (é o que cabe na leitura do modelo).
export const UNLIMITED = 1_000_000_000;

export async function limitsFor(orgId) {
  const row = await db.get(
    `SELECT o.limits, p.settings,
            EXISTS (SELECT 1 FROM users u JOIN partners pp ON pp.id = u.partner_id
                     WHERE u.org_id = o.id AND u.is_partner_admin AND pp.is_default) AS platform_owner
       FROM organizations o JOIN partners p ON p.id = o.partner_id WHERE o.id = $1`,
    [orgId],
  );
  const defaults = mergeSettings(row?.settings).defaultLimits;
  const limits = { ...defaults, ...(row?.limits || {}) };
  if (row?.platform_owner) return { ...limits, agents: UNLIMITED, members: UNLIMITED, messagesPerMonth: UNLIMITED, unlimited: true };
  return limits;
}

export async function monthUsage(orgId) {
  return db.get(
    `SELECT COUNT(*)::int AS turns,
            COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
            COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
            COALESCE(SUM(cache_read_tokens), 0)::int AS cache_read_tokens
       FROM usage_events WHERE org_id = $1 AND created_at >= date_trunc('month', now())`,
    [orgId],
  );
}

export async function orgCounts(orgId) {
  return db.get(
    `SELECT (SELECT COUNT(*)::int FROM agents WHERE org_id = $1) AS agents,
            (SELECT COUNT(*)::int FROM users WHERE org_id = $1) AS members,
            (SELECT COUNT(*)::int FROM tokens WHERE org_id = $1 AND kind = 'convite' AND used_at IS NULL AND expires_at > now()) AS invites,
            (SELECT COALESCE(SUM(chars), 0)::int FROM knowledge_docs WHERE org_id = $1) AS knowledge_chars`,
    [orgId],
  );
}

export async function usageSummary(orgId) {
  const [limits, usage, counts] = await Promise.all([limitsFor(orgId), monthUsage(orgId), orgCounts(orgId)]);
  return {
    limits,
    month: {
      messages: usage.turns,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_tokens,
    },
    counts: { agents: counts.agents, members: counts.members + counts.invites, knowledgeChars: counts.knowledge_chars },
  };
}

export async function assertCanAddAgent(orgId) {
  const [limits, counts] = await Promise.all([limitsFor(orgId), orgCounts(orgId)]);
  if (counts.agents >= limits.agents) throw new LimitError(`O plano permite até ${limits.agents} agentes. Fale com o suporte para ampliar.`);
}

export async function assertCanAddMember(orgId) {
  const [limits, counts] = await Promise.all([limitsFor(orgId), orgCounts(orgId)]);
  if (counts.members + counts.invites >= limits.members) {
    throw new LimitError(`O plano permite até ${limits.members} pessoas na equipe, contando convites pendentes.`);
  }
}

export async function assertKnowledgeRoom(orgId, extraChars) {
  const [limits, counts] = await Promise.all([limitsFor(orgId), orgCounts(orgId)]);
  if (counts.knowledge_chars + extraChars > limits.knowledgeChars) {
    const free = Math.max(0, limits.knowledgeChars - counts.knowledge_chars);
    throw new LimitError(
      `Este conteúdo não cabe no espaço de contexto do plano (restam ${free.toLocaleString('pt-BR')} caracteres). Remova documentos antigos ou fale com o suporte.`,
    );
  }
}

export async function assertCanRunAgent(orgId) {
  const [limits, usage] = await Promise.all([limitsFor(orgId), monthUsage(orgId)]);
  if (usage.turns >= limits.messagesPerMonth) {
    throw new LimitError(`A empresa atingiu o limite de ${limits.messagesPerMonth.toLocaleString('pt-BR')} mensagens do mês. Fale com o suporte para ampliar.`);
  }
}

export async function recordUsage({ orgId, agentId, conversationId, channel, model, totals }) {
  await db.run(
    `INSERT INTO usage_events (org_id, agent_id, conversation_id, channel, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [orgId, agentId, conversationId, channel, model, totals.input, totals.output, totals.cacheRead, totals.cacheWrite],
  );
}

// Relatório de consumo da API do Claude: custo estimado por dia, por agente e por canal.
export async function usageReport(orgId, days = 30) {
  const d = Math.min(Math.max(Number(days) || 30, 1), 365);
  const rows = await db.all(
    `SELECT to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day, e.agent_id, a.name AS agent_name, e.channel, e.model,
            COUNT(*)::int AS turns, SUM(e.input_tokens)::int AS input, SUM(e.output_tokens)::int AS output,
            SUM(e.cache_read_tokens)::int AS cache_read, SUM(e.cache_write_tokens)::int AS cache_write
       FROM usage_events e LEFT JOIN agents a ON a.id = e.agent_id
      WHERE e.org_id = $1 AND e.created_at >= now() - ($2 || ' days')::interval
      GROUP BY 1, 2, 3, 4, 5`,
    [orgId, String(d)],
  );
  const total = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  const byDay = new Map();
  const byAgent = new Map();
  const byChannel = new Map();
  const add = (map, key, base, r, cost) => {
    const x = map.get(key) || { ...base, turns: 0, tokens: 0, cost: 0 };
    x.turns += r.turns;
    x.tokens += r.input + r.output + r.cache_read + r.cache_write;
    x.cost += cost;
    map.set(key, x);
  };
  for (const r of rows) {
    const cost = costUsd(r.model, { input: r.input, output: r.output, cacheRead: r.cache_read, cacheWrite: r.cache_write });
    total.turns += r.turns;
    total.input += r.input;
    total.output += r.output;
    total.cacheRead += r.cache_read;
    total.cacheWrite += r.cache_write;
    total.cost += cost;
    add(byDay, r.day, { day: r.day }, r, cost);
    add(byAgent, r.agent_id ?? 0, { agentId: r.agent_id, name: r.agent_name || 'Agente removido' }, r, cost);
    add(byChannel, r.channel, { channel: r.channel }, r, cost);
  }
  // Série diária completa (dias sem uso aparecem com zero).
  const series = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
  for (let i = d - 1; i >= 0; i--) {
    const day = fmt.format(new Date(Date.now() - i * 86400000));
    series.push(byDay.get(day) || { day, turns: 0, tokens: 0, cost: 0 });
  }
  const sortCost = (m) => [...m.values()].sort((a, b) => b.cost - a.cost);
  return { days: d, total, series, byAgent: sortCost(byAgent), byChannel: sortCost(byChannel), currency: 'USD' };
}

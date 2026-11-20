// Medição de uso e limites por empresa (definidos pelo parceiro).
import { db } from './db.js';
import { mergeSettings } from './brand.js';

export class LimitError extends Error {
  constructor(message) {
    super(message);
    this.status = 402;
  }
}

export async function limitsFor(orgId) {
  const row = await db.get(
    `SELECT o.limits, p.settings FROM organizations o JOIN partners p ON p.id = o.partner_id WHERE o.id = $1`,
    [orgId],
  );
  const defaults = mergeSettings(row?.settings).defaultLimits;
  return { ...defaults, ...(row?.limits || {}) };
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

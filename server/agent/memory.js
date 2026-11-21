// Memória dos agentes: o que o agente aprende nas conversas e guarda para as próximas.
// - Geral: vale para todas as conversas do agente (ex.: "O cliente prefere receber orçamentos por e-mail").
// - Do contato: só aparece nas conversas com aquela pessoa (ex.: "A Joana é a responsável pelo financeiro").
import { db } from '../db.js';

export const MEMORY_MAX_CHARS = 300;
const GENERAL_LIMIT = 40;
const CONTACT_LIMIT = 20;

// Identifica a pessoa da conversa: o número/ID no canal ou, no teste, o nome de quem conversa.
export const contactKeyFor = (conv) => (conv ? `${conv.channel}:${conv.external_id || conv.contact_label || ''}` : null);

export async function memoriesFor(agentId, contactKey) {
  const [general, contact] = await Promise.all([
    db.all(
      'SELECT id, content FROM agent_memories WHERE agent_id = $1 AND contact_key IS NULL ORDER BY id DESC LIMIT $2',
      [agentId, GENERAL_LIMIT],
    ),
    contactKey
      ? db.all(
          'SELECT id, content FROM agent_memories WHERE agent_id = $1 AND contact_key = $2 ORDER BY id DESC LIMIT $3',
          [agentId, contactKey, CONTACT_LIMIT],
        )
      : [],
  ]);
  return { general: general.reverse(), contact: contact.reverse() };
}

export function memoryPromptBlock({ general, contact }) {
  if (!general.length && !contact.length) {
    return 'Sua memória ainda está vazia. Use a ferramenta lembrar quando aprender algo útil para as próximas conversas.';
  }
  const fmt = (list) => list.map((m) => `- [${m.id}] ${m.content}`).join('\n');
  return [
    'Sua memória (o que você guardou em conversas anteriores). Use com naturalidade, sem dizer que está consultando uma memória:',
    general.length ? `Geral:\n${fmt(general)}` : '',
    contact.length ? `Sobre a pessoa desta conversa:\n${fmt(contact)}` : '',
    'Se algo da memória estiver desatualizado ou a pessoa pedir para esquecer, use a ferramenta esquecer com o número entre colchetes.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function saveMemory({ orgId, agentId, contactKey = null, contactLabel = '', content, source = 'agente', userId = null }) {
  const text = String(content || '').trim().slice(0, MEMORY_MAX_CHARS);
  if (!text) return null;
  // Não guarda a mesma frase duas vezes.
  const dup = await db.get(
    'SELECT id FROM agent_memories WHERE agent_id = $1 AND content = $2 AND contact_key IS NOT DISTINCT FROM $3',
    [agentId, text, contactKey],
  );
  if (dup) return dup.id;
  const row = await db.get(
    `INSERT INTO agent_memories (org_id, agent_id, contact_key, contact_label, content, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [orgId, agentId, contactKey, contactLabel || '', text, source, userId],
  );
  return row.id;
}

export async function deleteMemory({ orgId, agentId, id }) {
  const row = await db.get('DELETE FROM agent_memories WHERE id = $1 AND org_id = $2 AND agent_id = $3 RETURNING id', [Number(id), orgId, agentId]);
  return Boolean(row);
}

// Ferramentas sempre disponíveis para o agente (não dependem de integrações).
export const MEMORY_TOOLS = [
  {
    name: 'lembrar',
    description:
      'Guarda uma informação útil para conversas futuras: preferências, dados que a pessoa pediu para lembrar, combinados e fatos sobre o trabalho. Escreva uma frase curta e autossuficiente. Não guarde senhas, números de cartão, documentos pessoais nem dados de saúde.',
    input_schema: {
      type: 'object',
      properties: {
        conteudo: { type: 'string', description: `O que guardar, em uma frase (até ${MEMORY_MAX_CHARS} caracteres).` },
        sobre: {
          type: 'string',
          enum: ['contato', 'geral'],
          description: 'contato: só vale para a pessoa desta conversa. geral: vale para todas as conversas deste agente.',
        },
      },
      required: ['conteudo', 'sobre'],
      additionalProperties: false,
    },
  },
  {
    name: 'esquecer',
    description: 'Apaga uma informação da memória, pelo número que aparece entre colchetes na memória.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'Número da memória a apagar.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

// Executa lembrar/esquecer. Devolve o tool_result.
export async function runMemoryTool(ctx, block) {
  const base = { type: 'tool_result', tool_use_id: block.id };
  const input = block.input || {};
  if (block.name === 'lembrar') {
    const toContact = input.sobre === 'contato' && ctx.contactKey;
    const id = await saveMemory({
      orgId: ctx.orgId,
      agentId: ctx.agentId,
      contactKey: toContact ? ctx.contactKey : null,
      contactLabel: toContact ? ctx.contactLabel : '',
      content: input.conteudo,
    });
    if (!id) return { ...base, is_error: true, content: 'Nada para guardar.' };
    return { ...base, content: `Guardado na memória [${id}].` };
  }
  const ok = await deleteMemory({ orgId: ctx.orgId, agentId: ctx.agentId, id: input.id });
  return { ...base, content: ok ? `Memória [${input.id}] apagada.` : `Não encontrei a memória [${input.id}].` };
}

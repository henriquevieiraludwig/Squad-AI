// Contexto da empresa e processos: extração de texto dos arquivos e montagem do
// bloco de conhecimento que os agentes recebem.
import { db } from './db.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DOC_CHARS = 200_000;

export class ExtractError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

const normalize = (text) =>
  String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function extractText(fileName, buffer) {
  const ext = String(fileName).toLowerCase().split('.').pop();
  if (buffer.length > MAX_FILE_BYTES) throw new ExtractError('O arquivo passa de 10 MB. Divida em partes menores.');
  let text;
  if (['txt', 'md', 'csv'].includes(ext)) {
    text = buffer.toString('utf8');
  } else if (ext === 'pdf') {
    const { extractText: pdfText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const out = await pdfText(pdf, { mergePages: true });
    text = Array.isArray(out.text) ? out.text.join('\n\n') : out.text;
  } else if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const out = await (mammoth.default || mammoth).extractRawText({ buffer });
    text = out.value;
  } else {
    throw new ExtractError('Formato não suportado. Envie PDF, DOCX, TXT, MD ou CSV.');
  }
  text = normalize(text);
  if (!text) throw new ExtractError('Não encontramos texto neste arquivo. Se for um PDF escaneado, envie uma versão com texto selecionável.');
  if (text.length > MAX_DOC_CHARS) throw new ExtractError(`O documento tem mais de ${MAX_DOC_CHARS.toLocaleString('pt-BR')} caracteres. Envie só as partes que os agentes precisam.`);
  return text;
}

const attr = (s) => String(s).replace(/"/g, "'");

// Bloco de conhecimento do agente: documentos da empresa e processos (do agente ou de todos).
export async function knowledgeFor(orgId, agentId) {
  const [docs, processes, agents] = await Promise.all([
    db.all('SELECT title, content FROM knowledge_docs WHERE org_id = $1 ORDER BY id', [orgId]),
    // Processos do agente, de todos, ou em que ele é responsável por alguma etapa.
    db.all(
      `SELECT title, trigger, steps, step_agents, rules, agent_id FROM processes
        WHERE org_id = $1 AND active = true AND (agent_id IS NULL OR agent_id = $2 OR step_agents @> $3::jsonb) ORDER BY id`,
      [orgId, agentId, JSON.stringify([agentId])],
    ),
    db.all('SELECT id, name, area FROM agents WHERE org_id = $1', [orgId]),
  ]);
  if (!docs.length && !processes.length) return '';
  const nameOf = Object.fromEntries(agents.map((a) => [a.id, a.name]));

  const parts = [];
  if (docs.length) {
    parts.push('<contexto_da_empresa>');
    for (const d of docs) parts.push(`<documento titulo="${attr(d.title)}">\n${d.content}\n</documento>`);
    parts.push('</contexto_da_empresa>');
  }
  if (processes.length) {
    parts.push('<processos>');
    for (const p of processes) {
      const owners = p.step_agents || [];
      const multi = owners.some((o) => o && o !== agentId);
      const steps = (p.steps || [])
        .map((s, i) => {
          const o = owners[i];
          const who = o ? (o === agentId ? ' (responsável: você)' : ` (responsável: ${nameOf[o] || 'outro agente'})`) : '';
          return `${i + 1}. ${s}${who}`;
        })
        .join('\n');
      const handoff = multi
        ? '\nEste processo tem etapas de outros agentes. Faça as suas etapas e, quando chegar a vez de outro agente, use a ferramenta passar_tarefa com o nome dele e tudo o que ele precisa para continuar; depois use o resultado para seguir.'
        : '';
      parts.push(
        `<processo titulo="${attr(p.title)}"${p.trigger ? ` quando_usar="${attr(p.trigger)}"` : ''}>\n${steps}${p.rules ? `\nRegras obrigatórias: ${p.rules}` : ''}${handoff}\n</processo>`,
      );
    }
    parts.push('</processos>');
  }
  return parts.join('\n');
}

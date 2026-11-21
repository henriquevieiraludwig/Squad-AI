// Anexos nas conversas com o agente: imagens e PDFs vão direto para o modelo (ele lê o conteúdo visual);
// Word, TXT, CSV, Markdown e JSON viram texto antes.
import { extractText, ExtractError } from '../knowledge.js';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite da API para imagens
const MAX_TEXT_CHARS = 100_000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export class AttachmentError extends Error {}

const attr = (s) => String(s).replace(/["<>]/g, "'");

// Lê "data:tipo;base64,...". Devolve { type, base64, bytes }.
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) throw new AttachmentError('Não foi possível ler um dos anexos.');
  const base64 = m[2].replace(/\s/g, '');
  return { type: (m[1] || '').toLowerCase(), base64, bytes: Math.floor((base64.length * 3) / 4) };
}

// Monta o conteúdo da mensagem do usuário: texto + anexos, no formato da API do Claude.
export async function buildUserContent(text, attachments = []) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return text;
  if (list.length > MAX_FILES) throw new AttachmentError(`Envie no máximo ${MAX_FILES} arquivos por mensagem.`);

  const names = list.map((a) => String(a?.name || 'arquivo').slice(0, 120));
  const blocks = [{ type: 'text', text: `${text || 'Veja os arquivos anexados.'}\n\n📎 Anexos: ${names.join(', ')}` }];

  for (let i = 0; i < list.length; i++) {
    const name = names[i];
    const { type: dataType, base64, bytes } = parseDataUrl(list[i].data);
    const type = String(list[i].type || dataType).toLowerCase();
    if (bytes > MAX_FILE_BYTES) throw new AttachmentError(`O arquivo ${name} passa de 10 MB.`);
    const ext = name.toLowerCase().split('.').pop();

    if (IMAGE_TYPES.includes(type)) {
      if (bytes > MAX_IMAGE_BYTES) throw new AttachmentError(`A imagem ${name} passa de 5 MB.`);
      blocks.push({ type: 'image', source: { type: 'base64', media_type: type, data: base64 } });
    } else if (type === 'application/pdf' || ext === 'pdf') {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: name });
    } else {
      let content;
      try {
        const buffer = Buffer.from(base64, 'base64');
        content = ext === 'json' ? buffer.toString('utf8') : await extractText(ext === 'json' ? `${name}.txt` : name, buffer);
      } catch (err) {
        if (err instanceof ExtractError) throw new AttachmentError(`${name}: ${err.message.replace('Envie PDF, DOCX, TXT, MD ou CSV.', 'Envie imagem, PDF, Word, TXT, CSV ou Markdown.')}`);
        throw err;
      }
      blocks.push({ type: 'text', text: `<arquivo nome="${attr(name)}">\n${content.slice(0, MAX_TEXT_CHARS)}\n</arquivo>` });
    }
  }
  return blocks;
}

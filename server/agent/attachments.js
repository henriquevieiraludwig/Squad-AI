// Anexos nas conversas com o agente. Aceita qualquer arquivo:
// - imagens e PDFs vão direto para o modelo (ele lê o conteúdo visual);
// - Word, Excel, PowerPoint, CSV, TXT, JSON, XML, HTML e código viram texto;
// - vídeo, áudio e formatos que não dá para abrir chegam como aviso (nome, tipo, tamanho), para o agente saber que existem.
import { extractText, ExtractError } from '../knowledge.js';
import { xlsxToText, pptxToText } from './officeText.js';

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // limite da API para imagens
const MAX_TEXT_CHARS = 100_000;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'xml', 'html', 'htm', 'yml', 'yaml', 'log', 'ini', 'sql', 'js', 'ts', 'py', 'java', 'rb', 'php', 'css', 'vcf', 'ics', 'srt', 'vtt']);
const sizeLabel = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Aviso para o modelo quando o conteúdo não pode ser lido.
function notice(name, type, bytes, reason) {
  return { type: 'text', text: `<arquivo nome="${attr(name)}" tipo="${attr(type || 'desconhecido')}" tamanho="${sizeLabel(bytes || 0)}">\n${reason}\n</arquivo>` };
}

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
    const ext = name.toLowerCase().split('.').pop();
    const declaredType = String(list[i].type || '').toLowerCase();

    // Vídeo, áudio ou arquivo grande demais: chega só o aviso (o navegador nem envia o conteúdo).
    if (!list[i].data) {
      const media = /^(video|audio)\//.test(declaredType);
      blocks.push(
        notice(
          name,
          declaredType,
          Number(list[i].size) || 0,
          media
            ? 'A pessoa anexou este arquivo de vídeo/áudio. Você não consegue assistir nem ouvir o conteúdo: diga isso com naturalidade e peça um resumo ou a transcrição se precisar.'
            : 'A pessoa anexou este arquivo, mas ele é grande demais para ser lido aqui. Peça a parte que interessa ou um resumo.',
        ),
      );
      continue;
    }

    const { type: dataType, base64, bytes } = parseDataUrl(list[i].data);
    const type = declaredType || dataType;
    if (bytes > MAX_FILE_BYTES) throw new AttachmentError(`O arquivo ${name} passa de 10 MB.`);
    const buffer = () => Buffer.from(base64, 'base64');
    const asText = (content) => ({ type: 'text', text: `<arquivo nome="${attr(name)}">\n${String(content).slice(0, MAX_TEXT_CHARS)}\n</arquivo>` });

    try {
      if (IMAGE_TYPES.includes(type)) {
        if (bytes > MAX_IMAGE_BYTES) throw new AttachmentError(`A imagem ${name} passa de 5 MB.`);
        blocks.push({ type: 'image', source: { type: 'base64', media_type: type, data: base64 } });
      } else if (type === 'application/pdf' || ext === 'pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 }, title: name });
      } else if (ext === 'docx') {
        blocks.push(asText(await extractText(name, buffer())));
      } else if (ext === 'xlsx' || ext === 'xlsm') {
        blocks.push(asText(await xlsxToText(buffer())));
      } else if (ext === 'pptx') {
        blocks.push(asText(await pptxToText(buffer())));
      } else if (TEXT_EXT.has(ext) || type.startsWith('text/') || /json|xml|javascript/.test(type)) {
        blocks.push(asText(buffer().toString('utf8')));
      } else if (/^(video|audio)\//.test(type)) {
        blocks.push(notice(name, type, bytes, 'A pessoa anexou este arquivo de vídeo/áudio. Você não consegue assistir nem ouvir o conteúdo: diga isso com naturalidade e peça um resumo ou a transcrição se precisar.'));
      } else {
        const hint = ext === 'xls' ? ' (planilha do Excel antigo: peça para salvar como .xlsx ou CSV)' : ext === 'doc' ? ' (Word antigo: peça para salvar como .docx ou PDF)' : ext === 'ppt' ? ' (PowerPoint antigo: peça para salvar como .pptx ou PDF)' : '';
        blocks.push(notice(name, type, bytes, `A pessoa anexou este arquivo, mas não é possível abrir este formato${hint}. Diga isso e peça o conteúdo em outro formato se precisar.`));
      }
    } catch (err) {
      if (err instanceof AttachmentError) throw err;
      const msg = err instanceof ExtractError ? err.message : 'não foi possível ler o conteúdo';
      blocks.push(notice(name, type, bytes, `A pessoa anexou este arquivo, mas ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`));
    }
  }
  return blocks;
}

// Texto de planilhas (.xlsx) e apresentações (.pptx), lendo os arquivos XML de dentro do pacote do Office.
import JSZip from 'jszip';

const decode = (s) =>
  String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

const textsOf = (xml, tag) => [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => decode(m[1]));

// Coluna "AB" -> índice 27 (começando em 0).
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;

export async function xlsxToText(buffer, { maxRows = 500, maxChars = 100_000 } = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const shared = [];
  const sst = zip.file('xl/sharedStrings.xml');
  if (sst) {
    const xml = await sst.async('string');
    for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textsOf(si[1], 't').join(''));
  }
  // Nomes das abas, na ordem do arquivo.
  const wb = zip.file('xl/workbook.xml') ? await zip.file('xl/workbook.xml').async('string') : '';
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => decode(m[1]));
  const sheetFiles = Object.keys(zip.files)
    .filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));

  const out = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const xml = await zip.file(sheetFiles[i]).async('string');
    const rows = [];
    for (const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const inner = c[2] || '';
        const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
        const type = (attrs.match(/t="(\w+)"/) || [])[1];
        let value = '';
        if (type === 's') value = shared[Number((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1])] ?? '';
        else if (type === 'inlineStr') value = textsOf(inner, 't').join('');
        else value = decode((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] ?? '');
        if (ref) cells[colIndex(ref)] = value;
        else cells.push(value);
      }
      if (cells.some((v) => String(v ?? '').trim())) rows.push(Array.from(cells, (v) => v ?? '').join(' | '));
      if (rows.length >= maxRows) break;
    }
    out.push(`# Aba: ${names[i] || `Planilha ${i + 1}`}\n${rows.join('\n') || '(vazia)'}`);
    if (out.join('\n').length > maxChars) break;
  }
  return out.join('\n\n').slice(0, maxChars);
}

export async function pptxToText(buffer, { maxChars = 100_000 } = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/)[1]) - Number(b.match(/(\d+)\.xml$/)[1]));
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(slides[i]).async('string');
    const paras = [...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((p) => textsOf(p[1], 'a:t').join('')).filter((t) => t.trim());
    out.push(`# Slide ${i + 1}\n${paras.join('\n')}`);
  }
  return out.join('\n\n').slice(0, maxChars);
}

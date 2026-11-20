import { it } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from '../server/knowledge.js';

// Gera um PDF mínimo válido com uma linha de texto.
function tinyPdf(text) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

it('extrai texto de PDF, TXT e recusa formatos sem suporte', async () => {
  assert.match(await extractText('politica.pdf', tinyPdf('Reembolso ate 300 reais')), /Reembolso ate 300 reais/);
  assert.equal(await extractText('nota.md', Buffer.from('# Título\r\n\r\n\r\n\r\nTexto')), '# Título\n\nTexto');
  await assert.rejects(() => extractText('foto.png', Buffer.from('x')), /Formato não suportado/);
  await assert.rejects(() => extractText('vazio.txt', Buffer.from('   ')), /Não encontramos texto/);
});

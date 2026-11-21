// Formatação das mensagens dos agentes.
// O agente escreve com marcações simples: **negrito**, *itálico*, __sublinhado__, listas com "- " e links [texto](url).
// Aqui elas viram blocos com trechos estilizados, para a tela (sem asteriscos aparecendo) e para cada canal.

const INLINE =
  /\*\*(?!\s)([^\n]+?)(?<!\s)\*\*|__(?!\s)([^\n]+?)(?<!\s)__|(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])|(?<![\w])_(?![\s_])([^_\n]+?)(?<![\s_])_(?![\w])|~~([^~\n]+)~~|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

// Divide uma linha em trechos { text, b, i, u, href }.
export function parseInline(line, style = {}) {
  const out = [];
  let last = 0;
  // Uma cópia da expressão por chamada: os trechos internos são lidos com chamadas recursivas.
  const re = new RegExp(INLINE.source, 'g');
  const src = String(line);
  let m;
  while ((m = re.exec(src))) {
    const end = m.index + m[0].length;
    if (m.index > last) out.push({ ...style, text: src.slice(last, m.index) });
    const [, bold, under, italA, italB, strike, code, linkText, href] = m;
    const inner = (text, add) => parseInline(text, { ...style, ...add });
    if (bold !== undefined) out.push(...inner(bold, { b: true }));
    else if (under !== undefined) out.push(...inner(under, { u: true }));
    else if (italA !== undefined || italB !== undefined) out.push(...inner(italA ?? italB, { i: true }));
    else if (strike !== undefined) out.push({ ...style, text: strike });
    else if (code !== undefined) out.push({ ...style, text: code });
    else if (linkText !== undefined) out.push({ ...style, text: linkText, href });
    last = end;
    re.lastIndex = end;
  }
  if (last < src.length) out.push({ ...style, text: src.slice(last) });
  // Asteriscos e marcações soltas que sobraram não aparecem.
  return out
    .map((s) => ({
      ...s,
      text: s.text
        .replace(/\*{2,}/g, '')
        .replace(/(^|\s)\*(?=\S)/g, '$1')
        .replace(/(\S)\*(?=\s|$|[.,!?;:)])/g, '$1')
        .replace(/(^|\s)#{1,6}\s/g, '$1'),
    }))
    .filter((s) => s.text);
}

// Divide o texto em blocos: parágrafos, itens de lista e títulos (exibidos em negrito).
export function parseMessage(text) {
  const blocks = [];
  for (const raw of String(text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      blocks.push({ type: 'gap' });
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) continue; // linha divisória
    let m;
    if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) blocks.push({ type: 'p', segments: parseInline(m[1], { b: true }) });
    else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) blocks.push({ type: 'li', segments: parseInline(m[1]) });
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) blocks.push({ type: 'oli', num: m[1], segments: parseInline(m[2]) });
    else blocks.push({ type: 'p', segments: parseInline(line) });
  }
  // Tira espaços em branco repetidos e nas pontas.
  return blocks.filter((b, i, arr) => b.type !== 'gap' || (i > 0 && i < arr.length - 1 && arr[i - 1].type !== 'gap'));
}

const linkSuffix = (s) => (s.href && s.href !== s.text ? ` (${s.href})` : '');

// Texto puro, sem nenhuma marcação.
export function toPlainText(text) {
  return parseMessage(text)
    .map((b) => {
      const t = (b.segments || []).map((s) => s.text + linkSuffix(s)).join('');
      if (b.type === 'gap') return '';
      if (b.type === 'li') return `• ${t}`;
      if (b.type === 'oli') return `${b.num}. ${t}`;
      return t;
    })
    .join('\n');
}

// WhatsApp: *negrito* e _itálico_ (não tem sublinhado).
export function toWhatsApp(text) {
  const seg = (s) => {
    let t = s.text;
    const lead = t.match(/^\s*/)[0];
    const trail = t.match(/\s*$/)[0];
    t = t.trim();
    if (!t) return s.text;
    if (s.i) t = `_${t}_`;
    if (s.b) t = `*${t}*`;
    return lead + t + trail + linkSuffix(s);
  };
  return parseMessage(text)
    .map((b) => {
      if (b.type === 'gap') return '';
      const t = b.segments.map(seg).join('');
      if (b.type === 'li') return `• ${t}`;
      if (b.type === 'oli') return `${b.num}. ${t}`;
      return t;
    })
    .join('\n');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Telegram (parse_mode HTML): <b>, <i>, <u> e links. Devolve uma lista de blocos já em HTML.
export function toTelegramBlocks(text) {
  const seg = (s) => {
    let t = esc(s.text);
    if (s.u) t = `<u>${t}</u>`;
    if (s.i) t = `<i>${t}</i>`;
    if (s.b) t = `<b>${t}</b>`;
    if (s.href) t = `<a href="${esc(s.href)}">${t}</a>`;
    return t;
  };
  return parseMessage(text).map((b) => {
    if (b.type === 'gap') return '';
    const t = b.segments.map(seg).join('');
    if (b.type === 'li') return `• ${t}`;
    if (b.type === 'oli') return `${b.num}. ${t}`;
    return t;
  });
}

// Junta linhas em partes de até "max" caracteres, sem cortar uma linha (e suas tags) no meio.
export function chunkLines(lines, max = 3800) {
  const parts = [];
  let cur = '';
  for (const line of lines) {
    const piece = line.length > max ? line.slice(0, max) : line;
    if (cur && cur.length + piece.length + 1 > max) {
      parts.push(cur);
      cur = piece;
    } else cur = cur ? `${cur}\n${piece}` : piece;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

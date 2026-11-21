import { Fragment } from 'react';
import { parseMessage } from '../../shared/format.js';

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

// Link solto vira um texto curto e clicável: "google.com/calendar/…".
function shortUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    const first = path.split('/').filter(Boolean)[0];
    return `${u.hostname.replace(/^www\./, '')}${first ? `/${first}` : ''}${path.split('/').filter(Boolean).length > 1 || u.search ? '/…' : ''}`;
  } catch {
    return url;
  }
}

function withLinks(text) {
  const parts = String(text).split(URL_RE);
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 ? (
      <a key={i} href={p} target="_blank" rel="noopener noreferrer" title={p}>
        {shortUrl(p)}
      </a>
    ) : (
      p
    ),
  );
}

// Mostra a mensagem do agente com negrito, itálico, sublinhado, listas e links, sem as marcações aparecendo.
function Segments({ segments }) {
  return segments.map((s, i) => {
    let node = s.href ? s.text : withLinks(s.text);
    if (s.u) node = <u>{node}</u>;
    if (s.i) node = <em>{node}</em>;
    if (s.b) node = <strong>{node}</strong>;
    if (s.href)
      node = (
        <a href={s.href} target="_blank" rel="noopener noreferrer">
          {node}
        </a>
      );
    return <Fragment key={i}>{node}</Fragment>;
  });
}

export default function FormattedText({ text, className = 'fmt' }) {
  const blocks = parseMessage(text);
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(list.ordered ? <ol key={out.length}>{list.items}</ol> : <ul key={out.length}>{list.items}</ul>);
    list = null;
  };
  blocks.forEach((b, i) => {
    if (b.type === 'li' || b.type === 'oli') {
      const ordered = b.type === 'oli';
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(
        <li key={i} value={ordered ? Number(b.num) : undefined}>
          <Segments segments={b.segments} />
        </li>,
      );
      return;
    }
    flush();
    if (b.type === 'gap') return;
    out.push(
      <p key={i}>
        <Segments segments={b.segments} />
      </p>,
    );
  });
  flush();
  return <div className={className}>{out}</div>;
}

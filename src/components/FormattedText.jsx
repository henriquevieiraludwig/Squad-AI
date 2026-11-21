import { Fragment } from 'react';
import { parseMessage } from '../../shared/format.js';

// Mostra a mensagem do agente com negrito, itálico, sublinhado, listas e links, sem as marcações aparecendo.
function Segments({ segments }) {
  return segments.map((s, i) => {
    let node = s.text;
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

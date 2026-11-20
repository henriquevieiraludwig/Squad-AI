import { useMemo } from 'react';

// Portal quadrado de lâminas de alumínio verde, em perspectiva isométrica,
// iluminado pela esquerda sobre fundo verde-floresta. Cada lâmina é um anel
// quadrado com espessura; a sequência de lâminas forma o túnel do portal.
const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const project = ([x, y, z]) => [(x - y) * COS, (x + y) * SIN - z];
const poly = (pts) => pts.map((p) => project(p).map((n) => n.toFixed(1)).join(',')).join(' ');

function buildBlades({ count = 8, outer = 190, inner = 104, gap = 24, thickness = 9 }) {
  const o = outer / 2;
  const i = inner / 2;
  const zi0 = (outer - inner) / 2;
  const zi1 = zi0 + inner;
  const blades = [];
  // Da lâmina mais distante (y menor) para a mais próxima, para a sobreposição ficar correta.
  for (let k = 0; k < count; k++) {
    const y0 = k * gap - ((count - 1) * gap) / 2;
    const y1 = y0 + thickness;
    const front = (y) => ({
      outer: [[-o, y, 0], [o, y, 0], [o, y, outer], [-o, y, outer]],
      inner: [[-i, y, zi0], [i, y, zi0], [i, y, zi1], [-i, y, zi1]],
    });
    const f = front(y1);
    blades.push({
      key: k,
      // Faces externas visíveis: topo (z = outer) e lateral direita (x = +o)
      top: poly([[-o, y0, outer], [o, y0, outer], [o, y1, outer], [-o, y1, outer]]),
      right: poly([[o, y0, 0], [o, y1, 0], [o, y1, outer], [o, y0, outer]]),
      // Faces internas vistas pela abertura: parede esquerda (x = -i) e piso (z = zi0)
      innerLeft: poly([[-i, y0, zi0], [-i, y1, zi0], [-i, y1, zi1], [-i, y0, zi1]]),
      innerFloor: poly([[-i, y0, zi0], [i, y0, zi0], [i, y1, zi0], [-i, y1, zi0]]),
      frontPath: `M${poly(f.outer).replace(/ /g, ' L')} Z M${poly(f.inner).replace(/ /g, ' L')} Z`,
    });
  }
  // Limites para o viewBox
  const corners = [];
  for (const x of [-o, o]) for (const y of [-(count * gap) / 2 - 10, (count * gap) / 2 + 10]) for (const z of [0, outer]) corners.push(project([x, y, z]));
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { blades, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)] };
}

export default function PortalArt({ className = '', label = 'Escultura de um portal quadrado formado por lâminas verdes em perspectiva' }) {
  const { blades, box } = useMemo(() => buildBlades({}), []);
  const pad = 70;
  const vb = [box[0] - pad, box[1] - pad, box[2] + pad * 2, box[3] + pad * 2];

  return (
    <div className={`portal ${className}`} role="img" aria-label={label}>
      <svg viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="pa-front" x1="0" y1="0" x2="1" y2="0.35">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--lime) 45%, var(--leaf))' }} />
            <stop offset="0.45" style={{ stopColor: 'var(--leaf)' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 45%, var(--forest))' }} />
          </linearGradient>
          <linearGradient id="pa-top" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--lime) 70%, white)' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--lime) 65%, var(--leaf))' }} />
          </linearGradient>
          <linearGradient id="pa-right" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 40%, var(--forest))' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--forest) 85%, black)' }} />
          </linearGradient>
          <linearGradient id="pa-inner-left" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 60%, var(--forest))' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 30%, var(--forest))' }} />
          </linearGradient>
          <linearGradient id="pa-floor" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 80%, var(--lime))' }} />
            <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--leaf) 60%, var(--forest))' }} />
          </linearGradient>
        </defs>
        <ellipse cx={box[0] + box[2] / 2} cy={box[1] + box[3] - 18} rx={box[2] * 0.48} ry="26" style={{ fill: 'color-mix(in srgb, var(--forest) 60%, black)' }} opacity="0.55" />
        {blades.map((b, idx) => (
          <g key={b.key} className="portal-blade" style={{ animationDelay: `${0.08 * idx}s` }}>
            <polygon points={b.innerFloor} fill="url(#pa-floor)" />
            <polygon points={b.innerLeft} fill="url(#pa-inner-left)" />
            <polygon points={b.right} fill="url(#pa-right)" />
            <polygon points={b.top} fill="url(#pa-top)" />
            <path d={b.frontPath} fill="url(#pa-front)" fillRule="evenodd" style={{ stroke: 'var(--lime)' }} strokeOpacity="0.18" strokeWidth="0.8" />
          </g>
        ))}
      </svg>
    </div>
  );
}

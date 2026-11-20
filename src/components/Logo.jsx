import { Link } from 'react-router-dom';

// Marca do Ofício (página de processo) aplicada à paleta da Matriz AI: quadrado verde-lima, traço escuro.
export function OficioMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--lime)" />
      <path d="M9 7h10l4 4v14H9z" fill="none" stroke="var(--forest)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12.5 15h7M12.5 19h5" stroke="var(--forest)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// M geométrico da Matriz AI, usado na assinatura "da matriz.ai".
export function MatrizMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="var(--lime)" />
      <path d="M6 17.5V6.5l6 6 6-6v11" fill="none" stroke="var(--forest)" strokeWidth="2.4" strokeLinejoin="miter" strokeLinecap="square" />
    </svg>
  );
}

export function Endorsement({ onDark = false }) {
  return (
    <span className="endorse" style={{ color: onDark ? 'var(--on-dark-soft)' : 'var(--ink-faint)' }}>
      uma solução
      <MatrizMark />
      <strong style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)' }}>matriz.ai</strong>
    </span>
  );
}

export default function Logo({ to = '/', onDark = false }) {
  return (
    <Link to={to} className="logo" aria-label="Ofício, página inicial" style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)' }}>
      <OficioMark />
      <span>Ofício</span>
    </Link>
  );
}

import { Link } from 'react-router-dom';

// Marca do Squad AI: três agentes conectados (o "squad"), em traço escuro sobre o quadrado verde-lima da Matriz AI.
export function SquadMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--lime)" />
      <path d="M16 10.5 10 21h12z" fill="none" stroke="var(--forest)" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="16" cy="10" r="3.4" fill="var(--forest)" />
      <circle cx="9.8" cy="21.4" r="3.4" fill="var(--forest)" />
      <circle cx="22.2" cy="21.4" r="3.4" fill="var(--forest)" />
    </svg>
  );
}

// M geométrico da Matriz AI, usado na assinatura "uma solução matriz.ai".
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
    <Link to={to} className="logo" aria-label="Squad AI, página inicial" style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)' }}>
      <SquadMark />
      <span>Squad AI</span>
    </Link>
  );
}

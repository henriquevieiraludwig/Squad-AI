import { Link } from 'react-router-dom';
import { useBrand } from '../brand.jsx';

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

// Assinatura no rodapé. Na plataforma: "por zadok". Nos parceiros, só se eles quiserem mostrar.
export function Endorsement({ onDark = false }) {
  const brand = useBrand();
  if (!brand.isPlatform) {
    if (!brand.showPoweredBy) return null;
    return (
      <span className="endorse" style={{ color: onDark ? 'var(--on-dark-soft)' : 'var(--ink-faint)' }}>
        tecnologia
        <SquadMark size={18} />
        <strong style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)' }}>Squad AI</strong>
      </span>
    );
  }
  return (
    <span className="endorse" style={{ color: onDark ? 'var(--on-dark-soft)' : 'var(--ink-faint)' }}>
      por
      <strong style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)', fontWeight: 600 }}>
        zad<span style={{ color: onDark ? 'var(--lime)' : 'var(--leaf)' }}>o</span>k
      </strong>
    </span>
  );
}

// Monograma para parceiros sem logotipo: inicial da marca sobre a cor de ação.
function Monogram({ name, size = 30 }) {
  return (
    <span className="logo-mono" style={{ width: size, height: size }} aria-hidden="true">
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

export function BrandMark({ size = 30 }) {
  const brand = useBrand();
  if (brand.logo) return <img src={brand.logo} alt="" className="logo-img" style={{ height: size, maxWidth: size * 4 }} />;
  if (brand.isPlatform) return <SquadMark size={size} />;
  return <Monogram name={brand.name} size={size} />;
}

export default function Logo({ to = '/', onDark = false }) {
  const brand = useBrand();
  // Logotipo enviado pelo parceiro costuma já trazer o nome; nesse caso não repetimos.
  const showName = !brand.logo;
  return (
    <Link to={to} className="logo" aria-label={`${brand.name}, página inicial`} style={{ color: onDark ? 'var(--on-dark)' : 'var(--ink)' }}>
      <BrandMark />
      {showName && <span>{brand.name}</span>}
    </Link>
  );
}

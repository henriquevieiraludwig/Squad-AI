import Logo, { Endorsement } from './Logo.jsx';
import HeroTeam from './HeroTeam.jsx';
import { useBrand } from '../brand.jsx';
import '../pages/auth.css';

// Formulário compacto em área clara, arte em painel escuro ao lado.
export default function AuthLayout({ children, aside }) {
  const brand = useBrand();
  return (
    <div className="auth">
      <main className="auth-main">
        <div className="auth-top">
          <Logo />
        </div>
        <div className="auth-card">{children}</div>
        <div className="auth-foot">
          <Endorsement />
        </div>
      </main>
      <aside className="auth-aside" aria-label={`Sobre o ${brand.name}`}>
        <div className="auth-art">
          <HeroTeam />
        </div>
        <div className="auth-aside-body">{aside}</div>
      </aside>
    </div>
  );
}

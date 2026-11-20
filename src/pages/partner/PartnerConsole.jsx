// Console do parceiro (white label) e, para a equipe da plataforma, gestão de todos os parceiros.
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import Logo from '../../components/Logo.jsx';
import { IconBuilding, IconBrush, IconGlobe, IconKey, IconTeam, IconMenu, IconAgent } from '../../components/Icons.jsx';
import { useAuth } from '../../auth.jsx';
import { api } from '../../api.js';
import { Clients, BrandSettings, Domains, OAuthApps, PartnerTeam } from './PartnerViews.jsx';
import Partners from './Partners.jsx';
import '../platform.css';
import './partner.css';

export default function PartnerConsole() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((text, kind = 'success') => setToast({ text, kind }), []);

  // Quando a plataforma gerencia outro parceiro, o endereço fica /parceiro/p/:id/...
  const managed = location.pathname.match(/^\/parceiro\/p\/(\d+)/)?.[1];
  const base = managed ? `/parceiro/p/${managed}` : '/parceiro';

  const nav = [
    { to: base, label: 'Clientes', Icon: IconBuilding, end: true },
    { to: `${base}/marca`, label: 'Marca', Icon: IconBrush },
    { to: `${base}/dominios`, label: 'Domínios', Icon: IconGlobe },
    { to: `${base}/apps`, label: 'Apps próprios', Icon: IconKey },
    { to: `${base}/equipe`, label: 'Equipe', Icon: IconTeam },
  ];

  return (
    <div className={`platform ${menuOpen ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="sidebar" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}>
          <IconMenu />
        </button>
        <Logo to="/parceiro" />
      </header>

      <aside id="sidebar" className="sidebar">
        <div className="sidebar-top">
          <Logo to="/parceiro" />
          <div className="org">
            <span className="org-label">{user.isPlatformAdmin ? 'Equipe da plataforma' : 'Painel do parceiro'}</span>
            <strong>{managed ? `Gerenciando parceiro #${managed}` : 'Sua operação'}</strong>
          </div>
        </div>
        <nav aria-label="Console do parceiro">
          <ul className="side-nav">
            {user.isPlatformAdmin && (
              <li>
                <NavLink to="/parceiro/parceiros" className="side-link">
                  <IconAgent />
                  <span>Parceiros</span>
                </NavLink>
              </li>
            )}
            {nav.map(({ to, label, Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="side-link">
                  <Icon />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {user.name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0])
              .join('')
              .toUpperCase()}
          </span>
          <div className="user-meta">
            <strong>{user.name}</strong>
            <span>{user.isPlatformAdmin ? 'Administrador da plataforma' : 'Equipe do parceiro'}</span>
          </div>
          <button
            className="btn btn-ghost btn-sm logout"
            onClick={async () => {
              await logout();
              navigate('/', { replace: true });
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <main className="content">
        <Routes>
          <Route path="parceiros" element={user.isPlatformAdmin ? <Partners notify={notify} /> : null} />
          <Route path="p/:pid/*" element={<ManagedPartner notify={notify} />} />
          <Route path="*" element={<PartnerRoutes pid="me" notify={notify} />} />
        </Routes>
      </main>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
      </div>
    </div>
  );
}

function ManagedPartner({ notify }) {
  const { pid } = useParams();
  return <PartnerRoutes pid={pid} notify={notify} />;
}

function PartnerRoutes({ pid, notify }) {
  const [partner, setPartner] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setPartner((await api(`/partner/${pid}`)).partner);
    } catch (err) {
      setError(err.message);
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!partner) return <div className="skeleton" style={{ height: 200 }} />;
  const props = { pid, partner, reload: load, notify };
  return (
    <Routes>
      <Route index element={<Clients {...props} />} />
      <Route path="marca" element={<BrandSettings {...props} />} />
      <Route path="dominios" element={<Domains {...props} />} />
      <Route path="apps" element={<OAuthApps {...props} />} />
      <Route path="equipe" element={<PartnerTeam {...props} />} />
    </Routes>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import CreateAgentDialog from '../components/CreateAgentDialog.jsx';
import {
  IconHome,
  IconAgent,
  IconProcess,
  IconDoc,
  IconPlug,
  IconShield,
  IconChat,
  IconTeam,
  IconMenu,
  IconInbox,
} from '../components/Icons.jsx';
import { useAuth } from '../auth.jsx';
import VerifyBanner from './platform/VerifyBanner.jsx';
import { api } from '../api.js';
import Home from './platform/Home.jsx';
import Agents from './platform/Agents.jsx';
import AgentDetail from './platform/AgentDetail.jsx';
import Integrations from './platform/Integrations.jsx';
import Approvals from './platform/Approvals.jsx';
import TestChat from './platform/TestChat.jsx';
import Knowledge from './platform/Knowledge.jsx';
import Processes from './platform/Processes.jsx';
import Team from './platform/Team.jsx';
import Conversations from './platform/Conversations.jsx';
import './platform.css';

const nav = [
  { to: '/app', label: 'Visão geral', Icon: IconHome, end: true },
  { to: '/app/agentes', label: 'Agentes', Icon: IconAgent },
  { to: '/app/processos', label: 'Processos', Icon: IconProcess },
  { to: '/app/conhecimento', label: 'Contexto da empresa', Icon: IconDoc },
  { to: '/app/conversas', label: 'Conversas', Icon: IconInbox, badge: 'human' },
  { to: '/app/aprovacoes', label: 'Aprovações', Icon: IconShield, badge: 'pending' },
  { to: '/app/integracoes', label: 'Integrações', Icon: IconPlug },
  { to: '/app/testar', label: 'Testar conversas', Icon: IconChat },
  { to: '/app/equipe', label: 'Equipe', Icon: IconTeam },
];

export default function Platform() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [agents, setAgents] = useState(null);
  const [areas, setAreas] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const handleAuthError = useCallback(
    (err) => {
      if (err.status === 401) navigate('/entrar', { replace: true });
    },
    [navigate],
  );

  const loadAgents = useCallback(async () => {
    setLoadError('');
    try {
      const data = await api('/agents');
      setAgents(data.agents);
      setAreas(data.areas);
    } catch (err) {
      handleAuthError(err);
      setLoadError(err.message);
    }
  }, [handleAuthError]);

  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await api('/summary'));
    } catch (err) {
      handleAuthError(err);
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadAgents();
    refreshSummary();
  }, [loadAgents, refreshSummary]);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback((text, kind = 'success') => setToast({ text, kind }), []);

  async function handleLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  function handleCreated(agent) {
    setAgents((list) => [agent, ...(list || [])]);
    setDialogOpen(false);
    refreshSummary();
    notify(`${agent.name} criado. Agora libere as ferramentas que ele pode usar.`);
    navigate(`/app/agentes/${agent.id}`);
  }

  const shared = {
    user,
    agents,
    areas,
    summary,
    loadError,
    reloadAgents: loadAgents,
    refreshSummary,
    openCreate: () => setDialogOpen(true),
    notify,
  };
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  return (
    <div className={`platform ${menuOpen ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button
          className="menu-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-controls="sidebar"
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
        >
          <IconMenu />
        </button>
        <Logo to="/app" />
        {summary?.pending > 0 && (
          <NavLink to="/app/aprovacoes" className="topbar-pending">
            {summary.pending} pendente{summary.pending > 1 ? 's' : ''}
          </NavLink>
        )}
      </header>

      <aside id="sidebar" className="sidebar">
        <div className="sidebar-top">
          <Logo to="/app" />
          <div className="org">
            <span className="org-label">Empresa</span>
            <strong>{user.orgName}</strong>
          </div>
        </div>
        <nav aria-label="Plataforma">
          <ul className="side-nav">
            {nav.map(({ to, label, Icon, end, badge }) => (
              <li key={to}>
                <NavLink to={to} end={end} className="side-link">
                  <Icon />
                  <span>{label}</span>
                  {badge === 'pending' && summary?.pending > 0 && (
                    <span className="side-badge tabular" aria-label={`${summary.pending} pendentes`}>
                      {summary.pending}
                    </span>
                  )}
                  {badge === 'human' && summary?.humanConversations > 0 && (
                    <span className="side-badge side-badge-soft tabular" aria-label={`${summary.humanConversations} com atendimento humano`}>
                      {summary.humanConversations}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {user.isPlatformAdmin && (
          <NavLink to="/parceiro" className="side-link side-foot">
            <IconAgent />
            <span>Console da plataforma</span>
          </NavLink>
        )}
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="user-meta">
            <strong>{user.name}</strong>
            <span>{user.roleLabel}</span>
          </div>
          <button className="btn btn-ghost btn-sm logout" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setMenuOpen(false)} aria-hidden="true" />

      <main className="content">
        {!user.emailVerified && <VerifyBanner email={user.email} notify={notify} />}
        <Routes>
          <Route index element={<Home {...shared} />} />
          <Route path="agentes" element={<Agents {...shared} />} />
          <Route path="agentes/:id" element={<AgentDetail {...shared} />} />
          <Route path="integracoes" element={<Integrations {...shared} />} />
          <Route path="aprovacoes" element={<Approvals {...shared} />} />
          <Route path="testar" element={<TestChat {...shared} />} />
          <Route path="processos" element={<Processes {...shared} />} />
          <Route path="conhecimento" element={<Knowledge {...shared} />} />
          <Route path="equipe" element={<Team {...shared} />} />
          <Route path="conversas" element={<Conversations {...shared} />} />
          <Route path="conversas/:id" element={<Conversations {...shared} />} />
        </Routes>
      </main>

      <CreateAgentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onCreated={handleCreated} areas={areas} />

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
      </div>
    </div>
  );
}

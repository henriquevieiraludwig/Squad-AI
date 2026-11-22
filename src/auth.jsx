import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email, password, slug) => {
    await api('/auth/login', { method: 'POST', body: { email, password, slug } });
    return refresh();
  };

  const signup = async (payload) => {
    await api('/auth/signup', { method: 'POST', body: payload });
    return refresh();
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// Página inicial de cada tipo de usuário: equipe do parceiro vai para o console, empresas para o painel.
export const homeFor = (user) => (user?.orgId ? '/app' : user?.isPartnerAdmin ? '/parceiro' : '/');

export const can = (user, perm) => Boolean(user?.permissions?.includes(perm));

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!user.orgId) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export function RequirePartner({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (!user.isPartnerAdmin) return <Navigate to={homeFor(user)} replace />;
  return children;
}

export function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function FullPageLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-faint)' }}>
      <span className="spinner" aria-label="Carregando" />
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth, homeFor } from '../auth.jsx';
import { useBrand } from '../brand.jsx';

export default function Login() {
  const { login } = useAuth();
  const brand = useBrand();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Endereço de acesso da empresa (/acesso/<slug>): a tela mostra o nome dela.
  const { slug } = useParams();
  const [org, setOrg] = useState(null);
  const [orgError, setOrgError] = useState('');

  useEffect(() => {
    if (!slug) return;
    api(`/access/${slug}`)
      .then((r) => setOrg(r.org))
      .catch((err) => setOrgError(err.message));
  }, [slug]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password, slug);
      const from = location.state?.from;
      const home = homeFor(user);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      aside={
        <>
          <p className="auth-quote">Seus agentes continuam de onde pararam.</p>
          <p className="auth-quote-sub">Aprovações pendentes, conversas e processos ficam esperando por você no painel.</p>
        </>
      }
    >
      <h1>{org ? `Entrar na ${org.name}` : `Entrar no ${brand.name}`}</h1>
      <p className="auth-sub">
        {org ? `Área dos agentes de IA da ${org.name}, no ${brand.name}.` : 'Use o endereço de acesso da sua empresa, que você recebeu por e-mail.'}
      </p>
      {orgError && (
        <div className="form-alert" role="alert">
          {orgError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="auth-form">
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail de trabalho</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com"
            required
            autoFocus
          />
        </div>
        <PasswordField
          id="password"
          label="Senha"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <p className="auth-forgot">
          <Link to="/esqueci-senha">Esqueci minha senha</Link>
        </p>
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="auth-back">
        <Link to="/">Voltar para o site</Link>
      </p>
    </AuthLayout>
  );
}

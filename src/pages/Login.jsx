import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      const from = location.state?.from;
      navigate(from && from.startsWith('/app') ? from : '/app', { replace: true });
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
      <h1>Entrar no Squad AI</h1>
      <p className="auth-sub">
        Ainda não tem conta? <Link to="/criar-conta">Criar conta da empresa</Link>
      </p>

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

// Telas de conta: esqueci a senha, nova senha, confirmação de e-mail e convite.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { api } from '../api.js';
import { useAuth, homeFor } from '../auth.jsx';
import { useBrand } from '../brand.jsx';

const Spinner = () => <span className="spinner" aria-hidden="true" />;

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout aside={<p className="auth-quote">Acontece. Em um minuto você cria uma senha nova.</p>}>
      <h1>Esqueci minha senha</h1>
      {sent ? (
        <div className="auth-done">
          <div className="alert alert-success" role="status">
            Se houver uma conta com {email}, você vai receber um e-mail com o link para criar uma nova senha. O link vale por 1 hora.
          </div>
          <p className="auth-sub">
            Não chegou? Confira a caixa de spam. <Link to="/entrar">Voltar para o login</Link>
          </p>
        </div>
      ) : (
        <>
          <p className="auth-sub">Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.</p>
          <form onSubmit={submit} className="auth-form" noValidate>
            {error && (
              <div className="form-alert" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email}>
              {busy && <Spinner />}
              Enviar link
            </button>
          </form>
          <p className="auth-back">
            <Link to="/entrar">Voltar para o login</Link>
          </p>
        </>
      )}
    </AuthLayout>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/reset', { method: 'POST', body: { token: params.get('token'), password } });
      const user = await refresh();
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout aside={<p className="auth-quote">Use uma senha que você não usa em outros sites.</p>}>
      <h1>Criar nova senha</h1>
      <form onSubmit={submit} className="auth-form" noValidate>
        {error && (
          <div className="form-alert" role="alert">
            {error} {/link/.test(error) && <Link to="/esqueci-senha">Pedir novo link</Link>}
          </div>
        )}
        <PasswordField id="password" label="Nova senha" value={password} onChange={setPassword} hint="Pelo menos 8 caracteres." autoComplete="new-password" />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy && <Spinner />}
          Salvar e entrar
        </button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, refresh } = useAuth();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    api('/auth/verify', { method: 'POST', body: { token: params.get('token') } })
      .then(() => {
        setState({ status: 'ok' });
        refresh();
      })
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, [params, refresh]);

  return (
    <AuthLayout aside={<p className="auth-quote">Com o e-mail confirmado, você recebe os avisos de aprovação.</p>}>
      <h1>Confirmação de e-mail</h1>
      <div className="auth-done" aria-live="polite">
        {state.status === 'loading' && (
          <p className="auth-sub">
            <Spinner /> Confirmando…
          </p>
        )}
        {state.status === 'ok' && <div className="alert alert-success">E-mail confirmado.</div>}
        {state.status === 'error' && <div className="alert alert-error">{state.message}</div>}
        {state.status !== 'loading' && (
          <Link to={user ? homeFor(user) : '/entrar'} className="btn btn-primary">
            {user ? 'Abrir a plataforma' : 'Entrar'}
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}

export function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const brand = useBrand();
  const { refresh } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/invites/${token}`)
      .then((d) => {
        setInvite(d);
        setName(d.name || '');
      })
      .catch((err) => setLoadError(err.message));
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setFields({});
    setBusy(true);
    try {
      await api(`/invites/${token}/accept`, { method: 'POST', body: { name, password } });
      const user = await refresh();
      navigate(homeFor(user), { replace: true });
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setBusy(false);
    }
  }

  return (
    <AuthLayout aside={<p className="auth-quote">Bem-vindo ao {brand.name}.</p>}>
      {loadError ? (
        <>
          <h1>Convite indisponível</h1>
          <div className="auth-done">
            <div className="alert alert-error">{loadError}</div>
            <p className="auth-sub">Peça para quem convidou você enviar um novo convite.</p>
          </div>
        </>
      ) : !invite ? (
        <p className="auth-sub">
          <Spinner /> Carregando convite…
        </p>
      ) : invite.hasAccount ? (
        <>
          <h1>Você já tem conta</h1>
          <p className="auth-sub">O e-mail {invite.email} já tem acesso aqui.</p>
          <div className="auth-done">
            <Link to="/entrar" className="btn btn-primary">
              Entrar
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1>{invite.orgName ? `Entrar na equipe de ${invite.orgName}` : `Acesso ao painel do ${invite.partnerName}`}</h1>
          <p className="auth-sub">
            Convite para {invite.email}, como {invite.roleLabel.toLowerCase()}.
          </p>
          <form onSubmit={submit} className="auth-form" noValidate>
            {error && (
              <div className="form-alert" role="alert">
                {error}
              </div>
            )}
            <div className="field">
              <label htmlFor="name">Seu nome</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={fields.name ? 'true' : undefined} autoFocus />
              {fields.name && <span className="field-error">{fields.name}</span>}
            </div>
            <PasswordField id="password" label="Crie uma senha" value={password} onChange={setPassword} error={fields.password} hint="Pelo menos 8 caracteres." autoComplete="new-password" />
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy && <Spinner />}
              Aceitar convite
            </button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}

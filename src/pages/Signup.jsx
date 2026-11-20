import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordField from '../components/PasswordField.jsx';
import { useAuth } from '../auth.jsx';
import { useBrand } from '../brand.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v) {
  const f = {};
  if (!v.name.trim()) f.name = 'Informe seu nome.';
  if (!v.company.trim()) f.company = 'Informe o nome da empresa.';
  if (!EMAIL_RE.test(v.email.trim())) f.email = 'Use um e-mail válido, como voce@empresa.com.';
  if (v.password.length < 8) f.password = 'A senha precisa ter pelo menos 8 caracteres.';
  return f;
}

export default function Signup() {
  const { signup } = useAuth();
  const brand = useBrand();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', company: '', email: '', password: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (val) => {
    setValues((v) => ({ ...v, [key]: val }));
    if (fields[key]) setFields((f) => ({ ...f, [key]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const local = validate(values);
    setFields(local);
    if (Object.keys(local).length) {
      document.getElementById(Object.keys(local)[0])?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await signup(values);
      navigate('/app', { replace: true, state: { welcome: true } });
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setSubmitting(false);
    }
  }

  const textField = (id, label, props = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={values[id]}
        onChange={(e) => set(id)(e.target.value)}
        aria-invalid={fields[id] ? 'true' : undefined}
        aria-describedby={fields[id] ? `${id}-error` : undefined}
        required
        {...props}
      />
      {fields[id] && (
        <span id={`${id}-error`} className="field-error">
          {fields[id]}
        </span>
      )}
    </div>
  );

  if (!brand.allowSignup) {
    return (
      <AuthLayout aside={<p className="auth-quote">O acesso ao {brand.name} é feito por convite.</p>}>
        <h1>Cadastro por convite</h1>
        <p className="auth-sub">
          Peça para o administrador da sua empresa enviar um convite para o seu e-mail. Já tem acesso? <Link to="/entrar">Entrar</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      aside={
        <>
          <p className="auth-quote">Do primeiro processo ao primeiro agente em uma tarde.</p>
          <ol className="auth-steps">
            <li>Crie a conta da empresa</li>
            <li>Conecte o Microsoft 365 ou o Google Workspace</li>
            <li>Crie o agente e defina o que precisa de aprovação</li>
          </ol>
        </>
      }
    >
      <h1>Criar conta da empresa</h1>
      <p className="auth-sub">
        Já tem conta? <Link to="/entrar">Entrar</Link>
      </p>

      <form onSubmit={handleSubmit} noValidate className="auth-form">
        {error && (
          <div className="form-alert" role="alert">
            {error}
          </div>
        )}
        <div className="field-row">
          {textField('name', 'Seu nome', { autoComplete: 'name', autoFocus: true })}
          {textField('company', 'Empresa', { autoComplete: 'organization' })}
        </div>
        {textField('email', 'E-mail de trabalho', {
          type: 'email',
          autoComplete: 'email',
          inputMode: 'email',
          placeholder: 'voce@empresa.com',
        })}
        <PasswordField
          id="password"
          label="Senha"
          value={values.password}
          onChange={set('password')}
          error={fields.password}
          hint="Pelo menos 8 caracteres."
          autoComplete="new-password"
        />
        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? <span className="spinner" aria-hidden="true" /> : null}
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </button>
        <p className="auth-legal">
          Ao criar a conta, você concorda com os{' '}
          {brand.termsUrl ? <a href={brand.termsUrl}>Termos de uso</a> : 'Termos de uso'} e a{' '}
          {brand.privacyUrl ? <a href={brand.privacyUrl}>Política de privacidade</a> : 'Política de privacidade'} do {brand.name}.
        </p>
      </form>
    </AuthLayout>
  );
}

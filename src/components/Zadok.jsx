import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { SquadMark } from './Logo.jsx';
import { api } from '../api.js';

// Símbolo da Zadok: o anel (entrada), o traço em Z (fluxo) e o ponto cheio (saída).
export function ZadokSymbol({ size = 32, color = 'var(--z-lime)', tile = null }) {
  const glyph = (
    <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" strokeWidth="5" />
      <path d="M18 11h32L15 41h31" strokeWidth="7.5" />
      <circle cx="50" cy="41" r="8.5" fill={color} stroke="none" />
    </g>
  );
  if (tile) {
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
        <rect width="80" height="80" rx="18" fill={tile} />
        <g transform="translate(9 14) scale(0.95)">{glyph}</g>
      </svg>
    );
  }
  return (
    <svg width={size * 1.25} height={size} viewBox="0 0 64 52" aria-hidden="true">
      {glyph}
    </svg>
  );
}

// Logotipo: símbolo + "zadok" com o "o" em destaque.
export function ZadokLogo({ to = '/', onDark = false, size = 26 }) {
  return (
    <Link to={to} className={`zlogo ${onDark ? 'is-dark' : ''}`} aria-label="Zadok, página inicial">
      <ZadokSymbol size={size} color={onDark ? 'var(--z-lime)' : 'var(--z-lime-strong)'} />
      <span className="zlogo-word" style={{ fontSize: size * 0.95 }}>
        zad<span className="zlogo-o">o</span>k
      </span>
    </Link>
  );
}

// Assinatura "Squad AI por zadok".
export function PorZadok() {
  return (
    <span className="por-zadok">
      por <strong>zad<span className="zlogo-o">o</span>k</strong>
    </span>
  );
}

const PRODUCTS = [
  { to: '/produtos/squad-ai', name: 'Squad AI', text: 'Agentes de IA para tarefas repetitivas', icon: <SquadMark size={34} /> },
  { to: '/produtos/zadok-erp', name: 'Zadok ERP', text: 'Gestão integrada para PMEs', icon: <ZadokSymbol size={30} tile="var(--z-forest)" />, soon: true },
];

export function ZadokHeader({ onDark = true }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <header className={`zheader ${onDark ? 'is-dark' : ''}`}>
      <div className="zwrap zheader-inner">
        <ZadokLogo onDark={onDark} />
        <button className="zmenu-btn" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label="Abrir menu">
          <span />
          <span />
          <span />
        </button>
        <nav className={`znav ${menu ? 'is-open' : ''}`} aria-label="Principal">
          <div className="zdrop" ref={ref}>
            <button className="znav-link" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true">
              Produtos <span aria-hidden="true">▾</span>
            </button>
            {open && (
              <div className="zdrop-menu">
                {PRODUCTS.map((p) => (
                  <Link key={p.to} to={p.to} className="zdrop-item" onClick={() => setOpen(false)}>
                    {p.icon}
                    <span>
                      <strong>
                        {p.name} {p.soon && <em className="zsoon">em breve</em>}
                      </strong>
                      <span>{p.text}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <a className="znav-link" href="/#como-funciona">
            Como funciona
          </a>
          <a className="znav-link" href="/#sobre">
            Sobre
          </a>
          <a className="zbtn zbtn-lime" href="/#contato">
            Falar com a Zadok
          </a>
        </nav>
      </div>
    </header>
  );
}

export function ZadokFooter() {
  return (
    <footer className="zfooter">
      <div className="zwrap zfooter-inner">
        <div>
          <ZadokLogo onDark />
          <p>A empresa que opera sozinha. Agentes de IA e um ERP que trabalham juntos, com o dono no comando.</p>
        </div>
        <div className="zfooter-cols">
          <div>
            <span className="zlabel">Produtos</span>
            <NavLink to="/produtos/squad-ai">Squad AI</NavLink>
            <NavLink to="/produtos/zadok-erp">Zadok ERP</NavLink>
          </div>
          <div>
            <span className="zlabel">Empresa</span>
            <a href="/#sobre">Sobre</a>
            <a href="/#contato">Contato</a>
          </div>
        </div>
      </div>
      <div className="zwrap zfooter-bottom">
        <span>© {new Date().getFullYear()} Zadok</span>
        <span className="zlabel">Autonomia com comando</span>
      </div>
    </footer>
  );
}

// Formulário de contato: grava o pedido e avisa a equipe da Zadok por e-mail.
export function ContactForm({ interest = 'Zadok', cta = 'Quero conversar' }) {
  const [v, setV] = useState({ name: '', email: '', company: '', message: '' });
  const [state, setState] = useState({ busy: false, done: false, error: '' });
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, done: false, error: '' });
    try {
      await api('/contact', { method: 'POST', body: { ...v, interest } });
      setState({ busy: false, done: true, error: '' });
    } catch (err) {
      setState({ busy: false, done: false, error: err.message });
    }
  }
  if (state.done) {
    return (
      <div className="zform-done" role="status">
        <ZadokSymbol size={28} />
        <p>
          <strong>Recebemos o seu contato.</strong> A equipe da Zadok responde no seu e-mail em até um dia útil.
        </p>
      </div>
    );
  }
  return (
    <form className="zform" onSubmit={submit} noValidate>
      {state.error && (
        <p className="zform-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="zform-row">
        <label>
          <span>Nome</span>
          <input value={v.name} onChange={set('name')} autoComplete="name" required />
        </label>
        <label>
          <span>E-mail de trabalho</span>
          <input type="email" value={v.email} onChange={set('email')} autoComplete="email" required />
        </label>
      </div>
      <label>
        <span>Empresa</span>
        <input value={v.company} onChange={set('company')} autoComplete="organization" />
      </label>
      <label>
        <span>O que você quer automatizar?</span>
        <textarea rows={3} value={v.message} onChange={set('message')} placeholder="Ex.: atendimento no WhatsApp, agendamento de reuniões, cobrança de inadimplentes…" />
      </label>
      <button className="zbtn zbtn-lime" type="submit" disabled={state.busy}>
        {state.busy ? 'Enviando…' : cta}
      </button>
    </form>
  );
}

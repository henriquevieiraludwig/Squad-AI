import { Link } from 'react-router-dom';
import { IconSearch } from '../../components/Icons.jsx';

export function formatDate(sqlDate, withTime = false) {
  if (!sqlDate) return '';
  const d = new Date(sqlDate.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PageHead({ title, lede, children, back }) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        {back && (
          <Link to={back.to} className="back-link">
            {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {lede && <p>{lede}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}

export function SearchInput({ id, value, onChange, placeholder, label }) {
  return (
    <div className="search">
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <IconSearch />
      <input id={id} className="input" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

export function FilterChips({ options, value, onChange, label }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, text, children, icon }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        {icon}
      </span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty">
      <div className="alert alert-error" role="alert">
        {message}
      </div>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function LoadingRows({ rows = 3 }) {
  return (
    <div className="loading-rows" aria-label="Carregando" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 56 }} />
      ))}
    </div>
  );
}

export function Monogram({ letter, size = 40 }) {
  return (
    <span className="monogram" style={{ width: size, height: size }} aria-hidden="true">
      {letter}
    </span>
  );
}

const FIELD_LABELS = {
  to: 'Para',
  subject: 'Assunto',
  body: 'Mensagem',
  text: 'Mensagem',
  query: 'Busca',
  start: 'Início',
  end: 'Fim',
  attendees: 'Participantes',
  description: 'Descrição',
  summary: 'Título',
  teamId: 'Equipe',
  channelId: 'Canal',
  channel: 'Canal',
  space: 'Espaço',
  chatId: 'Conversa',
};

export function InputDetails({ input }) {
  const entries = Object.entries(input || {}).filter(([, v]) => v !== '' && v != null);
  if (!entries.length) return <p className="muted">Sem parâmetros.</p>;
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <div key={k} className={String(v).length > 80 ? 'kv-long' : ''}>
          <dt>{FIELD_LABELS[k] || k}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export const RUN_STATUS = {
  pendente: { label: 'Aguardando aprovação', cls: 'pill-warn' },
  executada: { label: 'Executada', cls: 'pill-ok' },
  recusada: { label: 'Recusada', cls: 'pill-neutral' },
  erro: { label: 'Falhou', cls: 'pill-danger' },
};

export const AGENT_STATUS = {
  em_treinamento: { label: 'Em treinamento', cls: 'pill-warn' },
  publicado: { label: 'Publicado', cls: 'pill-ok' },
};

export const CHANNEL_LABEL = { teste: 'Conversa de teste', whatsapp: 'WhatsApp', telegram: 'Telegram' };

import { useCallback, useEffect, useState } from 'react';
import { api, DEMO } from '../../api.js';
import { can } from '../../auth.jsx';
import { PageHead, ErrorState, LoadingRows, formatDate } from './common.jsx';

const ROLE_HELP = {
  owner: 'Tudo, inclusive transferir a propriedade.',
  admin: 'Configura agentes, integrações, contexto e equipe. Aprova ações.',
  approver: 'Aprova ou recusa ações e atende conversas.',
  member: 'Conversa com os agentes e acompanha.',
};

export default function Team({ user, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const manage = can(user, 'equipe');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/team'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setFields({});
    try {
      await api('/team/invites', { method: 'POST', body: { email, role } });
      notify(`Convite enviado para ${email}.`);
      setEmail('');
      load();
    } catch (err) {
      setFields(err.fields || { email: err.message });
      if (!err.fields) notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn, msg) {
    try {
      await fn();
      notify(msg);
      setConfirm(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const roleOptions = (forOwner) =>
    Object.entries(data.roles).filter(([k]) => (k === 'owner' ? forOwner : true));

  return (
    <>
      <PageHead title="Equipe" lede={`Quem participa de ${user.orgName} e o que cada pessoa pode fazer.`} />
      {user.orgSlug && <AccessAddress slug={user.orgSlug} notify={notify} />}

      {manage && (
        <section className="panel" aria-labelledby="invite-title">
          <div className="panel-head">
            <h2 id="invite-title">Convidar pessoa</h2>
          </div>
          <form className="invite-form" onSubmit={invite} noValidate>
            <div className="field">
              <label htmlFor="invite-email">E-mail</label>
              <input id="invite-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@empresa.com" aria-invalid={fields.email ? 'true' : undefined} />
              {fields.email && <span className="field-error">{fields.email}</span>}
            </div>
            <div className="field">
              <label htmlFor="invite-role">Papel</label>
              <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Membro</option>
                <option value="approver">Aprovador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !email}>
              {busy && <span className="spinner" aria-hidden="true" />}
              Enviar convite
            </button>
          </form>
          <p className="muted invite-help">{ROLE_HELP[role]}</p>
        </section>
      )}

      {user.role === 'owner' && !DEMO && (
        <section className="panel data-export" aria-labelledby="export-title">
          <div>
            <h2 id="export-title">Dados da empresa</h2>
            <p className="muted">Baixe uma cópia de tudo o que a empresa tem na plataforma: agentes, contexto, processos, conversas e ações.</p>
          </div>
          <a className="btn btn-secondary" href="/api/org/export" download>
            Exportar dados
          </a>
        </section>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingRows rows={3} />
      ) : (
        <section className="panel panel-flush" aria-label="Pessoas">
          <ul className="member-list">
            {data.members.map((m) => (
              <li key={m.id} className="member">
                <span className="avatar avatar-soft" aria-hidden="true">
                  {m.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0])
                    .join('')
                    .toUpperCase()}
                </span>
                <div className="member-info">
                  <strong>
                    {m.name}
                    {m.id === user.id && <span className="muted"> (você)</span>}
                  </strong>
                  <span className="muted">
                    {m.email}
                    {!m.verified && ', e-mail não confirmado'}
                  </span>
                </div>
                {manage && m.id !== user.id && (m.role !== 'owner' || user.role === 'owner') ? (
                  <select
                    className="input input-sm"
                    value={m.role}
                    aria-label={`Papel de ${m.name}`}
                    onChange={(e) => act(() => api(`/team/members/${m.id}`, { method: 'PUT', body: { role: e.target.value } }), `Papel de ${m.name} atualizado.`)}
                  >
                    {roleOptions(user.role === 'owner').map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="pill pill-neutral">{m.roleLabel}</span>
                )}
                {manage && m.id !== user.id && m.role !== 'owner' &&
                  (confirm === `m${m.id}` ? (
                    <span className="confirm-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                        Cancelar
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => act(() => api(`/team/members/${m.id}`, { method: 'DELETE' }), `${m.name} removido da equipe.`)}>
                        Remover
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirm(`m${m.id}`)}>
                      Remover
                    </button>
                  ))}
              </li>
            ))}
            {data.invites.map((i) => (
              <li key={`i${i.id}`} className="member is-invite">
                <span className="avatar avatar-soft" aria-hidden="true">
                  @
                </span>
                <div className="member-info">
                  <strong>{i.email}</strong>
                  <span className="muted">Convite enviado em {formatDate(i.createdAt)}, vale até {formatDate(i.expiresAt)}</span>
                </div>
                <span className="pill pill-warn">{i.roleLabel}, pendente</span>
                {manage && (
                  <button className="btn btn-ghost btn-sm" onClick={() => act(() => api(`/team/invites/${i.id}`, { method: 'DELETE' }), 'Convite cancelado.')}>
                    Cancelar convite
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

// Endereço por onde a equipe da empresa entra (também vai no e-mail de convite).
function AccessAddress({ slug, notify }) {
  const url = `${window.location.origin}/acesso/${slug}`;
  return (
    <section className="panel access-address">
      <div>
        <h2>Endereço de acesso da empresa</h2>
        <p className="panel-sub">É por aqui que as pessoas da equipe entram. Ele vai junto no e-mail de convite.</p>
      </div>
      <div className="copy-row">
        <input className="input mono" value={url} readOnly onFocus={(e) => e.target.select()} aria-label="Endereço de acesso" />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              notify('Endereço copiado.');
            } catch {
              notify('Selecione o endereço e copie com Ctrl+C ou Cmd+C.', 'error');
            }
          }}
        >
          Copiar
        </button>
      </div>
    </section>
  );
}

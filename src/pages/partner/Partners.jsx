// Equipe da plataforma: todos os parceiros white label.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { IconPlus } from '../../components/Icons.jsx';
import { PageHead, SearchInput, ErrorState, LoadingRows, formatDate, fmtNumber } from '../platform/common.jsx';

export default function Partners({ notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/platform/partners'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(p) {
    try {
      await api(`/platform/partners/${p.id}/status`, { method: 'PUT', body: { status: p.status === 'ativo' ? 'suspenso' : 'ativo' } });
      notify(p.status === 'ativo' ? `${p.name} suspenso.` : `${p.name} reativado.`);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const q = query.trim().toLowerCase();
  const shown = data?.partners.filter((p) => !q || `${p.name} ${p.slug} ${p.domains}`.toLowerCase().includes(q));

  return (
    <>
      <PageHead title="Parceiros" lede="Revendedores que oferecem a plataforma com a própria marca. O uso de IA de cada um aparece aqui para a cobrança.">
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <IconPlus />
          Novo parceiro
        </button>
      </PageHead>
      <div className="toolbar">
        <SearchInput id="partner-search" label="Buscar parceiros" value={query} onChange={setQuery} placeholder="Buscar por nome ou domínio" />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingRows rows={3} />
      ) : (
        <section className="panel panel-flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Parceiro</th>
                  <th scope="col">Domínios</th>
                  <th scope="col" className="num">
                    Clientes
                  </th>
                  <th scope="col" className="num">
                    Mensagens no mês
                  </th>
                  <th scope="col" className="num">
                    Tokens no mês
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <span className="muted cell-sub">{p.isPlatform ? 'Marca da plataforma' : `Desde ${formatDate(p.createdAt)}`}</span>
                    </td>
                    <td className="cell-wrap">{p.domains || <span className="muted">Sem domínio</span>}</td>
                    <td className="num tabular">{p.clients}</td>
                    <td className="num tabular">{fmtNumber(p.messages)}</td>
                    <td className="num tabular">{fmtNumber(p.tokens)}</td>
                    <td>
                      <span className={`pill ${p.status === 'ativo' ? 'pill-ok' : 'pill-danger'}`}>{p.status === 'ativo' ? 'Ativo' : 'Suspenso'}</span>
                    </td>
                    <td className="num cell-actions">
                      <Link to={p.isPlatform ? '/parceiro' : `/parceiro/p/${p.id}`} className="btn btn-secondary btn-sm">
                        Gerenciar
                      </Link>
                      {!p.isPlatform && (
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(p)}>
                          {p.status === 'ativo' ? 'Suspender' : 'Reativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {creating && (
        <NewPartner
          subdomainBase={data?.subdomainBase}
          onClose={() => setCreating(false)}
          onCreated={(res, email) => {
            setCreating(false);
            notify(res.inviteSent ? `Parceiro criado. Convite enviado para ${email}.` : 'Parceiro criado. Adicione um domínio para o convite funcionar.');
            load();
          }}
        />
      )}
    </>
  );
}

function NewPartner({ subdomainBase, onClose, onCreated }) {
  const ref = useRef(null);
  const [v, setV] = useState({ name: '', slug: '', domain: '', adminEmail: '' });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const set = (k, val) =>
    setV((x) => {
      const next = { ...x, [k]: val };
      if (k === 'name' && (!x.slug || x.slug === slugify(x.name))) next.slug = slugify(val);
      return next;
    });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const res = await api('/platform/partners', { method: 'POST', body: v });
      onCreated(res, v.adminEmail);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setBusy(false);
    }
  }

  const field = (k, label, props = {}) => (
    <div className="field">
      <label htmlFor={`np-${k}`}>{label}</label>
      <input id={`np-${k}`} className="input" value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={fields[k] ? 'true' : undefined} {...props} />
      {fields[k] ? <span className="field-error">{fields[k]}</span> : props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="np-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 id="np-title">Novo parceiro</h2>
          <p>O administrador do parceiro recebe um convite para configurar a marca e criar os clientes.</p>
        </div>
        <div className="dialog-body">
          {error && <div className="form-alert">{error}</div>}
          {field('name', 'Nome da marca', { placeholder: 'Ex.: Acme Automação' })}
          {field('slug', 'Identificador', { hint: subdomainBase ? `Endereço automático: ${v.slug || 'identificador'}.${subdomainBase}` : 'Letras minúsculas, números e hífen.' })}
          {field('domain', 'Domínio próprio (opcional)', { placeholder: 'app.parceiro.com.br' })}
          {field('adminEmail', 'E-mail do administrador', { type: 'email' })}
          {!subdomainBase && <p className="muted">Sem domínio, o convite só funciona depois que um domínio for configurado para o parceiro.</p>}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Criar parceiro
          </button>
        </div>
      </form>
    </dialog>
  );
}

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

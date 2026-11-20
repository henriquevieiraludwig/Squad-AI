import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fileToDataUrl } from '../../api.js';
import { useBrandControl } from '../../brand.jsx';
import { IconPlus, IconTrash, IconCopy } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, EmptyState, ErrorState, LoadingRows, formatDate, fmtNumber } from '../platform/common.jsx';

const LIMIT_FIELDS = [
  ['messagesPerMonth', 'Mensagens por mês'],
  ['agents', 'Agentes'],
  ['members', 'Pessoas na equipe'],
  ['knowledgeChars', 'Espaço de contexto (caracteres)'],
];

// ---------- Clientes ----------

export function Clients({ pid, partner, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('todos');
  const [dialog, setDialog] = useState(null); // { mode: 'novo' } | { mode: 'editar', client }

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api(`/partner/${pid}/clients`));
    } catch (err) {
      setError(err.message);
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    if (!data) return null;
    const q = query.trim().toLowerCase();
    return data.clients.filter((c) => (status === 'todos' || c.status === status) && (!q || `${c.name} ${c.ownerEmail}`.toLowerCase().includes(q)));
  }, [data, query, status]);

  const totals = data && data.clients.reduce((t, c) => ({ messages: t.messages + c.messages, tokens: t.tokens + c.tokens }), { messages: 0, tokens: 0 });

  return (
    <>
      <PageHead title="Clientes" lede={`Empresas atendidas com a marca ${partner.name}. Crie clientes, defina limites e acompanhe o uso do mês.`}>
        <button className="btn btn-primary" onClick={() => setDialog({ mode: 'novo' })}>
          <IconPlus />
          Novo cliente
        </button>
      </PageHead>

      {data && (
        <ul className="stats stats-3" aria-label="Resumo do mês">
          <li>
            <div className="stat">
              <span className="stat-value tabular">{data.clients.filter((c) => c.status === 'ativa').length}</span>
              <span className="stat-label">Clientes ativos</span>
            </div>
          </li>
          <li>
            <div className="stat">
              <span className="stat-value tabular">{fmtNumber(totals.messages)}</span>
              <span className="stat-label">Mensagens no mês</span>
            </div>
          </li>
          <li>
            <div className="stat">
              <span className="stat-value tabular">{fmtNumber(totals.tokens)}</span>
              <span className="stat-label">Tokens de IA no mês</span>
            </div>
          </li>
        </ul>
      )}

      {data?.clients.length > 0 && (
        <div className="toolbar">
          <SearchInput id="client-search" label="Buscar clientes" value={query} onChange={setQuery} placeholder="Buscar por empresa ou e-mail" />
          <FilterChips
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'ativa', label: 'Ativos' },
              { value: 'suspensa', label: 'Suspensos' },
            ]}
          />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingRows rows={3} />
      ) : data.clients.length === 0 ? (
        <section className="panel">
          <EmptyState title="Nenhum cliente ainda" text="Crie o primeiro cliente. O responsável recebe um convite por e-mail para entrar com a sua marca.">
            <button className="btn btn-secondary" onClick={() => setDialog({ mode: 'novo' })}>
              Criar cliente
            </button>
          </EmptyState>
        </section>
      ) : (
        <section className="panel panel-flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Responsável</th>
                  <th scope="col" className="num">
                    Mensagens no mês
                  </th>
                  <th scope="col" className="num">
                    Agentes
                  </th>
                  <th scope="col" className="num">
                    Pessoas
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const pct = c.limits.messagesPerMonth ? Math.round((c.messages / c.limits.messagesPerMonth) * 100) : 0;
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                        <span className="muted cell-sub">Desde {formatDate(c.createdAt)}</span>
                      </td>
                      <td>
                        {c.ownerEmail}
                        {c.ownerPending && <span className="muted cell-sub">Convite pendente</span>}
                      </td>
                      <td className="num tabular">
                        {fmtNumber(c.messages)} / {fmtNumber(c.limits.messagesPerMonth)}
                        <span className={`mini-bar ${pct >= 90 ? 'is-warn' : ''}`} aria-hidden="true">
                          <span style={{ width: `${Math.min(100, pct)}%` }} />
                        </span>
                      </td>
                      <td className="num tabular">
                        {c.agents} / {c.limits.agents}
                      </td>
                      <td className="num tabular">
                        {c.members} / {c.limits.members}
                      </td>
                      <td>
                        <span className={`pill ${c.status === 'ativa' ? 'pill-ok' : 'pill-danger'}`}>{c.status === 'ativa' ? 'Ativo' : 'Suspenso'}</span>
                      </td>
                      <td className="num">
                        <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ mode: 'editar', client: c })}>
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {shown.length === 0 && <p className="empty">Nenhum cliente com esses filtros.</p>}
        </section>
      )}

      {dialog && (
        <ClientDialog
          pid={pid}
          defaults={data?.defaults}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            notify(msg);
            load();
          }}
        />
      )}
    </>
  );
}

function ClientDialog({ pid, defaults, dialog, onClose, onDone }) {
  const ref = useRef(null);
  const editing = dialog.mode === 'editar' ? dialog.client : null;
  const [name, setName] = useState(editing?.name || '');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [limits, setLimits] = useState(() => Object.fromEntries(LIMIT_FIELDS.map(([k]) => [k, editing?.customLimits?.[k] ?? ''])));
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function removeClient() {
    setBusy(true);
    setError('');
    try {
      await api(`/partner/${pid}/clients/${editing.id}`, { method: 'DELETE', body: { confirm: confirmName } });
      onDone(`${editing.name} excluído com todos os dados.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      if (editing) {
        await api(`/partner/${pid}/clients/${editing.id}`, { method: 'PUT', body: { name, limits } });
        onDone('Cliente atualizado.');
      } else {
        await api(`/partner/${pid}/clients`, { method: 'POST', body: { name, ownerEmail, limits } });
        onDone(`Cliente criado. Enviamos o convite para ${ownerEmail}.`);
      }
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    try {
      const status = editing.status === 'ativa' ? 'suspensa' : 'ativa';
      await api(`/partner/${pid}/clients/${editing.id}`, { method: 'PUT', body: { status } });
      onDone(status === 'suspensa' ? `${editing.name} suspenso. A equipe dele não consegue mais usar a plataforma.` : `${editing.name} reativado.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="client-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 id="client-title">{editing ? editing.name : 'Novo cliente'}</h2>
          <p>{editing ? 'Ajuste os limites do plano deste cliente.' : 'O responsável recebe um convite para criar a senha e entrar com a sua marca.'}</p>
        </div>
        <div className="dialog-body">
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="c-name">Nome da empresa</label>
            <input id="c-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={fields.name ? 'true' : undefined} />
            {fields.name && <span className="field-error">{fields.name}</span>}
          </div>
          {!editing && (
            <div className="field">
              <label htmlFor="c-owner">E-mail do responsável</label>
              <input id="c-owner" className="input" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="nome@cliente.com.br" aria-invalid={fields.ownerEmail ? 'true' : undefined} />
              {fields.ownerEmail && <span className="field-error">{fields.ownerEmail}</span>}
            </div>
          )}
          <fieldset className="limits-grid">
            <legend className="label">Limites do plano</legend>
            {LIMIT_FIELDS.map(([k, label]) => (
              <div key={k} className="field">
                <label htmlFor={`l-${k}`}>{label}</label>
                <input
                  id={`l-${k}`}
                  className="input tabular"
                  inputMode="numeric"
                  value={limits[k]}
                  onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value.replace(/\D/g, '') }))}
                  placeholder={`Padrão: ${fmtNumber(defaults?.[k])}`}
                />
              </div>
            ))}
          </fieldset>
          <p className="muted">Campos vazios usam o padrão definido em Marca.</p>
          {editing && (
            <div className="danger-zone">
              {!deleting ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(true)}>
                  Excluir cliente e todos os dados
                </button>
              ) : (
                <>
                  <p>
                    A exclusão é definitiva: agentes, contexto, conversas e usuários de {editing.name} são apagados. Digite o nome da empresa para confirmar.
                  </p>
                  <div className="inline-form">
                    <div className="field">
                      <label htmlFor="c-confirm" className="visually-hidden">
                        Nome da empresa
                      </label>
                      <input id="c-confirm" className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={editing.name} />
                    </div>
                    <button type="button" className="btn btn-danger" disabled={busy || confirmName !== editing.name} onClick={removeClient}>
                      Excluir definitivamente
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="dialog-foot">
          {editing && (
            <button type="button" className={`btn ${editing.status === 'ativa' ? 'btn-danger' : 'btn-secondary'} dialog-foot-left`} onClick={toggleStatus} disabled={busy}>
              {editing.status === 'ativa' ? 'Suspender cliente' : 'Reativar cliente'}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {editing ? 'Salvar' : 'Criar e enviar convite'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// ---------- Marca ----------

export function BrandSettings({ pid, partner, reload, notify }) {
  const control = useBrandControl();
  const [v, setV] = useState(() => ({
    name: partner.name,
    colors: { ...partner.brand.colors },
    logo: partner.brand.logo,
    supportEmail: partner.brand.supportEmail,
    termsUrl: partner.brand.termsUrl,
    privacyUrl: partner.brand.privacyUrl,
    senderName: partner.brand.senderName,
    showPoweredBy: partner.brand.showPoweredBy,
    allowSignup: partner.settings.allowSignup,
    defaultLimits: { ...partner.settings.defaultLimits },
  }));
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));

  async function pickLogo(file) {
    if (!file) return;
    if (file.size > 200 * 1024) return setError('O logotipo precisa ter menos de 200 KB.');
    setError('');
    set('logo', await fileToDataUrl(file));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    try {
      const { partner: p } = await api(`/partner/${pid}/brand`, { method: 'PUT', body: v });
      // Se for a marca do domínio atual, aplica na hora.
      if (pid === 'me' && control) {
        control.setBrand({ ...control.brand, name: p.name, logo: p.brand.logo, colors: p.brand.colors, showPoweredBy: p.brand.showPoweredBy, allowSignup: p.settings.allowSignup, supportEmail: p.brand.supportEmail, termsUrl: p.brand.termsUrl, privacyUrl: p.brand.privacyUrl });
      }
      await reload();
      notify('Marca salva.');
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  const colorField = (k, label, hint) => (
    <div className="field">
      <label htmlFor={`color-${k}`}>{label}</label>
      <div className="color-row">
        <input type="color" value={v.colors[k]} onChange={(e) => set('colors', { ...v.colors, [k]: e.target.value })} aria-label={`${label}, seletor`} />
        <input id={`color-${k}`} className="input tabular" value={v.colors[k]} onChange={(e) => set('colors', { ...v.colors, [k]: e.target.value })} aria-invalid={fields[`color_${k}`] ? 'true' : undefined} />
      </div>
      <span className="hint">{hint}</span>
    </div>
  );

  return (
    <>
      <PageHead title="Marca" lede="Como a plataforma aparece para os seus clientes: nome, logotipo, cores, links e regras de cadastro." />
      <form className="brand-layout" onSubmit={save} noValidate>
        <div className="brand-form">
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <section className="panel">
            <div className="panel-head">
              <h2>Identidade</h2>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="b-name">Nome da plataforma</label>
                <input id="b-name" className="input" value={v.name} onChange={(e) => set('name', e.target.value)} aria-invalid={fields.name ? 'true' : undefined} />
              </div>
              <div className="field">
                <span className="label">Logotipo</span>
                <div className="logo-row">
                  {v.logo ? <img src={v.logo} alt="Logotipo atual" className="logo-preview" /> : <span className="muted">Sem logotipo (usamos a inicial do nome)</span>}
                  <label className="btn btn-secondary btn-sm">
                    Enviar imagem
                    <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="visually-hidden" onChange={(e) => pickLogo(e.target.files?.[0])} />
                  </label>
                  {v.logo && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('logo', null)}>
                      Remover
                    </button>
                  )}
                </div>
                <span className="hint">PNG, SVG ou WebP com fundo transparente, até 200 KB. Altura ideal: 60 px.</span>
              </div>
              {colorField('action', 'Cor da ação principal', 'Botões principais. Prefira uma cor clara e viva.')}
              {colorField('dark', 'Cor escura', 'Painéis escuros e destaques.')}
              {colorField('accent', 'Cor de destaque', 'Títulos destacados, links e itens selecionados.')}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Contato e documentos</h2>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="b-support">E-mail de suporte</label>
                <input id="b-support" className="input" type="email" value={v.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} aria-invalid={fields.supportEmail ? 'true' : undefined} />
              </div>
              <div className="field">
                <label htmlFor="b-sender">Nome do remetente dos e-mails</label>
                <input id="b-sender" className="input" value={v.senderName} onChange={(e) => set('senderName', e.target.value)} placeholder={v.name} />
              </div>
              <div className="field">
                <label htmlFor="b-terms">Link dos Termos de uso</label>
                <input id="b-terms" className="input" value={v.termsUrl} onChange={(e) => set('termsUrl', e.target.value)} placeholder="https://" aria-invalid={fields.termsUrl ? 'true' : undefined} />
              </div>
              <div className="field">
                <label htmlFor="b-privacy">Link da Política de privacidade</label>
                <input id="b-privacy" className="input" value={v.privacyUrl} onChange={(e) => set('privacyUrl', e.target.value)} placeholder="https://" aria-invalid={fields.privacyUrl ? 'true' : undefined} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Cadastro e plano padrão</h2>
            </div>
            <label className="check-line">
              <input type="checkbox" checked={v.allowSignup} onChange={(e) => set('allowSignup', e.target.checked)} />
              Permitir que empresas criem conta sozinhas pelo site
            </label>
            {!partner.isPlatform && (
              <label className="check-line">
                <input type="checkbox" checked={v.showPoweredBy} onChange={(e) => set('showPoweredBy', e.target.checked)} />
                Mostrar "tecnologia Squad AI" no rodapé
              </label>
            )}
            <fieldset className="limits-grid">
              <legend className="label">Limites padrão para novos clientes</legend>
              {LIMIT_FIELDS.map(([k, label]) => (
                <div key={k} className="field">
                  <label htmlFor={`d-${k}`}>{label}</label>
                  <input
                    id={`d-${k}`}
                    className="input tabular"
                    inputMode="numeric"
                    value={v.defaultLimits[k]}
                    onChange={(e) => set('defaultLimits', { ...v.defaultLimits, [k]: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
              ))}
            </fieldset>
          </section>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              Salvar marca
            </button>
          </div>
        </div>

        <aside className="brand-preview" aria-label="Prévia da marca">
          <span className="muted">Prévia</span>
          <div className="preview-card" style={{ '--p-action': v.colors.action, '--p-dark': v.colors.dark, '--p-accent': v.colors.accent }}>
            <div className="preview-top">
              {v.logo ? <img src={v.logo} alt="" /> : <span className="preview-mono">{v.name.trim()[0]?.toUpperCase()}</span>}
              {!v.logo && <strong>{v.name}</strong>}
            </div>
            <p className="preview-title">
              Processos repetitivos, <span>resolvidos por agentes.</span>
            </p>
            <span className="preview-btn">Criar conta da empresa</span>
            <div className="preview-band">
              <strong>2 ações esperam sua aprovação</strong>
              <span className="preview-btn">Revisar</span>
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}

// ---------- Domínios ----------

export function Domains({ pid, partner, reload, notify }) {
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/partner/${pid}/domains`, { method: 'POST', body: { domain } });
      setDomain('');
      await reload();
      notify('Domínio adicionado. Ele passa a funcionar assim que o DNS propagar.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(d) {
    try {
      await api(`/partner/${pid}/domains/${encodeURIComponent(d)}`, { method: 'DELETE' });
      await reload();
      notify(`${d} removido.`);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <>
      <PageHead title="Domínios" lede="Os endereços em que seus clientes acessam a plataforma com a sua marca." />
      <section className="panel">
        <div className="panel-head">
          <h2>Adicionar domínio</h2>
        </div>
        <form className="inline-form" onSubmit={add} noValidate>
          <div className="field">
            <label htmlFor="new-domain">Domínio</label>
            <input id="new-domain" className="input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.suaempresa.com.br" aria-invalid={error ? 'true' : undefined} />
            {error && <span className="field-error">{error}</span>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !domain}>
            Adicionar
          </button>
        </form>
        <ol className="setup-steps dns-steps">
          <li>
            No provedor de DNS do domínio, crie um registro <strong>CNAME</strong> com o nome escolhido (ex.: app) apontando para <code>{partner.platformHost || 'o endereço da plataforma'}</code>.
          </li>
          <li>Adicione o mesmo domínio no painel da hospedagem da plataforma, para o certificado HTTPS ser emitido.</li>
          <li>Em alguns minutos o endereço passa a abrir com a sua marca.</li>
        </ol>
      </section>
      <section className="panel panel-flush">
        {partner.domains.length === 0 ? (
          <EmptyState title="Nenhum domínio ainda" text="Sem domínio próprio, seus clientes não conseguem acessar com a sua marca." />
        ) : (
          <ul className="member-list">
            {partner.domains.map((d) => (
              <li key={d} className="member">
                <div className="member-info">
                  <strong>{d}</strong>
                  <a className="muted" href={`https://${d}`} target="_blank" rel="noreferrer">
                    Abrir https://{d}
                  </a>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(d)} aria-label={`Remover ${d}`}>
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ---------- Apps OAuth próprios ----------

const OAUTH_INFO = {
  microsoft: { name: 'Microsoft 365', where: 'Portal do Microsoft Entra, em Registros de aplicativos' },
  google: { name: 'Google Workspace', where: 'Google Cloud Console, em APIs e serviços > Credenciais' },
  slack: { name: 'Slack', where: 'api.slack.com/apps, em OAuth & Permissions' },
};

export function OAuthApps({ pid, partner, reload, notify }) {
  return (
    <>
      <PageHead
        title="Apps próprios"
        lede="Opcional. Com apps próprios, a tela de consentimento do Microsoft, do Google e do Slack mostra a sua marca. Sem eles, seus clientes usam os apps da plataforma."
      />
      <div className="oauth-grid">
        {Object.keys(OAUTH_INFO).map((k) => (
          <OAuthCard key={k} provider={k} pid={pid} partner={partner} reload={reload} notify={notify} />
        ))}
      </div>
    </>
  );
}

function OAuthCard({ provider, pid, partner, reload, notify }) {
  const info = OAUTH_INFO[provider];
  const current = partner.oauth[provider];
  const [clientId, setClientId] = useState(current.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [tenant, setTenant] = useState(current.tenant || 'common');
  const [restricted, setRestricted] = useState(current.restricted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const redirect = `https://${partner.platformHost || 'sua-plataforma'}/api/oauth/callback/${provider}`;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/partner/${pid}/oauth/${provider}`, { method: 'PUT', body: { clientId, clientSecret, tenant, restricted } });
      setClientSecret('');
      await reload();
      notify(`App do ${info.name} salvo.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    await api(`/partner/${pid}/oauth/${provider}`, { method: 'DELETE' });
    await reload();
    notify(`Voltamos a usar o app da plataforma para o ${info.name}.`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirect);
      notify('Endereço copiado.');
    } catch {
      notify('Selecione o endereço e copie com Ctrl+C ou Cmd+C.', 'error');
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{info.name}</h2>
        <span className={`pill ${current.configured ? 'pill-ok' : 'pill-neutral'}`}>{current.configured ? 'App próprio' : 'App da plataforma'}</span>
      </div>
      <form className="oauth-form" onSubmit={save} noValidate>
        {error && <div className="form-alert">{error}</div>}
        <p className="muted">Onde criar: {info.where}.</p>
        <div className="field">
          <span className="label">Endereço de retorno (cadastre no app)</span>
          <div className="copy-row">
            <input className="input mono" value={redirect} readOnly onFocus={(e) => e.target.select()} aria-label="Endereço de retorno" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label="Copiar endereço de retorno">
              <IconCopy />
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${provider}-id`}>Client ID</label>
          <input id={`${provider}-id`} className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${provider}-secret`}>Client Secret</label>
          <input id={`${provider}-secret`} className="input mono" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" placeholder={current.configured ? 'Guardado. Preencha só para trocar.' : ''} />
        </div>
        {provider === 'microsoft' && (
          <div className="field">
            <label htmlFor="ms-tenant">Locatário</label>
            <input id="ms-tenant" className="input mono" value={tenant} onChange={(e) => setTenant(e.target.value)} />
            <span className="hint">Use "common" para atender empresas de qualquer locatário.</span>
          </div>
        )}
        {provider === 'google' && (
          <label className="check-line">
            <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
            Este app passou na verificação de escopos restritos (libera buscar e-mails e arquivos)
          </label>
        )}
        <div className="oauth-actions">
          {current.configured && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={remove}>
              Usar o app da plataforma
            </button>
          )}
          <button type="submit" className="btn btn-secondary" disabled={busy || !clientId}>
            Salvar app
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- Equipe do parceiro ----------

export function PartnerTeam({ pid, notify }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/partner/${pid}/team`));
    } catch (err) {
      setError(err.message);
    }
  }, [pid]);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/partner/${pid}/team`, { method: 'POST', body: { email } });
      notify(`Convite enviado para ${email}.`);
      setEmail('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Equipe" lede="Pessoas que administram este painel: clientes, marca e domínios." />
      <section className="panel">
        <form className="inline-form" onSubmit={invite} noValidate>
          <div className="field">
            <label htmlFor="pt-email">Convidar por e-mail</label>
            <input id="pt-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@suaempresa.com.br" aria-invalid={error ? 'true' : undefined} />
            {error && <span className="field-error">{error}</span>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || !email}>
            Enviar convite
          </button>
        </form>
      </section>
      <section className="panel panel-flush">
        {!data ? (
          <div style={{ padding: 16 }}>
            <LoadingRows rows={2} />
          </div>
        ) : (
          <ul className="member-list">
            {data.members.map((m) => (
              <li key={m.id} className="member">
                <div className="member-info">
                  <strong>{m.name}</strong>
                  <span className="muted">{m.email}</span>
                </div>
                <span className="muted">Desde {formatDate(m.created_at)}</span>
              </li>
            ))}
            {data.invites.map((i) => (
              <li key={`i${i.id}`} className="member is-invite">
                <div className="member-info">
                  <strong>{i.email}</strong>
                  <span className="muted">Convite enviado em {formatDate(i.created_at)}</span>
                </div>
                <span className="pill pill-warn">Pendente</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

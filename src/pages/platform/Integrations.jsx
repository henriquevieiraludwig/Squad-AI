import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, DEMO } from '../../api.js';
import { PROVIDER_BY_ID } from '../../../shared/catalog.js';
import { IconCopy, IconAlert, IconCheck } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, Monogram, ErrorState, LoadingRows, formatDate } from './common.jsx';

export default function Integrations({ notify, refreshSummary }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('todas');
  const [connecting, setConnecting] = useState(null); // provedor com diálogo de token aberto
  const [busy, setBusy] = useState(null);
  const [confirmOff, setConfirmOff] = useState(null);
  const [warning, setWarning] = useState(null);
  const [params, setParams] = useSearchParams();

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/integrations'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Retorno do login externo (OAuth): ?conectado=google ou ?erro=...
  const oauthDone = params.get('conectado');
  const oauthError = params.get('erro');

  const providers = data?.providers || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      const inGroup = group === 'todas' || (group === 'conectadas' ? p.connected : p.group === group);
      const text = `${p.name} ${p.summary} ${(p.services || []).join(' ')}`.toLowerCase();
      return inGroup && (!q || text.includes(q));
    });
  }, [providers, query, group]);

  async function connectOAuth(p) {
    setBusy(p.id);
    try {
      const { url, connected } = await api(`/integrations/${p.id}/oauth`, { method: 'POST' });
      if (connected) {
        // Demonstração: a conexão é simulada sem sair da página.
        await load();
        refreshSummary();
        notify(`${p.name} conectado.`);
        setBusy(null);
        return;
      }
      window.location.href = url;
    } catch (err) {
      notify(err.message, 'error');
      setBusy(null);
    }
  }

  async function disconnect(p) {
    setBusy(p.id);
    try {
      await api(`/integrations/${p.id}`, { method: 'DELETE' });
      await load();
      refreshSummary();
      notify(`${p.name} desconectado. As ações dessa plataforma deixam de funcionar para os agentes.`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
      setConfirmOff(null);
    }
  }

  async function setRoute(p, agentId) {
    try {
      await api(`/channels/${p.id}`, { method: 'PUT', body: { agentId: agentId || null } });
      await load();
      notify(agentId ? `Agente definido para o ${p.name}.` : `O ${p.name} ficou sem agente respondendo.`);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const counts = {
    todas: providers.length,
    produtividade: providers.filter((p) => p.group === 'produtividade').length,
    comunicacao: providers.filter((p) => p.group === 'comunicacao').length,
    conectadas: providers.filter((p) => p.connected).length,
  };

  return (
    <>
      <PageHead
        title="Integrações"
        lede="Conecte as plataformas da empresa. Depois, em cada agente, escolha quais ações ele pode executar e quais precisam de aprovação."
      />

      {oauthDone && (
        <div className="alert alert-success page-alert" role="status">
          <IconCheck size={18} />
          <span>{PROVIDER_BY_ID[oauthDone]?.name || oauthDone} conectado. Libere as ações nos agentes que vão usar essa conta.</span>
          <button className="alert-close" onClick={() => setParams({})} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}
      {oauthError && (
        <div className="alert alert-error page-alert" role="alert">
          <IconAlert />
          <span>{oauthError}</span>
          <button className="alert-close" onClick={() => setParams({})} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}
      {warning && (
        <div className="alert alert-warn page-alert" role="status">
          <IconAlert />
          <span>{warning}</span>
          <button className="alert-close" onClick={() => setWarning(null)} aria-label="Fechar aviso">
            ×
          </button>
        </div>
      )}

      <div className="toolbar">
        <SearchInput id="integration-search" label="Buscar integrações" value={query} onChange={setQuery} placeholder="Buscar, por exemplo Outlook, WhatsApp ou agenda" />
        <FilterChips
          label="Filtrar integrações"
          value={group}
          onChange={setGroup}
          options={[
            { value: 'todas', label: 'Todas', count: counts.todas },
            { value: 'produtividade', label: 'Produtividade', count: counts.produtividade },
            { value: 'comunicacao', label: 'Comunicação', count: counts.comunicacao },
            { value: 'conectadas', label: 'Conectadas', count: counts.conectadas },
          ]}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : filtered.length === 0 ? (
        <div className="panel empty">
          <h3>{group === 'conectadas' ? 'Nenhuma integração conectada ainda' : 'Nenhuma integração encontrada'}</h3>
          <p>{group === 'conectadas' ? 'Comece pelo Microsoft 365 ou pelo Google Workspace.' : 'Tente outro termo de busca.'}</p>
        </div>
      ) : (
        <ul className="integration-grid">
          {filtered.map((p) => (
            <IntegrationCard
              key={p.id}
              p={p}
              parent={p.via ? PROVIDER_BY_ID[p.via] : null}
              agents={data.agents}
              busy={busy === p.id}
              confirming={confirmOff === p.id}
              onConnect={() => (p.auth === 'token' ? setConnecting(p) : connectOAuth(p))}
              onAskDisconnect={() => setConfirmOff(p.id)}
              onCancelDisconnect={() => setConfirmOff(null)}
              onDisconnect={() => disconnect(p)}
              onRoute={(agentId) => setRoute(p, agentId)}
              notify={notify}
            />
          ))}
        </ul>
      )}

      {connecting && (
        <TokenDialog
          provider={connecting}
          onClose={() => setConnecting(null)}
          onConnected={async (res) => {
            setConnecting(null);
            await load();
            refreshSummary();
            if (res.warning) setWarning(res.warning);
            notify(`${connecting.name} conectado como ${res.accountLabel}.`);
          }}
        />
      )}
    </>
  );
}

function IntegrationCard({ p, parent, agents, busy, confirming, onConnect, onAskDisconnect, onCancelDisconnect, onDisconnect, onRoute, notify }) {
  let status;
  if (p.connected) status = <span className="pill pill-ok">Conectado</span>;
  else if (!p.platformReady) status = <span className="pill pill-neutral">Aguardando configuração</span>;
  else status = <span className="pill pill-neutral">Não conectado</span>;

  return (
    <li className={`integration ${p.connected ? 'is-connected' : ''}`}>
      <div className="integration-head">
        <Monogram letter={p.monogram} />
        <div className="integration-title">
          <h3>{p.name}</h3>
          {status}
        </div>
      </div>
      <p className="integration-summary">{p.summary}</p>

      {p.services && (
        <ul className="tags" aria-label="Serviços">
          {p.services.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}

      {p.connected && p.accountLabel && (
        <p className="integration-account">
          {p.via ? `Pela conta ${p.accountLabel} do ${parent.name}` : `Conta ${p.accountLabel}`}
          {p.connectedAt && !p.via && <>, conectada em {formatDate(p.connectedAt)}</>}
        </p>
      )}

      {!p.platformReady && !p.connected && (
        <p className="integration-note">
          O administrador da plataforma precisa cadastrar o app {parent ? `do ${parent.name}` : `do ${p.name}`} ({p.missingEnv.join(', ')}).
        </p>
      )}

      {p.channel && p.connected && <ChannelSetup p={p} agents={agents} onRoute={onRoute} notify={notify} />}

      <div className="integration-foot">
        <span className="muted tabular">
          {p.actionCount} {p.actionCount === 1 ? 'ação disponível' : 'ações disponíveis'} para os agentes
        </span>
        {p.via ? (
          <span className="muted">Usa a conexão do {parent.name}</span>
        ) : p.connected ? (
          confirming ? (
            <span className="confirm-row">
              <button className="btn btn-ghost btn-sm" onClick={onCancelDisconnect}>
                Cancelar
              </button>
              <button className="btn btn-danger btn-sm" onClick={onDisconnect} disabled={busy}>
                {busy && <span className="spinner" aria-hidden="true" />}
                Confirmar desconexão
              </button>
            </span>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={onAskDisconnect}>
              Desconectar
            </button>
          )
        ) : (
          <button className="btn btn-dark btn-sm" onClick={onConnect} disabled={busy || !p.platformReady}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
        )}
      </div>
    </li>
  );
}

function CopyField({ id, label, value, notify }) {
  const ref = useRef(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copiado.`);
    } catch {
      ref.current?.select();
      notify('Selecione o texto e copie com Ctrl+C ou Cmd+C.', 'error');
    }
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input id={id} ref={ref} className="input mono" value={value} readOnly onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label={`Copiar ${label}`}>
          <IconCopy />
        </button>
      </div>
    </div>
  );
}

function ChannelSetup({ p, agents, onRoute, notify }) {
  return (
    <div className="channel-setup">
      <div className="field">
        <label htmlFor={`route-${p.id}`}>Agente que responde neste canal</label>
        <select id={`route-${p.id}`} className="input" value={p.routeAgentId || ''} onChange={(e) => onRoute(Number(e.target.value) || null)}>
          <option value="">Nenhum (mensagens ficam sem resposta)</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.area})
            </option>
          ))}
        </select>
      </div>
      {p.id === 'whatsapp' && (
        <>
          <CopyField id={`hook-${p.id}`} label="URL de callback do webhook" value={p.webhookUrl} notify={notify} />
          <CopyField id={`verify-${p.id}`} label="Token de verificação" value={p.verifyToken} notify={notify} />
          <p className="hint">No painel da Meta, em WhatsApp &gt; Configuração, cole os dois valores e assine o campo messages.</p>
        </>
      )}
      {p.id === 'telegram' && <p className="hint">O Telegram já envia as mensagens do bot para o Squad AI.</p>}
    </div>
  );
}

function TokenDialog({ provider, onClose, onConnected }) {
  const ref = useRef(null);
  const [values, setValues] = useState(() => Object.fromEntries(provider.fields.map((f) => [f.key, ''])));
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit(e) {
    e.preventDefault();
    const local = {};
    for (const f of provider.fields) if (!f.optional && !values[f.key].trim()) local[f.key] = 'Campo obrigatório.';
    setFields(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    setError('');
    try {
      const res = await api(`/integrations/${provider.id}`, { method: 'POST', body: values });
      onConnected(res);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="token-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 id="token-title">Conectar {provider.name}</h2>
          <p>{provider.summary}</p>
        </div>
        <div className="dialog-body">
          <ol className="setup-steps">
            {provider.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          {provider.fields.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`f-${f.key}`}>
                {f.label}
                {f.optional && <span className="muted"> (opcional)</span>}
              </label>
              <input
                id={`f-${f.key}`}
                className="input mono"
                type={f.secret ? 'password' : 'text'}
                autoComplete="off"
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                aria-invalid={fields[f.key] ? 'true' : undefined}
                aria-describedby={`f-${f.key}-hint`}
              />
              <span id={`f-${f.key}-hint`} className={fields[f.key] ? 'field-error' : 'hint'}>
                {fields[f.key] || f.hint}
              </span>
            </div>
          ))}
          {DEMO && <p className="hint">Na demonstração, qualquer valor no formato certo é aceito e nada é enviado à plataforma.</p>}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? 'Conectando…' : 'Conectar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

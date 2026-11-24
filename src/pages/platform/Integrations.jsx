import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, DEMO } from '../../api.js';
import { PROVIDER_BY_ID } from '../../../shared/catalog.js';
import { IconCopy, IconAlert, IconCheck } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, Monogram, ErrorState, LoadingRows, formatDate } from './common.jsx';
import logoOutlook from '../../assets/logos/outlook.webp';
import logoTeams from '../../assets/logos/teams.webp';
import logoOnedrive from '../../assets/logos/onedrive.webp';
import logoSharepoint from '../../assets/logos/sharepoint.webp';
import logoGoogleDrive from '../../assets/logos/google-drive.webp';
import logoGoogleChat from '../../assets/logos/google-chat.webp';
import logoWhatsapp from '../../assets/logos/whatsapp.webp';
import logoTelegram from '../../assets/logos/telegram.webp';
import logoGmail from '../../assets/logos/gmail.webp';
import logoGoogleDocs from '../../assets/logos/google-docs.webp';
import logoGoogleForms from '../../assets/logos/google-forms.webp';
import logoGoogleMeet from '../../assets/logos/google-meet.webp';
import logoGoogleSheets from '../../assets/logos/google-sheets.webp';
import logoGoogleSlides from '../../assets/logos/google-slides.svg';
import logoGoogleCalendar from '../../assets/logos/google-calendar.svg';
import logoSlack from '../../assets/logos/slack.svg';

// Cada serviço aparece como um cartão próprio. Por baixo, Microsoft e Google usam um único login por empresa:
// conectar um cartão da família conecta todos os outros da mesma conta.
const SERVICE_CARDS = [
  { key: 'outlook', parent: 'microsoft', name: 'Outlook', logo: logoOutlook, services: ['Outlook', 'Calendário'], summary: 'E-mails e calendário do Outlook: enviar, buscar e responder e-mails, criar e consultar eventos com reunião no Teams.' },
  { key: 'teams', parent: 'microsoft', name: 'Microsoft Teams', logo: logoTeams, services: ['Teams'], summary: 'Mensagens em canais das equipes e conversas diretas com pessoas da empresa.' },
  { key: 'onedrive', parent: 'microsoft', name: 'OneDrive', logo: logoOnedrive, services: ['OneDrive'], summary: 'Buscar arquivos e salvar relatórios, atas e resumos no OneDrive.' },
  { key: 'sharepoint', parent: 'microsoft', name: 'SharePoint', logo: logoSharepoint, services: ['SharePoint'], summary: 'Buscar documentos em todos os sites do SharePoint da empresa.' },
  { key: 'gmail', parent: 'google', name: 'Gmail', logo: logoGmail, services: ['Gmail'], summary: 'Enviar, buscar e responder e-mails pela conta Google da empresa.' },
  { key: 'gcal', parent: 'google', name: 'Google Agenda', logo: logoGoogleCalendar, services: ['Agenda'], summary: 'Criar eventos com link do Meet e consultar a agenda.' },
  { key: 'gmeet', parent: 'google', name: 'Google Meet', logo: logoGoogleMeet, services: ['Agenda'], summary: 'Reuniões com link do Meet criadas junto com os eventos da agenda, além de remarcar e cancelar.' },
  { key: 'gdrive', parent: 'google', name: 'Google Drive', logo: logoGoogleDrive, services: ['Drive'], summary: 'Criar documentos e buscar arquivos no Drive.' },
  { key: 'gchat', parent: 'google', name: 'Google Chat', logo: logoGoogleChat, services: ['Google Chat'], summary: 'Enviar mensagens nos espaços do Google Chat.' },
  { key: 'gsheets', parent: 'google', name: 'Google Planilhas', logo: logoGoogleSheets, services: ['Planilhas'], summary: 'Criar, ler e atualizar planilhas.' },
  { key: 'gdocs', parent: 'google', name: 'Google Docs', logo: logoGoogleDocs, services: ['Documentos'], summary: 'Ler documentos e acrescentar texto.' },
  { key: 'gslides', parent: 'google', name: 'Google Apresentações', logo: logoGoogleSlides, services: ['Apresentações'], summary: 'Criar e ler apresentações.' },
  { key: 'gforms', parent: 'google', name: 'Google Formulários', logo: logoGoogleForms, services: ['Formulários'], summary: 'Criar formulários e ler as respostas.' },
];
const PROVIDER_LOGOS = { whatsapp: logoWhatsapp, telegram: logoTelegram, slack: logoSlack };
const FAMILY = {
  microsoft: { account: 'Microsoft', members: 'Outlook, Teams, OneDrive e SharePoint' },
  google: { account: 'Google', members: 'Gmail, Agenda, Drive, Chat, Planilhas, Docs, Apresentações e Formulários' },
};
import { can } from '../../auth.jsx';

export default function Integrations({ user, notify, refreshSummary }) {
  const editable = can(user, 'configurar');
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

  // Lista de cartões: serviços de Microsoft e Google separados; os demais como vêm.
  const providers = useMemo(() => {
    const list = data?.providers || [];
    const byId = Object.fromEntries(list.map((p) => [p.id, p]));
    const actions = data?.actions || [];
    const cards = [];
    for (const p of list) {
      if (p.via) continue; // Teams e Google Chat já viram cartões próprios abaixo
      if (FAMILY[p.id]) {
        for (const c of SERVICE_CARDS.filter((x) => x.parent === p.id)) {
          const restricted = (c.key === 'gmail' || c.key === 'gdrive') && p.note;
          cards.push({
            ...p,
            id: c.key,
            providerId: p.id,
            name: c.name,
            logo: c.logo,
            monogram: c.monogram || c.name[0],
            summary: c.summary,
            services: null,
            note: restricted ? p.note : null,
            family: FAMILY[p.id],
            actionCount: actions.filter((a) => a.provider === p.id && c.services.includes(a.service)).length,
          });
        }
      } else {
        cards.push({ ...p, providerId: p.id, logo: PROVIDER_LOGOS[p.id], services: p.id === 'slack' ? null : p.services });
      }
    }
    void byId;
    return cards;
  }, [data]);
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
      const { url, connected } = await api(`/integrations/${p.providerId || p.id}/oauth`, { method: 'POST' });
      if (connected) {
        // Demonstração: a conexão é simulada sem sair da página.
        await load();
        refreshSummary();
        notify(p.family ? `Conta ${p.family.account} conectada: ${p.family.members} liberados.` : `${p.name} conectado.`);
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
      await api(`/integrations/${p.providerId || p.id}`, { method: 'DELETE' });
      await load();
      refreshSummary();
      notify(p.family ? `Conta ${p.family.account} desconectada: ${p.family.members} deixam de funcionar para os agentes.` : `${p.name} desconectado. As ações dessa plataforma deixam de funcionar para os agentes.`);
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
          <span>
            {FAMILY[oauthDone] ? `Conta ${FAMILY[oauthDone].account} conectada: ${FAMILY[oauthDone].members} liberados.` : `${PROVIDER_BY_ID[oauthDone]?.name || oauthDone} conectado.`} Libere as ações nos agentes que vão usar essa conta.
          </span>
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
          <p>{group === 'conectadas' ? 'Comece pelo Outlook ou pelo Gmail: um login libera todos os apps da mesma conta.' : 'Tente outro termo de busca.'}</p>
        </div>
      ) : (
        <ul className="integration-grid">
          {filtered.map((p) => (
            <IntegrationCard
              key={p.id}
              p={p}
              parent={null}
              agents={data.agents}
              busy={busy === p.id}
              confirming={confirmOff === p.id}
              onConnect={() => (p.auth === 'token' ? setConnecting(p) : connectOAuth(p))}
              onAskDisconnect={() => setConfirmOff(p.id)}
              onCancelDisconnect={() => setConfirmOff(null)}
              onDisconnect={() => disconnect(p)}
              onRoute={(agentId) => setRoute(p, agentId)}
              notify={notify}
              editable={editable}
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

function IntegrationCard({ p, parent, agents, busy, confirming, onConnect, onAskDisconnect, onCancelDisconnect, onDisconnect, onRoute, notify, editable }) {
  let status;
  const soon = p.comingSoon && !p.connected;
  if (p.connected) status = <span className="pill pill-ok">Conectado</span>;
  else if (soon) status = <span className="pill pill-warn">Em andamento</span>;
  else if (!p.platformReady) status = <span className="pill pill-neutral">Aguardando configuração</span>;
  else status = <span className="pill pill-neutral">Não conectado</span>;

  return (
    <li className={`integration ${p.connected ? 'is-connected' : ''}`}>
      <div className="integration-head">
        {p.logo ? <img src={p.logo} alt="" className="integration-logo" /> : <Monogram letter={p.monogram} />}
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
          Conta {p.accountLabel}
          {p.connectedAt && <>, conectada em {formatDate(p.connectedAt)}</>}
        </p>
      )}
      {p.family && <p className="integration-family muted">Mesmo login da conta {p.family.account}: conectar aqui libera todos os apps {p.family.account}.</p>}

      {soon && <p className="integration-note integration-note-soft">Estamos finalizando esta integração. Em breve ela poderá ser conectada.</p>}
      {!soon && !p.platformReady && !p.connected && (
        <p className="integration-note">Esta integração ainda não foi liberada na plataforma. Fale com o suporte.</p>
      )}
      {p.note && <p className="integration-note integration-note-soft">{p.note}</p>}

      {p.channel && p.connected && editable && <ChannelSetup p={p} agents={agents} onRoute={onRoute} notify={notify} />}

      <div className="integration-foot">
        <span className="muted tabular">
          {p.actionCount} {p.actionCount === 1 ? 'ação disponível' : 'ações disponíveis'} para os agentes
        </span>
        {p.via ? (
          <span className="muted">Usa a conexão do {parent.name}</span>
        ) : !editable ? null : p.connected ? (
          confirming ? (
            <span className="confirm-row">
              <button className="btn btn-ghost btn-sm" onClick={onCancelDisconnect}>
                Cancelar
              </button>
              <button className="btn btn-danger btn-sm" onClick={onDisconnect} disabled={busy} title={p.family ? `Desconecta ${p.family.members}` : undefined}>
                {busy && <span className="spinner" aria-hidden="true" />}
                {p.family ? `Desconectar conta ${p.family.account}` : 'Confirmar desconexão'}
              </button>
            </span>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={onAskDisconnect}>
              Desconectar
            </button>
          )
        ) : soon ? (
          <button className="btn btn-secondary btn-sm" disabled title="Integração em andamento">
            Em breve
          </button>
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

const OPENING_STATUS = {
  APPROVED: ['Aprovado', 'O agente já consegue iniciar conversas com quem não escreveu nas últimas 24 horas.'],
  PENDING: ['Em análise na Meta', 'Costuma levar de minutos a algumas horas. Clique em Verificar para atualizar.'],
  IN_APPEAL: ['Em recurso na Meta', 'Aguarde a resposta da Meta.'],
  REJECTED: ['Recusado pela Meta', 'Tente criar como marketing (a Meta costuma aprovar; cada envio custa um pouco mais).'],
  PAUSED: ['Pausado pela Meta', 'A Meta pausou o modelo por baixa qualidade. Tente de novo mais tarde.'],
  DISABLED: ['Desativado pela Meta', 'Crie de novo como marketing.'],
};

// Modelo de abertura: fora da janela de 24 horas, a Meta só entrega mensagens de modelo aprovado.
function OpeningTemplate({ opening = {}, notify }) {
  const [state, setState] = useState(opening);
  const [waba, setWaba] = useState(opening.wabaId || '');
  const [busy, setBusy] = useState(false);
  async function run(body) {
    setBusy(true);
    try {
      const r = await api('/integrations/whatsapp/opening-template', { method: 'POST', body: { wabaId: waba, ...body } });
      setState(r.opening);
      notify(body.refresh ? 'Status atualizado.' : 'Modelo enviado para aprovação da Meta.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }
  const [label, help] = OPENING_STATUS[state.status] || [];
  return (
    <div className="opening-template">
      <strong>Iniciar conversas (fora das 24 horas)</strong>
      <p className="hint">
        A Meta só entrega mensagem para quem não escreveu nas últimas 24 horas se ela for um modelo aprovado. Com o modelo de abertura, o agente
        manda o recado dentro dele automaticamente: "Olá! Aqui é (sua empresa). Tenho uma mensagem para você: (recado). Responda esta mensagem para
        continuarmos a conversa."
      </p>
      {state.status ? (
        <p>
          <span className={`pill ${state.status === 'APPROVED' ? 'pill-ok' : state.status === 'REJECTED' ? 'pill-danger' : 'pill-warn'}`}>{label || state.status}</span>{' '}
          <span className="hint">{help}</span>
          {state.rejectedReason && <span className="hint"> Motivo: {state.rejectedReason}.</span>}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="waba-id">WABA ID (ID da conta do WhatsApp Business)</label>
        <input id="waba-id" className="input mono" value={waba} onChange={(e) => setWaba(e.target.value.replace(/\D/g, ''))} placeholder="Só números, ex.: 123456789012345" />
      </div>
      <div className="row-actions">
        {!state.status && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !waba} onClick={() => run({})}>
            {busy ? 'Criando...' : 'Criar modelo de abertura'}
          </button>
        )}
        {state.status && state.status !== 'APPROVED' && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ refresh: true })}>
            Verificar aprovação
          </button>
        )}
        {['REJECTED', 'DISABLED'].includes(state.status) && state.category !== 'MARKETING' && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run({ category: 'MARKETING' })}>
            Criar como marketing
          </button>
        )}
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
          <p className="hint">No painel da Meta (ou do seu provedor, como a Datafy), cadastre a URL e assine o evento messages.</p>
          <OpeningTemplate opening={p.opening} notify={notify} />
          {p.failures?.length > 0 && (
            <div className="alert alert-error">
              <strong>Mensagens não entregues nos últimos 7 dias</strong>
              <ul className="delivery-failures">
                {p.failures.map((f, i) => (
                  <li key={i}>
                    <span className="mono">+{f.recipient}</span>: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {p.id === 'telegram' && <p className="hint">O Telegram já envia as mensagens do bot para a plataforma.</p>}
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

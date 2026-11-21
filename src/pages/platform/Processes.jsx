import { useCallback, useEffect, useRef, useState } from 'react';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconProcess, IconPlus, IconTrash } from '../../components/Icons.jsx';
import { PageHead, SearchInput, FilterChips, EmptyState, ErrorState, LoadingRows, formatDate } from './common.jsx';

const EMPTY = { title: '', agentId: '', trigger: '', steps: [''], stepAgents: [''], rules: '', active: true };

export default function Processes({ user, agents, notify }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('todos');
  const [editing, setEditing] = useState(null);
  const editable = can(user, 'configurar');

  const load = useCallback(async () => {
    setError('');
    try {
      setList((await api('/processes')).processes);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = query.trim().toLowerCase();
  const shown = list?.filter(
    (p) => (filter === 'todos' || (filter === 'ativos' ? p.active : !p.active)) && (!q || `${p.title} ${p.trigger}`.toLowerCase().includes(q)),
  );

  return (
    <>
      <PageHead title="Processos" lede="Os passo a passos que os agentes seguem à risca, com as regras que não podem ser quebradas.">
        {editable && (
          <button className="btn btn-primary" onClick={() => setEditing(EMPTY)}>
            <IconPlus />
            Novo processo
          </button>
        )}
      </PageHead>

      {list?.length > 0 && (
        <div className="toolbar">
          <SearchInput id="process-search" label="Buscar processos" value={query} onChange={setQuery} placeholder="Buscar por nome ou situação" />
          <FilterChips
            label="Filtrar processos"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: 'Todos', count: list.length },
              { value: 'ativos', label: 'Ativos', count: list.filter((p) => p.active).length },
              { value: 'pausados', label: 'Pausados', count: list.filter((p) => !p.active).length },
            ]}
          />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !list ? (
        <LoadingRows rows={3} />
      ) : list.length === 0 ? (
        <section className="panel">
          <EmptyState icon={<IconProcess />} title="Nenhum processo mapeado ainda" text="Comece pelo que mais se repete: reembolso, agendamento, troca, abertura de chamado.">
            {editable && (
              <button className="btn btn-secondary" onClick={() => setEditing(EMPTY)}>
                Mapear o primeiro processo
              </button>
            )}
          </EmptyState>
        </section>
      ) : (
        <ul className="process-list">
          {shown.map((p) => (
            <li key={p.id} className={`process-card ${p.active ? '' : 'is-paused'}`}>
              <div className="process-card-head">
                <div>
                  <h3>{p.title}</h3>
                  <p className="muted">
                    {new Set((p.stepAgents || []).filter(Boolean)).size > 1
                      ? `Com ${new Set(p.stepAgents.filter(Boolean)).size} agentes`
                      : p.agentName
                        ? `Só para ${p.agentName}`
                        : 'Para todos os agentes'}
                    , atualizado em {formatDate(p.updatedAt)}
                  </p>
                </div>
                <span className={`pill ${p.active ? 'pill-ok' : 'pill-neutral'}`}>{p.active ? 'Ativo' : 'Pausado'}</span>
              </div>
              {p.trigger && <p className="process-trigger">Quando usar: {p.trigger}</p>}
              <ol className="process-steps">
                {p.steps.map((s, i) => {
                  const owner = (agents || []).find((a) => a.id === p.stepAgents?.[i]);
                  return (
                    <li key={i}>
                      {s}
                      {owner && (
                        <span className="step-owner">
                          <AgentAvatar avatar={owner.avatar} name={owner.name} size={18} />
                          {owner.name}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              {p.rules && <p className="process-rules">Regras: {p.rules}</p>}
              {editable && (
                <div className="process-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ ...p, agentId: p.agentId || '', stepAgents: (p.stepAgents || []).map((a) => (a ? String(a) : '')) })}>
                    Editar
                  </button>
                </div>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="panel empty">Nenhum processo encontrado com esses filtros.</li>}
        </ul>
      )}

      {editing && (
        <ProcessDialog
          initial={editing}
          agents={agents || []}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            notify(msg);
            load();
          }}
          notify={notify}
        />
      )}
    </>
  );
}

function ProcessDialog({ initial, agents, onClose, onSaved, notify }) {
  const ref = useRef(null);
  const [v, setV] = useState(() => {
    const steps = initial.steps?.length ? initial.steps : [''];
    return { ...initial, steps, stepAgents: steps.map((_, i) => (initial.stepAgents || [])[i] || '') };
  });
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const set = (k, val) => setV((x) => ({ ...x, [k]: val }));
  const setStep = (i, val) => setV((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? val : s)) }));
  const setStepAgent = (i, val) => setV((x) => ({ ...x, stepAgents: x.stepAgents.map((s, j) => (j === i ? val : s)) }));
  const removeStep = (i) => setV((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i), stepAgents: x.stepAgents.filter((_, j) => j !== i) }));
  const addStep = () => setV((x) => ({ ...x, steps: [...x.steps, ''], stepAgents: [...x.stepAgents, ''] }));
  const move = (i, d) =>
    setV((x) => {
      const steps = [...x.steps];
      const stepAgents = [...x.stepAgents];
      const j = i + d;
      if (j < 0 || j >= steps.length) return x;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      [stepAgents[i], stepAgents[j]] = [stepAgents[j], stepAgents[i]];
      return { ...x, steps, stepAgents };
    });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    const keep = v.steps.map((s, i) => [s, v.stepAgents[i]]).filter(([s]) => s.trim());
    const body = { ...v, agentId: v.agentId || null, steps: keep.map(([s]) => s), stepAgents: keep.map(([, a]) => (a ? Number(a) : null)) };
    try {
      if (initial.id) await api(`/processes/${initial.id}`, { method: 'PUT', body });
      else await api('/processes', { method: 'POST', body });
      onSaved(initial.id ? 'Processo atualizado.' : 'Processo criado. Os agentes já seguem estas etapas.');
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(`/processes/${initial.id}`, { method: 'DELETE' });
      onSaved('Processo removido.');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="process-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 id="process-title">{initial.id ? 'Editar processo' : 'Novo processo'}</h2>
          <p>Escreva como explicaria para alguém novo na equipe, uma etapa por linha.</p>
        </div>
        <div className="dialog-body">
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label htmlFor="p-title">Nome do processo</label>
              <input id="p-title" className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Reembolso de despesas" aria-invalid={fields.title ? 'true' : undefined} />
              {fields.title && <span className="field-error">{fields.title}</span>}
            </div>
            <div className="field">
              <label htmlFor="p-agent">Quem segue</label>
              <select id="p-agent" className="input" value={v.agentId} onChange={(e) => set('agentId', e.target.value)}>
                <option value="">Todos os agentes</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="p-trigger">Quando usar</label>
            <input id="p-trigger" className="input" value={v.trigger} onChange={(e) => set('trigger', e.target.value)} placeholder="Ex.: Quando um colaborador pedir reembolso de despesa de viagem" />
          </div>
          <fieldset className="field steps-editor">
            <legend className="label">Etapas</legend>
            {agents.length > 1 && (
              <span className="hint">
                Escolha o agente de cada etapa para montar um processo com vários agentes: quando chegar a etapa de outro agente, a tarefa é passada para ele
                e o resultado volta para continuar.
              </span>
            )}
            {v.steps.map((s, i) => (
              <div key={i} className="step-row">
                <span className="step-index tabular" aria-hidden="true">
                  {i + 1}
                </span>
                <input className="input" value={s} onChange={(e) => setStep(i, e.target.value)} aria-label={`Etapa ${i + 1}`} placeholder={i === 0 ? 'Ex.: Pedir a foto do recibo ou da nota fiscal' : 'Próxima etapa'} />
                {agents.length > 1 && (
                  <select className="input step-agent" value={v.stepAgents[i] || ''} onChange={(e) => setStepAgent(i, e.target.value)} aria-label={`Agente responsável pela etapa ${i + 1}`}>
                    <option value="">Quem segue</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir etapa ${i + 1}`}>
                  ↑
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === v.steps.length - 1} aria-label={`Descer etapa ${i + 1}`}>
                  ↓
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeStep(i)} disabled={v.steps.length === 1} aria-label={`Remover etapa ${i + 1}`}>
                  <IconTrash />
                </button>
              </div>
            ))}
            {fields.steps && <span className="field-error">{fields.steps}</span>}
            <button type="button" className="btn btn-secondary btn-sm add-step" onClick={addStep}>
              <IconPlus />
              Adicionar etapa
            </button>
          </fieldset>
          <div className="field">
            <label htmlFor="p-rules">Regras obrigatórias</label>
            <textarea id="p-rules" className="input" value={v.rules} onChange={(e) => set('rules', e.target.value)} placeholder="Ex.: Nunca prometer reembolso acima de R$ 300 sem aprovação da diretoria." />
          </div>
          <label className="check-line">
            <input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} />
            Processo ativo (os agentes seguem este processo)
          </label>
        </div>
        <div className="dialog-foot">
          {initial.id &&
            (confirmDelete ? (
              <button type="button" className="btn btn-danger dialog-foot-left" onClick={remove}>
                Confirmar remoção
              </button>
            ) : (
              <button type="button" className="btn btn-ghost dialog-foot-left" onClick={() => setConfirmDelete(true)}>
                Remover processo
              </button>
            ))}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            Salvar processo
          </button>
        </div>
      </form>
    </dialog>
  );
}

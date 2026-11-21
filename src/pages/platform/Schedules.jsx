import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconClock, IconPlus, IconTrash } from '../../components/Icons.jsx';
import AgentAvatar from '../../components/AgentAvatar.jsx';
import { PageHead, EmptyState, ErrorState, LoadingRows, formatDate } from './common.jsx';

const FREQ = [
  ['diario', 'Todo dia'],
  ['dias_uteis', 'Dias úteis'],
  ['semanal', 'Toda semana'],
  ['mensal', 'Todo mês'],
  ['uma_vez', 'Uma vez'],
];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const EXAMPLES = [
  { title: 'Resumo da agenda do dia', instruction: 'Veja os meus compromissos de hoje no Google Agenda e me mande um resumo com horários, participantes e links do Meet.', frequency: 'dias_uteis', runTime: '07:45' },
  { title: 'E-mails sem resposta', instruction: 'Busque os e-mails da última semana que ainda não respondi e me mande a lista com remetente, assunto e o que cada um pede.', frequency: 'semanal', runTime: '09:00', weekdays: [1] },
  { title: 'Relatório do mês', instruction: 'Leia a planilha de vendas, faça um resumo do mês anterior (total, melhores clientes e comparação com o mês anterior) e crie um documento no Drive com o relatório.', frequency: 'mensal', runTime: '08:30', dayOfMonth: 1 },
];

const today = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const empty = (agentId) => ({ agentId: agentId || '', title: '', instruction: '', frequency: 'diario', runTime: '08:00', weekdays: [1], dayOfMonth: 1, runDate: today(), notifyEmail: true, active: true });

export default function Schedules({ user, agents, notify }) {
  const editable = can(user, 'configurar');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setData((await api('/schedules')).schedules);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function act(s, fn, msg) {
    try {
      await fn();
      if (msg) notify(msg);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const noAgents = agents && !agents.length;

  return (
    <>
      <PageHead title="Tarefas agendadas" lede="O agente faz sozinho, no horário marcado, com as ferramentas dele. Cada execução fica registrada em Conversas.">
        {editable && !noAgents && (
          <button className="btn btn-primary" onClick={() => setEditing(empty(agents?.[0]?.id))}>
            <IconPlus />
            Nova tarefa
          </button>
        )}
      </PageHead>

      {error && <ErrorState message={error} onRetry={load} />}
      {!data && !error && <LoadingRows rows={3} />}

      {data && !data.length && (
        <section className="panel">
          <EmptyState
            icon={<IconClock />}
            title={noAgents ? 'Crie um agente primeiro' : 'Nenhuma tarefa agendada ainda'}
            text={
              noAgents
                ? 'As tarefas agendadas são feitas por um agente.'
                : 'Exemplos: resumo da agenda toda manhã, lista de e-mails sem resposta toda segunda, relatório no dia 1º de cada mês. Você também pode pedir direto ao agente no chat: "toda segunda às 9h, me mande…".'
            }
          >
            {editable && !noAgents && (
              <div className="schedule-examples">
                {EXAMPLES.map((ex) => (
                  <button key={ex.title} type="button" className="suggestion" onClick={() => setEditing({ ...empty(agents[0].id), ...ex })}>
                    {ex.title}
                  </button>
                ))}
              </div>
            )}
          </EmptyState>
        </section>
      )}

      {data && data.length > 0 && (
        <ul className="schedule-list">
          {data.map((s) => (
            <li key={s.id} className={`panel schedule-card ${s.active ? '' : 'is-paused'}`}>
              <div className="schedule-main">
                <AgentAvatar avatar={s.agentAvatar} name={s.agentName} size={44} />
                <div className="schedule-text">
                  <div className="schedule-title">
                    <h3>{s.title}</h3>
                    <span className={`pill ${s.active ? 'pill-ok' : 'pill-neutral'}`}>{s.active ? 'Ativa' : s.frequency === 'uma_vez' && s.lastRunAt ? 'Concluída' : 'Pausada'}</span>
                  </div>
                  <p className="muted">
                    {s.agentName} · {s.description}
                    {s.notifyEmail ? ' · avisa por e-mail' : ''}
                  </p>
                  <p className="schedule-instruction">{s.instruction}</p>
                  <p className="schedule-meta muted">
                    {s.nextRunAt && <span>Próxima: {formatDate(s.nextRunAt, true)}</span>}
                    {s.lastRunAt && (
                      <span>
                        Última: {formatDate(s.lastRunAt, true)}{' '}
                        <span className={`pill ${s.lastStatus === 'ok' ? 'pill-ok' : 'pill-warn'}`}>{s.lastStatus === 'ok' ? 'Concluída' : 'Com erro'}</span>
                        {s.conversationId && (
                          <>
                            {' '}
                            <Link className="link" to={`/app/conversas/${s.conversationId}`}>
                              ver resultado
                            </Link>
                          </>
                        )}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {editable && (
                <div className="schedule-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => act(s, () => api(`/schedules/${s.id}/run`, { method: 'POST' }), `"${s.title}" vai rodar agora. O resultado aparece em instantes.`)}>
                    Executar agora
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(s, () => api(`/schedules/${s.id}`, { method: 'PUT', body: { active: !s.active } }), s.active ? 'Tarefa pausada.' : 'Tarefa reativada.')}>
                    {s.active ? 'Pausar' : 'Reativar'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ ...s, agentId: String(s.agentId), runDate: s.runDate || today(), dayOfMonth: s.dayOfMonth || 1 })}>
                    Editar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ScheduleDialog
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

function ScheduleDialog({ initial, agents, onClose, onSaved, notify }) {
  const ref = useRef(null);
  const [v, setV] = useState(initial);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k, val) => {
    setV((x) => ({ ...x, [k]: val }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: undefined }));
  };

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { ...v, agentId: Number(v.agentId) };
      if (v.id) await api(`/schedules/${v.id}`, { method: 'PUT', body });
      else await api('/schedules', { method: 'POST', body });
      onSaved(v.id ? 'Tarefa atualizada.' : 'Tarefa agendada. O agente vai executar no horário marcado.');
    } catch (err) {
      setFields(err.fields || {});
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(`/schedules/${v.id}`, { method: 'DELETE' });
      onSaved('Tarefa apagada.');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const err = (k) => fields[k] && <span className="field-error">{fields[k]}</span>;

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="schedule-title">
      <form onSubmit={save} noValidate>
        <div className="dialog-head">
          <h2 id="schedule-title">{v.id ? 'Editar tarefa agendada' : 'Nova tarefa agendada'}</h2>
          <p>Escreva o que o agente deve fazer como se pedisse a um colega. Ele executa sozinho e registra o resultado.</p>
        </div>
        <div className="dialog-body">
          <div className="field-row">
            <div className="field">
              <label htmlFor="s-title">Nome da tarefa</label>
              <input id="s-title" className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Resumo da agenda do dia" />
              {err('title')}
            </div>
            <div className="field">
              <label htmlFor="s-agent">Agente</label>
              <select id="s-agent" className="input" value={v.agentId} onChange={(e) => set('agentId', e.target.value)}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.area})
                  </option>
                ))}
              </select>
              {err('agentId')}
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-instr">O que o agente deve fazer</label>
            <textarea
              id="s-instr"
              className="input"
              rows={4}
              value={v.instruction}
              onChange={(e) => set('instruction', e.target.value)}
              placeholder="Ex.: Veja os meus compromissos de hoje e me mande um resumo por e-mail para henrique@empresa.com."
            />
            {err('instruction')}
            <span className="hint">O agente usa as ferramentas que estão liberadas para ele. Ações que pedem aprovação vão para a fila de Aprovações.</span>
          </div>
          <fieldset className="field">
            <legend>Quando</legend>
            <div className="chips">
              {FREQ.map(([val, label]) => (
                <label key={val} className={`chip ${v.frequency === val ? 'is-selected' : ''}`}>
                  <input type="radio" name="freq" value={val} checked={v.frequency === val} onChange={() => set('frequency', val)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          {v.frequency === 'semanal' && (
            <fieldset className="field">
              <legend>Dias da semana</legend>
              <div className="chips">
                {DAYS.map((d, i) => {
                  const on = (v.weekdays || []).includes(i);
                  return (
                    <label key={d} className={`chip ${on ? 'is-selected' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => set('weekdays', on ? v.weekdays.filter((x) => x !== i) : [...(v.weekdays || []), i])} />
                      {d}
                    </label>
                  );
                })}
              </div>
              {err('weekdays')}
            </fieldset>
          )}
          <div className="field-row">
            {v.frequency === 'mensal' && (
              <div className="field">
                <label htmlFor="s-dom">Dia do mês</label>
                <input id="s-dom" type="number" min="1" max="31" className="input" value={v.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} />
                <span className="hint">Em meses mais curtos, roda no último dia.</span>
                {err('dayOfMonth')}
              </div>
            )}
            {v.frequency === 'uma_vez' && (
              <div className="field">
                <label htmlFor="s-date">Data</label>
                <input id="s-date" type="date" className="input" value={v.runDate} onChange={(e) => set('runDate', e.target.value)} />
                {err('runDate')}
              </div>
            )}
            <div className="field">
              <label htmlFor="s-time">Horário (Brasília)</label>
              <input id="s-time" type="time" className="input" value={v.runTime} onChange={(e) => set('runTime', e.target.value)} />
              {err('runTime')}
            </div>
          </div>
          <label className="check-line">
            <input type="checkbox" checked={v.notifyEmail} onChange={(e) => set('notifyEmail', e.target.checked)} />
            Me avisar por e-mail com o resultado de cada execução
          </label>
          <label className="check-line">
            <input type="checkbox" checked={v.active} onChange={(e) => set('active', e.target.checked)} />
            Tarefa ativa
          </label>
        </div>
        <div className="dialog-foot">
          {v.id && (
            <div className="dialog-foot-left">
              {confirmDelete ? (
                <>
                  <button type="button" className="btn btn-danger btn-sm" onClick={remove}>
                    Confirmar exclusão
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
                  <IconTrash />
                  Apagar
                </button>
              )}
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {v.id ? 'Salvar' : 'Agendar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

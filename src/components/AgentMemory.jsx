import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconTrash } from './Icons.jsx';

const fmtDate = (v) => new Date(String(v).replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

// O que o agente guardou entre as conversas. A equipe pode acrescentar e apagar.
export default function AgentMemory({ agentId, editable, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('todas');

  const load = useCallback(async () => {
    try {
      setData(await api(`/agents/${agentId}/memories`));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [agentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api(`/agents/${agentId}/memories`, { method: 'POST', body: { content: draft } });
      setDraft('');
      notify('Guardado na memória do agente.');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    try {
      await api(`/agents/${agentId}/memories/${m.id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, memories: d.memories.filter((x) => x.id !== m.id) }));
      notify('Memória apagada.');
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const list = (data?.memories || []).filter((m) => filter === 'todas' || m.scope === filter);

  return (
    <section className="panel" aria-labelledby="memory-title">
      <div className="panel-head">
        <div>
          <h2 id="memory-title">Memória</h2>
          <p className="panel-sub">
            O que o agente guardou para as próximas conversas. As memórias de um contato só aparecem nas conversas com aquela pessoa.
          </p>
        </div>
      </div>

      {editable && (
        <form className="memory-add" onSubmit={add}>
          <label htmlFor="memory-new" className="visually-hidden">
            Nova memória
          </label>
          <input
            id="memory-new"
            className="input"
            value={draft}
            maxLength={data?.maxChars || 300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ex.: Orçamentos acima de R$ 5 mil vão para a diretoria antes de enviar ao cliente."
          />
          <button className="btn btn-secondary" type="submit" disabled={busy || !draft.trim()}>
            Guardar
          </button>
        </form>
      )}

      {error && <p className="field-error">{error}</p>}
      {data && data.memories.length > 0 && (
        <div className="chips memory-filter" role="group" aria-label="Filtrar memórias">
          {[
            ['todas', 'Todas'],
            ['geral', 'Gerais'],
            ['contato', 'De contatos'],
          ].map(([v, l]) => (
            <button key={v} type="button" className={`chip ${filter === v ? 'is-selected' : ''}`} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
      )}

      {data && !data.memories.length && (
        <p className="muted">
          Ainda vazia. O agente guarda sozinho o que aprender nas conversas (preferências, combinados, quem cuida do quê), e a equipe também pode
          acrescentar acima.
        </p>
      )}

      {list.length > 0 && (
        <ul className="memory-list">
          {list.map((m) => (
            <li key={m.id}>
              <div>
                <p>{m.content}</p>
                <span className="muted">
                  {m.scope === 'contato' ? `Sobre ${m.contact || 'um contato'}` : 'Geral'} ·{' '}
                  {m.source === 'equipe' ? `Adicionada por ${m.createdBy || 'alguém da equipe'}` : 'Aprendida pelo agente'} · {fmtDate(m.createdAt)}
                </span>
              </div>
              {editable && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(m)} aria-label={`Apagar memória: ${m.content}`}>
                  <IconTrash size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

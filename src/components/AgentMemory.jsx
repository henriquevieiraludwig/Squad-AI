import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconTrash } from './Icons.jsx';

const fmtDate = (v) => new Date(String(v).replace(' ', 'T')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

// O que o agente guardou entre as conversas. A equipe pode acrescentar e apagar.
export default function AgentMemory({ agentId, editable, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
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
            Aprendida automaticamente nas conversas: quanto mais vocês conversam, mais o agente sabe sobre a empresa, as pessoas e o jeito de
            trabalhar. Você não precisa preencher nada; aqui só dá para conferir e apagar o que não quiser.
          </p>
        </div>
      </div>


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
          Ainda vazia. Converse com o agente: ele guarda sozinho o que aprender (quem é quem, e-mails, preferências, combinados e como a empresa
          trabalha).
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

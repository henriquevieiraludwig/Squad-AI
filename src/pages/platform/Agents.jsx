import { useMemo, useState } from 'react';
import { PageHead, SearchInput, FilterChips } from './common.jsx';
import AgentList from './AgentList.jsx';

export default function Agents({ agents, areas, loadError, reloadAgents, openCreate }) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('todas');

  const filtered = useMemo(() => {
    if (!agents) return null;
    const q = query.trim().toLowerCase();
    return agents.filter(
      (a) => (area === 'todas' || a.area === area) && (!q || `${a.name} ${a.area} ${a.roleDescription}`.toLowerCase().includes(q)),
    );
  }, [agents, query, area]);

  const usedAreas = areas.filter((a) => agents?.some((x) => x.area === a));

  return (
    <>
      <PageHead title="Agentes" lede="Cada agente assume os processos de uma área e só usa as ferramentas que você liberar.">
        <button className="btn btn-primary" onClick={openCreate}>
          Criar agente
        </button>
      </PageHead>

      {agents?.length > 0 && (
        <div className="toolbar">
          <SearchInput id="agent-search" label="Buscar agentes" value={query} onChange={setQuery} placeholder="Buscar por nome, área ou função" />
          <FilterChips
            label="Filtrar por área"
            value={area}
            onChange={setArea}
            options={[
              { value: 'todas', label: 'Todas', count: agents.length },
              ...usedAreas.map((a) => ({ value: a, label: a, count: agents.filter((x) => x.area === a).length })),
            ]}
          />
        </div>
      )}

      <section className="panel">
        <AgentList
          agents={filtered}
          loadError={loadError}
          reload={reloadAgents}
          openCreate={openCreate}
          emptyFiltered={agents?.length > 0}
        />
      </section>
    </>
  );
}

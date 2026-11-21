import { PROVIDERS, ACTIONS, connectionFor, defaultMode } from '../../shared/catalog.js';

// Escolha das ferramentas que o agente pode usar. "value" é { actionId: 'auto' | 'approval' }.
export default function ToolPicker({ value, onChange, connected = new Set() }) {
  const groups = PROVIDERS.filter((p) => !p.via)
    .map((p) => ({ provider: p, actions: ACTIONS.filter((a) => connectionFor(a.provider) === p.id) }))
    .filter((g) => g.actions.length)
    // Integrações já conectadas aparecem primeiro.
    .sort((a, b) => Number(connected.has(b.provider.id)) - Number(connected.has(a.provider.id)));

  const toggle = (action, on) => {
    const next = { ...value };
    if (on) next[action.id] = defaultMode(action);
    else delete next[action.id];
    onChange(next);
  };
  const setMode = (action, mode) => onChange({ ...value, [action.id]: mode });
  const count = Object.keys(value).length;

  return (
    <fieldset className="field tool-picker">
      <legend>Ferramentas que o agente pode usar</legend>
      <span className="hint">
        Escolha só o que ele precisa. Ações que enviam ou alteram algo começam pedindo aprovação; você pode mudar depois na página do agente.
        {count > 0 && <strong> {count} selecionada{count > 1 ? 's' : ''}.</strong>}
      </span>
      {groups.map(({ provider, actions }) => {
        const isOn = connected.has(provider.id);
        const selected = actions.filter((a) => value[a.id]).length;
        return (
          <details key={provider.id} className="tool-group" open={isOn}>
            <summary>
              <span className="tool-group-name">{provider.name}</span>
              <span className={`pill ${isOn ? 'pill-ok' : 'pill-neutral'}`}>{isOn ? 'Conectado' : 'Não conectado'}</span>
              {selected > 0 && <span className="muted tabular">{selected} de {actions.length}</span>}
            </summary>
            <ul>
              {actions.map((a) => (
                <li key={a.id} className="tool-row">
                  <label>
                    <input type="checkbox" checked={Boolean(value[a.id])} onChange={(e) => toggle(a, e.target.checked)} />
                    <span>
                      {a.label}
                      <span className="muted"> · {a.service}</span>
                    </span>
                  </label>
                  {value[a.id] && (
                    <select className="input input-sm" value={value[a.id]} onChange={(e) => setMode(a, e.target.value)} aria-label={`Modo de ${a.label}`}>
                      <option value="approval">Pede aprovação</option>
                      <option value="auto">Automática</option>
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
      {!connected.size && <span className="hint">Nenhuma integração conectada ainda. As ferramentas escolhidas passam a funcionar quando você conectar a conta em Integrações.</span>}
    </fieldset>
  );
}

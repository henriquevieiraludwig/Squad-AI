import AvatarPicker from './AvatarPicker.jsx';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const empty = { name: '', area: '', roleDescription: '', avatar: 'avatar-1' };

export default function CreateAgentDialog({ open, onClose, onCreated, areas }) {
  const ref = useRef(null);
  const [values, setValues] = useState(empty);
  const [fields, setFields] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      setValues(empty);
      setFields({});
      setError('');
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  const set = (k) => (e) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (fields[k]) setFields((f) => ({ ...f, [k]: undefined }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const local = {};
    if (!values.name.trim()) local.name = 'Dê um nome ao agente.';
    if (!values.area) local.area = 'Escolha a área em que o agente vai atuar.';
    setFields(local);
    if (Object.keys(local).length) return;

    setSaving(true);
    setError('');
    try {
      const { agent } = await api('/agents', { method: 'POST', body: values });
      onCreated(agent);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="create-agent-title">
      <form onSubmit={handleSubmit} noValidate>
        <div className="dialog-head">
          <h2 id="create-agent-title">Criar agente</h2>
          <p>Comece pelo básico. Depois você ensina o contexto e os processos que ele deve seguir.</p>
        </div>

        <div className="dialog-body">
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="agent-name">Nome do agente</label>
            <input
              id="agent-name"
              className="input"
              value={values.name}
              onChange={set('name')}
              placeholder="Ex.: Agente de Atendimento"
              aria-invalid={fields.name ? 'true' : undefined}
              aria-describedby={fields.name ? 'agent-name-error' : undefined}
              autoFocus
            />
            {fields.name && (
              <span id="agent-name-error" className="field-error">
                {fields.name}
              </span>
            )}
          </div>

          <AvatarPicker value={values.avatar} onChange={(v) => setValues((x) => ({ ...x, avatar: v }))} />

          <fieldset className="field area-picker" aria-describedby={fields.area ? 'agent-area-error' : undefined}>
            <legend>Área</legend>
            <div className="chips">
              {areas.map((a) => (
                <label key={a} className={`chip ${values.area === a ? 'is-selected' : ''}`}>
                  <input type="radio" name="area" value={a} checked={values.area === a} onChange={set('area')} />
                  {a}
                </label>
              ))}
            </div>
            {fields.area && (
              <span id="agent-area-error" className="field-error">
                {fields.area}
              </span>
            )}
          </fieldset>

          <div className="field">
            <label htmlFor="agent-role">O que esse agente faz</label>
            <textarea
              id="agent-role"
              className="input"
              value={values.roleDescription}
              onChange={set('roleDescription')}
              placeholder="Ex.: Responde clientes sobre pedidos, trocas e prazos de entrega. Transfere para a supervisão em casos de reclamação formal."
              maxLength={600}
            />
            <span className="hint">Opcional. Escreva como explicaria a função para alguém recém-contratado.</span>
          </div>
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden="true" />}
            {saving ? 'Criando…' : 'Criar agente'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

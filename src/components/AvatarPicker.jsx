import { AVATARS } from '../avatars.js';

// Escolha do avatar: uma opção por pessoa, navegável pelo teclado.
export default function AvatarPicker({ value, onChange, label = 'Avatar do agente' }) {
  return (
    <fieldset className="field avatar-picker">
      <legend className="label">{label}</legend>
      <div className="avatar-grid" role="radiogroup">
        {AVATARS.map((a, i) => {
          const on = value === a.id;
          return (
            <label key={a.id} className={`avatar-option ${on ? 'is-on' : ''}`}>
              <input
                type="radio"
                name="avatar"
                value={a.id}
                checked={on}
                onChange={() => onChange(a.id)}
                className="visually-hidden"
              />
              <img src={a.src} alt={`Avatar ${i + 1}`} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

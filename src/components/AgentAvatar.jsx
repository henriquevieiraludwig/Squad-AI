import { avatarSrc } from '../avatars.js';

// Avatar do agente: a pessoa escolhida ou, se não houver, a inicial do nome.
export default function AgentAvatar({ avatar, name = '', size = 40 }) {
  const src = avatarSrc(avatar);
  if (src) return <img src={src} alt="" className="agent-photo" style={{ width: size, height: size }} />;
  return (
    <span className="agent-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

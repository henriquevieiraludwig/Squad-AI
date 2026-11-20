import heroTeam from '../assets/hero-team.webp';
import { AVATARS } from '../avatars.js';

// Posição de cada pessoa na arte (centro x, centro y e raio, na arte original de 1254 px).
const ORIGINAL = 1254;
const SPOTS = {
  'avatar-1': [625, 240, 150],
  'avatar-2': [945, 370, 135],
  'avatar-3': [1065, 680, 135],
  'avatar-4': [925, 965, 135],
  'avatar-5': [625, 1075, 140],
  'avatar-6': [330, 965, 135],
  'avatar-7': [185, 670, 135],
  'avatar-8': [310, 385, 135],
};

// A arte base fica embaixo. Cada pessoa é recortada por cima, no mesmo lugar, para poder animar só ela.
export default function HeroTeam() {
  return (
    <div className="hero-team">
      <img src={heroTeam} alt="Oito agentes de IA, cada um representado por uma pessoa" className="hero-team-base" />
      {AVATARS.map((a) => {
        const [cx, cy, r] = SPOTS[a.id];
        const style = {
          left: `${((cx - r) / ORIGINAL) * 100}%`,
          top: `${((cy - r) / ORIGINAL) * 100}%`,
          width: `${((2 * r) / ORIGINAL) * 100}%`,
        };
        return (
          <span key={a.id} className="hero-person" style={style} aria-hidden="true">
            <img src={a.src} alt="" />
          </span>
        );
      })}
    </div>
  );
}

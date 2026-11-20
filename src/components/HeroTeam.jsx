import heroTeam from '../assets/hero-team.webp';
import person1 from '../assets/hero/person-1.webp';
import person2 from '../assets/hero/person-2.webp';
import person3 from '../assets/hero/person-3.webp';
import person4 from '../assets/hero/person-4.webp';
import person5 from '../assets/hero/person-5.webp';
import person6 from '../assets/hero/person-6.webp';
import person7 from '../assets/hero/person-7.webp';
import person8 from '../assets/hero/person-8.webp';

// Cada pessoa: centro e raio na arte original (1254 px), a imagem recortada e o papel que ela representa.
const ORIGINAL = 1254;
const PEOPLE = [
  { src: person1, at: [625, 240, 245], role: 'Assistente de atendimento' },
  { src: person2, at: [945, 370, 132], role: 'Analista financeiro' },
  { src: person3, at: [1065, 680, 132], role: 'Vendas' },
  { src: person4, at: [925, 965, 132], role: 'Suporte técnico' },
  { src: person5, at: [625, 1075, 134], role: 'Analista de dados' },
  { src: person6, at: [330, 965, 132], role: 'Analista de marketing' },
  { src: person7, at: [185, 670, 132], role: 'Recursos humanos' },
  { src: person8, at: [310, 385, 132], role: 'Agendamentos' },
];

// A arte base fica embaixo. Cada pessoa é recortada por cima, no mesmo lugar, para poder animar só ela.
export default function HeroTeam() {
  return (
    <div className="hero-team">
      <img src={heroTeam} alt="Oito agentes de IA, cada um representado por uma pessoa" className="hero-team-base" />
      {PEOPLE.map((p) => {
        const [cx, cy, r] = p.at;
        const style = {
          left: `${((cx - r) / ORIGINAL) * 100}%`,
          top: `${((cy - r) / ORIGINAL) * 100}%`,
          width: `${((2 * r) / ORIGINAL) * 100}%`,
        };
        return (
          <span key={p.role} className="hero-person" style={style}>
            <img src={p.src} alt="" aria-hidden="true" />
            <span className="hero-role">{p.role}</span>
          </span>
        );
      })}
    </div>
  );
}

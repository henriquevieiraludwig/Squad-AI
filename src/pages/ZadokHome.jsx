import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ZadokHeader, ZadokFooter, ZadokSymbol, ContactForm } from '../components/Zadok.jsx';
import { SquadMark } from '../components/Logo.jsx';
import './zadok.css';

// Z grande do hero: anel, traço e ponto (o caminho da tarefa manual até a operação autônoma).
function HeroZ() {
  return (
    <svg className="zhero-art" viewBox="0 0 560 500" aria-hidden="true">
      <path d="M150 90h330L110 400h330" fill="none" stroke="var(--z-forest-2)" strokeWidth="78" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="96" cy="88" r="68" fill="none" stroke="var(--z-lime)" strokeWidth="38" />
      <circle cx="470" cy="402" r="84" fill="var(--z-lime)" />
    </svg>
  );
}

const PILLARS = [
  ['01', 'Autonomia que se conquista', 'Cada processo avança do manual ao autônomo, no ritmo que a empresa escolhe.'],
  ['02', 'O humano aprova o que importa', 'Os agentes executam. As decisões sensíveis esperam por você no painel.'],
  ['03', 'Feito para a rotina da PME', 'Sem a complexidade de grande empresa: o repetitivo se resolve sozinho.'],
];

const LEVELS = [
  { name: 'Manual', icon: 'ring', text: 'A equipe faz. O agente observa, aprende o processo e as regras da empresa.' },
  { name: 'Assistido', icon: 'half', text: 'O agente prepara e executa, e uma pessoa aprova antes do que é sensível.' },
  { name: 'Autônomo', icon: 'dot', text: 'O processo roda sozinho, com registro de tudo e o dono no comando.' },
];

export function LevelIcon({ kind, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === 'ring' && <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="3" />}
      {kind === 'half' && (
        <>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" />
        </>
      )}
      {kind === 'dot' && <circle cx="12" cy="12" r="10" fill="currentColor" />}
    </svg>
  );
}

export default function ZadokHome() {
  useEffect(() => {
    document.title = 'Zadok | A empresa que opera sozinha';
  }, []);
  return (
    <div className="zsite">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <div className="zhero-wrap">
        <ZadokHeader />
        <section className="zhero">
          <div className="zwrap zhero-inner">
            <div className="zhero-text">
              <span className="zlabel zlabel-lime">Agentes de IA + ERP para PMEs</span>
              <h1>
                A empresa que opera <span className="zlime">sozinha.</span>
              </h1>
              <p>
                A Zadok implanta o conceito de empresa autônoma nas PMEs: agentes de IA e um ERP que trabalham juntos, com o dono no comando.
              </p>
              <div className="zhero-actions">
                <a className="zbtn zbtn-lime zbtn-lg" href="#contato">
                  Falar com a Zadok
                </a>
                <Link className="zbtn zbtn-ghost-dark zbtn-lg" to="/produtos/squad-ai">
                  Conhecer o Squad AI
                </Link>
              </div>
              <div className="zhero-products">
                <Link to="/produtos/squad-ai" className="zproduct-chip">
                  <SquadMark size={32} />
                  <span>
                    <strong>Squad AI</strong>
                    <span>Agentes de IA para tarefas repetitivas</span>
                  </span>
                </Link>
                <Link to="/produtos/zadok-erp" className="zproduct-chip">
                  <ZadokSymbol size={24} />
                  <span>
                    <strong>Zadok ERP</strong>
                    <span>Gestão integrada para PMEs</span>
                  </span>
                </Link>
              </div>
            </div>
            <HeroZ />
          </div>
        </section>
      </div>

      <main id="conteudo">
        <section id="sobre" className="zsection">
          <div className="zwrap zsplit">
            <div>
              <span className="zlabel">01 · Conceito</span>
              <h2>Autonomia com comando.</h2>
              <p className="zlead">
                Zadok vem do hebraico <em>tsadoq</em>, “justo”. Na Bíblia, é o sacerdote que se manteve fiel e ungiu Salomão. É o que uma empresa autônoma
                precisa ser: confiável, ordenada e fiel ao que o dono decidiu.
              </p>
              <ol className="zpillars">
                {PILLARS.map(([n, t, d]) => (
                  <li key={n}>
                    <span className="zlabel">{n}</span>
                    <div>
                      <h3>{t}</h3>
                      <p>{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="zsymbol-card">
              <ZadokSymbol size={200} tile="var(--z-forest)" />
              <ul>
                <li>
                  <LevelIcon kind="ring" />
                  <div>
                    <strong>Anel · entrada</strong>
                    <span>A tarefa manual e repetitiva que hoje consome o tempo do time.</span>
                  </div>
                </li>
                <li>
                  <span className="zline-icon" aria-hidden="true">
                    Z
                  </span>
                  <div>
                    <strong>Traço · fluxo</strong>
                    <span>O processo que o agente de IA percorre, de ponta a ponta.</span>
                  </div>
                </li>
                <li>
                  <LevelIcon kind="dot" />
                  <div>
                    <strong>Ponto · saída</strong>
                    <span>A operação concluída sozinha, com o dono no comando.</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="produtos" className="zsection zsection-soft">
          <div className="zwrap">
            <span className="zlabel">02 · Produtos</span>
            <h2>Duas peças, uma operação.</h2>
            <p className="zlead">Os agentes executam o trabalho repetitivo. O ERP organiza a gestão. Juntos, levam cada processo do manual ao autônomo.</p>
            <div className="zproducts">
              <article className="zproduct">
                <div className="zproduct-head">
                  <SquadMark size={52} />
                  <div>
                    <h3>Squad AI</h3>
                    <span className="zlabel">Produto · disponível</span>
                  </div>
                </div>
                <p>
                  Agentes de IA treinados com o contexto, as regras e os processos da sua empresa. Atendem no WhatsApp, marcam reuniões, respondem e-mails,
                  preenchem planilhas e passam tarefas entre si, com aprovação humana no que é sensível.
                </p>
                <ul className="zchecks">
                  <li>Microsoft 365, Google Workspace, WhatsApp e Telegram</li>
                  <li>Memória, processos com vários agentes e tarefas agendadas</li>
                  <li>Aprovação por ação e histórico de tudo</li>
                </ul>
                <Link className="zbtn zbtn-dark" to="/produtos/squad-ai">
                  Conhecer o Squad AI
                </Link>
              </article>
              <article className="zproduct">
                <div className="zproduct-head">
                  <ZadokSymbol size={52} tile="var(--z-forest)" />
                  <div>
                    <h3>
                      Zadok <span className="ztag">ERP</span>
                    </h3>
                    <span className="zlabel">Produto · em breve</span>
                  </div>
                </div>
                <p>
                  Gestão integrada para PMEs: financeiro, vendas, estoque e compras, já conectados aos agentes do Squad AI. Cada processo com o seu nível de
                  autonomia, num relance.
                </p>
                <ul className="zchecks">
                  <li>Conciliação bancária e cobrança automáticas</li>
                  <li>Notas fiscais e pedidos de reposição assistidos</li>
                  <li>Painel de autonomia por processo</li>
                </ul>
                <Link className="zbtn zbtn-outline" to="/produtos/zadok-erp">
                  Entrar na lista de espera
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="zsection">
          <div className="zwrap">
            <span className="zlabel">03 · Como funciona</span>
            <h2>Da tarefa manual à operação autônoma.</h2>
            <p className="zlead">Cada processo da empresa tem um nível de autonomia, e quem decide quando ele sobe é você.</p>
            <ol className="zlevels">
              {LEVELS.map((l, i) => (
                <li key={l.name}>
                  <span className="zlevel-icon">
                    <LevelIcon kind={l.icon} size={30} />
                  </span>
                  <span className="zlabel">Nível {i + 1}</span>
                  <h3>{l.name}</h3>
                  <p>{l.text}</p>
                </li>
              ))}
            </ol>
            <div className="zexample">
              <div className="zexample-head">
                <span className="zlabel">Exemplo ilustrativo · dados fictícios</span>
                <h3>Painel de autonomia</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th>Módulo</th>
                    <th>Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Conciliação bancária', 'Financeiro', 'dot', 'Autônomo'],
                    ['Emissão de notas fiscais', 'Vendas', 'half', 'Assistido'],
                    ['Cobrança de inadimplentes', 'Financeiro', 'dot', 'Autônomo'],
                    ['Pedido de reposição', 'Estoque', 'ring', 'Manual'],
                  ].map(([p, m, k, n]) => (
                    <tr key={p}>
                      <td>{p}</td>
                      <td className="zmuted">{m}</td>
                      <td>
                        <span className="zlevel-cell">
                          <LevelIcon kind={k} size={16} />
                          {n}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="contato" className="zcontact">
          <div className="zwrap zsplit">
            <div>
              <span className="zlabel zlabel-lime">04 · Contato</span>
              <h2>
                Vamos colocar o primeiro processo no <span className="zlime">automático?</span>
              </h2>
              <p>Conte o que toma o tempo da sua equipe. A gente mostra, com os seus dados, como um agente resolve isso em poucos dias.</p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>
      <ZadokFooter />
    </div>
  );
}

import { useEffect } from 'react';
import { ZadokHeader, ZadokFooter, ZadokSymbol, ContactForm } from '../components/Zadok.jsx';
import { LevelIcon } from './ZadokHome.jsx';
import './zadok.css';

const MODULES = [
  ['Financeiro', 'Contas a pagar e receber, conciliação bancária e cobrança de inadimplentes.'],
  ['Vendas', 'Pedidos, propostas e emissão de notas fiscais.'],
  ['Estoque', 'Saldo por produto, alertas e pedidos de reposição.'],
  ['Compras', 'Cotações, aprovações por limite e recebimento.'],
];

export default function ZadokErp() {
  useEffect(() => {
    document.title = 'Zadok ERP | Gestão integrada para PMEs';
  }, []);
  return (
    <div className="zsite">
      <div className="zhero-wrap">
        <ZadokHeader />
        <section className="zhero zhero-compact">
          <div className="zwrap zhero-inner">
            <div className="zhero-text">
              <span className="zlabel zlabel-lime">Produto · em breve</span>
              <h1>
                Zadok <span className="ztag ztag-lg">ERP</span>
              </h1>
              <p>Gestão integrada para PMEs, já conectada aos agentes do Squad AI. Cada processo no nível de autonomia que você escolher.</p>
              <div className="zhero-actions">
                <a className="zbtn zbtn-lime zbtn-lg" href="#lista">
                  Entrar na lista de espera
                </a>
              </div>
            </div>
            <ZadokSymbol size={260} tile="var(--z-forest-2)" />
          </div>
        </section>
      </div>
      <main>
        <section className="zsection">
          <div className="zwrap">
            <span className="zlabel">Módulos</span>
            <h2>O essencial da gestão, sem a complexidade de grande empresa.</h2>
            <div className="zmodules">
              {MODULES.map(([t, d], i) => (
                <article key={t}>
                  <LevelIcon kind={['dot', 'half', 'ring', 'half'][i]} size={26} />
                  <h3>{t}</h3>
                  <p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="lista" className="zcontact">
          <div className="zwrap zsplit">
            <div>
              <span className="zlabel zlabel-lime">Lista de espera</span>
              <h2>
                Seja das primeiras empresas a usar o <span className="zlime">Zadok ERP.</span>
              </h2>
              <p>Deixe o seu contato. Avisamos quando abrirmos as primeiras vagas e mostramos como ele trabalha junto com o Squad AI.</p>
            </div>
            <ContactForm interest="Zadok ERP" cta="Quero entrar na lista" />
          </div>
        </section>
      </main>
      <ZadokFooter />
    </div>
  );
}

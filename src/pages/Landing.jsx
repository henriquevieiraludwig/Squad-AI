import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ZadokHeader, ZadokFooter, PorZadok } from '../components/Zadok.jsx';
import '../pages/zadok.css';
import Logo, { Endorsement } from '../components/Logo.jsx';
import HeroDemo from '../components/HeroDemo.jsx';
import HeroTeam from '../components/HeroTeam.jsx';
import { IconShield, IconHistory, IconLock, IconCheck } from '../components/Icons.jsx';
import { useAuth, homeFor } from '../auth.jsx';
import { useBrand } from '../brand.jsx';
import './landing.css';

const steps = [
  {
    title: 'Mapeie o processo',
    text: 'Descreva o passo a passo ou envie o documento que a equipe já usa. Marque as regras que o agente deve seguir à risca.',
    example: 'Reembolsos acima de R$ 300 passam pela diretoria.',
  },
  {
    title: 'Conecte as ferramentas',
    text: 'Microsoft 365, Google Workspace, Teams, WhatsApp, Telegram e Slack. O agente age onde sua equipe já trabalha.',
    example: 'Outlook e Teams conectados pela conta da empresa.',
  },
  {
    title: 'Defina o que precisa de aprovação',
    text: 'Consultas rodam sozinhas. Envios em nome da empresa esperam alguém da equipe aprovar com um clique.',
    example: 'Enviar e-mail: pede aprovação. Consultar agenda: automática.',
  },
  {
    title: 'Teste e coloque para rodar',
    text: 'Converse com o agente, ajuste as respostas e ligue os canais quando a equipe estiver segura.',
    example: 'Agente testado com 20 pedidos antigos antes de ir para o Teams.',
  },
];

const processes = [
  ['Financeiro', 'Reembolso de despesas', 'Confere a política, pede o recibo e envia o pedido ao Financeiro.'],
  ['Operações', 'Agendamento de visitas técnicas', 'Consulta a agenda da equipe, propõe horários e cria o evento com o cliente.'],
  ['Atendimento', 'Triagem de chamados no WhatsApp', 'Responde dúvidas frequentes e encaminha o resto para o canal certo no Teams.'],
  ['Pessoas e RH', 'Admissão de novos colaboradores', 'Envia a lista de documentos, acompanha prazos e avisa o RH no Slack.'],
  ['Vendas', 'Follow-up de propostas', 'Busca propostas sem resposta no Gmail e prepara o lembrete para o vendedor aprovar.'],
];

import logoOutlook from '../assets/logos/outlook.webp';
import logoTeams from '../assets/logos/teams.webp';
import logoSharepoint from '../assets/logos/sharepoint.webp';
import logoOnedrive from '../assets/logos/onedrive.webp';
import logoGoogleChat from '../assets/logos/google-chat.webp';
import logoGoogleDrive from '../assets/logos/google-drive.webp';
import logoWhatsapp from '../assets/logos/whatsapp.webp';
import logoTelegram from '../assets/logos/telegram.webp';

// Planos. Os preços ficam como "R$ X" até serem definidos: basta trocar o campo price.
const plans = [
  {
    name: 'Starter',
    price: 'R$ X',
    text: 'Para começar com um processo e ver o primeiro agente trabalhando.',
    features: ['1 agente', 'Até 2 integrações', 'Base de conhecimento da empresa', 'Aprovação humana por ação', 'Suporte por e-mail'],
  },
  {
    name: 'Medium',
    price: 'R$ X',
    text: 'Para equipes que querem automatizar vários processos do dia a dia.',
    features: ['Até 5 agentes', 'Todas as integrações', 'Processos e regras por agente', 'Caixa de conversas com atendimento humano', 'Equipe com papéis e aprovadores'],
    featured: true,
  },
  {
    name: 'Pro',
    price: 'R$ X',
    text: 'Para empresas com alto volume e necessidade de controle total.',
    features: ['Agentes ilimitados', 'Todas as integrações', 'Maior volume de mensagens', 'Histórico completo e auditoria', 'Suporte prioritário'],
  },
];

// Logos das plataformas compatíveis (o nome fica só para leitores de tela).
const platforms = [
  { name: 'Outlook', src: logoOutlook },
  { name: 'Microsoft Teams', src: logoTeams },
  { name: 'SharePoint', src: logoSharepoint },
  { name: 'OneDrive', src: logoOnedrive },
  { name: 'Google Chat', src: logoGoogleChat },
  { name: 'Google Drive', src: logoGoogleDrive },
  { name: 'WhatsApp', src: logoWhatsapp },
  { name: 'Telegram', src: logoTelegram },
];

// Ação principal do site: sem login nem cadastro aqui. Cada empresa entra pelo endereço próprio, recebido por e-mail.
function Cta({ className, children }) {
  const { user } = useAuth();
  const brand = useBrand();
  if (user) {
    return (
      <Link to={homeFor(user)} className={className}>
        Abrir plataforma
      </Link>
    );
  }
  const href = brand.isPlatform ? '/#contato' : brand.supportEmail ? `mailto:${brand.supportEmail}` : '#planos';
  return (
    <a href={href} className={className}>
      {children || (brand.isPlatform ? 'Falar com a Zadok' : 'Fale com a gente')}
    </a>
  );
}

// "embedded": página do produto dentro do site da Zadok (cabeçalho e rodapé da marca-mãe).
export default function Landing({ embedded = false }) {
  const { user } = useAuth();
  const brand = useBrand();
  useEffect(() => {
    if (embedded) document.title = 'Squad AI | Agentes de IA para processos repetitivos · Zadok';
  }, [embedded]);

  return (
    <div className={`landing ${embedded ? 'zsite' : ''}`}>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>

      {embedded && <ZadokHeader onDark={false} />}
      <header className={`site-header ${embedded ? 'site-header-product' : ''}`}>
        <div className="wrap site-header-inner">
          <div className="product-brand">
            <Logo to={embedded ? '/produtos/squad-ai' : '/'} />
            {embedded && <PorZadok />}
          </div>
          <nav className="site-nav" aria-label="Seções do Squad AI">
            <a href="#como-funciona">Como funciona</a>
            <a href="#integracoes">Integrações</a>
            <a href="#processos">Processos</a>
            <a href="#seguranca">Segurança</a>
            <a href="#planos">Planos</a>
          </nav>
          {/* Dentro do site da Zadok, o cabeçalho da marca-mãe já tem o "Falar com a Zadok". */}
          {!embedded && (
            <div className="site-actions">
              <Cta className="btn btn-secondary" />
            </div>
          )}
        </div>
      </header>

      <main id="conteudo">
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <h1>
                <span>Processos repetitivos,</span> <span>resolvidos por agentes</span>{' '}
                <span className="hero-accent">que conhecem sua empresa.</span>
              </h1>
              <p className="hero-lede">
                Ensine como sua equipe trabalha, conecte o Microsoft 365, o Google Workspace e os canais de conversa, e
                deixe os agentes executarem as tarefas do dia a dia. Você decide o que precisa de aprovação.
              </p>
              <div className="hero-ctas">
                <Cta className="btn btn-primary btn-lg" />
                <a href="#como-funciona" className="btn btn-secondary btn-lg">
                  Ver como funciona
                </a>
              </div>
            </div>
            <div className="hero-art">
              <HeroTeam />
            </div>
          </div>
        </section>

        <section className="section section-demo" aria-labelledby="demo-title">
          <div className="wrap">
            <div className="section-head">
              <h2 id="demo-title">
                O agente segue o processo da empresa <span className="accent">e pede aprovação quando precisa.</span>
              </h2>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section id="como-funciona" className="section">
          <div className="wrap">
            <div className="section-head">
              <h2>
                Do processo no papel <span className="accent">ao agente trabalhando.</span>
              </h2>
              <p>Sem escrever prompts. Você explica como as coisas funcionam, como faria com alguém novo na equipe.</p>
            </div>
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={s.title} className="step">
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                  <p className="step-example">{s.example}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="integracoes" className="section section-surface">
          <div className="wrap split">
            <div className="section-head">
              <h2>
                Funciona onde sua equipe <span className="accent">já trabalha.</span>
              </h2>
              <p>
                Os agentes enviam e-mails, criam eventos, buscam arquivos e respondem mensagens com a conta da empresa.
                Cada ação fica registrada.
              </p>
            </div>
            <div className="platforms" style={{ '--n': platforms.length }} role="region" aria-label="Plataformas compatíveis">
              <ul className="platforms-track">
                {/* A lista aparece 3 vezes em sequência para o giro nunca mostrar um buraco; só a primeira é lida. */}
                {[0, 1, 2].flatMap((copy) =>
                  platforms.map((p) => (
                    <li key={`${copy}-${p.name}`} className="platform-logo" aria-hidden={copy > 0 ? 'true' : undefined}>
                      <img src={p.src} alt="" />
                      {copy === 0 && <span className="visually-hidden">{p.name}</span>}
                    </li>
                  )),
                )}
              </ul>
            </div>
          </div>
        </section>

        <section id="processos" className="section">
          <div className="wrap">
            <div className="section-head">
              <h2>
                Comece pelo processo <span className="accent">que mais se repete.</span>
              </h2>
            </div>
            <div className="process-table" role="table" aria-label="Exemplos de processos automatizados">
              <div className="process-row process-row-head" role="row">
                <span role="columnheader">Área</span>
                <span role="columnheader">Processo</span>
                <span role="columnheader">O que o agente faz</span>
              </div>
              {processes.map(([area, name, what]) => (
                <div key={name} className="process-row" role="row">
                  <span role="cell" className="process-area">
                    {area}
                  </span>
                  <span role="cell" className="process-name">
                    {name}
                  </span>
                  <span role="cell" className="process-what">
                    {what}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="seguranca" className="section section-surface">
          <div className="wrap split">
            <div className="section-head">
              <h2>
                Automação com controle <span className="accent">do começo ao fim.</span>
              </h2>
            </div>
            <ul className="security-list">
              <li>
                <span className="feature-icon">
                  <IconShield />
                </span>
                <div>
                  <h3>Aprovação humana por ação</h3>
                  <p>Escolha, ação por ação, o que o agente faz sozinho e o que espera alguém da equipe aprovar.</p>
                </div>
              </li>
              <li>
                <span className="feature-icon">
                  <IconLock />
                </span>
                <div>
                  <h3>Credenciais protegidas</h3>
                  <p>As conexões com cada plataforma ficam criptografadas e separadas por empresa.</p>
                </div>
              </li>
              <li>
                <span className="feature-icon">
                  <IconHistory />
                </span>
                <div>
                  <h3>Histórico de tudo o que foi feito</h3>
                  <p>Veja qual agente executou cada ação, quando, a pedido de quem e quem aprovou.</p>
                </div>
              </li>
            </ul>
          </div>
        </section>

        <section id="planos" className="section" aria-labelledby="planos-title">
          <div className="wrap">
            <div className="section-head section-head-center">
              <h2 id="planos-title">
                Planos para cada <span className="accent">momento da empresa.</span>
              </h2>
              <p>Comece pequeno e cresça conforme os agentes assumem mais processos.</p>
            </div>
            <div className="plans">
              {plans.map((plan) => (
                <article key={plan.name} className={`plan ${plan.featured ? 'plan-featured' : ''}`}>
                  {plan.featured && <span className="plan-badge">Mais escolhido</span>}
                  <h3>{plan.name}</h3>
                  <p className="plan-price">
                    <strong>{plan.price}</strong>
                    <span>/mês</span>
                  </p>
                  <p className="plan-text">{plan.text}</p>
                  <Cta className={`btn ${plan.featured ? 'btn-primary' : 'btn-secondary'} plan-cta`}>Quero este plano</Cta>
                  <ul className="plan-features">
                    {plan.features.map((f) => (
                      <li key={f}>
                        <IconCheck aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="wrap cta-inner">
            <h2>Escolha um processo e coloque o primeiro agente para trabalhar esta semana.</h2>
            <Cta className="btn btn-primary btn-lg" />
          </div>
        </section>
      </main>

      {embedded ? (
        <ZadokFooter />
      ) : (
    <footer className="site-footer">
          <div className="wrap footer-inner">
            <Logo />
            <Endorsement />
            <p>
              © {new Date().getFullYear()} {brand.name}.{' '}
              {brand.termsUrl && <a href={brand.termsUrl}>Termos de uso</a>}{' '}
              {brand.privacyUrl && <a href={brand.privacyUrl}>Privacidade</a>}{' '}
              {brand.supportEmail && <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}

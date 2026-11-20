// Demonstração: um trecho marcado de um processo interno vira a resposta e a ação do agente.
export default function HeroDemo() {
  return (
    <div className="demo" aria-label="Exemplo: o processo de reembolso marcado pela equipe vira a resposta do agente no Teams">
      <figure className="demo-doc">
        <figcaption className="demo-caption">O processo que a equipe ensinou</figcaption>
        <div className="sheet">
          <p className="sheet-meta">Casa Aurora, Financeiro. Revisado em outubro de 2026</p>
          <h3 className="sheet-title">Reembolso de despesas de viagem</h3>
          <ol className="sheet-steps">
            <li>
              Despesas de <span className="hl hl-1">até R$ 300 são aprovadas pelo gestor direto</span>, sem passar pela
              diretoria.
            </li>
            <li>
              O colaborador envia o <span className="hl hl-2">recibo ou a nota fiscal</span> em até 10 dias após a
              despesa.
            </li>
            <li>
              O pedido segue por e-mail para <span className="hl hl-3">financeiro@casaaurora.com.br</span>, com o valor e
              o centro de custo.
            </li>
          </ol>
        </div>
      </figure>

      <figure className="demo-chat">
        <figcaption className="demo-caption">O agente atendendo no Teams</figcaption>
        <div className="chat">
          <div className="chat-head">
            <span className="chat-avatar" aria-hidden="true">
              F
            </span>
            <div>
              <strong>Agente Financeiro</strong>
              <span>Microsoft Teams</span>
            </div>
          </div>
          <div className="chat-body">
            <p className="bubble bubble-in">Gastei R$ 186 de táxi na visita ao cliente ontem. Como peço o reembolso?</p>
            <div className="bubble bubble-out">
              <p>
                Pode deixar, Bruno. Até R$ 300 a aprovação é do seu gestor. Recebi o recibo que você anexou e já preparei
                o pedido para o Financeiro.
              </p>
            </div>
            <p className="action-chip">
              <span className="pill pill-warn">Aguardando aprovação</span>
              Enviar e-mail pelo Outlook para financeiro@casaaurora.com.br
            </p>
          </div>
        </div>
      </figure>
    </div>
  );
}

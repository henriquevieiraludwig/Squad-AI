import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, DEMO } from '../../api.js';
import { IconChat, IconSend } from '../../components/Icons.jsx';
import { PageHead, EmptyState, LoadingRows, RUN_STATUS } from './common.jsx';

export default function TestChat({ agents, openCreate, refreshSummary }) {
  const [params, setParams] = useSearchParams();
  const agentId = Number(params.get('agente')) || agents?.[0]?.id || null;
  const agent = agents?.find((a) => a.id === agentId);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    setConversationId(null);
    setMessages([]);
    setError('');
  }, [agentId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages, sending]);

  async function send(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    setError('');
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await api(`/agents/${agentId}/chat`, { method: 'POST', body: { message: text, conversationId } });
      setConversationId(res.conversationId);
      setMessages((m) => [...m, { role: 'agent', text: res.reply, actions: res.actions }]);
      if (res.actions?.length) refreshSummary();
    } catch (err) {
      setError(err.message);
      setMessages((m) => m.slice(0, -1));
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  if (!agents) return <LoadingRows rows={3} />;
  if (!agents.length)
    return (
      <>
        <PageHead title="Testar conversas" lede="Converse com um agente como se fosse um colaborador ou cliente." />
        <section className="panel">
          <EmptyState icon={<IconChat />} title="Crie um agente para testar" text="O teste mostra as respostas e as ações que o agente propõe.">
            <button className="btn btn-primary" onClick={openCreate}>
              Criar agente
            </button>
          </EmptyState>
        </section>
      </>
    );

  const suggestions = [
    'Quais compromissos eu tenho amanhã?',
    'Envie um e-mail para financeiro@empresa.com com o resumo do reembolso de R$ 186.',
    'Avise o canal de operações que a visita das 14h foi remarcada.',
  ];

  return (
    <>
      <PageHead title="Testar conversas" lede="As ações que pedem aprovação vão para a fila de aprovações, como aconteceria de verdade.">
        <div className="field inline-field">
          <label htmlFor="chat-agent">Agente</label>
          <select id="chat-agent" className="input" value={agentId || ''} onChange={(e) => setParams({ agente: e.target.value })}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </PageHead>

      <section className="chat-panel" aria-label={`Conversa com ${agent?.name}`}>
        <div className="chat-panel-head">
          <div>
            <strong>{agent?.name}</strong>
            <span className="muted">{agent?.area}</span>
          </div>
          <div className="chat-panel-links">
            <Link to={`/app/agentes/${agentId}`} className="link">
              Ferramentas do agente
            </Link>
            {messages.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setConversationId(null);
                  setMessages([]);
                }}
              >
                Nova conversa
              </button>
            )}
          </div>
        </div>

        <div className="chat-log" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Comece com um pedido real do dia a dia. Por exemplo:</p>
              <ul>
                {suggestions.map((s) => (
                  <li key={s}>
                    <button type="button" className="suggestion" onClick={() => setDraft(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
              {DEMO && <p className="hint">Na demonstração, as respostas são simuladas sem chamar o modelo de IA.</p>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              <p>{m.text}</p>
              {m.actions?.map((a) => {
                const st = RUN_STATUS[a.status];
                return (
                  <div key={a.id} className="msg-action">
                    <span className={`pill ${st.cls}`}>{st.label}</span>
                    <span>
                      {a.label}
                      {a.input?.to ? ` para ${a.input.to}` : ''}
                    </span>
                    {a.status === 'pendente' && (
                      <Link to="/app/aprovacoes" className="link">
                        Revisar
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {sending && (
            <div className="msg msg-agent msg-typing" aria-label="O agente está respondendo">
              <span />
              <span />
              <span />
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="alert alert-error chat-error" role="alert">
            {error}
          </div>
        )}

        <form className="composer" onSubmit={send}>
          <label htmlFor="chat-input" className="visually-hidden">
            Mensagem para o agente
          </label>
          <textarea
            id="chat-input"
            className="input"
            rows={2}
            value={draft}
            placeholder="Escreva como um colaborador ou cliente escreveria"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
          />
          <button className="btn btn-primary" type="submit" disabled={sending || !draft.trim()}>
            {sending ? <span className="spinner" aria-hidden="true" /> : <IconSend />}
            Enviar
          </button>
        </form>
      </section>
    </>
  );
}

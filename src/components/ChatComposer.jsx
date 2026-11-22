import { useEffect, useRef, useState } from 'react';
import { fileToDataUrl } from '../api.js';
import { IconSend, IconPaperclip, IconMic, IconX } from './Icons.jsx';

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024; // acima disso (e vídeo/áudio), vai só o nome e o tamanho
const metaOnly = (f) => /^(video|audio)\//.test(f.type) || f.size > MAX_BYTES;

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const sizeLabel = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Caixa de mensagem dos chats com o agente: texto, anexos (clipe) e ditado por voz (microfone).
export default function ChatComposer({ id, value, onChange, onSend, sending, placeholder, notify }) {
  const [files, setFiles] = useState([]);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const baseRef = useRef('');
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => () => recRef.current?.abort(), []);

  function addFiles(list) {
    const next = [...files];
    for (const f of list) {
      if (next.length >= MAX_FILES) {
        notify?.(`Envie no máximo ${MAX_FILES} arquivos por mensagem.`, 'error');
        break;
      }
      next.push(f);
    }
    setFiles(next);
  }

  function toggleMic() {
    if (!SpeechRecognition) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'pt-BR';
    rec.continuous = true;
    rec.interimResults = true;
    baseRef.current = valueRef.current ? `${valueRef.current.replace(/\s+$/, '')} ` : '';
    rec.onresult = (e) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      onChange(`${baseRef.current}${finalText}${interim}`.replace(/\s{2,}/g, ' '));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') notify?.('Libere o acesso ao microfone no navegador para ditar a mensagem.', 'error');
      else if (e.error !== 'aborted' && e.error !== 'no-speech') notify?.('Não foi possível usar o microfone agora.', 'error');
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  async function submit(e) {
    e?.preventDefault();
    if (sending) return;
    if (listening) recRef.current?.stop();
    const text = value.trim();
    if (!text && !files.length) return;
    let attachments = [];
    try {
      attachments = await Promise.all(
        files.map(async (f) => (metaOnly(f) ? { name: f.name, type: f.type, size: f.size } : { name: f.name, type: f.type, size: f.size, data: await fileToDataUrl(f) })),
      );
    } catch (err) {
      notify?.(err.message, 'error');
      return;
    }
    const sent = files;
    setFiles([]);
    const ok = await onSend(text, attachments, sent);
    if (ok === false) setFiles(sent);
  }

  return (
    <form
      className="composer composer-rich"
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files?.length) addFiles([...e.dataTransfer.files]);
      }}
    >
      {files.length > 0 && (
        <ul className="attach-list" aria-label="Arquivos anexados">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="attach-chip">
              <IconPaperclip size={14} />
              <span className="attach-name">{f.name}</span>
              <span className="muted">
                {sizeLabel(f.size)}
                {metaOnly(f) ? ' · só o nome' : ''}
              </span>
              <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remover ${f.name}`}>
                <IconX />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = '';
          }}
        />
        <button type="button" className="btn btn-ghost composer-icon" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivos" title="Anexar arquivos (qualquer tipo)">
          <IconPaperclip />
        </button>
        {SpeechRecognition && (
          <button
            type="button"
            className={`btn btn-ghost composer-icon ${listening ? 'is-listening' : ''}`}
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? 'Parar de ditar' : 'Ditar mensagem'}
            title={listening ? 'Parar de ditar' : 'Ditar mensagem'}
          >
            <IconMic />
          </button>
        )}
        <label htmlFor={id} className="visually-hidden">
          Mensagem para o agente
        </label>
        <textarea
          id={id}
          className="input"
          rows={2}
          value={value}
          placeholder={listening ? 'Ouvindo… fale a sua mensagem' : placeholder}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const pasted = [...(e.clipboardData?.files || [])];
            if (pasted.length) {
              e.preventDefault();
              addFiles(pasted);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
        />
        <button className="btn btn-primary" type="submit" disabled={sending || (!value.trim() && !files.length)}>
          {sending ? <span className="spinner" aria-hidden="true" /> : <IconSend />}
          <span className="composer-send-label">Enviar</span>
        </button>
      </div>
    </form>
  );
}

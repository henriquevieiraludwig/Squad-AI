import { useCallback, useEffect, useRef, useState } from 'react';
import { api, fileToBase64 } from '../../api.js';
import { can } from '../../auth.jsx';
import { IconDoc, IconUpload, IconTrash } from '../../components/Icons.jsx';
import { PageHead, SearchInput, EmptyState, ErrorState, LoadingRows, formatDate, fmtNumber } from './common.jsx';

const ACCEPT = '.pdf,.docx,.txt,.md,.csv';

export default function Knowledge({ user, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState(null); // 'arquivo' | 'texto'
  const [preview, setPreview] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const editable = can(user, 'configurar');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await api('/knowledge'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(doc) {
    try {
      await api(`/knowledge/${doc.id}`, { method: 'DELETE' });
      setConfirmId(null);
      notify(`${doc.title} removido. Os agentes deixam de usar este conteúdo.`);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  async function open(doc) {
    try {
      setPreview((await api(`/knowledge/${doc.id}`)).doc);
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  const docs = data?.docs.filter((d) => !query.trim() || d.title.toLowerCase().includes(query.trim().toLowerCase()));
  const pct = data ? Math.min(100, Math.round((data.budget.used / data.budget.max) * 100)) : 0;

  return (
    <>
      <PageHead
        title="Contexto da empresa"
        lede="O que todos os agentes precisam saber: o que a empresa faz, políticas, tom de voz, perguntas frequentes. Os agentes consultam este material antes de responder e citam a fonte."
      >
        {editable && (
          <>
            <button className="btn btn-secondary" onClick={() => setMode('texto')}>
              Escrever texto
            </button>
            <button className="btn btn-primary" onClick={() => setMode('arquivo')}>
              <IconUpload />
              Enviar documento
            </button>
          </>
        )}
      </PageHead>

      {data && (
        <section className="panel budget" aria-label="Espaço de contexto">
          <div className="budget-head">
            <strong>Espaço de contexto usado</strong>
            <span className="muted tabular">
              {fmtNumber(data.budget.used)} de {fmtNumber(data.budget.max)} caracteres ({pct}%)
            </span>
          </div>
          <div className={`progress ${pct > 85 ? 'progress-warn' : ''}`} aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">Cerca de 4 caracteres equivalem a 1 token. Prefira enviar só o que os agentes realmente usam.</p>
        </section>
      )}

      {data?.docs.length > 0 && (
        <div className="toolbar">
          <SearchInput id="doc-search" label="Buscar documentos" value={query} onChange={setQuery} placeholder="Buscar pelo título" />
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingRows rows={3} />
      ) : data.docs.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<IconDoc />}
            title="Nenhum material ainda"
            text="Comece pelo que mais aparece nas conversas: política de atendimento, perguntas frequentes, tabela de prazos ou o manual da área."
          >
            {editable && (
              <button className="btn btn-secondary" onClick={() => setMode('arquivo')}>
                Enviar o primeiro documento
              </button>
            )}
          </EmptyState>
        </section>
      ) : (
        <section className="panel panel-flush">
          <ul className="doc-list">
            {docs.map((d) => (
              <li key={d.id} className="doc">
                <span className="doc-icon" aria-hidden="true">
                  <IconDoc size={18} />
                </span>
                <button className="doc-main" onClick={() => open(d)}>
                  <strong>{d.title}</strong>
                  <span className="muted">
                    {d.source === 'arquivo' ? d.fileName : 'Texto escrito na plataforma'}, {fmtNumber(d.chars)} caracteres, {formatDate(d.createdAt)}
                    {d.createdBy && ` por ${d.createdBy}`}
                  </span>
                </button>
                {editable &&
                  (confirmId === d.id ? (
                    <span className="confirm-row">
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                        Cancelar
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(d)}>
                        Remover
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmId(d.id)} aria-label={`Remover ${d.title}`}>
                      <IconTrash />
                    </button>
                  ))}
              </li>
            ))}
            {docs.length === 0 && <li className="empty">Nenhum documento com esse título.</li>}
          </ul>
        </section>
      )}

      {mode && (
        <AddDialog
          mode={mode}
          onClose={() => setMode(null)}
          onAdded={(doc) => {
            setMode(null);
            notify(`${doc.title} adicionado. Os agentes já usam este conteúdo.`);
            load();
          }}
        />
      )}
      {preview && <PreviewDialog doc={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

function AddDialog({ mode, onClose, onAdded }) {
  const ref = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function pick(f) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return setError('O arquivo passa de 10 MB. Divida em partes menores.');
    setError('');
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = mode === 'arquivo' ? { title, fileName: file?.name, data: file ? await fileToBase64(file) : '' } : { title, text };
      if (mode === 'arquivo' && !file) throw new Error('Escolha um arquivo.');
      const { doc } = await api('/knowledge', { method: 'POST', body });
      onAdded(doc);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="add-doc-title">
      <form onSubmit={submit} noValidate>
        <div className="dialog-head">
          <h2 id="add-doc-title">{mode === 'arquivo' ? 'Enviar documento' : 'Escrever texto'}</h2>
          <p>{mode === 'arquivo' ? 'PDF, Word (.docx), TXT, Markdown ou CSV, até 10 MB. PDFs escaneados sem texto não funcionam.' : 'Cole ou escreva orientações, perguntas frequentes ou políticas.'}</p>
        </div>
        <div className="dialog-body">
          {error && (
            <div className="form-alert" role="alert">
              {error}
            </div>
          )}
          {mode === 'arquivo' && (
            <label
              className={`dropzone ${dragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
            >
              <input type="file" accept={ACCEPT} onChange={(e) => pick(e.target.files?.[0])} className="visually-hidden" />
              <IconUpload />
              {file ? (
                <span>
                  <strong>{file.name}</strong> ({Math.ceil(file.size / 1024)} KB). Clique para trocar.
                </span>
              ) : (
                <span>Arraste o arquivo aqui ou clique para escolher</span>
              )}
            </label>
          )}
          <div className="field">
            <label htmlFor="doc-title">Título</label>
            <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Política de reembolso" />
            <span className="hint">Os agentes citam este título quando usam o conteúdo.</span>
          </div>
          {mode === 'texto' && (
            <div className="field">
              <label htmlFor="doc-text">Conteúdo</label>
              <textarea id="doc-text" className="input doc-textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Atendemos de segunda a sexta, das 8h às 18h. Trocas valem por 30 dias com nota fiscal…" />
            </div>
          )}
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            {busy ? (mode === 'arquivo' ? 'Lendo o documento…' : 'Salvando…') : 'Adicionar ao contexto'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function PreviewDialog({ doc, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="preview-title">
      <div className="dialog-head">
        <h2 id="preview-title">{doc.title}</h2>
        <p>Este é o texto que os agentes leem{doc.truncated ? ' (mostrando o começo)' : ''}.</p>
      </div>
      <div className="dialog-body">
        <pre className="doc-preview">{doc.preview}</pre>
      </div>
      <div className="dialog-foot">
        <button className="btn btn-secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
    </dialog>
  );
}

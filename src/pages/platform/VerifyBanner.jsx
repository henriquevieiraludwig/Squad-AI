import { useState } from 'react';
import { api } from '../../api.js';

export default function VerifyBanner({ email, notify }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await api('/auth/resend-verification', { method: 'POST' });
      setSent(true);
      notify('Enviamos um novo link de confirmação.');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="alert alert-info verify-banner" role="status">
      <span>
        Confirme o e-mail <strong>{email}</strong> para receber avisos de aprovação e poder recuperar a senha.
      </span>
      {!sent && (
        <button className="btn btn-secondary btn-sm" onClick={resend} disabled={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          Reenviar link
        </button>
      )}
    </div>
  );
}

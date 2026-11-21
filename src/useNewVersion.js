import { useEffect, useState } from 'react';

/* global __APP_VERSION__ */
const CURRENT = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
const EVERY_MS = 2 * 60 * 1000;

// Confere de tempos em tempos se o servidor já está numa versão mais nova que esta tela.
// Quando está, recarrega sozinho na próxima vez que a aba voltar a ficar visível (sem atrapalhar quem está digitando).
export function useNewVersion() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (CURRENT === 'dev') return undefined;
    let stop = false;
    async function check() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = await res.json();
        if (!stop && data.version && data.version !== CURRENT) setAvailable(true);
      } catch {
        // sem rede: tenta de novo depois
      }
    }
    check();
    const timer = setInterval(check, EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!available) return undefined;
    const reloadWhenBack = () => {
      if (document.visibilityState === 'visible') window.location.reload();
    };
    // Se a aba estiver escondida, recarrega quando a pessoa voltar; se estiver aberta, mostra o aviso.
    document.addEventListener('visibilitychange', reloadWhenBack);
    return () => document.removeEventListener('visibilitychange', reloadWhenBack);
  }, [available]);

  return available;
}

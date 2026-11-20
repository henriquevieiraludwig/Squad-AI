// Utilitários comuns às integrações.

export class ConnectorError extends Error {
  constructor(message, { status, details, reconnect = false } = {}) {
    super(message);
    this.status = status;
    this.details = details;
    this.reconnect = reconnect; // true quando a empresa precisa conectar a conta de novo
  }
}

export const TIMEZONE = process.env.DEFAULT_TIMEZONE || 'America/Sao_Paulo';
export const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
export const APP_URL = (process.env.APP_URL || PUBLIC_URL).replace(/\/$/, '');

// Faz a chamada HTTP e transforma falhas em mensagens que o agente e a equipe entendem.
export async function request(url, { method = 'GET', token, body, form, headers = {}, provider = 'serviço' } = {}) {
  const h = { Accept: 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(20000) });
  } catch (err) {
    throw new ConnectorError(`Não foi possível falar com ${provider}: ${err.message}`);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail =
      data?.error?.message || data?.error_description || data?.description || (typeof data?.error === 'string' ? data.error : '') || text.slice(0, 300);
    throw new ConnectorError(`${provider} recusou a operação (${res.status}): ${detail}`, {
      status: res.status,
      details: data,
      reconnect: res.status === 401,
    });
  }
  return data;
}

export const splitEmails = (value) =>
  String(value || '')
    .split(/[,;\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

// Remove o fuso de uma data ISO para enviar junto com o campo timeZone das APIs.
export const localDateTime = (iso) => String(iso).replace(/(Z|[+-]\d{2}:?\d{2})$/, '').slice(0, 19);

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  return missing.length ? missing : null;
}

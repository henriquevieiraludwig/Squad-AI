export class ApiError extends Error {
  constructor(message, status, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const DEMO = import.meta.env.VITE_DEMO === '1';

export async function api(path, { method = 'GET', body } = {}) {
  if (import.meta.env.VITE_DEMO === '1') {
    const { demoApi } = await import('./demoApi.js');
    return demoApi(path, { method, body });
  }
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Algo deu errado. Tente de novo.', res.status, data.fields);
  }
  return data;
}

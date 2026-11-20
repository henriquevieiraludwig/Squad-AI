export class ApiError extends Error {
  constructor(message, status, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const DEMO = import.meta.env.VITE_DEMO === '1';

// Em desenvolvimento, ?parceiro=slug na URL escolhe a marca do parceiro sem configurar domínios.
function partnerOverride() {
  if (import.meta.env.PROD) return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('parceiro');
    if (fromUrl) sessionStorage.setItem('parceiro', fromUrl);
    return sessionStorage.getItem('parceiro');
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  if (import.meta.env.VITE_DEMO === '1') {
    const { demoApi } = await import('./demoApi.js');
    return demoApi(path, { method, body });
  }
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  const slug = partnerOverride();
  if (slug) headers['X-Partner-Slug'] = slug;
  let res;
  try {
    res = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Algo deu errado. Tente de novo.', res.status, data.fields);
  return data;
}

// Lê um arquivo do computador como base64 (para envio de documentos).
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

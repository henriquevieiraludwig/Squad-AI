// WhatsApp Business pela Cloud API oficial da Meta. Também é canal de entrada.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { request, ConnectorError } from './http.js';

const VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const P = 'WhatsApp';

export const token = {
  async connect({ phoneNumberId, accessToken, appSecret }) {
    const id = String(phoneNumberId || '').trim();
    const tok = String(accessToken || '').trim();
    if (!/^\d{5,}$/.test(id)) throw new ConnectorError('O ID do número de telefone tem só dígitos. Copie do painel da Meta.', { status: 400 });
    if (!tok) throw new ConnectorError('Informe o token de acesso.', { status: 400 });
    const info = await request(`${GRAPH}/${id}?fields=display_phone_number,verified_name`, { token: tok, provider: P });
    return {
      creds: { phoneNumberId: id, accessToken: tok, appSecret: String(appSecret || '').trim() || null },
      accountLabel: `${info.verified_name} (${info.display_phone_number})`,
    };
  },
};

async function send(creds, to, text) {
  const digits = String(to).replace(/\D/g, '');
  if (digits.length < 10) throw new ConnectorError('Número inválido. Use DDI + DDD + número, só dígitos.');
  const data = await request(`${GRAPH}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    token: creds.accessToken,
    provider: P,
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: digits, type: 'text', text: { body: text, preview_url: false } },
  });
  return data.messages?.[0]?.id;
}

export const actions = {
  async whatsapp_send_message({ creds }, { to, text }) {
    const id = await send(creds, to, text);
    return { enviado: true, id };
  },

  async whatsapp_send_template({ creds }, { to, template, language, params }) {
    const digits = String(to).replace(/\D/g, '');
    if (digits.length < 10) throw new ConnectorError('Número inválido. Use DDI + DDD + número, só dígitos.');
    if (!/^[a-z0-9_]+$/.test(template)) throw new ConnectorError('O nome do modelo usa só letras minúsculas, números e _.');
    const values = String(params || '')
      .split('|')
      .map((v) => v.trim())
      .filter(Boolean);
    const data = await request(`${GRAPH}/${creds.phoneNumberId}/messages`, {
      method: 'POST',
      token: creds.accessToken,
      provider: P,
      body: {
        messaging_product: 'whatsapp',
        to: digits,
        type: 'template',
        template: {
          name: template,
          language: { code: language || 'pt_BR' },
          components: values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : undefined,
        },
      },
    });
    return { enviado: true, id: data.messages?.[0]?.id };
  },
};

// Confere a assinatura X-Hub-Signature-256 quando a chave secreta do app foi informada.
export function verifySignature(creds, rawBody, header) {
  if (!creds.appSecret) return true;
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', creds.appSecret).update(rawBody).digest();
  const got = Buffer.from(header.slice(7), 'hex');
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function parseInbound(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      const names = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of v.messages || []) {
        if (m.type !== 'text') continue;
        out.push({ externalId: m.from, contact: names[m.from] || `+${m.from}`, text: m.text.body });
      }
    }
  }
  return out;
}

export async function reply(creds, externalId, text) {
  for (let i = 0; i < text.length; i += 4000) await send(creds, externalId, text.slice(i, i + 4000));
}

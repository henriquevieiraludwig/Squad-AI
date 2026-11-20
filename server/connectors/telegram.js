// Telegram: bot criado pela empresa no @BotFather. Também é canal de entrada.
import { request, ConnectorError, PUBLIC_URL } from './http.js';

const P = 'Telegram';
const BASE = (process.env.TELEGRAM_API_URL || 'https://api.telegram.org').replace(/\/$/, '');
const api = (token, method, body) => request(`${BASE}/bot${token}/${method}`, { method: 'POST', body: body || {}, provider: P });

export const token = {
  // Valida o token, registra o webhook e devolve o que deve ser guardado.
  async connect({ botToken }, { integrationKey, webhookSecret }) {
    if (!/^\d+:[\w-]{20,}$/.test(String(botToken || '').trim())) {
      throw new ConnectorError('O token não parece um token de bot. Ele tem o formato 123456789:ABC-DEF...', { status: 400 });
    }
    const t = botToken.trim();
    const me = await api(t, 'getMe');
    let warning = null;
    const webhookUrl = `${PUBLIC_URL}/api/webhooks/telegram/${integrationKey}`;
    if (PUBLIC_URL.startsWith('https://')) {
      await api(t, 'setWebhook', { url: webhookUrl, secret_token: webhookSecret, allowed_updates: ['message'] });
    } else {
      warning = 'O endereço público da plataforma não usa HTTPS, então o Telegram ainda não envia mensagens para o agente. Configure PUBLIC_URL com HTTPS e conecte de novo.';
    }
    return { creds: { botToken: t }, accountLabel: `@${me.result.username}`, warning };
  },
  async disconnect({ botToken }) {
    await api(botToken, 'deleteWebhook').catch(() => {});
  },
};

export const actions = {
  async telegram_send_message({ creds }, { chatId, text }) {
    const data = await api(creds.botToken, 'sendMessage', { chat_id: chatId, text });
    return { enviado: true, message_id: data.result.message_id };
  },
};

// Converte um update do Telegram em mensagem de entrada (ou null se não for texto).
export function parseInbound(update) {
  const m = update?.message;
  if (!m?.text) return null;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || m.chat?.title || 'Contato';
  return { externalId: String(m.chat.id), contact: name, text: m.text };
}

export async function reply(creds, externalId, text) {
  // O Telegram aceita até 4096 caracteres por mensagem.
  for (let i = 0; i < text.length; i += 4000) {
    await api(creds.botToken, 'sendMessage', { chat_id: externalId, text: text.slice(i, i + 4000) });
  }
}

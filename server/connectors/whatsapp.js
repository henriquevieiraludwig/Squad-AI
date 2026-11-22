import { toWhatsApp, chunkLines } from '../../shared/format.js';
// WhatsApp Business pela Cloud API oficial da Meta. Também é canal de entrada.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { request, ConnectorError } from './http.js';
import { db } from '../db.js';

const VERSION = process.env.META_GRAPH_VERSION || 'v23.0';
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const P = 'WhatsApp';

// Endereço da API: o da Meta por padrão, ou o de um provedor que repassa para a Meta
// (serviços que dão um token próprio, como sk_live_..., no lugar do token EAAB... da Meta).
export function apiBase(value) {
  const v = String(value || '').trim().replace(/\/+$/, '');
  if (!v) return GRAPH;
  let u;
  try {
    u = new URL(v);
  } catch {
    throw new ConnectorError('O endereço da API precisa ser um link completo, começando com https://', { status: 400 });
  }
  if (u.protocol !== 'https:') throw new ConnectorError('O endereço da API precisa começar com https://', { status: 400 });
  if (/\/dashboard(\/|$)/i.test(u.pathname)) {
    throw new ConnectorError('Esse é o link do painel do provedor, não o da API. Abra o "Como usar" e copie o endereço que aparece nos exemplos de envio de mensagem (a parte antes de /<id do número>/messages).', { status: 400 });
  }
  return v;
}
const baseOf = (creds) => creds.apiBase || GRAPH;

export const token = {
  async connect({ phoneNumberId, accessToken, appSecret, apiBase: base }) {
    const id = String(phoneNumberId || '').trim();
    const tok = String(accessToken || '').trim();
    if (!/^\d{5,}$/.test(id)) throw new ConnectorError('O ID do número de telefone tem só dígitos. Copie do painel da Meta.', { status: 400 });
    if (!tok) throw new ConnectorError('Informe o token de acesso.', { status: 400 });
    const url = apiBase(base);
    // Token de provedor intermediário (ex.: Datafy, sk_live_...) não funciona direto na Meta.
    if (url === GRAPH && !/^EA/.test(tok)) {
      throw new ConnectorError(
        'Esse token não é da Meta (os da Meta começam com EAA). Se ele é de um provedor como a Datafy, preencha o campo Endereço da API (Datafy: https://cloud.datafyapi.com.br/v1).',
        { status: 400 },
      );
    }
    const info = await request(`${url}/${id}?fields=display_phone_number,verified_name`, { token: tok, provider: P });
    return {
      creds: { phoneNumberId: id, accessToken: tok, appSecret: String(appSecret || '').trim() || null, apiBase: url === GRAPH ? null : url },
      accountLabel: `${info.verified_name} (${info.display_phone_number})`,
    };
  },
};

// Brasil: o mesmo celular pode aparecer com ou sem o 9 depois do DDD.
export function numberVariants(digits) {
  const d = String(digits).replace(/\D/g, '');
  const out = [d];
  const m = d.match(/^55(\d{2})(\d+)$/);
  if (m && m[2].length === 9 && m[2].startsWith('9')) out.push(`55${m[1]}${m[2].slice(1)}`);
  if (m && m[2].length === 8 && /^[6-9]/.test(m[2])) out.push(`55${m[1]}9${m[2]}`);
  return out;
}

const WINDOW_MS = 24 * 3600 * 1000 - 5 * 60 * 1000; // 24 horas, com 5 minutos de folga

// Última mensagem que a pessoa mandou para o número (abre a janela de 24 horas da Meta).
export async function lastInbound(orgId, to) {
  if (!orgId) return null;
  return db.get(
    `SELECT c.external_id, MAX(m.created_at) AS at FROM conversations c JOIN messages m ON m.conversation_id = c.id
      WHERE c.org_id = $1 AND c.channel = 'whatsapp' AND c.external_id = ANY($2) AND m.author = 'contato'
      GROUP BY c.external_id ORDER BY at DESC LIMIT 1`,
    [orgId, numberVariants(to)],
  );
}

// Modelo de abertura: a Meta só entrega mensagem para quem não escreveu nas últimas 24h se for um modelo aprovado.
export const OPENING = {
  name: 'abertura_conversa',
  language: 'pt_BR',
  body: 'Olá! Aqui é {{1}}. Tenho uma mensagem para você:\n\n{{2}}\n\nResponda esta mensagem para continuarmos a conversa.',
  example: ['a equipe da Zadok', 'Seu pedido foi separado e sai para entrega amanhã de manhã.'],
};
const templateName = (category) => (category === 'MARKETING' ? `${OPENING.name}_mkt` : OPENING.name);
// Variáveis de modelo não aceitam quebras de linha, tabulação nem muitos espaços seguidos.
export const templateParam = (t) => String(t).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 1000);

export async function createOpeningTemplate(creds, category = 'UTILITY') {
  if (!creds.wabaId) throw new ConnectorError('Informe o WABA ID (ID da conta do WhatsApp Business).', { status: 400 });
  const name = templateName(category);
  try {
    await request(`${baseOf(creds)}/${creds.wabaId}/message_templates`, {
      method: 'POST',
      token: creds.accessToken,
      provider: P,
      body: {
        name,
        language: OPENING.language,
        category,
        components: [{ type: 'BODY', text: OPENING.body, example: { body_text: [OPENING.example] } }],
      },
    });
  } catch (err) {
    // Já existe com esse nome: só acompanha o status.
    if (!/exist/i.test(err.message)) throw err;
  }
  return refreshOpeningTemplate({ ...creds, opening: { name, language: OPENING.language, category } });
}

export async function refreshOpeningTemplate(creds) {
  const o = creds.opening;
  if (!o || !creds.wabaId) return creds;
  const r = await request(`${baseOf(creds)}/${creds.wabaId}/message_templates?name=${o.name}&fields=name,status,language,category,rejected_reason`, {
    token: creds.accessToken,
    provider: P,
  });
  const t = (r?.data || []).find((x) => x.name === o.name && x.language === o.language) || (r?.data || [])[0];
  return { ...creds, opening: { ...o, status: t?.status || 'PENDING', category: t?.category || o.category, rejectedReason: t?.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null } };
}

async function sendTemplate(creds, to, name, language, values) {
  const data = await request(`${baseOf(creds)}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    token: creds.accessToken,
    provider: P,
    body: {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name,
        language: { code: language || 'pt_BR' },
        components: values.length ? [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }] : undefined,
      },
    },
  });
  return data.messages?.[0]?.id;
}

async function send(creds, to, text) {
  const digits = String(to).replace(/\D/g, '');
  if (digits.length < 10) throw new ConnectorError('Número inválido. Use DDI + DDD + número, só dígitos.');
  const data = await request(`${baseOf(creds)}/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    token: creds.accessToken,
    provider: P,
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: digits, type: 'text', text: { body: text, preview_url: false } },
  });
  return data.messages?.[0]?.id;
}

export const actions = {
  // Dentro da janela de 24h: texto normal. Fora dela: o modelo de abertura aprovado, que a Meta entrega.
  async whatsapp_send_message({ creds, orgId }, { to, text }) {
    const digits = String(to).replace(/\D/g, '');
    if (digits.length < 10) throw new ConnectorError('Número inválido. Use DDI + DDD + número, só dígitos.');
    const last = await lastInbound(orgId, digits);
    if (last && Date.now() - new Date(last.at).getTime() < WINDOW_MS) {
      const id = await send(creds, last.external_id, text);
      return { enviado: true, id, como: 'texto (a pessoa escreveu nas últimas 24 horas)' };
    }
    let o = creds.opening;
    if (o && o.status !== 'APPROVED') {
      try {
        o = (await refreshOpeningTemplate(creds)).opening;
      } catch {
        /* segue com o status guardado */
      }
    }
    if (o?.status === 'APPROVED') {
      const org = orgId ? await db.get('SELECT name FROM organizations WHERE id = $1', [orgId]) : null;
      const id = await sendTemplate(creds, last?.external_id || digits, o.name, o.language, [templateParam(org?.name || 'nossa equipe'), templateParam(text)]);
      return {
        enviado: true,
        id,
        como: 'modelo de abertura (a pessoa não escreveu nas últimas 24 horas, então foi pelo modelo aprovado pela Meta)',
        aviso: 'Mensagens de modelo têm cobrança da Meta. Quando a pessoa responder, a conversa segue normalmente.',
      };
    }
    throw new ConnectorError(
      o
        ? `Não enviado: esta pessoa não escreveu para o número nas últimas 24 horas, e o modelo de abertura ainda não foi aprovado pela Meta (status: ${o.status}${o.rejectedReason ? `, motivo: ${o.rejectedReason}` : ''}).`
        : 'Não enviado: esta pessoa não escreveu para o número nas últimas 24 horas, e a Meta só entrega nesses casos um modelo aprovado. Um administrador precisa criar o modelo de abertura em Integrações > WhatsApp (um clique). Avise o usuário disso.',
    );
  },

  async whatsapp_send_template({ creds }, { to, template, language, params }) {
    const digits = String(to).replace(/\D/g, '');
    if (digits.length < 10) throw new ConnectorError('Número inválido. Use DDI + DDD + número, só dígitos.');
    if (!/^[a-z0-9_]+$/.test(template)) throw new ConnectorError('O nome do modelo usa só letras minúsculas, números e _.');
    const values = String(params || '')
      .split('|')
      .map((v) => v.trim())
      .filter(Boolean);
    const id = await sendTemplate(creds, digits, template, language, values.map(templateParam));
    return { enviado: true, id };
  },
};

// Confere a assinatura das mensagens recebidas, quando a chave secreta foi informada.
// Meta: X-Hub-Signature-256 = HMAC(corpo) com a chave secreta do app.
// Datafy (secret whsec_...): x-datafy-signature-256 = HMAC("{timestamp}.{corpo}"), com no máximo 5 minutos.
export function verifySignature(creds, rawBody, header) {
  if (!creds.appSecret) return true;
  const get = typeof header === 'function' ? header : (name) => (/hub-signature/i.test(name) ? header : undefined);
  const same = (sig, data) => {
    if (!sig?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', creds.appSecret).update(data).digest();
    const got = Buffer.from(sig.slice(7), 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  };
  if (creds.appSecret.startsWith('whsec_')) {
    const ts = String(get('x-datafy-timestamp') || '');
    if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    return same(get('x-datafy-signature-256'), Buffer.concat([Buffer.from(`${ts}.`), rawBody]));
  }
  return same(get('X-Hub-Signature-256'), rawBody);
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

// Motivos de falha de entrega mais comuns, em linguagem simples.
const FAILURE_REASONS = {
  131047: 'Passaram mais de 24 horas desde a última mensagem desta pessoa (ou ela nunca escreveu para o número). Fora dessa janela, a Meta só entrega mensagens de modelo aprovado.',
  131026: 'A mensagem não pôde ser entregue: o número pode não ter WhatsApp, estar com versão antiga ou não ter aceitado os termos mais recentes.',
  131049: 'A Meta segurou a mensagem para proteger a experiência do usuário (limite de mensagens de marketing para esta pessoa).',
  131050: 'A pessoa pediu para não receber mensagens de marketing desta empresa.',
  131056: 'Muitas mensagens seguidas para o mesmo número. Espere um pouco antes de enviar de novo.',
  131021: 'O destinatário é o próprio número da empresa.',
  131030: 'O número não está na lista de números permitidos (conta em modo de teste).',
  131042: 'Problema de pagamento na conta do WhatsApp Business (forma de pagamento na Meta).',
  131031: 'A conta do WhatsApp Business está bloqueada ou restrita.',
};

// Avisos de falha que chegam pelo webhook depois do envio (statuses com status "failed").
export function parseFailures(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      for (const st of change.value?.statuses || []) {
        if (st.status !== 'failed') continue;
        const err = (st.errors || [])[0] || {};
        const reason = FAILURE_REASONS[err.code] || [err.title, err.error_data?.details || err.message].filter(Boolean).join(': ') || 'A Meta não informou o motivo.';
        out.push({ recipient: String(st.recipient_id || ''), code: String(err.code || ''), reason });
      }
    }
  }
  return out;
}

export async function reply(creds, externalId, text) {
  // *negrito* e _itálico_ no formato do WhatsApp.
  for (const part of chunkLines(toWhatsApp(text).split('\n'), 3800)) await send(creds, externalId, part);
}

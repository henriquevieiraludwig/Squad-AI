// E-mails transacionais com a marca do parceiro. Envio pela API do Resend quando
// RESEND_API_KEY está definida; sem ela, o e-mail é registrado no log (desenvolvimento).
import { mergeBrand, partnerBaseUrl } from './brand.js';

export const outbox = []; // últimos e-mails "enviados" sem provedor (usado em testes e no desenvolvimento)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout(partner, { title, intro, cta, url, outro }) {
  const b = mergeBrand(partner.brand);
  const dark = b.colors.dark;
  const action = b.colors.action;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f3;font-family:Helvetica,Arial,sans-serif;color:#12251d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border:1px solid #dce6dc;border-radius:12px" cellpadding="0" cellspacing="0">
  <tr><td style="padding:22px 28px;background:${esc(dark)};border-radius:12px 12px 0 0;color:#ffffff;font-weight:700;font-size:18px">${esc(partner.name)}</td></tr>
  <tr><td style="padding:28px">
    <h1 style="margin:0 0 12px;font-size:22px;letter-spacing:-0.02em">${esc(title)}</h1>
    <p style="margin:0 0 20px;line-height:1.55;color:#4b5f55">${esc(intro)}</p>
    ${url ? `<p style="margin:0 0 20px"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;background:${esc(action)};color:${esc(dark)};font-weight:700;text-decoration:none;border-radius:8px">${esc(cta)}</a></p>
    <p style="margin:0 0 20px;font-size:13px;color:#75877d">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(url)}</p>` : ''}
    ${outro ? `<p style="margin:0;font-size:13px;color:#75877d">${esc(outro)}</p>` : ''}
  </td></tr></table>
  ${b.supportEmail ? `<p style="font-size:12px;color:#75877d">Dúvidas? ${esc(b.supportEmail)}</p>` : ''}
  </td></tr></table></body></html>`;
  const text = [title, '', intro, url ? `\n${cta}: ${url}` : '', outro ? `\n${outro}` : ''].join('\n');
  return { html, text };
}

export async function sendEmail(partner, { to, subject, ...content }) {
  const b = mergeBrand(partner.brand);
  const { html, text } = layout(partner, content);
  // Sem domínio verificado, o Resend aceita o remetente de teste onboarding@resend.dev
  // (entrega só para o e-mail dono da conta do Resend).
  const fromAddress = b.senderEmail || process.env.EMAIL_FROM || (process.env.RESEND_API_KEY ? 'onboarding@resend.dev' : 'nao-responda@squadai.local');
  const from = `${b.senderName || partner.name} <${fromAddress}>`;

  if (!process.env.RESEND_API_KEY) {
    outbox.push({ to, subject, text, html, from, at: new Date() });
    if (outbox.length > 50) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[e-mail sem provedor] para ${to}: ${subject}\n${text}\n`);
    return { simulated: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text, reply_to: b.supportEmail || undefined }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---------- Modelos ----------

export async function emailTemplates(partner) {
  const base = await partnerBaseUrl(partner);
  return {
    verify: (token) => ({
      subject: `Confirme seu e-mail no ${partner.name}`,
      title: 'Confirme seu e-mail',
      intro: 'Falta só confirmar que este e-mail é seu. Assim você recebe avisos de aprovação e pode recuperar a senha.',
      cta: 'Confirmar e-mail',
      url: `${base}/confirmar-email?token=${token}`,
      outro: 'Se você não criou uma conta, ignore esta mensagem.',
    }),
    reset: (token) => ({
      subject: `Redefinir sua senha no ${partner.name}`,
      title: 'Redefinir senha',
      intro: 'Recebemos um pedido para redefinir sua senha. O link vale por 1 hora.',
      cta: 'Criar nova senha',
      url: `${base}/redefinir-senha?token=${token}`,
      outro: 'Se você não pediu, ignore esta mensagem. Sua senha continua a mesma.',
    }),
    invite: (token, { orgName, inviterName, roleLabel, accessUrl }) => ({
      subject: orgName ? `${inviterName} convidou você para ${orgName} no ${partner.name}` : `Seu acesso ao painel do ${partner.name}`,
      title: orgName ? `Convite para ${orgName}` : `Acesso ao painel do ${partner.name}`,
      intro: orgName
        ? `${inviterName} convidou você para a equipe de ${orgName} como ${roleLabel}. O convite vale por 7 dias.`
        : `Você recebeu acesso como ${roleLabel}. O convite vale por 7 dias.`,
      cta: 'Aceitar convite',
      url: `${base}/convite?token=${token}`,
      outro: accessUrl ? `Depois de criar a sua senha, entre sempre pelo endereço da sua empresa: ${accessUrl}` : undefined,
    }),
    approval: ({ orgName, agentName, label, count }) => ({
      subject: `${count > 1 ? `${count} ações aguardam` : 'Uma ação aguarda'} sua aprovação em ${orgName}`,
      title: 'Ação aguardando aprovação',
      intro: `${agentName} preparou a ação "${label}" e espera alguém da equipe aprovar.${count > 1 ? ` Há ${count} pedidos pendentes no total.` : ''}`,
      cta: 'Revisar aprovações',
      url: `${base}/app/aprovacoes`,
    }),
    lead: ({ name, email, company, message, interest }) => ({
      subject: `Novo contato pelo site: ${name}${company ? ` (${company})` : ''} · ${interest}`,
      title: `Novo contato: ${name}`,
      intro: [`Interesse: ${interest}`, `E-mail: ${email}`, company ? `Empresa: ${company}` : '', message ? `Mensagem: ${message}` : ''].filter(Boolean).join('\n'),
      outro: 'Responda direto para o e-mail da pessoa.',
    }),
    scheduled: ({ title, agentName, result, ok, conversationId }) => ({
      subject: `${ok ? '✅' : '⚠️'} Tarefa agendada: ${title}`,
      title: ok ? `${agentName} concluiu "${title}"` : `${agentName} não conseguiu concluir "${title}"`,
      intro: String(result || '').slice(0, 1500),
      cta: 'Ver a conversa',
      url: `${base}/app/conversas/${conversationId}`,
      outro: 'Você recebe este e-mail porque marcou "Avisar por e-mail" nesta tarefa agendada.',
    }),
  };
}

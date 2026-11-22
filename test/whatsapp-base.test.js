// WhatsApp por provedor intermediário: as chamadas vão para o endereço informado, com o token dele.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { token, actions, apiBase } from '../server/connectors/whatsapp.js';

it('usa o endereço da API do provedor quando informado', async () => {
  const urls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    urls.push([String(url), opt.headers.Authorization]);
    const body = String(url).includes('/messages') ? { messages: [{ id: 'm1' }] } : { verified_name: 'Henrique', display_phone_number: '+55 51 0000-0000' };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const { creds, accountLabel } = await token.connect({ phoneNumberId: '1424000437470730', accessToken: 'sk_live_x', apiBase: 'https://api.provedor.com/v23.0/' });
    assert.equal(accountLabel, 'Henrique (+55 51 0000-0000)');
    assert.equal(creds.apiBase, 'https://api.provedor.com/v23.0');
    await actions.whatsapp_send_message({ creds }, { to: '5551999990000', text: 'oi' });
    assert.equal(urls[1][0], 'https://api.provedor.com/v23.0/1424000437470730/messages');
    assert.equal(urls[1][1], 'Bearer sk_live_x');
    // Sem endereço: Meta direto.
    const meta = await token.connect({ phoneNumberId: '1424000437470730', accessToken: 'EAAB' });
    assert.equal(meta.creds.apiBase, null);
    assert.match(urls[2][0], /^https:\/\/graph\.facebook\.com\//);
  } finally {
    globalThis.fetch = real;
  }
  assert.throws(() => apiBase('http://inseguro.com'), /https/);
});

import { createHmac } from 'node:crypto';
import { verifySignature } from '../server/connectors/whatsapp.js';

it('confere a assinatura da Datafy (timestamp.corpo) e da Meta', () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = (secret, data) => 'sha256=' + createHmac('sha256', secret).update(data).digest('hex');
  const datafy = { appSecret: 'whsec_abc' };
  const h = (map) => (name) => map[name.toLowerCase()];
  assert.ok(verifySignature(datafy, raw, h({ 'x-datafy-timestamp': ts, 'x-datafy-signature-256': sig('whsec_abc', `${ts}.${raw}`) })));
  assert.ok(!verifySignature(datafy, raw, h({ 'x-datafy-timestamp': ts, 'x-datafy-signature-256': sig('whsec_outro', `${ts}.${raw}`) })));
  const old = String(Number(ts) - 600);
  assert.ok(!verifySignature(datafy, raw, h({ 'x-datafy-timestamp': old, 'x-datafy-signature-256': sig('whsec_abc', `${old}.${raw}`) })));
  const meta = { appSecret: 'segredo' };
  assert.ok(verifySignature(meta, raw, h({ 'x-hub-signature-256': sig('segredo', raw) })));
  assert.ok(!verifySignature(meta, raw, h({ 'x-hub-signature-256': sig('errado', raw) })));
  assert.ok(verifySignature({}, raw, h({})));
});

import { parseFailures } from '../server/connectors/whatsapp.js';

it('entende os avisos de falha de entrega do webhook', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { statuses: [
      { id: 'wamid.1', status: 'sent', recipient_id: '5551999990000' },
      { id: 'wamid.2', status: 'failed', recipient_id: '5551999990000', errors: [{ code: 131047, title: 'Re-engagement message' }] },
      { id: 'wamid.3', status: 'failed', recipient_id: '5551888880000', errors: [{ code: 999, title: 'Outro', error_data: { details: 'detalhe' } }] },
    ] } }] }],
  };
  const f = parseFailures(payload);
  assert.equal(f.length, 2);
  assert.match(f[0].reason, /24 horas/);
  assert.equal(f[1].reason, 'Outro: detalhe');
});

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

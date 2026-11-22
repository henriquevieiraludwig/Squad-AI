// Janela de 24 horas: a última mensagem da pessoa decide entre texto e modelo de abertura.
import { it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startPlatform } from './helpers.js';
import { db } from '../server/db.js';
import { lastInbound } from '../server/connectors/whatsapp.js';

let P;
before(async () => {
  P = await startPlatform();
});
after(async () => {
  await P.stop();
});

it('acha a última mensagem do contato, com ou sem o 9', async () => {
  const c = P.client();
  await c.post('/api/auth/signup', { name: 'Bia', company: 'Loja Mar', email: 'bia@mar.com', password: 'senhaforte1' });
  const agentId = (await c.post('/api/agents', { name: 'Paulo', area: 'Atendimento' })).body.agent.id;
  const { org_id: orgId } = await db.get('SELECT org_id FROM agents WHERE id = $1', [agentId]);
  const conv = await db.get("INSERT INTO conversations (org_id, agent_id, channel, external_id) VALUES ($1, $2, 'whatsapp', '551187654321') RETURNING id", [orgId, agentId]);
  assert.equal(await lastInbound(orgId, '5511987654321'), null);
  await db.run("INSERT INTO messages (conversation_id, role, author, content) VALUES ($1, 'user', 'contato', '\"oi\"')", [conv.id]);
  const r = await lastInbound(orgId, '5511987654321');
  assert.equal(r.external_id, '551187654321');
  assert.ok(Date.now() - new Date(r.at).getTime() < 60_000);
  assert.equal(await lastInbound(orgId + 999, '5511987654321'), null);
});

it('relatório de consumo: custo pelo preço do modelo, por agente e canal, só da própria empresa', async () => {
  const c = P.client();
  await c.post('/api/auth/signup', { name: 'Caio', company: 'Loja Rio', email: 'caio@rio.com', password: 'senhaforte1' });
  const agentId = (await c.post('/api/agents', { name: 'Lia', area: 'Atendimento' })).body.agent.id;
  const { org_id: orgId } = await db.get('SELECT org_id FROM agents WHERE id = $1', [agentId]);
  // 1M de entrada (US$ 4) + 100 mil de saída (US$ 2) + 1M de cache lido (US$ 0,20) no Opus 5.5
  await db.run(
    "INSERT INTO usage_events (org_id, agent_id, channel, model, input_tokens, output_tokens, cache_read_tokens) VALUES ($1, $2, 'whatsapp', 'claude-opus-5-5', 1000000, 100000, 1000000)",
    [orgId, agentId],
  );
  const r = await c.get('/api/usage/report?days=7');
  assert.equal(r.status, 200);
  assert.equal(r.body.total.turns, 1);
  assert.ok(Math.abs(r.body.total.cost - 6.2) < 1e-9);
  assert.equal(r.body.series.length, 7);
  assert.ok(Math.abs(r.body.series.at(-1).cost - 6.2) < 1e-9);
  assert.equal(r.body.byAgent[0].name, 'Lia');
  assert.equal(r.body.byChannel[0].channel, 'whatsapp');
  // Outra empresa não vê esse consumo.
  const other = P.client();
  await other.post('/api/auth/signup', { name: 'Duda', company: 'Loja Sol2', email: 'duda@sol2.com', password: 'senhaforte1' });
  assert.equal((await other.get('/api/usage/report')).body.total.turns, 0);
});

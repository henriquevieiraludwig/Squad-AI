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

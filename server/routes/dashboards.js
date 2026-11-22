// Dashboards: lista, visualização, link público de compartilhamento e exclusão.
import { db } from '../db.js';
import { requireOrg } from '../auth.js';
import { h } from './org.js';
import { newShareToken } from '../agent/dashboards.js';

const view = (r) => ({
  id: r.id,
  title: r.title,
  agentId: r.agent_id,
  agentName: r.agent_name || null,
  agentAvatar: r.agent_avatar || null,
  conversationId: r.conversation_id,
  shared: Boolean(r.share_token),
  shareToken: r.share_token || null,
  createdAt: r.created_at,
});

const SELECT = `SELECT d.*, a.name AS agent_name, a.avatar AS agent_avatar FROM dashboards d LEFT JOIN agents a ON a.id = d.agent_id`;

export function registerDashboardRoutes(app) {
  app.get('/api/dashboards', requireOrg(), h(async (req, res) => {
    const rows = await db.all(`${SELECT} WHERE d.org_id = $1 ORDER BY d.created_at DESC LIMIT 200`, [req.user.orgId]);
    res.json({ dashboards: rows.map((r) => ({ ...view(r), kpis: (r.spec?.kpis || []).slice(0, 3), charts: (r.spec?.charts || []).length })) });
  }));

  app.get('/api/dashboards/:id', requireOrg(), h(async (req, res) => {
    const r = await db.get(`${SELECT} WHERE d.id = $1 AND d.org_id = $2`, [Number(req.params.id), req.user.orgId]);
    if (!r) return res.status(404).json({ error: 'Dashboard não encontrado.' });
    res.json({ dashboard: { ...view(r), spec: r.spec } });
  }));

  // Liga ou desliga o link público (quem tiver o link vê o painel, sem entrar na plataforma).
  app.post('/api/dashboards/:id/share', requireOrg('configurar'), h(async (req, res) => {
    const r = await db.get('SELECT id, share_token FROM dashboards WHERE id = $1 AND org_id = $2', [Number(req.params.id), req.user.orgId]);
    if (!r) return res.status(404).json({ error: 'Dashboard não encontrado.' });
    const token = req.body?.enabled === false ? null : r.share_token || newShareToken();
    await db.run('UPDATE dashboards SET share_token = $2, updated_at = now() WHERE id = $1', [r.id, token]);
    res.json({ shareToken: token });
  }));

  app.delete('/api/dashboards/:id', requireOrg('configurar'), h(async (req, res) => {
    const r = await db.get('DELETE FROM dashboards WHERE id = $1 AND org_id = $2 RETURNING id', [Number(req.params.id), req.user.orgId]);
    if (!r) return res.status(404).json({ error: 'Dashboard não encontrado.' });
    res.json({ ok: true });
  }));

  // Visualização pública pelo link compartilhado.
  app.get('/api/public/dashboards/:token', h(async (req, res) => {
    const token = String(req.params.token || '');
    if (token.length < 16) return res.status(404).json({ error: 'Link inválido.' });
    const r = await db.get(
      `SELECT d.title, d.spec, d.created_at, o.name AS org_name FROM dashboards d JOIN organizations o ON o.id = d.org_id WHERE d.share_token = $1`,
      [token],
    );
    if (!r) return res.status(404).json({ error: 'Este link não está mais disponível.' });
    res.json({ dashboard: { title: r.title, spec: r.spec, createdAt: r.created_at, orgName: r.org_name } });
  }));
}

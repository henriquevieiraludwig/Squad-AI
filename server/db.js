import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.DB_PATH || join(root, 'data', 'squad-ai.db');
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    area TEXT NOT NULL,
    role_description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'em_treinamento',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Conexões da empresa com plataformas externas. Credenciais sempre criptografadas.
  CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_label TEXT NOT NULL DEFAULT '',
    credentials_enc TEXT NOT NULL,
    webhook_key TEXT UNIQUE,
    webhook_secret TEXT,
    connected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (org_id, provider)
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    org_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Quais ações cada agente pode usar e como: 'auto' ou 'approval'.
  CREATE TABLE IF NOT EXISTS agent_tools (
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('auto', 'approval')),
    PRIMARY KEY (agent_id, action_id)
  );

  -- Qual agente responde em cada canal de entrada (WhatsApp, Telegram...).
  CREATE TABLE IF NOT EXISTS channel_routes (
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    PRIMARY KEY (org_id, provider)
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    external_id TEXT,
    contact_label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_conv_external ON conversations (org_id, channel, external_id);

  -- Histórico no formato da API (conteúdo guardado exatamente como veio).
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Registro de toda ação pedida por um agente: executada, pendente, recusada ou com erro.
  CREATE TABLE IF NOT EXISTS action_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    action_id TEXT NOT NULL,
    input_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pendente', 'executada', 'recusada', 'erro')),
    result_json TEXT,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    decided_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    notified INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_runs_org ON action_runs (org_id, status);
`);

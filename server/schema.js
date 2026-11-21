// Migrações do banco, aplicadas em ordem. Nunca altere uma migração já publicada: crie outra.
export const MIGRATIONS = [
  `
  -- Parceiros (white label). O parceiro padrão é a própria plataforma.
  CREATE TABLE partners (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand JSONB NOT NULL DEFAULT '{}',
    settings JSONB NOT NULL DEFAULT '{}',
    oauth_enc TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'suspenso')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE partner_domains (
    domain TEXT PRIMARY KEY,
    partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- Empresas clientes, sempre dentro de um parceiro.
  CREATE TABLE organizations (
    id SERIAL PRIMARY KEY,
    partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    limits JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'suspensa')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_orgs_partner ON organizations (partner_id);

  -- Usuários: membros de uma empresa (org_id) ou equipe do parceiro (org_id nulo, is_partner_admin).
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'approver', 'member')),
    is_partner_admin BOOLEAN NOT NULL DEFAULT false,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (partner_id, email)
  );
  CREATE INDEX idx_users_org ON users (org_id);

  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
  );

  -- Tokens de uso único: convite, redefinição de senha, verificação de e-mail.
  CREATE TABLE tokens (
    id SERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('convite', 'senha', 'verificacao')),
    partner_id INT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    org_id INT REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    email TEXT,
    role TEXT,
    data JSONB NOT NULL DEFAULT '{}',
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE agents (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    area TEXT NOT NULL,
    role_description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'em_treinamento',
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_agents_org ON agents (org_id);

  -- Contexto da empresa: documentos e textos que todos os agentes consultam.
  CREATE TABLE knowledge_docs (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'texto' CHECK (source IN ('texto', 'arquivo')),
    file_name TEXT,
    content TEXT NOT NULL,
    chars INT NOT NULL,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_docs_org ON knowledge_docs (org_id);

  -- Processos passo a passo. agent_id nulo vale para todos os agentes da empresa.
  CREATE TABLE processes (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT '',
    steps JSONB NOT NULL DEFAULT '[]',
    rules TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_processes_org ON processes (org_id);

  CREATE TABLE integrations (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    account_label TEXT NOT NULL DEFAULT '',
    credentials_enc TEXT NOT NULL,
    webhook_key TEXT UNIQUE,
    webhook_secret TEXT,
    connected_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, provider)
  );

  CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    return_origin TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE agent_tools (
    agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('auto', 'approval')),
    PRIMARY KEY (agent_id, action_id)
  );

  CREATE TABLE channel_routes (
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    PRIMARY KEY (org_id, provider)
  );

  CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    external_id TEXT,
    contact_label TEXT NOT NULL DEFAULT '',
    handled_by TEXT NOT NULL DEFAULT 'agente' CHECK (handled_by IN ('agente', 'humano')),
    assigned_user INT REFERENCES users(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_conv_external ON conversations (org_id, channel, external_id);
  CREATE INDEX idx_conv_recent ON conversations (org_id, last_message_at DESC);

  -- Histórico no formato da API do Claude. author diz quem escreveu, para a caixa de conversas.
  CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT 'agente' CHECK (author IN ('contato', 'agente', 'humano', 'sistema', 'ferramenta')),
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_messages_conv ON messages (conversation_id, id);

  CREATE TABLE action_runs (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
    conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
    action_id TEXT NOT NULL,
    input JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pendente', 'executada', 'recusada', 'erro')),
    result JSONB,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_by INT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    notified BOOLEAN NOT NULL DEFAULT true
  );
  CREATE INDEX idx_runs_org ON action_runs (org_id, status);

  -- Uma linha por turno do agente, com os tokens consumidos.
  CREATE TABLE usage_events (
    id SERIAL PRIMARY KEY,
    org_id INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INT REFERENCES agents(id) ON DELETE SET NULL,
    conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
    channel TEXT NOT NULL DEFAULT 'teste',
    model TEXT NOT NULL DEFAULT '',
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cache_read_tokens INT NOT NULL DEFAULT 0,
    cache_write_tokens INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_usage_org ON usage_events (org_id, created_at);

  -- Fila de tarefas com novas tentativas (webhooks, e-mails, avisos).
  CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    kind TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'executando', 'concluida', 'falhou')),
    attempts INT NOT NULL DEFAULT 0,
    run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_jobs_due ON jobs (status, run_at);
  `,
  `
  -- Supabase (e outros) expõem o schema public por uma API. Com RLS ligado e sem políticas,
  -- nada fica acessível por esse caminho; o servidor, dono das tabelas, continua lendo normalmente.
  ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
  ALTER TABLE partner_domains ENABLE ROW LEVEL SECURITY;
  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tokens ENABLE ROW LEVEL SECURITY;
  ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE processes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
  ALTER TABLE agent_tools ENABLE ROW LEVEL SECURITY;
  ALTER TABLE channel_routes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE action_runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
  `,
  `
  -- Avatar escolhido para o agente (avatar-1 a avatar-8).
  ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar TEXT;
  `,
  `
  -- Memória dos agentes: fatos gerais (valem para todas as conversas) e fatos sobre um contato
  -- (só aparecem nas conversas com aquela pessoa). Gravados pelo próprio agente ou pela equipe.
  CREATE TABLE IF NOT EXISTS agent_memories (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    contact_key TEXT,
    contact_label TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'agente',
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories (agent_id, contact_key);
  ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
  `,
  `
  -- Contexto da conversa (memória, canal e data) gravado como aviso de sistema.
  ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_author_check;
  ALTER TABLE messages ADD CONSTRAINT messages_author_check CHECK (author IN ('contato', 'agente', 'humano', 'sistema', 'ferramenta', 'contexto'));
  `,
];

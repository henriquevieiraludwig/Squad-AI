# Squad AI

Agentes de IA para empresas que querem automatizar processos repetitivos. Uma solução **matriz.ai**, pronta para ser vendida em **white label**.

As empresas ensinam o contexto e os processos, conectam o Microsoft 365, o Google Workspace e os canais de conversa (WhatsApp, Telegram, Teams, Google Chat, Slack) e escolhem, ação por ação, o que cada agente faz sozinho e o que precisa de aprovação humana.

## Como o white label funciona

```
Plataforma (Matriz AI)
 └── Parceiros (revendedores): marca, cores, logotipo, domínios, apps OAuth próprios
      └── Clientes (empresas): equipe, agentes, contexto, processos, integrações, conversas
```

- **Plataforma:** a equipe da Matriz cria parceiros e acompanha o uso de IA de cada um (base para cobrar).
- **Parceiro:** acessa `/parceiro` no próprio domínio, configura a marca, cria clientes, define limites (mensagens/mês, agentes, pessoas, espaço de contexto) e suspende ou exclui clientes.
- **Cliente:** acessa `/app` no domínio do parceiro e vê só a marca do parceiro. O rodapé "tecnologia Squad AI" é opcional.

O parceiro é escolhido pelo domínio da requisição. Cada parceiro pode ter vários domínios e, com `PARTNER_SUBDOMAIN_BASE`, ganha `slug.seudominio` automaticamente.

## Rodar localmente

```bash
npm install
cp .env.example .env
npm run dev
```

- Site: http://localhost:5173 (o Vite repassa `/api` para a API em http://localhost:3001)
- Sem `DATABASE_URL`, o banco é um PostgreSQL embutido (PGlite) em `data/pglite`. Nada para instalar.
- Sem `RESEND_API_KEY`, os e-mails (convites, senha) aparecem no terminal.
- Para ver a marca de um parceiro sem configurar domínio: `http://localhost:5173/?parceiro=slug`.

Primeiro administrador da plataforma:

```bash
npm run create-admin -- voce@empresa.com
```

O comando mostra o link para definir nome e senha.

## Testes

```bash
npm test
```

Rodam os fluxos completos da API com PGlite em memória, um Claude falso e um Telegram falso: cadastro, senha, convites e papéis, isolamento entre empresas e entre parceiros, contexto e processos no prompt, aprovações, atendimento humano, limites do plano, white label e LGPD. Para rodar contra um Postgres real, defina `DATABASE_URL`. O GitHub Actions roda os dois (`.github/workflows/ci.yml`).

## Banco de dados (Supabase)

Em produção o banco é o PostgreSQL da Supabase. Veja `docs/supabase.md`. Em resumo:

1. No projeto da Supabase: **Connect > Session pooler** e copie a string (porta 5432). Troque `[YOUR-PASSWORD]` pela senha do banco.
2. Teste no seu computador: `DATABASE_URL="a-string" npm run db:check`. O comando conecta, cria as tabelas e confere a proteção.
3. Cadastre a mesma string como `DATABASE_URL` no Render.

As tabelas ficam com RLS ligado e sem políticas: nada é acessível pela API pública da Supabase, só pelo servidor.

## Produção (Render)

O arquivo `render.yaml` cria o servidor: no Render, **New > Blueprint** e escolha este repositório. Preencha as variáveis marcadas como `sync: false` (inclusive `DATABASE_URL`, da Supabase). O plano configurado é o gratuito (o site dorme após 15 minutos sem visitas); troque para Starter quando começar a vender. Para o primeiro acesso, defina `BOOTSTRAP_ADMIN_EMAIL` com o seu e-mail: ao ligar, o servidor mostra em **Logs** o link para criar o administrador. Com terminal disponível, também dá para usar `npm run create-admin -- seu@email`.

Variáveis principais (todas em `.env.example`): `DATABASE_URL`, `ENCRYPTION_KEY` (nunca troque depois de criada), `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` e `EMAIL_FROM`, as credenciais dos apps Microsoft, Google e Slack e, opcionalmente, `SENTRY_DSN`.

## Estrutura

```
server/
  index.js            app Express, segurança, arquivos do site
  db.js, schema.js    PostgreSQL (pg ou PGlite) e migrações
  brand.js            parceiros, marca por domínio, apps OAuth do parceiro
  auth.js             senhas, sessões, papéis e permissões
  email.js            e-mails com a marca do parceiro (Resend)
  jobs.js             fila de tarefas com novas tentativas
  usage.js            medição de uso e limites
  knowledge.js        extração de texto (PDF, DOCX, TXT, MD, CSV) e contexto do agente
  agent/runtime.js    agente: Claude com ferramentas, aprovações e registro
  connectors/         Microsoft 365, Google, Slack, Telegram, WhatsApp
  routes/             auth, empresa, integrações e webhooks, parceiro e plataforma
shared/catalog.js     plataformas e ações (servidor e site)
src/                  site em React
test/                 testes de ponta a ponta
```

## Permissões

| Papel | O que pode |
| --- | --- |
| Proprietário | Tudo, inclusive transferir a propriedade e exportar os dados |
| Administrador | Configura agentes, integrações, contexto, processos e equipe; aprova ações |
| Aprovador | Aprova ou recusa ações e atende conversas |
| Membro | Conversa com os agentes e acompanha |

## Permissões dos apps Microsoft e Google

**Microsoft Entra ID** (app multilocatário, permissões delegadas do Microsoft Graph):
`offline_access`, `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Send`, `Chat.Create`, `ChatMessage.Send`, `Files.Read.All`, `Files.ReadWrite`, `Sites.Read.All`.
O administrador de TI de cada cliente precisa aprovar `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `Files.Read.All` e `Sites.Read.All`.

**Google Cloud** (tela de consentimento OAuth):
- Escopos usados por padrão: `openid`, `email`, `gmail.send`, `calendar.events`, `chat.spaces.readonly`, `chat.messages.create`, `drive.file`, `spreadsheets`, `documents`, `presentations`, `forms.body`, `forms.responses.readonly`.
- APIs a ativar no projeto do Google Cloud: Gmail, Google Calendar, Google Drive, Google Chat, Google Sheets, Google Docs, Google Slides e Google Forms.
- Escopos restritos, só depois da avaliação de segurança anual: `gmail.readonly`, `drive.readonly`. Eles liberam buscar e responder e-mails e buscar arquivos.

| Serviço | Ações do agente |
| --- | --- |
| Outlook | Enviar, buscar e responder e-mails; criar e listar eventos |
| Teams | Listar canais, publicar em canal, mensagem direta (1:1) |
| OneDrive e SharePoint | Buscar arquivos (OneDrive e todos os sites), salvar arquivo de texto |
| Gmail e Agenda | Enviar, buscar e responder e-mails; criar e listar eventos com link do Meet |
| Drive | Criar documento; buscar arquivos (escopo restrito) |
| Google Chat | Listar espaços e enviar mensagem |
| Planilhas | Criar, ler, adicionar linhas e atualizar células |
| Documentos | Criar, ler e acrescentar texto |
| Apresentações | Criar (um slide por bloco) e ler |
| Formulários | Criar (perguntas abertas, múltipla escolha, obrigatórias) e ver respostas |

## Segurança e LGPD

- Senhas com `scrypt`; sessão em cookie `httpOnly` ligada ao parceiro do domínio.
- Credenciais das integrações e dos apps OAuth dos parceiros criptografadas com AES-256-GCM.
- Dados isolados por empresa e por parceiro em todas as consultas (coberto pelos testes).
- Tokens de uso único para convite, senha (1 hora) e confirmação de e-mail.
- Webhooks com chave aleatória na URL, segredo do Telegram e assinatura da Meta.
- Exportação completa dos dados pelo proprietário e exclusão definitiva do cliente pelo parceiro.
- Escopos restritos do Google desligados por padrão (exigem avaliação de segurança anual).

## O que ainda não existe

- Integração com gateway de pagamento (a plataforma já mede o uso por parceiro e por cliente).
- Receber mensagens pelo Teams, Google Chat e Slack (hoje os agentes só enviam nesses canais).
- Conexão do WhatsApp com um clique (Embedded Signup da Meta).
- Login corporativo (SSO).

Veja `docs/o-que-voce-precisa-fazer.md` para os passos que dependem de contas, contratos e cadastros.

# Squad AI

Agentes de IA para empresas que querem automatizar processos repetitivos. Uma solução **matriz.ai**.

As empresas criam agentes, conectam o Microsoft 365, o Google Workspace e os canais de conversa (Teams, Google Chat, WhatsApp, Telegram, Slack) e escolhem, ação por ação, o que cada agente faz sozinho e o que precisa de aprovação humana.

## Rodar localmente

```bash
npm install
cp .env.example .env   # preencha o que for usar
npm run dev
```

- Site: http://localhost:5173 (o Vite repassa `/api` para a API)
- API: http://localhost:3001

Sem `ANTHROPIC_API_KEY`, tudo funciona menos a conversa com os agentes, que mostra uma mensagem pedindo a chave.

## Produção

```bash
npm run build
NODE_ENV=production npm start
```

Em produção, `ENCRYPTION_KEY` é obrigatória e `PUBLIC_URL` precisa ser HTTPS (exigência dos webhooks do Telegram e da Meta e dos retornos de OAuth).

## Demonstração sem servidor

`npm run build:demo` gera `dist-demo/squad-ai-demo.html`, um arquivo único que roda no navegador com dados locais e respostas simuladas.

## Integrações

| Plataforma | Conexão | O que os agentes podem fazer |
| --- | --- | --- |
| Microsoft 365 | OAuth (Microsoft Entra) | Enviar e buscar e-mails no Outlook, criar e consultar eventos, listar canais e publicar no Teams, buscar arquivos no OneDrive |
| Google Workspace | OAuth (Google Cloud) | Enviar e buscar e-mails no Gmail, criar e consultar eventos na Agenda, buscar no Drive, listar espaços e enviar no Google Chat |
| Slack | OAuth (app do Slack) | Listar canais e enviar mensagens |
| WhatsApp Business | Token da Cloud API | Responder clientes (canal de entrada) e enviar mensagens |
| Telegram | Token do @BotFather | Responder conversas (canal de entrada) e enviar mensagens |

O catálogo fica em `shared/catalog.js`; a execução, em `server/connectors/`. Para adicionar uma ação: descreva-a no catálogo e implemente a função com o mesmo `id` no conector.

### Cadastrar os apps da plataforma (uma vez, pelo operador do Squad AI)

Use como endereço de retorno `PUBLIC_URL/api/oauth/callback/<provedor>`.

- **Microsoft Entra ID**: registre um app multilocatário, adicione o retorno `.../api/oauth/callback/microsoft`, crie um segredo e libere as permissões delegadas `User.Read Mail.Read Mail.Send Calendars.ReadWrite Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Send Files.Read.All offline_access`.
- **Google Cloud**: crie um cliente OAuth do tipo Web com o retorno `.../api/oauth/callback/google`, ative as APIs Gmail, Calendar, Drive e Chat e configure a tela de consentimento. Escopos sensíveis exigem verificação do Google antes do uso público.
- **Slack**: crie um app com os escopos de bot `chat:write channels:read groups:read` e o retorno `.../api/oauth/callback/slack`.

WhatsApp e Telegram não precisam de cadastro pela plataforma: cada empresa informa o próprio token na tela de Integrações.

## Como os agentes executam ações

`server/agent/runtime.js` roda um loop de uso de ferramentas com o Claude (`claude-opus-5-5`, esforço `medium`, fallback automático em caso de recusa):

1. Só entram como ferramentas as ações liberadas no agente **e** cuja plataforma está conectada.
2. Ação em modo **Automática** executa na hora. Ação em modo **Pede aprovação** vira um pedido em *Aprovações* e o agente avisa que está aguardando.
3. Quando alguém aprova ou recusa, a ação é executada (ou não), o contato é avisado no WhatsApp/Telegram e o agente recebe a decisão no próximo turno.
4. Toda ação fica registrada com entrada, resultado, agente e quem decidiu.

Mensagens que chegam pelo WhatsApp e pelo Telegram vão para o agente escolhido para o canal, e a resposta volta pelo mesmo canal.

## Segurança

- Senhas com `scrypt`; sessão em cookie `httpOnly` com token guardado como hash.
- Credenciais das integrações criptografadas com AES-256-GCM.
- `state` de uso único nos fluxos OAuth; webhooks com chave aleatória na URL, token secreto do Telegram e assinatura `X-Hub-Signature-256` da Meta (quando a chave secreta do app é informada).
- Dados isolados por empresa em todas as consultas.

## Próximas etapas

- Canais de entrada para Teams (Bot Framework), Google Chat e Slack (Events API).
- Telas de Processos e Contexto da empresa alimentando o prompt dos agentes.
- Convites de equipe e papéis (quem configura, quem aprova).

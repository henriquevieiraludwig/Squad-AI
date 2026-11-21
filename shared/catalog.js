// Catálogo de integrações: fonte única usada pelo servidor (execução) e pelo site (telas).
// "description" de cada ação é o texto que o modelo lê para decidir quando usá-la.

export const PROVIDERS = [
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    group: 'produtividade',
    auth: 'oauth',
    monogram: 'M',
    summary: 'Outlook, Calendário, Teams, OneDrive e SharePoint da conta Microsoft da empresa.',
    services: ['Outlook', 'Calendário', 'Teams', 'OneDrive e SharePoint'],
  },
  {
    id: 'google',
    name: 'Google Workspace',
    group: 'produtividade',
    auth: 'oauth',
    monogram: 'G',
    summary: 'Gmail, Agenda, Drive e Google Chat da conta Google da empresa.',
    services: ['Gmail', 'Agenda', 'Drive', 'Google Chat'],
    note: 'Buscar e-mails e arquivos exige escopos restritos do Google, que pedem uma auditoria de segurança anual. Ficam desligados até essa verificação.',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    group: 'comunicacao',
    auth: 'token',
    monogram: 'W',
    channel: true,
    summary: 'Clientes conversam com o agente pelo número de WhatsApp da empresa (API oficial da Meta).',
    fields: [
      { key: 'phoneNumberId', label: 'ID do número de telefone', hint: 'No painel da Meta: WhatsApp > Configuração da API.' },
      { key: 'accessToken', label: 'Token de acesso permanente', secret: true, hint: 'Gere um token de usuário do sistema com a permissão whatsapp_business_messaging.' },
      { key: 'appSecret', label: 'Chave secreta do app', secret: true, optional: true, hint: 'Opcional. Usada para confirmar que as mensagens recebidas vieram da Meta.' },
    ],
    steps: [
      'Crie um app do tipo Empresa em developers.facebook.com e adicione o produto WhatsApp.',
      'Copie o ID do número de telefone e gere um token permanente.',
      'Cole os dados aqui. Depois, cadastre o endereço de webhook e o token de verificação que vão aparecer nesta tela.',
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    group: 'comunicacao',
    auth: 'token',
    monogram: 'T',
    channel: true,
    summary: 'Um bot do Telegram responde com o agente em conversas privadas e grupos.',
    fields: [{ key: 'botToken', label: 'Token do bot', secret: true, hint: 'Formato 123456789:ABC-DEF...' }],
    steps: [
      'No Telegram, abra uma conversa com @BotFather e envie /newbot.',
      'Escolha o nome e o usuário do bot. O BotFather responde com o token.',
      'Cole o token aqui. O Squad AI configura o recebimento de mensagens automaticamente.',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    group: 'comunicacao',
    auth: 'oauth',
    monogram: 'S',
    summary: 'O agente envia mensagens em canais do workspace do Slack da empresa.',
    services: ['Canais', 'Mensagens'],
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    group: 'comunicacao',
    via: 'microsoft',
    monogram: 'T',
    summary: 'Usa a conexão do Microsoft 365. O agente publica mensagens em canais das equipes.',
  },
  {
    id: 'gchat',
    name: 'Google Chat',
    group: 'comunicacao',
    via: 'google',
    monogram: 'C',
    summary: 'Usa a conexão do Google Workspace. O agente envia mensagens em espaços do Chat.',
  },
];

const str = (description) => ({ type: 'string', description });
const obj = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });

export const ACTIONS = [
  // ---------- Microsoft 365 ----------
  {
    id: 'outlook_send_email',
    provider: 'microsoft',
    service: 'Outlook',
    label: 'Enviar e-mail',
    risk: 'write',
    description: 'Envia um e-mail pela caixa do Outlook da empresa. Use só quando o pedido for claro sobre destinatário e conteúdo.',
    input_schema: obj(
      { to: str('E-mail do destinatário. Para vários, separe por vírgula.'), subject: str('Assunto'), body: str('Corpo do e-mail em texto simples') },
      ['to', 'subject', 'body'],
    ),
  },
  {
    id: 'outlook_search_email',
    provider: 'microsoft',
    service: 'Outlook',
    label: 'Buscar e-mails',
    risk: 'read',
    description: 'Busca e-mails na caixa do Outlook por palavras-chave, remetente ou assunto. Retorna até 10 resultados, cada um com o id usado para responder.',
    input_schema: obj({ query: str('Termos de busca') }, ['query']),
  },
  {
    id: 'outlook_create_event',
    provider: 'microsoft',
    service: 'Calendário',
    label: 'Criar evento no calendário',
    risk: 'write',
    description: 'Cria um evento no calendário do Outlook e convida os participantes. Datas no formato ISO 8601 sem fuso (ex.: 2026-11-25T14:00:00); o fuso é America/Sao_Paulo salvo indicação.',
    input_schema: obj(
      {
        subject: str('Título do evento'),
        start: str('Início, ISO 8601'),
        end: str('Fim, ISO 8601'),
        attendees: str('E-mails dos participantes, separados por vírgula. Vazio se não houver.'),
        description: str('Descrição ou pauta. Vazio se não houver.'),
      },
      ['subject', 'start', 'end', 'attendees', 'description'],
    ),
  },
  {
    id: 'outlook_list_events',
    provider: 'microsoft',
    service: 'Calendário',
    label: 'Consultar calendário',
    risk: 'read',
    description: 'Lista os eventos do calendário do Outlook entre duas datas (ISO 8601).',
    input_schema: obj({ start: str('Início do intervalo, ISO 8601'), end: str('Fim do intervalo, ISO 8601') }, ['start', 'end']),
  },
  {
    id: 'teams_list_channels',
    provider: 'microsoft',
    service: 'Teams',
    label: 'Listar equipes e canais do Teams',
    risk: 'read',
    description: 'Lista as equipes do Teams e seus canais, com os IDs necessários para publicar mensagens.',
    input_schema: obj({}, []),
  },
  {
    id: 'teams_send_message',
    provider: 'microsoft',
    service: 'Teams',
    label: 'Publicar mensagem no Teams',
    risk: 'write',
    description: 'Publica uma mensagem em um canal do Microsoft Teams. Obtenha teamId e channelId com teams_list_channels.',
    input_schema: obj({ teamId: str('ID da equipe'), channelId: str('ID do canal'), text: str('Texto da mensagem') }, ['teamId', 'channelId', 'text']),
  },
  {
    id: 'onedrive_search_files',
    provider: 'microsoft',
    service: 'OneDrive e SharePoint',
    label: 'Buscar arquivos no OneDrive',
    risk: 'read',
    description: 'Busca arquivos no OneDrive pelo nome ou conteúdo. Retorna nome, link e data de alteração.',
    input_schema: obj({ query: str('Termos de busca') }, ['query']),
  },

  {
    id: 'outlook_reply_email',
    provider: 'microsoft',
    service: 'Outlook',
    label: 'Responder e-mail',
    risk: 'write',
    description: 'Responde a um e-mail do Outlook mantendo a conversa. Obtenha o messageId com outlook_search_email.',
    input_schema: obj({ messageId: str('ID do e-mail (de outlook_search_email)'), body: str('Texto da resposta') }, ['messageId', 'body']),
  },
  {
    id: 'teams_send_chat_message',
    provider: 'microsoft',
    service: 'Teams',
    label: 'Mensagem direta no Teams',
    risk: 'write',
    description: 'Envia uma mensagem direta (chat 1:1) no Microsoft Teams para uma pessoa da organização, pelo e-mail dela.',
    input_schema: obj({ to: str('E-mail da pessoa na organização'), text: str('Texto da mensagem') }, ['to', 'text']),
  },
  {
    id: 'sharepoint_search_files',
    provider: 'microsoft',
    service: 'OneDrive e SharePoint',
    label: 'Buscar arquivos no SharePoint',
    risk: 'read',
    description: 'Busca documentos em todos os sites do SharePoint e no OneDrive a que a conta tem acesso, pelo nome ou conteúdo. Retorna nome, link e um trecho.',
    input_schema: obj({ query: str('Termos de busca') }, ['query']),
  },
  {
    id: 'onedrive_upload_file',
    provider: 'microsoft',
    service: 'OneDrive e SharePoint',
    label: 'Salvar arquivo no OneDrive',
    risk: 'write',
    description: 'Cria ou substitui um arquivo de texto na pasta "Squad AI" do OneDrive (até 4 MB). Use para salvar relatórios, atas e resumos.',
    input_schema: obj({ fileName: str('Nome do arquivo com extensão, ex.: ata-reuniao.txt ou relatorio.md'), content: str('Conteúdo do arquivo em texto') }, ['fileName', 'content']),
  },

  // ---------- Google Workspace ----------
  {
    id: 'gmail_send_email',
    provider: 'google',
    service: 'Gmail',
    label: 'Enviar e-mail',
    risk: 'write',
    description: 'Envia um e-mail pelo Gmail da empresa. Use só quando o pedido for claro sobre destinatário e conteúdo.',
    input_schema: obj(
      { to: str('E-mail do destinatário. Para vários, separe por vírgula.'), subject: str('Assunto'), body: str('Corpo do e-mail em texto simples') },
      ['to', 'subject', 'body'],
    ),
  },
  {
    id: 'gmail_search',
    provider: 'google',
    service: 'Gmail',
    label: 'Buscar e-mails',
    risk: 'read',
    requires: 'google_restricted',
    description: 'Busca e-mails no Gmail usando a sintaxe de busca do Gmail (ex.: from:cliente@x.com pedido). Retorna até 10 resultados.',
    input_schema: obj({ query: str('Consulta no formato de busca do Gmail') }, ['query']),
  },
  {
    id: 'gcal_create_event',
    provider: 'google',
    service: 'Agenda',
    label: 'Criar evento na agenda',
    risk: 'write',
    description: 'Cria um evento no Google Agenda e convida os participantes. Datas no formato ISO 8601 sem fuso (ex.: 2026-11-25T14:00:00); o fuso é America/Sao_Paulo salvo indicação.',
    input_schema: obj(
      {
        summary: str('Título do evento'),
        start: str('Início, ISO 8601'),
        end: str('Fim, ISO 8601'),
        attendees: str('E-mails dos participantes, separados por vírgula. Vazio se não houver.'),
        description: str('Descrição ou pauta. Vazio se não houver.'),
      },
      ['summary', 'start', 'end', 'attendees', 'description'],
    ),
  },
  {
    id: 'gcal_list_events',
    provider: 'google',
    service: 'Agenda',
    label: 'Consultar agenda',
    risk: 'read',
    description: 'Lista os eventos do Google Agenda entre duas datas (ISO 8601).',
    input_schema: obj({ start: str('Início do intervalo, ISO 8601'), end: str('Fim do intervalo, ISO 8601') }, ['start', 'end']),
  },
  {
    id: 'gdrive_search_files',
    provider: 'google',
    service: 'Drive',
    label: 'Buscar arquivos no Drive',
    risk: 'read',
    requires: 'google_restricted',
    description: 'Busca arquivos no Google Drive pelo conteúdo ou nome. Retorna nome, tipo e link.',
    input_schema: obj({ query: str('Termos de busca') }, ['query']),
  },
  {
    id: 'gmail_reply',
    provider: 'google',
    service: 'Gmail',
    label: 'Responder e-mail',
    risk: 'write',
    requires: 'google_restricted',
    description: 'Responde a um e-mail do Gmail na mesma conversa. Obtenha o messageId com gmail_search.',
    input_schema: obj({ messageId: str('ID do e-mail (de gmail_search)'), body: str('Texto da resposta') }, ['messageId', 'body']),
  },
  {
    id: 'gdrive_create_doc',
    provider: 'google',
    service: 'Drive',
    label: 'Criar documento no Drive',
    risk: 'write',
    description: 'Cria um Google Docs no Drive com o texto informado e devolve o link. Use para salvar relatórios, atas e resumos.',
    input_schema: obj({ name: str('Nome do documento'), content: str('Conteúdo do documento em texto') }, ['name', 'content']),
  },
  {
    id: 'gchat_list_spaces',
    provider: 'google',
    service: 'Google Chat',
    label: 'Listar espaços do Google Chat',
    risk: 'read',
    description: 'Lista os espaços do Google Chat com os nomes necessários para enviar mensagens.',
    input_schema: obj({}, []),
  },
  {
    id: 'gchat_send_message',
    provider: 'google',
    service: 'Google Chat',
    label: 'Enviar mensagem no Google Chat',
    risk: 'write',
    description: 'Envia uma mensagem em um espaço do Google Chat. Obtenha o nome do espaço (spaces/XXXX) com gchat_list_spaces.',
    input_schema: obj({ space: str('Nome do espaço, ex.: spaces/AAAA1234'), text: str('Texto da mensagem') }, ['space', 'text']),
  },

  // ---------- Comunicação ----------
  {
    id: 'slack_list_channels',
    provider: 'slack',
    service: 'Canais',
    label: 'Listar canais do Slack',
    risk: 'read',
    description: 'Lista os canais públicos do Slack com seus IDs.',
    input_schema: obj({}, []),
  },
  {
    id: 'slack_send_message',
    provider: 'slack',
    service: 'Mensagens',
    label: 'Enviar mensagem no Slack',
    risk: 'write',
    description: 'Envia uma mensagem em um canal do Slack. O bot precisa ter sido adicionado ao canal.',
    input_schema: obj({ channel: str('ID do canal, ex.: C0123ABC'), text: str('Texto da mensagem') }, ['channel', 'text']),
  },
  {
    id: 'whatsapp_send_message',
    provider: 'whatsapp',
    service: 'Mensagens',
    label: 'Enviar mensagem no WhatsApp',
    risk: 'write',
    description: 'Envia uma mensagem de texto pelo WhatsApp da empresa. Só funciona para contatos que falaram com a empresa nas últimas 24 horas (regra da Meta).',
    input_schema: obj({ to: str('Número com DDI e DDD, só dígitos. Ex.: 5511999998888'), text: str('Texto da mensagem') }, ['to', 'text']),
  },
  {
    id: 'whatsapp_send_template',
    provider: 'whatsapp',
    service: 'Mensagens',
    label: 'Enviar modelo aprovado no WhatsApp',
    risk: 'write',
    description: 'Envia um modelo de mensagem aprovado pela Meta. Use para falar com contatos fora da janela de 24 horas, como lembretes e avisos.',
    input_schema: obj(
      {
        to: str('Número com DDI e DDD, só dígitos. Ex.: 5511999998888'),
        template: str('Nome do modelo aprovado no WhatsApp Manager, ex.: lembrete_reembolso'),
        language: str('Código do idioma do modelo, ex.: pt_BR'),
        params: str('Valores das variáveis do modelo, em ordem, separados por | (barra vertical). Vazio se não houver.'),
      },
      ['to', 'template', 'language', 'params'],
    ),
  },
  {
    id: 'telegram_send_message',
    provider: 'telegram',
    service: 'Mensagens',
    label: 'Enviar mensagem no Telegram',
    risk: 'write',
    description: 'Envia uma mensagem pelo bot do Telegram para uma conversa que já falou com o bot.',
    input_schema: obj({ chatId: str('ID da conversa no Telegram'), text: str('Texto da mensagem') }, ['chatId', 'text']),
  },
];

export const ACTION_BY_ID = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
export const PROVIDER_BY_ID = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

// Provedor que de fato guarda a conexão (Teams usa a do Microsoft 365, por exemplo).
export const connectionFor = (providerId) => PROVIDER_BY_ID[providerId]?.via || providerId;

// Modo padrão ao ligar uma ação: leitura roda sozinha, escrita pede aprovação.
export const defaultMode = (action) => (action.risk === 'read' ? 'auto' : 'approval');

// Ações disponíveis conforme os recursos liberados (ex.: escopos restritos do Google).
export const availableActions = (features = {}) => ACTIONS.filter((a) => !a.requires || features[a.requires]);

export const MODES = {
  off: 'Desligada',
  approval: 'Pede aprovação',
  auto: 'Automática',
};

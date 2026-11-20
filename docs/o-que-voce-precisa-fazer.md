# O que você precisa fazer para vender o Squad AI em white label

Tudo o que depende de software está pronto ou listado no README. Esta lista é o que depende de você: contas, cadastros, contratos e decisões comerciais. A ordem é a recomendada.

---

## 1. Decisões comerciais (antes de tudo)

- [ ] **Modelo de cobrança dos parceiros.** Sugestão: mensalidade por parceiro + valor por cliente ativo + repasse do uso de IA acima de uma franquia. O painel da plataforma já mostra mensagens e tokens por parceiro no mês.
- [ ] **Preço sugerido para o cliente final** (o parceiro define o dele). Ajuda o parceiro a vender.
- [ ] **Custo de IA por mensagem.** O agente usa o Claude Opus 5.5 (US$ 4 por milhão de tokens de entrada, US$ 20 por milhão de saída). Estimativa a confirmar nos pilotos: alguns centavos de dólar por mensagem, mais quando o contexto é grande ou o agente executa várias ações. Meça com 2 ou 3 clientes reais antes de fechar a tabela.
- [ ] **Limites dos planos** (mensagens por mês, agentes, pessoas, espaço de contexto). Viram os padrões em Marca, no console de cada parceiro.
- [ ] **Nível de suporte**: quem atende o cliente final (o parceiro, normalmente) e quem atende o parceiro (a Matriz). Defina prazos de resposta.

## 2. Empresa e jurídico (com contador e advogado)

- [ ] **CNPJ com CNAE de software/SaaS** e emissão de nota fiscal de serviço. Confirme o CNAE e o regime tributário com o contador.
- [ ] **Registro da marca Squad AI no INPI.**
- [ ] **Contrato de parceria white label (Matriz ↔ parceiro).** Pontos essenciais:
  - preço, reajuste, inadimplência e suspensão;
  - nível de serviço (disponibilidade, suporte, manutenção programada);
  - limites de responsabilidade, inclusive sobre ações executadas pelos agentes;
  - uso de marca: a marca do parceiro é dele, a tecnologia é da Matriz;
  - proteção de dados: o parceiro é controlador ou operador frente ao cliente, e a Matriz é suboperadora;
  - fim do contrato: prazo para exportar os dados e exclusão depois (a plataforma já faz as duas coisas);
  - proibição de usos ilícitos ou abusivos.
- [ ] **Termos de uso e Política de privacidade para o cliente final.** Cada parceiro publica os dele (a Matriz pode fornecer um modelo) e cadastra os links em Marca.
- [ ] **LGPD:**
  - [ ] Nomear o encarregado (DPO) e publicar o contato.
  - [ ] Registro das operações de tratamento: o que a plataforma guarda (veja o anexo).
  - [ ] Acordo de tratamento de dados (DPA) com cada parceiro.
  - [ ] Lista de subprocessadores: Anthropic (modelo de IA, EUA), Render (hospedagem, EUA), Resend (e-mail, EUA), Sentry se usar, e as plataformas que cada cliente conecta (Microsoft, Google, Meta, Telegram, Slack).
  - [ ] Transferência internacional: os dados passam por servidores nos EUA. Use as cláusulas-padrão da ANPD (Resolução CD/ANPD nº 19/2024) nos contratos.
  - [ ] Plano de resposta a incidentes (quem avisa quem, em quanto tempo).

## 3. Contas e infraestrutura

- [ ] **Domínio** da plataforma (ex.: `squadai.com.br`) e, se quiser subdomínios automáticos para parceiros, um registro DNS curinga `*.squadai.com.br`.
- [ ] **Render** (ou Railway/Fly): conecte o repositório e crie pelo Blueprint (`render.yaml`). Planos sugeridos: web Starter e Postgres com backup diário. Configure os domínios no painel do Render para o HTTPS funcionar.
- [ ] **Anthropic (API do Claude):** conta da empresa, forma de pagamento, limites de gasto e alertas. Gere a `ANTHROPIC_API_KEY`. Leia a política de retenção de dados para citar nos contratos.
- [ ] **Resend (e-mails):** conta e verificação do domínio de envio (SPF e DKIM). Gere a `RESEND_API_KEY` e defina `EMAIL_FROM`. Se um parceiro quiser e-mails com o domínio dele, ele precisa verificar o domínio também.
- [ ] **Sentry (opcional, recomendado):** para receber alertas de erro. Gere o `SENTRY_DSN`.
- [ ] **Monitor de disponibilidade** (UptimeRobot, Better Stack) apontando para `/api/health`.

## 4. Apps das plataformas (aprovações demoram semanas)

Endereço de retorno de todos: `https://SEU_DOMINIO/api/oauth/callback/<provedor>`.

- [ ] **Microsoft Entra ID:** registrar um app multilocatário com as permissões delegadas listadas no README. Fazer a **verificação de publicador** (exige conta no Microsoft Partner Network). Avise os clientes de que o TI deles precisará aprovar algumas permissões (Teams e OneDrive).
- [ ] **Google Cloud:** criar o cliente OAuth, configurar a tela de consentimento (logotipo, domínio, links de termos e privacidade) e pedir a **verificação dos escopos sensíveis**. O Google pede um vídeo mostrando o uso. Até a aprovação, funciona em modo de teste para até 100 usuários, o que basta para os pilotos.
  - Buscar e-mails e arquivos exige escopos **restritos** e uma avaliação de segurança anual paga (CASA). A plataforma deixa isso desligado. Decida se vale a pena depois dos pilotos.
- [ ] **Slack:** criar o app com os escopos do README e, se for distribuir publicamente, ativar a distribuição.
- [ ] **Meta (WhatsApp):** verificar a empresa no Meta Business. Hoje cada cliente cola o token da própria conta. Para conexão com um clique, entre no programa de **Provedor de Tecnologia** (passo futuro).
- [ ] **Parceiros que quiserem a própria marca na tela de consentimento** cadastram os apps deles em "Apps próprios", no console do parceiro, e passam pelas mesmas verificações.

## 5. Colocar no ar

- [ ] Fazer o deploy no Render e preencher as variáveis.
- [ ] No Shell do Render: `npm run create-admin -- seu@email` e abrir o link para definir a senha.
- [ ] Entrar em `/parceiro`, ajustar a marca Squad AI e os limites padrão.
- [ ] Criar o primeiro parceiro em **Parceiros**. O administrador dele recebe o convite no domínio do parceiro.

## 6. Pilotos (antes de abrir a venda)

- [ ] Escolher 1 ou 2 parceiros e 2 ou 3 clientes reais, de áreas diferentes.
- [ ] Acompanhar por 30 dias: mensagens, tokens, ações aprovadas e recusadas, erros.
- [ ] Ajustar preço, limites e textos com base no uso real.
- [ ] Montar um kit para parceiros: apresentação, guia de configuração, perguntas frequentes e argumentos de venda por área.

## 7. Próximas funções de software (quando você decidir)

- Integração com gateway de pagamento (Asaas, Iugu, Pagar.me ou Stripe), depois de escolher o modelo de cobrança.
- Receber mensagens pelo Teams, Google Chat e Slack.
- Conexão do WhatsApp com um clique (Embedded Signup).
- Login corporativo (SSO) para clientes maiores.

---

## Anexo: dados que a plataforma guarda (para o advogado)

| Dado | Onde | Para quê |
| --- | --- | --- |
| Nome, e-mail e senha (com hash) dos usuários | PostgreSQL | Acesso à plataforma |
| Documentos e textos de contexto, processos | PostgreSQL | Instruir os agentes |
| Conversas (inclusive nome e número dos contatos de WhatsApp e Telegram) | PostgreSQL | Histórico e atendimento |
| Ações dos agentes (entrada, resultado, quem aprovou) | PostgreSQL | Auditoria |
| Credenciais das integrações | PostgreSQL, criptografadas | Agir nas plataformas do cliente |
| Uso de IA (tokens por mensagem) | PostgreSQL | Limites e cobrança |
| Conteúdo das mensagens enviado ao modelo | Anthropic (EUA) | Gerar as respostas |

Exportação: o proprietário de cada empresa baixa tudo em **Equipe > Exportar dados**. Exclusão: o parceiro exclui o cliente e todos os dados em **Clientes > Gerenciar**.

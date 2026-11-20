# Conectar o Squad AI à Supabase

A plataforma usa a Supabase como banco PostgreSQL. Login, permissões e arquivos continuam no próprio Squad AI: não é preciso configurar Auth, Storage nem políticas na Supabase.

## 1. Pegar a string de conexão

1. Abra o projeto em supabase.com.
2. Clique em **Connect** (topo da página).
3. Escolha **Session pooler** e copie a string. Ela tem este formato:

   `postgresql://postgres.SEU_PROJETO:[YOUR-PASSWORD]@aws-0-REGIAO.pooler.supabase.com:5432/postgres`

4. Troque `[YOUR-PASSWORD]` pela senha do banco, a que você definiu ao criar o projeto. Se não lembrar: **Project Settings > Database > Reset database password**.

Por que o Session pooler: o endereço direto (`db.xxx.supabase.co`) só funciona em redes com IPv6, e o Render usa IPv4. O pooler de transações (porta 6543) também funciona, mas o de sessão é o indicado para um servidor sempre ligado.

Se a senha tiver caracteres especiais (`@`, `#`, `/`, `:`), troque-os pela forma codificada na URL (por exemplo, `@` vira `%40`) ou crie uma senha só com letras e números.

## 2. Testar no seu computador

Na pasta do projeto:

```bash
npm install
```

```bash
DATABASE_URL="cole-a-string-aqui" npm run db:check
```

Resposta esperada:

```
Conexão OK. PostgreSQL 17.x, 19 tabelas, migração 2 aplicada.
Todas as tabelas estão protegidas contra a API pública da Supabase (RLS ligado).
```

O comando já cria as tabelas. Para rodar a plataforma inteira no seu computador usando a Supabase, coloque a mesma string em `DATABASE_URL` no arquivo `.env` e rode `npm run dev`.

## 3. Usar em produção (Render)

No serviço do Render: **Environment > DATABASE_URL** e cole a mesma string. No próximo deploy, o servidor conecta e aplica as migrações sozinho.

## Segurança

- A Supabase oferece uma API pública (Data API) para as tabelas do schema `public`. Todas as tabelas do Squad AI ficam com **RLS ligado e sem políticas**, então essa API não devolve nenhuma linha. Só o servidor, que conecta como dono das tabelas, lê e grava.
- Não crie políticas de RLS para essas tabelas nem compartilhe a senha do banco. Quem tiver a string de conexão tem acesso total.
- A chave `anon` e a `service_role` da Supabase não são usadas pela plataforma.
- As credenciais das integrações ficam criptografadas com a `ENCRYPTION_KEY` do servidor, que não fica na Supabase. Guarde essa chave num gerenciador de senhas: sem ela, as integrações conectadas precisam ser refeitas.

## Plano

O plano gratuito pausa o projeto depois de uma semana sem uso e não tem backups diários. Para clientes reais, use o plano Pro.

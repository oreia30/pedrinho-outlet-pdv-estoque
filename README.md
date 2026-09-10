# Pedrinho Outlet — Painel (PDV / Estoque / Caixa)

O que é: painel privado (com login) da loja Pedrinho Outlet. Nele você:
- cadastra os produtos, com fotos (galeria) e controla a quantidade em estoque;
- acompanha os pedidos que chegam pela loja virtual (`pedrinho-outlet-site`);
- lança entradas/saídas no caixa — as vendas da loja entram aqui sozinhas;
- vê um resumo (dashboard) com saldo, pedidos do dia e itens com estoque baixo.

Painel e loja usam o **mesmo banco de dados**: uma venda na loja debita o
estoque e lança o caixa na hora, sem passo manual.

## Sobre o upload de fotos

As fotos dos produtos **não ficam guardadas no banco de dados** — isso deixaria
o banco pesado e lento. Elas sobem para um serviço de arquivos (Vercel Blob) e
só o link (URL) da foto é salvo no Postgres.

Não é ilimitado: no plano gratuito (Hobby) da Vercel, o Blob inclui **5 GB de
armazenamento e 100 GB de transferência de dados por mês**, sem cobrar nada
além disso — se passar do limite, o upload fica bloqueado até o mês seguinte
(não há cobrança-surpresa). Pra uma loja de roupa isso dá muito espaço: um
catálogo de centenas de produtos com várias fotos cada cabe tranquilamente
dentro de 5 GB. Se um dia crescer muito, é só ativar o plano Pro.

Cada foto enviada pelo formulário do painel tem limite de **4MB** e cada
produto aceita até **5 fotos** — dá pra aumentar depois se precisar, mas isso
cobre bem fotos tiradas de celular já comprimidas para internet.

## Passo a passo pra colocar no ar

### 1. Banco de dados (Neon) — 2 minutos
1. Crie uma conta em [neon.tech](https://neon.tech) e um projeto novo (vazio).
2. Copie a "Connection string" (algo como
   `postgresql://usuario:senha@ep-xxxx.neon.tech/neondb?sslmode=require`).
3. Não precisa criar tabela nem rodar SQL — o próprio app cria tudo sozinho
   (schema, tabelas, usuário admin e um catálogo de exemplo) na primeira vez
   que conectar.

### 2. Repositório no GitHub
1. Crie um repositório novo (ex: `pedrinho-outlet-pdv-estoque`).
2. Suba esta pasta pra ele (`git init`, `git add .`, `git commit`, `git push`).

### 3. Deploy na Vercel
1. Importe o repositório em [vercel.com/new](https://vercel.com/new).
2. Em "Environment Variables", adicione:
   - `DATABASE_URL` → a connection string do Neon (passo 1)
   - `SESSION_SECRET` → uma string aleatória longa (gere com
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `ADMIN_DEFAULT_PASSWORD` → uma senha segura pra o primeiro login (ex:
     `Pedrinho@2026`) — troque em "Minha conta" assim que entrar
3. Deploy.
4. **Ative o Vercel Blob antes de cadastrar produtos com foto** (armazenamento
   das fotos): no projeto na Vercel, vá em *Storage → Create Database →
   Blob*, conecte ao projeto. A variável `BLOB_READ_WRITE_TOKEN` é criada e
   injetada automaticamente — não precisa colar nada. **É obrigatório em
   produção**: o servidor da Vercel não tem onde guardar arquivo localmente
   (some a cada novo acesso), então sem o Blob configurado o upload de foto
   dá erro. Sem Blob, o painel funciona normalmente pra tudo (produtos sem
   foto, pedidos, caixa) — só o upload de imagem fica bloqueado até você
   ativar.

### 4. Primeiro acesso
- Login: `admin@pedrinhooutlet.com`
- Senha: o valor que você colocou em `ADMIN_DEFAULT_PASSWORD`
- Troque a senha em **Minha conta** assim que entrar.
- O catálogo sobe com 5 peças de exemplo (moda masculina) — troque pelas
  peças reais em **Produtos**.

### 5. Domínio próprio (quando o cliente comprar)
Aponte um subdomínio, ex. `painel.pedrinhooutlet.com.br`, pra este projeto na
Vercel (Settings → Domains). O domínio raiz vai pro projeto da loja
(`pedrinho-outlet-site`).

## Rodar localmente (opcional, pra testar antes de publicar)
```
cp .env.example .env   # preencha DATABASE_URL e SESSION_SECRET
npm install
npm start
```
Abre em http://localhost:3001

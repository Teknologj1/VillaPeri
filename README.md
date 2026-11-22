# Villa Peri — site e sistema de gestão

Sistema de gestão de hospedagem da Villa Peri (Pirenópolis, GO): calendário,
tarifas, reservas, hóspedes e site público, servidos por uma API única que
também atende a RIIA, a secretária de IA no WhatsApp.

Monólito modular, multi-anfitrião desde o primeiro dia.

## Começando

```bash
npm install
```

```bash
cp .env.example .env.local
```

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o site e o painel em http://localhost:3000 |
| `npm run test` | Testes de unidade (motores puros, sem banco) |
| `npm run test:int` | Testes de integração (precisam do Postgres local) |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint, incluindo as regras de fronteira de módulo |
| `npm run db:up` | Sobe o Postgres local e cria os dois papéis |
| `npm run db:generate` | Gera a migração a partir do schema |
| `npm run db:migrate` | Aplica as migrações (papel de owner) |

## Três regras que o código inteiro respeita

**1. Um módulo só fala com o vizinho pelo serviço dele.**
`@/modules/reservas` vale; `@/modules/reservas/schema` não. Não é convenção, é
regra de ESLint — tente importar um arquivo interno de outro módulo e o lint
falha. Dentro do próprio módulo, use import relativo.

**2. Todo registro pertence a um anfitrião, e o isolamento vive no banco.**
Todo acesso ao banco passa por `withTenant()`, que abre uma transação e define
o contexto que as políticas de RLS leem. A aplicação conecta com o papel
`villaperi_app`, que **não é dono das tabelas** — o dono ignora RLS no
PostgreSQL, então, se a aplicação conectasse como dono, tudo funcionaria e o
isolamento simplesmente não existiria. As migrações usam `villaperi_owner`.

**3. A tabela `noite_ocupada` é a verdade sobre ocupação.**
Uma chave única em `(unidade, noite)` torna overbooking impossível por
construção: se duas reservas disputam a mesma noite, a segunda falha na
transação. Consultar disponibilidade antes de inserir é para a interface — a
garantia é a chave.

## Convenções

- **Dinheiro em centavos, inteiro.** Nunca float. Uma única função de
  arredondamento (`src/lib/dinheiro.ts`), meio para cima.
- **Noite é `YYYY-MM-DD`, nunca `Date`.** A aritmética roda em UTC para não
  depender de horário de verão. A estadia é intervalo aberto à direita: a noite
  do check-out fica livre para a próxima entrada.
- **"Hoje" é sempre `hojeNaPropriedade()`**, no fuso da propriedade. Em UTC, a
  partir das 21h em Pirenópolis o servidor já virou o dia.
- **Reserva, hóspede e lançamento não são apagados**: são arquivados ou
  cancelados.

## Site público

As páginas de vitrine (início, a casa, galeria, Pirenópolis, políticas e
contato) são estáticas e **não acessam o banco**: publicam na Vercel sem
`DATABASE_URL` configurada. O conteúdo vive em `src/modules/conteudo/`, com as
formas desenhadas para bater com as colunas de `tipo_acomodacao` e
`propriedade` — quando o banco estiver provisionado, a troca é num arquivo só.

A página de cotação com preço e disponibilidade reais entra quando a tabela de
tarifas estiver preenchida; até lá o site leva a conversa ao WhatsApp.

### Publicar na Vercel

Importe o repositório na Vercel. O preset de Next.js já acerta build e saída;
não há `vercel.json` porque nada precisa ser sobrescrito.

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | **sim** | Assina as sessões do painel. Sem ela o build falha, de propósito. Gere com `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | sim | Domínio onde a aplicação responde. |
| `DATABASE_URL` | para o painel | Conexão da aplicação (papel `villaperi_app`, pelo pooler). O site de vitrine não precisa; o painel sim. |
| `NEXT_PUBLIC_WHATSAPP` | não | WhatsApp da recepção, formato internacional e só dígitos (55 + DDD + número). Sem ela, os botões levam à página de contato em vez de virar link quebrado. |
| `NEXT_PUBLIC_URL_SITE` | não | Endereço final do site, para a prévia com foto ao compartilhar no WhatsApp e no Instagram. |

## Painel

Login por e-mail e senha, com dois fatores para os perfis que exigirem. Não há
cadastro aberto: o primeiro acesso é criado pela linha de comando, e os demais
pelo próprio painel.

```bash
npm run usuario:criar -- --nome "Seu Nome" --email voce@exemplo.com --perfil Proprietário
```

A senha é sorteada e impressa uma única vez — não fica guardada em texto claro
em lugar nenhum.

**Como a autorização funciona.** As tabelas do Better Auth são globais: o login
precisa achar a pessoa pelo e-mail antes de existir qualquer contexto de
anfitrião. A ponte é a tabela `membro`, que diz de qual anfitrião aquele
usuário é e com qual perfil — e essa é isolada como todo o resto.

Toda página do painel começa por `exigirSessao()` (`src/lib/sessao.ts`), que é
a camada de acesso. O `proxy.ts` redireciona cedo quem não tem cookie, mas é
só conforto de navegação: quem autoriza é a função, junto do dado. Verificação
só na borda é como uma rota nova nasce desprotegida.

## Fotos do site

As fotos publicadas ficam em `public/fotos/`, com nome descritivo, e o catálogo
com texto alternativo e categoria está em `src/modules/conteudo/fotos.ts`.
Veja [`public/fotos/README.md`](public/fotos/README.md) para como nomear
arquivos novos.

`fotos-originais/` guarda as capturas de tela de onde as fotos atuais foram
extraídas. Fica **fora de `public/`** de propósito: o que está em `public/` é
publicado como está, e são 80 MB que ninguém precisa baixar.

## Notificações: como uma mensagem sai

O sistema nunca envia dentro da transação do fato. Ele **enfileira** na tabela
`notificacao`, junto com a reserva ou o pedido, e a entrega acontece depois —
se o fato não for gravado, ninguém recebe aviso de algo que não aconteceu.

A entrega tem dois caminhos, e o primeiro é o normal:

1. **Logo depois do fato.** `entregarEmSeguida()` (`src/lib/entregar.ts`) usa
   o `after()` do Next: a resposta sai na hora e a fila é drenada em seguida,
   na mesma invocação. Quem acabou de pedir uma reserva recebe a confirmação
   em segundos, e não espera o e-mail sair para ver a página de confirmação.

2. **A varredura diária.** `/api/cron/notificacoes` recolhe o que falhou —
   provedor fora do ar, variável que faltava, invocação que morreu no meio.

> **O cron é diário porque o plano Hobby da Vercel só aceita cron diário.**
> Qualquer coisa mais frequente faz o **build falhar**, não apenas ser
> ignorada. Já aconteceu uma vez, com `*/10 * * * *`. Para drenar de hora em
> hora é preciso o plano Pro — ou um agendador externo chamando a rota com o
> `CRON_SECRET`.

Como há dois drenadores, a fila **reserva** a linha antes de enviar: o
`select ... for update` + `update` para `enviando`, na mesma transação,
decidem quem é o dono daquele envio. Sem isso os dois pegariam a mesma
mensagem pendente e o hóspede receberia a confirmação em dobro. Uma linha
presa em `enviando` volta à fila depois de cinco minutos, para o caso de o
drenador morrer no meio.

Sem provedor configurado, a mensagem fica **pendente** — nunca é marcada como
enviada. Fingir que saiu é o pior resultado possível: o hóspede não recebe e
ninguém fica sabendo.

## Documentação

A especificação funcional completa (escopo, perfis, fluxos, regras de tarifa,
RIIA, marketplace e roadmap em fases) está no documento do projeto. Este
repositório implementa a **Fase 1A**: núcleo e site.

Para a integração com a secretária de IA:

- [`docs/integracao-riia.md`](docs/integracao-riia.md) — a API que a RIIA
  chama: as dez ferramentas, chave, escopos, níveis e idempotência.
- [`docs/envios-para-a-riia.md`](docs/envios-para-a-riia.md) — o caminho
  inverso: o endpoint que a RIIA precisa construir para receber as mensagens
  que o sistema manda ao hóspede.

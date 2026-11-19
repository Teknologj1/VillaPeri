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

Duas variáveis de ambiente, as duas opcionais para o build passar:

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_WHATSAPP` | WhatsApp da recepção, formato internacional e só dígitos (55 + DDD + número). Sem ela, os botões levam à página de contato em vez de virar link quebrado. |
| `NEXT_PUBLIC_URL_SITE` | Endereço final do site, para a prévia com foto ao compartilhar no WhatsApp e no Instagram. |

## Fotos do site

As fotos publicadas ficam em `public/fotos/`, com nome descritivo, e o catálogo
com texto alternativo e categoria está em `src/modules/conteudo/fotos.ts`.
Veja [`public/fotos/README.md`](public/fotos/README.md) para como nomear
arquivos novos.

`fotos-originais/` guarda as capturas de tela de onde as fotos atuais foram
extraídas. Fica **fora de `public/`** de propósito: o que está em `public/` é
publicado como está, e são 80 MB que ninguém precisa baixar.

## Documentação

A especificação funcional completa (escopo, perfis, fluxos, regras de tarifa,
RIIA, marketplace e roadmap em fases) está no documento do projeto. Este
repositório implementa a **Fase 1A**: núcleo e site.

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

## Fotos do site

Veja [`public/fotos/README.md`](public/fotos/README.md) para onde colocar cada
foto e como nomear os arquivos.

## Documentação

A especificação funcional completa (escopo, perfis, fluxos, regras de tarifa,
RIIA, marketplace e roadmap em fases) está no documento do projeto. Este
repositório implementa a **Fase 1A**: núcleo e site.

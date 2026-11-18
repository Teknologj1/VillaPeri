import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { anfitriao, propriedade } from "@/modules/anfitriao/schema";

import { fecharConexao } from "./client";
import { ehViolacaoDeRls, mensagemPostgres } from "./erros";
import { inspecionarIsolamento, verificarIsolamento } from "./isolamento";
import * as schema from "./schema";
import { withTenant } from "./tenant";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Isolamento por anfitrião, contra um PostgreSQL de verdade.
 *
 * Estes testes não podem ser substituídos por mock: o que está sendo testado
 * é o comportamento do próprio banco (políticas de RLS, atributo BYPASSRLS,
 * dono de tabela, escopo do SET LOCAL). Um banco falso passaria em todos eles
 * e não provaria nada.
 */

// Conexão de migração (BYPASSRLS): monta e desmonta o cenário, por fora do RLS.
const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 1 });
const dbOwner = drizzle(clienteOwner, { schema });

const NOME_A = "__teste_isolamento_A";
const NOME_B = "__teste_isolamento_B";

let anfitriaoA: string;
let anfitriaoB: string;

async function limpar() {
  for (const nome of [NOME_A, NOME_B]) {
    const [a] = await dbOwner
      .select()
      .from(anfitriao)
      .where(eq(anfitriao.nome, nome))
      .limit(1);
    if (a) {
      await dbOwner.delete(propriedade).where(eq(propriedade.anfitriaoId, a.id));
      await dbOwner.delete(anfitriao).where(eq(anfitriao.id, a.id));
    }
  }
}

beforeAll(async () => {
  await limpar();

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: NOME_A, status: "ativa" })
    .returning();
  const [b] = await dbOwner
    .insert(anfitriao)
    .values({ nome: NOME_B, status: "ativa" })
    .returning();
  if (!a || !b) throw new Error("Falha ao montar o cenário.");

  anfitriaoA = a.id;
  anfitriaoB = b.id;

  await dbOwner.insert(propriedade).values([
    { anfitriaoId: anfitriaoA, nome: "Pousada do anfitrião A" },
    { anfitriaoId: anfitriaoB, nome: "Pousada do anfitrião B" },
  ]);
});

afterAll(async () => {
  await limpar();
  await clienteOwner.end();
  await fecharConexao();
});

describe("a conexão da aplicação é incapaz de furar o isolamento", () => {
  it("não tem BYPASSRLS e não é dona de nenhuma tabela", async () => {
    const r = await inspecionarIsolamento();

    // Se qualquer uma destas falhar, TODOS os outros testes deste arquivo
    // passariam de qualquer jeito, sem isolamento nenhum existir.
    expect(r.temBypassRls).toBe(false);
    expect(r.tabelasQuePossui).toEqual([]);
    expect(r.papel).toBe("villaperi_app");
    await expect(verificarIsolamento()).resolves.toBeUndefined();
  });

  it("a conexão de migração seria rejeitada pela mesma verificação", async () => {
    // Prova que a verificação de boot distingue as duas conexões, em vez de
    // aprovar qualquer uma.
    const [linha] = await dbOwner.execute<{ bypass: boolean }>(sql`
      select rolbypassrls as bypass from pg_roles where rolname = current_user
    `);
    expect(linha?.bypass).toBe(true);
  });
});

describe("leitura", () => {
  it("com o contexto de A, enxerga só as propriedades de A", async () => {
    const linhas = await withTenant(anfitriaoA, (tx) =>
      tx.select().from(propriedade),
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.nome).toBe("Pousada do anfitrião A");
  });

  it("com o contexto de B, enxerga só as de B", async () => {
    const linhas = await withTenant(anfitriaoB, (tx) =>
      tx.select().from(propriedade),
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.nome).toBe("Pousada do anfitrião B");
  });

  it("filtrar explicitamente pelo id do outro anfitrião não traz nada", async () => {
    // O isolamento não depende de o código lembrar de filtrar: mesmo pedindo
    // de propósito as linhas de B, o banco não as entrega.
    const linhas = await withTenant(anfitriaoA, (tx) =>
      tx.select().from(propriedade).where(eq(propriedade.anfitriaoId, anfitriaoB)),
    );
    expect(linhas).toEqual([]);
  });

  it("sem contexto nenhum, não enxerga nada — e não quebra", async () => {
    // O `nullif` nas políticas é o que faz isto devolver zero linhas em vez de
    // "invalid input syntax for type uuid": current_setting devolve string
    // vazia, não NULL, numa conexão de pool já usada antes.
    const { db } = await import("./client");
    const linhas = await db.select().from(propriedade);
    expect(linhas).toEqual([]);
  });
});

describe("escrita", () => {
  it("recusa gravar em nome de outro anfitrião", async () => {
    const erro = await withTenant(anfitriaoA, (tx) =>
      tx.insert(propriedade).values({ anfitriaoId: anfitriaoB, nome: "invasão" }),
    ).catch((e: unknown) => e);

    // O Drizzle embrulha o erro do driver, então a mensagem de fora é sempre
    // "Failed query: …". O que importa está em `cause`.
    expect(ehViolacaoDeRls(erro)).toBe(true);
    expect(mensagemPostgres(erro)).toMatch(/row-level security/i);
  });

  it("recusa atualizar linha de outro anfitrião", async () => {
    await withTenant(anfitriaoA, (tx) =>
      tx
        .update(propriedade)
        .set({ nome: "renomeada por A" })
        .where(eq(propriedade.anfitriaoId, anfitriaoB)),
    );

    // O UPDATE não dá erro: ele simplesmente não alcança linha nenhuma.
    const deB = await withTenant(anfitriaoB, (tx) =>
      tx.select().from(propriedade),
    );
    expect(deB[0]?.nome).toBe("Pousada do anfitrião B");
  });

  it("recusa apagar linha de outro anfitrião", async () => {
    await withTenant(anfitriaoA, (tx) =>
      tx.delete(propriedade).where(eq(propriedade.anfitriaoId, anfitriaoB)),
    );
    const deB = await withTenant(anfitriaoB, (tx) =>
      tx.select().from(propriedade),
    );
    expect(deB).toHaveLength(1);
  });
});

describe("o contexto não vaza entre transações", () => {
  it("não sobrevive ao fim da transação que o definiu", async () => {
    // É o cenário do pooler em modo de transação: a mesma conexão física
    // atende requisições de anfitriões diferentes, uma após a outra.
    await withTenant(anfitriaoA, (tx) => tx.select().from(propriedade));

    const { db } = await import("./client");
    const semContexto = await db.select().from(propriedade);
    expect(semContexto).toEqual([]);
  });

  it("transações seguidas enxergam cada uma o seu anfitrião", async () => {
    const a = await withTenant(anfitriaoA, (tx) => tx.select().from(propriedade));
    const b = await withTenant(anfitriaoB, (tx) => tx.select().from(propriedade));
    const a2 = await withTenant(anfitriaoA, (tx) => tx.select().from(propriedade));

    expect(a[0]?.nome).toBe("Pousada do anfitrião A");
    expect(b[0]?.nome).toBe("Pousada do anfitrião B");
    expect(a2[0]?.nome).toBe("Pousada do anfitrião A");
  });
});

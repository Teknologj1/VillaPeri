import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fecharConexao } from "@/db/client";
import * as schema from "@/db/schema";
import { anfitriao, perfil, permissao } from "@/modules/anfitriao/schema";

import { membro } from "./schema-membro";
import { user } from "./schema";
import {
  SemPermissaoError,
  carregarSessaoDoPainel,
  descontoDentroDoLimite,
  exigirPermissao,
  nivelEm,
  podeNoModulo,
} from "./service";

config({ path: [".env.local", ".env"], quiet: true });

const urlOwner = process.env.DATABASE_URL_MIGRATOR;
if (!urlOwner) throw new Error("DATABASE_URL_MIGRATOR é necessária nos testes.");
const clienteOwner = postgres(urlOwner, { max: 5 });
const dbOwner = drizzle(clienteOwner, { schema });

const CASA_A = "__teste_auth_casa_A";
const CASA_B = "__teste_auth_casa_B";

let anfitriaoA: string;
let anfitriaoB: string;
let usuarioRecepcao: string;
let usuarioDaCasaB: string;
let usuarioSemVinculo: string;
let usuarioDesativado: string;

function dadosDe(id: string) {
  return { id, nome: `Pessoa ${id}`, email: `${id}@teste.local`, doisFatoresAtivos: false };
}

async function criarUsuario(sufixo: string): Promise<string> {
  const id = `u-${sufixo}-${randomUUID().slice(0, 8)}`;
  await dbOwner.insert(user).values({
    id,
    name: `Pessoa ${sufixo}`,
    email: `${id}@teste.local`,
    emailVerified: false,
  });
  return id;
}

async function limpar() {
  const casas = await dbOwner
    .select()
    .from(anfitriao)
    .where(inArray(anfitriao.nome, [CASA_A, CASA_B]));
  for (const c of casas) {
    await dbOwner.delete(membro).where(eq(membro.anfitriaoId, c.id));
    await dbOwner.delete(permissao).where(eq(permissao.anfitriaoId, c.id));
    await dbOwner.delete(perfil).where(eq(perfil.anfitriaoId, c.id));
    await dbOwner.delete(anfitriao).where(eq(anfitriao.id, c.id));
  }
  await dbOwner.delete(user).where(eq(user.email, "__inexistente__"));
}

beforeAll(async () => {
  await limpar();

  const [a] = await dbOwner
    .insert(anfitriao)
    .values({ nome: CASA_A, status: "ativa" })
    .returning();
  const [b] = await dbOwner
    .insert(anfitriao)
    .values({ nome: CASA_B, status: "ativa" })
    .returning();
  anfitriaoA = a!.id;
  anfitriaoB = b!.id;

  // Perfil "Recepção" da casa A: edita reservas, lança despesas, só vê o
  // calendário, não enxerga relatórios. Desconto até 10%.
  const [recepcao] = await dbOwner
    .insert(perfil)
    .values({
      anfitriaoId: anfitriaoA,
      nome: "Recepção",
      sistema: true,
      descontoMaximoPontosBase: 1_000,
    })
    .returning();

  await dbOwner.insert(permissao).values([
    { anfitriaoId: anfitriaoA, perfilId: recepcao!.id, modulo: "reservas", nivel: "editar" },
    { anfitriaoId: anfitriaoA, perfilId: recepcao!.id, modulo: "despesas", nivel: "lancar" },
    { anfitriaoId: anfitriaoA, perfilId: recepcao!.id, modulo: "calendario", nivel: "ver" },
    { anfitriaoId: anfitriaoA, perfilId: recepcao!.id, modulo: "relatorios", nivel: "nenhum" },
  ]);

  const [perfilB] = await dbOwner
    .insert(perfil)
    .values({ anfitriaoId: anfitriaoB, nome: "Proprietário", sistema: true })
    .returning();

  usuarioRecepcao = await criarUsuario("recepcao");
  usuarioDaCasaB = await criarUsuario("casa-b");
  usuarioSemVinculo = await criarUsuario("sem-vinculo");
  usuarioDesativado = await criarUsuario("desativado");

  await dbOwner.insert(membro).values([
    { anfitriaoId: anfitriaoA, usuarioId: usuarioRecepcao, perfilId: recepcao!.id },
    { anfitriaoId: anfitriaoB, usuarioId: usuarioDaCasaB, perfilId: perfilB!.id },
    {
      anfitriaoId: anfitriaoA,
      usuarioId: usuarioDesativado,
      perfilId: recepcao!.id,
      ativo: false,
    },
  ]);
});

afterAll(async () => {
  await limpar();
  await dbOwner
    .delete(user)
    .where(
      inArray(user.id, [
        usuarioRecepcao,
        usuarioDaCasaB,
        usuarioSemVinculo,
        usuarioDesativado,
      ]),
    );
  await clienteOwner.end();
  await fecharConexao();
});

describe("carregarSessaoDoPainel", () => {
  it("resolve o anfitrião e o perfil a partir do usuário", async () => {
    const s = await carregarSessaoDoPainel(dadosDe(usuarioRecepcao));
    expect(s).not.toBeNull();
    expect(s!.anfitriaoId).toBe(anfitriaoA);
    expect(s!.perfil.nome).toBe("Recepção");
  });

  it("devolve null para quem está autenticado mas não é membro de ninguém", async () => {
    // Autenticado não é o mesmo que autorizado. Um usuário sem vínculo entra
    // no login e não entra em lugar nenhum.
    const s = await carregarSessaoDoPainel(dadosDe(usuarioSemVinculo));
    expect(s).toBeNull();
  });

  it("devolve null para membro desativado", async () => {
    const s = await carregarSessaoDoPainel(dadosDe(usuarioDesativado));
    expect(s).toBeNull();
  });

  it("cada usuário resolve o SEU anfitrião, nunca o do outro", async () => {
    // O teste que importa: a política `membro_do_usuario` abre uma porta para
    // a pessoa ler o próprio vínculo. Se ela abrisse demais, o usuário da
    // casa B cairia na casa A — e levaria o contexto errado para o resto da
    // requisição, furando o isolamento inteiro.
    const a = await carregarSessaoDoPainel(dadosDe(usuarioRecepcao));
    const b = await carregarSessaoDoPainel(dadosDe(usuarioDaCasaB));

    expect(a!.anfitriaoId).toBe(anfitriaoA);
    expect(b!.anfitriaoId).toBe(anfitriaoB);
    expect(a!.anfitriaoId).not.toBe(b!.anfitriaoId);
  });

  it("a política do banco só entrega o vínculo do próprio usuário", async () => {
    // O teste acima passa mesmo com a política aberta, porque a consulta já
    // filtra por usuário. Este aqui NÃO filtra: pede todos os vínculos
    // dentro do contexto de um usuário. Se a política `membro_do_usuario`
    // estiver larga demais, aparecem os vínculos alheios — e com eles o
    // caminho para assumir o anfitrião errado.
    const { comContextoDeUsuario } = await import("@/db/tenant");

    const vistosPorA = await comContextoDeUsuario(usuarioRecepcao, (tx) =>
      tx.select().from(membro),
    );
    expect(vistosPorA).toHaveLength(1);
    expect(vistosPorA[0]?.usuarioId).toBe(usuarioRecepcao);
    expect(vistosPorA[0]?.anfitriaoId).toBe(anfitriaoA);

    const vistosPorB = await comContextoDeUsuario(usuarioDaCasaB, (tx) =>
      tx.select().from(membro),
    );
    expect(vistosPorB).toHaveLength(1);
    expect(vistosPorB[0]?.anfitriaoId).toBe(anfitriaoB);

    // E sem contexto de usuário nenhum, nada.
    const { db } = await import("@/db/client");
    expect(await db.select().from(membro)).toEqual([]);
  });

  it("a porta por usuário é só de leitura", async () => {
    // A política `membro_do_usuario` é `for: select`. Se fosse `for: all`,
    // um usuário poderia inserir um vínculo seu em qualquer anfitrião e
    // entrar na casa dos outros.
    const { comContextoDeUsuario } = await import("@/db/tenant");

    const erro = await comContextoDeUsuario(usuarioRecepcao, (tx) =>
      tx.insert(membro).values({
        anfitriaoId: anfitriaoB,
        usuarioId: usuarioRecepcao,
        perfilId: randomUUID(),
      }),
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(Error);
  });

  it("marca os dois fatores pendentes quando o perfil exige e a conta não tem", async () => {
    const [p] = await dbOwner
      .update(perfil)
      .set({ exigeDoisFatores: true })
      .where(eq(perfil.anfitriaoId, anfitriaoA))
      .returning();
    expect(p).toBeDefined();

    const semDoisFatores = await carregarSessaoDoPainel(dadosDe(usuarioRecepcao));
    expect(semDoisFatores!.precisaAtivarDoisFatores).toBe(true);

    const comDoisFatores = await carregarSessaoDoPainel({
      ...dadosDe(usuarioRecepcao),
      doisFatoresAtivos: true,
    });
    expect(comDoisFatores!.precisaAtivarDoisFatores).toBe(false);

    await dbOwner
      .update(perfil)
      .set({ exigeDoisFatores: false })
      .where(eq(perfil.anfitriaoId, anfitriaoA));
  });
});

describe("permissões", () => {
  it("reflete a matriz cadastrada", async () => {
    const s = (await carregarSessaoDoPainel(dadosDe(usuarioRecepcao)))!;
    expect(nivelEm(s, "reservas")).toBe("editar");
    expect(nivelEm(s, "despesas")).toBe("lancar");
    expect(nivelEm(s, "calendario")).toBe("ver");
    expect(nivelEm(s, "relatorios")).toBe("nenhum");
  });

  it("módulo sem linha na tabela nega por padrão", async () => {
    // Um módulo novo, ainda não cadastrado em perfil nenhum, fica invisível
    // até alguém decidir quem pode vê-lo. O contrário — nascer aberto — é
    // como se vaza funcionalidade sem perceber.
    const s = (await carregarSessaoDoPainel(dadosDe(usuarioRecepcao)))!;
    expect(nivelEm(s, "enxoval")).toBe("nenhum");
    expect(nivelEm(s, "usuarios")).toBe("nenhum");
  });

  it("os níveis são ordenados: editar > lancar > ver > nenhum", async () => {
    const s = (await carregarSessaoDoPainel(dadosDe(usuarioRecepcao)))!;

    expect(podeNoModulo(s, "reservas", "ver")).toBe(true);
    expect(podeNoModulo(s, "reservas", "editar")).toBe(true);

    // Lançar despesa pode; editar uma já lançada, não.
    expect(podeNoModulo(s, "despesas", "lancar")).toBe(true);
    expect(podeNoModulo(s, "despesas", "editar")).toBe(false);

    // Ver o calendário pode; mexer nele, não.
    expect(podeNoModulo(s, "calendario", "ver")).toBe(true);
    expect(podeNoModulo(s, "calendario", "editar")).toBe(false);
  });

  it("exigirPermissao levanta erro com o módulo e os níveis", async () => {
    const s = (await carregarSessaoDoPainel(dadosDe(usuarioRecepcao)))!;

    expect(() => exigirPermissao(s, "reservas", "editar")).not.toThrow();

    const erro = (() => {
      try {
        exigirPermissao(s, "relatorios", "ver");
      } catch (e) {
        return e;
      }
    })();
    expect(erro).toBeInstanceOf(SemPermissaoError);
    expect((erro as SemPermissaoError).modulo).toBe("relatorios");
    expect((erro as SemPermissaoError).concedido).toBe("nenhum");
  });
});

describe("limite de desconto", () => {
  it("respeita o teto do perfil", async () => {
    const s = (await carregarSessaoDoPainel(dadosDe(usuarioRecepcao)))!;
    expect(descontoDentroDoLimite(s, 500)).toBe(true); // 5%
    expect(descontoDentroDoLimite(s, 1_000)).toBe(true); // 10%, no limite
    expect(descontoDentroDoLimite(s, 1_001)).toBe(false); // acima: vai a aprovação
  });
});

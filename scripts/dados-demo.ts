import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Reservas de demonstração, para ver as telas com conteúdo.
 *
 * Existe porque uma tela vazia não prova nada: a lista, a folha da portaria e
 * o cálculo noite a noite só se conferem com gente dentro. Os dados são
 * fictícios e os nomes são óbvios — ninguém vai confundir "Demonstração
 * Chegada" com hóspede de verdade.
 *
 * Recusa rodar contra banco de produção: a checagem é pela própria string de
 * conexão, e não por NODE_ENV, que é fácil de esquecer de definir.
 *
 *   npm run demo:dados
 *   npm run demo:dados -- --limpar
 */

const PREFIXO = "Demonstração";

async function principal() {
  const { values } = parseArgs({
    options: { limpar: { type: "boolean", default: false } },
  });

  const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error(
      "Este script só roda contra banco local. A conexão configurada não é local.",
    );
    process.exit(1);
  }

  const { eq, like } = await import("drizzle-orm");
  const { fecharConexao } = await import("@/db/client");
  const { withTenant } = await import("@/db/tenant");
  const { anfitriao } = await import("@/modules/anfitriao/schema");
  const { hospede, reserva } = await import("@/modules/reservas/schema");
  const { noiteOcupada } = await import("@/modules/calendario/schema");
  const { pagamento } = await import("@/modules/reservas/schema");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  const schema = await import("@/db/schema");

  const cliente = postgres(process.env.DATABASE_URL_MIGRATOR!, { max: 3 });
  const dbOwner = drizzle(cliente, { schema });

  const [conta] = await dbOwner
    .select()
    .from(anfitriao)
    .where(eq(anfitriao.nome, "Villa Peri"))
    .limit(1);

  if (!conta) {
    console.error("Rode `npm run db:seed` primeiro.");
    await cliente.end();
    await fecharConexao();
    process.exit(1);
  }

  // Apaga só o que este script criou, pelo prefixo do nome. Nunca um DELETE
  // amplo: se alguém tiver dados reais no banco local, eles ficam.
  const demos = await dbOwner
    .select({ id: hospede.id })
    .from(hospede)
    .where(like(hospede.nome, `${PREFIXO}%`));

  for (const h of demos) {
    const rs = await dbOwner
      .select({ id: reserva.id })
      .from(reserva)
      .where(eq(reserva.hospedeId, h.id));
    for (const r of rs) {
      await dbOwner.delete(pagamento).where(eq(pagamento.reservaId, r.id));
      await dbOwner.delete(noiteOcupada).where(eq(noiteOcupada.origemId, r.id));
      await dbOwner.delete(reserva).where(eq(reserva.id, r.id));
    }
    await dbOwner.delete(hospede).where(eq(hospede.id, h.id));
  }

  if (values.limpar) {
    console.log(`Removidas ${demos.length} fichas de demonstração.`);
    await cliente.end();
    await fecharConexao();
    return;
  }

  const { criarReserva, mudarStatus, registrarPagamento } = await import(
    "@/modules/reservas"
  );
  const { listarTipos, listarUnidadesAtivas } = await import(
    "@/modules/anfitriao"
  );
  const { hojeNaPropriedade, somarDias } = await import("@/lib/data");

  const hoje = hojeNaPropriedade(process.env.TZ_PROPRIEDADE ?? "America/Sao_Paulo");
  const AUTOR = { tipo: "sistema" } as const;

  const criadas = await withTenant(conta.id, async (tx) => {
    const tipo = (await listarTipos(tx))[0];
    const unidade = (await listarUnidadesAtivas(tx))[0];
    if (!tipo || !unidade) throw new Error("Sem tipo ou unidade cadastrada.");

    /**
     * O elenco é o dia de VIRADA: um hóspede sai pela manhã e outro entra à
     * tarde. É o dia mais movimentado que a casa tem, e o que mais exige da
     * folha da portaria.
     *
     * Não há um terceiro hóspede "no meio da estadia" hoje, e não pode haver:
     * a Villa Peri é locada inteira, uma unidade só, e a chave única
     * `(unidade, noite)` recusa dois hóspedes na mesma noite — foi ela que
     * recusou a primeira versão deste elenco. "Continuam na casa" se enche
     * em qualquer dia que não seja de virada; amanhã, com estes dados, a
     * chegada de hoje aparece lá.
     *
     * As datas são relativas a hoje, para a tela nunca envelhecer.
     */
    const elenco = [
      {
        nome: `${PREFIXO} Saída`,
        entrada: somarDias(hoje, -3),
        saida: hoje,
        ate: "hospedado" as const,
        pagarSinal: true,
      },
      {
        nome: `${PREFIXO} Chegada`,
        entrada: hoje,
        saida: somarDias(hoje, 4),
        ate: "confirmada" as const,
        pagarSinal: true,
      },
      {
        nome: `${PREFIXO} Pré-reserva`,
        entrada: somarDias(hoje, 20),
        saida: somarDias(hoje, 23),
        ate: null,
        pagarSinal: false,
      },
      {
        nome: `${PREFIXO} Antiga`,
        entrada: somarDias(hoje, -40),
        saida: somarDias(hoje, -37),
        ate: "concluida" as const,
        pagarSinal: true,
      },
      {
        nome: `${PREFIXO} Réveillon`,
        entrada: `${Number(hoje.slice(0, 4)) + 1}-12-28`,
        saida: `${Number(hoje.slice(0, 4)) + 2}-01-02`,
        ate: "confirmada" as const,
        pagarSinal: true,
      },
    ];

    const unidades = await listarUnidadesAtivas(tx);
    let feitas = 0;

    for (const [i, p] of elenco.entries()) {
      // Espalha pelas unidades disponíveis quando há mais de uma; com uma só,
      // as datas do elenco não se sobrepõem na mesma noite.
      const u = unidades[i % unidades.length] ?? unidade;

      const r = await criarReserva(tx, conta.id, {
        unidadeId: u.id,
        tipoId: tipo.id,
        entrada: p.entrada,
        saida: p.saida,
        adultos: 4,
        criancas: i === 0 ? 2 : 0,
        hospede: {
          nome: p.nome,
          telefone: `6298800${String(1000 + i).slice(-4)}`,
          email: `${p.nome.split(" ").pop()!.toLowerCase()}@exemplo.test`,
        },
        canal: "balcao",
        autor: AUTOR,
      });

      const caminho: Record<string, string[]> = {
        confirmada: ["confirmada"],
        hospedado: ["confirmada", "hospedado"],
        concluida: ["confirmada", "hospedado", "concluida"],
      };
      for (const passo of p.ate ? (caminho[p.ate] ?? []) : []) {
        await mudarStatus(tx, conta.id, r.id, passo as never, {
          autor: AUTOR,
          hojeNaCasa: hoje,
        });
      }

      if (p.pagarSinal) {
        await registrarPagamento(tx, conta.id, {
          reservaId: r.id,
          tipo: "sinal",
          metodo: "pix",
          valorCentavos: r.sinalCentavos,
          data: p.entrada,
          autor: AUTOR,
        });
      }

      console.log(
        `  ${r.codigo}  ${p.nome}  ${p.entrada} → ${p.saida}  ${p.ate ?? "pré-reserva"}`,
      );
      feitas++;
    }

    return feitas;
  });

  console.log(`\n${criadas} reservas de demonstração criadas.`);
  console.log("Para remover: npm run demo:dados -- --limpar");

  await cliente.end();
  await fecharConexao();
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

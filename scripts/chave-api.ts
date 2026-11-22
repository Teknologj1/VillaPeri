import { parseArgs } from "node:util";

import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Cria, lista e revoga as chaves de API da RIIA.
 *
 * Existe como script, e não só como tela, porque a primeira chave precisa
 * existir antes de alguém ter configurado a integração — e porque revogar é
 * a ação que tem de funcionar às três da manhã, sem depender de o painel
 * estar no ar.
 *
 * O segredo aparece UMA vez. Não é guardado em lugar nenhum: o banco tem só
 * o hash. Perdeu, cria outra e revoga a anterior.
 *
 *   npm run chave -- --listar
 *   npm run chave -- --criar "DisparaAI" --nivel 2
 *   npm run chave -- --revogar <id>
 */
async function principal() {
  const { values } = parseArgs({
    options: {
      criar: { type: "string" },
      nivel: { type: "string", default: "2" },
      limite: { type: "string", default: "60" },
      listar: { type: "boolean", default: false },
      revogar: { type: "string" },
      anfitriao: { type: "string" },
    },
  });

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  const schema = await import("@/db/schema");
  const { withTenant } = await import("@/db/tenant");
  const { fecharConexao } = await import("@/db/client");
  const { anfitriao } = await import("@/modules/anfitriao/schema");
  const { criarChave, listarChaves, revogarChave, NIVEIS, ferramentasDoNivel } =
    await import("@/modules/riia");

  const cliente = postgres(process.env.DATABASE_URL_MIGRATOR!, { max: 3 });
  const dbOwner = drizzle(cliente, { schema });

  const contas = await dbOwner.select().from(anfitriao);
  const conta = values.anfitriao
    ? contas.find((c) => c.id === values.anfitriao || c.nome === values.anfitriao)
    : contas[0];

  if (!conta) {
    console.error("Nenhum anfitrião encontrado. Rode `npm run db:seed`.");
    process.exit(1);
  }

  const fim = async () => {
    await cliente.end();
    await fecharConexao();
  };

  if (values.revogar) {
    await withTenant(conta.id, (tx) => revogarChave(tx, values.revogar!));
    console.log(`Chave ${values.revogar} revogada. A próxima chamada já falha.`);
    await fim();
    return;
  }

  if (values.criar) {
    const nivel = Number(values.nivel);
    if (![1, 2, 3].includes(nivel)) {
      console.error("O nível tem de ser 1, 2 ou 3.");
      await fim();
      process.exit(1);
    }

    const resultado = await withTenant(conta.id, (tx) =>
      criarChave(tx, conta.id, {
        nome: values.criar!,
        nivelAutonomia: nivel as 1 | 2 | 3,
        limitePorMinuto: Number(values.limite),
      }),
    );

    const ferramentas = ferramentasDoNivel(nivel as 1 | 2 | 3);

    console.log(`\nChave criada para ${conta.nome}.\n`);
    console.log(`  nome    ${values.criar}`);
    console.log(`  nível   ${nivel} (${NIVEIS[nivel as 1 | 2 | 3]})`);
    console.log(`  limite  ${values.limite} chamadas por minuto`);
    console.log(`  escopos ${ferramentas.join(", ")}\n`);
    console.log("  ┌────────────────────────────────────────────────────────┐");
    console.log("  │ A CHAVE APARECE UMA VEZ SÓ. Guarde-a agora.            │");
    console.log("  └────────────────────────────────────────────────────────┘\n");
    console.log(`  ${resultado.chave}\n`);
    console.log("  Use assim:");
    console.log(`    Authorization: Bearer ${resultado.chave}\n`);
    console.log(`  Para revogar:  npm run chave -- --revogar ${resultado.id}\n`);

    await fim();
    return;
  }

  // Sem argumento de ação, lista.
  const chaves = await withTenant(conta.id, (tx) => listarChaves(tx));

  if (chaves.length === 0) {
    console.log(`Nenhuma chave em ${conta.nome}.`);
    console.log('Crie uma com: npm run chave -- --criar "DisparaAI" --nivel 2');
  } else {
    console.log(`\nChaves de ${conta.nome}:\n`);
    for (const c of chaves) {
      const estado = c.revogadaEm
        ? "REVOGADA"
        : c.validaAte && c.validaAte < new Date()
          ? "VENCIDA"
          : "ativa";
      console.log(`  ${c.prefixo}…  ${c.nome}`);
      console.log(
        `    ${estado} · nível ${c.nivelAutonomia} · ${c.limitePorMinuto}/min · ` +
          `último uso: ${c.ultimoUsoEm?.toISOString() ?? "nunca"}`,
      );
      console.log(`    id: ${c.id}`);
      console.log(`    escopos: ${c.escopos.join(", ")}\n`);
    }
  }

  await fim();
}

principal().catch((erro) => {
  console.error(erro);
  process.exit(1);
});

import { sql } from "drizzle-orm";
import {
  boolean,
  pgPolicy,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { anfitriaoId, colunasBase, politicaAnfitriao } from "@/db/comum";
import { PAPEL_APP } from "@/db/rls";
import { anfitriao, perfil } from "@/modules/anfitriao/schema";

import { user } from "./schema";

/** Parâmetro de sessão que carrega o usuário autenticado da requisição. */
export const PARAMETRO_USUARIO = "app.usuario_id";

/**
 * Liga um usuário autenticado a um anfitrião e a um perfil.
 *
 * É a ponte entre as duas metades do sistema. As tabelas do Better Auth são
 * globais por necessidade — o login precisa achar a pessoa pelo e-mail antes
 * de existir qualquer contexto de anfitrião. Daqui para dentro, tudo é
 * isolado: esta tabela tem `anfitriao_id` e RLS como qualquer outra.
 *
 * Separar as duas coisas também é o que deixa o marketplace possível sem
 * reescrita: a mesma pessoa poderá ser membro de mais de um anfitrião, com
 * perfis diferentes em cada um, sem duplicar conta nem senha.
 */
export const membro = pgTable(
  "membro",
  {
    ...colunasBase,
    anfitriaoId: anfitriaoId().references(() => anfitriao.id),
    usuarioId: text("usuario_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    perfilId: uuid("perfil_id")
      .notNull()
      .references(() => perfil.id),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    uniqueIndex("membro_unico").on(t.anfitriaoId, t.usuarioId),
    politicaAnfitriao("membro_isolamento"),

    /**
     * A política que resolve o ovo e a galinha do login.
     *
     * Para definir o contexto do anfitrião é preciso saber de qual anfitrião o
     * usuário é — e isso está nesta tabela, que é isolada por anfitrião. Sem
     * uma saída, a leitura devolveria zero linhas e ninguém entraria.
     *
     * A saída é um segundo contexto, por usuário: a aplicação define
     * `app.usuario_id` (que vem da sessão assinada pelo Better Auth, não de
     * nada que o cliente envie) e lê APENAS as linhas daquele usuário.
     * Descoberto o anfitrião, o resto da requisição segue no contexto normal.
     *
     * Políticas permissivas se somam, então esta não afrouxa a outra: só
     * acrescenta "ou as suas próprias linhas", e apenas para leitura.
     */
    pgPolicy("membro_do_usuario", {
      as: "permissive",
      for: "select",
      to: PAPEL_APP,
      using: sql`usuario_id = nullif(current_setting('app.usuario_id', true), '')`,
    }),
  ],
);

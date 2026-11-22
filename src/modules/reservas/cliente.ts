/**
 * A segunda porta do módulo: o que pode atravessar para o navegador.
 *
 * O índice (`@/modules/reservas`) exporta também o serviço, que importa o
 * cliente do banco. Um componente de cliente que importe dali arrasta o
 * driver do Postgres para o pacote do navegador — o `next build` recusa, e com
 * razão: seria código de servidor viajando até o celular do hóspede.
 *
 * Aqui só sai o que é puro e sem dependência nenhuma: a máquina de status e os
 * rótulos. Nada que toque banco, sessão ou variável de ambiente entra neste
 * arquivo. É uma regra fácil de verificar — se precisar de `import`, não é
 * para cá.
 */
export {
  ACAO_PARA,
  ROTULO_STATUS,
  TODOS_OS_STATUS,
  type StatusReserva,
  destinosDe,
  ehFinal,
  podeIrPara,
  seguraNoites,
  vencida,
} from "./status";

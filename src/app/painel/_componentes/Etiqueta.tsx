import { ROTULO_STATUS, type StatusReserva } from "@/modules/reservas/cliente";

/**
 * As cores dos status.
 *
 * A cor não é o único sinal: o texto está sempre escrito ao lado. Quem não
 * distingue vermelho de verde — e é cerca de um homem em doze — não pode
 * depender da cor para saber se a reserva está confirmada ou cancelada.
 */
const COR: Record<StatusReserva, string> = {
  pre_reserva: "bg-dourado/25 text-tinta",
  aguardando_aprovacao: "bg-vinho/10 text-vinho",
  confirmada: "bg-mata/10 text-mata",
  hospedado: "bg-mata/20 text-mata",
  concluida: "bg-creme-fundo text-tinta-suave",
  cancelada: "bg-creme-fundo text-tinta-suave line-through",
  no_show: "bg-creme-fundo text-tinta-suave",
};

export function Etiqueta({ status }: { status: StatusReserva }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${COR[status]}`}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}

const ROTULO_FNRH: Record<string, string> = {
  nao_enviada: "FNRH não enviada",
  link_enviado: "FNRH enviada",
  preenchida: "FNRH preenchida",
  conferida: "FNRH conferida",
};

export function EtiquetaFnrh({ status }: { status: string }) {
  const pendente = status === "nao_enviada" || status === "link_enviado";
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-3 py-1 text-xs whitespace-nowrap ${
        pendente ? "bg-dourado/25 text-tinta" : "bg-mata/10 text-mata"
      }`}
    >
      {ROTULO_FNRH[status] ?? status}
    </span>
  );
}

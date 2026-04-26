// Spanish strings + America/Puerto_Rico date helpers for Chamón.
const TZ = "America/Puerto_Rico";

export function todayInPR(): string {
  // Returns YYYY-MM-DD in Puerto Rico timezone (UTC-4, no DST).
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA gives "YYYY-MM-DD"
}

export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date(todayInPR() + "T00:00:00");
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function dueLabelEs(iso: string | null | undefined): string {
  const n = daysFromToday(iso);
  if (n === null) return "sin fecha";
  if (n < 0) return `vencida hace ${Math.abs(n)} día${Math.abs(n) === 1 ? "" : "s"}`;
  if (n === 0) return "vence hoy";
  if (n === 1) return "vence mañana";
  return `vence en ${n} días`;
}

export function priorityEs(p: string): string {
  return ({ low: "baja", mid: "media", high: "alta" } as Record<string, string>)[p] ?? p;
}

export function statusEs(s: string): string {
  return ({
    todo: "pendiente",
    doing: "en curso",
    waiting: "esperando",
    done: "hecha",
    active: "activa",
    paused: "pausada",
    completed: "completada",
    archived: "archivada",
  } as Record<string, string>)[s] ?? s;
}

export const MSG = {
  unauthorized: "Firma inválida o ausente.",
  badRequest: "Solicitud mal formada.",
  unknownIntent: "No reconozco ese tipo de consulta.",
  notFound: "No encontré nada con esos criterios.",
  internal: "Algo falló por dentro. Inténtalo de nuevo.",
  noUser: "Usuario no configurado.",
  empty: {
    today_focus: "Hoy no tienes nada en foco. Marca tareas con 'is_today' para concentrarte.",
    missions_overview: "No hay misiones activas todavía.",
    what_needs_attention: "Nada urgente ahora. Buen trabajo.",
    overdue: "No tienes tareas vencidas.",
    search: "No encontré coincidencias para esa búsqueda.",
  },
};

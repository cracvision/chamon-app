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

// Status phrasing used in WRITE-tool confirmation messages (Sprint 2).
// Distinct from `statusEs` so we don't change existing query phrasing
// ("doing" → "en curso") that Carlos already hears today.
export function statusEsWrite(s: string): string {
  return ({
    todo: "pendiente",
    doing: "en progreso",
    waiting: "esperando",
    done: "completada",
  } as Record<string, string>)[s] ?? s;
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * Format a YYYY-MM-DD date for voice output.
 *   today    → "hoy"
 *   tomorrow → "mañana"
 *   else     → "el viernes 30 de abril"
 */
export function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return "sin fecha";
  const n = daysFromToday(iso);
  if (n === 0) return "hoy";
  if (n === 1) return "mañana";
  const d = new Date(iso + "T00:00:00");
  return `el ${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}`;
}

/**
 * Validates that a YYYY-MM-DD string is a real calendar date (not just regex-shaped).
 * Catches: month >12, day >31, impossible days like Feb 31 / Apr 31 / non-leap Feb 29.
 */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Round to whole dollars for voice. 87.5 → "$88". */
export function formatDollars(n: number): string {
  return `$${Math.round(n)}`;
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

/**
 * Coerce a possibly-stringified number to number. Returns null if it can't
 * be converted (e.g. "abc"). Used because ElevenLabs serializes everything
 * as string in tool calls.
 */
export function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

/**
 * Translate a Zod issue into a voice-friendly Spanish message. The agent
 * reads this aloud to the user, so the wording prompts a corrective answer.
 */
// deno-lint-ignore no-explicit-any
export function voiceErrorMessage(issues: any[]): string {
  const first = issues?.[0];
  const path = first?.path?.[0];
  const msg = first?.message ?? "";

  if (path === "mission_id") {
    return "No tengo claro en qué mission va esto. ¿Me dices el nombre?";
  }
  if (path === "task_id") {
    return "No identifiqué cuál tarea. ¿Cuál era?";
  }
  if (path === "area_id") {
    return "No tengo el área. ¿En qué área la creo?";
  }
  if (path === "title") {
    return "Me falta el título. ¿Cómo se llama?";
  }
  if (path === "due_date" || msg === "fecha_invalida") {
    return "La fecha que pasaste no es válida. Pásamela como año-mes-día, por ejemplo 2026-05-15, o sin fecha.";
  }
  if (path === "priority") {
    return "La prioridad debe ser baja, media o alta.";
  }
  if (path === "friction_level") {
    return "El nivel de fricción debe ser 1, 2 o 3.";
  }
  if (path === "cost_of_inaction_weekly") {
    return "El costo semanal de inacción debe ser un número entre 0 y 10000.";
  }
  if (path === "is_today") {
    return "El campo is_today debe ser true o false.";
  }
  if (typeof path === "string" && path.length > 0) {
    return `Falta o es inválido el campo "${path}" (${msg}).`;
  }
  return "No pude leer la solicitud. Revisá los datos e intentá de nuevo.";
}

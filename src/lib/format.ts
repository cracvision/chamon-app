export function formatMoney(n: number): string {
  if (!n) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(iso + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function dueLabel(iso: string | null | undefined, t: (k: any, v?: any) => string): string {
  const n = daysFromToday(iso);
  if (n === null) return t("due.none");
  if (n < 0) return t("due.overdue");
  if (n === 0) return t("due.today");
  if (n === 1) return t("due.tomorrow");
  return t("due.inDays", { n });
}

export type Health = "ok" | "warn" | "crit";

export function computeHealth(
  mission: { health: string | null; due_date: string | null },
  tasks: { due_date: string | null; status: string }[]
): Health {
  if (mission.health) return mission.health as Health;
  const openTasks = tasks.filter(t => t.status !== "done");
  for (const tk of openTasks) {
    const d = daysFromToday(tk.due_date);
    if (d !== null && d < 0) return "crit";
  }
  const md = daysFromToday(mission.due_date);
  if (md !== null && md <= 3) return "crit";
  for (const tk of openTasks) {
    const d = daysFromToday(tk.due_date);
    if (d !== null && d <= 7) return "warn";
  }
  return "ok";
}

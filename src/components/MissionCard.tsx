import type { Mission, Task } from "@/lib/queries";
import { computeHealth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Trophy } from "lucide-react";

interface Props { mission: Mission; tasks: Task[]; index: number; selected?: boolean; onSelect?: () => void }

const healthMap = {
  ok:   { color: "text-success", bg: "bg-success/10",     label: "mission.health.ok" as const },
  warn: { color: "text-warn",    bg: "bg-warn/10",        label: "mission.health.warn" as const },
  crit: { color: "text-destructive", bg: "bg-destructive/10", label: "mission.health.crit" as const },
};

export function MissionCard({ mission, tasks, index, selected, onSelect }: Props) {
  const { t } = useI18n();
  const myTasks = tasks.filter(tk => tk.mission_id === mission.id);
  const open = myTasks.filter(tk => tk.status !== "done").length;
  const total = myTasks.length;
  const pct = total ? Math.round(((total - open) / total) * 100) : 0;
  const completed = total > 0 && open === 0;
  const health = computeHealth(mission, myTasks);
  const h = healthMap[health];
  const code = mission.code || String(index + 1).padStart(2, "0");

  return (
    <button onClick={onSelect}
      className={`group relative flex flex-col gap-3 rounded-[10px] border p-4 text-left transition-all ${
        selected ? "border-accent bg-card-elevated" : "border-border bg-card hover:bg-card-elevated"
      }`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-foreground">M-{code}</span>
        {!completed && (
          <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${h.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full bg-current ${health === "crit" ? "animate-pulse" : ""}`} />
            {t(h.label)}
          </span>
        )}
      </div>

      <div className="min-h-[40px]">
        <h3 className="text-[14px] font-medium leading-snug text-foreground">{mission.title}</h3>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-1 w-full overflow-hidden rounded-full bg-card-elevated">
          <div
            className={`h-full rounded-full transition-all ${completed ? "bg-success" : "bg-accent"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] text-muted-foreground">
          {completed ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Trophy className="h-3 w-3 text-accent" />
              {t("mission.accomplished")} · 100%
            </span>
          ) : (
            <span>{open} {t("mission.openCount")} · {pct}%</span>
          )}
        </div>
      </div>
    </button>
  );
}

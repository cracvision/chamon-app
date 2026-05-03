import { createFileRoute } from "@tanstack/react-router";
import { useUserStats, useAchievements, useXpEvents, useTasks } from "@/lib/queries";
import { Trophy, Flame, Target, ListTodo, Zap } from "lucide-react";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/achievements")({
  component: AchievementsPage,
});

const LEVEL_THRESHOLDS = [0, 501, 1501, 4001, 10001];

function AchievementsPage() {
  const { data: stats } = useUserStats();
  const { data: ach } = useAchievements();
  const { data: events = [] } = useXpEvents(50);
  const { data: tasks = [] } = useTasks();

  const xp = stats?.total_xp ?? 0;
  const lvl = stats?.current_level ?? 1;
  const cur = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const nxt = LEVEL_THRESHOLDS[lvl] ?? cur;
  const pct = lvl >= 5 ? 100 : Math.min(100, Math.round(((xp - cur) / (nxt - cur)) * 100));

  // Heatmap (last 90 days)
  const heatmap = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.completed_at) continue;
      const d = new Date(t.completed_at).toISOString().slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    const days: { date: string; count: number }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, count: map.get(iso) ?? 0 });
    }
    return days;
  }, [tasks]);

  return (
    <div className="px-4 py-5 lg:px-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Logros</h1>
      <p className="mb-5 text-xs text-muted-foreground">Tu progreso, trofeos y racha</p>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Trophy} label="Nivel" value={stats?.level_name || "Recluta"} hint={`Lv ${lvl}`} />
        <StatCard icon={Zap} label="XP Total" value={String(xp)} hint={lvl >= 5 ? "MAX" : `${nxt - xp} al siguiente`} />
        <StatCard icon={Flame} label="Racha actual" value={`${stats?.current_streak ?? 0} días`} hint={`máx ${stats?.longest_streak ?? 0}`} />
        <StatCard icon={ListTodo} label="Tareas" value={String(stats?.tasks_completed_total ?? 0)} hint="completadas" />
        <StatCard icon={Target} label="Misiones" value={String(stats?.missions_completed_total ?? 0)} hint="completadas" />
      </div>

      {/* Level progress bar */}
      <section className="surface mb-5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-mono">Progreso al siguiente nivel</p>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-card-elevated">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Trophies grid */}
      <section className="surface mb-5 p-4">
        <p className="label-mono mb-3">Trofeos</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {(ach?.catalog ?? []).map(a => {
            const u = ach?.unlocked.find(x => x.achievement_id === a.id);
            const unlocked = !!u?.unlocked_at;
            const progress = u?.progress ?? 0;
            const pctP = Math.min(100, Math.round((progress / a.criteria_value) * 100));
            return (
              <div
                key={a.id}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center transition-all ${
                  unlocked
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card-elevated opacity-60 grayscale"
                }`}
              >
                <div className="text-3xl">{a.icon}</div>
                <p className="text-[12px] font-medium leading-tight">{a.name}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">{a.description}</p>
                {unlocked ? (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-accent">Desbloqueado</span>
                ) : (
                  <div className="w-full">
                    <div className="h-1 overflow-hidden rounded-full bg-card">
                      <div className="h-full bg-muted-foreground" style={{ width: `${pctP}%` }} />
                    </div>
                    <p className="mt-1 font-mono text-[9px] tabular-nums text-muted-foreground">
                      {progress}/{a.criteria_value}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Heatmap */}
      <section className="surface mb-5 p-4">
        <p className="label-mono mb-3">Actividad (90 días)</p>
        <div className="flex flex-wrap gap-[3px]">
          {heatmap.map(d => {
            const intensity = d.count === 0 ? 0 : Math.min(4, d.count);
            const bg = ["bg-card-elevated", "bg-accent/20", "bg-accent/40", "bg-accent/70", "bg-accent"][intensity];
            return (
              <div
                key={d.date}
                title={`${d.date} · ${d.count} tareas`}
                className={`h-3 w-3 rounded-sm ${bg}`}
              />
            );
          })}
        </div>
      </section>

      {/* Recent XP events */}
      <section className="surface p-4">
        <p className="label-mono mb-3">Actividad reciente</p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no tienes XP. Completa una tarea para arrancar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events.map(ev => (
              <li key={ev.id} className="flex items-center justify-between rounded-md border border-border bg-card-elevated px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs">{labelFor(ev.reason)}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString("es-PR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                <span className={`font-mono text-xs tabular-nums ${ev.delta > 0 ? "text-success" : "text-destructive"}`}>
                  {ev.delta > 0 ? "+" : ""}{ev.delta} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function labelFor(reason: string): string {
  switch (reason) {
    case "task_completed": return "Tarea completada";
    case "mission_completed": return "Misión completada";
    case "achievement_unlocked": return "Trofeo desbloqueado";
    default: return reason;
  }
}

function StatCard({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint?: string }) {
  return (
    <div className="surface flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-card-elevated">
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <div className="min-w-0">
        <p className="label-mono">{label}</p>
        <p className="font-mono text-base leading-tight tabular-nums text-foreground">{value}</p>
        {hint && <p className="font-mono text-[10px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

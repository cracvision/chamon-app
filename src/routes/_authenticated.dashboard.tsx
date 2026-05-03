import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useMissions, useTasks, useAreas } from "@/lib/queries";
import { formatMoney } from "@/lib/format";
import { MissionCard } from "@/components/MissionCard";
import { FocusTaskCard } from "@/components/FocusTaskCard";
import { MissionDetail, MissionDangerZone } from "@/components/MissionDetail";
import { useI18n } from "@/lib/i18n";
import { formatMoney, dueLabel, daysFromToday } from "@/lib/format";
import { Target, ListTodo, Flame, TrendingUp, Sun } from "lucide-react";
import { useUserStats } from "@/lib/queries";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { t } = useI18n();
  const { data: missions = [], isLoading: ml } = useMissions();
  const { data: tasks = [], isLoading: tl } = useTasks();
  const { data: areas = [] } = useAreas();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeMissions = missions.filter(m => m.status === "active");

  useEffect(() => {
    if (!selectedId && activeMissions.length) setSelectedId(activeMissions[0].id);
  }, [activeMissions, selectedId]);

  const todayTasks = tasks.filter(tk => tk.is_today && tk.status !== "done");
  const openCount = tasks.filter(tk => tk.status !== "done").length;
  const coiTotal = activeMissions.reduce((s, m) => s + Number(m.cost_of_inaction_weekly || 0), 0);
  const last7 = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return tasks.filter(tk => tk.completed_at && new Date(tk.completed_at).getTime() >= cutoff).length;
  }, [tasks]);

  const upcoming = useMemo(() => {
    return tasks
      .filter(tk => tk.status !== "done" && tk.due_date)
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
      .slice(0, 6);
  }, [tasks]);

  const selected = activeMissions.find(m => m.id === selectedId);

  return (
    <div className="px-4 py-5 lg:px-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Target} label={t("kpi.activeMissions")} value={String(activeMissions.length)} />
        <Kpi icon={ListTodo} label={t("kpi.openTasks")} value={String(openCount)} />
        <Kpi icon={AlertTriangle} label={t("kpi.coi")} value={formatMoney(coiTotal)} hint={t("kpi.perWeek")} danger={coiTotal > 0} />
        <Kpi icon={TrendingUp} label={t("kpi.momentum")} value={String(last7)} hint="completed" />
      </div>

      {/* Two-column */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">
          {/* Today focus */}
          <section className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-accent" />
                <p className="label-mono">{t("section.todayFocus")}</p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{todayTasks.length}</span>
            </div>
            {todayTasks.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card-elevated px-3 py-6 text-center text-xs text-muted-foreground">{t("today.empty")}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {todayTasks.map(tk => <FocusTaskCard key={tk.id} task={tk} mission={missions.find(m => m.id === tk.mission_id)} />)}
              </div>
            )}
          </section>

          {/* Active missions grid */}
          <section className="surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="label-mono">{t("section.activeMissions")}</p>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{activeMissions.length}</span>
            </div>
            {ml || tl ? (
              <p className="text-xs text-muted-foreground">{t("loading")}</p>
            ) : activeMissions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-card-elevated px-3 py-8 text-center text-xs text-muted-foreground">{t("mission.empty")}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeMissions.map((m, i) => (
                  <MissionCard key={m.id} mission={m} tasks={tasks} index={i} selected={selectedId === m.id} onSelect={() => setSelectedId(m.id)} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <section className="surface p-4">
            <p className="label-mono mb-3">{t("section.detail")}</p>
            {selected ? (
              <MissionDetail mission={selected} tasks={tasks} areas={areas} />
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
          </section>

          <section className="surface p-4">
            <p className="label-mono mb-3">{t("section.upcoming")}</p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {upcoming.map(tk => {
                  const m = missions.find(mm => mm.id === tk.mission_id);
                  const days = daysFromToday(tk.due_date);
                  const overdue = days !== null && days < 0;
                  return (
                    <li key={tk.id} className="flex items-center justify-between rounded-md border border-border bg-card-elevated px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-foreground">{tk.title}</p>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m?.title || "—"}</p>
                      </div>
                      <span className={`font-mono text-[10px] uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground"}`}>{dueLabel(tk.due_date, t)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selected && <MissionDangerZone missionId={selected.id} />}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint, danger }: { icon: any; label: string; value: string; hint?: string; danger?: boolean }) {
  return (
    <div className="surface flex items-center gap-3 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-card-elevated">
        <Icon className={`h-4 w-4 ${danger ? "text-destructive" : "text-accent"}`} />
      </div>
      <div className="min-w-0">
        <p className="label-mono">{label}</p>
        <p className={`font-mono text-lg leading-tight tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>
          {value}{hint && <span className="ml-1 text-[10px] text-muted-foreground">{hint}</span>}
        </p>
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useUserStats, useAchievements, useXpEvents, useTasks } from "@/lib/queries";
import { Trophy, Flame, Target, ListTodo, Zap } from "lucide-react";
import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/achievements")({
  component: AchievementsPage,
});

const LEVEL_THRESHOLDS = [0, 501, 1501, 4001, 10001];

function AchievementsPage() {
  const { t, lang } = useI18n();
  const { data: stats } = useUserStats();
  const { data: ach } = useAchievements();
  const { data: events = [] } = useXpEvents(50);
  const { data: tasks = [] } = useTasks();

  const xp = stats?.total_xp ?? 0;
  const lvl = stats?.current_level ?? 1;
  const cur = LEVEL_THRESHOLDS[lvl - 1] ?? 0;
  const nxt = LEVEL_THRESHOLDS[lvl] ?? cur;
  const pct = lvl >= 5 ? 100 : Math.min(100, Math.round(((xp - cur) / (nxt - cur)) * 100));

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

  const locale = lang === "es" ? "es-PR" : "en-US";
  const levelName = stats?.level_name || t("ach.recruit");

  return (
    <div className="px-4 py-5 lg:px-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t("ach.title")}</h1>
      <p className="mb-5 text-xs text-muted-foreground">{t("ach.subtitle")}</p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Trophy} label={t("ach.level")} value={levelName} hint={t("ach.levelShort", { n: lvl })} />
        <StatCard icon={Zap} label={t("ach.xpTotal")} value={String(xp)} hint={lvl >= 5 ? t("ach.xpMax") : t("ach.xpToNext", { n: nxt - xp })} />
        <StatCard icon={Flame} label={t("ach.streakCurrent")} value={t("ach.streakDays", { n: stats?.current_streak ?? 0 })} hint={t("ach.streakMax", { n: stats?.longest_streak ?? 0 })} />
        <StatCard icon={ListTodo} label={t("ach.tasks")} value={String(stats?.tasks_completed_total ?? 0)} hint={t("ach.completed")} />
        <StatCard icon={Target} label={t("ach.missions")} value={String(stats?.missions_completed_total ?? 0)} hint={t("ach.completed")} />
      </div>

      <section className="surface mb-5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-mono">{t("ach.progressNext")}</p>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-card-elevated">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="surface mb-5 p-4">
        <p className="label-mono mb-3">{t("ach.trophies")}</p>
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
                <p className="text-[12px] font-medium leading-tight">{trophyText(a.id, lang).name ?? a.name}</p>
                <p className="text-[10px] leading-tight text-muted-foreground">{trophyText(a.id, lang).description ?? a.description}</p>
                {unlocked ? (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-accent">{t("ach.unlocked")}</span>
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

      <section className="surface mb-5 p-4">
        <p className="label-mono mb-3">{t("ach.activity")}</p>
        <div className="flex flex-wrap gap-[3px]">
          {heatmap.map(d => {
            const intensity = d.count === 0 ? 0 : Math.min(4, d.count);
            const bg = ["bg-card-elevated", "bg-accent/20", "bg-accent/40", "bg-accent/70", "bg-accent"][intensity];
            return (
              <div
                key={d.date}
                title={t("ach.heatmapTitle", { date: d.date, n: d.count })}
                className={`h-3 w-3 rounded-sm ${bg}`}
              />
            );
          })}
        </div>
      </section>

      <section className="surface p-4">
        <p className="label-mono mb-3">{t("ach.recent")}</p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("ach.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {events.map(ev => (
              <li key={ev.id} className="flex items-center justify-between rounded-md border border-border bg-card-elevated px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs">{labelFor(ev.reason, t)}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(ev.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
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

function labelFor(reason: string, t: ReturnType<typeof useI18n>["t"]): string {
  switch (reason) {
    case "task_completed": return t("ach.reason.task_completed");
    case "mission_completed": return t("ach.reason.mission_completed");
    case "achievement_unlocked": return t("ach.reason.achievement_unlocked");
    default: return reason;
  }
}

const TROPHY_I18N: Record<string, { en: { name: string; description: string } }> = {
  first_step:       { en: { name: "First Step",        description: "Complete your first task" } },
  ten_chest:        { en: { name: "Ten in the Chest",  description: "Complete 10 tasks" } },
  centurion:        { en: { name: "Centurion",         description: "Complete 100 tasks" } },
  mission_done:     { en: { name: "Mission Accomplished", description: "Complete your first mission" } },
  commander:        { en: { name: "Commander",         description: "Complete 5 missions" } },
  streak_3:         { en: { name: "Three in a Row",    description: "3-day streak" } },
  streak_7:         { en: { name: "Unstoppable 7",     description: "7-day streak" } },
  streak_30:        { en: { name: "Unstoppable 30",    description: "30-day streak" } },
  xp_500:           { en: { name: "Operator",          description: "Earn 500 XP" } },
  xp_1500:          { en: { name: "XP Commander",      description: "Earn 1500 XP" } },
  xp_5000:          { en: { name: "Strategist",        description: "Earn 5000 XP" } },
  early_bird_10:    { en: { name: "Early Bird",        description: "Complete 10 tasks before 9am" } },
  resurrection:     { en: { name: "Resurrection",      description: "Complete a task overdue by more than 7 days" } },
  legendary:        { en: { name: "Legendary Chamón",  description: "Earn 10,000 XP" } },
  overdue_killer_3: { en: { name: "Debt Hunter",       description: "Earn 3 resurrections" } },
};

function trophyText(id: string, lang: string): { name?: string; description?: string } {
  if (lang === "en" && TROPHY_I18N[id]) return TROPHY_I18N[id].en;
  return {};
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

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMissions, useTasks, useAreas, useUpdateTask } from "@/lib/queries";
import { useI18n } from "@/lib/i18n";
import { dueLabel, daysFromToday } from "@/lib/format";
import { Sun, ArrowLeft, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/today")({
  component: TodayPage,
});

function TodayPage() {
  const { t } = useI18n();
  const { data: tasks = [] } = useTasks();
  const { data: missions = [] } = useMissions();
  const update = useUpdateTask();

  const todayTasks = tasks.filter(tk => tk.is_today && tk.status !== "done");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:px-6">
      <div className="mb-6 flex items-center gap-2">
        <Sun className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-semibold tracking-tight">{t("section.todayFocus")}</h1>
      </div>

      {todayTasks.length === 0 ? (
        <div className="surface flex flex-col items-center gap-3 p-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("today.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {todayTasks.map(tk => {
            const m = missions.find(mm => mm.id === tk.mission_id);
            const days = daysFromToday(tk.due_date);
            const overdue = days !== null && days < 0;
            return (
              <li key={tk.id} className="surface flex items-start gap-3 p-4">
                <input type="checkbox"
                  onChange={e => update.mutate({ id: tk.id, patch: { status: e.target.checked ? "done" : "todo" } })}
                  className="mt-1 h-5 w-5 cursor-pointer accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-base text-foreground">{tk.title}</p>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {m && <Link to="/missions/$id" params={{ id: m.id }} className="text-info hover:underline">{m.title}</Link>}
                    <span>·</span>
                    <span className={overdue ? "text-destructive" : ""}>{dueLabel(tk.due_date, t)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

import type { Task, Mission } from "@/lib/queries";
import { useUpdateTask } from "@/lib/queries";
import { useI18n } from "@/lib/i18n";
import { dueLabel, daysFromToday } from "@/lib/format";
import { Sun, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface Props { task: Task; mission?: Mission }

const priorityBorder = {
  high: "border-l-destructive",
  mid:  "border-l-accent",
  low:  "border-l-info",
} as const;

export function FocusTaskCard({ task, mission }: Props) {
  const { t } = useI18n();
  const update = useUpdateTask();
  const days = daysFromToday(task.due_date);
  const overdue = days !== null && days < 0 && task.status !== "done";

  return (
    <div className={`flex items-start gap-3 rounded-md border border-border border-l-2 bg-card-elevated px-3 py-2.5 ${
      mission ? priorityBorder[mission.priority as keyof typeof priorityBorder] : "border-l-border"
    }`}>
      <input type="checkbox"
        checked={task.status === "done"}
        onChange={e => update.mutate({ id: task.id, patch: { status: e.target.checked ? "done" : "todo" } })}
        className="mt-1 h-4 w-4 cursor-pointer accent-[var(--accent)]"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm leading-snug ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </p>
        <div className="mt-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {mission && (
            <Link to="/missions/$id" params={{ id: mission.id }} className="text-info hover:underline">
              {mission.title}
            </Link>
          )}
          <span>·</span>
          <span className={overdue ? "text-destructive" : ""}>{dueLabel(task.due_date, t)}</span>
          <span>·</span>
          <FrictionBars n={task.friction_level} />
        </div>
      </div>
      <button onClick={() => update.mutate({ id: task.id, patch: { is_today: false } })}
        title={t("task.unmarkToday")}
        className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground">
        <Sun className="h-4 w-4" />
      </button>
      {mission && (
        <Link to="/missions/$id" params={{ id: mission.id }} className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground">
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function FrictionBars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-end gap-0.5">
      {[1, 2, 3].map(i => (
        <span key={i}
          className={`block w-0.5 ${i === 1 ? "h-1.5" : i === 2 ? "h-2" : "h-2.5"} ${
            i <= n ? "bg-accent" : "bg-border"
          }`}
        />
      ))}
    </span>
  );
}

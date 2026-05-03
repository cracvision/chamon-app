import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useUpdateMission, useUpdateTask, useCreateTask, useSoftDeleteMission, useSoftDeleteTask, type Mission, type Task, type Area } from "@/lib/queries";
import { dueLabel, daysFromToday, formatMoney, computeHealth } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ArrowUpRight, Trash2, Plus, Sun, Info } from "lucide-react";
import { toast } from "sonner";
import { AttachmentsList } from "./AttachmentsList";

interface Props { mission: Mission; tasks: Task[]; areas: Area[] }

export function MissionDetail({ mission, tasks, areas }: Props) {
  const { t } = useI18n();
  const updateMission = useUpdateMission();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteMission = useSoftDeleteMission();
  const deleteTask = useSoftDeleteTask();

  const myTasks = tasks.filter(tk => tk.mission_id === mission.id);
  const open = myTasks.filter(tk => tk.status !== "done").length;
  const total = myTasks.length;
  const pct = total ? Math.round(((total - open) / total) * 100) : 0;
  const health = computeHealth(mission, myTasks);
  const area = areas.find(a => a.id === mission.area_id);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    await createTask.mutateAsync({ mission_id: mission.id, title: newTaskTitle.trim(), due_date: newTaskDue || null } as any);
    setNewTaskTitle(""); setNewTaskDue("");
  };

  const patchMission = (patch: Partial<Mission>) => updateMission.mutate({ id: mission.id, patch });

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>M-{mission.code || mission.id.slice(0, 4)}</span>
          {area && <><span>·</span><span style={{ color: area.color || undefined }}>{area.name}</span></>}
          <span>·</span>
          <HealthChip health={health} />
        </div>
        <input
          defaultValue={mission.title}
          onBlur={e => e.target.value !== mission.title && patchMission({ title: e.target.value })}
          className="border-0 bg-transparent p-0 text-xl font-semibold tracking-tight outline-none focus:ring-0"
        />
        <Link to="/missions/$id" params={{ id: mission.id }} className="inline-flex w-fit items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-accent">
          open full view <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1">
        <label className="label-mono">{t("mission.description")}</label>
        <Textarea
          defaultValue={mission.description || ""}
          onBlur={e => e.target.value !== (mission.description || "") && patchMission({ description: e.target.value || null })}
          rows={2}
          placeholder="—"
          className="border-border bg-card-elevated text-sm"
        />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("section.tasks")} value={`${total - open}/${total}`} hint={`${pct}%`} />
        <Stat label={t("mission.dueDate")} value={mission.due_date ? dueLabel(mission.due_date, t) : "—"} hint={mission.due_date || ""} />
        <Stat
          label={t("kpi.coi")}
          value={formatMoney(Number(mission.cost_of_inaction_weekly))}
          hint={t("kpi.perWeek").replace("/", "")}
          danger={Number(mission.cost_of_inaction_weekly) > 50}
          tooltip={t("mission.coi.tooltip")}
        />
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-2 gap-3">
        <FieldInline label={t("mission.area")}>
          <Select value={mission.area_id || "_none"} onValueChange={v => patchMission({ area_id: v === "_none" ? null : v })}>
            <SelectTrigger className="h-9 border-border bg-card-elevated"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">{t("noArea")}</SelectItem>
              {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FieldInline>
        <FieldInline label={t("mission.priority")}>
          <Select value={mission.priority} onValueChange={v => patchMission({ priority: v as any })}>
            <SelectTrigger className="h-9 border-border bg-card-elevated"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("mission.priority.low")}</SelectItem>
              <SelectItem value="mid">{t("mission.priority.mid")}</SelectItem>
              <SelectItem value="high">{t("mission.priority.high")}</SelectItem>
            </SelectContent>
          </Select>
        </FieldInline>
        <FieldInline label={t("mission.dueDate")}>
          <Input type="date" defaultValue={mission.due_date || ""}
            onBlur={e => patchMission({ due_date: e.target.value || null })}
            className="h-9 border-border bg-card-elevated font-mono" />
        </FieldInline>
        <FieldInline label={t("mission.coi")}>
          <Input type="number" min="0" step="1" defaultValue={String(mission.cost_of_inaction_weekly)}
            onBlur={e => patchMission({ cost_of_inaction_weekly: Number(e.target.value) || 0 })}
            className="h-9 border-border bg-card-elevated font-mono" />
        </FieldInline>
      </div>

      <FieldInline label={t("mission.reward")}>
        <Input defaultValue={mission.reward_text || ""}
          onBlur={e => patchMission({ reward_text: e.target.value || null })}
          placeholder="—"
          className="h-9 border-border bg-card-elevated" />
      </FieldInline>

      {/* Tasks */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="label-mono">{t("section.tasks")} · {total}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          {myTasks.length === 0 && <p className="rounded-md border border-dashed border-border bg-card-elevated px-3 py-3 text-xs text-muted-foreground">{t("task.empty")}</p>}
          {myTasks.map(tk => (
            <TaskRow key={tk.id} task={tk} onUpdate={(p) => updateTask.mutate({ id: tk.id, patch: p })} onDelete={() => deleteTask.mutate(tk.id)} />
          ))}
        </div>

        <form onSubmit={addTask} className="mt-1 flex items-center gap-2 rounded-md border border-border bg-card-elevated p-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("task.new") + "…"} value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} className="h-8 border-0 bg-transparent text-sm focus-visible:ring-0" />
          <Input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} className="h-8 w-36 border-border bg-card font-mono text-xs" />
          <Button type="submit" size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90">{t("create")}</Button>
        </form>
      </div>

      {/* Mission-level attachments */}
      <div className="flex flex-col gap-2">
        <p className="label-mono">{t("section.attachments")} · mission</p>
        <AttachmentsList missionId={mission.id} />
      </div>

    </div>
  );
}

export function MissionDangerZone({ missionId }: { missionId: string }) {
  const { t } = useI18n();
  const deleteMission = useSoftDeleteMission();
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <p className="label-mono mb-1 text-destructive">zona peligrosa</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Esta acción elimina la misión completa, incluyendo sus tareas y adjuntos.
      </p>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          if (confirm("¿Borrar esta misión? Esta acción no se puede deshacer.")) {
            deleteMission.mutate(missionId);
            toast.success(t("deleted"));
          }
        }}
        className="h-9 w-full justify-center border border-destructive/40 text-xs font-semibold uppercase tracking-wider text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        <Trash2 className="mr-2 h-4 w-4" />Borrar misión
      </Button>
    </div>
  );
}

function HealthChip({ health }: { health: "ok"|"warn"|"crit" }) {
  const { t } = useI18n();
  const map = { ok: "text-success", warn: "text-warn", crit: "text-destructive" } as const;
  const label = { ok: "mission.health.ok", warn: "mission.health.warn", crit: "mission.health.crit" } as const;
  return <span className={`inline-flex items-center gap-1 ${map[health]}`}>
    <span className={`h-1.5 w-1.5 rounded-full bg-current ${health === "crit" ? "animate-pulse" : ""}`} />
    {t(label[health] as any)}
  </span>;
}

function Stat({ label, value, hint, danger, tooltip }: { label: string; value: string; hint?: string; danger?: boolean; tooltip?: string }) {
  return (
    <div className="rounded-md border border-border bg-card-elevated p-2.5">
      <div className="flex items-center gap-1">
        <p className="label-mono">{label}</p>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 cursor-help text-muted-foreground" /></TooltipTrigger>
            <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <p className={`mt-0.5 font-mono text-base tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value}</p>
      {hint && <p className="font-mono text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FieldInline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="label-mono">{label}</label>
      {children}
    </div>
  );
}

function TaskRow({ task, onUpdate, onDelete }: { task: Task; onUpdate: (p: Partial<Task>) => void; onDelete: () => void }) {
  const { t } = useI18n();
  const days = daysFromToday(task.due_date);
  const overdue = days !== null && days < 0 && task.status !== "done";

  return (
    <details className="group rounded-md border border-border bg-card-elevated">
      <summary className="flex cursor-pointer items-center gap-2 px-2.5 py-2 list-none">
        <input type="checkbox" checked={task.status === "done"}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ status: e.target.checked ? "done" : "todo" })}
          className="h-4 w-4 cursor-pointer accent-[var(--accent)]" />
        <span className={`flex-1 text-sm ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </span>
        <span className={`font-mono text-[10px] uppercase tracking-wider ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
          {dueLabel(task.due_date, t)}
        </span>
        <button onClick={e => { e.preventDefault(); onUpdate({ is_today: !task.is_today }); }}
          title={task.is_today ? t("task.unmarkToday") : t("task.markToday")}
          className={`rounded p-1 ${task.is_today ? "text-accent" : "text-muted-foreground hover:text-foreground"}`}>
          <Sun className="h-3.5 w-3.5" />
        </button>
      </summary>
      <div className="border-t border-border p-2.5">
        <div className="grid grid-cols-3 gap-2">
          <FieldInline label={t("task.dueDate")}>
            <Input type="date" defaultValue={task.due_date || ""}
              onBlur={e => onUpdate({ due_date: e.target.value || null })}
              className="h-8 border-border bg-card font-mono text-xs" />
          </FieldInline>
          <FieldInline label={t("status")}>
            <Select value={task.status} onValueChange={v => onUpdate({ status: v as any })}>
              <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">{t("task.status.todo")}</SelectItem>
                <SelectItem value="doing">{t("task.status.doing")}</SelectItem>
                <SelectItem value="waiting">{t("task.status.waiting")}</SelectItem>
                <SelectItem value="done">{t("task.status.done")}</SelectItem>
              </SelectContent>
            </Select>
          </FieldInline>
          <FieldInline label={t("task.friction")}>
            <Select value={String(task.friction_level)} onValueChange={v => onUpdate({ friction_level: Number(v) })}>
              <SelectTrigger className="h-8 border-border bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 · low</SelectItem>
                <SelectItem value="2">2 · mid</SelectItem>
                <SelectItem value="3">3 · high</SelectItem>
              </SelectContent>
            </Select>
          </FieldInline>
        </div>
        <FieldInline label={t("task.notes")}>
          <Textarea defaultValue={task.notes || ""}
            onBlur={e => onUpdate({ notes: e.target.value || null })}
            rows={2}
            className="border-border bg-card text-xs" />
        </FieldInline>
        <div className="mt-2">
          <p className="label-mono mb-1.5">{t("section.attachments")}</p>
          <AttachmentsList missionId={task.mission_id} taskId={task.id} />
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={onDelete} className="rounded p-1 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </details>
  );
}

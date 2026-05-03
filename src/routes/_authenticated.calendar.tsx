import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTasks, useMissions, useAreas } from "@/lib/queries";
import { useI18n } from "@/lib/i18n";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MissionDetail, MissionDangerZone } from "@/components/MissionDetail";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  const { t } = useI18n();
  const { data: tasks = [] } = useTasks();
  const { data: missions = [] } = useMissions();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const grid = useMemo(() => {
    const first = new Date(cursor); first.setDate(1);
    const startDow = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: { date: Date | null; iso: string }[] = [];
    for (let i = 0; i < startDow; i++) cells.push({ date: null, iso: "" });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      cells.push({ date, iso: date.toISOString().slice(0, 10) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: "" });
    return cells;
  }, [cursor]);

  const byDate = useMemo(() => {
    const m = new Map<string, typeof tasks>();
    for (const tk of tasks) if (tk.due_date) {
      const arr = m.get(tk.due_date) || [];
      arr.push(tk); m.set(tk.due_date, arr);
    }
    return m;
  }, [tasks]);

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="px-4 py-6 lg:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight capitalize">{monthLabel}</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() - 1); return n; })}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-card hover:text-foreground">today</button>
          <button onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(n.getMonth() + 1); return n; })}
            className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border border-border bg-border">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="bg-card px-2 py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{d}</div>
        ))}
        {grid.map((cell, i) => {
          const list = cell.iso ? byDate.get(cell.iso) || [] : [];
          const isToday = cell.iso === todayIso;
          const openTasks = list.filter(tk => tk.status !== "done");
          let urgency: "overdue" | "soon" | "later" | null = null;
          if (cell.date && openTasks.length > 0) {
            const cellDate = new Date(cell.iso + "T00:00:00");
            const today = new Date(); today.setHours(0,0,0,0);
            const diffDays = Math.round((cellDate.getTime() - today.getTime()) / 86400000);
            if (diffDays < 0) urgency = "overdue";
            else if (diffDays <= 1) urgency = "soon";
            else urgency = "later";
          }
          const urgencyClass =
            urgency === "overdue" ? "ring-1 ring-inset ring-destructive/60 bg-destructive/5"
            : urgency === "soon"  ? "ring-1 ring-inset ring-warn/60 bg-warn/5"
            : urgency === "later" ? "ring-1 ring-inset ring-success/50 bg-success/5"
            : "";
          const dotClass =
            urgency === "overdue" ? "bg-destructive"
            : urgency === "soon"  ? "bg-warn"
            : urgency === "later" ? "bg-success"
            : "";
          return (
            <div key={i} className={`relative min-h-[90px] bg-card p-1.5 ${cell.date ? "" : "opacity-30"} ${urgencyClass}`}>
              {cell.date && (
                <>
                  <div className="flex items-center justify-between">
                    <p className={`font-mono text-[11px] tabular-nums ${isToday ? "text-accent" : "text-muted-foreground"}`}>{cell.date.getDate()}</p>
                    {urgency && <span className={`h-1.5 w-1.5 rounded-full ${dotClass} ${urgency === "overdue" ? "animate-pulse" : ""}`} />}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {list.slice(0, 3).map(tk => {
                      const m = missions.find(mm => mm.id === tk.mission_id);
                      return (
                        <li key={tk.id} className={`truncate rounded-sm px-1 py-0.5 text-[10px] ${
                          tk.status === "done" ? "bg-success/10 text-success line-through" : "bg-card-elevated text-foreground"
                        }`} title={`${tk.title} · ${m?.title || ""}`}>{tk.title}</li>
                      );
                    })}
                    {list.length > 3 && <li className="font-mono text-[10px] text-muted-foreground">+{list.length - 3}</li>}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import {
  fetchCalendarLink,
  useMissionTasks,
  type ReservationWithRelations,
} from "@/lib/operations";
import { proposeAgentAction, executeAgentAction } from "@/lib/agent-actions";
import { useContacts } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Calendar as CalIcon,
  CheckCircle2,
  Circle,
  ExternalLink,
  Trash2,
  XCircle,
  Settings,
} from "lucide-react";

interface Props {
  reservation: ReservationWithRelations | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30 line-through",
  detected: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

export function ReservationDetail({ reservation, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const r = reservation;
  const tasksQ = useMissionTasks(r?.mission_id);

  const [calendarLink, setCalendarLink] = useState<string | null>(null);
  useEffect(() => {
    setCalendarLink(null);
    if (r?.id) fetchCalendarLink(r.id).then(setCalendarLink);
  }, [r?.id]);

  const cancel = useMutation({
    mutationFn: async () => {
      if (!r) throw new Error("no reservation");
      const groupKey = `manual:cancel:${r.confirmation_code ?? r.id}:${Date.now()}`;
      const reservationAction = await proposeAgentAction({
        source_type: "manual",
        agent_name: "operations_ui",
        action_type: "cancel_reservation",
        payload: { reservation_id: r.id, cancelled_by: "host" },
        confidence_score: 1,
        requires_approval: true,
        group_key: groupKey,
      });
      if (r.calendar_event_id) {
        await proposeAgentAction({
          source_type: "manual",
          agent_name: "operations_ui",
          action_type: "delete_calendar_event",
          payload: { reservation_id: r.id },
          confidence_score: 1,
          requires_approval: true,
          group_key: groupKey,
        });
      }
      return reservationAction;
    },
    onSuccess: () => {
      toast.success("Cancelación encolada en /agent — confirma allí");
      qc.invalidateQueries({ queryKey: ["agent_actions"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo encolar"),
  });

  if (!r) return null;
  const tasks = tasksQ.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm">{r.confirmation_code ?? "—"}</span>
            <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
              {r.status}
            </Badge>
            {r.deleted_at && (
              <Badge variant="outline" className="border-red-500/30 bg-red-500/15 text-red-300">
                <Trash2 className="mr-1 h-3 w-3" /> deleted
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {r.guest_name ?? "—"} · {r.property?.name ?? "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Field label="Check-in" value={`${r.check_in_date ?? "—"}${r.check_in_time ? " " + r.check_in_time : ""}`} mono />
          <Field label="Check-out" value={`${r.check_out_date ?? "—"}${r.check_out_time ? " " + r.check_out_time : ""}`} mono />
          <Field label="Guests" value={r.number_of_guests ?? "—"} mono />
          <Field label="Source" value={r.source} mono />
          <Field label="Email" value={r.guest_email ?? "—"} />
          <Field label="Phone" value={r.guest_phone ?? "—"} />
          <Field label="Payout" value={r.payout_amount != null ? `$${Number(r.payout_amount).toFixed(2)}` : "—"} mono />
          <Field label="Cleaning" value={r.cleaning_fee != null ? `$${Number(r.cleaning_fee).toFixed(2)}` : "—"} mono />
        </div>

        <div className="mt-5">
          <p className="label-mono mb-1">Calendar</p>
          {r.calendar_event_id ? (
            calendarLink ? (
              <a
                href={calendarLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"
              >
                <CalIcon className="h-4 w-4" /> Abrir en Google Calendar <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="text-xs text-muted-foreground font-mono">{r.calendar_event_id}</p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">no sync</p>
          )}
        </div>

        <div className="mt-5">
          <p className="label-mono mb-2">Mission</p>
          {!r.mission_id && <p className="text-xs text-muted-foreground">sin misión asociada</p>}
          {r.mission && r.mission.deleted_at && (
            <p className="text-xs text-muted-foreground">Mission archivada</p>
          )}
          {r.mission && !r.mission.deleted_at && (
            <p className="text-sm">{r.mission.title}</p>
          )}
        </div>

        <div className="mt-4">
          <p className="label-mono mb-2">Tasks ({tasks.length})</p>
          {tasksQ.isLoading && <Skeleton className="h-20 w-full" />}
          {!tasksQ.isLoading && tasks.length === 0 && (
            <p className="text-xs text-muted-foreground">sin tasks</p>
          )}
          <ul className="space-y-2">
            {tasks.map((tk: any) => (
              <TaskRow
                key={tk.id}
                task={tk}
                propertyId={r.property?.id ?? null}
                missionId={r.mission_id}
              />
            ))}
          </ul>
        </div>

        {r.status === "confirmed" && !r.deleted_at && (
          <div className="mt-6 border-t border-border pt-4">
            <Button
              variant="destructive"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => {
                if (confirm("Encolar cancelación de esta reserva? Carlos la confirma en /agent.")) {
                  cancel.mutate();
                }
              }}
            >
              <XCircle className="mr-1 h-3 w-3" /> Cancelar reserva
            </Button>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Encola en /agent · requiere aprobación
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p className={mono ? "font-mono text-sm tabular-nums" : "text-sm"}>{value}</p>
    </div>
  );
}

const VENDOR_BADGE: Record<string, string> = {
  assigned: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  notified: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  escalated: "bg-red-500/15 text-red-300 border-red-500/30",
};

function TaskRow({ task, propertyId, missionId }: { task: any; propertyId: string | null; missionId: string | null }) {
  const qc = useQueryClient();
  const { t } = useI18n();
  const { data: contacts = [] } = useContacts();
  const done = !!task.completed_at || task.status === "done";
  const overdue = !done && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
  const isCleaning = /Coordinar limpieza/i.test(task.title || "");
  const vendorContact = task.assignee_contact_id
    ? contacts.find((c: any) => c.id === task.assignee_contact_id)
    : null;

  const markConfirmed = useMutation({
    mutationFn: async () => {
      const action = await proposeAgentAction({
        source_type: "manual",
        agent_name: "operations_ui",
        action_type: "mark_vendor_confirmed",
        payload: { task_id: task.id, confirmed_via: "manual" },
        requires_approval: false,
        confidence_score: 1,
      });
      return executeAgentAction((action as any).id);
    },
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["mission_tasks", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "error"),
  });

  const markCompleted = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      qc.invalidateQueries({ queryKey: ["mission_tasks", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "error"),
  });

  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
      ) : overdue ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      ) : (
        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`truncate ${done ? "text-muted-foreground line-through" : ""}`}>{task.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <p className="label-mono">{task.due_date ?? "no date"}</p>
          {isCleaning && task.vendor_status && (
            <Badge variant="outline" className={VENDOR_BADGE[task.vendor_status] ?? ""}>
              {t(`task.vendor.${task.vendor_status}` as any) || task.vendor_status}
            </Badge>
          )}
          {vendorContact && (
            <span className="font-mono text-[10px] text-muted-foreground">
              → {(vendorContact as any).name}
            </span>
          )}
        </div>
        {isCleaning && !done && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {(task.vendor_status === "notified" || task.vendor_status === "escalated") && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                disabled={markConfirmed.isPending}
                onClick={() => markConfirmed.mutate()}
              >
                {t("task.vendor.markConfirmed")}
              </Button>
            )}
            {task.vendor_status === "confirmed" && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                disabled={markCompleted.isPending}
                onClick={() => markCompleted.mutate()}
              >
                {t("task.vendor.markCompleted")}
              </Button>
            )}
            {!task.vendor_status && propertyId && (
              <Link
                to="/operations/properties/$id"
                params={{ id: propertyId }}
                className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] hover:bg-card-elevated"
              >
                <Settings className="h-3 w-3" />
                {t("task.vendor.assignVendor")}
              </Link>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

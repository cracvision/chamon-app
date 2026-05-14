import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useProperties,
  useReservationsForProperty,
  useTasksForProperty,
  type ReservationRow,
} from "@/lib/operations";
import { useVendorAssignmentsForProperty } from "@/lib/vendors";
import { useI18n } from "@/lib/i18n";
import { ReservationDetail } from "@/components/operations/ReservationDetail";
import { useReservations } from "@/lib/operations";
import { AlertCircle, CheckCircle2, Circle, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/operations/vista-pelican")({
  component: PropertyDashboard,
});

const VISTA_PELICAN_NAME = "Vista Pelícano";

type OperationalStatus = "ok" | "attention" | "critical";

function computeStatus(reservations: ReservationRow[], tasks: any[], hasCleaningVendor: boolean): OperationalStatus {
  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  // 🔴 cleaning task pre-checkin in next 24h with notified|escalated and not confirmed
  const incomingSoon = reservations.find((r) => {
    if (r.status !== "confirmed" || !r.check_in_date) return false;
    const ci = new Date(r.check_in_date + "T00:00:00");
    return ci >= now && ci <= next24h;
  });
  if (incomingSoon) {
    const cleaningCrit = tasks.find(
      (t) =>
        t.mission_id === incomingSoon.mission_id &&
        /limpieza.*pre.?check.?in/i.test(t.title) &&
        !t.completed_at &&
        (t.vendor_status === "notified" || t.vendor_status === "escalated") &&
        t.vendor_status !== "confirmed",
    );
    if (cleaningCrit) return "critical";
  }
  // 🟡 escalated active or no cleaning vendor
  const anyEscalated = tasks.some((t) => !t.completed_at && t.vendor_status === "escalated");
  if (anyEscalated || !hasCleaningVendor) return "attention";
  const todayStr = now.toISOString().slice(0, 10);
  const overdue = tasks.filter((t) => !t.completed_at && t.due_date && t.due_date < todayStr);
  if (overdue.length > 0) return "attention";
  return "ok";
}

function PropertyDashboard() {
  const { t } = useI18n();
  const propsQ = useProperties();
  const property = (propsQ.data ?? []).find((p: any) => p.name === VISTA_PELICAN_NAME)
    ?? (propsQ.data ?? [])[0];
  const propertyId = property?.id ?? null;

  const resQ = useReservationsForProperty(propertyId);
  const tasksQ = useTasksForProperty(propertyId);
  const reservations = resQ.data ?? [];
  const tasks = tasksQ.data ?? [];

  const today = new Date().toISOString().slice(0, 10);
  const future = useMemo(
    () =>
      reservations
        .filter((r) => r.status === "confirmed" && r.check_in_date && r.check_in_date >= today)
        .sort((a, b) => (a.check_in_date ?? "").localeCompare(b.check_in_date ?? "")),
    [reservations, today],
  );
  const nextArrival = future[0];
  const currentGuest = reservations.find(
    (r) =>
      r.status === "confirmed" &&
      r.check_in_date &&
      r.check_out_date &&
      r.check_in_date <= today &&
      r.check_out_date > today,
  );
  const nextDeparture = useMemo(
    () =>
      reservations
        .filter((r) => r.status === "confirmed" && r.check_out_date && r.check_out_date >= today)
        .sort((a, b) => (a.check_out_date ?? "").localeCompare(b.check_out_date ?? ""))[0],
    [reservations, today],
  );

  const vendorAssignQ = useVendorAssignmentsForProperty(propertyId);
  const hasCleaningVendor = (vendorAssignQ.data ?? []).some(
    (a) => a.vendor_category === "vendor_cleaning" && a.is_primary,
  );
  const status = computeStatus(reservations, tasks, hasCleaningVendor);
  const statusColor = status === "ok" ? "text-emerald-400" : status === "attention" ? "text-amber-400" : "text-red-400";
  const statusEmoji = status === "ok" ? "🟢" : status === "attention" ? "🟡" : "🔴";

  const [selected, setSelected] = useState<any>(null);
  const fullDetailQ = useReservations({
    statuses: [],
    propertyId,
    includeSoftDeleted: true,
  });
  const fullList = fullDetailQ.data ?? [];

  // Pending tasks: due in <= 7d (or overdue) and not completed
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  const sevenDaysStr = sevenDays.toISOString().slice(0, 10);
  const pendingTasks = tasks.filter(
    (t) => !t.completed_at && t.due_date && t.due_date <= sevenDaysStr,
  );
  // Group by mission
  const tasksByMission = pendingTasks.reduce<Record<string, any[]>>((acc, t) => {
    const k = t.mission_id ?? "_none";
    (acc[k] ??= []).push(t);
    return acc;
  }, {});

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10);
  const historic = fullList.filter(
    (r) =>
      (r.status === "cancelled" || r.deleted_at) &&
      (r.check_in_date ?? r.created_at?.slice(0, 10) ?? "") >= sixMonthsAgoStr,
  );

  if (propsQ.isLoading) {
    return <div className="p-6"><Skeleton className="h-32 w-full" /></div>;
  }
  if (!property) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">No hay propiedades configuradas.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">{property.name}</h1>
            <p className="label-mono">{property.code ?? "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/operations/properties/$id"
              params={{ id: property.id }}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-card-elevated hover:text-foreground"
            >
              <Settings className="h-3 w-3" />{t("vendors.configure")}
            </Link>
            <div className={`flex items-center gap-2 font-mono text-sm ${statusColor}`}>
              <span className="text-lg">{statusEmoji}</span>
              <span className="uppercase tracking-widest">
                {status === "ok" ? "OK" : status === "attention" ? "Atención" : "Crítico"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {!hasCleaningVendor && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="flex-1 text-sm text-amber-200">
              {t("vendors.noPrimary")} ·{" "}
              <Link
                to="/operations/properties/$id"
                params={{ id: property.id }}
                className="underline hover:text-amber-100"
              >
                {t("vendors.configure")}
              </Link>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard
          label="Próxima llegada"
          mainValue={nextArrival?.guest_name ?? "—"}
          subValue={nextArrival ? relativeDate(nextArrival.check_in_date) : ""}
          onClick={() => nextArrival && setSelected(fullList.find((x) => x.id === nextArrival.id) ?? nextArrival)}
        />
        <SummaryCard
          label="Huésped actual"
          mainValue={currentGuest?.guest_name ?? "—"}
          subValue={currentGuest ? `hasta ${currentGuest.check_out_date}` : "vacío"}
          onClick={() => currentGuest && setSelected(fullList.find((x) => x.id === currentGuest.id) ?? currentGuest)}
        />
        <SummaryCard
          label="Próxima salida"
          mainValue={nextDeparture?.guest_name ?? "—"}
          subValue={nextDeparture?.check_out_date ?? ""}
          onClick={() => nextDeparture && setSelected(fullList.find((x) => x.id === nextDeparture.id) ?? nextDeparture)}
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Tasks pendientes</TabsTrigger>
          <TabsTrigger value="upcoming">Próximas reservas</TabsTrigger>
          <TabsTrigger value="historic">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-3">
          {pendingTasks.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
              Todo al día — sin tasks vencidas o próximas
            </Card>
          )}
          {Object.entries(tasksByMission).map(([missionId, mTasks]) => {
            const res = reservations.find((r) => r.mission_id === missionId);
            return (
              <Card key={missionId} className="mb-2 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {res?.guest_name ?? "(sin reserva)"}
                  </p>
                  <p className="label-mono">{res?.check_in_date ?? ""}</p>
                </div>
                <ul className="space-y-1.5">
                  {mTasks.map((t) => (
                    <PendingTaskRow key={t.id} task={t} propertyId={propertyId} />
                  ))}
                </ul>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-3">
          {future.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Sin próximas reservas
            </Card>
          )}
          {future.map((r) => (
            <Card
              key={r.id}
              className="mb-2 cursor-pointer p-3 hover:bg-card-elevated"
              onClick={() => setSelected(fullList.find((x) => x.id === r.id) ?? r)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{r.guest_name ?? "—"}</p>
                  <p className="label-mono font-mono">{r.confirmation_code ?? ""}</p>
                </div>
                <p className="font-mono text-xs">
                  {r.check_in_date} → {r.check_out_date}
                </p>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="historic" className="mt-3">
          {historic.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Sin histórico (6 meses)
            </Card>
          )}
          {historic.map((r) => (
            <Card
              key={r.id}
              className="mb-2 cursor-pointer p-3 opacity-70 hover:bg-card-elevated"
              onClick={() => setSelected(r)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">{r.guest_name ?? "—"}</p>
                  <p className="label-mono">
                    {r.deleted_at ? "deleted" : r.status}
                  </p>
                </div>
                <p className="font-mono text-xs">{r.check_in_date}</p>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <ReservationDetail
        reservation={selected as any}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

function SummaryCard({
  label,
  mainValue,
  subValue,
  onClick,
}: {
  label: string;
  mainValue: string;
  subValue?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`p-3 ${onClick && mainValue !== "—" ? "cursor-pointer hover:bg-card-elevated" : ""}`}
      onClick={onClick}
    >
      <p className="label-mono mb-1">{label}</p>
      <p className="text-base font-medium">{mainValue}</p>
      {subValue && <p className="font-mono text-xs text-muted-foreground">{subValue}</p>}
    </Card>
  );
}

function PendingTaskRow({ task, propertyId }: { task: any; propertyId: string | null }) {
  const qc = useQueryClient();
  const today = new Date(new Date().toDateString());
  const due = task.due_date ? new Date(task.due_date + "T00:00:00") : null;
  const days = due ? Math.round((due.getTime() - today.getTime()) / 86400000) : null;
  const dueLabel =
    days === null ? "no date" : days < 0 ? `vencida hace ${Math.abs(days)}d` : days === 0 ? "vence hoy" : `vence en ${days}d`;

  const handleToggle = async () => {
    await supabase
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", task.id);
    qc.invalidateQueries({ queryKey: ["tasks_property", propertyId] });
  };

  return (
    <li className="flex items-start gap-2 text-sm">
      <Checkbox onCheckedChange={() => handleToggle()} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate">{task.title}</p>
        <p className={`label-mono ${days !== null && days < 0 ? "text-red-400" : ""}`}>{dueLabel}</p>
      </div>
    </li>
  );
}

function relativeDate(iso: string | null): string {
  if (!iso) return "";
  const today = new Date(new Date().toDateString());
  const d = new Date(iso + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${iso} (hace ${Math.abs(days)}d)`;
  if (days === 0) return `${iso} (hoy)`;
  return `${iso} (en ${days}d)`;
}

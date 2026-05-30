import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalIcon, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProperties, useReservations, type ReservationWithRelations } from "@/lib/operations";
import { ReservationDetail } from "@/components/operations/ReservationDetail";

export const Route = createFileRoute("/_authenticated/operations/reservations")({
  component: ReservationsPage,
});

const ALL_STATUSES = ["confirmed", "detected", "cancelled"] as const;

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  cancelled: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  detected: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function ReservationsPage() {
  const [statuses, setStatuses] = useState<string[]>(["confirmed", "detected"]);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [selected, setSelected] = useState<ReservationWithRelations | null>(null);

  const propertiesQ = useProperties();
  const q = useReservations({
    statuses,
    propertyId,
    from: from || null,
    to: to || null,
    search,
    includeSoftDeleted: includeDeleted,
  });

  const rows = q.data ?? [];

  const toggleStatus = (s: string) => {
    setStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (b.check_in_date ?? "").localeCompare(a.check_in_date ?? ""),
      ),
    [rows],
  );

  const sync = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("gmail-sync-reservations", {
        method: "POST",
        body: {},
      });
      if (error) throw error;
      return data as { ok: boolean; scanned?: number; proposed?: number; duplicates?: number; errors?: number };
    },
    onSuccess: (d) => {
      toast.success(
        `Sync ok — ${d.scanned ?? 0} escaneados · ${d.proposed ?? 0} nuevos · ${d.duplicates ?? 0} dup · ${d.errors ?? 0} err`,
      );
      q.refetch();
    },
    onError: (e: any) => toast.error(e?.message ?? "sync failed"),
  });

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Operations · Reservations</h1>
        <span className="label-mono">{rows.length} rows</span>
      </div>

      {/* Filters */}
      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                statuses.includes(s)
                  ? STATUS_COLORS[s]
                  : "border-border text-muted-foreground hover:bg-card-elevated"
              }`}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => setIncludeDeleted((v) => !v)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              includeDeleted
                ? "border-red-500/30 bg-red-500/15 text-red-300"
                : "border-border text-muted-foreground hover:bg-card-elevated"
            }`}
          >
            <Trash2 className="mr-1 inline h-3 w-3" /> soft-deleted
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select
              value={propertyId ?? "__all"}
              onValueChange={(v) => setPropertyId(v === "__all" ? null : v)}
            >
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All properties</SelectItem>
                {(propertiesQ.data ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 w-[140px] text-xs"
            />
            <Input
              placeholder="Search guest, email, code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[220px] text-xs"
            />
            <Button size="sm" variant="ghost" onClick={() => q.refetch()}>refresh</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {q.isLoading && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {!q.isLoading && sorted.length === 0 && (
          <div className="p-8 text-center">
            <p className="label-mono mb-2">no results</p>
            <p className="text-sm text-muted-foreground">
              Sin reservas que matcheen los filtros
            </p>
          </div>
        )}
        {!q.isLoading && sorted.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Cal</TableHead>
                <TableHead className="text-right">Payout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <TableCell className="font-mono text-xs">{r.confirmation_code ?? "—"}</TableCell>
                  <TableCell className="text-sm">{r.guest_name ?? "—"}</TableCell>
                  <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
                    {r.property ? (
                      <Link
                        to="/operations/properties/$id"
                        params={{ id: r.property.id }}
                        className="hover:text-accent hover:underline"
                      >
                        {r.property.name}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.check_in_date ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.check_out_date ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
                      {r.status}
                    </Badge>
                    {r.deleted_at && (
                      <Trash2 className="ml-1 inline h-3 w-3 text-red-400" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <CalIcon
                      className={`inline h-4 w-4 ${
                        r.calendar_event_id ? "text-emerald-500" : "text-muted-foreground/40"
                      }`}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {r.payout_amount != null ? `$${Number(r.payout_amount).toFixed(2)}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReservationDetail
        reservation={selected}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
      />
    </div>
  );
}

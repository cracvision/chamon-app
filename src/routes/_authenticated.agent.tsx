import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAgentActions,
  executeAgentAction,
  rejectAgentAction,
  proposeAgentAction,
  listActiveMissions,
} from "@/lib/agent-actions";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Play, RefreshCw, Bot, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agent")({
  component: AgentInbox,
});

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  executed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
};

function AgentInbox() {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");

  const q = useQuery({
    queryKey: ["agent_actions", filter],
    queryFn: () => listAgentActions(filter ? { status: filter } : undefined),
  });

  const refresh = () => q.refetch();

  const exec = useMutation({
    mutationFn: (id: string) => executeAgentAction(id),
    onSuccess: () => { toast.success("Action executed"); refresh(); router.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Execute failed"),
  });
  const rej = useMutation({
    mutationFn: (id: string) => rejectAgentAction(id),
    onSuccess: () => { toast.success("Rejected"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Reject failed"),
  });

  const [testOpen, setTestOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<string>("");

  const missionsQ = useQuery({
    queryKey: ["agent_inbox_active_missions"],
    queryFn: listActiveMissions,
    enabled: testOpen,
  });

  const sendTest = useMutation({
    mutationFn: (missionId: string) =>
      proposeAgentAction({
        source_type: "manual",
        agent_name: "test",
        action_type: "create_task",
        payload: {
          title: "Test task from Agent Inbox",
          notes: "Generated via debug button",
          mission_id: missionId,
        },
        confidence_score: 1,
        requires_approval: true,
      }),
    onSuccess: () => { toast.success("Proposed"); setTestOpen(false); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const openTest = () => {
    setSelectedMission("");
    setTestOpen(true);
  };

  const rows = Array.isArray(q.data) ? q.data : [];

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold">Agent Inbox</h1>
          <span className="label-mono">propuestas y ejecuciones</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">all</option>
            <option value="proposed">proposed</option>
            <option value="executed">executed</option>
            <option value="rejected">rejected</option>
            <option value="failed">failed</option>
          </select>
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="mr-1 h-3 w-3" /> refresh
          </Button>
          <Button size="sm" variant="ghost" onClick={openTest}>
            + test action
          </Button>
        </div>
      </div>

      {q.isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {q.isError && !q.isLoading && (
        <Card className="border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">No pude cargar el inbox</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(q.error as any)?.message ?? "Error desconocido"}
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={refresh}>
                Reintentar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!q.isLoading && !q.isError && rows.length === 0 && (
        <Card className="p-6 text-center">
          <p className="label-mono mb-2">no actions</p>
          <p className="text-sm text-muted-foreground">
            Aquí aparecerán las acciones que el agente proponga (reservas detectadas, tareas, eventos
            de calendario, etc).
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {(() => {
          const groups = new Map<string, any[]>();
          const singles: any[] = [];
          for (const r of rows) {
            if (r.group_key) {
              if (!groups.has(r.group_key)) groups.set(r.group_key, []);
              groups.get(r.group_key)!.push(r);
            } else {
              singles.push(r);
            }
          }
          // Render groups (>=2 in same group_key) and singles intermixed by most-recent created_at.
          type Item = { sortAt: string; node: React.ReactNode; key: string };
          const items: Item[] = [];
          for (const [gk, list] of groups) {
            if (list.length >= 2) {
              const newest = list.reduce((a, b) => (a.created_at > b.created_at ? a : b)).created_at;
              items.push({
                sortAt: newest,
                key: `g:${gk}`,
                node: <ProposalGroup actions={list as any} />,
              });
            } else {
              singles.push(...list);
            }
          }
          for (const r of singles) {
            items.push({ sortAt: r.created_at, key: r.id, node: <SingleActionCard action={r} onExec={() => exec.mutate(r.id)} onReject={() => rej.mutate(r.id)} execPending={exec.isPending} rejectPending={rej.isPending} /> });
          }
          items.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
          return items.map((it) => <div key={it.key}>{it.node}</div>);
        })()}
      </div>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test action: create_task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Pick an active mission to attach the test task to. The action will be proposed
              with confidence 1 and require approval.
            </p>
            {missionsQ.isLoading && <Skeleton className="h-9 w-full" />}
            {!missionsQ.isLoading && (missionsQ.data?.length ?? 0) === 0 && (
              <Card className="p-3 text-sm">
                No active missions. <Link to="/dashboard" className="underline">Create one →</Link>
              </Card>
            )}
            {!missionsQ.isLoading && (missionsQ.data?.length ?? 0) > 0 && (
              <Select
                value={selectedMission || (missionsQ.data?.[0]?.id ?? "")}
                onValueChange={setSelectedMission}
              >
                <SelectTrigger><SelectValue placeholder="Select a mission" /></SelectTrigger>
                <SelectContent>
                  {(missionsQ.data ?? []).map((m: any) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.code ? `[${m.code}] ` : ""}{m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>Cancel</Button>
            <Button
              disabled={
                sendTest.isPending ||
                (missionsQ.data?.length ?? 0) === 0 ||
                missionsQ.isLoading
              }
              onClick={() => {
                const id = selectedMission || missionsQ.data?.[0]?.id;
                if (!id) return;
                sendTest.mutate(id);
              }}
            >
              Propose
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

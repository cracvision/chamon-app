import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  listAgentActions,
  executeAgentAction,
  rejectAgentAction,
  proposeAgentAction,
} from "@/lib/agent-actions.functions";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Play, RefreshCw, Bot } from "lucide-react";

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
  const list = useServerFn(listAgentActions);
  const execute = useServerFn(executeAgentAction);
  const reject = useServerFn(rejectAgentAction);
  const propose = useServerFn(proposeAgentAction);
  const router = useRouter();
  const [filter, setFilter] = useState<string>("");

  const q = useQuery({
    queryKey: ["agent_actions", filter],
    queryFn: () => list({ data: filter ? { status: filter } : {} }),
  });

  const refresh = () => q.refetch();

  const exec = useMutation({
    mutationFn: (id: string) => execute({ data: { id } }),
    onSuccess: () => { toast.success("Action executed"); refresh(); router.invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Execute failed"),
  });
  const rej = useMutation({
    mutationFn: (id: string) => reject({ data: { id } }),
    onSuccess: () => { toast.success("Rejected"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Reject failed"),
  });

  const sendTest = useMutation({
    mutationFn: () =>
      propose({
        data: {
          source_type: "manual",
          agent_name: "test",
          action_type: "create_task",
          payload: {
            title: "Test task from Agent Inbox",
            notes: "Generated via debug button",
            mission_id: prompt("Paste a mission_id to attach the test task to:") ?? "",
          } as any,
          confidence_score: 1,
          requires_approval: true,
        },
      }),
    onSuccess: () => { toast.success("Proposed"); refresh(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const rows = q.data ?? [];

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
          <Button size="sm" variant="ghost" onClick={() => sendTest.mutate()}>
            + test action
          </Button>
        </div>
      </div>

      {q.isLoading && <p className="label-mono">loading…</p>}
      {!q.isLoading && rows.length === 0 && (
        <Card className="p-6 text-center">
          <p className="label-mono mb-2">no actions</p>
          <p className="text-sm text-muted-foreground">
            Aquí aparecerán las acciones que el agente proponga (reservas detectadas, tareas, eventos
            de calendario, etc).
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {rows.map((r: any) => (
          <Card key={r.id} className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STATUS_COLORS[r.status] ?? ""}>
                    {r.status}
                  </Badge>
                  <span className="font-mono text-xs text-foreground">{r.action_type}</span>
                  {r.agent_name && (
                    <span className="label-mono">via {r.agent_name}</span>
                  )}
                  {typeof r.confidence_score === "number" && (
                    <span className="label-mono">
                      conf {(r.confidence_score * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px] leading-tight text-muted-foreground">
{JSON.stringify(r.payload, null, 2)}
                </pre>
                {r.error_message && (
                  <p className="mt-1 text-xs text-red-400">⚠ {r.error_message}</p>
                )}
                {r.result && (
                  <p className="mt-1 font-mono text-[11px] text-emerald-400">
                    → {JSON.stringify(r.result)}
                  </p>
                )}
                <p className="mt-1 label-mono">
                  {new Date(r.created_at).toLocaleString()} · {r.source_type}
                  {r.group_key ? ` · group ${r.group_key.slice(0, 12)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {r.status === "proposed" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => exec.mutate(r.id)}
                      disabled={exec.isPending}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Play className="mr-1 h-3 w-3" /> execute
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rej.mutate(r.id)}
                      disabled={rej.isPending}
                    >
                      <XCircle className="mr-1 h-3 w-3" /> reject
                    </Button>
                  </>
                )}
                {r.status === "executed" && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

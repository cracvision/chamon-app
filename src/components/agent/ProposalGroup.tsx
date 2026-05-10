import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, Play, XCircle, CheckCircle2 } from "lucide-react";
import { executeAgentAction, rejectAgentAction } from "@/lib/agent-actions";
import { toast } from "sonner";

interface Action {
  id: string;
  action_type: string;
  status: string;
  agent_name: string | null;
  confidence_score: number | null;
  payload: any;
  result: any;
  error_message: string | null;
  created_at: string;
  group_key: string | null;
  source_type: string;
}

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  executed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  failed: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function ProposalGroup({ actions }: { actions: Action[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const groupKey = actions[0]?.group_key ?? "";
  const sorted = [...actions].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const statuses = new Set(sorted.map((a) => a.status));
  const aggStatus =
    statuses.size === 1 ? [...statuses][0] : "mixed";

  const approveAll = useMutation({
    mutationFn: async () => {
      setRunning(true);
      for (const a of sorted) {
        if (a.status !== "proposed") continue;
        try {
          await executeAgentAction(a.id);
        } catch (e: any) {
          throw new Error(`${a.action_type} (${a.id.slice(0, 8)}) failed: ${e?.message ?? e}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Group ejecutado");
      qc.invalidateQueries({ queryKey: ["agent_actions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Approve all failed"),
    onSettled: () => setRunning(false),
  });

  const rejectAll = useMutation({
    mutationFn: async () => {
      for (const a of sorted) {
        if (a.status === "proposed") await rejectAgentAction(a.id);
      }
    },
    onSuccess: () => {
      toast.success("Group rechazado");
      qc.invalidateQueries({ queryKey: ["agent_actions"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Reject all failed"),
  });

  const proposedCount = sorted.filter((a) => a.status === "proposed").length;

  return (
    <Card className="border-accent/30 p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-start justify-between gap-3">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <Badge variant="outline" className={STATUS_COLORS[aggStatus] ?? "border-accent/40 text-accent"}>
              {aggStatus}
            </Badge>
            <span className="font-mono text-xs text-foreground">
              group {groupKey.slice(0, 24)}
              {groupKey.length > 24 ? "…" : ""}
            </span>
            <span className="label-mono">{sorted.length} actions</span>
          </CollapsibleTrigger>
          {proposedCount > 0 && (
            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                disabled={running || approveAll.isPending}
                onClick={() => approveAll.mutate()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Play className="mr-1 h-3 w-3" /> approve all
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={rejectAll.isPending}
                onClick={() => rejectAll.mutate()}
              >
                <XCircle className="mr-1 h-3 w-3" /> reject all
              </Button>
            </div>
          )}
        </div>

        <CollapsibleContent className="mt-3 space-y-2 border-l border-border pl-3">
          {sorted.map((a) => (
            <ActionRow key={a.id} action={a} />
          ))}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ActionRow({ action: a }: { action: Action }) {
  const qc = useQueryClient();
  const [expand, setExpand] = useState(false);
  const exec = useMutation({
    mutationFn: () => executeAgentAction(a.id),
    onSuccess: () => { toast.success("Executed"); qc.invalidateQueries({ queryKey: ["agent_actions"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Execute failed"),
  });
  const rej = useMutation({
    mutationFn: () => rejectAgentAction(a.id),
    onSuccess: () => { toast.success("Rejected"); qc.invalidateQueries({ queryKey: ["agent_actions"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Reject failed"),
  });
  return (
    <div className="rounded border border-border/60 p-2">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setExpand((v) => !v)} className="flex flex-1 flex-wrap items-center gap-2 text-left">
          <Badge variant="outline" className={STATUS_COLORS[a.status] ?? ""}>{a.status}</Badge>
          <span className="font-mono text-xs">{a.action_type}</span>
          {a.agent_name && <span className="label-mono">via {a.agent_name}</span>}
        </button>
        <div className="flex shrink-0 gap-1">
          {a.status === "proposed" && (
            <>
              <Button size="sm" disabled={exec.isPending} onClick={() => exec.mutate()} className="h-7 bg-emerald-600 hover:bg-emerald-700">
                <Play className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="outline" disabled={rej.isPending} onClick={() => rej.mutate()} className="h-7">
                <XCircle className="h-3 w-3" />
              </Button>
            </>
          )}
          {a.status === "executed" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
        </div>
      </div>
      {expand && (
        <pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-2 text-[11px] leading-tight text-muted-foreground">
{JSON.stringify(a.payload, null, 2)}
        </pre>
      )}
      {a.error_message && <p className="mt-1 text-xs text-red-400">⚠ {a.error_message}</p>}
    </div>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useAreas, useMissions, useCreateMission, useCreateTask } from "@/lib/queries";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; defaultMissionId?: string }

export function QuickAddDialog({ open, onOpenChange, defaultMissionId }: Props) {
  const { t } = useI18n();
  const { data: areas = [] } = useAreas();
  const { data: missions = [] } = useMissions();
  const createMission = useCreateMission();
  const createTask = useCreateTask();

  const [tab, setTab] = useState<"mission" | "task">(defaultMissionId ? "task" : "mission");

  // mission state
  const [mTitle, setMTitle] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mArea, setMArea] = useState<string>("");
  const [mPriority, setMPriority] = useState<"low"|"mid"|"high">("mid");
  const [mDue, setMDue] = useState("");
  const [mReward, setMReward] = useState("");

  // task state
  const [tMission, setTMission] = useState<string>(defaultMissionId || "");
  const [tTitle, setTTitle] = useState("");
  const [tDue, setTDue] = useState("");
  const [tFriction, setTFriction] = useState<"1"|"2"|"3">("2");
  const [tToday, setTToday] = useState(false);

  const reset = () => { setMTitle(""); setMDesc(""); setMDue(""); setMReward(""); setTTitle(""); setTDue(""); setTToday(false); };

  const submitMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mTitle.trim()) return;
    try {
      await createMission.mutateAsync({
        title: mTitle.trim(),
        description: mDesc || null,
        area_id: mArea || null,
        priority: mPriority,
        due_date: mDue || null,
        reward_text: mReward || null,
      } as any);
      toast.success(t("saved"));
      reset(); onOpenChange(false);
    } catch (err: any) { toast.error(err?.message || t("error")); }
  };

  const submitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tTitle.trim() || !tMission) return;
    try {
      await createTask.mutateAsync({
        mission_id: tMission,
        title: tTitle.trim(),
        due_date: tDue || null,
        friction_level: Number(tFriction),
        is_today: tToday,
      } as any);
      toast.success(t("saved"));
      reset(); onOpenChange(false);
    } catch (err: any) { toast.error(err?.message || t("error")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{t("quickAdd")}</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2 bg-card-elevated">
            <TabsTrigger value="mission">{t("mission.new")}</TabsTrigger>
            <TabsTrigger value="task">{t("task.new")}</TabsTrigger>
          </TabsList>

          <TabsContent value="mission">
            <form onSubmit={submitMission} className="flex flex-col gap-3 pt-3">
              <Field label={t("mission.title")}><Input required value={mTitle} onChange={e => setMTitle(e.target.value)} className="bg-card-elevated" /></Field>
              <Field label={t("mission.description")}><Textarea rows={3} value={mDesc} onChange={e => setMDesc(e.target.value)} className="bg-card-elevated" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("mission.area")}>
                  <Select value={mArea} onValueChange={setMArea}>
                    <SelectTrigger className="bg-card-elevated"><SelectValue placeholder={t("noArea")} /></SelectTrigger>
                    <SelectContent>{areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label={t("mission.priority")}>
                  <Select value={mPriority} onValueChange={v => setMPriority(v as any)}>
                    <SelectTrigger className="bg-card-elevated"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("mission.priority.low")}</SelectItem>
                      <SelectItem value="mid">{t("mission.priority.mid")}</SelectItem>
                      <SelectItem value="high">{t("mission.priority.high")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("mission.dueDate")}><Input type="date" value={mDue} onChange={e => setMDue(e.target.value)} className="bg-card-elevated" /></Field>
              </div>
              <Field label={t("mission.reward")}><Input value={mReward} onChange={e => setMReward(e.target.value)} className="bg-card-elevated" /></Field>
              <Button type="submit" disabled={createMission.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("create")}</Button>
            </form>
          </TabsContent>

          <TabsContent value="task">
            <form onSubmit={submitTask} className="flex flex-col gap-3 pt-3">
              <Field label="Mission">
                <Select value={tMission} onValueChange={setTMission}>
                  <SelectTrigger className="bg-card-elevated"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{missions.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("task.title")}><Input required value={tTitle} onChange={e => setTTitle(e.target.value)} className="bg-card-elevated" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("task.dueDate")}><Input type="date" value={tDue} onChange={e => setTDue(e.target.value)} className="bg-card-elevated" /></Field>
                <Field label={t("task.friction")}>
                  <Select value={tFriction} onValueChange={v => setTFriction(v as any)}>
                    <SelectTrigger className="bg-card-elevated"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 · low</SelectItem>
                      <SelectItem value="2">2 · mid</SelectItem>
                      <SelectItem value="3">3 · high</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={tToday} onChange={e => setTToday(e.target.checked)} className="accent-[var(--accent)]" />
                {t("task.markToday")}
              </label>
              <Button type="submit" disabled={createTask.isPending || !tMission} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("create")}</Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="label-mono">{label}</Label>
      {children}
    </div>
  );
}

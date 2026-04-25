import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { useMissions, useTasks, useAreas } from "@/lib/queries";
import { MissionDetail } from "@/components/MissionDetail";
import { useI18n } from "@/lib/i18n";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$id")({
  component: MissionPage,
});

function MissionPage() {
  const { id } = useParams({ from: "/_authenticated/missions/$id" });
  const { t } = useI18n();
  const { data: missions = [] } = useMissions();
  const { data: tasks = [] } = useTasks();
  const { data: areas = [] } = useAreas();
  const mission = missions.find(m => m.id === id);

  if (!mission) return <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-6">
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-accent">
        <ArrowLeft className="h-3 w-3" />{t("nav.dashboard")}
      </Link>
      <div className="surface p-5">
        <MissionDetail mission={mission} tasks={tasks} areas={areas} />
      </div>
    </div>
  );
}

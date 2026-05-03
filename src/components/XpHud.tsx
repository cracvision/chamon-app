import { Link } from "@tanstack/react-router";
import { Flame, Trophy } from "lucide-react";
import { useUserStats } from "@/lib/queries";

const LEVEL_THRESHOLDS = [0, 501, 1501, 4001, 10001];

function levelProgress(xp: number, level: number) {
  if (level >= 5) return { pct: 100, next: null };
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const nxt = LEVEL_THRESHOLDS[level] ?? cur;
  const pct = Math.min(100, Math.round(((xp - cur) / (nxt - cur)) * 100));
  return { pct, next: nxt };
}

export function XpHud() {
  const { data: stats } = useUserStats();
  if (!stats) return null;
  const { pct, next } = levelProgress(stats.total_xp, stats.current_level);

  return (
    <Link
      to="/achievements"
      className="hidden items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5 transition-colors hover:bg-card-elevated md:flex"
      title={`${stats.level_name} · ${stats.total_xp} XP${next ? ` / ${next}` : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <Trophy className="h-3.5 w-3.5 text-accent" />
        <span className="font-mono text-[11px] tabular-nums text-foreground">{stats.total_xp}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">XP</span>
      </div>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-card-elevated">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-1">
        <Flame className={`h-3.5 w-3.5 ${stats.current_streak > 0 ? "text-warn" : "text-muted-foreground"}`} />
        <span className="font-mono text-[11px] tabular-nums text-foreground">{stats.current_streak}</span>
      </div>
    </Link>
  );
}

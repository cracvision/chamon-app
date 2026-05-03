// Watches user_stats and xp_events to trigger toasts/confetti when new XP arrives
// or trophies unlock. Mounted once in the authenticated layout.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserStats, useAchievements, useInvalidate } from "@/lib/queries";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export function XpWatcher() {
  const { data: stats } = useUserStats();
  const { data: ach } = useAchievements();
  const invalidate = useInvalidate();
  const prevXp = useRef<number | null>(null);
  const prevLevel = useRef<number | null>(null);
  const prevUnlocked = useRef<Set<string> | null>(null);

  // Realtime subscribe to xp_events for current user
  useEffect(() => {
    let chan: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      chan = supabase
        .channel(`xp_watch_${u.user.id}_${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "xp_events",
          filter: `user_id=eq.${u.user.id}`,
        }, () => {
          invalidate("user_stats", "achievements", "xp_events");
        })
        .on("postgres_changes", {
          event: "*", schema: "public", table: "user_achievements",
          filter: `user_id=eq.${u.user.id}`,
        }, () => {
          invalidate("user_stats", "achievements", "xp_events");
        })
        .subscribe();
    })();
    return () => { if (chan) supabase.removeChannel(chan); };
  }, [invalidate]);

  // Detect XP delta + level-up
  useEffect(() => {
    if (!stats) return;
    if (prevXp.current === null) {
      prevXp.current = stats.total_xp;
      prevLevel.current = stats.current_level;
      return;
    }
    const delta = stats.total_xp - prevXp.current;
    if (delta > 0) {
      toast.success(`+${delta} XP 🎯`);
    }
    if (stats.current_level > (prevLevel.current ?? 1)) {
      toast.success(`¡Subiste a ${stats.level_name}! 🎖️`, { duration: 6000 });
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 } });
    }
    prevXp.current = stats.total_xp;
    prevLevel.current = stats.current_level;
  }, [stats]);

  // Detect newly unlocked achievements
  useEffect(() => {
    if (!ach) return;
    const unlockedNow = new Set(ach.unlocked.filter(u => u.unlocked_at).map(u => u.achievement_id));
    if (prevUnlocked.current === null) {
      prevUnlocked.current = unlockedNow;
      return;
    }
    for (const id of unlockedNow) {
      if (!prevUnlocked.current.has(id)) {
        const meta = ach.catalog.find(c => c.id === id);
        if (meta) {
          toast.success(`${meta.icon} Trofeo desbloqueado: ${meta.name}`, { duration: 6000, description: meta.description });
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 } });
        }
      }
    }
    prevUnlocked.current = unlockedNow;
  }, [ach]);

  return null;
}

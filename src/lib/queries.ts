import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Mission = Database["public"]["Tables"]["missions"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Area = Database["public"]["Tables"]["areas"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type Attachment = Database["public"]["Tables"]["attachments"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserStats = Database["public"]["Tables"]["user_stats"]["Row"];
export type Achievement = Database["public"]["Tables"]["achievements"]["Row"];
export type UserAchievement = Database["public"]["Tables"]["user_achievements"]["Row"];
export type XpEvent = Database["public"]["Tables"]["xp_events"]["Row"];

export function useUserStats() {
  return useQuery({
    queryKey: ["user_stats"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("user_stats").select("*").eq("user_id", u.user.id).maybeSingle();
      if (error) throw error;
      return data as UserStats | null;
    },
    refetchInterval: 30000,
  });
}

export function useAchievements() {
  return useQuery({
    queryKey: ["achievements"],
    queryFn: async () => {
      const [cat, mine] = await Promise.all([
        supabase.from("achievements").select("*").order("sort_order"),
        supabase.from("user_achievements").select("*"),
      ]);
      if (cat.error) throw cat.error;
      if (mine.error) throw mine.error;
      return {
        catalog: (cat.data || []) as Achievement[],
        unlocked: (mine.data || []) as UserAchievement[],
      };
    },
  });
}

export function useXpEvents(limit = 30) {
  return useQuery({
    queryKey: ["xp_events", limit],
    queryFn: async () => {
      const { data, error } = await supabase.from("xp_events").select("*").order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data || []) as XpEvent[];
    },
  });
}

export function useMissions() {
  return useQuery({
    queryKey: ["missions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("missions").select("*").is("deleted_at", null).order("sort_order").order("created_at");
      if (error) throw error;
      return data as Mission[];
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("*").is("deleted_at", null).order("sort_order").order("created_at");
      if (error) throw error;
      return data as Task[];
    },
  });
}

export function useAreas() {
  return useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").is("deleted_at", null).order("sort_order").order("name");
      if (error) throw error;
      return data as Area[];
    },
  });
}

export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").is("deleted_at", null).order("name");
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] }));
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
}

export function useUpdateMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Mission> }) => {
      const { data, error } = await supabase.from("missions").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["missions"] }); },
  });
}

export function useCreateMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Database["public"]["Tables"]["missions"]["Insert"]) => {
      const { data, error } = await supabase.from("missions").insert(m).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["missions"] }); },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (t: Database["public"]["Tables"]["tasks"]["Insert"]) => {
      const { data, error } = await supabase.from("tasks").insert(t).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
}

export function useSoftDeleteMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("missions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["missions"] }); qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; sort_order: number }[]) => {
      await Promise.all(
        items.map(({ id, sort_order }) =>
          supabase.from("tasks").update({ sort_order }).eq("id", id)
        )
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
}

export function useSoftDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
  });
}

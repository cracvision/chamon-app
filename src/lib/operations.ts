import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReservationRow = {
  id: string;
  user_id: string;
  property_id: string | null;
  source: string;
  confirmation_code: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  number_of_guests: number | null;
  payout_amount: number | null;
  cleaning_fee: number | null;
  taxes_or_fees: number | null;
  status: string;
  calendar_event_id: string | null;
  mission_id: string | null;
  agent_action_id: string | null;
  source_email_ids: string[] | null;
  notes: string | null;
  confidence_score: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ReservationWithRelations = ReservationRow & {
  property: { id: string; name: string; code: string | null; calendar_id: string | null } | null;
  mission: { id: string; title: string; status: string; deleted_at: string | null } | null;
};

export type ReservationFilters = {
  statuses?: string[]; // [] = no filter
  propertyId?: string | null;
  from?: string | null; // YYYY-MM-DD applied to check_in_date >=
  to?: string | null;
  search?: string;
  includeSoftDeleted?: boolean;
};

export function useReservations(filters: ReservationFilters) {
  return useQuery({
    queryKey: ["reservations", filters],
    queryFn: async () => {
      let q = supabase
        .from("reservations")
        .select("*, property:properties(id, name, code, calendar_id), mission:missions(id, title, status, deleted_at)")
        .order("check_in_date", { ascending: false })
        .limit(200);

      if (!filters.includeSoftDeleted) q = q.is("deleted_at", null);
      if (filters.statuses && filters.statuses.length) q = q.in("status", filters.statuses);
      if (filters.propertyId) q = q.eq("property_id", filters.propertyId);
      if (filters.from) q = q.gte("check_in_date", filters.from);
      if (filters.to) q = q.lte("check_in_date", filters.to);
      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, "");
        q = q.or(
          `guest_name.ilike.%${s}%,guest_email.ilike.%${s}%,confirmation_code.ilike.%${s}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ReservationWithRelations[];
    },
  });
}

export function useProperties() {
  return useQuery({
    queryKey: ["properties_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, code, calendar_id, calendar_timezone, is_active")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMissionTasks(missionId: string | null | undefined) {
  return useQuery({
    queryKey: ["mission_tasks", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, due_date, completed_at, deleted_at, mission_id, template_task_offset_anchor, template_task_offset_days")
        .eq("mission_id", missionId!)
        .is("deleted_at", null)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function fetchCalendarLink(reservationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("events")
    .select("metadata, action, created_at")
    .eq("entity_id", reservationId)
    .in("action", ["calendar_event_created", "calendar_event_updated"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const link = (data.metadata as any)?.html_link;
  return typeof link === "string" ? link : null;
}

export function useReservationsForProperty(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["reservations_property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("*")
        .eq("property_id", propertyId!)
        .is("deleted_at", null)
        .order("check_in_date", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReservationRow[];
    },
  });
}

export function useTasksForProperty(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["tasks_property", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      // Get missions for property's reservations, then their tasks.
      const { data: res, error: e1 } = await supabase
        .from("reservations")
        .select("mission_id")
        .eq("property_id", propertyId!)
        .is("deleted_at", null);
      if (e1) throw e1;
      const missionIds = (res ?? []).map((r: any) => r.mission_id).filter(Boolean) as string[];
      if (missionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, due_date, completed_at, deleted_at, mission_id")
        .in("mission_id", missionIds)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const VENDOR_CATEGORIES = [
  "vendor_cleaning",
  "vendor_maintenance",
  "vendor_gardening",
] as const;

export const CONTACT_CATEGORIES = [
  "vendor_cleaning",
  "vendor_maintenance",
  "vendor_gardening",
  "guest",
  "personal",
  "professional",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export type PropertyVendorAssignment = {
  id: string;
  user_id: string;
  property_id: string;
  contact_id: string;
  vendor_category: string;
  is_primary: boolean;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export function useVendorAssignmentsForProperty(propertyId: string | null | undefined) {
  return useQuery({
    queryKey: ["pva", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_vendor_assignments")
        .select("*")
        .eq("property_id", propertyId!)
        .is("deleted_at", null);
      if (error) throw error;
      return (data ?? []) as PropertyVendorAssignment[];
    },
  });
}

export function useAssignmentsForContact(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ["pva_for_contact", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_vendor_assignments")
        .select("id, property_id, vendor_category, is_primary")
        .eq("contact_id", contactId!)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAssignVendor(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      vendor_category: VendorCategory;
      contact_id: string;
    }) => {
      if (!propertyId) throw new Error("propertyId required");
      const { data, error } = await supabase.rpc("reassign_vendor_primary" as any, {
        _property_id: propertyId,
        _vendor_category: input.vendor_category,
        _new_contact_id: input.contact_id,
      });
      if (error) throw error;
      return { id: data as unknown as string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pva", propertyId] });
      qc.invalidateQueries({ queryKey: ["pva_for_contact"] });
    },
  });
}

export function useRemoveVendorAssignment(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("property_vendor_assignments")
        .update({ deleted_at: new Date().toISOString(), deleted_by: u.user?.id })
        .eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pva", propertyId] });
    },
  });
}

// ----- Notifications -----

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  channel: string;
  status: string;
  subject: string | null;
  email_to: string | null;
  phone_to: string | null;
  task_id: string | null;
  sent_at: string;
  read_at: string | null;
  error: string | null;
};

export function useNotifications(limit = 20) {
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    refetchInterval: 60_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

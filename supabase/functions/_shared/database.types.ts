// Minimal database types for the Edge Function client.
// We don't import the full generated types (frontend-only path); we only
// need enough structure for the supabase-js generic to compile.
export type Database = {
  public: {
    Tables: {
      areas: { Row: Record<string, unknown> };
      missions: { Row: Record<string, unknown> };
      tasks: { Row: Record<string, unknown> };
      contacts: { Row: Record<string, unknown> };
      events: { Row: Record<string, unknown> };
      attachments: { Row: Record<string, unknown> };
    };
  };
};

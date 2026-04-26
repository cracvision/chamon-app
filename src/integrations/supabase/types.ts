export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_size: number | null
          filename: string
          id: string
          mime_type: string | null
          mission_id: string | null
          storage_path: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          filename: string
          id?: string
          mime_type?: string | null
          mission_id?: string | null
          storage_path: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_size?: number | null
          filename?: string
          id?: string
          mime_type?: string | null
          mission_id?: string | null
          storage_path?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      missions: {
        Row: {
          area_id: string | null
          code: string | null
          completed_at: string | null
          cost_of_inaction_weekly: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_date: string | null
          health: string | null
          id: string
          priority: string
          reward_text: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          area_id?: string | null
          code?: string | null
          completed_at?: string | null
          cost_of_inaction_weekly?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          health?: string | null
          id?: string
          priority?: string
          reward_text?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          area_id?: string | null
          code?: string | null
          completed_at?: string | null
          cost_of_inaction_weekly?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_date?: string | null
          health?: string | null
          id?: string
          priority?: string
          reward_text?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          email_to: string | null
          error: string | null
          id: string
          sent_at: string
          status: string
          subject: string | null
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          email_to?: string | null
          error?: string | null
          id?: string
          sent_at?: string
          status: string
          subject?: string | null
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          email_to?: string | null
          error?: string | null
          id?: string
          sent_at?: string
          status?: string
          subject?: string | null
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          digest_enabled: boolean
          digest_hour: number
          email: string | null
          full_name: string | null
          id: string
          notification_email: string | null
          preferred_language: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          email?: string | null
          full_name?: string | null
          id: string
          notification_email?: string | null
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          email?: string | null
          full_name?: string | null
          id?: string
          notification_email?: string | null
          preferred_language?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_contacts: {
        Row: {
          contact_id: string
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_contacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          due_date: string | null
          effort_minutes: number | null
          friction_level: number
          id: string
          is_today: boolean
          mission_id: string
          notes: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          effort_minutes?: number | null
          friction_level?: number
          id?: string
          is_today?: boolean
          mission_id: string
          notes?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          due_date?: string | null
          effort_minutes?: number | null
          friction_level?: number
          id?: string
          is_today?: boolean
          mission_id?: string
          notes?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      chamon_search: {
        Args: { _limit?: number; _query: string; _user_id: string }
        Returns: {
          due_date: string
          entity_type: string
          id: string
          mission_id: string
          similarity: number
          snippet: string
          status: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

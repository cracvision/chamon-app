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
      achievements: {
        Row: {
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          criteria_type: string
          criteria_value?: number
          description: string
          icon: string
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      agent_actions: {
        Row: {
          action_type: string
          agent_name: string | null
          approved_at: string | null
          approved_by: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          group_key: string | null
          id: string
          idempotency_key: string | null
          payload: Json
          requires_approval: boolean
          result: Json | null
          source_ref: string | null
          source_type: string
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          group_key?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          source_ref?: string | null
          source_type: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          group_key?: string | null
          id?: string
          idempotency_key?: string | null
          payload?: Json
          requires_approval?: boolean
          result?: Json | null
          source_ref?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
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
      assets: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          model: string | null
          name: string
          notes: string | null
          property_id: string | null
          purchase_date: string | null
          serial_number: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          warranty_expires_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          property_id?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          warranty_expires_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          property_id?: string | null
          purchase_date?: string | null
          serial_number?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          warranty_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          asset_id: string | null
          created_at: string
          created_by: string | null
          extracted_data: Json | null
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
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          extracted_data?: Json | null
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
          asset_id?: string | null
          created_at?: string
          created_by?: string | null
          extracted_data?: Json | null
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
            foreignKeyName: "attachments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
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
      email_ingestion_log: {
        Row: {
          classification: string | null
          confidence_score: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          error_message: string | null
          extracted_payload: Json | null
          from_address: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          processed_at: string | null
          property_id: string | null
          received_at: string | null
          reservation_id: string | null
          subject: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          classification?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          extracted_payload?: Json | null
          from_address?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          processed_at?: string | null
          property_id?: string | null
          received_at?: string | null
          reservation_id?: string | null
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          classification?: string | null
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          error_message?: string | null
          extracted_payload?: Json | null
          from_address?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          processed_at?: string | null
          property_id?: string | null
          received_at?: string | null
          reservation_id?: string | null
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_ingestion_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingestion_log_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
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
      mission_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_area_id: string | null
          default_priority: string
          default_reward_text: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          task_offsets: Json
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_area_id?: string | null
          default_priority?: string
          default_reward_text?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          task_offsets?: Json
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_area_id?: string | null
          default_priority?: string
          default_reward_text?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          task_offsets?: Json
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_templates_default_area_id_fkey"
            columns: ["default_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          agent_action_id: string | null
          area_id: string | null
          code: string | null
          completed_at: string | null
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
          agent_action_id?: string | null
          area_id?: string | null
          code?: string | null
          completed_at?: string | null
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
          agent_action_id?: string | null
          area_id?: string | null
          code?: string | null
          completed_at?: string | null
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
            foreignKeyName: "missions_agent_action_id_fkey"
            columns: ["agent_action_id"]
            isOneToOne: false
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
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
      properties: {
        Row: {
          address: string | null
          code: string | null
          created_at: string
          created_by: string | null
          default_area_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          timezone: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_area_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          default_area_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_default_area_id_fkey"
            columns: ["default_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          agent_action_id: string | null
          calendar_event_id: string | null
          check_in_date: string | null
          check_in_time: string | null
          check_out_date: string | null
          check_out_time: string | null
          cleaning_fee: number | null
          confidence_score: number | null
          confirmation_code: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          mission_id: string | null
          notes: string | null
          number_of_guests: number | null
          payout_amount: number | null
          property_id: string | null
          source: string
          source_email_ids: string[] | null
          status: string
          taxes_or_fees: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          agent_action_id?: string | null
          calendar_event_id?: string | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          cleaning_fee?: number | null
          confidence_score?: number | null
          confirmation_code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          mission_id?: string | null
          notes?: string | null
          number_of_guests?: number | null
          payout_amount?: number | null
          property_id?: string | null
          source?: string
          source_email_ids?: string[] | null
          status?: string
          taxes_or_fees?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          agent_action_id?: string | null
          calendar_event_id?: string | null
          check_in_date?: string | null
          check_in_time?: string | null
          check_out_date?: string | null
          check_out_time?: string | null
          cleaning_fee?: number | null
          confidence_score?: number | null
          confirmation_code?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          mission_id?: string | null
          notes?: string | null
          number_of_guests?: number | null
          payout_amount?: number | null
          property_id?: string | null
          source?: string
          source_email_ids?: string[] | null
          status?: string
          taxes_or_fees?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
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
          agent_action_id: string | null
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
          agent_action_id?: string | null
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
          agent_action_id?: string | null
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
            foreignKeyName: "tasks_agent_action_id_fkey"
            columns: ["agent_action_id"]
            isOneToOne: false
            referencedRelation: "agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          created_at: string
          id: string
          progress: number
          unlocked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          created_at?: string
          id?: string
          progress?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          created_at?: string
          id?: string
          progress?: number
          unlocked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_stats: {
        Row: {
          current_level: number
          current_streak: number
          last_active_date: string | null
          level_name: string
          longest_streak: number
          missions_completed_total: number
          tasks_completed_total: number
          total_xp: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_level?: number
          current_streak?: number
          last_active_date?: string | null
          level_name?: string
          longest_streak?: number
          missions_completed_total?: number
          tasks_completed_total?: number
          total_xp?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_level?: number
          current_streak?: number
          last_active_date?: string | null
          level_name?: string
          longest_streak?: number
          missions_completed_total?: number
          tasks_completed_total?: number
          total_xp?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          id: string
          last_service_date: string | null
          name: string
          notes: string | null
          phone: string | null
          property_id: string | null
          rating: number | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          last_service_date?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          rating?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          id?: string
          last_service_date?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          rating?: number | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_events: {
        Row: {
          achievement_id: string | null
          created_at: string
          delta: number
          id: string
          metadata: Json | null
          mission_id: string | null
          reason: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          achievement_id?: string | null
          created_at?: string
          delta: number
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          reason: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          reason?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      award_xp: {
        Args: {
          _achievement_id?: string
          _delta: number
          _metadata?: Json
          _mission_id?: string
          _reason: string
          _task_id?: string
          _user_id: string
        }
        Returns: undefined
      }
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
      compute_level: {
        Args: { _xp: number }
        Returns: {
          level: number
          name: string
        }[]
      }
      evaluate_achievements: { Args: { _user_id: string }; Returns: undefined }
      execute_agent_action: { Args: { _action_id: string }; Returns: Json }
      instantiate_template: {
        Args: { _context: Json; _template_id: string }
        Returns: string
      }
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

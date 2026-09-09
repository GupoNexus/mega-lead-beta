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
      leads: {
        Row: {
          business_status: string | null
          category: string | null
          city: string | null
          created_at: string
          formatted_address: string | null
          google_maps_uri: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          neighborhood: string | null
          notes: string | null
          phone: string | null
          place_id: string
          rating: number | null
          scrape_job_id: string | null
          state: string | null
          status: string
          updated_at: string
          user_id: string
          user_rating_count: number | null
          website: string | null
        }
        Insert: {
          business_status?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          formatted_address?: string | null
          google_maps_uri?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          place_id: string
          rating?: number | null
          scrape_job_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_rating_count?: number | null
          website?: string | null
        }
        Update: {
          business_status?: string | null
          category?: string | null
          city?: string | null
          created_at?: string
          formatted_address?: string | null
          google_maps_uri?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          neighborhood?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string
          rating?: number | null
          scrape_job_id?: string | null
          state?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_rating_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          customer_document: string | null
          customer_email: string | null
          customer_name: string | null
          expires_at: string | null
          external_id: string | null
          id: string
          paid_at: string | null
          pix_code: string | null
          pix_image: string | null
          plan: string
          provider: string
          raw: Json | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          paid_at?: string | null
          pix_code?: string | null
          pix_image?: string | null
          plan: string
          provider?: string
          raw?: Json | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          customer_document?: string | null
          customer_email?: string | null
          customer_name?: string | null
          expires_at?: string | null
          external_id?: string | null
          id?: string
          paid_at?: string | null
          pix_code?: string | null
          pix_image?: string | null
          plan?: string
          provider?: string
          raw?: Json | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          category: string | null
          city: string | null
          created_at: string
          error: string | null
          id: string
          query: string
          results_count: number
          state: string | null
          status: string
          user_id: string
        }
        Insert: {
          category?: string | null
          city?: string | null
          created_at?: string
          error?: string | null
          id?: string
          query: string
          results_count?: number
          state?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string | null
          city?: string | null
          created_at?: string
          error?: string | null
          id?: string
          query?: string
          results_count?: number
          state?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string
          last_payment_id: string | null
          plan: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          last_payment_id?: string | null
          plan: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          last_payment_id?: string | null
          plan?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_last_payment_id_fkey"
            columns: ["last_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wa_channels: {
        Row: {
          access_token_encrypted: string | null
          ai_enabled: boolean
          ai_model: string
          business_account_id: string | null
          created_at: string
          display_phone: string | null
          id: string
          mode: string
          phone_number_id: string | null
          updated_at: string
          user_id: string
          verify_token: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          ai_enabled?: boolean
          ai_model?: string
          business_account_id?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          mode?: string
          phone_number_id?: string | null
          updated_at?: string
          user_id: string
          verify_token?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          ai_enabled?: boolean
          ai_model?: string
          business_account_id?: string | null
          created_at?: string
          display_phone?: string | null
          id?: string
          mode?: string
          phone_number_id?: string | null
          updated_at?: string
          user_id?: string
          verify_token?: string | null
        }
        Relationships: []
      }
      wa_campaign_targets: {
        Row: {
          campaign_id: string
          city: string | null
          company: string | null
          created_at: string
          id: string
          journey_status: string
          last_error: string | null
          lead_id: string | null
          name: string | null
          order_index: number
          phone: string
          sent: boolean
          sent_at: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          city?: string | null
          company?: string | null
          created_at?: string
          id?: string
          journey_status?: string
          last_error?: string | null
          lead_id?: string | null
          name?: string | null
          order_index?: number
          phone: string
          sent?: boolean
          sent_at?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          city?: string | null
          company?: string | null
          created_at?: string
          id?: string
          journey_status?: string
          last_error?: string | null
          lead_id?: string | null
          name?: string | null
          order_index?: number
          phone?: string
          sent?: boolean
          sent_at?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_campaign_targets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaign_targets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_campaign_targets_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wa_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaigns: {
        Row: {
          agent_instructions: string
          auto_reply: boolean
          batch_pause_seconds: number
          batch_size: number
          created_at: string
          delay_max_seconds: number
          delay_min_seconds: number
          id: string
          objective: string
          opening_message: string | null
          opt_out_keywords: string[]
          handoff_keywords: string[]
          move_to_status: string
          name: string
          scheduled_at: string | null
          status: string
          sync_crm: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_instructions?: string
          auto_reply?: boolean
          batch_pause_seconds?: number
          batch_size?: number
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          id?: string
          objective?: string
          opening_message?: string | null
          opt_out_keywords?: string[]
          handoff_keywords?: string[]
          move_to_status?: string
          name: string
          scheduled_at?: string | null
          status?: string
          sync_crm?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_instructions?: string
          auto_reply?: boolean
          batch_pause_seconds?: number
          batch_size?: number
          created_at?: string
          delay_max_seconds?: number
          delay_min_seconds?: number
          id?: string
          objective?: string
          opening_message?: string | null
          opt_out_keywords?: string[]
          handoff_keywords?: string[]
          move_to_status?: string
          name?: string
          scheduled_at?: string | null
          status?: string
          sync_crm?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_conversations: {
        Row: {
          automation_status: string
          campaign_id: string | null
          chat_id: string | null
          contact_name: string | null
          created_at: string
          id: string
          handoff_at: string | null
          last_direction: string | null
          last_message: string | null
          last_message_at: string | null
          lead_id: string | null
          phone: string
          opted_out_at: string | null
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          automation_status?: string
          campaign_id?: string | null
          chat_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          handoff_at?: string | null
          last_direction?: string | null
          last_message?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          phone: string
          opted_out_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          automation_status?: string
          campaign_id?: string | null
          chat_id?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          handoff_at?: string | null
          last_direction?: string | null
          last_message?: string | null
          last_message_at?: string | null
          lead_id?: string | null
          phone?: string
          opted_out_at?: string | null
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          direction: string
          external_id: string | null
          id: string
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          direction: string
          external_id?: string | null
          id?: string
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          external_id?: string | null
          id?: string
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_sessions: {
        Row: {
          created_at: string
          display_name: string | null
          extension_version: string | null
          id: string
          last_seen_at: string | null
          phone_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          extension_version?: string | null
          id?: string
          last_seen_at?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          extension_version?: string | null
          id?: string
          last_seen_at?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wa_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const

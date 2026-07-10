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
      brand_kits: {
        Row: {
          body_font: string | null
          brand_name: string
          created_at: string
          heading_font: string | null
          id: string
          instagram_handle: string | null
          logo_url: string | null
          metadata: Json
          palette: Json
          primary_color: string | null
          tone: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          body_font?: string | null
          brand_name: string
          created_at?: string
          heading_font?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          metadata?: Json
          palette?: Json
          primary_color?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          body_font?: string | null
          brand_name?: string
          created_at?: string
          heading_font?: string | null
          id?: string
          instagram_handle?: string | null
          logo_url?: string | null
          metadata?: Json
          palette?: Json
          primary_color?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      carousel_slides: {
        Row: {
          background_type: string | null
          content: Json
          created_at: string
          export_url: string | null
          html: string | null
          id: string
          image_urls: Json
          layout: Json
          metadata: Json
          project_id: string
          slide_number: number
          slide_type: string | null
          styles: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          background_type?: string | null
          content?: Json
          created_at?: string
          export_url?: string | null
          html?: string | null
          id?: string
          image_urls?: Json
          layout?: Json
          metadata?: Json
          project_id: string
          slide_number: number
          slide_type?: string | null
          styles?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          background_type?: string | null
          content?: Json
          created_at?: string
          export_url?: string | null
          html?: string | null
          id?: string
          image_urls?: Json
          layout?: Json
          metadata?: Json
          project_id?: string
          slide_number?: number
          slide_type?: string | null
          styles?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousel_slides_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          character_lock: Json
          character_type: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          reference_image_url: string | null
          seed: string | null
          style: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          character_lock?: Json
          character_type?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          reference_image_url?: string | null
          seed?: string | null
          style?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          character_lock?: Json
          character_type?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          reference_image_url?: string | null
          seed?: string | null
          style?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_assets: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          metadata: Json
          project_id: string | null
          prompt: string | null
          provider: string | null
          scene_id: string | null
          storage_path: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          scene_id?: string | null
          storage_path?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          prompt?: string | null
          provider?: string | null
          scene_id?: string | null
          storage_path?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_assets_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "project_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          credits: number
          currency: string
          id: string
          metadata: Json | null
          pack_id: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          receipt_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          credits: number
          currency?: string
          id?: string
          metadata?: Json | null
          pack_id: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          credits?: number
          currency?: string
          id?: string
          metadata?: Json | null
          pack_id?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          brand_name: string | null
          created_at: string
          default_platform: string | null
          default_style: string | null
          default_tone: string | null
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          plan: string
          role: string
          updated_at: string
          user_credits: number
        }
        Insert: {
          brand_name?: string | null
          created_at?: string
          default_platform?: string | null
          default_style?: string | null
          default_tone?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean
          plan?: string
          role?: string
          updated_at?: string
          user_credits?: number
        }
        Update: {
          brand_name?: string | null
          created_at?: string
          default_platform?: string | null
          default_style?: string | null
          default_tone?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
          plan?: string
          role?: string
          updated_at?: string
          user_credits?: number
        }
        Relationships: []
      }
      project_scenes: {
        Row: {
          audio_url: string | null
          caption_data: Json
          created_at: string
          dialogue: string | null
          duration: number | null
          end_time: number | null
          id: string
          image_prompt: string | null
          image_url: string | null
          metadata: Json
          motion_prompt: string | null
          narration: string | null
          negative_prompt: string | null
          on_screen_text: string | null
          project_id: string
          scene_number: number
          sound_effect: string | null
          start_time: number | null
          transition: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          caption_data?: Json
          created_at?: string
          dialogue?: string | null
          duration?: number | null
          end_time?: number | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          metadata?: Json
          motion_prompt?: string | null
          narration?: string | null
          negative_prompt?: string | null
          on_screen_text?: string | null
          project_id: string
          scene_number: number
          sound_effect?: string | null
          start_time?: number | null
          transition?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          caption_data?: Json
          created_at?: string
          dialogue?: string | null
          duration?: number | null
          end_time?: number | null
          id?: string
          image_prompt?: string | null
          image_url?: string | null
          metadata?: Json
          motion_prompt?: string | null
          narration?: string | null
          negative_prompt?: string | null
          on_screen_text?: string | null
          project_id?: string
          scene_number?: number
          sound_effect?: string | null
          start_time?: number | null
          transition?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          aspect_ratio: string | null
          audience: string | null
          brand: string | null
          content_type: string | null
          cover_image_url: string | null
          created_at: string
          cta: string | null
          distribution: Json | null
          duration_sec: number | null
          format: string
          id: string
          language: string | null
          metadata: Json
          music: string | null
          objective: string | null
          output_url: string | null
          platform: string | null
          poster_url: string | null
          project_name: string | null
          quality_report: Json | null
          status: string | null
          style: string | null
          thumbnail_generated_at: string | null
          thumbnail_prompt: string | null
          thumbnail_status: string | null
          thumbnail_url: string | null
          title: string
          tone: string | null
          topic: string | null
          updated_at: string
          user_id: string
          voice: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          audience?: string | null
          brand?: string | null
          content_type?: string | null
          cover_image_url?: string | null
          created_at?: string
          cta?: string | null
          distribution?: Json | null
          duration_sec?: number | null
          format?: string
          id?: string
          language?: string | null
          metadata?: Json
          music?: string | null
          objective?: string | null
          output_url?: string | null
          platform?: string | null
          poster_url?: string | null
          project_name?: string | null
          quality_report?: Json | null
          status?: string | null
          style?: string | null
          thumbnail_generated_at?: string | null
          thumbnail_prompt?: string | null
          thumbnail_status?: string | null
          thumbnail_url?: string | null
          title: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
          voice?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          audience?: string | null
          brand?: string | null
          content_type?: string | null
          cover_image_url?: string | null
          created_at?: string
          cta?: string | null
          distribution?: Json | null
          duration_sec?: number | null
          format?: string
          id?: string
          language?: string | null
          metadata?: Json
          music?: string | null
          objective?: string | null
          output_url?: string | null
          platform?: string | null
          poster_url?: string | null
          project_name?: string | null
          quality_report?: Json | null
          status?: string | null
          style?: string | null
          thumbnail_generated_at?: string | null
          thumbnail_prompt?: string | null
          thumbnail_status?: string | null
          thumbnail_url?: string | null
          title?: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
          voice?: string | null
        }
        Relationships: []
      }
      razorpay_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          headers: Json | null
          http_status: number
          id: string
          raw_payload: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          signature_verified: boolean
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          headers?: Json | null
          http_status: number
          id?: string
          raw_payload?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          signature_verified?: boolean
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          headers?: Json | null
          http_status?: number
          id?: string
          raw_payload?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          signature_verified?: boolean
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          created_at: string
          current_step: string | null
          error_code: string | null
          id: string
          job_type: string
          metadata: Json
          output_url: string | null
          progress: number
          project_id: string
          provider: string | null
          safe_error_message: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_step?: string | null
          error_code?: string | null
          id?: string
          job_type: string
          metadata?: Json
          output_url?: string | null
          progress?: number
          project_id: string
          provider?: string | null
          safe_error_message?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_step?: string | null
          error_code?: string | null
          id?: string
          job_type?: string
          metadata?: Json
          output_url?: string | null
          progress?: number
          project_id?: string
          provider?: string | null
          safe_error_message?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          expires_at: string | null
          id: string
          monthly_credit_limit: number
          monthly_credits_used: number
          plan_name: string
          renews_at: string | null
          started_at: string
          status: string
          unlimited_usage: boolean
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          monthly_credit_limit?: number
          monthly_credits_used?: number
          plan_name?: string
          renews_at?: string | null
          started_at?: string
          status?: string
          unlimited_usage?: boolean
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          monthly_credit_limit?: number
          monthly_credits_used?: number
          plan_name?: string
          renews_at?: string | null
          started_at?: string
          status?: string
          unlimited_usage?: boolean
          user_id?: string
        }
        Relationships: []
      }
      usage_history: {
        Row: {
          created_at: string
          credits_used: number
          description: string | null
          id: string
          project_id: string | null
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          description?: string | null
          id?: string
          project_id?: string | null
          source?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          description?: string | null
          id?: string
          project_id?: string | null
          source?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      deduct_credits: {
        Args: {
          _amount: number
          _description: string
          _project_id: string
          _user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      reset_monthly_subscription_credits: { Args: never; Returns: undefined }
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

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
      assets: {
        Row: {
          aspect_ratio: string | null
          asset_type: string | null
          created_at: string
          file_url: string | null
          id: string
          project_id: string | null
          prompt: string | null
          style: string | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          asset_type?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          project_id?: string | null
          prompt?: string | null
          style?: string | null
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          asset_type?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          project_id?: string | null
          prompt?: string | null
          style?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_outputs: {
        Row: {
          captions: string | null
          created_at: string
          hashtags: string[] | null
          hook: string | null
          id: string
          image_prompts: Json | null
          project_id: string
          scenes: Json | null
          script: string | null
          thumbnail_ideas: Json | null
          thumbnail_url: string | null
          title: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          captions?: string | null
          created_at?: string
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          image_prompts?: Json | null
          project_id: string
          scenes?: Json | null
          script?: string | null
          thumbnail_ideas?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          captions?: string | null
          created_at?: string
          hashtags?: string[] | null
          hook?: string | null
          id?: string
          image_prompts?: Json | null
          project_id?: string
          scenes?: Json | null
          script?: string | null
          thumbnail_ideas?: Json | null
          thumbnail_url?: string | null
          title?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_outputs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          plan: string
          updated_at: string
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
          plan?: string
          updated_at?: string
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
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          audience: string | null
          content_type: string | null
          created_at: string
          id: string
          music: string | null
          platform: string | null
          status: string | null
          style: string | null
          title: string
          tone: string | null
          topic: string | null
          updated_at: string
          user_id: string
          voice: string | null
        }
        Insert: {
          audience?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          music?: string | null
          platform?: string | null
          status?: string | null
          style?: string | null
          title: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          user_id: string
          voice?: string | null
        }
        Update: {
          audience?: string | null
          content_type?: string | null
          created_at?: string
          id?: string
          music?: string | null
          platform?: string | null
          status?: string | null
          style?: string | null
          title?: string
          tone?: string | null
          topic?: string | null
          updated_at?: string
          user_id?: string
          voice?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          expires_at: string | null
          id: string
          plan_name: string
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          plan_name?: string
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          plan_name?: string
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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

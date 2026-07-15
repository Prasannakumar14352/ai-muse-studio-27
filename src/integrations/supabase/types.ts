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
      ai_edits: {
        Row: {
          after_text: string | null
          before_text: string | null
          created_at: string
          id: string
          instruction: string
          project_id: string | null
          target: string
          target_ref: string | null
          user_id: string
        }
        Insert: {
          after_text?: string | null
          before_text?: string | null
          created_at?: string
          id?: string
          instruction: string
          project_id?: string | null
          target: string
          target_ref?: string | null
          user_id: string
        }
        Update: {
          after_text?: string | null
          before_text?: string | null
          created_at?: string
          id?: string
          instruction?: string
          project_id?: string | null
          target?: string
          target_ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_edits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          event: string
          id: string
          meta: Json
          occurred_at: string
          user_id: string
        }
        Insert: {
          event: string
          id?: string
          meta?: Json
          occurred_at?: string
          user_id: string
        }
        Update: {
          event?: string
          id?: string
          meta?: Json
          occurred_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          body_font: string | null
          brand_name: string
          brand_voice: string | null
          created_at: string
          default_cta: string | null
          heading_font: string | null
          id: string
          instagram_handle: string | null
          intro_url: string | null
          is_default: boolean
          keywords: string[] | null
          logo_url: string | null
          metadata: Json
          outro_url: string | null
          palette: Json
          primary_color: string | null
          tone: string | null
          updated_at: string
          user_id: string
          watermark_url: string | null
          website: string | null
        }
        Insert: {
          body_font?: string | null
          brand_name: string
          brand_voice?: string | null
          created_at?: string
          default_cta?: string | null
          heading_font?: string | null
          id?: string
          instagram_handle?: string | null
          intro_url?: string | null
          is_default?: boolean
          keywords?: string[] | null
          logo_url?: string | null
          metadata?: Json
          outro_url?: string | null
          palette?: Json
          primary_color?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          watermark_url?: string | null
          website?: string | null
        }
        Update: {
          body_font?: string | null
          brand_name?: string
          brand_voice?: string | null
          created_at?: string
          default_cta?: string | null
          heading_font?: string | null
          id?: string
          instagram_handle?: string | null
          intro_url?: string | null
          is_default?: boolean
          keywords?: string[] | null
          logo_url?: string | null
          metadata?: Json
          outro_url?: string | null
          palette?: Json
          primary_color?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          watermark_url?: string | null
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
      credit_packs: {
        Row: {
          active: boolean
          bonus: string | null
          code: string
          created_at: string
          credits: number
          id: string
          label: string
          price_usd: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          bonus?: string | null
          code: string
          created_at?: string
          credits: number
          id?: string
          label: string
          price_usd: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          bonus?: string | null
          code?: string
          created_at?: string
          credits?: number
          id?: string
          label?: string
          price_usd?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          base_currency: string
          created_at: string
          expires_at: string
          fetched_at: string
          id: string
          provider: string
          quote_currency: string
          rate: number
          raw: Json | null
          status: string
        }
        Insert: {
          base_currency?: string
          created_at?: string
          expires_at: string
          fetched_at?: string
          id?: string
          provider: string
          quote_currency?: string
          rate: number
          raw?: Json | null
          status?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          provider?: string
          quote_currency?: string
          rate?: number
          raw?: Json | null
          status?: string
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
      marketplace_installs: {
        Row: {
          id: string
          installed_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          id?: string
          installed_at?: string
          item_id: string
          user_id: string
        }
        Update: {
          id?: string
          installed_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_installs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "marketplace_items"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_items: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          payload: Json
          preview_url: string | null
          price_usd_cents: number | null
          slug: string
          sort: number
          tier: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          payload?: Json
          preview_url?: string | null
          price_usd_cents?: number | null
          slug: string
          sort?: number
          tier?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          payload?: Json
          preview_url?: string | null
          price_usd_cents?: number | null
          slug?: string
          sort?: number
          tier?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_provider_configs: {
        Row: {
          client_id: string | null
          client_secret_encrypted: string | null
          client_secret_iv: string | null
          enabled: boolean
          last_test_at: string | null
          last_test_error: string | null
          last_test_ok: boolean | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id?: string | null
          client_secret_encrypted?: string | null
          client_secret_iv?: string | null
          enabled?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string | null
          client_secret_encrypted?: string | null
          client_secret_iv?: string | null
          enabled?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_ok?: boolean | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          code_verifier: string | null
          created_at: string
          platform: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier?: string | null
          created_at?: string
          platform: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string | null
          created_at?: string
          platform?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_provider_settings: {
        Row: {
          company_name: string | null
          created_at: string
          currency: string
          enabled: boolean
          environment: string
          key_id: string | null
          key_secret_cipher: string | null
          key_secret_iv: string | null
          logo_url: string | null
          provider: string
          theme_color: string | null
          updated_at: string
          updated_by: string | null
          webhook_secret_cipher: string | null
          webhook_secret_iv: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          currency?: string
          enabled?: boolean
          environment?: string
          key_id?: string | null
          key_secret_cipher?: string | null
          key_secret_iv?: string | null
          logo_url?: string | null
          provider: string
          theme_color?: string | null
          updated_at?: string
          updated_by?: string | null
          webhook_secret_cipher?: string | null
          webhook_secret_iv?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          currency?: string
          enabled?: boolean
          environment?: string
          key_id?: string | null
          key_secret_cipher?: string | null
          key_secret_iv?: string | null
          logo_url?: string | null
          provider?: string
          theme_color?: string | null
          updated_at?: string
          updated_by?: string | null
          webhook_secret_cipher?: string | null
          webhook_secret_iv?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          amount_inr_paise: number | null
          conversion_rate: number | null
          created_at: string
          credits: number
          currency: string
          exchange_rate_fetched_at: string | null
          exchange_rate_source: string | null
          id: string
          metadata: Json | null
          pack_id: string
          price_usd_cents: number | null
          razorpay_order_id: string
          razorpay_payment_id: string | null
          receipt_number: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          amount_inr_paise?: number | null
          conversion_rate?: number | null
          created_at?: string
          credits: number
          currency?: string
          exchange_rate_fetched_at?: string | null
          exchange_rate_source?: string | null
          id?: string
          metadata?: Json | null
          pack_id: string
          price_usd_cents?: number | null
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          amount_inr_paise?: number | null
          conversion_rate?: number | null
          created_at?: string
          credits?: number
          currency?: string
          exchange_rate_fetched_at?: string | null
          exchange_rate_source?: string | null
          id?: string
          metadata?: Json | null
          pack_id?: string
          price_usd_cents?: number | null
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          receipt_number?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string | null
          account_id: string | null
          account_label: string | null
          avatar_url: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_error: string | null
          metadata: Json
          platform: string
          profile_url: string | null
          refresh_iv: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          status: string
          token_iv: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_id?: string | null
          account_label?: string | null
          avatar_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          platform: string
          profile_url?: string | null
          refresh_iv?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_iv?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_id?: string | null
          account_label?: string | null
          avatar_url?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          metadata?: Json
          platform?: string
          profile_url?: string | null
          refresh_iv?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          token_iv?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          active: boolean
          badge: string | null
          code: string
          contact_sales: boolean
          created_at: string
          discount_pct: number
          featured: boolean
          features: Json
          id: string
          included_credits: number
          monthly_credits: number
          name: string
          period_label: string | null
          plan_type: string
          price_lifetime_usd: number
          price_monthly_usd: number
          price_usd: number
          price_yearly_usd: number
          sort_order: number
          tier: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          badge?: string | null
          code: string
          contact_sales?: boolean
          created_at?: string
          discount_pct?: number
          featured?: boolean
          features?: Json
          id?: string
          included_credits?: number
          monthly_credits?: number
          name: string
          period_label?: string | null
          plan_type: string
          price_lifetime_usd?: number
          price_monthly_usd?: number
          price_usd?: number
          price_yearly_usd?: number
          sort_order?: number
          tier?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          badge?: string | null
          code?: string
          contact_sales?: boolean
          created_at?: string
          discount_pct?: number
          featured?: boolean
          features?: Json
          id?: string
          included_credits?: number
          monthly_credits?: number
          name?: string
          period_label?: string | null
          plan_type?: string
          price_lifetime_usd?: number
          price_monthly_usd?: number
          price_usd?: number
          price_yearly_usd?: number
          sort_order?: number
          tier?: string | null
          updated_at?: string
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
          lifetime_credits: number
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
          lifetime_credits?: number
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
          lifetime_credits?: number
          plan?: string
          role?: string
          updated_at?: string
          user_credits?: number
        }
        Relationships: []
      }
      project_memory: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          project_id: string | null
          ref_url: string | null
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          project_id?: string | null
          ref_url?: string | null
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          project_id?: string | null
          ref_url?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_memory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
          manually_published_at: string | null
          metadata: Json
          music: string | null
          objective: string | null
          output_url: string | null
          platform: string | null
          platform_urls: Json
          poster_url: string | null
          project_name: string | null
          publish_status: string
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
          manually_published_at?: string | null
          metadata?: Json
          music?: string | null
          objective?: string | null
          output_url?: string | null
          platform?: string | null
          platform_urls?: Json
          poster_url?: string | null
          project_name?: string | null
          publish_status?: string
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
          manually_published_at?: string | null
          metadata?: Json
          music?: string | null
          objective?: string | null
          output_url?: string | null
          platform?: string | null
          platform_urls?: Json
          poster_url?: string | null
          project_name?: string | null
          publish_status?: string
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
      quality_scores: {
        Row: {
          asset_type: string
          created_at: string
          id: string
          project_id: string | null
          recommendations: Json
          scores: Json
          user_id: string
        }
        Insert: {
          asset_type: string
          created_at?: string
          id?: string
          project_id?: string | null
          recommendations?: Json
          scores?: Json
          user_id: string
        }
        Update: {
          asset_type?: string
          created_at?: string
          id?: string
          project_id?: string | null
          recommendations?: Json
          scores?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quality_scores_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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
      repurposed_assets: {
        Row: {
          content: Json
          created_at: string
          format: string
          id: string
          source_project_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          content?: Json
          created_at?: string
          format: string
          id?: string
          source_project_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          format?: string
          id?: string
          source_project_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repurposed_assets_source_project_id_fkey"
            columns: ["source_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      research_reports: {
        Row: {
          created_at: string
          findings: Json
          id: string
          niche: string | null
          platform: string | null
          project_id: string | null
          sources: Json
          topic: string
          user_id: string
        }
        Insert: {
          created_at?: string
          findings?: Json
          id?: string
          niche?: string | null
          platform?: string | null
          project_id?: string | null
          sources?: Json
          topic: string
          user_id: string
        }
        Update: {
          created_at?: string
          findings?: Json
          id?: string
          niche?: string | null
          platform?: string | null
          project_id?: string | null
          sources?: Json
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          attempts: number
          caption: string | null
          connection_id: string | null
          created_at: string
          external_post_id: string | null
          external_post_url: string | null
          hashtags: string | null
          id: string
          last_error: string | null
          media_urls: Json
          platform: string
          project_id: string | null
          published_at: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string | null
          id?: string
          last_error?: string | null
          media_urls?: Json
          platform: string
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          external_post_id?: string | null
          external_post_url?: string | null
          hashtags?: string | null
          id?: string
          last_error?: string | null
          media_urls?: Json
          platform?: string
          project_id?: string | null
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          audience: string | null
          created_at: string
          frequency: string | null
          goal: string | null
          id: string
          plan: Json
          primary_platform: string | null
          product: string | null
          project_id: string | null
          promoting: string | null
          secondary_platforms: string[] | null
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          frequency?: string | null
          goal?: string | null
          id?: string
          plan?: Json
          primary_platform?: string | null
          product?: string | null
          project_id?: string | null
          promoting?: string | null
          secondary_platforms?: string[] | null
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          frequency?: string | null
          goal?: string | null
          id?: string
          plan?: Json
          primary_platform?: string | null
          product?: string | null
          project_id?: string | null
          promoting?: string | null
          secondary_platforms?: string[] | null
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_project_id_fkey"
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
          included_credits: number
          lifetime_access: boolean
          monthly_credit_limit: number
          monthly_credits_used: number
          plan_name: string
          plan_type: string
          renews_at: string | null
          started_at: string
          status: string
          unlimited_usage: boolean
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          included_credits?: number
          lifetime_access?: boolean
          monthly_credit_limit?: number
          monthly_credits_used?: number
          plan_name?: string
          plan_type?: string
          renews_at?: string | null
          started_at?: string
          status?: string
          unlimited_usage?: boolean
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          included_credits?: number
          lifetime_access?: boolean
          monthly_credit_limit?: number
          monthly_credits_used?: number
          plan_name?: string
          plan_type?: string
          renews_at?: string | null
          started_at?: string
          status?: string
          unlimited_usage?: boolean
          user_id?: string
        }
        Relationships: []
      }
      template_favorites: {
        Row: {
          created_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_favorites_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          access_tier: string
          active: boolean
          alt_text: string | null
          aspect_ratio: string | null
          category: string
          created_at: string
          created_by: string | null
          default_brief: Json
          default_prompt: string
          description: string
          featured: boolean
          id: string
          name: string
          platform: string | null
          poster_url: string | null
          preview_image_url: string | null
          preview_type: string
          preview_video_url: string | null
          slug: string
          sort_order: number
          style: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          access_tier?: string
          active?: boolean
          alt_text?: string | null
          aspect_ratio?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          default_brief?: Json
          default_prompt?: string
          description?: string
          featured?: boolean
          id?: string
          name: string
          platform?: string | null
          poster_url?: string | null
          preview_image_url?: string | null
          preview_type?: string
          preview_video_url?: string | null
          slug: string
          sort_order?: number
          style?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          access_tier?: string
          active?: boolean
          alt_text?: string | null
          aspect_ratio?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          default_brief?: Json
          default_prompt?: string
          description?: string
          featured?: boolean
          id?: string
          name?: string
          platform?: string | null
          poster_url?: string | null
          preview_image_url?: string | null
          preview_type?: string
          preview_video_url?: string | null
          slug?: string
          sort_order?: number
          style?: string | null
          tags?: string[]
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "usage_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      refund_credits: {
        Args: {
          _amount: number
          _description: string
          _project_id: string
          _source: string
          _user_id: string
        }
        Returns: Json
      }
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

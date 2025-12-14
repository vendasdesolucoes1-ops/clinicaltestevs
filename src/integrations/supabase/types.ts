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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          case_id: string | null
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          case_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          case_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_exports: {
        Row: {
          case_id: string
          created_at: string
          file_name: string
          format: Database["public"]["Enums"]["export_format"]
          id: string
          storage_path: string | null
          version_id: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          file_name: string
          format: Database["public"]["Enums"]["export_format"]
          id?: string
          storage_path?: string | null
          version_id?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          file_name?: string
          format?: Database["public"]["Enums"]["export_format"]
          id?: string
          storage_path?: string | null
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_exports_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_exports_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "case_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      case_photos: {
        Row: {
          angle: Database["public"]["Enums"]["photo_angle"]
          captured_at: string
          case_id: string
          created_at: string
          id: string
          storage_path: string | null
          url: string
        }
        Insert: {
          angle: Database["public"]["Enums"]["photo_angle"]
          captured_at?: string
          case_id: string
          created_at?: string
          id?: string
          storage_path?: string | null
          url: string
        }
        Update: {
          angle?: Database["public"]["Enums"]["photo_angle"]
          captured_at?: string
          case_id?: string
          created_at?: string
          id?: string
          storage_path?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_photos_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_versions: {
        Row: {
          author_id: string | null
          canvas_state: Json | null
          case_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["simulation_status"]
          sub_version: number | null
          thumbnail_url: string | null
          type: Database["public"]["Enums"]["version_type"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          canvas_state?: Json | null
          case_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["simulation_status"]
          sub_version?: number | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["version_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          canvas_state?: Json | null
          case_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["simulation_status"]
          sub_version?: number | null
          thumbnail_url?: string | null
          type?: Database["public"]["Enums"]["version_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_versions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_versions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_cases: {
        Row: {
          codename: string
          consent_date: string | null
          consent_registered: boolean
          created_at: string
          id: string
          notes: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["case_status"]
          tags: string[] | null
          type: Database["public"]["Enums"]["case_type"]
          updated_at: string
        }
        Insert: {
          codename: string
          consent_date?: string | null
          consent_registered?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          tags?: string[] | null
          type: Database["public"]["Enums"]["case_type"]
          updated_at?: string
        }
        Update: {
          codename?: string
          consent_date?: string | null
          consent_registered?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          tags?: string[] | null
          type?: Database["public"]["Enums"]["case_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinical_cases_responsible_id_fkey"
            columns: ["responsible_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_analyses: {
        Row: {
          case_id: string
          connections: Json | null
          created_at: string
          created_by: string | null
          custom_connections: Json | null
          custom_points: Json | null
          face_roi: Json | null
          id: string
          midline_points: string[] | null
          photo_id: string
          points: Json | null
          regional_scores: Json | null
          symmetry_score: number | null
          updated_at: string
        }
        Insert: {
          case_id: string
          connections?: Json | null
          created_at?: string
          created_by?: string | null
          custom_connections?: Json | null
          custom_points?: Json | null
          face_roi?: Json | null
          id?: string
          midline_points?: string[] | null
          photo_id: string
          points?: Json | null
          regional_scores?: Json | null
          symmetry_score?: number | null
          updated_at?: string
        }
        Update: {
          case_id?: string
          connections?: Json | null
          created_at?: string
          created_by?: string | null
          custom_connections?: Json | null
          custom_points?: Json | null
          face_roi?: Json | null
          id?: string
          midline_points?: string[] | null
          photo_id?: string
          points?: Json | null
          regional_scores?: Json | null
          symmetry_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facial_analyses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facial_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facial_analyses_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "case_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      facial_analysis_jobs: {
        Row: {
          case_id: string
          error_message: string | null
          error_stage: string | null
          image_url: string
          job_id: string
          status: Database["public"]["Enums"]["job_status"]
          timestamp_end: string | null
          timestamp_start: string | null
        }
        Insert: {
          case_id: string
          error_message?: string | null
          error_stage?: string | null
          image_url: string
          job_id: string
          status: Database["public"]["Enums"]["job_status"]
          timestamp_end?: string | null
          timestamp_start?: string | null
        }
        Update: {
          case_id?: string
          error_message?: string | null
          error_stage?: string | null
          image_url?: string
          job_id?: string
          status?: Database["public"]["Enums"]["job_status"]
          timestamp_end?: string | null
          timestamp_start?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      simulation_jobs: {
        Row: {
          case_id: string
          completed_at: string | null
          id: string
          parameters: Json | null
          progress: number
          started_at: string
          status: Database["public"]["Enums"]["simulation_status"]
          version_id: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          id?: string
          parameters?: Json | null
          progress?: number
          started_at?: string
          status?: Database["public"]["Enums"]["simulation_status"]
          version_id: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          id?: string
          parameters?: Json | null
          progress?: number
          started_at?: string
          status?: Database["public"]["Enums"]["simulation_status"]
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulation_jobs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "clinical_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulation_jobs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "case_versions"
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
      has_case_access: { Args: { _case_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit: {
        Args: {
          _action: string
          _case_id: string
          _description?: string
          _metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "cirurgiao" | "residente" | "admin"
      case_status: "ativo" | "arquivado" | "em_processamento"
      case_type: "queimadura" | "trauma"
      export_format: "png" | "jpg" | "pdf"
      job_status: "pending" | "processing" | "failed" | "success"
      photo_angle: "frente" | "perfil_d" | "perfil_e" | "tres_quartos"
      simulation_status: "processando" | "pronto" | "falhou"
      version_type: "base" | "A" | "B"
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
      app_role: ["cirurgiao", "residente", "admin"],
      case_status: ["ativo", "arquivado", "em_processamento"],
      case_type: ["queimadura", "trauma"],
      export_format: ["png", "jpg", "pdf"],
      job_status: ["pending", "processing", "failed", "success"],
      photo_angle: ["frente", "perfil_d", "perfil_e", "tres_quartos"],
      simulation_status: ["processando", "pronto", "falhou"],
      version_type: ["base", "A", "B"],
    },
  },
} as const

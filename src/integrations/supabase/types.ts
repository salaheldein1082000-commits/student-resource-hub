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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_published: boolean
          kind: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          title?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          brief: string | null
          created_at: string
          criteria_codes: string[]
          due_date: string | null
          id: string
          is_published: boolean
          learning_aim: string | null
          title: string
          unit_no: number
          updated_at: string
        }
        Insert: {
          brief?: string | null
          created_at?: string
          criteria_codes?: string[]
          due_date?: string | null
          id?: string
          is_published?: boolean
          learning_aim?: string | null
          title: string
          unit_no?: number
          updated_at?: string
        }
        Update: {
          brief?: string | null
          created_at?: string
          criteria_codes?: string[]
          due_date?: string | null
          id?: string
          is_published?: boolean
          learning_aim?: string | null
          title?: string
          unit_no?: number
          updated_at?: string
        }
        Relationships: []
      }
      attempts: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          attempt_no: number
          declaration_accepted: boolean
          declared_at: string
          feedback: string | null
          file_name: string
          file_path: string
          id: string
          note: string | null
          submission_id: string
          submitted_at: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          attempt_no: number
          declaration_accepted: boolean
          declared_at: string
          feedback?: string | null
          file_name: string
          file_path: string
          id?: string
          note?: string | null
          submission_id: string
          submitted_at?: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          attempt_no?: number
          declaration_accepted?: boolean
          declared_at?: string
          feedback?: string | null
          file_name?: string
          file_path?: string
          id?: string
          note?: string | null
          submission_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria: {
        Row: {
          code: string
          description: string
          grade: string
          learning_aim: string
          sort_order: number
          unit_no: number
        }
        Insert: {
          code: string
          description: string
          grade: string
          learning_aim: string
          sort_order?: number
          unit_no?: number
        }
        Update: {
          code?: string
          description?: string
          grade?: string
          learning_aim?: string
          sort_order?: number
          unit_no?: number
        }
        Relationships: []
      }
      criterion_results: {
        Row: {
          achieved: boolean
          attempt_id: string
          comment: string | null
          criterion_code: string
        }
        Insert: {
          achieved?: boolean
          attempt_id: string
          comment?: string | null
          criterion_code: string
        }
        Update: {
          achieved?: boolean
          attempt_id?: string
          comment?: string | null
          criterion_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "criterion_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "criterion_results_criterion_code_fkey"
            columns: ["criterion_code"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["code"]
          },
        ]
      }
      feedback_snippets: {
        Row: {
          body: string
          created_at: string
          criterion_code: string | null
          id: string
        }
        Insert: {
          body: string
          created_at?: string
          criterion_code?: string | null
          id?: string
        }
        Update: {
          body?: string
          created_at?: string
          criterion_code?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_snippets_criterion_code_fkey"
            columns: ["criterion_code"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      resource_views: {
        Row: {
          id: string
          resource_id: string
          student_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          resource_id: string
          student_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          resource_id?: string
          student_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_views_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_views_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_pinned: boolean
          is_published: boolean
          learning_aim: string
          linked_criteria: string[]
          sort_order: number
          title: string
          type: string
          unit_no: number
          updated_at: string
          url: string
          visible_from: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          learning_aim: string
          linked_criteria?: string[]
          sort_order?: number
          title: string
          type: string
          unit_no?: number
          updated_at?: string
          url: string
          visible_from?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          learning_aim?: string
          linked_criteria?: string[]
          sort_order?: number
          title?: string
          type?: string
          unit_no?: number
          updated_at?: string
          url?: string
          visible_from?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string
          created_at: string
          id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          id?: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "assessor" | "student"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["assessor", "student"],
    },
  },
} as const

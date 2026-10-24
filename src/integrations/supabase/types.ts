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
      assignment_classes: {
        Row: {
          assigned_at: string
          assignment_id: string
          class_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_id: string
          class_id: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          class_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_classes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          brief: string | null
          brief_pdf_url: string | null
          created_at: string
          criteria_codes: string[]
          due_date: string | null
          id: string
          is_published: boolean
          learning_aim: string | null
          part: number
          title: string
          total_parts: number
          unit_no: number
          updated_at: string
        }
        Insert: {
          brief?: string | null
          brief_pdf_url?: string | null
          created_at?: string
          criteria_codes?: string[]
          due_date?: string | null
          id?: string
          is_published?: boolean
          learning_aim?: string | null
          part?: number
          title: string
          total_parts?: number
          unit_no?: number
          updated_at?: string
        }
        Update: {
          brief?: string | null
          brief_pdf_url?: string | null
          created_at?: string
          criteria_codes?: string[]
          due_date?: string | null
          id?: string
          is_published?: boolean
          learning_aim?: string | null
          part?: number
          title?: string
          total_parts?: number
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
      class_engineers: {
        Row: {
          assigned_at: string
          class_id: string
          engineer_id: string
        }
        Insert: {
          assigned_at?: string
          class_id: string
          engineer_id: string
        }
        Update: {
          assigned_at?: string
          class_id?: string
          engineer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_engineers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: true
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_engineers_engineer_id_fkey"
            columns: ["engineer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          capacity: number
          created_at: string
          id: string
          name: string
          unit_no: number
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          name: string
          unit_no?: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          name?: string
          unit_no?: number
          updated_at?: string
        }
        Relationships: []
      }
      criteria: {
        Row: {
          assignment_id: string | null
          code: string
          description: string
          grade: string
          id: string
          learning_aim: string
          sort_order: number
          task_no: number | null
          unit_no: number
        }
        Insert: {
          assignment_id?: string | null
          code: string
          description: string
          grade: string
          id?: string
          learning_aim: string
          sort_order?: number
          task_no?: number | null
          unit_no?: number
        }
        Update: {
          assignment_id?: string | null
          code?: string
          description?: string
          grade?: string
          id?: string
          learning_aim?: string
          sort_order?: number
          task_no?: number | null
          unit_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "criteria_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
      }
      feedback_summary: {
        Row: {
          assessor_name: string | null
          general_comments: string | null
          id: string
          published: boolean
          published_at: string | null
          submission_id: string
        }
        Insert: {
          assessor_name?: string | null
          general_comments?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          submission_id: string
        }
        Update: {
          assessor_name?: string | null
          general_comments?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_summary_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      gradings: {
        Row: {
          achieved: boolean
          assessed_at: string | null
          comment: string | null
          criterion_id: string
          id: string
          submission_id: string
        }
        Insert: {
          achieved: boolean
          assessed_at?: string | null
          comment?: string | null
          criterion_id: string
          id?: string
          submission_id: string
        }
        Update: {
          achieved?: boolean
          assessed_at?: string | null
          comment?: string | null
          criterion_id?: string
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradings_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          class_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          group_name: string | null
          id: string
          role: string
        }
        Insert: {
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          group_name?: string | null
          id: string
          role?: string
        }
        Update: {
          avatar_url?: string | null
          class_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          group_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
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
          attempt_no: number
          created_at: string
          file_url: string
          id: string
          status: string
          student_id: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          attempt_no?: number
          created_at?: string
          file_url: string
          id?: string
          status?: string
          student_id: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          attempt_no?: number
          created_at?: string
          file_url?: string
          id?: string
          status?: string
          student_id?: string
          submitted_at?: string
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
      can_access_assignment: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_class: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_submission: {
        Args: { _submission_id: string; _user_id: string }
        Returns: boolean
      }
      can_student_submit: {
        Args: { _assignment_id: string; _user_id: string }
        Returns: boolean
      }
      create_class: {
        Args: { _capacity?: number; _name: string }
        Returns: string
      }
      complete_initial_password_change: { Args: never; Returns: boolean }
      create_engineer: {
        Args: { _email: string; _full_name: string }
        Returns: {
          email: string
          temporary_password: string
          user_id: string
        }[]
      }
      delete_class_with_transfer: {
        Args: { _class_id: string; _target_class_id?: string | null }
        Returns: undefined
      }
      engineer_has_class: {
        Args: { _class_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_students: {
        Args: { _class_id: string; _students: Json }
        Returns: {
          created: boolean
          error: string
          full_name: string
          student_code: string
          temporary_password: string
        }[]
      }
      is_unit_leader: { Args: { _user_id: string }; Returns: boolean }
      set_portal_role: {
        Args: { _profile_id: string; _role: string }
        Returns: undefined
      }
      storage_can_read_brief: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      storage_can_read_submission: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      storage_can_upload_submission: {
        Args: { _object_name: string; _user_id: string }
        Returns: boolean
      }
      update_class_capacity: {
        Args: { _capacity: number; _class_id: string }
        Returns: undefined
      }
      submission_feedback_is_published: {
        Args: { _submission_id: string }
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      daily_recommendations: {
        Row: {
          created_at: string;
          data_complete: boolean;
          departure_rain_mm: number | null;
          departure_risk: number | null;
          departure_risk_source: string | null;
          forecast_fetched_at: string | null;
          id: number;
          locked_at: string | null;
          reason_code: string;
          reason_params: NonNullable<Json>;
          recommendation_date: string;
          return_rain_mm: number | null;
          return_risk: number | null;
          return_risk_latest: number | null;
          return_risk_source: string | null;
          updated_at: string;
          user_id: string;
          vehicle: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          data_complete: boolean;
          departure_rain_mm?: number | null;
          departure_risk?: number | null;
          departure_risk_source?: string | null;
          forecast_fetched_at?: string | null;
          id?: never;
          locked_at?: string | null;
          reason_code: string;
          reason_params?: NonNullable<Json>;
          recommendation_date: string;
          return_rain_mm?: number | null;
          return_risk?: number | null;
          return_risk_latest?: number | null;
          return_risk_source?: string | null;
          updated_at?: string;
          user_id: string;
          vehicle: string;
        };
        Update: {
          created_at?: string;
          data_complete?: boolean;
          departure_rain_mm?: number | null;
          departure_risk?: number | null;
          departure_risk_source?: string | null;
          forecast_fetched_at?: string | null;
          id?: never;
          locked_at?: string | null;
          reason_code?: string;
          reason_params?: NonNullable<Json>;
          recommendation_date?: string;
          return_rain_mm?: number | null;
          return_risk?: number | null;
          return_risk_latest?: number | null;
          return_risk_source?: string | null;
          updated_at?: string;
          user_id?: string;
          vehicle?: string;
        };
        Relationships: [];
      };
      forecast_sync_logs: {
        Row: {
          error_message: string | null;
          fetched_at: string;
          id: number;
          location_key: string;
          records_count: number;
          response_code: number | null;
          status: string;
          trigger: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          error_message?: string | null;
          fetched_at?: string;
          id?: never;
          location_key: string;
          records_count?: number;
          response_code?: number | null;
          status: string;
          trigger: string;
          user_id: string;
        };
        Update: {
          error_message?: string | null;
          fetched_at?: string;
          id?: never;
          location_key?: string;
          records_count?: number;
          response_code?: number | null;
          status?: string;
          trigger?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      hourly_forecasts: {
        Row: {
          fetched_at: string;
          forecast_time: string;
          humidity: number | null;
          id: number;
          latitude: number;
          location_key: string;
          longitude: number;
          precipitation: number | null;
          precipitation_probability: number | null;
          rain: number | null;
          showers: number | null;
          temperature: number | null;
          user_id: string;
          weather_code: number | null;
          wind_speed: number | null;
        };
        ComputedFields: never;
        Insert: {
          fetched_at: string;
          forecast_time: string;
          humidity?: number | null;
          id?: never;
          latitude: number;
          location_key: string;
          longitude: number;
          precipitation?: number | null;
          precipitation_probability?: number | null;
          rain?: number | null;
          showers?: number | null;
          temperature?: number | null;
          user_id: string;
          weather_code?: number | null;
          wind_speed?: number | null;
        };
        Update: {
          fetched_at?: string;
          forecast_time?: string;
          humidity?: number | null;
          id?: never;
          latitude?: number;
          location_key?: string;
          longitude?: number;
          precipitation?: number | null;
          precipitation_probability?: number | null;
          rain?: number | null;
          showers?: number | null;
          temperature?: number | null;
          user_id?: string;
          weather_code?: number | null;
          wind_speed?: number | null;
        };
        Relationships: [];
      };
      job_runs: {
        Row: {
          details: NonNullable<Json>;
          finished_at: string | null;
          id: number;
          job: string;
          started_at: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          details?: NonNullable<Json>;
          finished_at?: string | null;
          id?: never;
          job: string;
          started_at?: string;
          status: string;
        };
        Update: {
          details?: NonNullable<Json>;
          finished_at?: string | null;
          id?: never;
          job?: string;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      notification_logs: {
        Row: {
          created_at: string;
          devices_sent: number;
          error_message: string | null;
          id: number;
          kind: string;
          recommendation_id: number | null;
          sent_at: string | null;
          status: string;
          target_date: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          devices_sent?: number;
          error_message?: string | null;
          id?: never;
          kind: string;
          recommendation_id?: number | null;
          sent_at?: string | null;
          status: string;
          target_date: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          devices_sent?: number;
          error_message?: string | null;
          id?: never;
          kind?: string;
          recommendation_id?: number | null;
          sent_at?: string | null;
          status?: string;
          target_date?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_logs_recommendation_id_fkey";
            columns: ["recommendation_id"];
            isOneToOne: false;
            referencedRelation: "daily_recommendations";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          failure_count: number;
          id: number;
          last_success_at: string | null;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          failure_count?: number;
          id?: never;
          last_success_at?: string | null;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          failure_count?: number;
          id?: never;
          last_success_at?: string | null;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          analysis_duration_minutes: number;
          commute_days: number;
          departure_time: string;
          home_latitude: number | null;
          home_longitude: number | null;
          home_name: string | null;
          locale: string | null;
          notification_time: string;
          notifications_enabled: boolean;
          onboarding_completed: boolean;
          rain_threshold: number;
          return_time: string;
          timezone: string;
          updated_at: string;
          user_id: string;
          work_latitude: number | null;
          work_longitude: number | null;
          work_name: string | null;
        };
        ComputedFields: never;
        Insert: {
          analysis_duration_minutes?: number;
          commute_days?: number;
          departure_time?: string;
          home_latitude?: number | null;
          home_longitude?: number | null;
          home_name?: string | null;
          locale?: string | null;
          notification_time?: string;
          notifications_enabled?: boolean;
          onboarding_completed?: boolean;
          rain_threshold?: number;
          return_time?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
          work_latitude?: number | null;
          work_longitude?: number | null;
          work_name?: string | null;
        };
        Update: {
          analysis_duration_minutes?: number;
          commute_days?: number;
          departure_time?: string;
          home_latitude?: number | null;
          home_longitude?: number | null;
          home_name?: string | null;
          locale?: string | null;
          notification_time?: string;
          notifications_enabled?: boolean;
          onboarding_completed?: boolean;
          rain_threshold?: number;
          return_time?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
          work_latitude?: number | null;
          work_longitude?: number | null;
          work_name?: string | null;
        };
        Relationships: [];
      };
      skipped_days: {
        Row: {
          created_at: string;
          date: string;
          id: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date: string;
          id?: never;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          id?: never;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_scheduler_health: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      run_retention: { Args: Record<PropertyKey, never>; Returns: Json };
      save_forecast_batch: {
        Args: {
          p_fetched_at: string;
          p_latitude: number;
          p_location_key: string;
          p_log: Json;
          p_longitude: number;
          p_rows: Json;
          p_user_id: string;
        };
        Returns: number;
      };
      update_location: {
        Args: {
          p_key: string;
          p_latitude: number;
          p_longitude: number;
          p_name?: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

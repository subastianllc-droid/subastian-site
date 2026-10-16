// Generated from Supabase project "Subastian's Big Project" (yhasuhzqykikacwezwyu).
// Trimmed to the tables the app uses. Regenerate with:
//   npx supabase gen types typescript --project-id yhasuhzqykikacwezwyu > src/lib/database.types.ts

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" };
  public: {
    Tables: {
      guard_skips: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          matched: string;
          monthly_cost: number | null;
          tool_name: string;
          user_id: string;
          was_trial: boolean;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          matched: string;
          monthly_cost?: number | null;
          tool_name: string;
          user_id?: string;
          was_trial?: boolean;
        };
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          customer_portal_url: string | null;
          email: string;
          full_name: string | null;
          id: string;
          ls_customer_id: string | null;
          ls_subscription_id: string | null;
          plan_tier: string;
          subscription_status: string | null;
          updated_at: string;
        };
        Insert: never;
        Update: { full_name?: string | null };
        Relationships: [];
      };
      stacks: {
        Row: { created_at: string; id: string; name: string; user_id: string };
        Insert: { created_at?: string; id?: string; name: string; user_id?: string };
        Update: { name?: string };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          last_used_at: string | null;
          monthly_cost: number;
          renewal_date: string | null;
          stack_id: string | null;
          status: string;
          stopped_at: string | null;
          tool_name: string;
          trial_ends_at: string | null;
          trial_outcome: string | null;
          user_id: string;
        };
        Insert: {
          category: string;
          id?: string;
          last_used_at?: string | null;
          monthly_cost: number;
          renewal_date?: string | null;
          stack_id?: string | null;
          status?: string;
          tool_name: string;
          trial_ends_at?: string | null;
          trial_outcome?: string | null;
          user_id?: string;
        };
        Update: {
          category?: string;
          last_used_at?: string | null;
          monthly_cost?: number;
          renewal_date?: string | null;
          stack_id?: string | null;
          status?: string;
          tool_name?: string;
          trial_ends_at?: string | null;
          trial_outcome?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_stack_id_fkey";
            columns: ["stack_id"];
            isOneToOne: false;
            referencedRelation: "stacks";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Stack = Database["public"]["Tables"]["stacks"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type GuardSkip = Database["public"]["Tables"]["guard_skips"]["Row"];

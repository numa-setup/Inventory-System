/**
 * Supabase database types.
 *
 * TEMPORARY STUB — permissive typing so the typed clients compile before the
 * schema is live. After running the migrations, regenerate with:
 *
 *   npx supabase gen types typescript --project-id qdftxmdxernjzwipqyrq > src/lib/supabase/types.ts
 *
 * and this stub is replaced with fully-typed tables.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Database {
  public: {
    Tables: {
      [key: string]: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
    };
    Views: { [key: string]: { Row: Record<string, any> } };
    Functions: { [key: string]: { Args: Record<string, any>; Returns: any } };
    Enums: { [key: string]: string };
    CompositeTypes: Record<string, never>;
  };
}

/**
 * Supabase database types.
 *
 * TEMPORARY: permissive typing so queries compile before generated types exist.
 * After the schema settled, regenerate fully-typed tables with:
 *
 *   npx supabase gen types typescript --project-id qdftxmdxernjzwipqyrq > src/lib/supabase/types.ts
 *
 * Until then, `Database` is `any` so `.from(...).select(...)` returns loose rows.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

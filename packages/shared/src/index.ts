// @hamza/shared — barrel entry point.
// Consumers import via stable subpaths (e.g. "@hamza/shared/utils",
// "@hamza/shared/pricing", "@hamza/shared/ui/Button",
// "@hamza/shared/supabase/server"). This index re-exports the common,
// dependency-free utilities for the bare "@hamza/shared" specifier.
export * from "./utils";

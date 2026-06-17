// Central error sink. Today it logs to the console; it's the single place to
// later forward to a monitoring service (Sentry, Logflare, etc.) without
// touching call sites.
export function logError(error: unknown, context?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error("[hgs]", error, context ?? "");
  // TODO: forward to monitoring here.
}

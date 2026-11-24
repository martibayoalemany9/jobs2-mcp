/** Optional Sentry. Set SENTRY_DSN. Avoids a hard dependency so tests stay zero-install. */
export async function captureException(err) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  try {
    const Sentry = await import("@sentry/node")
    if (!globalThis.__jobs2McpSentry) {
      Sentry.init({ dsn, tracesSampleRate: 0.05 })
      globalThis.__jobs2McpSentry = true
    }
    Sentry.captureException(err)
  } catch {
    /* package not installed in CI */
  }
}

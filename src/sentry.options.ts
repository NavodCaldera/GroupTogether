import type { BrowserOptions, NodeOptions } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "@/lib/sentry-scrub";

/** Shared Sentry settings. Errors only (no tracing or replay), off without a DSN or in tests. */
export function sentryOptions(dsn: string | undefined): BrowserOptions & NodeOptions {
  return {
    dsn,
    enabled: Boolean(dsn) && process.env.GROUPBASKET_E2E !== "1",
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // v11 collects all of these by default. Stack-frame variables could hold NIC or bank values.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  };
}

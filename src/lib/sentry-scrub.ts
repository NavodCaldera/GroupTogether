import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/**
 * Scrubs Sentry events before they leave the app. NIC numbers, bank details, slips, tokens and
 * payment evidence must never reach Sentry: bodies, cookies, headers and extras are dropped
 * whole, and remaining text has identifiers, long numbers and secret URL segments masked.
 */

// Invite, sign-in and share codes, and private document ids, are secrets in the URL.
const SECRET_PATHS =
  /(\/(?:factories\/sign-in|factories\/apply|c|api\/partner-docs|api\/slips|api\/brand-photos)\/)[^/?#\s]+/g;

export function scrubText(text: string): string {
  return text
    .replace(SECRET_PATHS, (_, prefix: string) => `${prefix}[redacted]`)
    .replace(/(\/[^\s?]*)\?[^\s#]*/g, "$1") // query strings
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
    .replace(/\b(?:\d{9}[VvXx]|\d{12})\b/g, "[nic]")
    .replace(/\b\d[\d -]{6,}\d\b/g, "[number]");
}

function scrubData(data: Record<string, unknown> | undefined) {
  if (!data) return data;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (/body|data|input|payload|cookie|header|token|password/i.test(key)) continue;
    kept[key] = typeof value === "string" ? scrubText(value) : value;
  }
  return kept;
}

export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  return {
    ...crumb,
    ...(crumb.message !== undefined && { message: scrubText(crumb.message) }),
    ...(crumb.data !== undefined && { data: scrubData(crumb.data) }),
  };
}

export function scrubEvent<E extends Partial<ErrorEvent>>(event: E): E {
  const out: E = { ...event };
  delete out.extra;
  if (out.user) out.user = out.user.id === undefined ? {} : { id: out.user.id };
  if (out.request) out.request = out.request.url ? { url: scrubText(out.request.url) } : {};
  if (out.message) out.message = scrubText(out.message);
  if (out.transaction) out.transaction = scrubText(out.transaction);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({
        ...v,
        ...(v.value !== undefined && { value: scrubText(v.value) }),
        ...(v.stacktrace?.frames && {
          stacktrace: {
            ...v.stacktrace,
            frames: v.stacktrace.frames.map(({ vars: _vars, ...f }) => f),
          },
        }),
      })),
    };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb);
  return out;
}

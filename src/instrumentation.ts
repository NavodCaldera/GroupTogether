import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.options";

export function register() {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN));
}

// Sends server component, route handler and server action errors to Sentry.
export const onRequestError = Sentry.captureRequestError;

You are implementing **production hardening change 4: security headers** in the GroupBasket repo at
the current directory, branch `main`. Claude Code reviews your work afterwards.

## Read first

1. `AGENTS.md`, `CLAUDE.md`.
2. `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` and the `headers`
   reference under `node_modules/next/dist/docs/01-app/03-api-reference/05-config/` (non-standard
   Next.js version: follow these, not memory).
3. `next.config.ts` (it is wrapped in `withSentryConfig`; keep that), `src/components/location-picker.tsx`
   (loads Leaflet from unpkg, OpenStreetMap tiles, Photon search), `src/sentry.options.ts`,
   `src/app/api/slips/[id]/route.ts` and `src/app/api/partner-docs/[id]/route.ts` (these set their own
   stricter CSP; it must survive).

## What to build (config only: `next.config.ts`, no proxy/middleware, no new dependency)

Add an `async headers()` returning, for `source: "/:path*"`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — **production only**
  (`process.env.NODE_ENV === "production"`); no `preload`.
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Content-Security-Policy` built from an array joined with `; `:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' https://unpkg.com` plus `'unsafe-eval'` **in development only**
    (`'unsafe-inline'` is needed because Next's inline bootstrap scripts need a nonce otherwise, and
    nonces require a proxy; this change is config only. Put this reason in a code comment.)
  - `style-src 'self' 'unsafe-inline' https://unpkg.com`
  - `img-src 'self' data: blob: https://tile.openstreetmap.org https://unpkg.com`
  - `font-src 'self'`
  - `connect-src 'self' https://photon.komoot.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`
    (plus `ws:` in development for hot reload)
  - `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
  - `upgrade-insecure-requests` in production only

The slip and partner-document routes must still send **their own** CSP (`default-src 'none' … sandbox`)
and not the site-wide one. If Next merges or duplicates the header, exclude those paths from the
site-wide CSP rule (e.g. a second `source` with a `missing`/negative match, or separate rules) — check
the docs for what this version supports.

## Tests (write first, see them fail, then implement)

`tests/e2e/security-headers.spec.ts` (desktop project):
1. `GET /` has all five headers (HSTS is absent in dev; assert it only when `process.env.CI`, which
   runs `next start`) and CSP contains `frame-ancestors 'none'`.
2. A signed-in owner's slip URL or partner-doc URL returns its own `default-src 'none'` CSP, with
   exactly one `content-security-policy` header value.
3. No CSP violations: collect `page.on("console")` messages matching `/Content Security Policy/i`
   and `securitypolicyviolation` events, while visiting as seeded users: `/shop`, a product page
   with a photo, `/messages` (chat, send one message), an admin page (`/admin/slips`), the sign-up
   page with the location picker map (wait for a map tile to load and type into the place search),
   and `/e2e-error`. Expect zero violations.

Use the existing helpers in `tests/e2e/seed-fixtures.ts` and the `signIn` pattern from
`tests/e2e/journey.spec.ts`.

## Constraints

- No new dependencies or paid services. Do not touch factory partnership, auth or Sentry logic.
- Update `docs/CHANGES.md` (newest first, dated 2026-11-05, "Production hardening 4: security
  headers"), `docs/implementation-status.md` (Production hardening section), and
  `.claude/agents/frontend.md` (one line: any new external origin must be added to the CSP in
  `next.config.ts`). Commit this prompt file too.
- Stage by path, never `git add -A`. One commit with your `Co-Authored-By` line.
- Run `npm run check`, `npm run build`, `npm run e2e` (full). The known failure
  `tests/e2e/admin-workspaces.spec.ts:15` (Factories nav now has "Applications") may still fail —
  report it, do not fix it here. Any **other** failure blocks the push.
- Only if the above pass: `git push origin main`. No force-push, deploy, production data, secrets
  or branch resets.

## Report

Commit hash, push result, each command's summary, any CSP source you had to add beyond this list
and why, and anything you were unsure about.

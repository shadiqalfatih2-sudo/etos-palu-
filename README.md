# Dashboard Awardee ETOS ID Palu

Production dashboard for ETOS ID Palu.

## Architecture

- **Frontend:** canonical legacy HTML/CSS/JavaScript UI, modernized through runtime compatibility layers.
- **Hosting / CDN:** Vercel.
- **Build:** `node build.js` produces the `dist/` artifact used by Vercel.
- **Backend API:** Supabase Edge Functions.
- **Database:** Supabase PostgreSQL.
- **Authentication:** server-validated custom facilitator/admin sessions with expiry and revocation.
- **IDP:** central Google Drive workbook, read only through the authenticated ETOS backend. Supabase stores a server cache for resilience.
- **Source control:** GitHub `main` -> Vercel production deployment.

This project is a full-stack web application, but it is **not a Next.js application**. The current production strategy deliberately preserves the canonical dashboard interface while replacing the former Google Apps Script/Spreadsheet backend with Supabase.

## Production data principles

- No simulated success responses in production.
- No synthetic Awardee progress or analytics.
- Missing data is shown as unavailable/N/A instead of fabricated zero values.
- Sensitive write operations are routed through authenticated server functions.
- Alumni portfolio, facilitator data, assessment, mentoring, coaching, Awardee 360, IDP detail and operational attendance actions are not exposed as unrestricted public database writes.

## IDP security modes

`etos-idp-live` supports two server modes:

1. `google_drive_authenticated` — preferred production mode using a Google service account with Drive read-only scope.
2. `google_drive_public_transition` — temporary compatibility mode while the central workbook still permits link-based download.

When Google service-account credentials are configured, the Edge Function does **not** fall back to anonymous Drive access. If authenticated Drive access fails, ETOS falls back only to the latest Supabase IDP cache.

Public GET access to the IDP live endpoint is disabled. POST requests require a valid facilitator session.

The Google Drive file identifier is not stored in browser code or public GitHub source. By default it is read from the RLS-protected `etos_server_settings` table. `GOOGLE_DRIVE_SOURCE_ID` is supported only as an optional server-side environment override.

See [SECURITY.md](SECURITY.md) for the final Google Drive lockdown procedure.

## Deployment

Production application: https://etos-palu.vercel.app

Vercel runs `node build.js` and publishes `dist/`. The build contains integrity checks for the canonical UI and guards designed to prevent legacy dummy/simulation markers from being published.

## Secrets

Never commit any of the following to GitHub:

- Supabase service-role key
- Google service-account JSON/private key
- facilitator/admin password
- production session tokens

Google service-account credentials must be stored as Supabase Edge Function secrets/environment variables, not in source code.

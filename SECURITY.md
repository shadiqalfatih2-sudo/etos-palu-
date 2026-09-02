# ETOS ID Palu — Production Security Runbook

## Current backend controls

- Facilitator/admin operations use server-validated sessions.
- Sessions expire and can be revoked by logout.
- IDP live POST requests require a valid facilitator session.
- IDP live GET requests are disabled (`405`).
- Diagnostic IDP probe/health functions are retired and JWT-protected.
- Sensitive table writes are not granted directly to the browser role.
- Production UI fails closed when the secure runtime is unavailable; it does not report simulated success.
- Supabase IDP snapshots act as a resilience cache when the central Drive source is temporarily unavailable.
- The Google Drive source identifier is stored server-side and is not exposed in browser code or the default GitHub branch.

## Final Google Drive lockdown

The central IDP workbook must not remain editable by `Anyone with the link`.

Preferred final architecture:

`Browser -> Vercel UI -> authenticated Supabase Edge Function -> Google Drive API (service account, readonly) -> Supabase cache`

### 1. Create a Google Cloud service account

Create a dedicated service account for ETOS IDP read access. It should not be an administrator account and should not receive unrelated Google Cloud roles.

Create a JSON key only for this server identity. Treat the JSON/private key as a production secret.

### 2. Share only the IDP workbook

Share the central IDP workbook directly with the service account email using **Viewer** permission.

Do not give the service account Editor/Writer permission.

### 3. Configure the Supabase Edge Function secret

Configure this value in Supabase Edge Function secrets/environment variables:

- `GOOGLE_SERVICE_ACCOUNT_JSON` — the complete service-account JSON credential.

The central Drive file identifier is already stored in the RLS-protected `etos_server_settings` table. `GOOGLE_DRIVE_SOURCE_ID` can be used as an optional server-side environment override, but it is not required for the current deployment.

Do not commit credentials or source identifiers to public source code.

The deployed `etos-idp-live` function automatically switches to `google_drive_authenticated` when `GOOGLE_SERVICE_ACCOUNT_JSON` exists.

### 4. Verify before removing public access

With the service-account secret configured:

1. Log in to ETOS as facilitator.
2. Refresh IDP overview.
3. Confirm all active Awardees are connected.
4. Open an Awardee IDP detail.
5. Confirm Awardee 360 still reports the latest IDP sync.
6. Confirm the server snapshot `source_mode` is `google_drive_authenticated`.

Only continue when these checks pass.

### 5. Remove link-based sharing

In Google Drive sharing settings for the central IDP workbook:

- remove `Anyone with the link`, or set General access to **Restricted**;
- retain the dedicated service account as **Viewer**;
- retain only intentional ETOS staff/groups with the minimum necessary permission.

After changing the permission, repeat the IDP refresh and Awardee 360 checks.

## Secret handling rules

Never put the following into GitHub issues, README files, Vercel client-side environment variables, screenshots, or browser JavaScript:

- Supabase service-role key
- Google private key/service-account JSON
- facilitator/admin password
- live session tokens

If a Google service-account key is accidentally exposed, revoke/delete that key in Google Cloud immediately and create a replacement.

## Incident response

If IDP live access fails after Drive lockdown:

1. Keep the Drive file Restricted; do not restore public Writer access as a quick fix.
2. Verify the service account still has Viewer access to the workbook.
3. Verify Supabase secrets are present and valid.
4. Check `etos-idp-live` Edge Function logs.
5. ETOS can continue to display the last Supabase IDP cache while authenticated Drive access is repaired.

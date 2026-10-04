# v14 — Named Firestore Database Fix

- Server Firebase Admin now connects to the same **named Firestore database** as the browser app (`firestoreDatabaseId` from `firebase-applet-config.json`).
- Fixes Render runtime `5 NOT_FOUND` caused by Admin SDK silently targeting `(default)`.
- `FIRESTORE_DATABASE_ID` is supported as an optional Render override, but is not required while the checked-in Firebase config is correct.
- Startup logs now print the selected Firestore database ID so deployment can be verified without exposing credentials.

<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0ace37ff-f441-4c64-bdb6-3ba856e2147c

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Multi-tenant data isolation

Appointments and customers are now stored only under `/tenants/{tenantId}/...`.
For an existing installation that still has legacy global `/appointments` and `/customers`, call the authenticated one-time endpoint `POST /api/admin/migrate-legacy-alex` before removing legacy collections. The migration copies (does not delete) legacy records into `alex_beauty`.

## Admin redesign v3
- Replaced the legacy stacked appointments screen with a daily timeline workspace.
- Free slots are clickable and open the existing booking flow with date/time prefilled.
- Existing appointment actions remain available: call, SMS reminder, cancel, unblock.
- Existing booking, block-time, SMS settings, service duration/price and customer directory modals are retained.
- Legacy stacked calendar/list UI remains in source for compatibility but is no longer rendered.


## v4
- Added an explicit **שחרור תפיסה** button to blocked/seized slots in the redesigned daily admin calendar.
- Releasing a seized slot uses the existing tenant-scoped cancellation flow and immediately returns the slot to availability.

## v8 – Super Admin business editing
- Removed the "קביעת תור" CTA from the new-business branding preview.
- Added "עריכת עסק" to every tenant card in Super Admin.
- Existing tenant profile, branding, cover, services and working hours can be loaded and updated.
- Tenant ID is locked during editing to protect tenant data isolation.
- Added GET/PUT Super Admin tenant endpoints and custom-domain remapping on edit.

## v9 updates
- Removed public customer-page footer links to Tenant Admin and Super Admin.
- Added 15-minute and 20-minute treatment duration options to business creation/editing.
- Added 15/20-minute quick presets in the admin treatment-duration settings and extended the duration slider down to 15 minutes.


## v10 – Tenant Cover persistence fix
- Fixed Super Admin cover uploads that could exceed the Express JSON request limit.
- Cover images are now compressed to a Firestore-safe size before save.
- API JSON limit increased to safely accept the compressed tenant cover payload.
- Public tenant app continues to read `coverImage` only from its own tenant document.

## v11 — Firebase roles / business-owner login

The server now distinguishes `super_admin` from `business_admin` using Firebase custom claims. Set `SUPER_ADMIN_EMAILS` in Render to the Firebase Authentication email of the platform owner (comma-separated if needed). On the first login, the server bootstraps that account with the `super_admin` claim. Business-owner accounts are created from Super Admin with `role=business_admin` and an immutable `tenantId` claim. The included `firestore.rules` must be deployed to Firebase for database-level tenant isolation.

## v12 – Multi-tenant production fixes
- Server Firestore access now uses Firebase Admin SDK (FIREBASE_SERVICE_ACCOUNT) rather than the browser SDK.
- Alex Beauty is automatically bootstrapped as the primary real tenant and legacy appointments/customers are copied idempotently without deleting originals.
- Removed fake/demo tenant records from the Super Admin API.
- Super Admin tenant loading now force-refreshes the Firebase token and displays API errors instead of silently showing 0.
- Removed insecure legacy admin-header/session-secret bypasses; admin APIs require a valid Firebase ID token.
- SMS settings/reminder dispatch are tenant-aware while the Telnyx sender credentials remain central.
- Reminder locks are tenant-scoped.
- Scheduled reminders skip appointments created after that day's configured reminder cutoff, preventing an appointment created after 20:00 from immediately receiving the 20:00 reminder.
- Existing products/invoices Firestore rules are preserved in firestore.rules.

## v15 – Primary tenant bootstrap fix
- Registers the real legacy Alex Beauty business (`alex_beauty`) during server startup, before traffic is accepted.
- Idempotently copies missing legacy root appointments/customers into the Alex tenant; source documents are never deleted.
- Super Admin waits for Firebase Auth restoration before requesting the protected tenant list.
- Tenant API derives live appointment/customer counts per tenant.
- Super Admin now surfaces API/auth failures instead of silently showing a misleading zero-business state.

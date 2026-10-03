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

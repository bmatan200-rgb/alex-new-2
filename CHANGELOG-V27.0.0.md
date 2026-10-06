# V27.0.0 — PWA installation and home-screen prompt

- Added PWA service-worker registration and retained the existing app icons and manifest setup.
- Added an automatic, tenant-specific prompt on the customer booking page.
- The prompt is offered on each visit until installation is detected or the customer checks “אל תציג שוב”. Clicking Add, opening instructions, or cancelling installation does not persist dismissal.
- There is no manual completion button. On iPhone, choosing Add opens a short Safari guide. Launching from the home-screen icon hides the offer; ordinary Safari visits cannot reliably detect a separate home-screen installation and may still show the offer.
- Android and supported desktop browsers use the native install prompt when available. iPhone and iPad users get Safari instructions.
- The manifest now uses the current business name and opens the installed app directly for that business.
- Existing customer, admin, booking, Firebase, tenant-isolation, and SMS flows were not changed by the PWA feature.

## Verification

- `npm run verify:source` passed.
- The PWA service-worker syntax and manifest JSON checks passed.
- `npm test` and `npm run build` passed after dependencies could be installed.
- TypeScript validation of `AddToHomePrompt.tsx` passed.
- Full-project `npm run lint` reports an existing TS2554 error in `src/components/TorModalFlow.tsx:1104` (three arguments passed to a two-argument function). This file is byte-identical to the supplied V28 archive; the error is outside the install-prompt change.
- Checked Add-click behavior with no native install prompt, native acceptance, cancellation, and failure: none persists dismissal by itself. The browser's appinstalled event or standalone launch records completion. The checkbox stores a separate opt-out for this business.

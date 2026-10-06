# V24.0.1

- Firestore rules now grant global reads only to the verified canonical Super Admin account; server checks also require verified email.
- Customer, owner, blocking, and appointment slot pickers now respect business-specific Friday opening and closing times.
- SMS maintenance switch `SMS_SENDING_ENABLED=false` disables automated, manual, batch, test, and cron sends.
- Saving reminder settings clears the completed in-memory dispatch window so changed hours take effect; durable recipient locks still prevent duplicate sends.
- Public registration stores the submitted terms version, timestamp, and digital signature in the correct business customer record.
- Super Admin shows customer and manager links on the configured business domain.
- Admin logout clears cached appointment and booking capability data from the local browser.
- PWA manifest and install icons no longer refer to missing Alex-only icon files.
- Firebase CLI updated to 15.32.1; production dependency audit reports no known advisories.

## Validation

- TypeScript check passed.
- 8 core tests passed.
- 22 integration tests passed against Firebase Auth and Firestore emulators.
- Production build passed; Vite reports the main JavaScript chunk is above 500 kB.
- `npm audit --omit=dev` reports zero advisories. The full development-tool audit still reports Firebase CLI dependency findings.

## Deployment notes

- Build: `npm ci && npm run build`
- Start: `npm start`
- Keep `SMS_SENDING_ENABLED=false` during deployment and staging checks. Enable after a planned verification.
- Firebase Admin service account, Firestore database ID, provider credentials, DNS, and production rules still require verification in the owner's accounts before production rollout.

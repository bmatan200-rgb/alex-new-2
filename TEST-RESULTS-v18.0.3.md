# v18.0.3 test results

Changes: secure central Cron heartbeat endpoint for cron-job.org.

Validation performed in the build workspace:

- TypeScript/TSX syntax transpile check across 41 source/test files: PASS (0 syntax errors).
- Verified package/package-lock version = 18.0.3.
- Verified `/api/cron/heartbeat` requires `CRON_SECRET` and supports `x-cron-secret`, Bearer token, and query-string fallback.
- Verified existing `/api/sms/check-due` and `/api/reminders/heartbeat` remain behind `requireSuperAdmin`.
- Verified the new endpoint calls the same central `checkAndDispatchDueReminders()` function, so one Cron covers every active/trial tenant.

Full npm test/lint/build could not be completed in this workspace because `npm ci` timed out and left an incomplete `node_modules`; no claim is made that a full local production build passed. Render should run the normal clean install/build during deployment.

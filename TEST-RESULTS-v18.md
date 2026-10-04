# TEST RESULTS — v18

## בוצע בסביבת העבודה

- PASS — parse/syntax של 41 קבצי TypeScript/TSX באמצעות TypeScript transpile diagnostics: 0 שגיאות syntax.
- PASS — `tests/core.test.ts` הורץ לאחר transpile מקומי ל־CommonJS: 8/8 בדיקות עברו (tenant IDs, tenant authorization, Israeli phone normalization/reminder key, Jerusalem clock/DST, date/time validation, Firebase service-account parser, secret redaction, overlap logic).
- PASS — source regression checks: named Firestore נשמר, scheduler default 5m וללא heartbeat שרת של 30s, migration marker קיים, HTTP נקשר לפני bootstrap maintenance, quota backoff מקומי קיים, aggregation counters קיימים, appointment cache default 10m, public feed future-only, client poll 2m, shared SMS provider default, ותגובה 503 ל־quota.
- PASS — בדיקת JSON ל־`package.json`, `package-lock.json`, `firebase.json`, `firestore.indexes.json` ו־`firebase-applet-config.json`.
- PASS — ה־ZIP הסופי נבדק לאחר יצירה באמצעות `unzip -t`.

## לא בוצע מקומית

`npm ci` לא הצליח להשלים בסביבת הכלים (הורדת dependencies נתקעה/הגיעה ל־timeout), ולכן לא נטען ש־`npm run lint`, `npm run build` או emulator integration suite עברו כאן. Render מוגדר להריץ `npm ci && npm run build`, ולכן ה־deploy הבא הוא גם בדיקת build אמיתית של החבילה.

כדי לא לספק compiled output ישן של v17, תיקיית `dist/` הישנה הוסרה מה־ZIP. היא נוצרת מחדש ב־Render בזמן build.

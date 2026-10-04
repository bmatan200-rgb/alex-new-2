# AUDIT v18 — Firestore Quota / Render Stability / SMS Scheduler

תאריך: 4 באוקטובר 2026. בסיס: `alex-MULTI-TENANT-ADMIN-v17-FULL-FIXED(1).zip`.

## הבעיה שנצפתה בייצור

Render בנה את v17 בהצלחה, Firebase Admin התחבר לפרויקט ול־named Firestore הנכון, אך האתחול נפל עם
`8 RESOURCE_EXHAUSTED` לאחר חריגה ממכסת הקריאות היומית של Firestore. בגלל שה־bootstrap רץ לפני
`app.listen`, התהליך יצא ו־Render נכנס ל־restart loop. בנוסף נמצאו שלושה מקורות מרכזיים לצריכת קריאות:

1. רשימת התורים בדפדפן נמשכה כל 10 שניות, וכל פעם קראה את כל מסמכי התורים.
2. מנוע ה־SMS סרק tenants/settings ותורים כל 30 שניות, גם שעות אחרי חלון התזכורת.
3. Super Admin הוריד את כל מסמכי appointments/customers רק כדי לחשב counters.

## תיקוני v18

- השרת נקשר ל־`PORT` לפני תחזוקת ה־bootstrap. חריגת quota אינה מפילה את Node ואינה יוצרת restart loop.
- `RESOURCE_EXHAUSTED` מפעיל backoff; bootstrap נדחה ומנסה שוב, וה־health endpoint נשאר זמין.
- נוספה מיגרציה חד־פעמית עם marker: `system_migrations/alex_primary_tenant_v18`. לאחר הצלחה אין סריקה מלאה של legacy בכל restart.
- מנוע SMS עבר מ־30 שניות לברירת מחדל של 5 דקות, עם cache של הגדרות ל־15 דקות.
- לכל `tenant + reminder type + target date` מתבצעת סריקה אחת לכל process לאחר שהחלון הגיע; Firestore reminder locks נשארים dedupe מתמשך בין restarts/instances.
- appointment feed בדפדפן עבר מ־10 שניות ל־2 דקות ורק כאשר הטאב פעיל; refresh מיידי נעשה בחזרה לפוקוס ובשינוי auth.
- השרת מחזיק snapshot של appointments ל־10 דקות. יצירה/ביטול מבטלים אותו מיד.
- public availability קורא רק appointments מהיום והלאה; admin שומר גישה להיסטוריה.
- Super Admin counters משתמשים ב־Firestore aggregation `count()` במקום להוריד כל מסמך.
- נוספו caches קצרים לפרופיל tenant, domain resolution ורשימת Super Admin.
- במקרה של quota, APIs מרכזיים מחזירים 503 במקום 403/409 מטעה. לאחר שזוהתה החריגה השרת נכנס ל־backoff ולא מבצע שוב קריאת Firestore בכל poll; snapshot קיים יכול להמשיך להינתן כ־stale.
- ספק Telnyx המרכזי משמש כברירת מחדל את כל העסקים, בהתאם למודל SaaS המבוקש. אפשר לבטל לעסקים שאינם Alex עם `ALLOW_SHARED_SMS_PROVIDER=false`.
- ה־UI שומר snapshot מקומי tenant-scoped ומפסיק למחוק את התצוגה כאשר refresh זמני נכשל.

## התנהגות חשובה

- אם מכסת Firestore כבר נגמרה לפני העלאת v18, v18 לא יכולה להחזיר קריאות למסד לפני איפוס המכסה על ידי Google. היא כן מונעת את קריסת Render ומפחיתה משמעותית את הסיכוי לשרוף שוב את המכסה לאחר האיפוס.
- booking/cancel נשארים טרנזקציוניים. גם אם תצוגת availability בת 1–5 דקות, ניסיון לתפוס שעה שכבר נתפסה עדיין נדחה בשרת.
- SMS dedupe המתמשך נשאר ב־Firestore; cache בזיכרון הוא רק שכבת הפחתת קריאות ולא מקור אמת.

## מה לא שונה

Firebase Authentication, custom claims, Super Admin / business_admin isolation, named Firestore database, tenant paths, cancellation capability, domain mapping וכללי Firestore של v17 נשמרו ללא החלפת מודל הרשאות.

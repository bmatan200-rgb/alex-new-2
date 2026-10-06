# פריסה — V26.0.1

הגרסה מתקנת שני נושאים בלבד: שמירת לקוח אחרי Refresh ושיפור מסלול קביעת התור. היא מבוססת ישירות על V26 הפעילה ולא משנה את כללי ה-Super Admin, בידוד העסקים, Firestore Rules או SMS.

## GitHub

יש להחליף את קבצי הפרויקט בתוכן התיקייה שב-ZIP ולבצע commit, לדוגמה:

`V26.0.1 customer session + booking performance`

החיבור של ChatGPT ל-GitHub בשיחה זו הוא לקריאה בלבד ולכן ה-ZIP מוכן ומלא, אבל לא ניתן היה לבצע push אוטומטי לחשבון.

## Render

מאחר ש-Auto Deploy הושבת לאחר rollback, לאחר שה-commit נמצא ב-main:

1. Render → השירות `alex-new-2`.
2. Manual Deploy → Deploy latest commit.
3. להמתין לסיום Build + Deploy.
4. לפתוח `/api/health` ולוודא שמוחזר `version: 26.0.1`.

## בדיקה אחרי פריסה

- לקוח נרשם → Refresh → נשאר מחובר.
- לקוח של Avi לא מופיע כלקוח מחובר ב-Alex ולהפך.
- קובעים תור → התור מופיע פעם אחת → השעה נתפסת.
- מבטלים → השעה משתחררת.
- אם קביעת תור עדיין איטית, לחפש ב-Render Logs שורה שמתחילה ב-`[Performance] slow booking`; היא כוללת את זמן השרת במילישניות.

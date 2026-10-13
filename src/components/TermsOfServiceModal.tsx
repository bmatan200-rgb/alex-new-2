import { useTenant } from '../context/TenantContext';
import React, { useState } from 'react';
import { X, ShieldCheck, FileText, CheckCircle } from 'lucide-react';

type TermsAudience = 'customer' | 'business';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
  audience?: TermsAudience;
}

const PLATFORM_NAME = 'שירותי תוכנה MB';
const OPERATOR_NAME = 'מתן ביטון';
const OPERATOR_LICENSE = '204501282';
const OPERATOR_EMAIL = 'BMATAN200@GMAIL.COM';
const OPERATOR_PHONE = '[טלפון עסקי להשלמה]';
const TERMS_VERSION = '2026-10-12-v1 — טיוטה';

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({
  isOpen,
  onClose,
  onAccept,
  audience = 'customer',
}) => {
  const { salonInfo } = useTenant();
  const [activeTab, setActiveTab] = useState<'platform' | 'business'>('platform');
  if (!isOpen) return null;

  const isBusiness = audience === 'business';
  const handleAcceptClick = () => {
    onAccept?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md" dir="rtl">
      <section className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-800"
        role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">
        <header className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center"><FileText className="w-5 h-5" /></div>
            <div>
              <h2 id="terms-modal-title" className="text-base sm:text-lg font-black text-slate-900">
                {isBusiness ? 'הסכם שירות ומנוי לבעל העסק' : 'תנאי שימוש והזמנת תור'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{isBusiness ? `${salonInfo.name} • ${PLATFORM_NAME}` : salonInfo.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירת תנאים" className="w-10 h-10 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded-full"><X className="w-5 h-5" /></button>
        </header>

        {!isBusiness && <nav className="flex gap-2 p-3 border-b border-slate-100 bg-white" aria-label="בחירת מסמך">
          <button type="button" onClick={() => setActiveTab('platform')} aria-pressed={activeTab === 'platform'} className={`flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold ${activeTab === 'platform' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
            תנאי הפלטפורמה
          </button>
          <button type="button" onClick={() => setActiveTab('business')} aria-pressed={activeTab === 'business'} className={`flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold ${activeTab === 'business' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
            תנאי העסק והתור
          </button>
        </nav>}

        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-right text-xs sm:text-sm leading-relaxed text-slate-700">
          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-2.5 text-amber-950 text-xs">
            <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span><strong>טיוטה לעיון:</strong> הנוסח דורש השלמת פרטים ובדיקה משפטית לפני הפעלה. טלפון עסקי וקישור למדיניות הפרטיות עדיין חסרים.</span>
          </div>

          {isBusiness ? <>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">1. הצדדים והשירות</h3>
              <p>ההסכם מיועד להסדיר את השימוש של <strong>{salonInfo.name}</strong> (״העסק״) בשירות המקוון לניהול תורים שמפעילה <strong>{PLATFORM_NAME}</strong>, בבעלות {OPERATOR_NAME}, עוסק מורשה {OPERATOR_LICENSE} (״המפעיל״). דוא״ל לפניות: <a className="underline font-bold" href={`mailto:${OPERATOR_EMAIL}`} dir="ltr">{OPERATOR_EMAIL}</a>; טלפון עסקי: {OPERATOR_PHONE}. המערכת מספקת כלי טכנולוגי לניהול תורים, שירותים, הרשאות והודעות. היא אינה מספקת את הטיפול המקצועי ואינה צד להתקשרות בין העסק ללקוחותיו.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">2. חשבון והרשאות</h3>
              <p>העסק יקבל חשבון נפרד. העסק אחראי לנכונות פרטי העסק והמשתמשים, להגדרת הרשאות מתאימות ולשמירה על סיסמאות. אין לנסות לגשת למידע של עסק אחר, לעקוף הגנות או להשתמש במערכת שלא כדין.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">3. מחיר, חיוב וסיום</h3>
              <p>דמי המנוי שסוכמו: <strong>150 ₪ לחודש כולל מע״מ</strong>. מועד תחילת החיוב, אמצעי התשלום, אופן הפקת החשבונית ותנאי הביטול יושלמו בהסכם הפרטני לפני הצטרפות העסק. אין במסמך זה הרשאה לחיוב שלא הוצג ואושר.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">4. אחריות העסק כלפי לקוחותיו</h3>
              <p>העסק אחראי לשירות המקצועי, למחיריו, לרישיונות הנדרשים, למדיניות הביטולים ולהצגת תנאיו ללקוח לפני הזמנה. דמי ביטול או אי-הגעה ייגבו רק אם הוצגו מראש והם מותרים לפי דין.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">5. מידע אישי</h3>
              <p>העסק קובע את מטרות השימוש בפרטי לקוחותיו, והמפעיל מעבד מידע כדי לספק ולתחזק את המערכת, לאבטחה ולתמיכה. הצדדים ישלימו הסכם עיבוד מידע ויפעלו לפי מדיניות הפרטיות והדין. המפעיל ינקט אמצעים סבירים להגנת המידע; אין בכך התחייבות לזמינות רציפה או חסינות מוחלטת מתקלות.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">6. זמינות ושינויים</h3>
              <p>ייתכנו תחזוקה, תקלות תקשורת או השבתות של ספקי שירות חיצוניים. המפעיל יפעל באופן סביר לטיפול בתקלות ולעדכון העסק. זכויות ואחריות הצדדים ייקבעו לפי ההסכם המלא והדין.</p>
            </section>
          </> : activeTab === 'platform' ? <>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">מי מפעיל את הפלטפורמה?</h3>
              <p><strong>{PLATFORM_NAME}</strong>, בבעלות {OPERATOR_NAME}, עוסק מורשה {OPERATOR_LICENSE}. דוא״ל לפניות: <a className="underline font-bold" href={`mailto:${OPERATOR_EMAIL}`} dir="ltr">{OPERATOR_EMAIL}</a>. טלפון עסקי: {OPERATOR_PHONE}. קישור למדיניות הפרטיות יושלם לפני הפעלה.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">1. תפקיד הפלטפורמה</h3>
              <p>הפלטפורמה מאפשרת לאתר מועדים, לשלוח בקשת הזמנה ולקבל עדכונים תפעוליים. השירות המקצועי עצמו, מחירו ואיכותו ניתנים ונקבעים על ידי <strong>{salonInfo.name}</strong>. מפעיל הפלטפורמה מספק כלי טכנולוגי ואינו נותן את הטיפול.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">2. הזמנה ואישורה</h3>
              <p>יש לבדוק את שם העסק, השירות, התאריך, השעה והמחיר לפני האישור. תור נחשב מאושר כשהמערכת מציגה אישור מפורש או סטטוס מאושר. הודעות SMS הן אמצעי עזר ולא מובטח שיגיעו.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">3. ביטול, שינוי ותשלום</h3>
              <p>בקשות לשינוי או לביטול יש להעביר לעסק לפי פרטי הקשר שלו. תנאי הביטול של העסק יוצגו לפני אישור ההזמנה. אין לגבות דמי ביטול אלא אם הוצגו ואושרו מראש, והגבייה מותרת לפי הדין. התשלום עבור הטיפול מתבצע מול העסק, אלא אם צוין אחרת במפורש.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">4. הודעות ופרטיות</h3>
              <p>לצורך תפעול התור עשויים להישלח אישור, תזכורת או עדכון למספר שמסרת. הודעות תפעוליות אינן הסכמה לקבלת פרסומות; דיוור שיווקי יישלח רק על בסיס הסכמה נפרדת ובהתאם לדין. פרטי ההזמנה יעובדו לצורך ההזמנה, השירות, אבטחה ותמיכה כמפורט במדיניות הפרטיות.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">5. שימוש תקין וזמינות</h3>
              <p>אין לקבוע תורים פיקטיביים, להתחזות לאחרים או לנסות לגשת למידע שאינו שלך. ייתכנו הפרעות זמניות עקב תחזוקה או תקלה. פנייה על השירות המקצועי, המחיר או הביטול יש להפנות לעסק; פנייה טכנית אפשר להעביר למפעיל הפלטפורמה.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">6. דין ועדכונים</h3>
              <p>התנאים כפופים לדיני מדינת ישראל. שינוי מהותי יוצג בהתאם לדין. אין בתנאים כדי לגרוע מזכויות שלא ניתן להתנות עליהן.</p>
            </section>
          </> : <>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">העסק נותן את השירות</h3>
              <p>תנאי ההזמנה הם בין הלקוח לבין <strong>{salonInfo.name}</strong>. העסק אחראי לטיפול, למחיר, לבטיחות, לרישיונות ולמענה לתלונות על השירות. הפלטפורמה מספקת מערכת הזמנות בלבד.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">פרטי התור ומדיניות הביטולים</h3>
              <p>השירות, המחיר, מועד התור ותנאי הביטול שיוצגו לפני אישור הם התנאים החלים על ההזמנה, בכפוף לדין. יש לפנות לעסק כדי לשנות או לבטל תור. אין במסמך זה בסיס אוטומטי לחיוב דמי ביטול או אי-הגעה.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">הודעות ופרטיות</h3>
              <p>העסק עשוי לשלוח הודעות תפעוליות לגבי התור. הודעות שיווקיות דורשות הסכמה נפרדת. פרטי ההזמנה נשמרים ומעובדים לצורך תיאום וניהול התור, השירות, תמיכה ואבטחה. אין להזין מידע רפואי רגיש בשדה הערות פתוח.</p>
            </section>
            <section className="space-y-2"><h3 className="font-black text-slate-900 text-base">פרטי העסק</h3>
              <p>{salonInfo.name} • {salonInfo.ownerName} • טלפון: <a className="underline font-bold" href={`tel:${salonInfo.phone}`} dir="ltr">{salonInfo.phone}</a></p>
              <p>העסק נדרש להשלים ולהציג את פרטי השירות ומדיניות הביטולים שלו לפני הפעלת התנאים.</p>
            </section>
          </>}

          <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500">גרסה: {TERMS_VERSION} • לשימוש לאחר השלמת הפרטים ובדיקת עורך דין.</div>
        </div>

        <footer className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200 text-xs sm:text-sm font-bold">סגירה</button>
          {onAccept && <button type="button" onClick={handleAcceptClick} className="py-2.5 px-5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-black flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /><span>קראתי ואני מאשר/ת</span>
          </button>}
        </footer>
      </section>
    </div>
  );
};

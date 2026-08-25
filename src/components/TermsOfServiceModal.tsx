import React from 'react';
import { X, ShieldCheck, FileText, CheckCircle } from 'lucide-react';
import { SALON_INFO } from '../utils/storage';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  if (!isOpen) return null;

  const handleAcceptClick = () => {
    if (onAccept) {
      onAccept();
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terms-modal-title"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 id="terms-modal-title" className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                תקנון ותנאי שימוש
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {SALON_INFO.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="סגירת תקנון"
            className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Scrollable Terms Text */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-right text-xs sm:text-sm leading-relaxed text-slate-700 scroll-smooth">
          <div className="p-3 bg-purple-50/80 rounded-2xl border border-purple-200/80 flex items-start gap-2.5 text-purple-950 text-xs">
            <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
            <span>
              אנא קרא/י בעיון את תנאי השימוש באפליקציה לפני השלמת ההרשמה וקביעת התור.
            </span>
          </div>

          {/* Section 1 */}
          <section className="space-y-1.5 border-b border-slate-100 pb-3.5">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">1</span>
              כללי
            </h3>
            <ul className="list-disc list-inside space-y-1 pr-2 text-slate-600">
              <li>
                תקנון זה מסדיר את תנאי השימוש באפליקציית זימון התורים של <strong>{SALON_INFO.name}</strong> (להלן: &quot;העסק&quot;).
              </li>
              <li>
                השימוש באפליקציה מותנה בהסכמה מלאה לתנאים המפורטים להלן. בעת הרשמתך, הנך מאשר/ת כי הפרטים שנמסרו על ידך (שם מלא ומספר טלפון) נכונים ומדויקים.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-1.5 border-b border-slate-100 pb-3.5">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">2</span>
              פרטיות ואיסוף מידע
            </h3>
            <ul className="list-disc list-inside space-y-1 pr-2 text-slate-600">
              <li>
                הנתונים המוזנים בעת ההרשמה (שם ומספר טלפון) נשמרים במערכת אך ורק לצורך זיהוי אישי, ניהול התורים ויצירת קשר.
              </li>
              <li>
                העסק מתחייב לשמור על פרטיות הלקוחות ולא להעביר את פרטיהם לשום גורם שלישי.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-1.5 border-b border-slate-100 pb-3.5">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">3</span>
              קבלת הודעות ותזכורות
            </h3>
            <ul className="list-disc list-inside space-y-1 pr-2 text-slate-600">
              <li>
                בהרשמתך לאפליקציה, הנך מאשר/ת לקבל תזכורות, אישורי תורים, הודעות על עדכון או ביטול תור, ועדכונים שוטפים מהעסק באמצעות SMS, הודעות WhatsApp או פניות טלפוניות.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-1.5 border-b border-slate-100 pb-3.5">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">4</span>
              זימון, שינוי וביטול תורים
            </h3>
            <ul className="list-disc list-inside space-y-1 pr-2 text-slate-600">
              <li>
                זימון תור, שינויו או ביטולו יתבצעו דרך האפליקציה או בפנייה ישירה לעסק.
              </li>
              <li>
                אנו מבקשים לעדכן על כל שינוי או ביטול מוקדם ככל הניתן כדי לאפשר קבלת לקוחות אחרים / אחרות. אין חיוב או קנס על ביטול תור.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-1.5 border-b border-slate-100 pb-3.5">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">5</span>
              תשלום
            </h3>
            <ul className="list-disc list-inside space-y-1 pr-2 text-slate-600">
              <li>
                התשלום עבור השירותים אינו מתבצע דרך האפליקציה. התשלום יתבצע במועד קבלת השירות, או מראש באמצעי התשלום המוסכמים מול העסק (כגון העברה ב-Bit).
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-1.5 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <h3 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-1.5 text-purple-900">
              <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">6</span>
              פרטי העסק
            </h3>
            <div className="space-y-1 text-slate-700 text-xs sm:text-sm pr-2">
              <p>• <strong>שם העסק:</strong> {SALON_INFO.name}</p>
              <p>• <strong>עוסק פטור:</strong> אלכסנדרה ביטון</p>
            </div>
          </section>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl text-slate-600 hover:bg-slate-200/70 text-xs sm:text-sm font-bold transition cursor-pointer"
          >
            סגירה
          </button>

          {onAccept && (
            <button
              type="button"
              onClick={handleAcceptClick}
              className="py-2.5 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-black shadow-md shadow-purple-500/20 flex items-center gap-1.5 transition cursor-pointer"
            >
              <CheckCircle className="w-4 h-4" />
              <span>קראתי ואני מאשר/ת</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

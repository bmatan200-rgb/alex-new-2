import React, { useState, useEffect } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

/**
 * באנר "התקנת אפליקציה" — תומך באנדרואיד ובאייפון.
 *
 * אנדרואיד: כפתור התקנה בלחיצה אחת (אירוע beforeinstallprompt).
 * אייפון: אפל אינה תומכת באירוע, ולכן מוצגת הוראה ידנית עם האייקונים
 *         של תפריט השיתוף ב-Safari.
 *
 * הבאנר לא מוצג אם המשתמשת כבר סגרה אותו בעבר, או אם האפליקציה
 * כבר מותקנת ורצה במצב standalone.
 */
export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('alex_install_dismissed') === 'true') return;

    // אם כבר מותקן ורץ במסך מלא — אין מה להציע
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    if (standalone) return;

    // זיהוי אייפון / אייפד
    const ua = window.navigator.userAgent;
    const iOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;

    if (iOSDevice) {
      setIsIOS(true);
      // השהיה קצרה כדי לא לקפוץ מיד עם טעינת הדף
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => clearTimeout(timer);
    }

    // אנדרואיד ודפדפנים תומכים
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('alex_install_dismissed', 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-purple-200 p-4 animate-in fade-in slide-in-from-bottom duration-300">
      {isIOS ? (
        // ===== אייפון: הוראה ידנית =====
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
            <Share className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 text-right">
            <div className="font-black text-sm text-slate-900">הוסיפו למסך הבית</div>
            <div className="text-[11.5px] text-slate-600 mt-1 leading-relaxed">
              לחצו על <Share className="w-3.5 h-3.5 inline text-purple-600 mx-0.5" /> בסרגל התחתון,
              ואז על <Plus className="w-3.5 h-3.5 inline text-purple-600 mx-0.5" />
              <span className="font-bold"> "הוסף למסך הבית"</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0 p-1"
            aria-label="סגירה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        // ===== אנדרואיד: התקנה בלחיצה =====
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>

          <div className="flex-1 text-right">
            <div className="font-black text-sm text-slate-900">התקינו את האפליקציה</div>
            <div className="text-[11px] text-slate-500 mt-0.5">גישה מהירה לקביעת תורים</div>
          </div>

          <button
            type="button"
            onClick={handleInstall}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
          >
            התקנה
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0 p-1"
            aria-label="סגירה"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

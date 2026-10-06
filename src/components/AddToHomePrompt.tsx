import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Home, Share2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface AddToHomePromptProps {
  tenantId: string;
  tenantName: string;
  primaryColor: string;
}

const isInstalled = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
};

export function AddToHomePrompt({ tenantId, tenantName, primaryColor }: AddToHomePromptProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [message, setMessage] = useState('');
  const customerHome = location.pathname === '/';
  const optOutKey = `pwa-install-opt-out:${tenantId}`;
  const installedKey = `pwa-install-complete:${tenantId}`;

  useEffect(() => {
    if (!customerHome || !tenantId) {
      setOpen(false);
      return;
    }
    if (isInstalled()) {
      try { localStorage.setItem(installedKey, '1'); } catch {}
      setOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(optOutKey) === '1' || localStorage.getItem(installedKey) === '1') {
        setOpen(false);
        return;
      }
    } catch {}
    setOpen(true);
    setShowInstructions(false);
    setMessage('');
  }, [customerHome, tenantId, optOutKey, installedKey]);

  const markInstalled = () => {
    try { localStorage.setItem(installedKey, '1'); } catch {}
    setOpen(false);
  };

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      markInstalled();
    };
    const standalone = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => { if (isInstalled()) onInstalled(); };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    standalone.addEventListener?.('change', onDisplayModeChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      standalone.removeEventListener?.('change', onDisplayModeChange);
    };
  }, [installedKey]);

  const hidePermanently = () => {
    try { localStorage.setItem(optOutKey, '1'); } catch {}
    setOpen(false);
  };

  const handleInstall = async () => {
    // Opening the prompt or guide is not proof of installation.
    // Only appinstalled / standalone detection or the opt-out checkbox persist dismissal.
    if (!deferredPrompt) {
      setShowInstructions(true);
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') setOpen(false);
      else {
        setMessage('אפשר להוסיף את האתר למסך הבית גם דרך תפריט הדפדפן.');
        setShowInstructions(true);
      }
    } catch {
      setDeferredPrompt(null);
      setShowInstructions(true);
    }
  };

  if (!open || !customerHome || isInstalled()) return null;

  const isIPhoneOrIPad = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/45 p-3 sm:p-5" dir="rtl">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-home-title"
        className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white p-5 shadow-2xl sm:p-6"
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="סגירת ההצעה עד לכניסה הבאה"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: primaryColor }}>
          <Home className="h-7 w-7" />
        </div>
        <h2 id="add-to-home-title" className="mb-1 text-xl font-black text-slate-900">גישה מהירה לקביעת תור</h2>
        <p className="mb-4 text-sm leading-6 text-slate-600">
          הוסיפו את <strong className="text-slate-800">{tenantName}</strong> למסך הבית ופתחו אותו כמו אפליקציה.
        </p>

        {showInstructions && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-6 text-slate-700">
            {isIPhoneOrIPad ? (
              <>
                <div className="mb-1 flex items-center gap-2 font-bold text-slate-900"><Share2 className="h-4 w-4" /> באייפון או באייפד</div>
                <ol className="list-decimal space-y-1 pr-5">
                  <li>פתחו את אתר העסק ב־<strong>Safari</strong>.</li>
                  <li>לחצו על <strong>שיתוף</strong> — ריבוע עם חץ כלפי מעלה. אם הוא מוסתר, פתחו קודם את תפריט העמוד.</li>
                  <li>בחרו <strong>הוסף למסך הבית</strong>.</li>
                  <li>אם מופיע ״פתח כיישום אינטרנט״, הפעילו אותו, ואז לחצו <strong>הוסף</strong>.</li>
                </ol>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2 font-bold text-slate-900"><Download className="h-4 w-4" /> דרך תפריט הדפדפן</div>
                פתחו את תפריט הדפדפן ⋮ ובחרו <strong>התקנת אפליקציה</strong> או <strong>הוסף למסך הבית</strong>.
              </>
            )}
          </div>
        )}
        {message && <p className="mb-3 text-xs font-medium text-slate-500">{message}</p>}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 active:scale-[.98]"
            style={{ backgroundColor: primaryColor }}
          >
            <Download className="h-4 w-4" />
            הוסף למסך הבית
          </button>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              onChange={(event) => { if (event.target.checked) hidePermanently(); }}
              className="h-4 w-4 cursor-pointer"
              style={{ accentColor: primaryColor }}
            />
            <span>אל תציג שוב</span>
          </label>
        </div>
      </section>
    </div>
  );
}

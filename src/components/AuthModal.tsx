import React, { useState, useEffect } from 'react';
import { Sparkles, User, Phone, ShieldCheck, ArrowLeft, CheckCircle2, Lock, Mail, Key, Loader2 } from 'lucide-react';
import { UserSession } from '../types';
import { SALON_INFO } from '../utils/storage';
import { auth, signInWithEmailAndPassword } from '../lib/firebase';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLogin: (session: UserSession) => void;
  canDismiss?: boolean;
  initialRolePrompt?: 'admin' | 'customer';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  canDismiss = false,
  initialRolePrompt = 'customer',
}) => {
  const [activeTab, setActiveTab] = useState<'customer' | 'admin'>(initialRolePrompt);
  
  // Customer state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Admin state (Firebase Auth Email/Password)
  const [adminName, setAdminName] = useState('Alex');
  const [adminEmail, setAdminEmail] = useState('alex@beauty.com');
  const [adminPassword, setAdminPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRolePrompt) {
      setActiveTab(initialRolePrompt);
    }
  }, [initialRolePrompt]);

  if (!isOpen) return null;

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = customerName.trim();
    const cleanPhone = customerPhone.replace(/\D/g, '');

    if (!trimmedName) {
      setError('נא להזין שם מלא');
      return;
    }

    if (cleanPhone.length < 9) {
      setError('נא להזין מספר טלפון תקין (לפחות 9-10 ספרות)');
      return;
    }

    const session: UserSession = {
      name: trimmedName,
      phone: customerPhone.trim(),
      isAdmin: false,
      loggedInAt: new Date().toISOString(),
    };

    onLogin(session);
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!adminEmail.trim() || !adminPassword) {
      setError('נא להזין אימייל וסיסמת מנהלת');
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        adminEmail.trim(),
        adminPassword
      );

      const session: UserSession = {
        name: adminName.trim() || 'מנהלת',
        phone: SALON_INFO.phone,
        isAdmin: true,
        loggedInAt: new Date().toISOString(),
      };

      setIsLoading(false);
      onLogin(session);
    } catch (err: any) {
      setIsLoading(false);
      console.warn('Admin Firebase Auth login error:', err);

      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('פרטי ההתחברות שגויים. אנא ודאי שהאימייל והסיסמה נכונים.');
      } else if (code === 'auth/too-many-requests') {
        setError('יותר מדי ניסיונות כושלים. אנא נסי שוב מאוחר יותר.');
      } else if (code === 'auth/invalid-email') {
        setError('כתובת אימייל אינה תקינה.');
      } else {
        setError(err?.message || 'שגיאה באימות מול שרתי Firebase.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative text-slate-800 space-y-5" dir="rtl">
        {canDismiss && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer text-xs font-bold"
          >
            סגירה
          </button>
        )}

        {/* Brand Header */}
        <div className="text-center space-y-2 pt-1">
          <div className="relative w-14 h-14 rounded-2xl bg-black p-0.5 shadow-sm mx-auto flex items-center justify-center border border-slate-800">
            <div className="w-full h-full bg-black rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-white font-black tracking-tight text-base font-['Rubik',sans-serif] leading-none">
                Alex
              </span>
              <span className="text-[7px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">
                BEAUTY
              </span>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border-2 border-black flex items-center justify-center shadow-sm">
              <Sparkles className="w-2.5 h-2.5 text-slate-900" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
              {activeTab === 'admin' ? 'כניסת מנהלת מאחורי הקלעים' : 'ברוכים הבאים ל-Alex Beauty'}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {activeTab === 'admin'
                ? 'אימות מאובטח ב-Firebase Authentication'
                : 'רישום וכניסה מהירה לקביעת תורים'}
            </p>
          </div>
        </div>

        {/* Role Toggle Switch */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('customer');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'customer'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>כניסת לקוחה</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'admin'
                ? 'bg-purple-950 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            <span>ניהול מערכת (Alex)</span>
          </button>
        </div>

        {/* Customer Form */}
        {activeTab === 'customer' ? (
          <form onSubmit={handleCustomerSubmit} className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label htmlFor="auth-customer-name" className="text-xs font-bold text-slate-700 block">
                שם מלא <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-customer-name"
                  type="text"
                  required
                  placeholder="לדוגמה: שרה ישראלי"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label htmlFor="auth-customer-phone" className="text-xs font-bold text-slate-700 block">
                מספר טלפון <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-customer-phone"
                  type="tel"
                  required
                  placeholder="050-1234567"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  dir="ltr"
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div className="p-3 bg-purple-50/70 text-slate-700 rounded-2xl border border-purple-200/70 text-xs space-y-1 text-right">
              <div className="flex items-center gap-1.5 font-bold text-purple-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                <span>כניסה מהירה לקביעת תורים</span>
              </div>
              <p className="text-[11px] text-slate-500">
                הפרטים נשמרים במכשירך לקביעת תורים מהירה ונוחה.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right animate-in fade-in">
                {error}
              </div>
            )}

            <button
              id="auth-customer-submit-btn"
              type="submit"
              className="w-full py-3.5 px-5 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-black transition-all border border-purple-500/60 shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>כניסה לקביעת תור</span>
              <ArrowLeft className="w-4 h-4 text-purple-400" />
            </button>
          </form>
        ) : (
          /* Admin Firebase Auth Form */
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="space-y-1.5 text-right">
              <label htmlFor="auth-admin-name" className="text-xs font-bold text-slate-700 block">
                שם <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-admin-name"
                  type="text"
                  required
                  placeholder="לדוגמה: אלכס"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-purple-50/50 border border-purple-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <User className="w-4 h-4 text-purple-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label htmlFor="auth-admin-email" className="text-xs font-bold text-slate-700 block">
                אימייל מנהלת <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-admin-email"
                  type="email"
                  required
                  placeholder="alex@beauty.com"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  dir="ltr"
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-purple-50/50 border border-purple-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <Mail className="w-4 h-4 text-purple-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div className="space-y-1.5 text-right">
              <label htmlFor="auth-admin-password" className="text-xs font-bold text-slate-700 block">
                סיסמת מנהלת <span className="text-purple-600">*</span>
              </label>
              <div className="relative">
                <input
                  id="auth-admin-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full pl-4 pr-11 py-3 rounded-2xl bg-purple-50/50 border border-purple-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <Key className="w-4 h-4 text-purple-400 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div className="p-3 bg-purple-950 text-white rounded-2xl border border-purple-500/60 text-xs space-y-1 text-right">
              <div className="flex items-center gap-1.5 font-bold text-purple-300">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                <span>אימות מנהלת מאובטח</span>
              </div>
              <p className="text-[11px] text-purple-200">
                הגישה לשינוי יומן, חסימות, שירותים והגדרות תזכורות מוגנת באימות Firebase.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right animate-in fade-in">
                {error}
              </div>
            )}

            <button
              id="auth-admin-submit-btn"
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-5 bg-purple-950 hover:bg-black text-white rounded-2xl text-sm font-black transition-all border border-purple-500/60 shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>מאמת פרטים ב-Firebase...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-purple-400" />
                  <span>כניסה למערכת הניהול</span>
                </>
              )}
            </button>
          </form>
        )}

        <div className="text-center text-[11px] text-slate-400 pt-3 border-t border-slate-100 mt-4">
          <span>Alex טיפוח ויופי • מערכת תורים מאובטחת</span>
        </div>
      </div>
    </div>
  );
};

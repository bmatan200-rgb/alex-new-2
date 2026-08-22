import React, { useState } from 'react';
import { Sparkles, User, Phone, ShieldCheck, ArrowLeft, Heart, CheckCircle2, Lock } from 'lucide-react';
import { UserSession } from '../types';
import { isAdminPhone, SALON_INFO } from '../utils/storage';

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
  initialRolePrompt,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(
    initialRolePrompt === 'admin' ? '054-6307114' : ''
  );
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAdminDetected = isAdminPhone(phone);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.replace(/\D/g, '');
    const trimmedName = name.trim();

    if (!trimmedName && !isAdminDetected) {
      setError('נא להזין שם מלא');
      return;
    }

    if (cleanPhone.length < 9) {
      setError('נא להזין מספר טלפון תקין (לפחות 9-10 ספרות)');
      return;
    }

    const isAdmin = isAdminPhone(phone);
    const finalName = trimmedName || (isAdmin ? SALON_INFO.ownerName : 'לקוח/ה');

    const session: UserSession = {
      name: finalName,
      phone: phone.trim(),
      isAdmin,
      loggedInAt: new Date().toISOString(),
    };

    onLogin(session);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative text-slate-800 space-y-6">
        {/* Optional close button if allowed to dismiss */}
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
        <div className="text-center space-y-3 pt-1">
          <div className="relative w-16 h-16 rounded-2xl bg-black p-0.5 shadow-sm mx-auto flex items-center justify-center border border-slate-800">
            <div className="w-full h-full bg-black rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-white font-black tracking-tight text-lg font-['Rubik',sans-serif] leading-none">
                Alex
              </span>
              <span className="text-[8px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">
                BEAUTY
              </span>
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border-2 border-black flex items-center justify-center shadow-sm">
              <Sparkles className="w-3 h-3 text-slate-900" />
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
              ברוכים הבאים ל-
              <span className="text-slate-900 px-1">Alex</span> טיפוח ויופי
            </h2>
            <p className="text-xs text-slate-600 font-medium mt-1">
              {initialRolePrompt === 'admin'
                ? 'כניסה למערכת הניהול מאחורי הקלעים'
                : 'רישום וכניסה מהירה לפי שם ומספר טלפון'}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name Field */}
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-700 block">
              שם מלא <span className="text-purple-600">*</span>
            </label>
            <div className="relative">
              <input
                id="auth-name-input"
                type="text"
                required={!isAdminDetected}
                placeholder={isAdminDetected ? 'Alex (מנהלת)' : 'לדוגמה: שרה ישראלי'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
              />
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          {/* Phone Field */}
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-700 block">
              מספר טלפון <span className="text-purple-600">*</span>
            </label>
            <div className="relative">
              <input
                id="auth-phone-input"
                type="tel"
                required
                placeholder="050-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
              />
              <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          {/* Dynamic Role Recognition Banner */}
          {isAdminDetected ? (
            <div className="p-3.5 bg-purple-950 text-white rounded-2xl border border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.3)] space-y-1 text-right animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-purple-300 text-xs font-black">
                <ShieldCheck className="w-4 h-4 text-purple-400 animate-pulse" />
                <span>זוהה מספר מנהלת מערכת (Alex)</span>
              </div>
              <p className="text-[11px] text-purple-200 leading-relaxed font-normal">
                הכניסה תעניק לך גישה מלאה למאחורי הקלעים: ניהול יומן, עריכת תורים, חסימת שעות, תזכורות WhatsApp ועוד.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-purple-50/70 text-slate-700 rounded-2xl border border-purple-200/70 text-xs space-y-1 text-right">
              <div className="flex items-center gap-1.5 font-bold text-purple-900">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                <span>רישום חד פעמי לקביעת תורים קלה</span>
              </div>
              <p className="text-[11px] text-slate-500">
                הפרטים יישמרו במכשירך כך שלא תצטרכי להקליד אותם מחדש בכל הזמנת תור.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            id="auth-submit-btn"
            type="submit"
            className="w-full py-3.5 px-5 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-black transition-all duration-150 border border-purple-500/60 shadow-[0_0_18px_rgba(168,85,247,0.35)] hover:shadow-[0_0_24px_rgba(168,85,247,0.55)] flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01]"
          >
            {isAdminDetected ? (
              <>
                <Lock className="w-4 h-4 text-purple-400" />
                <span>כניסה למאחורי הקלעים (ניהול)</span>
              </>
            ) : (
              <>
                <span>כניסה והמשך</span>
                <ArrowLeft className="w-4 h-4 text-purple-400" />
              </>
            )}
          </button>
        </form>

        {/* Quick Role / View Shortcuts for immediate access */}
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <p className="text-[11px] text-center text-slate-500 font-bold">
            כניסה מהירה בלחיצה אחת:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onLogin({
                  name: 'אלכס (מנהלת)',
                  phone: '054-6307114',
                  isAdmin: true,
                  loggedInAt: new Date().toISOString(),
                });
              }}
              className="py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-purple-600" />
              <span>כניסה כמנהלת (Alex) 👑</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onLogin({
                  name: 'שרה לוי',
                  phone: '050-1234567',
                  isAdmin: false,
                  loggedInAt: new Date().toISOString(),
                });
              }}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <User className="w-4 h-4 text-slate-500" />
              <span>כניסה כלקוחה (שרה)</span>
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 pt-1">
          <span>Alex טיפוח ויופי • קביעת תורים אונליין</span>
        </div>
      </div>
    </div>
  );
};

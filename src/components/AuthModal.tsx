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
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAdminDetected = isAdminPhone(phone);

  const handleSubmit = (e: React.FormEvent, forceCustomer: boolean = false) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.replace(/\D/g, '');
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('נא להזין שם מלא');
      return;
    }

    if (cleanPhone.length < 9) {
      setError('נא להזין מספר טלפון תקין (לפחות 9-10 ספרות)');
      return;
    }

    const isAdmin = forceCustomer ? false : isAdminPhone(phone);

    const session: UserSession = {
      name: trimmedName,
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
                required
                placeholder="לדוגמה: מתן כהן / שרה ישראלי"
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

          {/* Submit Buttons */}
          <div className="space-y-3">
            {isAdminDetected ? (
              <>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, false)}
                  className="w-full py-3.5 px-5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-sm font-black transition-all duration-150 border border-purple-500/60 shadow-[0_0_18px_rgba(168,85,247,0.35)] hover:shadow-[0_0_24px_rgba(168,85,247,0.55)] flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01]"
                >
                  <Lock className="w-4 h-4 text-purple-300" />
                  <span>כניסה לממשק מנהל</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e, true)}
                  className="w-full py-3 px-5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition-all duration-150 border border-slate-200 shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>כניסה רגילה כלקוח/ה</span>
                </button>
              </>
            ) : (
              <button
                type="submit"
                className="w-full py-3.5 px-5 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-black transition-all duration-150 shadow-md flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01]"
              >
                <span>כניסה והמשך</span>
                <ArrowLeft className="w-4 h-4 text-slate-300" />
              </button>
            )}
          </div>
        </form>

        <div className="text-center text-[11px] text-slate-400 pt-2 border-t border-slate-100">
          <span>Alex טיפוח ויופי • קביעת תורים אונליין</span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { auth, signInWithEmailAndPassword } from '../lib/firebase';
import { UserSession } from '../types';
import { saveUserSession, SALON_INFO } from '../utils/storage';

interface AdminLoginPageProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('נא להזין כתובת אימייל תקינה של המנהל/ת');
      return;
    }

    if (!trimmedPassword) {
      setError('נא להזין את סיסמת המנהל');
      return;
    }

    setIsSubmitting(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
      const user = userCredential.user;
      const idToken = await user.getIdToken();

      try {
        localStorage.setItem('alex_admin_session_token', idToken);
      } catch {
        // ignore
      }

      const nowIso = new Date().toISOString();
      const adminSession: UserSession = {
        name: user.displayName || 'אלכסנדרה ביטון (מנהלת)',
        email: user.email || trimmedEmail,
        phone: SALON_INFO.phone,
        isAdmin: true,
        loggedInAt: nowIso,
        acceptedTerms: true,
        acceptedTermsAt: nowIso,
      };

      saveUserSession(adminSession);
      setSuccess('התחברת בהצלחה! מעביר ללוח הבקרה...');

      setTimeout(() => {
        onLoginSuccess(adminSession);
        navigate('/admin/dashboard', { replace: true });
      }, 600);
    } catch (err: any) {
      console.error('[Admin Login Error]:', err);
      const code = err?.code || '';

      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError('כתובת אימייל או סיסמה שגויים. נא לנסות שנית.');
      } else if (code === 'auth/too-many-requests') {
        setError('יותר מדי נסיונות התחברות כושלים. אנא המתיני מספר דקות ורק אז נסי שוב.');
      } else if (code === 'auth/invalid-email') {
        setError('פורמט כתובת האימייל אינו תקין.');
      } else if (code === 'auth/network-request-failed') {
        setError('שגיאת תקשורת. נא לבדוק את החיבור לרשת.');
      } else {
        setError(err?.message || 'שגיאה באימות מול Firebase. אנא ודאי את פרטי ההתחברות.');
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden text-slate-100"
      dir="rtl"
    >
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 -right-20 w-96 h-96 bg-purple-900/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-pink-900/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Back Link to Client Site */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-purple-300 transition-colors p-2 rounded-xl hover:bg-slate-900/60"
        >
          <ArrowRight className="w-4 h-4" />
          <span>חזרה לאתר הראשי (לקוחות)</span>
        </Link>
        <span className="text-[11px] text-purple-400/80 font-medium px-2.5 py-1 rounded-full bg-purple-950/70 border border-purple-800/40">
          ממשק ניהול מאובטח
        </span>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-purple-900/40 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 relative">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-slate-950 border border-purple-500/40 shadow-lg shadow-purple-600/20 mb-1">
            <ShieldCheck className="w-7 h-7 text-purple-200" />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-950/90 border border-purple-700/50 text-[11px] font-bold text-purple-300 mb-2">
              <Sparkles className="w-3 h-3 text-purple-400" />
              <span>Alex טיפוח ויופי</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">כניסת מנהל</h1>
            <p className="text-xs text-slate-400 mt-1">
              התחברות מאובטחת באמצעות Firebase Auth ללוח הניהול
            </p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 bg-red-950/80 border border-red-800/80 rounded-2xl text-xs font-semibold text-red-200 flex items-start gap-2.5 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="p-3.5 bg-emerald-950/80 border border-emerald-800/80 rounded-2xl text-xs font-semibold text-emerald-200 flex items-start gap-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span className="leading-snug">{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-300 block">
              כתובת אימייל <span className="text-purple-400">*</span>
            </label>
            <div className="relative">
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="alexbiton200@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus:border-purple-500 focus:bg-slate-900 focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-white placeholder-slate-500 text-left transition"
              />
              <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-4" />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5 text-right">
            <label className="text-xs font-bold text-slate-300 block">
              סיסמת מנהל <span className="text-purple-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                dir="ltr"
                className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus:border-purple-500 focus:bg-slate-900 focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-white placeholder-slate-500 text-left transition"
              />
              <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-4" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3.5 top-3.5 text-slate-500 hover:text-slate-300 p-0.5 rounded-lg transition cursor-pointer"
                title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] mt-2 py-3.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>מאמת מול Firebase...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-200" />
                <span>התחברות לממשק ניהול</span>
              </span>
            )}
          </button>
        </form>

        {/* Security badge footer */}
        <div className="pt-2 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-purple-400" />
            <span>אימות מוגן ומאובטח ברמת Firebase Cloud & Rules</span>
          </p>
        </div>
      </div>
    </div>
  );
};

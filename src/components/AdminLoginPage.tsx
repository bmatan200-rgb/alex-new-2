import { requestAdminPasswordReset } from '../lib/adminAccount';
import { accountError } from '../utils/accountSecurity';
import { useTenant } from '../context/TenantContext';
import React, { useRef, useState } from 'react';
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
import { auth, signInWithEmailAndPassword, signOut } from '../lib/firebase';
import { UserSession } from '../types';
import { saveAdminSession } from '../utils/storage';

interface AdminLoginPageProps {
  onLoginSuccess: (session: UserSession) => void;
}

export const AdminLoginPage: React.FC<AdminLoginPageProps> = ({ onLoginSuccess }) => {
  const { salonInfo: SALON_INFO } = useTenant();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const resetLock = useRef(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (resetMode) {
      if (resetLock.current) return;
      resetLock.current = true; setIsSubmitting(true);
      try {
        await requestAdminPasswordReset(email);
        setSuccess('אם קיים חשבון עם האימייל הזה, יישלח אליו קישור לאיפוס סיסמה. בדקו גם בתיקיית הספאם.');
      } catch (error) { setError(accountError(error)); }
      finally { resetLock.current = false; setIsSubmitting(false); }
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password;

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

      const profileRes = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const profileData = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok || !profileData?.success) {
        await signOut(auth).catch(() => {});
        throw new Error(profileData?.error || 'לחשבון אין הרשאת ניהול במערכת');
      }
      const profile = profileData.user || {};
      // /api/auth/me may bootstrap the configured Super Admin claim on first login.
      // Force-refresh once so Firestore Rules immediately see the new role.
      if (profile.role === 'super_admin') {
        const refreshedToken = await user.getIdToken(true);
        try { localStorage.setItem('alex_admin_session_token', refreshedToken); } catch {}
      }
      const nowIso = new Date().toISOString();
      const adminSession: UserSession = {
        name: user.displayName || (profile.role === 'super_admin' ? 'Super Admin' : 'בעל/ת העסק'),
        email: user.email || trimmedEmail,
        phone: SALON_INFO.phone,
        isAdmin: true,
        role: profile.role,
        tenantId: profile.tenantId,
        uid: profile.uid,
        loggedInAt: nowIso,
        acceptedTerms: true,
        acceptedTermsAt: nowIso,
      };

      saveAdminSession(adminSession);
      setSuccess('התחברת בהצלחה! מעביר ללוח הבקרה...');

      setTimeout(() => {
        onLoginSuccess(adminSession);
        if (profile.role === 'super_admin') navigate('/super-admin', { replace: true });
        else navigate(`/admin/dashboard?tenant=${encodeURIComponent(profile.tenantId)}`, { replace: true });
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
              <span>{SALON_INFO.name}</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">{resetMode ? 'איפוס סיסמה' : 'כניסת מנהל'}</h1>
            <p className="text-xs text-slate-400 mt-1">
              {resetMode ? 'הזינו את האימייל של חשבון הניהול לקבלת קישור לאיפוס' : 'התחברות לניהול העסק שלכם'}
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
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                dir="ltr"
                className="w-full pl-4 pr-11 py-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 focus:border-purple-500 focus:bg-slate-900 focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-white placeholder-slate-500 text-left transition"
              />
              <Mail className="w-4 h-4 text-slate-500 absolute right-3.5 top-4" />
            </div>
          </div>

          {/* Password */}
          {!resetMode && <div className="space-y-1.5 text-right">
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
          </div>}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] mt-2 py-3.5 px-4 bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{resetMode ? 'שולח קישור...' : 'מתחבר...'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-200" />
                <span>{resetMode ? 'שליחת קישור לאיפוס' : 'התחברות לממשק ניהול'}</span>
              </span>
            )}
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => { setResetMode(!resetMode); setPassword(''); setError(null); setSuccess(null); }} className="w-full text-sm text-purple-300 underline py-2 disabled:opacity-50">
            {resetMode ? 'חזרה להתחברות' : 'שכחתי סיסמה'}
          </button>
        </form>

        {/* Security badge footer */}
        <div className="pt-2 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-purple-400" />
            <span>כניסה מאובטחת לחשבון הניהול</span>
          </p>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  User,
  Phone,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Check,
  FileText,
  ExternalLink,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  UserCheck,
  Database,
  RefreshCw,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import { UserSession, AdminUser } from '../types';
import { isAdminPhone, SALON_INFO } from '../utils/storage';
import {
  verifyAdminLoginInFirestore,
  saveAdminUserToFirestore,
  ensureDefaultAdminsInFirestore,
  subscribeAdminUsers,
} from '../lib/firebase';
import { TermsOfServiceModal } from './TermsOfServiceModal';
import { SignaturePad } from './SignaturePad';

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

  // Customer State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  // Admin State (Username, Phone, Email, Password synced via Firebase)
  const [adminUsername, setAdminUsername] = useState('אלכסנדרה ביטון');
  const [adminPhone, setAdminPhone] = useState('054-6307114');
  const [adminEmail, setAdminEmail] = useState('alex@beauty.co.il');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminMode, setAdminMode] = useState<'login' | 'register'>('login');
  const [existingAdmins, setExistingAdmins] = useState<AdminUser[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Load and listen to Admin accounts from Firebase
  useEffect(() => {
    if (!isOpen) return;

    ensureDefaultAdminsInFirestore().then((admins) => {
      setExistingAdmins(admins);
    });

    const unsubscribe = subscribeAdminUsers((admins) => {
      setExistingAdmins(admins);
    });

    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (initialRolePrompt) {
      setActiveTab(initialRolePrompt);
    }
  }, [initialRolePrompt, isOpen]);

  if (!isOpen) return null;

  const isCustomerAdminPhone = isAdminPhone(phone);

  // Handler for Customer Registration/Login
  const handleCustomerSubmit = async (e: React.FormEvent, forceCustomer: boolean = false) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

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

    // Mandatory Terms & Digital Signature Check for customer
    if (!isAdmin) {
      if (!signatureDataUrl) {
        setError('יש לחתום דיגיטלית בלוח החתימה על מנת לאשר את התקנון');
        return;
      }
      if (!acceptedTerms) {
        setError('יש לסמן אישור על תקנון ותנאי השימוש כדי להמשיך');
        return;
      }
    }

    setIsSubmitting(true);

    const nowIso = new Date().toISOString();
    const session: UserSession = {
      name: trimmedName,
      phone: phone.trim(),
      isAdmin,
      loggedInAt: nowIso,
      acceptedTerms: true,
      acceptedTermsAt: nowIso,
      signatureDataUrl: signatureDataUrl || undefined,
    };

    // Trigger Webhook for Twilio / Registration Integration
    try {
      await fetch('/api/register-webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: session.name,
          phone: session.phone,
          acceptedTerms: true,
          acceptedTermsAt: session.acceptedTermsAt,
          hasSignature: Boolean(signatureDataUrl),
          registeredAt: session.loggedInAt,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          platform: 'web_mobile',
        }),
      }).catch((err) => {
        console.warn('[Registration Webhook] Non-blocking dispatch notice:', err);
      });
    } catch (webhookErr) {
      console.warn('[Registration Webhook] Error calling webhook:', webhookErr);
    } finally {
      setIsSubmitting(false);
    }

    onLogin(session);
  };

  // Handler for Admin Firebase Authentication
  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);

    const trimmedUsername = adminUsername.trim();
    const trimmedPhone = adminPhone.trim();
    const trimmedEmail = adminEmail.trim().toLowerCase();
    const trimmedPassword = adminPassword.trim();

    if (!trimmedUsername) {
      setError('נא להזין שם משתמש למנהל/ת');
      return;
    }
    if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 9) {
      setError('נא להזין מספר טלפון תקין למנהל/ת');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('נא להזין כתובת אימייל תקינה של המנהל/ת');
      return;
    }
    if (!trimmedPassword || trimmedPassword.length < 4) {
      setError('נא להזין סיסמה בת 4 תווים לפחות');
      return;
    }

    setIsSubmitting(true);

    try {
      if (adminMode === 'register') {
        // Register or Update Admin in Firebase Firestore
        const saveResult = await saveAdminUserToFirestore({
          username: trimmedUsername,
          phone: trimmedPhone,
          email: trimmedEmail,
          password: trimmedPassword,
          role: 'admin',
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        });

        if (!saveResult.success) {
          setError(saveResult.error || 'שגיאה ביצירת חשבון מנהל ב-Firebase');
          setIsSubmitting(false);
          return;
        }

        setSuccessNotice('חשבון המנהל נשמר וסונכרן בהצלחה ב-Firebase! מתחבר...');
      } else {
        // Verify Admin Login via Firebase Firestore
        const verifyResult = await verifyAdminLoginInFirestore({
          usernameOrEmailOrPhone: trimmedEmail || trimmedUsername || trimmedPhone,
          password: trimmedPassword,
          phone: trimmedPhone,
          email: trimmedEmail,
          username: trimmedUsername,
        });

        if (!verifyResult.success || !verifyResult.adminUser) {
          setError(verifyResult.error || 'פרטי ההתחברות שגויים או שאינם מסונכרנים ב-Firebase');
          setIsSubmitting(false);
          return;
        }
      }

      const nowIso = new Date().toISOString();
      const session: UserSession = {
        name: trimmedUsername,
        phone: trimmedPhone,
        email: trimmedEmail,
        username: trimmedUsername,
        isAdmin: true,
        loggedInAt: nowIso,
        acceptedTerms: true,
        acceptedTermsAt: nowIso,
      };

      onLogin(session);
    } catch (err: any) {
      console.error('Admin Auth Error:', err);
      setError(err.message || 'שגיאה בהתחברות דרך Firebase');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick fill preset admin helper
  const handleSelectExistingAdmin = (admin: AdminUser) => {
    setAdminUsername(admin.username);
    setAdminPhone(admin.phone);
    setAdminEmail(admin.email);
    // שדה הסיסמה נשאר ריק בכוונה — אין ברירת מחדל בקוד
    setAdminPassword('');
    setError(null);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-7 shadow-2xl border border-slate-200 relative text-slate-800 space-y-4 my-auto">
          {/* Optional close button */}
          {canDismiss && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 left-4 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer text-xs font-bold active:scale-95"
              aria-label="סגירה"
            >
              סגירה
            </button>
          )}

          {/* Brand Header */}
          <div className="text-center space-y-2 pt-1">
            <div className="relative w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-black p-0.5 shadow-sm mx-auto flex items-center justify-center border border-slate-800">
              <div className="w-full h-full bg-black rounded-[14px] flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-white font-black tracking-tight text-base sm:text-lg font-['Rubik',sans-serif] leading-none">
                  Alex
                </span>
                <span className="text-[7px] sm:text-[8px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">
                  BEAUTY
                </span>
              </div>
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border-2 border-black flex items-center justify-center shadow-sm">
                <Sparkles className="w-3 h-3 text-slate-900" />
              </div>
            </div>

            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
                {SALON_INFO.name}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                כניסה מהירה ומאובטחת למערכת
              </p>
            </div>
          </div>

          {/* Role Mode Navigation Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-2xl border border-slate-200/80 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('customer');
                setError(null);
              }}
              className={`py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'customer'
                  ? 'bg-white text-slate-900 shadow-xs font-black'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <User className="w-4 h-4 text-purple-600" />
              <span>כניסת לקוח/ה</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('admin');
                setError(null);
              }}
              className={`py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-purple-900 text-white shadow-xs font-black shadow-[0_0_12px_rgba(168,85,247,0.35)]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-purple-300" />
              <span>כניסת מנהל (Firebase)</span>
            </button>
          </div>

          {/* TAB 1: CUSTOMER REGISTRATION / LOGIN */}
          {activeTab === 'customer' && (
            <form onSubmit={handleCustomerSubmit} className="space-y-4 animate-in fade-in duration-150">
              {/* Name Field */}
              <div className="space-y-1.5 text-right">
                <label htmlFor="auth-name-input" className="text-xs font-bold text-slate-700 block">
                  שם מלא <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="auth-name-input"
                    type="text"
                    required
                    placeholder="שם פרטי ומשפחה"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-4 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
                </div>
              </div>

              {/* Phone Field */}
              <div className="space-y-1.5 text-right">
                <label htmlFor="auth-phone-input" className="text-xs font-bold text-slate-700 block">
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

              {/* Customer Terms & Signature */}
              {!isCustomerAdminPhone && (
                <div className="space-y-3 pt-1 text-right">
                  <div className="p-3 bg-purple-50/70 rounded-2xl border border-purple-200/90 text-xs space-y-1.5 text-slate-700">
                    <div className="flex items-center justify-between font-bold text-purple-950 border-b border-purple-200/60 pb-1">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-purple-700" />
                        <span>תקנון ותנאי שימוש ללקוחות</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsTermsModalOpen(true)}
                        className="text-[11px] text-purple-700 hover:text-purple-950 font-extrabold underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>לתקנון המלא</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-snug">
                      הפרטים משמשים לתיאום תורים ושליחת תזכורות SMS בלבד.
                    </p>
                  </div>

                  <SignaturePad
                    onSignatureChange={(dataUrl) => {
                      setSignatureDataUrl(dataUrl);
                      if (dataUrl) {
                        setAcceptedTerms(true);
                        setError(null);
                      }
                    }}
                    required={true}
                  />

                  <div
                    className={`p-2.5 rounded-2xl border transition-all ${
                      acceptedTerms
                        ? 'bg-purple-50/70 border-purple-200/90'
                        : 'bg-slate-50/90 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <label
                      htmlFor="customer-terms-checkbox"
                      className="flex items-start gap-2.5 cursor-pointer select-none text-xs leading-snug"
                    >
                      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                        <input
                          id="customer-terms-checkbox"
                          type="checkbox"
                          checked={acceptedTerms}
                          onChange={(e) => {
                            setAcceptedTerms(e.target.checked);
                            if (e.target.checked) setError(null);
                          }}
                          className="sr-only peer"
                        />
                        <div
                          className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                            acceptedTerms
                              ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                              : 'bg-white border-slate-300 peer-focus:border-purple-500'
                          }`}
                        >
                          {acceptedTerms && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                      </div>

                      <div className="text-slate-700 text-xs font-medium">
                        <span>קראתי את </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsTermsModalOpen(true);
                          }}
                          className="text-purple-700 font-bold underline hover:text-purple-900 cursor-pointer focus:outline-none transition inline-block px-0.5"
                        >
                          התקנון ותנאי השימוש
                        </button>
                        <span>, ואני חותם/ת ומאשר/ת</span>
                        <span className="text-purple-600 font-bold mr-0.5">*</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Dynamic Admin Notification on Customer Screen */}
              {isCustomerAdminPhone && (
                <div className="p-3 bg-purple-950 text-white rounded-2xl border border-purple-500/60 shadow-xs space-y-1 text-right">
                  <div className="flex items-center gap-1.5 text-purple-300 text-xs font-black">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                    <span>זוהה מספר טלפון של מנהל</span>
                  </div>
                  <p className="text-[11px] text-purple-200">
                    באפשרותך להיכנס ישירות לממשק מנהל או לעבור ללשונית "כניסת מנהל (Firebase)" להזנת סיסמה מלאה.
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right">
                  {error}
                </div>
              )}

              <div className="space-y-2 pt-1">
                {isCustomerAdminPhone ? (
                  <>
                    <button
                      type="button"
                      onClick={(e) => handleCustomerSubmit(e, false)}
                      className="w-full min-h-[46px] py-3 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-sm font-black transition border border-purple-500/60 flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Lock className="w-4 h-4 text-purple-200" />
                      <span>כניסה מהירה לממשק מנהל</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleCustomerSubmit(e, true)}
                      className="w-full min-h-[42px] py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-bold transition border border-slate-200 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>כניסה רגילה כלקוח/ה</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full min-h-[48px] py-3 px-4 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99]"
                  >
                    <span>{isSubmitting ? 'רושם למערכת...' : 'הרשמה וכניסה למערכת'}</span>
                    <ArrowLeft className="w-4 h-4 text-slate-300" />
                  </button>
                )}
              </div>
            </form>
          )}

          {/* TAB 2: ADMIN FIREBASE AUTHENTICATION (USERNAME, PHONE, EMAIL, PASSWORD) */}
          {activeTab === 'admin' && (
            <form onSubmit={handleAdminSubmit} className="space-y-3.5 animate-in fade-in duration-150">
              {/* Firebase Live Cloud Status Header */}
              <div className="p-3 bg-purple-950 text-white rounded-2xl border border-purple-500/50 shadow-md space-y-1 text-right">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-black text-purple-200">
                    <Database className="w-4 h-4 text-purple-400 animate-pulse" />
                    <span>סנכרון מנהלים בזמן אמת ב-Firebase</span>
                  </div>
                  <span className="text-[10px] bg-purple-800/80 text-purple-200 px-2 py-0.5 rounded-full border border-purple-600/40">
                    Firestore & Auth
                  </span>
                </div>
                <p className="text-[11px] text-purple-200/90 font-normal leading-relaxed">
                  הכניסה למערכת הניהול מסונכרנת על פי <strong>שם משתמש, טלפון ואימייל</strong> המאומתים מול <strong>סיסמת Firebase</strong>.
                </p>
              </div>

              {/* Quick Select Preset Admin Pills */}
              {existingAdmins.length > 0 && (
                <div className="space-y-1 text-right">
                  <span className="text-[11px] font-bold text-slate-500 block">
                    מנהלים מוגדרים בפיירבייס (בחירה מהירה):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {existingAdmins.map((admin) => (
                      <button
                        key={admin.id || admin.phone}
                        type="button"
                        onClick={() => handleSelectExistingAdmin(admin)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                          adminEmail === admin.email || adminPhone === admin.phone
                            ? 'bg-purple-100 text-purple-950 border-purple-400 font-black'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <UserCheck className="w-3 h-3 text-purple-700" />
                        <span>{admin.username || admin.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 1. Admin Username Field */}
              <div className="space-y-1 text-right">
                <label htmlFor="admin-username-input" className="text-xs font-bold text-slate-700 block">
                  שם משתמש / מנהל <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="admin-username-input"
                    type="text"
                    required
                    placeholder="לדוגמה: אלכסנדרה ביטון / Alex"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className="w-full pl-4 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                  />
                  <User className="w-4 h-4 text-purple-600 absolute right-3 top-3" />
                </div>
              </div>

              {/* 2. Admin Phone Field */}
              <div className="space-y-1 text-right">
                <label htmlFor="admin-phone-input" className="text-xs font-bold text-slate-700 block">
                  מספר טלפון מנהל/ת <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="admin-phone-input"
                    type="tel"
                    required
                    placeholder="054-6307114"
                    value={adminPhone}
                    onChange={(e) => setAdminPhone(e.target.value)}
                    dir="ltr"
                    className="w-full pl-4 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                  />
                  <Phone className="w-4 h-4 text-purple-600 absolute right-3 top-3" />
                </div>
              </div>

              {/* 3. Admin Email Field */}
              <div className="space-y-1 text-right">
                <label htmlFor="admin-email-input" className="text-xs font-bold text-slate-700 block">
                  כתובת אימייל מנהל/ת <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="admin-email-input"
                    type="email"
                    required
                    placeholder="alex@beauty.co.il / bmatan200@gmail.com"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    dir="ltr"
                    className="w-full pl-4 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                  />
                  <Mail className="w-4 h-4 text-purple-600 absolute right-3 top-3" />
                </div>
              </div>

              {/* 4. Admin Password Field */}
              <div className="space-y-1 text-right">
                <div className="flex items-center justify-between">
                  <label htmlFor="admin-password-input" className="text-xs font-bold text-slate-700 block">
                    סיסמת מנהל בפיירבייס <span className="text-purple-600">*</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="admin-password-input"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="הזן סיסמת כניסה..."
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    dir="ltr"
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-xs sm:text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                  />
                  <KeyRound className="w-4 h-4 text-purple-600 absolute right-3 top-3" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer p-1"
                    title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Mode Toggle: Login vs Register/Update in Firebase */}
              {/* Removed as per instructions to only allow login via app */}

              {/* Error & Success Notices */}
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right animate-in shake duration-150">
                  {error}
                </div>
              )}

              {successNotice && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 text-right">
                  {successNotice}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3 px-5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-sm font-black transition-all border border-purple-500/60 shadow-[0_0_18px_rgba(168,85,247,0.35)] flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                <ShieldCheck className="w-4 h-4 text-purple-200" />
                <span>
                  {isSubmitting
                    ? 'מאמת פרטים ב-Firebase...'
                    : 'אימות והתחברות כמנהל'}
                </span>
              </button>
            </form>
          )}

          <div className="text-center text-[11px] text-slate-400 pt-1.5 border-t border-slate-100 flex items-center justify-between px-1">
            <button
              type="button"
              onClick={() => setIsTermsModalOpen(true)}
              className="text-slate-500 hover:text-purple-700 underline text-[11px] cursor-pointer font-medium"
            >
              תקנון ותנאי שימוש
            </button>
            <span>{SALON_INFO.name} • אונליין</span>
          </div>
        </div>
      </div>

      {/* Terms of Service Full Modal */}
      <TermsOfServiceModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        onAccept={() => {
          setAcceptedTerms(true);
          setError(null);
        }}
      />
    </>
  );
};

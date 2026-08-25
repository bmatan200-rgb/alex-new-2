import React, { useState } from 'react';
import { Sparkles, User, Phone, ShieldCheck, ArrowLeft, CheckCircle2, Lock, Check, FileText, ExternalLink } from 'lucide-react';
import { UserSession } from '../types';
import { isAdminPhone, SALON_INFO } from '../utils/storage';
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
  initialRolePrompt,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isAdminDetected = isAdminPhone(phone);

  const handleSubmit = async (e: React.FormEvent, forceCustomer: boolean = false) => {
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

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl border border-slate-200 relative text-slate-800 space-y-5 sm:space-y-6 my-auto">
          {/* Optional close button if allowed to dismiss */}
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
          <div className="text-center space-y-2.5 pt-1">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black p-0.5 shadow-sm mx-auto flex items-center justify-center border border-slate-800">
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
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight font-['Rubik',sans-serif]">
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
                  className="w-full pl-4 pr-11 py-3 sm:py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 sm:top-4" />
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
                  className="w-full pl-4 pr-11 py-3 sm:py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
                />
                <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 sm:top-4" />
              </div>
            </div>

            {/* Customer Terms of Service & Digital Signature Box */}
            {!isAdminDetected && (
              <div className="space-y-3 pt-1 text-right">
                {/* Terms Summary Card */}
                <div className="p-3.5 bg-purple-50/70 rounded-2xl border border-purple-200/90 text-xs space-y-2 text-slate-700">
                  <div className="flex items-center justify-between font-bold text-purple-950 border-b border-purple-200/60 pb-1.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-purple-700" />
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

                  <ul className="text-[11px] text-slate-600 space-y-1 pr-1 list-disc list-inside leading-snug">
                    <li><strong>פרטיות:</strong> הפרטים (שם וטלפון) משמשים אך ורק לתיאום תורים ויצירת קשר.</li>
                    <li><strong>תזכורות:</strong> אישור קבלת תזכורות SMS / עדכונים לגבי התורים שלך.</li>
                    <li><strong>ביטולים:</strong> נא להודיע מראש ככל הניתן על שינוי או ביטול תור.</li>
                  </ul>
                </div>

                {/* Digital Signature Pad */}
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

                {/* Mandatory Terms Checkbox */}
                <div
                  className={`p-3 rounded-2xl border transition-all ${
                    acceptedTerms
                      ? 'bg-purple-50/70 border-purple-200/90'
                      : 'bg-slate-50/90 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <label
                    htmlFor="terms-checkbox"
                    className="flex items-start gap-2.5 cursor-pointer select-none text-xs leading-snug"
                  >
                    <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                      <input
                        id="terms-checkbox"
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
                      <span>, הבנתי ואני חותם/ת ומאשר/ת אותם</span>
                      <span className="text-purple-600 font-bold mr-0.5">*</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Dynamic Role Recognition Banner for Admin */}
            {isAdminDetected && (
              <div className="p-3.5 bg-purple-950 text-white rounded-2xl border border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.3)] space-y-1 text-right animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-purple-300 text-xs font-black">
                  <ShieldCheck className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span>זוהה מספר מנהלת מערכת (Alex)</span>
                </div>
                <p className="text-[11px] text-purple-200 leading-relaxed font-normal">
                  הכניסה תעניק לך גישה מלאה למאחורי הקלעים: ניהול יומן, עריכת תורים, חסימת שעות, תזכורות WhatsApp ועוד.
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right animate-in shake duration-150">
                {error}
              </div>
            )}

            {/* Submit Buttons */}
            <div className="space-y-2.5 pt-1">
              {isAdminDetected ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, false)}
                    className="w-full min-h-[48px] py-3.5 px-5 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-sm font-black transition-all duration-150 border border-purple-500/60 shadow-[0_0_18px_rgba(168,85,247,0.35)] hover:shadow-[0_0_24px_rgba(168,85,247,0.55)] flex items-center justify-center gap-2 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Lock className="w-4 h-4 text-purple-300" />
                    <span>כניסה לממשק מנהל</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, true)}
                    className="w-full min-h-[44px] py-3 px-5 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-sm font-bold transition-all duration-150 border border-slate-200 shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>כניסה רגילה כלקוח/ה</span>
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full min-h-[50px] py-3.5 px-5 rounded-2xl text-sm font-black transition-all duration-150 shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] ${
                    acceptedTerms
                      ? 'bg-slate-950 hover:bg-black text-white'
                      : 'bg-slate-800 text-white hover:bg-slate-900'
                  }`}
                >
                  <span>{isSubmitting ? 'רושם למערכת...' : 'הרשמה וכניסה למערכת'}</span>
                  <ArrowLeft className="w-4 h-4 text-slate-300" />
                </button>
              )}
            </div>
          </form>

          <div className="text-center text-[11px] text-slate-400 pt-2 border-t border-slate-100 flex items-center justify-between px-1">
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


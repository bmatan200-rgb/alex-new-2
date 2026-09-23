import React, { useState } from 'react';
import {
  User,
  Phone,
  ArrowLeft,
  Sparkles,
  FileText,
  ExternalLink,
  Check,
} from 'lucide-react';
import { UserSession } from '../types';
import { SALON_INFO } from '../utils/storage';
import { upsertCustomerToFirestore } from '../lib/firebase';
import { TermsOfServiceModal } from './TermsOfServiceModal';
import { SignaturePad } from './SignaturePad';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onLogin: (session: UserSession) => void;
  canDismiss?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  canDismiss = false,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Handler for Customer Registration/Login - Always strictly regular customer (isAdmin = false)
  const handleCustomerSubmit = async (e: React.FormEvent) => {
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

    // Mandatory Terms & Digital Signature Check for every customer
    if (!signatureDataUrl) {
      setError('יש לחתום דיגיטלית בלוח החתימה על מנת לאשר את התקנון');
      return;
    }
    if (!acceptedTerms) {
      setError('יש לסמן אישור על תקנון ותנאי השימוש כדי להמשיך');
      return;
    }

    setIsSubmitting(true);

    const nowIso = new Date().toISOString();
    const session: UserSession = {
      name: trimmedName,
      phone: phone.trim(),
      isAdmin: false,
      loggedInAt: nowIso,
      acceptedTerms: true,
      acceptedTermsAt: nowIso,
      signatureDataUrl: signatureDataUrl || undefined,
    };

    // Save or update customer record in Firestore customers directory
    upsertCustomerToFirestore({
      full_name: trimmedName,
      phone: phone.trim(),
    }).catch((err) => {
      console.warn('[Customer Directory] upsert notice:', err);
    });

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
        console.warn('Register webhook notification warning (ignorable):', err);
      });
    } catch {
      // non-blocking
    }

    setIsSubmitting(false);
    onLogin(session);
    if (onClose) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto" dir="rtl">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-7 shadow-2xl border border-slate-200 relative text-slate-800 space-y-4 my-auto">
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
                הרשמה מהירה לקביעת תורים וקבלת תזכורות
              </p>
            </div>
          </div>

          {/* CUSTOMER FORM ONLY */}
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

            {error && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 text-right">
                {error}
              </div>
            )}

            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3 px-4 bg-slate-950 hover:bg-black text-white rounded-2xl text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-[0.99] disabled:opacity-50"
              >
                <span>{isSubmitting ? 'רושם למערכת...' : 'הרשמה וכניסה למערכת'}</span>
                <ArrowLeft className="w-4 h-4 text-slate-300" />
              </button>
            </div>
          </form>
        </div>
      </div>

      <TermsOfServiceModal
        isOpen={isTermsModalOpen}
        onClose={() => setIsTermsModalOpen(false)}
        onAccept={() => {
          setAcceptedTerms(true);
          setIsTermsModalOpen(false);
          setError(null);
        }}
      />
    </>
  );
};

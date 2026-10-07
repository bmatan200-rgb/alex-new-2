import React, { useEffect, useRef, useState } from 'react';
import { Settings, X, Copy, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';
import { changeAdminPassword } from '../lib/adminAccount';
import { accountError, bookingLink } from '../utils/accountSecurity';

export const AdminAccountSettings: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const uid = auth.currentUser?.uid || '';
  const hintKey = `admin-password-hint:${uid}`;
  const [showHint, setShowHint] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const link = bookingLink(window.location.origin, tenantId);

  useEffect(() => {
    try { setShowHint(Boolean(uid) && localStorage.getItem(hintKey) !== '1'); }
    catch { setShowHint(Boolean(uid)); }
  }, [uid, hintKey]);

  const dismissHint = () => {
    try { localStorage.setItem(hintKey, '1'); } catch {}
    setShowHint(false);
  };
  const close = () => {
    if (lock.current) return;
    setOpen(false); setCurrent(''); setNext(''); setConfirmation(''); setError(''); setSuccess(''); setCopyStatus('');
  };
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const fields = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') || []) as HTMLElement[];
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      await changeAdminPassword(current, next, confirmation);
      setCurrent(''); setNext(''); setConfirmation(''); dismissHint();
      setSuccess('הסיסמה שונתה בהצלחה. מעכשיו יש להתחבר עם הסיסמה החדשה.');
    } catch (error) { setError(accountError(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopyStatus('הקישור הועתק — אפשר לשלוח אותו ללקוחות'); }
    catch { setCopyStatus('ההעתקה האוטומטית לא זמינה. אפשר לסמן ולהעתיק את הקישור מהשדה.'); }
  };

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4" dir="rtl">
      {showHint ? <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
        <span>קיבלתם סיסמה ראשונית? מומלץ להחליף אותה לסיסמה אישית.</span>
        <button type="button" onClick={() => setOpen(true)} className="font-bold text-purple-700 underline">שינוי סיסמה</button>
        <button type="button" onClick={dismissHint} className="text-slate-500 underline">לא עכשיו</button>
      </div> : <span />}
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800">
        <Settings className="w-4 h-4" />הגדרות החשבון
      </button>
    </div>
    {open && <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" dir="rtl">
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="account-settings-title" className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 sm:p-6 shadow-xl text-slate-900">
        <div className="flex items-center justify-between mb-5">
          <h2 id="account-settings-title" className="font-black text-lg">הגדרות החשבון</h2>
          <button type="button" autoFocus disabled={busy} onClick={close} aria-label="סגירה" className="p-2 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3 pb-5 border-b border-slate-200">
          <label htmlFor="customer-booking-link" className="block font-bold text-sm">קישור להזמנת תור</label>
          <input id="customer-booking-link" readOnly value={link} dir="ltr" onFocus={event => event.target.select()} className="w-full rounded-xl border border-slate-200 p-3 text-xs" />
          <button type="button" onClick={copy} className="flex items-center gap-2 rounded-xl bg-purple-50 text-purple-800 px-4 py-2 text-sm font-bold"><Copy className="w-4 h-4" />העתקת קישור להזמנת תור</button>
          {copyStatus && <p role="status" className="text-xs text-slate-600">{copyStatus}</p>}
        </div>
        <form onSubmit={submit} className="space-y-3 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Lock className="w-4 h-4" />שינוי סיסמה</h3>
          <p className="text-xs text-slate-500 break-all">{auth.currentUser?.email}</p>
          {[
            {id: 'current-password', label: 'סיסמה נוכחית', value: current, setter: setCurrent, auto: 'current-password'},
            {id: 'new-password', label: 'סיסמה חדשה', value: next, setter: setNext, auto: 'new-password'},
            {id: 'confirm-password', label: 'אימות הסיסמה החדשה', value: confirmation, setter: setConfirmation, auto: 'new-password'},
          ].map(field => <div key={field.id} className="space-y-1">
            <label htmlFor={field.id} className="text-xs font-bold">{field.label}</label>
            <input id={field.id} type="password" required disabled={busy} autoComplete={field.auto} value={field.value}
              onChange={event => field.setter(event.target.value)} dir="ltr" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
          </div>)}
          <p className="text-xs text-slate-500">לפחות 6 תווים; מומלץ להשתמש בסיסמה ארוכה וייחודית.</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          {success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-purple-700 text-white py-3 font-bold disabled:opacity-50">{busy ? 'מעדכן...' : 'עדכון סיסמה'}</button>
        </form>
      </section>
    </div>}
  </>;
}

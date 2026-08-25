import React, { useState, useEffect } from 'react';
import { Search, Calendar, Clock, X, AlertCircle, Trash2, MessageCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Appointment, UserSession } from '../types';
import { formatHebrewFullDate, formatILS, toIsraeliDateString } from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';

interface MyBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  onCancelAppointment: (id: number | string) => void;
  currentUser?: UserSession | null;
}

export const MyBookingModal: React.FC<MyBookingModalProps> = ({
  isOpen,
  onClose,
  appointments,
  onCancelAppointment,
  currentUser,
}) => {
  const [searchPhone, setSearchPhone] = useState(currentUser?.phone || '');
  const [hasSearched, setHasSearched] = useState(Boolean(currentUser?.phone));
  const [cancelConfirmId, setCancelConfirmId] = useState<number | string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (currentUser?.phone) {
        setSearchPhone(currentUser.phone);
        setHasSearched(true);
      }
      setSuccessMessage(null);
      setCancelConfirmId(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const cleanQuery = searchPhone.replace(/\D/g, '');

  const matchedAppointments = hasSearched
    ? appointments.filter((app) => {
        const cleanAppPhone = app.customer_phone.replace(/\D/g, '');
        return cleanAppPhone.includes(cleanQuery) && cleanQuery.length >= 4;
      })
    : [];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setSuccessMessage(null);
  };

  const handleExecuteCancel = (app: Appointment) => {
    onCancelAppointment(app.id);
    setCancelConfirmId(null);
    setSuccessMessage(`התור שלך לתאריך ${toIsraeliDateString(app.appointment_date)} בשעה ${app.start_time} בוטל בהצלחה. השעה שוחררה ביומן.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-5 relative text-slate-800 font-['Rubik',sans-serif]">
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="text-right space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 border border-purple-200 text-purple-900 font-bold text-xs shadow-xs">
            <Calendar className="w-3.5 h-3.5 text-purple-700" />
            <span>אזור אישי ללקוחות</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight pt-1">
            איתור, צפייה וביטול תור
          </h2>
          <p className="text-xs text-slate-600 font-medium">
            הזינו את מספר הטלפון איתו קבעתם את התור לצפייה או לביטול מהיר
          </p>
        </div>

        {/* Success Alert */}
        {successMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">התור בוטל בהצלחה!</span>
              <p className="text-[11px] text-emerald-800">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Search Input Form */}
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="relative">
            <input
              type="tel"
              required
              placeholder="050-1234567"
              value={searchPhone}
              onChange={(e) => {
                setSearchPhone(e.target.value);
                if (hasSearched) setHasSearched(false);
              }}
              dir="ltr"
              className="w-full pl-4 pr-11 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:border-purple-600 focus:bg-white focus:ring-2 focus:ring-purple-500/20 outline-none text-sm font-medium text-slate-900 placeholder-slate-400 text-right transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer shadow-sm shadow-purple-500/20"
          >
            חיפוש תורים
          </button>
        </form>

        {/* Search Results */}
        {hasSearched && (
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              תוצאות חיפוש ({matchedAppointments.length})
            </h3>

            {matchedAppointments.length === 0 ? (
              <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs space-y-1">
                <AlertCircle className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                <p className="font-bold text-slate-800">לא נמצאו תורים עבור מספר זה</p>
                <p>ודאו שהקלדתם את המספר המדויק או צרו קשר ישיר עם {SALON_INFO.ownerName}</p>
              </div>
            ) : (
              matchedAppointments.map((app) => {
                const isCancelled = app.status === 'cancelled';

                return (
                  <div
                    key={app.id}
                    className={`p-4 rounded-2xl border transition ${
                      isCancelled
                        ? 'bg-slate-50 border-slate-200 opacity-60'
                        : 'bg-white border-purple-200 shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <span className="font-bold text-slate-900 text-sm">
                          {app.service_name} ({formatILS(app.price)})
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          עבור: {app.customer_name}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          isCancelled
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isCancelled ? 'מבוטל' : 'מאושר'}
                      </span>
                    </div>

                    <div className="py-2.5 space-y-1 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-medium">
                          {formatHebrewFullDate(app.appointment_date)} ({toIsraeliDateString(app.appointment_date)})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span className="font-bold font-['Rubik',sans-serif] text-slate-900">
                          שעה: {app.start_time} - {app.end_time}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          • משך הטיפול: כשעה ו-50 דקות
                        </span>
                      </div>
                    </div>

                    {!isCancelled && (
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                        <a
                          href={`https://wa.me/${SALON_INFO.whatsappNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>וואטסאפ ל-{SALON_INFO.ownerName}</span>
                        </a>

                        {cancelConfirmId === app.id ? (
                          <div className="flex items-center gap-1.5 p-1 bg-red-50 rounded-xl border border-red-200">
                            <span className="text-[11px] text-red-700 font-bold px-1 flex items-center gap-0.5">
                              <AlertTriangle className="w-3 h-3 text-red-600 inline" />
                              לבטל?
                            </span>
                            <button
                              type="button"
                              onClick={() => handleExecuteCancel(app)}
                              className="px-2.5 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition cursor-pointer shadow-xs"
                            >
                              כן, בטל תור
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmId(null)}
                              className="px-2 py-1 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs hover:bg-slate-100 transition cursor-pointer"
                            >
                              חזרה
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setCancelConfirmId(app.id)}
                            className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold transition flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span>ביטול תור</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};

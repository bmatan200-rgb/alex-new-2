import React, { useState, useEffect } from 'react';
import {
  Search,
  Calendar,
  Clock,
  X,
  AlertCircle,
  Trash2,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  CalendarPlus,
  History,
  Check,
} from 'lucide-react';
import { Appointment, UserSession } from '../types';
import {
  formatHebrewFullDate,
  formatILS,
  toIsraeliDateString,
  isAppointmentInPast,
} from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';
import { CancelAppointmentConfirmModal } from './CancelAppointmentConfirmModal';

interface MyBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  onCancelAppointment: (id: number | string) => void;
  currentUser?: UserSession | null;
  onOpenBookingModal?: () => void;
}

export const MyBookingModal: React.FC<MyBookingModalProps> = ({
  isOpen,
  onClose,
  appointments,
  onCancelAppointment,
  currentUser,
  onOpenBookingModal,
}) => {
  const [searchPhone, setSearchPhone] = useState(currentUser?.phone || '');
  const [hasSearched, setHasSearched] = useState(Boolean(currentUser?.phone));
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    if (isOpen) {
      if (currentUser?.phone) {
        setSearchPhone(currentUser.phone);
        setHasSearched(true);
      }
      setSuccessMessage(null);
      setAppointmentToCancel(null);
      setActiveTab('active');
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

  // 1. תורים עתידיים פעילים (שלא בוטלו וטרם עברו)
  const activeFutureAppointments = matchedAppointments.filter(
    (app) => app.status === 'confirmed' && !isAppointmentInPast(app)
  );

  // 2. היסטוריית תורים שעברו או בוטלו
  const pastHistoryAppointments = matchedAppointments.filter(
    (app) => app.status === 'cancelled' || isAppointmentInPast(app)
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setHasSearched(true);
    setSuccessMessage(null);
    setActiveTab('active');
  };

  const handleExecuteCancel = (app: Appointment) => {
    onCancelAppointment(app.id);
    setAppointmentToCancel(null);
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
            התור שלי / ביטול
          </h2>
          <p className="text-xs text-slate-600 font-medium">
            הזינו את מספר הטלפון לצפייה בתורים עתידיים פעילים, ביטול או צפייה בהיסטוריה
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

        {onOpenBookingModal && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenBookingModal();
              }}
              className="w-full py-3 px-4 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 rounded-2xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <CalendarPlus className="w-4 h-4 text-purple-700" />
              <span>קביעת תור נוסף במערכת ✨</span>
            </button>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div className="space-y-3 pt-2">
            {/* View Switcher: תורים עתידיים פעילים vs היסטוריית תורים */}
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('active')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'active'
                    ? 'bg-white text-purple-900 shadow-xs border border-purple-200 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-purple-600" />
                <span>תורים עתידיים</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  activeFutureAppointments.length > 0 ? 'bg-purple-600 text-white font-extrabold' : 'bg-slate-200 text-slate-600'
                }`}>
                  {activeFutureAppointments.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-purple-900 shadow-xs border border-purple-200 font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>היסטוריית תורים</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-600">
                  {pastHistoryAppointments.length}
                </span>
              </button>
            </div>

            {/* TAB 1: תורים פעילים עתידיים */}
            {activeTab === 'active' && (
              <div className="space-y-2.5">
                {activeFutureAppointments.length === 0 ? (
                  <div className="text-center py-7 px-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-600 text-xs space-y-2">
                    <CheckCircle2 className="w-7 h-7 mx-auto text-purple-500" />
                    <p className="font-bold text-slate-900 text-sm">אין תורים עתידיים פעילים כרגע</p>
                    <p className="text-slate-500 text-xs max-w-xs mx-auto">
                      {pastHistoryAppointments.length > 0
                        ? 'כל התורים שנקבעו בעבר כבר הסתיימו או בוטלו (ניתן לצפות בהם בלשונית "היסטוריית תורים").'
                        : 'לא נמצאו תורים עתידיים עבור מספר זה. ודאו שהקלדתם את המספר המדויק.'}
                    </p>
                    {onOpenBookingModal && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenBookingModal();
                          }}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs transition cursor-pointer"
                        >
                          קביעת תור חדש ביומן ✨
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  activeFutureAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="p-4 rounded-2xl border border-purple-200 bg-white shadow-xs space-y-3 transition hover:border-purple-300"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div>
                          <span className="font-black text-slate-900 text-sm">
                            {app.service_name} ({formatILS(app.price || 0)})
                          </span>
                          <span className="text-[11px] text-slate-500 block">
                            עבור: {app.customer_name}
                          </span>
                        </div>
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                          <span>תור מאושר ומשוריין</span>
                        </span>
                      </div>

                      <div className="py-1 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-bold text-slate-800">
                            {formatHebrewFullDate(app.appointment_date)} ({toIsraeliDateString(app.appointment_date)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-purple-600" />
                          <span className="font-bold font-['Rubik',sans-serif] text-slate-900">
                            שעה: {app.start_time} - {app.end_time}
                          </span>
                        </div>
                      </div>

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

                        <button
                          type="button"
                          onClick={() => setAppointmentToCancel(app)}
                          className="text-xs px-3 py-1.5 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 border border-red-200 rounded-xl font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                          title="ביטול תור"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>ביטול תור</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 2: היסטוריית תורים שעברו או בוטלו - ללא אופציית ביטול תור */}
            {activeTab === 'history' && (
              <div className="space-y-2.5">
                {pastHistoryAppointments.length === 0 ? (
                  <div className="text-center py-7 px-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
                    <History className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                    <p className="font-bold text-slate-700">אין תורים קודמים בהיסטוריה</p>
                  </div>
                ) : (
                  pastHistoryAppointments.map((app) => {
                    const isCancelled = app.status === 'cancelled';
                    return (
                      <div
                        key={app.id}
                        className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 opacity-80 space-y-2"
                      >
                        <div className="flex items-center justify-between pb-1.5 border-b border-slate-200/60">
                          <div>
                            <span className="font-bold text-slate-800 text-xs sm:text-sm">
                              {app.service_name} ({formatILS(app.price || 0)})
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              עבור: {app.customer_name}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isCancelled
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-slate-200 text-slate-600 border border-slate-300'
                            }`}
                          >
                            {isCancelled ? 'בוטל' : 'הסתיים (תור עבר)'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>{toIsraeliDateString(app.appointment_date)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-3 h-3 text-slate-500" />
                            <span>שעה: {app.start_time} - {app.end_time}</span>
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/50 flex items-center justify-between">
                          <span>תור זה מופיע בהיסטוריה בלבד</span>
                          {onOpenBookingModal && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onOpenBookingModal();
                              }}
                              className="text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
                            >
                              קבעי שוב
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Cancel Appointment Confirmation Dialog Modal */}
        <CancelAppointmentConfirmModal
          isOpen={Boolean(appointmentToCancel)}
          appointment={appointmentToCancel}
          onClose={() => setAppointmentToCancel(null)}
          onConfirm={() => {
            if (appointmentToCancel) {
              handleExecuteCancel(appointmentToCancel);
            }
          }}
        />
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { AlertTriangle, Calendar, Clock, Trash2, X, Sparkles } from 'lucide-react';
import { Appointment } from '../types';
import { formatHebrewFullDate, toIsraeliDateString } from '../utils/dateUtils';

interface CancelAppointmentConfirmModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export const CancelAppointmentConfirmModal: React.FC<CancelAppointmentConfirmModalProps> = ({
  isOpen,
  appointment,
  onClose,
  onConfirm,
}) => {
  const [isCancelling, setIsCancelling] = useState(false);

  if (!isOpen || !appointment) return null;

  const handleConfirm = async () => {
    setIsCancelling(true);
    try {
      await onConfirm();
    } finally {
      setIsCancelling(false);
    }
  };

  const formattedDate = appointment.appointment_date
    ? formatHebrewFullDate(appointment.appointment_date)
    : '';
  const dateDisplay = toIsraeliDateString(appointment.appointment_date);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-100 space-y-5 text-slate-900 font-['Heebo',sans-serif] relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-modal-title"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isCancelling}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer disabled:opacity-50"
          title="סגירה"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Icon & Question Header */}
        <div className="text-center space-y-2.5 pt-1">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 border border-rose-200 rounded-full flex items-center justify-center mx-auto ring-8 ring-rose-50 shadow-xs">
            <AlertTriangle className="w-8 h-8 text-rose-600 stroke-[2.2]" />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold text-rose-600 uppercase tracking-wider block">
              אישור ביטול
            </span>
            <h3
              id="cancel-modal-title"
              className="text-xl sm:text-2xl font-black text-slate-950 font-['Rubik',sans-serif] tracking-tight"
            >
              האם את/ה בטוח/ה שברצונך לבטל?
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
              התור המשוריין ישוחרר מהיומן ויהיה זמין ללקוחות אחרות במערכת.
            </p>
          </div>
        </div>

        {/* Appointment Details Box */}
        <div className="bg-rose-50/60 rounded-2xl p-4 border border-rose-200/80 space-y-2.5 text-right shadow-2xs">
          <div className="flex items-center justify-between pb-2 border-b border-rose-200/60">
            <div>
              <span className="text-[11px] text-slate-500 font-bold block">טיפול שנבחר</span>
              <span className="font-black text-sm text-slate-900">
                {appointment.service_name || 'טיפול'}
              </span>
            </div>
            {appointment.customer_name && (
              <div className="text-left">
                <span className="text-[11px] text-slate-500 font-bold block">שם הלקוח/ה</span>
                <span className="font-bold text-xs text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md">
                  {appointment.customer_name}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1 text-slate-700">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] font-bold">תאריך</span>
                <span className="font-bold text-slate-900 font-mono text-[11px]">
                  {dateDisplay}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px] font-bold">שעה</span>
                <span className="font-bold text-slate-900 font-mono text-[11px]">
                  {appointment.start_time} - {appointment.end_time}
                </span>
              </div>
            </div>
          </div>

          {formattedDate && (
            <div className="text-[11px] text-rose-900 font-semibold pt-1 border-t border-rose-200/40">
              {formattedDate}
            </div>
          )}
        </div>

        {/* Actions: Confirm Cancellation + Dismiss */}
        <div className="space-y-2.5 pt-1">
          {/* Confirm Button */}
          <button
            id="confirm-cancel-appointment-btn"
            type="button"
            onClick={handleConfirm}
            disabled={isCancelling}
            className="w-full py-3.5 px-4 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-2xl text-sm shadow-md shadow-rose-600/25 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 border border-rose-600"
          >
            {isCancelling ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>מבטל את התור...</span>
              </span>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>אישור — כן, לבטל את התור</span>
              </>
            )}
          </button>

          {/* Dismiss Button */}
          <button
            id="dismiss-cancel-appointment-btn"
            type="button"
            onClick={onClose}
            disabled={isCancelling}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold rounded-2xl text-xs sm:text-sm active:scale-[0.99] transition cursor-pointer disabled:opacity-50"
          >
            חזרה (השאר/י את התור)
          </button>
        </div>
      </div>
    </div>
  );
};

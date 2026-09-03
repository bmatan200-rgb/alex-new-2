import React from 'react';
import { Calendar, Trash2, CalendarPlus, X, AlertCircle } from 'lucide-react';
import { Appointment } from '../types';

interface ExistingBookingChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingAppointments: Appointment[];
  onBookAnother: () => void;
  onCancelExisting: (appointment: Appointment) => void;
}

export const ExistingBookingChoiceModal: React.FC<ExistingBookingChoiceModalProps> = ({
  isOpen,
  onClose,
  existingAppointments,
  onBookAnother,
  onCancelExisting,
}) => {
  if (!isOpen || existingAppointments.length === 0) return null;

  const primaryAppt = existingAppointments[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-5 text-slate-900 font-['Heebo',sans-serif] relative animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
          title="סגירה"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="text-center space-y-2 pt-1">
          <div className="w-14 h-14 bg-purple-100 text-purple-700 border-2 border-purple-200 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <AlertCircle className="w-7 h-7 text-purple-600" />
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-950 font-['Rubik',sans-serif]">
            יש לך כבר תור במערכת
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed px-2">
            שמנו לב שכבר קיים עבורך תור משוריין.
            <br />
            <strong className="text-slate-900 font-bold">האם ברצונך לקבוע תור נוסף או לבטל את התור הקיים?</strong>
          </p>
        </div>

        {/* Existing Appointment Card(s) */}
        <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
          {existingAppointments.map((app) => (
            <div
              key={app.id}
              className="bg-purple-50/80 rounded-2xl p-3.5 border border-purple-200 text-right space-y-1.5 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-purple-950">
                  {app.service_name}
                </span>
                <span className="text-[11px] bg-purple-200/80 text-purple-900 font-black px-2 py-0.5 rounded-md">
                  משוריין
                </span>
              </div>
              <div className="text-xs text-slate-700 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-purple-600" />
                <span>
                  תאריך: <strong>{app.appointment_date}</strong> • בשעה: <strong>{app.start_time}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Choice Actions */}
        <div className="space-y-2.5 pt-1">
          {/* Option 1: Book Another Appointment */}
          <button
            id="choice-book-another-btn"
            type="button"
            onClick={onBookAnother}
            className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl text-sm shadow-md shadow-purple-600/20 active:scale-[0.99] transition flex items-center justify-center gap-2.5 cursor-pointer border border-purple-500"
          >
            <CalendarPlus className="w-5 h-5 text-purple-200 shrink-0" />
            <div className="text-right">
              <span className="block font-black text-sm">לקבוע תור נוסף</span>
              <span className="block text-[11px] text-purple-200 font-normal">
                התור החדש יתווסף בנוסף לתור הקיים
              </span>
            </div>
          </button>

          {/* Option 2: Cancel the Existing Appointment */}
          <button
            id="choice-cancel-existing-btn"
            type="button"
            onClick={() => onCancelExisting(primaryAppt)}
            className="w-full py-3.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-2xl text-sm border border-red-200 active:scale-[0.99] transition flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Trash2 className="w-5 h-5 text-red-600 shrink-0" />
            <div className="text-right">
              <span className="block font-black text-sm text-red-700">לבטל את התור הקיים</span>
              <span className="block text-[11px] text-red-600/80 font-normal">
                ביטול התור הנוכחי ושחרור המועד
              </span>
            </div>
          </button>
        </div>

        {/* Dismiss / Keep as is */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer transition py-1 px-3"
          >
            סגירה והשארת התור ללא שינוי
          </button>
        </div>
      </div>
    </div>
  );
};

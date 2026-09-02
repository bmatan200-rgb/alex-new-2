import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Smartphone,
  Phone,
  Download,
  X,
} from 'lucide-react';
import { Appointment } from '../types';
import {
  formatHebrewFullDate,
  toIsraeliDateString,
  formatILS,
  generateGoogleCalendarUrl,
  generateIcsFile,
} from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';

interface ConfirmationModalProps {
  appointment: Appointment | null;
  onClose: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  appointment,
  onClose,
}) => {
  useEffect(() => {
    if (appointment) {
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#d97706', '#10b981', '#ffffff'],
        });
      } catch {
        // Fallback
      }
    }
  }, [appointment]);

  if (!appointment) return null;

  const googleCalUrl = generateGoogleCalendarUrl({
    title: `תור ל${appointment.service_name} - ${SALON_INFO.name}`,
    description: `תור ל${appointment.service_name} עבור ${appointment.customer_name}.\nטלפון: ${SALON_INFO.phone}`,
    location: SALON_INFO.address || SALON_INFO.name,
    date: appointment.appointment_date,
    startTime: appointment.start_time,
    endTime: appointment.end_time,
  });

  const handleDownloadIcs = () => {
    const icsContent = generateIcsFile({
      title: `תור ל${appointment.service_name} - ${SALON_INFO.name}`,
      description: `תור ל${appointment.service_name} עבור ${appointment.customer_name}. טלפון: ${SALON_INFO.phone}`,
      location: SALON_INFO.address || SALON_INFO.name,
      date: appointment.appointment_date,
      startTime: appointment.start_time,
      endTime: appointment.end_time,
    });

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `appointment-${appointment.appointment_date}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-6 relative text-slate-800">
        {/* Close Button */}
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 left-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success Header */}
        <div className="text-center space-y-2 pt-2">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 border border-emerald-300 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50">
            <CheckCircle className="w-9 h-9" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 font-['Rubik',sans-serif] tracking-tight">
            התור נקבע בהצלחה!
          </h2>
          <p className="text-sm text-slate-600 font-medium">
            שמחנו לשריין לך תור אצל <span className="font-extrabold text-slate-900">{SALON_INFO.name}</span>
          </p>
        </div>

        {/* SMS Reminder Notification Banner */}
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center gap-2.5 text-xs text-purple-950">
          <div className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold block">תזכורת SMS אוטומטית:</span>
            <span className="text-[11px] text-purple-900 font-medium">
              תשלח תזכורת SMS אוטומטית בהמשך 😊
            </span>
          </div>
        </div>

        {/* Appointment Card */}
        <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                מספר אישור
              </span>
              <div className="font-mono text-xs font-bold text-slate-900">
                #{String(appointment.id).slice(-6).toUpperCase()}
              </div>
            </div>
            <div className="text-left">
              <span className="text-[11px] text-slate-500 font-medium">שירות ומחיר</span>
              <div className="text-base font-black text-purple-900 font-['Rubik',sans-serif]">
                {appointment.service_name} • {formatILS(appointment.price || 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">תאריך</span>
                <span className="font-bold text-slate-900">
                  {formatHebrewFullDate(appointment.appointment_date)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <div>
                <span className="text-slate-400 block text-[10px]">שעה שנקבעה</span>
                <span className="font-bold text-slate-900 font-['Rubik',sans-serif]">
                  {appointment.start_time}
                </span>
                <span className="text-[10px] text-purple-700 block font-medium">
                  (כשעה ו-50 דקות)
                </span>
              </div>
            </div>

            {SALON_INFO.address ? (
              <div className="flex items-center gap-2 sm:col-span-2">
                <MapPin className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">כתובת הקליניקה</span>
                  <span className="font-semibold text-slate-900">{SALON_INFO.address}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Calendar Actions */}
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-slate-500 block text-center">
            שמירת התור ביומן האישי:
          </span>
          <div className="grid grid-cols-2 gap-2">
            <a
              id="google-calendar-link"
              href={googleCalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-3 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition border border-slate-200 shadow-xs"
            >
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Google Calendar</span>
            </a>

            <button
              id="apple-calendar-download-btn"
              type="button"
              onClick={handleDownloadIcs}
              className="py-3 px-3 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition border border-slate-200 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-purple-600" />
              <span>יומן Apple / ICS</span>
            </button>
          </div>
        </div>

        {/* Contact & Support Section (Phone + WhatsApp) */}
        <div className="bg-purple-50/70 rounded-2xl p-4 border border-purple-200/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-950">
              לכל בעיה, שאלה או יצירת קשר:
            </span>
            <span className="text-[11px] font-semibold text-purple-700">
              {SALON_INFO.ownerName}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* Phone Button */}
            <a
              id="confirmation-call-btn"
              href={`tel:${SALON_INFO.phone}`}
              className="py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition border border-slate-200 shadow-xs cursor-pointer"
              title="חיוג טלפוני"
            >
              <Phone className="w-4 h-4 text-purple-700" />
              <span>חיוג:</span>
              <span dir="ltr" className="font-['Rubik',sans-serif] font-black">{SALON_INFO.phone}</span>
            </a>

            {/* WhatsApp Direct Button (Empty Message Text) */}
            <a
              id="confirmation-whatsapp-btn"
              href={`https://wa.me/${SALON_INFO.whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition shadow-xs cursor-pointer"
              title="שליחת וואטסאפ ישיר"
            >
              <MessageCircle className="w-4 h-4 fill-white/20 text-white" />
              <span>וואטסאפ ישיר</span>
            </a>
          </div>
        </div>

        {/* Done / Close Button */}
        <button
          id="close-confirmation-modal-btn"
          type="button"
          onClick={onClose}
          className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl text-base shadow-lg shadow-slate-900/10 active:scale-[0.99] transition cursor-pointer"
        >
          סגירה וסיום
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { Calendar, Trash2, CalendarPlus, X, AlertCircle, Clock, Sparkles, Phone, MessageSquare } from 'lucide-react';
import { Appointment } from '../types';
import { toIsraeliDateString } from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';

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

  const count = existingAppointments.length;
  const isLimitReached = count >= 3;
  const isMultiple = count > 1;
  const primaryAppt = existingAppointments[0];

  const whatsappLimitMessage = encodeURIComponent(
    `היי ${SALON_INFO.ownerName} 🌸\nיש לי כבר ${count} תורים פעילים במערכת ואשמח לבדוק אפשרות לקביעת תור נוסף מולך 💖`
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
      dir="rtl"
    >
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 text-slate-900 font-['Heebo',sans-serif] relative animate-in zoom-in-95 duration-200 max-h-[92vh] overflow-y-auto">
        
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
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto shadow-xs ${
              isLimitReached
                ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                : 'bg-purple-100 text-purple-700 border-2 border-purple-200'
            }`}
          >
            <AlertCircle className="w-7 h-7" />
          </div>

          <h3 className="text-xl sm:text-2xl font-black text-slate-950 font-['Rubik',sans-serif]">
            {isLimitReached
              ? 'ניתן להזמין עד 3 תורים מראש'
              : isMultiple
              ? `יש לך ${count} תורים קיימים במערכת`
              : 'יש לך כבר תור במערכת'}
          </h3>

          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed px-2">
            {isLimitReached ? (
              <>
                כרגע רשומים על שמך <strong>3 תורים פעילים</strong>.
                <br />
                כדי לקבוע תור חדש, יש לבטל תור קיים או לפנות למנהלת.
              </>
            ) : isMultiple ? (
              <>
                שמנו לב שכבר קיימים עבורך <strong>{count} תורים משוריינים</strong> (מתוך מקסימום 3).
                <br />
                באפשרותך לקבוע תור נוסף, או לבחור למטה <strong className="text-slate-900 font-bold">תור לביטול</strong>:
              </>
            ) : (
              <>
                שמנו לב שכבר קיים עבורך תור משוריין.
                <br />
                <strong className="text-slate-900 font-bold">האם ברצונך לקבוע תור נוסף או לבטל את התור הקיים?</strong>
              </>
            )}
          </p>
        </div>

        {/* Limit Reached: Contact Alex Bitton Card */}
        {isLimitReached ? (
          <div className="bg-gradient-to-br from-purple-900 via-indigo-900 to-slate-950 text-white rounded-2xl p-4 border border-purple-700/60 shadow-md space-y-3">
            <div className="flex items-center gap-2.5 border-b border-white/10 pb-2.5">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-sm font-black font-['Rubik',sans-serif] text-white">
                  פנייה למנהלת {SALON_INFO.ownerName}
                </h4>
                <p className="text-[11px] text-purple-200">
                  לתיאום תור מיוחד נוסף או אישור חריג
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={`https://wa.me/${SALON_INFO.whatsappNumber}?text=${whatsappLimitMessage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-xs active:scale-95"
              >
                <MessageSquare className="w-4 h-4" />
                <span>וואטסאפ לאלכס</span>
              </a>

              <a
                href={`tel:${SALON_INFO.phone}`}
                className="py-2.5 px-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
              >
                <Phone className="w-4 h-4 text-purple-300" />
                <span>חיוג {SALON_INFO.phone}</span>
              </a>
            </div>
          </div>
        ) : (
          /* Normal Action: Book Another Appointment */
          <button
            id="choice-book-another-btn"
            type="button"
            onClick={onBookAnother}
            className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl text-sm shadow-md shadow-purple-600/20 active:scale-[0.99] transition flex items-center justify-center gap-2.5 cursor-pointer border border-purple-500"
          >
            <CalendarPlus className="w-5 h-5 text-purple-200 shrink-0" />
            <div className="text-right">
              <span className="block font-black text-sm">
                {`לקבוע תור נוסף (תור #${count + 1} מתוך 3)`}
              </span>
              <span className="block text-[11px] text-purple-200 font-normal">
                התור החדש יתווסף בנוסף לתורים הקיימים
              </span>
            </div>
          </button>
        )}

        {/* Appointment Cards Section */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-xs font-black text-slate-700">
              {isLimitReached
                ? 'או ביטול אחד התורים הקיימים לשחרור מועד חדש:'
                : isMultiple
                ? 'או בחירת תור לביטול:'
                : 'התור הקיים שלך:'}
            </span>
            <span className="text-[11px] font-bold text-slate-500">
              {existingAppointments.length} תורים משוריינים
            </span>
          </div>

          <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
            {existingAppointments.map((app, index) => (
              <div
                key={app.id || `${app.appointment_date}_${app.start_time}_${index}`}
                className="bg-purple-50/80 hover:bg-purple-50 rounded-2xl p-3.5 border border-purple-200 text-right space-y-2 shadow-2xs transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isMultiple && (
                      <span className="w-5 h-5 rounded-full bg-purple-200 text-purple-900 text-[11px] font-black flex items-center justify-center">
                        {index + 1}
                      </span>
                    )}
                    <span className="font-bold text-sm text-purple-950">
                      {app.service_name || "לק ג'ל"}
                    </span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-md border border-emerald-200/60">
                    משוריין
                  </span>
                </div>

                <div className="text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 font-medium">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>{toIsraeliDateString(app.appointment_date)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      <span>{app.start_time}{app.end_time ? ` - ${app.end_time}` : ''}</span>
                    </span>
                  </div>

                  {/* Individual Cancel Button on every appointment */}
                  <button
                    type="button"
                    onClick={() => onCancelExisting(app)}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 hover:border-red-300 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95"
                    title={`ביטול תור זה מתאריך ${toIsraeliDateString(app.appointment_date)}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    <span>{isMultiple ? 'ביטול תור זה' : 'ביטול תור'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Single appointment alternative full cancel button for 1 appointment */}
        {!isMultiple && (
          <button
            id="choice-cancel-existing-btn"
            type="button"
            onClick={() => onCancelExisting(primaryAppt)}
            className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-2xl text-sm border border-red-200 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
            <span>ביטול התור הקיים ({toIsraeliDateString(primaryAppt.appointment_date)} בשעה {primaryAppt.start_time})</span>
          </button>
        )}

        {/* Dismiss / Keep as is */}
        <div className="text-center pt-1">
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer transition py-1 px-3"
          >
            סגירה והשארת התורים כפי שהם
          </button>
        </div>
      </div>
    </div>
  );
};

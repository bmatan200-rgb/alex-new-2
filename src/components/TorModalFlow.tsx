import React, { useState, useMemo } from 'react';
import {
  X,
  ChevronRight,
  Clock,
  Calendar,
  Sparkles,
  User,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Sun,
  Sunset,
  Moon,
} from 'lucide-react';
import { Appointment, DayInfo, ScheduleSettings, Service, UserSession } from '../types';
import {
  BUSINESS_OPEN,
  BUSINESS_CLOSE,
  FRIDAY_CLOSE,
  buildNextDays,
  toShortIsraeliDateString,
  toIsraeliDateString,
  calculateAvailableSlots,
  minutesToTime,
  timeToMinutes,
  formatDurationMinutes,
  formatILS,
  getAllStandardSlots,
} from '../utils/dateUtils';
import { SALON_INFO, saveUserSession, isAdminPhone } from '../utils/storage';
import { addAppointmentToFirestore } from '../lib/firebase';

interface TorModalFlowProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  appointments: Appointment[];
  currentUser?: UserSession | null;
  onBookSuccess: (newAppointment: Appointment) => void;
  scheduleSettings?: ScheduleSettings;
}

type Step = 'treatment' | 'day' | 'slot' | 'details';

export const TorModalFlow: React.FC<TorModalFlowProps> = ({
  isOpen,
  onClose,
  services,
  appointments,
  currentUser,
  onBookSuccess,
  scheduleSettings,
}) => {
  const [step, setStep] = useState<Step>('treatment');
  const [selectedService, setSelectedService] = useState<Service>(services[0] || {
    id: 1,
    name: "לק ג'ל",
    description: 'מניקור מכשירי מדויק וטיפוח הציפורן הטבעית',
    duration_minutes: 90,
    price: 150,
  });

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>(currentUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState<string>(currentUser?.phone || '');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Sync user info from session whenever currentUser or modal opens
  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.name) setCustomerName(currentUser.name);
      if (currentUser.phone) setCustomerPhone(currentUser.phone);
    }
  }, [currentUser, isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      setIsEditingDetails(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  // 21 days for the booking calendar
  const days: DayInfo[] = useMemo(() => buildNextDays(21), []);

  if (!isOpen) return null;

  const durationMinutes = selectedService?.duration_minutes || scheduleSettings?.durationMinutes || 90;
  const businessOpen = scheduleSettings?.businessOpen || BUSINESS_OPEN;
  const businessClose = scheduleSettings?.businessClose || BUSINESS_CLOSE;

  // Calculate available slots for a given day
  const getSlotsForDay = (dateIso: string) => {
    return calculateAvailableSlots({
      durationMinutes,
      existingAppointments: appointments,
      dateString: dateIso,
      businessOpen,
      businessClose,
      slotInterval: durationMinutes,
    });
  };

  // Check if today / past time slots should be filtered out
  const getEffectiveAvailableSlots = (dateIso: string) => {
    const slots = getSlotsForDay(dateIso);
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];

    if (dateIso === todayIso) {
      const nowMin = today.getHours() * 60 + today.getMinutes();
      return slots.filter((slotTime) => {
        const slotMin = timeToMinutes(slotTime);
        return slotMin > nowMin + 15;
      });
    }
    return slots;
  };

  const currentAvailableSlots = selectedDate ? getEffectiveAvailableSlots(selectedDate) : [];

  const handleSelectService = (service: Service) => {
    setSelectedService(service);
    setStep('day');
  };

  const handleSelectDay = (day: DayInfo) => {
    if (day.isClosed) return;
    const avail = getEffectiveAvailableSlots(day.iso);
    if (avail.length === 0) return;

    setSelectedDate(day.iso);
    setSelectedSlot('');
    setStep('slot');
  };

  const handleSelectSlot = (slot: string) => {
    setSelectedSlot(slot);
    setStep('details');
  };

  const handleBack = () => {
    setErrorMessage('');
    if (step === 'details') setStep('slot');
    else if (step === 'slot') setStep('day');
    else if (step === 'day') setStep('treatment');
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedService || !selectedDate || !selectedSlot) {
      setErrorMessage('נא לבחור טיפול, תאריך ושעה');
      return;
    }

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.replace(/\D/g, '');

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('נא להזין שם מלא תקין (לפחות 2 אותיות)');
      return;
    }

    if (!cleanPhone || cleanPhone.length < 9 || cleanPhone.length > 11) {
      setErrorMessage('נא להזין מספר טלפון נייד תקין (9-11 ספרות)');
      return;
    }

    const isAdmin = isAdminPhone(cleanPhone);

    setIsSubmitting(true);

    try {
      const startMin = timeToMinutes(selectedSlot);
      const endMin = startMin + durationMinutes;
      const endTimeStr = minutesToTime(endMin);

      const newAppt: Appointment = {
        id: `appt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        customer_name: cleanName,
        customer_phone: cleanPhone,
        service_id: selectedService.id,
        service_name: selectedService.name,
        appointment_date: selectedDate,
        start_time: selectedSlot,
        end_time: endTimeStr,
        price: selectedService.price,
        status: 'confirmed',
        created_at: new Date().toISOString(),
        notes: notes.trim() || undefined,
      };

      // Save user session in localStorage
      saveUserSession({
        name: cleanName,
        phone: cleanPhone,
        isAdmin,
        loggedInAt: new Date().toISOString(),
        acceptedTerms: currentUser?.acceptedTerms ?? true,
        acceptedTermsAt: currentUser?.acceptedTermsAt || new Date().toISOString(),
        signatureDataUrl: currentUser?.signatureDataUrl,
      });

      // Save to Firestore & local storage
      await addAppointmentToFirestore(newAppt);

      setIsSubmitting(false);
      onBookSuccess(newAppt);
      onClose();
    } catch (err: any) {
      console.error('Failed to book appointment:', err);
      const msg = err?.message || 'אירעה שגיאה בקביעת התור. אנא נסי שנית.';
      setErrorMessage(msg);
      
      // If it's a double booking error, bounce them back to the slot picker
      if (msg === 'השעה הזו כבר נתפסה, בבקשה תבחרי שעה אחרת') {
        setTimeout(() => {
          setSelectedSlot('');
          setStep('slot');
          setErrorMessage('');
        }, 3000); // Wait 3 seconds to let them read the message before refreshing slots
      }
      
      setIsSubmitting(false);
    }
  };

  const selectedDayInfo = days.find((d) => d.iso === selectedDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] relative text-slate-900">
        
        {/* Modal Top Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            {step !== 'treatment' ? (
              <button
                type="button"
                onClick={handleBack}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
                title="חזרה לשלב הקודם"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
            )}
            
            <h2 className="text-xl font-black text-slate-950 font-['Rubik',sans-serif]">
              {step === 'treatment' && 'בחירת טיפול'}
              {step === 'day' && 'בחירת יום'}
              {step === 'slot' && 'בחירת שעה'}
              {step === 'details' && 'פרטי הלקוח/ה ואישור'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
            title="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* STEP 1: בחירת טיפול */}
          {step === 'treatment' && (
            <div className="space-y-4 py-2">
              <div className="text-center space-y-1 pb-2">
                <p className="text-xs text-slate-500 font-medium">
                  בחרו את סוג הטיפול המבוקש להמשך
                </p>
              </div>

              <div className="space-y-3">
                {services.map((service) => {
                  const duration = service.duration_minutes || 90;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => handleSelectService(service)}
                      className="w-full relative group p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:shadow-lg transition-all text-right cursor-pointer flex items-center justify-between"
                    >
                      {/* Duration Floating Badge */}
                      <span className="absolute -top-3 right-5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-black border border-slate-300 shadow-xs group-hover:bg-purple-600 group-hover:text-white group-hover:border-purple-600 transition">
                        {duration} דק׳
                      </span>

                      <div className="space-y-1">
                        <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-purple-700 transition">
                          {service.name}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {service.description || 'מניקור מכשירי יסודי ומקצועי'}
                        </p>
                      </div>

                      <div className="text-left shrink-0 mr-3">
                        <span className="text-base sm:text-lg font-black text-slate-900 group-hover:text-purple-700">
                          {formatILS(service.price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: בחירת יום */}
          {step === 'day' && (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
                <span>טיפול: <strong className="text-purple-700 font-bold">{selectedService.name}</strong></span>
                <span>{formatDurationMinutes(durationMinutes)}</span>
              </div>

              {/* Vertical Day Buttons list exactly matching video */}
              <div className="space-y-2.5">
                {days.map((day) => {
                  const availSlots = getEffectiveAvailableSlots(day.iso);
                  const isAvailable = !day.isClosed && availSlots.length > 0;
                  const shortDate = toShortIsraeliDateString(day.iso);

                  // Label logic: "היום, 21/08/26", "יום ראשון, 23/08/26"
                  const dayLabel = day.isToday
                    ? `היום, ${shortDate}`
                    : `יום ${day.weekday}, ${shortDate}`;

                  return (
                    <button
                      key={day.iso}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleSelectDay(day)}
                      className={`w-full py-3.5 px-5 rounded-2xl border text-center font-bold text-sm sm:text-base transition-all flex items-center justify-between ${
                        isAvailable
                          ? 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50/50 hover:shadow-md text-slate-900 cursor-pointer'
                          : day.isClosed
                          ? 'bg-slate-50/80 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                          : 'bg-red-50/60 border-red-200 text-red-600 cursor-not-allowed font-medium'
                      }`}
                    >
                      <span className={`${isAvailable ? 'text-slate-900 font-black' : !day.isClosed ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                        {dayLabel}
                      </span>

                      {isAvailable ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-black border border-purple-200">
                          {availSlots.length} פנויים
                        </span>
                      ) : day.isClosed ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">
                          שבת סגור
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                          מלא
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Video Note Style */}
              <div className="pt-2 text-center text-xs text-slate-500 font-medium">
                <span>* ימים ללא תורים פנויים מסומנים ב</span>
                <span className="text-red-600 font-bold">אדום</span>
              </div>
            </div>
          )}

          {/* STEP 3: בחירת שעה */}
          {step === 'slot' && (
            <div className="space-y-4 py-1">
              <div className="bg-purple-50 rounded-2xl p-3 border border-purple-200 flex items-center justify-between text-xs">
                <span className="text-purple-950 font-bold">
                  {selectedDayInfo?.isToday
                    ? `היום (${toIsraeliDateString(selectedDate)})`
                    : `יום ${selectedDayInfo?.weekday} (${toIsraeliDateString(selectedDate)})`}
                </span>
                <span className="text-purple-700 font-bold">
                  משך טיפול: {formatDurationMinutes(durationMinutes)}
                </span>
              </div>

              {currentAvailableSlots.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-600 text-sm space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="font-bold">אין שעות פנויות ביום זה</p>
                  <button
                    type="button"
                    onClick={() => setStep('day')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-xs"
                  >
                    בחרי יום אחר
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium text-center">
                    לחצי על השעה המתאימה לך מתוך השעות הפנויות:
                  </p>

                  {/* Morning Slots (before 12:00) */}
                  {currentAvailableSlots.filter(s => timeToMinutes(s) < 720).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50/90 px-3 py-1 rounded-xl border border-amber-200/80">
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        <span>בוקר</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots.filter(s => timeToMinutes(s) < 720).map((slot) => {
                          const startMin = timeToMinutes(slot);
                          const endMin = startMin + durationMinutes;
                          const endTime = minutesToTime(endMin);
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-600 hover:text-white hover:shadow-md transition-all text-center group cursor-pointer"
                            >
                              <span className="text-lg font-black block tracking-wide group-hover:text-white text-slate-900">
                                {slot}
                              </span>
                              <span className="text-[10px] text-slate-500 group-hover:text-purple-100 block font-medium">
                                עד {endTime}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Slots (12:00 - 16:30) */}
                  {currentAvailableSlots.filter(s => timeToMinutes(s) >= 720 && timeToMinutes(s) < 990).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800 bg-orange-50/90 px-3 py-1 rounded-xl border border-orange-200/80">
                        <Sunset className="w-3.5 h-3.5 text-orange-600" />
                        <span>צהריים ואחה״צ</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots.filter(s => timeToMinutes(s) >= 720 && timeToMinutes(s) < 990).map((slot) => {
                          const startMin = timeToMinutes(slot);
                          const endMin = startMin + durationMinutes;
                          const endTime = minutesToTime(endMin);
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-600 hover:text-white hover:shadow-md transition-all text-center group cursor-pointer"
                            >
                              <span className="text-lg font-black block tracking-wide group-hover:text-white text-slate-900">
                                {slot}
                              </span>
                              <span className="text-[10px] text-slate-500 group-hover:text-purple-100 block font-medium">
                                עד {endTime}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Evening Slots (16:30+) */}
                  {currentAvailableSlots.filter(s => timeToMinutes(s) >= 990).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 bg-indigo-50/90 px-3 py-1 rounded-xl border border-indigo-200/80">
                        <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ערב</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots.filter(s => timeToMinutes(s) >= 990).map((slot) => {
                          const startMin = timeToMinutes(slot);
                          const endMin = startMin + durationMinutes;
                          const endTime = minutesToTime(endMin);
                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-600 hover:text-white hover:shadow-md transition-all text-center group cursor-pointer"
                            >
                              <span className="text-lg font-black block tracking-wide group-hover:text-white text-slate-900">
                                {slot}
                              </span>
                              <span className="text-[10px] text-slate-500 group-hover:text-purple-100 block font-medium">
                                עד {endTime}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: פרטי הלקוח/ה ואישור */}
          {step === 'details' && (
            <form onSubmit={handleSubmitBooking} className="space-y-4 py-1">
              {/* Summary Card */}
              <div className="bg-purple-50/90 rounded-2xl p-3.5 border border-purple-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-purple-950">
                  <span>{selectedService.name}</span>
                  <span className="text-purple-700">{formatILS(selectedService.price)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-700">
                  <span>📅 תאריך: {toIsraeliDateString(selectedDate)}</span>
                  <span>⏰ שעה: {selectedSlot}</span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* User details card or editable inputs */}
              {currentUser?.name && currentUser?.phone && !isEditingDetails ? (
                <div className="bg-purple-50/70 border border-purple-200/80 p-4 rounded-2xl flex items-center justify-between shadow-2xs">
                  <div className="space-y-1 text-right">
                    <span className="text-[10px] font-extrabold text-purple-900 block">התור ייקבע עבור:</span>
                    <span className="text-base font-black text-slate-900 block">{customerName || currentUser.name}</span>
                    <span className="text-xs text-slate-600 font-semibold block" dir="ltr">{customerPhone || currentUser.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingDetails(true)}
                      className="text-xs text-purple-700 hover:text-purple-900 font-bold bg-white px-3 py-1.5 rounded-xl border border-purple-200 shadow-2xs hover:bg-purple-50 transition cursor-pointer"
                    >
                      שינוי פרטים
                    </button>
                    <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-xs">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentUser?.name && currentUser?.phone && isEditingDetails && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomerName(currentUser.name);
                          setCustomerPhone(currentUser.phone);
                          setIsEditingDetails(false);
                        }}
                        className="text-xs text-purple-600 font-bold hover:underline cursor-pointer"
                      >
                        ← חזרה לפרטים המחוברים
                      </button>
                    </div>
                  )}

                  {/* Name Input */}
                  <div className="space-y-1 text-right">
                    <label className="block text-xs font-bold text-slate-700">
                      שם מלא <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="שם מלא (פרטי ומשפחה)"
                        className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-sm font-medium outline-hidden"
                      />
                    </div>
                  </div>

                  {/* Phone Input */}
                  <div className="space-y-1 text-right">
                    <label className="block text-xs font-bold text-slate-700">
                      מספר טלפון נייד (לוואטסאפ) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        required
                        dir="ltr"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="05X-XXXXXXX"
                        className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-sm font-medium outline-hidden text-right"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  הערות לטיפול (אופציונלי)
                </label>
                <div className="relative">
                  <div className="absolute top-2.5 right-3 pointer-events-none text-slate-400">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="הסרת לק ישן, עיצוב מיוחד וכו'..."
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-100 text-xs font-medium outline-hidden"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-black text-base rounded-2xl shadow-lg shadow-purple-500/30 hover:shadow-purple-500/40 transition-all cursor-pointer flex items-center justify-center gap-2 mt-4"
              >
                {isSubmitting ? (
                  <span>שומר תור ומאשר...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>אישור וקביעת תור</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};

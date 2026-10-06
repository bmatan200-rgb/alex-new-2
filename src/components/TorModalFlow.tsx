import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  ChevronRight,
  ChevronLeft,
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
  Lock,
} from 'lucide-react';
import { Appointment, DayInfo, ScheduleSettings, Service, UserSession } from '../types';
import {
  BUSINESS_OPEN,
  BUSINESS_CLOSE,
  FRIDAY_CLOSE,
  buildNextDays,
  toISODateString,
  toShortIsraeliDateString,
  toIsraeliDateString,
  calculateAvailableSlots,
  getDailySlotsOccupancy,
  SlotOccupancy,
  minutesToTime,
  timeToMinutes,
  formatDurationMinutes,
  formatILS,
  getAllStandardSlots,
  isSlotInPast,
  isAppointmentInPast,
  HEBREW_MONTHS,
  HEBREW_WEEKDAYS,
} from '../utils/dateUtils';
import { SALON_INFO, saveUserSession } from '../utils/storage';
import { addAppointmentToFirestore, upsertCustomerToFirestore } from '../lib/firebase';
import { ExistingBookingChoiceModal } from './ExistingBookingChoiceModal';
import { CancelAppointmentConfirmModal } from './CancelAppointmentConfirmModal';
import { useTenant } from '../context/TenantContext';

interface TorModalFlowProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  appointments: Appointment[];
  currentUser?: UserSession | null;
  onBookSuccess: (newAppointment: Appointment) => void;
  scheduleSettings?: ScheduleSettings;
  onCancelAppointment?: (id: string | number) => Promise<void> | void;
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
  onCancelAppointment,
}) => {
  const { tenantId } = useTenant();
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
  const [showExistingChoiceModal, setShowExistingChoiceModal] = useState(false);
  const [existingBookingsForUser, setExistingBookingsForUser] = useState<Appointment[]>([]);
  const [confirmedAdditionalBooking, setConfirmedAdditionalBooking] = useState(false);
  const [apptToCancelInFlow, setApptToCancelInFlow] = useState<Appointment | null>(null);

  // Sync user info from session whenever currentUser or modal opens, and reset selection on open
  React.useEffect(() => {
    if (isOpen) {
      // Always reset selection to step 1 so the client can pick a treatment, date, and slot fresh
      setStep('treatment');
      setSelectedDate('');
      setSelectedSlot('');
      setNotes('');
      setIsEditingDetails(false);
      setErrorMessage('');
      setIsSubmitting(false);
      setShowExistingChoiceModal(false);
      setConfirmedAdditionalBooking(false);
      if (currentUser?.name) setCustomerName(currentUser.name);
      if (currentUser?.phone) setCustomerPhone(currentUser.phone);
    } else {
      setIsEditingDetails(false);
      setErrorMessage('');
      setIsSubmitting(false);
      setShowExistingChoiceModal(false);
      setConfirmedAdditionalBooking(false);
    }
  }, [isOpen, currentUser]);

  // 60 days (2 months) for the booking calendar
  const days: DayInfo[] = useMemo(() => buildNextDays(60), []);

  // Month navigation state (viewed month and year)
  const [viewedYear, setViewedYear] = useState<number>(() => new Date().getFullYear());
  const [viewedMonth, setViewedMonth] = useState<number>(() => new Date().getMonth());

  // Refs to reset scroll position when changing months or steps
  const daysListRef = useRef<HTMLDivElement>(null);
  const modalBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setViewedYear(now.getFullYear());
      setViewedMonth(now.getMonth());
    }
  }, [isOpen]);

  // Auto-scroll back to the top of the month whenever month, year or step changes
  useEffect(() => {
    if (daysListRef.current) {
      daysListRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (modalBodyRef.current) {
      modalBodyRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [viewedMonth, viewedYear, step]);

  const userActiveBookingsCount = useMemo(() => {
    const rawPhone = customerPhone || currentUser?.phone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 7) return 0;
    return appointments.filter(
      (a) => a.status === 'confirmed' && !isAppointmentInPast(a) && a.customer_phone.replace(/\D/g, '') === cleanPhone
    ).length;
  }, [customerPhone, currentUser, appointments]);

  const durationMinutes = selectedService?.duration_minutes || scheduleSettings?.durationMinutes || 90;
  const businessOpen = scheduleSettings?.businessOpen || BUSINESS_OPEN;
  const businessClose = scheduleSettings?.businessClose || BUSINESS_CLOSE;
  const fridayOpen = scheduleSettings?.fridayOpen || '09:20';
  const fridayClose = scheduleSettings?.fridayClose || FRIDAY_CLOSE;

  // Calculate available slots for a given day
  const getSlotsForDay = (dateIso: string) => {
    return calculateAvailableSlots({
      durationMinutes,
      existingAppointments: appointments,
      dateString: dateIso,
      businessOpen,
      businessClose,
      fridayOpen,
      fridayClose,
      slotInterval: durationMinutes,
    });
  };

  // Filter out any slots that have already passed for today or past days
  const getEffectiveAvailableSlots = (dateIso: string) => {
    const slots = getSlotsForDay(dateIso);
    return slots.filter((slotTime) => !isSlotInPast(dateIso, slotTime));
  };

  const todayIso = toISODateString(new Date());

  // Generate days for the currently viewed month (starts from current day for the current month)
  const viewedMonthDays = useMemo(() => {
    const totalDays = new Date(viewedYear, viewedMonth + 1, 0).getDate();
    const result = [];
    const now = new Date();
    const isCurrentMonth =
      viewedYear === now.getFullYear() && viewedMonth === now.getMonth();
    const startDay = isCurrentMonth ? now.getDate() : 1;

    for (let d = startDay; d <= totalDays; d++) {
      const dateObj = new Date(viewedYear, viewedMonth, d);
      const iso = toISODateString(dateObj);
      const dayOfWeek = dateObj.getDay();
      const isClosed = dayOfWeek === 6; // Closed on Saturday
      const isPast = iso < todayIso;
      const isToday = iso === todayIso;
      const availSlots = !isPast && !isClosed ? getEffectiveAvailableSlots(iso) : [];
      const isAvailable = !isPast && !isClosed && availSlots.length > 0;

      result.push({
        iso,
        dayNumber: d,
        weekday: HEBREW_WEEKDAYS[dayOfWeek],
        dayOfWeek,
        isPast,
        isToday,
        isClosed,
        availSlots,
        isAvailable,
      });
    }
    return result;
  }, [viewedYear, viewedMonth, appointments, durationMinutes, businessOpen, businessClose, todayIso]);

  const currentNow = new Date();
  const canGoPrevMonth =
    viewedYear > currentNow.getFullYear() ||
    (viewedYear === currentNow.getFullYear() && viewedMonth > currentNow.getMonth());

  const handlePrevMonth = () => {
    if (!canGoPrevMonth) return;
    if (viewedMonth === 0) {
      setViewedMonth(11);
      setViewedYear((y) => y - 1);
    } else {
      setViewedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewedMonth === 11) {
      setViewedMonth(0);
      setViewedYear((y) => y + 1);
    } else {
      setViewedMonth((m) => m + 1);
    }
  };

  // Full occupancy of all standard slots for selected date (including occupied, blocked, and free)
  const currentSlotsOccupancy: SlotOccupancy[] = useMemo(() => {
    if (!selectedDate) return [];
    return getDailySlotsOccupancy(
      selectedDate,
      appointments,
      durationMinutes,
      businessOpen,
      businessClose,
      fridayClose,
      fridayOpen
    );
  }, [selectedDate, appointments, durationMinutes, businessOpen, businessClose, fridayOpen, fridayClose]);

  const effectiveAvailableSlotsCount = useMemo(() => {
    if (!selectedDate) return 0;
    return currentSlotsOccupancy.filter((s) => s.isAvailable && !isSlotInPast(selectedDate, s.time)).length;
  }, [currentSlotsOccupancy, selectedDate]);

  const handleSelectService = (service: Service) => {
    setSelectedService(service);
    setStep('day');
  };

  const handleSelectDay = (dayIso: string) => {
    setSelectedDate(dayIso);
    setSelectedSlot('');
    setStep('slot');
  };

  const handleSelectDirectDate = (dateIso: string) => {
    if (!dateIso) return;
    setSelectedDate(dateIso);
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

  const executeBookingSubmission = async (nameToUse: string, phoneToUse: string, adminFlag: boolean) => {
    setIsSubmitting(true);

    try {
      const startMin = timeToMinutes(selectedSlot);
      const endMin = startMin + durationMinutes;
      const endTimeStr = minutesToTime(endMin);

      const newAppt: Omit<Appointment, 'id'> = {
        customer_name: nameToUse,
        customer_phone: phoneToUse,
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

      // Save user session in localStorage (Always strictly customer session)
      saveUserSession({
        name: nameToUse,
        phone: phoneToUse,
        isAdmin: false,
        loggedInAt: new Date().toISOString(),
        acceptedTerms: currentUser?.acceptedTerms ?? true,
        acceptedTermsAt: currentUser?.acceptedTermsAt || new Date().toISOString(),
        signatureDataUrl: currentUser?.signatureDataUrl,
      });

      // Save or update customer record in Firestore customers directory
      if (!adminFlag) {
        upsertCustomerToFirestore({
          full_name: nameToUse,
          phone: phoneToUse,
        }).catch((err) => {
          console.warn('[Customer Directory] upsert notice:', err);
        });
      }

      // Save to Firestore & local storage
      const savedId = await addAppointmentToFirestore(newAppt as any, tenantId);

      setIsSubmitting(false);
      onBookSuccess({ ...newAppt, id: savedId } as Appointment);
      onClose();
    } catch (err: any) {
      console.error('Failed to book appointment:', err);
      if (err?.name === 'SlotTakenError' || err?.message?.includes('השעה הזו כבר נתפסה')) {
        setErrorMessage('השעה הזו כבר נתפסה, נא לבחור שעה אחרת');
        setStep('slot'); // חזרה לבחירת שעה
      } else {
        setErrorMessage('אירעה שגיאה בקביעת התור. אנא נסו שנית.');
      }
      setIsSubmitting(false);
    }
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

    // Only preserve admin rights if user is already an authenticated admin; booking as client never elevates role
    const isAdmin = currentUser?.isAdmin === true;

    const existingActive = appointments.filter(
      (a) =>
        a.status === 'confirmed' &&
        !isAppointmentInPast(a) &&
        a.customer_phone.replace(/\D/g, '') === cleanPhone
    );

    // הגבלה של עד 3 תורים עצמאיים במקביל (מעבר ל-3 תורים יש לפנות למנהלת אלכס ביטון)
    if (!isAdmin && existingActive.length >= 3) {
      setExistingBookingsForUser(existingActive);
      setShowExistingChoiceModal(true);
      return;
    }

    if (existingActive.length > 0 && !confirmedAdditionalBooking) {
      setExistingBookingsForUser(existingActive);
      setShowExistingChoiceModal(true);
      return;
    }

    await executeBookingSubmission(cleanName, cleanPhone, isAdmin);
  };

  if (!isOpen) return null;

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
            
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-950 font-['Rubik',sans-serif]">
                  {step === 'treatment' && 'בחירת טיפול'}
                  {step === 'day' && 'בחירת יום'}
                  {step === 'slot' && 'בחירת שעה'}
                  {step === 'details' && 'פרטי הלקוח/ה ואישור'}
                </h2>
                {userActiveBookingsCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    תור נוסף
                  </span>
                )}
              </div>
            </div>
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
        <div ref={modalBodyRef} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* STEP 1: בחירת טיפול */}
          {step === 'treatment' && (
            <div className="space-y-4 py-2">
              {userActiveBookingsCount > 0 && (
                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-xs text-purple-900 flex items-center gap-2 shadow-xs">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="font-medium">
                    יש לך כבר {userActiveBookingsCount === 1 ? 'תור משוריין' : `${userActiveBookingsCount} תורים משוריינים`}. התור שייקבע כעת יתווסף במערכת בנוסף לתור הקיים ✨
                  </span>
                </div>
              )}
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

          {/* STEP 2: בחירת יום - ניווט חודשים חופשי ללא בחירה אוטומטית */}
          {step === 'day' && (
            <div className="space-y-3.5 py-1">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
                <span>טיפול: <strong className="text-purple-700 font-bold">{selectedService.name}</strong></span>
              </div>

              {/* Month Navigation Bar (Navigates months freely without auto-selecting a day) */}
              <div className="bg-slate-900 text-white p-3 rounded-2xl flex items-center justify-between shadow-sm">
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-2 hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center gap-1 text-xs font-bold text-purple-300 active:scale-95"
                  title="חודש הבא"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>חודש הבא</span>
                </button>

                <div className="text-center">
                  <span className="text-sm sm:text-base font-black tracking-wide font-['Rubik',sans-serif] text-white">
                    {HEBREW_MONTHS[viewedMonth]} {viewedYear}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handlePrevMonth}
                  disabled={!canGoPrevMonth}
                  className={`p-2 rounded-xl transition flex items-center gap-1 text-xs font-bold ${
                    canGoPrevMonth
                      ? 'hover:bg-slate-800 text-purple-300 cursor-pointer active:scale-95'
                      : 'text-slate-600 cursor-not-allowed opacity-40'
                  }`}
                  title="חודש קודם"
                >
                  <span>חודש קודם</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* Vertical Day Buttons list for the viewed month */}
              <div ref={daysListRef} className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-0.5">
                {viewedMonthDays.map((day) => {
                  const isAvailable = day.isAvailable;
                  const shortDate = toShortIsraeliDateString(day.iso);

                  const dayLabel = day.isToday
                    ? `היום, ${shortDate}`
                    : `יום ${day.weekday}, ${shortDate}`;

                  return (
                    <button
                      key={day.iso}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => handleSelectDay(day.iso)}
                      className={`w-full py-3.5 px-5 rounded-2xl border text-center font-bold text-sm sm:text-base transition-all flex items-center justify-between ${
                        isAvailable
                          ? 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50/50 hover:shadow-md text-slate-900 cursor-pointer active:scale-98'
                          : day.isPast
                          ? 'bg-slate-50/60 border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                          : day.isClosed
                          ? 'bg-slate-50/80 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                          : 'bg-red-50/60 border-red-200 text-red-600 cursor-not-allowed font-medium'
                      }`}
                    >
                      <span className={`${isAvailable ? 'text-slate-900 font-black' : !day.isClosed && !day.isPast ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                        {dayLabel}
                      </span>

                      {isAvailable ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-black border border-purple-200">
                          {day.availSlots.length} פנויים
                        </span>
                      ) : day.isPast ? (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">
                          עבר
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

              {/* Note Style */}
              <div className="pt-1 text-center text-xs text-slate-500 font-medium flex items-center justify-center gap-2">
                <span>* לחיצה על יום פנוי תחשוף את כל השעות הפנויות באותו היום</span>
              </div>
            </div>
          )}

          {/* STEP 3: בחירת שעה */}
          {step === 'slot' && (
            <div className="space-y-4 py-1">
              <div className="bg-purple-50 rounded-2xl p-3 border border-purple-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-purple-700" />
                  <span className="text-purple-950 font-bold">
                    {selectedDayInfo?.isToday
                      ? `היום (${toIsraeliDateString(selectedDate)})`
                      : `יום ${selectedDayInfo?.weekday || ''} (${toIsraeliDateString(selectedDate)})`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('day')}
                  className="px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-800 border border-purple-300 rounded-xl font-black text-[11px] transition cursor-pointer active:scale-95 shadow-2xs"
                  title="בחירת יום אחר"
                >
                  החלף יום 🔄
                </button>
              </div>

              {currentSlotsOccupancy.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-600 text-sm space-y-3">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                  <p className="font-bold">אין שעות פעילות ביום זה</p>
                  <button
                    type="button"
                    onClick={() => setStep('day')}
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                  >
                    בחירת יום אחר
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {effectiveAvailableSlotsCount === 0 ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>כל התורים ביום זה כבר תפוסים</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep('day')}
                        className="underline text-purple-700 font-black cursor-pointer hover:text-purple-900"
                      >
                        בחירת יום אחר
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs text-slate-500 font-medium px-1">
                      <span>בחירת שעה פנויה לקביעת התור:</span>
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 text-[11px]">
                        {effectiveAvailableSlotsCount} תורים פנויים
                      </span>
                    </div>
                  )}

                  {/* Morning Slots (before 12:00) */}
                  {currentSlotsOccupancy.filter((s) => timeToMinutes(s.time) < 720).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50/90 px-3 py-1 rounded-xl border border-amber-200/80">
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        <span>בוקר</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentSlotsOccupancy
                          .filter((s) => timeToMinutes(s.time) < 720)
                          .map((slot) => {
                            const inPast = isSlotInPast(selectedDate, slot.time);
                            const isOccupied = !slot.isAvailable;
                            const isClickable = slot.isAvailable && !inPast;

                            if (isClickable) {
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot.time)}
                                  className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900 hover:shadow-md transition-all text-center group cursor-pointer active:scale-95"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-lg font-black tracking-wide group-hover:text-purple-700 text-slate-900 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      פנוי
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 group-hover:text-purple-700 block font-medium">
                                    עד {slot.endTime}
                                  </span>
                                </button>
                              );
                            }

                            if (isOccupied) {
                              return (
                                <div
                                  key={slot.time}
                                  className="relative p-3 rounded-2xl bg-slate-50/90 border-2 border-red-200/70 text-slate-400 select-none overflow-hidden cursor-not-allowed group shadow-2xs"
                                  title="תור זה כבר תפוס"
                                >
                                  {/* Red horizontal strike line across the slot box */}
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-full h-[2px] bg-red-400/80 shadow-xs" />
                                  </div>

                                  <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                    <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-red-500 decoration-2 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5 shadow-2xs">
                                      <Lock className="w-2.5 h-2.5 text-red-600" />
                                      <span>תפוס</span>
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 relative z-10">
                                    <span className="line-through decoration-red-400/60 text-slate-400">עד {slot.endTime}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={slot.time}
                                className="relative p-3 rounded-2xl bg-slate-50/60 border-2 border-slate-200/80 text-slate-400 select-none overflow-hidden cursor-not-allowed opacity-60"
                                title="שעה זו עברה"
                              >
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                  <div className="w-full h-[1.5px] bg-slate-300" />
                                </div>

                                <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                  <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-slate-400 decoration-1 font-['Rubik',sans-serif]">
                                    {slot.time}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    עבר
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 block font-medium relative z-10">
                                  עד {slot.endTime}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Slots (12:00 - 16:30) */}
                  {currentSlotsOccupancy.filter(
                    (s) => timeToMinutes(s.time) >= 720 && timeToMinutes(s.time) < 990
                  ).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-800 bg-orange-50/90 px-3 py-1 rounded-xl border border-orange-200/80">
                        <Sunset className="w-3.5 h-3.5 text-orange-600" />
                        <span>צהריים ואחה״צ</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentSlotsOccupancy
                          .filter((s) => timeToMinutes(s.time) >= 720 && timeToMinutes(s.time) < 990)
                          .map((slot) => {
                            const inPast = isSlotInPast(selectedDate, slot.time);
                            const isOccupied = !slot.isAvailable;
                            const isClickable = slot.isAvailable && !inPast;

                            if (isClickable) {
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot.time)}
                                  className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900 hover:shadow-md transition-all text-center group cursor-pointer active:scale-95"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-lg font-black tracking-wide group-hover:text-purple-700 text-slate-900 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      פנוי
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 group-hover:text-purple-700 block font-medium">
                                    עד {slot.endTime}
                                  </span>
                                </button>
                              );
                            }

                            if (isOccupied) {
                              return (
                                <div
                                  key={slot.time}
                                  className="relative p-3 rounded-2xl bg-slate-50/90 border-2 border-red-200/70 text-slate-400 select-none overflow-hidden cursor-not-allowed group shadow-2xs"
                                  title="תור זה כבר תפוס"
                                >
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-full h-[2px] bg-red-400/80 shadow-xs" />
                                  </div>

                                  <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                    <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-red-500 decoration-2 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5 shadow-2xs">
                                      <Lock className="w-2.5 h-2.5 text-red-600" />
                                      <span>תפוס</span>
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 relative z-10">
                                    <span className="line-through decoration-red-400/60 text-slate-400">עד {slot.endTime}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={slot.time}
                                className="relative p-3 rounded-2xl bg-slate-50/60 border-2 border-slate-200/80 text-slate-400 select-none overflow-hidden cursor-not-allowed opacity-60"
                                title="שעה זו עברה"
                              >
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                  <div className="w-full h-[1.5px] bg-slate-300" />
                                </div>

                                <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                  <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-slate-400 decoration-1 font-['Rubik',sans-serif]">
                                    {slot.time}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    עבר
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 block font-medium relative z-10">
                                  עד {slot.endTime}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Evening Slots (16:30+) */}
                  {currentSlotsOccupancy.filter((s) => timeToMinutes(s.time) >= 990).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800 bg-indigo-50/90 px-3 py-1 rounded-xl border border-indigo-200/80">
                        <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ערב</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentSlotsOccupancy
                          .filter((s) => timeToMinutes(s.time) >= 990)
                          .map((slot) => {
                            const inPast = isSlotInPast(selectedDate, slot.time);
                            const isOccupied = !slot.isAvailable;
                            const isClickable = slot.isAvailable && !inPast;

                            if (isClickable) {
                              return (
                                <button
                                  key={slot.time}
                                  type="button"
                                  onClick={() => handleSelectSlot(slot.time)}
                                  className="p-3 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900 hover:shadow-md transition-all text-center group cursor-pointer active:scale-95"
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="text-lg font-black tracking-wide group-hover:text-purple-700 text-slate-900 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      פנוי
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-500 group-hover:text-purple-700 block font-medium">
                                    עד {slot.endTime}
                                  </span>
                                </button>
                              );
                            }

                            if (isOccupied) {
                              return (
                                <div
                                  key={slot.time}
                                  className="relative p-3 rounded-2xl bg-slate-50/90 border-2 border-red-200/70 text-slate-400 select-none overflow-hidden cursor-not-allowed group shadow-2xs"
                                  title="תור זה כבר תפוס"
                                >
                                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                    <div className="w-full h-[2px] bg-red-400/80 shadow-xs" />
                                  </div>

                                  <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                    <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-red-500 decoration-2 font-['Rubik',sans-serif]">
                                      {slot.time}
                                    </span>
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 flex items-center gap-0.5 shadow-2xs">
                                      <Lock className="w-2.5 h-2.5 text-red-600" />
                                      <span>תפוס</span>
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 relative z-10">
                                    <span className="line-through decoration-red-400/60 text-slate-400">עד {slot.endTime}</span>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={slot.time}
                                className="relative p-3 rounded-2xl bg-slate-50/60 border-2 border-slate-200/80 text-slate-400 select-none overflow-hidden cursor-not-allowed opacity-60"
                                title="שעה זו עברה"
                              >
                                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                  <div className="w-full h-[1.5px] bg-slate-300" />
                                </div>

                                <div className="flex items-center justify-between gap-1 mb-1 relative z-10">
                                  <span className="text-lg font-black tracking-wide text-slate-400 line-through decoration-slate-400 decoration-1 font-['Rubik',sans-serif]">
                                    {slot.time}
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                    עבר
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 block font-medium relative z-10">
                                  עד {slot.endTime}
                                </span>
                              </div>
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
                    <span>{userActiveBookingsCount > 0 ? 'אישור וקביעת תור נוסף' : 'אישור וקביעת תור'}</span>
                  </>
                )}
              </button>
            </form>
          )}

        </div>

      </div>

      {/* Choice Modal: Book another or cancel existing */}
      <ExistingBookingChoiceModal
        isOpen={showExistingChoiceModal}
        onClose={() => setShowExistingChoiceModal(false)}
        existingAppointments={existingBookingsForUser}
        onBookAnother={() => {
          const isAdmin = currentUser?.isAdmin === true;
          if (!isAdmin && existingBookingsForUser.length >= 3) {
            return;
          }
          setShowExistingChoiceModal(false);
          setConfirmedAdditionalBooking(true);
          const cleanName = customerName.trim();
          const cleanPhone = customerPhone.replace(/\D/g, '');
          executeBookingSubmission(cleanName, cleanPhone, isAdmin);
        }}
        onCancelExisting={(appt) => {
          setShowExistingChoiceModal(false);
          setApptToCancelInFlow(appt);
        }}
      />

      {/* Confirmation modal before actual cancel in flow */}
      <CancelAppointmentConfirmModal
        isOpen={Boolean(apptToCancelInFlow)}
        appointment={apptToCancelInFlow}
        onClose={() => setApptToCancelInFlow(null)}
        onConfirm={async () => {
          if (apptToCancelInFlow && onCancelAppointment) {
            await onCancelAppointment(apptToCancelInFlow.id);
            setApptToCancelInFlow(null);
          }
        }}
      />
    </div>
  );
};

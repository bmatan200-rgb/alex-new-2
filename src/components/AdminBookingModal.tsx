import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  ChevronRight,
  Calendar,
  Clock,
  Sparkles,
  User,
  Phone,
  FileText,
  Check,
  CheckCircle2,
  Sun,
  Sunset,
  Moon,
  AlertCircle,
  CalendarPlus,
  Search,
  ArrowLeft,
  ChevronLeft,
} from 'lucide-react';
import { Appointment, Service, ScheduleSettings, DayInfo } from '../types';
import {
  buildNextDays,
  calculateAvailableSlots,
  toIsraeliDateString,
  toShortIsraeliDateString,
  formatHebrewFullDate,
  formatILS,
  formatDurationMinutes,
  isSlotInPast,
  timeToMinutes,
  minutesToTime,
} from '../utils/dateUtils';
import { upsertCustomerToFirestore } from '../lib/firebase';

interface AdminBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  services: Service[];
  appointments: Appointment[];
  scheduleSettings?: ScheduleSettings;
  onAddAppointment: (appointment: Omit<Appointment, 'id'>) => Promise<void> | void;
  initialDate?: string;
  initialSlot?: string;
  initialCustomerName?: string;
  initialCustomerPhone?: string;
  initialNotes?: string;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

type Step = 'treatment' | 'day' | 'slot' | 'details';

export const AdminBookingModal: React.FC<AdminBookingModalProps> = ({
  isOpen,
  onClose,
  services,
  appointments,
  scheduleSettings,
  onAddAppointment,
  initialDate,
  initialSlot,
  initialCustomerName = '',
  initialCustomerPhone = '',
  initialNotes = '',
  onShowToast,
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
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Extract unique customers from existing appointments for quick autocomplete
  const existingCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>();
    appointments.forEach((a) => {
      const cleanPhone = (a.customer_phone || '').replace(/\D/g, '');
      const cleanName = (a.customer_name || '').trim();
      if (cleanName && cleanPhone && cleanPhone.length >= 7 && !cleanName.includes('חסום')) {
        if (!map.has(cleanPhone)) {
          map.set(cleanPhone, { name: cleanName, phone: a.customer_phone });
        }
      }
    });
    return Array.from(map.values());
  }, [appointments]);

  // Filtered customer suggestions
  const customerSuggestions = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    const q = customerSearchQuery.trim().toLowerCase();
    const cleanQ = q.replace(/\D/g, '');
    return existingCustomers
      .filter((c) => {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = cleanQ.length >= 3 && c.phone.replace(/\D/g, '').includes(cleanQ);
        return matchesName || matchesPhone;
      })
      .slice(0, 5);
  }, [customerSearchQuery, existingCustomers]);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setIsSubmitting(false);
      setCustomerSearchQuery('');
      setCustomerName(initialCustomerName || '');
      setCustomerPhone(initialCustomerPhone || '');
      setNotes(initialNotes || '');

      if (initialDate && initialSlot) {
        // Pre-filled from specific slot
        setSelectedDate(initialDate);
        setSelectedSlot(initialSlot);
        setStep('details');
      } else if (initialDate) {
        setSelectedDate(initialDate);
        setSelectedSlot('');
        setStep('slot');
      } else {
        setSelectedDate('');
        setSelectedSlot('');
        setStep('treatment');
      }
    }
  }, [isOpen, initialDate, initialSlot, initialCustomerName, initialCustomerPhone, initialNotes]);

  // Next 30 days for scheduling
  const days: DayInfo[] = useMemo(() => buildNextDays(30), []);

  const durationMinutes = selectedService?.duration_minutes || 90;
  const businessOpen = scheduleSettings?.businessOpen || '09:20';
  const businessClose = scheduleSettings?.businessClose || '20:30';

  // Calculate available slots for day
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

  const getEffectiveAvailableSlots = (dateIso: string) => {
    const slots = getSlotsForDay(dateIso);
    return slots.filter((slotTime) => !isSlotInPast(dateIso, slotTime));
  };

  const currentAvailableSlots = selectedDate ? getEffectiveAvailableSlots(selectedDate) : [];
  const selectedDayInfo = days.find((d) => d.iso === selectedDate);

  if (!isOpen) return null;

  const handleSelectService = (service: Service) => {
    setSelectedService(service);
    if (!selectedDate) {
      setStep('day');
    } else if (!selectedSlot) {
      setStep('slot');
    } else {
      setStep('details');
    }
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

  const handleSelectExistingCustomer = (c: { name: string; phone: string }) => {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerSearchQuery('');
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();

    if (!cleanName) {
      setErrorMessage('נא להזין שם לקוח/ה');
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setErrorMessage('נא לבחור תאריך ושעה לתור');
      return;
    }

    setIsSubmitting(true);

    try {
      const startMin = timeToMinutes(selectedSlot);
      const endMin = startMin + durationMinutes;
      const endTimeStr = minutesToTime(endMin);

      const newAppt: Omit<Appointment, 'id'> = {
        customer_name: cleanName,
        customer_phone: cleanPhone || 'שריון יזום',
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

      // Save customer in Firestore if valid phone provided
      if (cleanPhone && cleanPhone !== 'שריון יזום') {
        upsertCustomerToFirestore({
          full_name: cleanName,
          phone: cleanPhone,
          notes: notes.trim() || undefined,
        }).catch((err) => {
          console.warn('[Admin Booking] customer upsert notice:', err);
        });
      }

      await onAddAppointment(newAppt);

      onShowToast(
        `התור של ${cleanName} ל-${selectedService.name} נקבע בהצלחה בתאריך ${toIsraeliDateString(selectedDate)} בשעה ${selectedSlot}! 🌸`,
        'success'
      );
      onClose();
    } catch (err: any) {
      console.error('Error submitting admin booking:', err);
      setErrorMessage('שגיאה בשמירת התור: ' + (err?.message || 'אנא נסי שוב'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] relative text-slate-900 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Top Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            {step !== 'treatment' ? (
              <button
                type="button"
                onClick={handleBack}
                className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
                title="חזרה לשלב הקודם"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center shadow-xs">
                <CalendarPlus className="w-5 h-5 text-purple-700" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-950 font-['Rubik',sans-serif]">
                  {step === 'treatment' && 'בחירת טיפול ללקוח/ה'}
                  {step === 'day' && 'בחירת יום ביומן'}
                  {step === 'slot' && 'בחירת שעה פנויה'}
                  {step === 'details' && 'פרטי הלקוח/ה ואישור'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 hidden sm:inline-block">
                  ממשק מנהלת
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {step === 'treatment' && 'שלב 1 מתוך 4'}
                {step === 'day' && `שלב 2 מתוך 4 • ${selectedService.name}`}
                {step === 'slot' && `שלב 3 מתוך 4 • ${selectedDayInfo ? `יום ${selectedDayInfo.weekday}, ${toIsraeliDateString(selectedDate)}` : selectedDate}`}
                {step === 'details' && 'שלב 4 מתוך 4 • סיום ושריון'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
            title="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Progress Bar */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-center">
          <button
            type="button"
            onClick={() => setStep('treatment')}
            className={`py-1 rounded-lg transition cursor-pointer ${
              step === 'treatment'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            1. טיפול
          </button>
          <button
            type="button"
            onClick={() => setStep('day')}
            className={`py-1 rounded-lg transition cursor-pointer ${
              step === 'day'
                ? 'bg-purple-600 text-white shadow-xs'
                : selectedDate
                ? 'text-purple-700 hover:bg-white font-black'
                : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            2. יום
          </button>
          <button
            type="button"
            onClick={() => selectedDate && setStep('slot')}
            disabled={!selectedDate}
            className={`py-1 rounded-lg transition ${
              step === 'slot'
                ? 'bg-purple-600 text-white shadow-xs'
                : selectedSlot
                ? 'text-purple-700 hover:bg-white font-black cursor-pointer'
                : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            3. שעה
          </button>
          <button
            type="button"
            onClick={() => selectedDate && selectedSlot && setStep('details')}
            disabled={!selectedDate || !selectedSlot}
            className={`py-1 rounded-lg transition ${
              step === 'details'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-400 cursor-not-allowed'
            }`}
          >
            4. לקוח/ה
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* STEP 1: בחירת טיפול */}
          {step === 'treatment' && (
            <div className="space-y-3.5 py-1">
              <div className="text-right space-y-1">
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                  סוג הטיפול המבוקש
                </span>
                <p className="text-xs text-slate-500 font-medium">
                  בחרי את השירות עבור הלקוח/ה לקביעת משך הטיפול ביומן:
                </p>
              </div>

              <div className="space-y-2.5">
                {services.map((service) => {
                  const duration = service.duration_minutes || 90;
                  const isSelected = selectedService.id === service.id;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => handleSelectService(service)}
                      className={`w-full relative group p-4 sm:p-4.5 rounded-2xl border-2 transition-all text-right cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50/70 shadow-md ring-2 ring-purple-500/20'
                          : 'border-slate-200 bg-white hover:border-purple-400 hover:bg-purple-50/30 hover:shadow-xs'
                      }`}
                    >
                      <span
                        className={`absolute -top-2.5 right-5 px-2.5 py-0.5 rounded-full text-[11px] font-black border transition ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-slate-100 text-slate-700 border-slate-300 group-hover:bg-purple-100 group-hover:text-purple-900'
                        }`}
                      >
                        {duration} דק׳
                      </span>

                      <div className="space-y-1 pr-1">
                        <div className="flex items-center gap-2">
                          <h3
                            className={`text-base font-black transition ${
                              isSelected ? 'text-purple-950' : 'text-slate-900 group-hover:text-purple-700'
                            }`}
                          >
                            {service.name}
                          </h3>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0" />
                          )}
                        </div>
                        {service.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">
                            {service.description}
                          </p>
                        )}
                      </div>

                      <div className="text-left shrink-0 mr-3">
                        <span
                          className={`text-base font-black font-['Rubik',sans-serif] ${
                            isSelected ? 'text-purple-700' : 'text-slate-900'
                          }`}
                        >
                          {formatILS(service.price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: בחירת יום ביומן */}
          {step === 'day' && (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between bg-purple-50/80 p-3 rounded-2xl border border-purple-200 text-xs">
                <span className="text-slate-700 font-medium">
                  טיפול נבחר: <strong className="text-purple-900 font-bold">{selectedService.name}</strong>
                </span>
                <span className="font-bold text-purple-700">
                  {formatDurationMinutes(durationMinutes)}
                </span>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  בחרי יום מתוך 30 הימים הקרובים:
                </span>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
                  {days.map((day) => {
                    const availSlots = getEffectiveAvailableSlots(day.iso);
                    const isAvailable = !day.isClosed && availSlots.length > 0;
                    const shortDate = toShortIsraeliDateString(day.iso);
                    const isSelected = selectedDate === day.iso;

                    const dayLabel = day.isToday
                      ? `היום, ${shortDate}`
                      : `יום ${day.weekday}, ${shortDate}`;

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => handleSelectDay(day)}
                        className={`w-full py-3 px-4 rounded-2xl border text-center font-bold text-sm transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
                            : isAvailable
                            ? 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50/40 hover:shadow-xs text-slate-900 cursor-pointer'
                            : day.isClosed
                            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                            : 'bg-red-50/60 border-red-200 text-red-600 cursor-not-allowed font-medium'
                        }`}
                      >
                        <span
                          className={`${
                            isSelected
                              ? 'text-white font-black'
                              : isAvailable
                              ? 'text-slate-900 font-black'
                              : !day.isClosed
                              ? 'text-red-600 font-bold'
                              : 'text-slate-400'
                          }`}
                        >
                          {dayLabel}
                        </span>

                        {isSelected ? (
                          <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/20 text-white font-black">
                            נבחר ✓
                          </span>
                        ) : isAvailable ? (
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
              </div>

              <div className="pt-1 text-center text-xs text-slate-500 font-medium">
                <span>* ימים ללא תורים פנויים מסומנים ב</span>
                <span className="text-red-600 font-bold">אדום</span>
              </div>
            </div>
          )}

          {/* STEP 3: בחירת שעה פנויה */}
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
                    className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                  >
                    בחרי יום אחר
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500 font-medium text-center">
                    לחצי על השעה המתאימה מתוך השעות הפנויות:
                  </p>

                  {/* Morning Slots (before 12:00) */}
                  {currentAvailableSlots.filter((s) => timeToMinutes(s) < 720).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-50 px-3 py-1 rounded-xl border border-amber-200">
                        <Sun className="w-3.5 h-3.5 text-amber-600" />
                        <span>בוקר</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots
                          .filter((s) => timeToMinutes(s) < 720)
                          .map((slot) => {
                            const startMin = timeToMinutes(slot);
                            const endMin = startMin + durationMinutes;
                            const endTime = minutesToTime(endMin);
                            const isSelected = selectedSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => handleSelectSlot(slot)}
                                className={`p-3 rounded-2xl border-2 transition-all text-center group cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
                                    : 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900'
                                }`}
                              >
                                <span
                                  className={`text-lg font-black block tracking-wide ${
                                    isSelected ? 'text-white' : 'text-slate-900 group-hover:text-purple-700'
                                  }`}
                                >
                                  {slot}
                                </span>
                                <span
                                  className={`text-[10px] block font-medium ${
                                    isSelected ? 'text-purple-100' : 'text-slate-500 group-hover:text-purple-700'
                                  }`}
                                >
                                  עד {endTime}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Slots (12:00 - 16:30) */}
                  {currentAvailableSlots.filter(
                    (s) => timeToMinutes(s) >= 720 && timeToMinutes(s) < 990
                  ).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-900 bg-orange-50 px-3 py-1 rounded-xl border border-orange-200">
                        <Sunset className="w-3.5 h-3.5 text-orange-600" />
                        <span>צהריים ואחה״צ</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots
                          .filter((s) => timeToMinutes(s) >= 720 && timeToMinutes(s) < 990)
                          .map((slot) => {
                            const startMin = timeToMinutes(slot);
                            const endMin = startMin + durationMinutes;
                            const endTime = minutesToTime(endMin);
                            const isSelected = selectedSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => handleSelectSlot(slot)}
                                className={`p-3 rounded-2xl border-2 transition-all text-center group cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
                                    : 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900'
                                }`}
                              >
                                <span
                                  className={`text-lg font-black block tracking-wide ${
                                    isSelected ? 'text-white' : 'text-slate-900 group-hover:text-purple-700'
                                  }`}
                                >
                                  {slot}
                                </span>
                                <span
                                  className={`text-[10px] block font-medium ${
                                    isSelected ? 'text-purple-100' : 'text-slate-500 group-hover:text-purple-700'
                                  }`}
                                >
                                  עד {endTime}
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Evening Slots (16:30+) */}
                  {currentAvailableSlots.filter((s) => timeToMinutes(s) >= 990).length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200">
                        <Moon className="w-3.5 h-3.5 text-indigo-600" />
                        <span>ערב</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {currentAvailableSlots
                          .filter((s) => timeToMinutes(s) >= 990)
                          .map((slot) => {
                            const startMin = timeToMinutes(slot);
                            const endMin = startMin + durationMinutes;
                            const endTime = minutesToTime(endMin);
                            const isSelected = selectedSlot === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() => handleSelectSlot(slot)}
                                className={`p-3 rounded-2xl border-2 transition-all text-center group cursor-pointer ${
                                  isSelected
                                    ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-500/20'
                                    : 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50 text-slate-900'
                                }`}
                              >
                                <span
                                  className={`text-lg font-black block tracking-wide ${
                                    isSelected ? 'text-white' : 'text-slate-900 group-hover:text-purple-700'
                                  }`}
                                >
                                  {slot}
                                </span>
                                <span
                                  className={`text-[10px] block font-medium ${
                                    isSelected ? 'text-purple-100' : 'text-slate-500 group-hover:text-purple-700'
                                  }`}
                                >
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

          {/* STEP 4: פרטי הלקוח/ה ואישור שריון */}
          {step === 'details' && (
            <form onSubmit={handleSubmitBooking} className="space-y-4 py-1 text-right">
              {/* Summary Card with edit buttons */}
              <div className="bg-purple-50/80 rounded-2xl p-4 border border-purple-200 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between pb-2 border-b border-purple-200">
                  <div>
                    <span className="text-[11px] text-purple-700 font-bold block">טיפול נבחר</span>
                    <span className="font-black text-sm text-slate-900">{selectedService.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-black text-purple-900">
                      {formatILS(selectedService.price)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep('treatment')}
                      className="text-xs text-purple-700 underline font-bold hover:text-purple-900 cursor-pointer"
                    >
                      שינוי
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-purple-100">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">תאריך</span>
                        <span className="font-bold text-slate-900 font-mono text-[11px]">
                          {toIsraeliDateString(selectedDate)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('day')}
                      className="text-[11px] text-purple-700 underline font-bold cursor-pointer"
                    >
                      עריכה
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-purple-100">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-purple-600" />
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">שעה</span>
                        <span className="font-bold text-slate-900 font-mono text-[11px]">
                          {selectedSlot} - {minutesToTime(timeToMinutes(selectedSlot) + durationMinutes)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('slot')}
                      className="text-[11px] text-purple-700 underline font-bold cursor-pointer"
                    >
                      עריכה
                    </button>
                  </div>
                </div>

                {selectedDate && (
                  <div className="text-[11px] text-purple-900 font-medium">
                    {formatHebrewFullDate(selectedDate)}
                  </div>
                )}
              </div>

              {/* Quick Customer Search Autocomplete */}
              {existingCustomers.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    חיפוש לקוח/ה קיים/ת (בחירה מהירה):
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="הקלידי שם או טלפון לחיפוש מהיר ברשימת הלקוחות..."
                      value={customerSearchQuery}
                      onChange={(e) => setCustomerSearchQuery(e.target.value)}
                      className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-purple-600 outline-none text-right transition"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>

                  {customerSuggestions.length > 0 && (
                    <div className="p-1 bg-white rounded-xl border border-purple-200 shadow-md space-y-1 animate-in fade-in">
                      {customerSuggestions.map((c) => (
                        <button
                          key={c.phone}
                          type="button"
                          onClick={() => handleSelectExistingCustomer(c)}
                          className="w-full p-2 hover:bg-purple-50 rounded-lg flex items-center justify-between text-xs text-right transition cursor-pointer"
                        >
                          <span className="font-bold text-slate-900">{c.name}</span>
                          <span className="font-mono text-purple-700 font-bold" dir="ltr">
                            {c.phone}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Customer Name & Phone Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5">
                  <label htmlFor="admin-cust-name" className="block text-slate-700 font-bold">
                    שם הלקוח/ה <span className="text-purple-600">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="admin-cust-name"
                      type="text"
                      required
                      placeholder="שם מלא של הלקוח/ה"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-cust-phone" className="block text-slate-700 font-bold">
                    טלפון נייד
                  </label>
                  <div className="relative">
                    <input
                      id="admin-cust-phone"
                      type="tel"
                      placeholder="050-0000000"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      dir="ltr"
                      className="w-full pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5 text-xs">
                <label htmlFor="admin-appt-notes" className="block text-slate-700 font-bold">
                  הערות לתור (אופציונלי):
                </label>
                <div className="relative">
                  <input
                    id="admin-appt-notes"
                    type="text"
                    placeholder="לדוגמה: מבנה אנטומי, הסרת לק ישן, בקשות מיוחדות..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full pl-4 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                  />
                  <FileText className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3.5 px-4 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-bold rounded-2xl text-sm shadow-md shadow-purple-600/25 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>שומר תור ביומן...</span>
                    </span>
                  ) : (
                    <>
                      <CalendarPlus className="w-4 h-4" />
                      <span>אישור וקביעת תור ביומן ללקוח/ה</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

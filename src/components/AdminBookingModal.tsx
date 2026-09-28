import React, { useState, useMemo, useEffect } from 'react';
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
  Palmtree,
  Coffee,
  Search,
  Check,
  Tag,
  ShieldCheck,
} from 'lucide-react';
import { Appointment, DayInfo, ScheduleSettings, Service } from '../types';
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
  isSlotInPast,
  HEBREW_MONTHS,
  HEBREW_WEEKDAYS,
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
  initialMode?: 'client' | 'block';
  onShowToast: (msg: string, type?: 'success' | 'error') => void;
}

type Step = 'treatment' | 'day' | 'slot' | 'details';

const BLOCK_PRESETS = [
  { id: -101, name: 'תפיסת שעה (ללא לקוח)', icon: Lock, reason: 'תור תפוס', desc: 'תפיסת תור פנוי סתם ללא סיבה / סגירה ללקוחות' },
  { id: -102, name: 'חופש / יום חופשי', icon: Palmtree, reason: 'חופש', desc: 'סגירת שעה או יום שלם עבור חופש ומנוחה' },
  { id: -103, name: 'הפסקה / עניין אישי', icon: Coffee, reason: 'הפסקה', desc: 'חסימת שעה עבור הפסקה או סידורים' },
];

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
  initialMode = 'client',
  onShowToast,
}) => {
  const [step, setStep] = useState<Step>('treatment');
  const [isBlockAction, setIsBlockAction] = useState<boolean>(initialMode === 'block');
  const [blockReason, setBlockReason] = useState<string>('חופש');
  const [blockWholeDay, setBlockWholeDay] = useState<boolean>(false);
  const [blockModeType, setBlockModeType] = useState<'single' | 'range'>('single');
  const [rangeStartDate, setRangeStartDate] = useState<string>('');
  const [rangeEndDate, setRangeEndDate] = useState<string>('');

  const [selectedService, setSelectedService] = useState<Service>(services[0] || {
    id: 1,
    name: "לק ג'ל",
    description: 'מניקור מכשירי מדויק וטיפוח הציפורן הטבעית',
    duration_minutes: 90,
    price: 150,
  });

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>(initialCustomerName);
  const [customerPhone, setCustomerPhone] = useState<string>(initialCustomerPhone);
  const [notes, setNotes] = useState<string>(initialNotes);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 90 days for admin booking calendar (allows booking up to 3 months forward)
  const days: DayInfo[] = useMemo(() => buildNextDays(90), []);

  const [viewedYear, setViewedYear] = useState<number>(() => new Date().getFullYear());
  const [viewedMonth, setViewedMonth] = useState<number>(() => new Date().getMonth());

  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      setViewedYear(now.getFullYear());
      setViewedMonth(now.getMonth());
    }
  }, [isOpen]);

  const durationMinutes = selectedService?.duration_minutes || scheduleSettings?.durationMinutes || 90;
  const businessOpen = scheduleSettings?.businessOpen || BUSINESS_OPEN;
  const businessClose = scheduleSettings?.businessClose || BUSINESS_CLOSE;

  // Calculate available slots helper for day list
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
      FRIDAY_CLOSE
    );
  }, [selectedDate, appointments, durationMinutes, businessOpen, businessClose]);

  const effectiveAvailableSlotsCount = useMemo(() => {
    if (!selectedDate) return 0;
    return currentSlotsOccupancy.filter((s) => s.isAvailable && !isSlotInPast(selectedDate, s.time)).length;
  }, [currentSlotsOccupancy, selectedDate]);

  // Existing customers for quick search / autocomplete
  const existingCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string }>();
    appointments.forEach((a) => {
      const cleanPhone = a.customer_phone ? a.customer_phone.replace(/\D/g, '') : '';
      if (
        cleanPhone.length >= 7 &&
        a.customer_name &&
        !a.customer_name.includes('חסימה') &&
        !a.customer_name.includes('🔒') &&
        !a.customer_name.includes('חופש')
      ) {
        if (!map.has(cleanPhone)) {
          map.set(cleanPhone, { name: a.customer_name, phone: a.customer_phone });
        }
      }
    });
    return Array.from(map.values());
  }, [appointments]);

  const customerSuggestions = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    return existingCustomers.filter((c) =>
      c.name.toLowerCase().includes(q) || c.phone.includes(q)
    ).slice(0, 5);
  }, [customerSearchQuery, existingCustomers]);

  // Initialize or reset when opened
  useEffect(() => {
    if (isOpen) {
      const modeIsBlock = initialMode === 'block';
      setIsBlockAction(modeIsBlock);
      setBlockReason(modeIsBlock ? 'חופש' : '');
      setBlockWholeDay(false);
      setBlockModeType('single');
      setRangeStartDate(initialDate || (days[0]?.iso || ''));
      setRangeEndDate(initialDate || (days[0]?.iso || ''));
      setCustomerName(initialCustomerName || '');
      setCustomerPhone(initialCustomerPhone || '');
      setNotes(initialNotes || '');
      setCustomerSearchQuery('');
      setErrorMessage('');
      setIsSubmitting(false);

      if (initialDate && initialSlot) {
        setSelectedDate(initialDate);
        setSelectedSlot(initialSlot);
        setStep('details');
      } else if (initialDate) {
        setSelectedDate(initialDate);
        setSelectedSlot('');
        setStep(modeIsBlock ? 'day' : 'treatment');
      } else {
        setSelectedDate(days[0]?.iso || '');
        setSelectedSlot('');
        setStep(modeIsBlock ? 'day' : 'treatment');
      }

      if (services.length > 0) {
        setSelectedService(services[0]);
      }
    }
  }, [isOpen, initialDate, initialSlot, initialCustomerName, initialCustomerPhone, initialNotes, initialMode, services, days]);

  if (!isOpen) return null;

  const handleSelectService = (service: Service) => {
    setIsBlockAction(false);
    setSelectedService(service);
    setStep('day');
  };

  const handleSelectBlockPreset = (preset: typeof BLOCK_PRESETS[0]) => {
    setIsBlockAction(true);
    setBlockReason(preset.reason);
    setSelectedService({
      id: preset.id,
      name: preset.name,
      description: preset.desc,
      duration_minutes: durationMinutes,
      price: 0,
    });
    setStep('day');
  };

  const handleSelectDay = (day: DayInfo) => {
    if (day.isClosed) return;
    setSelectedDate(day.iso);
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
    if (step === 'details') {
      if (blockWholeDay) setStep('day');
      else setStep('slot');
    } else if (step === 'slot') {
      setStep('day');
    } else if (step === 'day') {
      setStep('treatment');
    }
  };

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (isBlockAction && blockModeType === 'range') {
      if (!rangeStartDate || !rangeEndDate) {
        setErrorMessage('נא לבחור תאריך התחלה ותאריך סיום לחופשה');
        return;
      }
      if (rangeStartDate > rangeEndDate) {
        setErrorMessage('תאריך ההתחלה אינו יכול להיות מאוחר מתאריך הסיום');
        return;
      }

      setIsSubmitting(true);
      try {
        const reasonText = blockReason.trim() || 'חופש';
        // Generate list of dates in range
        const datesToBlock: string[] = [];
        const curr = new Date(rangeStartDate + 'T00:00:00');
        const end = new Date(rangeEndDate + 'T00:00:00');
        while (curr <= end) {
          const iso = toISODateString(curr);
          if (curr.getDay() !== 6) { // Skip closed Saturday
            datesToBlock.push(iso);
          }
          curr.setDate(curr.getDate() + 1);
        }

        if (datesToBlock.length === 0) {
          setErrorMessage('אין ימי פעילות בטווח התאריכים שנבחר');
          setIsSubmitting(false);
          return;
        }

        let totalBlockedSlots = 0;
        for (const dateIso of datesToBlock) {
          const dailyOccupancy = getDailySlotsOccupancy(
            dateIso,
            appointments,
            durationMinutes,
            businessOpen,
            businessClose,
            FRIDAY_CLOSE
          );
          const freeSlots = dailyOccupancy.filter((s) => s.isAvailable);
          for (const s of freeSlots) {
            const startMin = timeToMinutes(s.time);
            const endMin = startMin + durationMinutes;
            const endTimeStr = minutesToTime(endMin);

            const blockAppt: Omit<Appointment, 'id'> = {
              customer_name: `🔒 ${reasonText}`,
              customer_phone: 'חסימת יומן',
              service_id: 1,
              service_name: reasonText,
              appointment_date: dateIso,
              start_time: s.time,
              end_time: endTimeStr,
              price: 0,
              status: 'confirmed',
              created_at: new Date().toISOString(),
              notes: notes.trim() || reasonText,
            };
            await onAddAppointment(blockAppt);
            totalBlockedSlots += 1;
          }
        }

        onShowToast(`נחסמו ${datesToBlock.length} ימי חופשה (${totalBlockedSlots} שעות) בהצלחה! 🌴`, 'success');
        onClose();
      } catch (err: any) {
        console.error('Error blocking range:', err);
        setErrorMessage('שגיאה בתפיסת הימים: ' + (err?.message || 'אנא נסי שוב'));
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!selectedDate) {
      setErrorMessage('נא לבחור יום מהיומן');
      return;
    }

    if (!isBlockAction) {
      // Regular client booking
      const cleanName = customerName.trim();
      const cleanPhone = customerPhone.trim();

      if (!cleanName || cleanName.length < 2) {
        setErrorMessage('נא להזין שם לקוח/ה תקין (לפחות 2 אותיות)');
        return;
      }

      if (!selectedSlot) {
        setErrorMessage('נא לבחור שעה לתור');
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

        if (cleanPhone && cleanPhone !== 'שריון יזום') {
          upsertCustomerToFirestore({
            full_name: cleanName,
            phone: cleanPhone,
            notes: notes.trim() || undefined,
          }).catch((err) => console.warn('[Admin Booking] upsertCustomer notice:', err));
        }

        await onAddAppointment(newAppt);
        onShowToast(`התור של ${cleanName} נקבע בהצלחה לשעה ${selectedSlot} (${toIsraeliDateString(selectedDate)})! 🌸`, 'success');
        onClose();
      } catch (err: any) {
        console.error('Error submitting appointment:', err);
        setErrorMessage('שגיאה בשמירת התור: ' + (err?.message || 'אנא נסי שוב'));
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // BLOCK / SEIZE ACTION (NO CLIENT DETAILS REQUIRED)
      const reasonText = blockReason.trim() || 'תור תפוס';

      if (blockWholeDay) {
        // Block entire day's free slots
        const freeSlots = currentSlotsOccupancy.filter((s) => s.isAvailable);
        if (freeSlots.length === 0) {
          setErrorMessage('אין שעות פנויות ביום זה לתפיסה');
          return;
        }

        setIsSubmitting(true);
        try {
          for (const s of freeSlots) {
            const startMin = timeToMinutes(s.time);
            const endMin = startMin + durationMinutes;
            const endTimeStr = minutesToTime(endMin);

            const blockAppt: Omit<Appointment, 'id'> = {
              customer_name: `🔒 ${reasonText}`,
              customer_phone: 'חסימת יומן',
              service_id: 1,
              service_name: reasonText,
              appointment_date: selectedDate,
              start_time: s.time,
              end_time: endTimeStr,
              price: 0,
              status: 'confirmed',
              created_at: new Date().toISOString(),
              notes: notes.trim() || reasonText,
            };
            await onAddAppointment(blockAppt);
          }

          onShowToast(`כל השעות הפנויות ב-${toIsraeliDateString(selectedDate)} נתפסו בהצלחה (${reasonText}) 🔒`, 'success');
          onClose();
        } catch (err: any) {
          console.error('Error blocking day:', err);
          setErrorMessage('שגיאה בתפיסת השעות: ' + (err?.message || 'אנא נסי שוב'));
        } finally {
          setIsSubmitting(false);
        }
      } else {
        // Single slot block
        if (!selectedSlot) {
          setErrorMessage('נא לבחור שעה לתפיסה');
          return;
        }

        setIsSubmitting(true);
        try {
          const startMin = timeToMinutes(selectedSlot);
          const endMin = startMin + durationMinutes;
          const endTimeStr = minutesToTime(endMin);

          const blockAppt: Omit<Appointment, 'id'> = {
            customer_name: `🔒 ${reasonText}`,
            customer_phone: 'חסימת יומן',
            service_id: 1,
            service_name: reasonText,
            appointment_date: selectedDate,
            start_time: selectedSlot,
            end_time: endTimeStr,
            price: 0,
            status: 'confirmed',
            created_at: new Date().toISOString(),
            notes: notes.trim() || reasonText,
          };

          await onAddAppointment(blockAppt);
          onShowToast(`השעה ${selectedSlot} נתפסה בהצלחה ביומן (${reasonText}) 🔒`, 'success');
          onClose();
        } catch (err: any) {
          console.error('Error blocking slot:', err);
          setErrorMessage('שגיאה בתפיסת השעה: ' + (err?.message || 'אנא נסי שוב'));
        } finally {
          setIsSubmitting(false);
        }
      }
    }
  };

  const selectedDayInfo = days.find((d) => d.iso === selectedDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200" dir="rtl">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] relative text-slate-900 animate-in zoom-in-95 duration-200">
        
        {/* Modal Top Bar - Identical to TorModalFlow */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            {step !== 'treatment' ? (
              <button
                type="button"
                onClick={handleBack}
                className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
                title="חזרה לשלב הקודם"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
            )}
            
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black text-slate-950 font-['Rubik',sans-serif]">
                  {step === 'treatment' && 'בחירת טיפול או חופש'}
                  {step === 'day' && 'בחירת יום ביומן'}
                  {step === 'slot' && 'בחירת שעה'}
                  {step === 'details' && (isBlockAction ? 'אישור תפיסת שעה / חופש' : 'פרטי הלקוח/ה ואישור')}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                  ניהול
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer active:scale-95 shadow-2xs"
            title="סגירה"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* STEP 1: בחירת טיפול או תפיסת שעה/חופש */}
          {step === 'treatment' && (
            <div className="space-y-4 py-2">
              <div className="text-center space-y-1 pb-1">
                <p className="text-xs text-slate-500 font-medium">
                  בחרו טיפול לקביעת תור ללקוח/ה, או תפסו שעה / חופש ללא לקוח
                </p>
              </div>

              {/* Quick Admin Actions (Vacation / Seize slot / Break) */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Lock className="w-3.5 h-3.5 text-purple-600" />
                  <span>תפיסת תור פנוי / חופש (ללא לקוח):</span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {BLOCK_PRESETS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectBlockPreset(preset)}
                        className="w-full relative group p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 text-white border-2 border-slate-800 hover:border-purple-500 hover:shadow-lg transition-all text-right cursor-pointer flex items-center justify-between shadow-xs active:scale-98"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-purple-300">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-sm sm:text-base font-black text-white group-hover:text-purple-300 transition">
                              {preset.name}
                            </h3>
                            <p className="text-[11px] text-slate-400 line-clamp-1">
                              {preset.desc}
                            </p>
                          </div>
                        </div>

                        <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-200 border border-purple-400/30">
                          תפיסה 🔒
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Client Treatments List */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>קביעת תור ללקוח/ה:</span>
                </div>

                <div className="space-y-3">
                  {services.map((service) => {
                    const duration = service.duration_minutes || 90;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleSelectService(service)}
                        className="w-full relative group p-4 sm:p-5 rounded-2xl bg-white border-2 border-slate-200 hover:border-purple-600 hover:shadow-lg transition-all text-right cursor-pointer flex items-center justify-between active:scale-98"
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
            </div>
          )}

          {/* STEP 2: בחירת יום או טווח ימי חופשה */}
          {step === 'day' && (
            <div className="space-y-4 py-1">
              {/* Header Info */}
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
                <span>מטרה: <strong className={isBlockAction ? "text-slate-950 font-bold" : "text-purple-700 font-bold"}>{selectedService.name}</strong></span>
                <span>{formatDurationMinutes(durationMinutes)}</span>
              </div>

              {/* Mode Toggle for Block / Vacation: Single Day vs Multi-Day Range */}
              {isBlockAction && (
                <div className="p-1 bg-slate-100 rounded-2xl flex items-center gap-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBlockModeType('single')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      blockModeType === 'single'
                        ? 'bg-slate-950 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>יום בודד / שעה ⏰</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBlockModeType('range')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      blockModeType === 'range'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Palmtree className="w-3.5 h-3.5" />
                    <span>חופשה מרובת ימים (טווח) 🌴</span>
                  </button>
                </div>
              )}

              {/* MULTI-DAY VACATION RANGE FORM */}
              {isBlockAction && blockModeType === 'range' ? (
                <form onSubmit={handleSubmitBooking} className="p-4 bg-purple-50/80 rounded-2xl border border-purple-200 space-y-4 text-xs">
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Palmtree className="w-4 h-4 text-purple-700" />
                    <span>הגדרת טווח תאריכים לחופש (נעילת כל השעות ברצף)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-bold mb-1">מתאריך (התחלת חופשה):</label>
                      <input
                        type="date"
                        required
                        min={days[0]?.iso}
                        value={rangeStartDate}
                        onChange={(e) => {
                          setRangeStartDate(e.target.value);
                          if (!rangeEndDate || e.target.value > rangeEndDate) {
                            setRangeEndDate(e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-xl border border-purple-200 outline-none focus:border-purple-600 font-bold text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 font-bold mb-1">עד תאריך (סיום חופשה):</label>
                      <input
                        type="date"
                        required
                        min={rangeStartDate || days[0]?.iso}
                        value={rangeEndDate}
                        onChange={(e) => setRangeEndDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-xl border border-purple-200 outline-none focus:border-purple-600 font-bold text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] font-bold text-slate-700 block">סיבת החופשה:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['חופש', 'חופשה שנתית', 'סידורים אישיים', 'שיפוץ / סגירה'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setBlockReason(r)}
                          className={`py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            blockReason === r
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Palmtree className="w-3 h-3" />
                          <span>{r}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-slate-700 font-bold">הערה פנימית (אופציונלי):</label>
                    <input
                      type="text"
                      placeholder="הערה ליומן..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-slate-900 text-xs focus:border-purple-600 outline-none text-right transition"
                    />
                  </div>

                  {errorMessage && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || !rangeStartDate || !rangeEndDate}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-md transition cursor-pointer flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
                  >
                    <Palmtree className="w-4 h-4" />
                    <span>{isSubmitting ? 'שומר חופשה ביומן...' : 'תפיסת כל ימי החופשה בטווח 🔒'}</span>
                  </button>
                </form>
              ) : (
                /* SINGLE DAY SELECTION LIST WITH MONTH NAVIGATION */
                <>
                  {/* Month Navigation Bar */}
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
                  <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-0.5">
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
                          disabled={day.isClosed || day.isPast}
                          onClick={() => handleSelectDirectDate(day.iso)}
                          className={`w-full py-3.5 px-5 rounded-2xl border text-center font-bold text-sm sm:text-base transition-all flex items-center justify-between ${
                            isAvailable
                              ? 'bg-white border-slate-200 hover:border-purple-600 hover:bg-purple-50/50 hover:shadow-md text-slate-900 cursor-pointer active:scale-98'
                              : day.isPast
                              ? 'bg-slate-50/60 border-slate-200 text-slate-400 cursor-not-allowed opacity-50'
                              : day.isClosed
                              ? 'bg-slate-50/80 border-slate-200 text-slate-400 cursor-not-allowed opacity-75'
                              : 'bg-red-50/60 border-red-200 text-red-600 cursor-pointer hover:bg-red-50 font-medium'
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

                  <div className="pt-1 text-center text-xs text-slate-500 font-medium">
                    <span>* לחיצה על יום תחשוף את השעות הפנויות או תאפשר תפיסת תור</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 3: בחירת שעה - With Quick Date Switcher Banner */}
          {step === 'slot' && (
            <div className="space-y-4 py-1">
              <div className="bg-purple-50 rounded-2xl p-3 border border-purple-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
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
                  title="בחירת יום אחר מהיומן"
                >
                  החלף יום 🔄
                </button>
              </div>

              {/* If Admin is in Block mode, give option for full day block right here */}
              {isBlockAction && (
                <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <Palmtree className="w-4 h-4 text-purple-300 shrink-0" />
                    <span>רוצה לחסום את <strong>כל היום</strong> לחופש?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBlockWholeDay(true);
                      setSelectedSlot('');
                      setStep('details');
                    }}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold cursor-pointer transition active:scale-95 shadow-xs"
                  >
                    תפיסת כל היום 🌴
                  </button>
                </div>
              )}

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
                      <span>{isBlockAction ? 'בחירת שעה לתפיסה / חופש:' : 'בחירת שעה פנויה לקביעת התור:'}</span>
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

          {/* STEP 4: פרטי הלקוח/ה או אישור תפיסת שעה / חופש */}
          {step === 'details' && (
            <form onSubmit={handleSubmitBooking} className="space-y-4 py-1">
              {/* Summary Card */}
              <div className="bg-purple-50/90 rounded-2xl p-3.5 border border-purple-200 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-purple-950">
                  <span>{selectedService.name}</span>
                  {!isBlockAction && (
                    <span className="text-purple-700 font-black">{formatILS(selectedService.price)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-purple-200/60">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <span>{toIsraeliDateString(selectedDate)}</span>
                  </div>
                  <div className="flex items-center gap-1 font-bold">
                    <Clock className="w-3.5 h-3.5 text-purple-600" />
                    <span>{blockWholeDay ? 'כל היום (חופש מלא)' : `שעה: ${selectedSlot}`}</span>
                  </div>
                </div>
              </div>

              {/* Error Box */}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* IF ADMIN ACTION (SEIZE / VACATION) -> NO CUSTOMER DETAILS NEEDED */}
              {isBlockAction ? (
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Lock className="w-4 h-4 text-purple-600" />
                    <span>הגדרת תפיסת התור ביומן:</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 block">
                      סיבת התפיסה (מוצג ביומן בלבד):
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['תור תפוס', 'חופש', 'הפסקה', 'עניין אישי'].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setBlockReason(r)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            blockReason === r
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {r === 'חופש' && <Palmtree className="w-3 h-3" />}
                          {r === 'תור תפוס' && <Lock className="w-3 h-3" />}
                          {r === 'הפסקה' && <Coffee className="w-3 h-3" />}
                          {r === 'עניין אישי' && <Tag className="w-3 h-3" />}
                          <span>{r}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 text-xs pt-1">
                    <label htmlFor="admin-block-notes" className="block text-slate-700 font-bold">
                      הערה פנימית (אופציונלי):
                    </label>
                    <input
                      id="admin-block-notes"
                      type="text"
                      placeholder="הערה פרטית שתופיע ביומן..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 text-xs focus:border-purple-600 outline-none text-right transition"
                    />
                  </div>

                  <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-[11px] text-purple-900 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>אין צורך להזין פרטי לקוח/ה. השעה תינעל מיידית ותסומן כ"תפוס" בלוח הלקוחות.</span>
                  </div>
                </div>
              ) : (
                /* REGULAR CLIENT BOOKING FIELDS */
                <div className="space-y-3">
                  {/* Autocomplete Customer Search */}
                  {existingCustomers.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-600 block">
                        חיפוש לקוח/ה קודמת למילוי מהיר:
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="הקלידי שם או טלפון לחיפוש..."
                          value={customerSearchQuery}
                          onChange={(e) => setCustomerSearchQuery(e.target.value)}
                          className="w-full pl-4 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-purple-600 outline-none text-right transition"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                      </div>

                      {customerSuggestions.length > 0 && (
                        <div className="p-1 bg-white rounded-xl border border-purple-200 shadow-md space-y-1 animate-in fade-in">
                          {customerSuggestions.map((c) => (
                            <button
                              key={c.phone}
                              type="button"
                              onClick={() => {
                                setCustomerName(c.name);
                                setCustomerPhone(c.phone);
                                setCustomerSearchQuery('');
                              }}
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

                  <div className="space-y-1 text-xs">
                    <label htmlFor="admin-client-name" className="block text-slate-800 font-bold">
                      שם מלא של הלקוח/ה <span className="text-purple-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        id="admin-client-name"
                        type="text"
                        required
                        placeholder="שם מלא"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label htmlFor="admin-client-phone" className="block text-slate-800 font-bold">
                      טלפון נייד
                    </label>
                    <div className="relative">
                      <input
                        id="admin-client-phone"
                        type="tel"
                        placeholder="050-0000000"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        dir="ltr"
                        className="w-full pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-2.5 top-3" />
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <label htmlFor="admin-client-notes" className="block text-slate-700 font-bold">
                      הערות לטיפול (אופציונלי):
                    </label>
                    <div className="relative">
                      <input
                        id="admin-client-notes"
                        type="text"
                        placeholder="למשל: ביקשה קישוט פרח, מגיעה עם לק ישן..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:bg-white focus:border-purple-600 outline-none text-right transition"
                      />
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 sticky bottom-0 bg-white/95 backdrop-blur-xs pb-1">
                <button
                  type="submit"
                  disabled={isSubmitting || (!isBlockAction && !customerName.trim())}
                  className={`w-full py-3.5 rounded-2xl font-bold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed ${
                    isBlockAction
                      ? 'bg-slate-950 hover:bg-black text-white border border-purple-500/40 shadow-slate-900/30'
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/25'
                  }`}
                >
                  {isSubmitting ? (
                    <span>שומר ביומן...</span>
                  ) : isBlockAction ? (
                    <>
                      <Lock className="w-4 h-4 text-purple-400" />
                      <span>{blockWholeDay ? 'תפיסת כל שעות היום (חופש מלא) 🔒' : `תפיסת שעה ${selectedSlot} ביומן 🔒`}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>קביעת תור ללקוח/ה ביומן ✨</span>
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

import React, { useState, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  User,
  Phone,
  FileText,
  Sparkles,
  CheckCircle,
  Calendar,
  Clock,
  MapPin,
  MessageCircle,
  Download,
  AlertCircle,
  RefreshCw,
  Sparkle,
  ArrowRight,
} from 'lucide-react';
import { Appointment, DayInfo, Service, UserSession } from '../types';
import {
  buildNextDays,
  calculateAvailableSlots,
  minutesToTime,
  timeToMinutes,
  toIsraeliDateString,
  formatILS,
  formatHebrewFullDate,
  formatDurationMinutes,
  generateGoogleCalendarUrl,
  generateIcsFile,
} from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';
import { addAppointmentToFirestore } from '../lib/firebase';
import { ServiceSelector } from './ServiceSelector';
import { DatePickerCarousel } from './DatePickerCarousel';
import { SlotSelector } from './SlotSelector';

interface BookingFormProps {
  services: Service[];
  appointments: Appointment[];
  onBookSuccess: (newAppointment: Appointment) => void;
  currentUser?: UserSession | null;
  onBackToHome?: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  services,
  appointments,
  onBookSuccess,
  currentUser,
  onBackToHome,
}) => {
  const days: DayInfo[] = useMemo(() => buildNextDays(21), []);

  // Step 1: Selected service (Default: לק ג'ל)
  const [selectedServiceId, setSelectedServiceId] = useState<number>(
    services[0]?.id || 1
  );

  // Step 2: Selected date
  const [selectedDate, setSelectedDate] = useState<string>(
    days.find((d) => !d.isClosed)?.iso || days[0].iso
  );

  // Step 3: Selected slot
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Step 4: Customer Details - Pre-filled from current session if available
  const [customerName, setCustomerName] = useState<string>(currentUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState<string>(currentUser?.phone || '');
  const [isEditingDetails, setIsEditingDetails] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync user info if session updates
  React.useEffect(() => {
    if (currentUser) {
      if (currentUser.name) setCustomerName(currentUser.name);
      if (currentUser.phone) setCustomerPhone(currentUser.phone);
    }
  }, [currentUser]);

  // Confirmed appointment state
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Current service object
  const currentService = useMemo(() => {
    return services.find((s) => s.id === selectedServiceId) || services[0] || {
      id: 1,
      name: "לק ג'ל",
      duration_minutes: 110,
      price: 150,
      category: 'nails',
      description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם',
    };
  }, [services, selectedServiceId]);

  // Dynamic available slots for the selected date and service duration
  const availableSlots = useMemo(() => {
    if (!selectedDate || !currentService) return [];

    const existingForDate = appointments.filter(
      (a) => a.appointment_date === selectedDate
    );

    return calculateAvailableSlots({
      durationMinutes: currentService.duration_minutes,
      existingAppointments: existingForDate,
      dateString: selectedDate,
    });
  }, [selectedDate, currentService, appointments]);

  const handleSelectService = (serviceId: number) => {
    setSelectedServiceId(serviceId);
    setSelectedSlot(null);
  };

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const name = customerName.trim();
    const phone = customerPhone.trim();

    if (!name) {
      setFormError('נא להזין שם מלא');
      return;
    }

    // Israeli phone validation
    const phoneRegex = /^0\d{1,2}-?\d{7}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
      setFormError('מספר טלפון לא תקין (לדוגמה 050-1234567)');
      return;
    }

    if (!selectedSlot) {
      setFormError('נא לבחור שעה פנויה מהרשימה');
      return;
    }

    setIsSubmitting(true);

    try {
      const endTime = minutesToTime(
        timeToMinutes(selectedSlot) + currentService.duration_minutes
      );

      const newAppt: Omit<Appointment, 'id'> = {
        customer_name: name,
        customer_phone: phone,
        service_id: currentService.id,
        service_name: currentService.name,
        price: currentService.price,
        appointment_date: selectedDate,
        start_time: selectedSlot,
        end_time: endTime,
        status: 'confirmed',
        notes: notes.trim() || undefined,
        created_at: new Date().toISOString(),
      };

      let savedId: string | number = `appt_${Date.now()}`;
      try {
        savedId = await addAppointmentToFirestore(newAppt as any);
      } catch (err: any) {
        if (err?.name === 'SlotTakenError' || err?.message?.includes('השעה הזו כבר נתפסה')) {
          setFormError('השעה הזו כבר נתפסה, בבקשה לבחור שעה אחרת');
          setIsSubmitting(false);
          return;
        }
        console.warn('Could not save to Firestore directly in BookingForm, falling back:', err);
      }

      const fullAppt: Appointment = { ...newAppt, id: savedId };
      onBookSuccess(fullAppt);
      setConfirmedAppointment(fullAppt);

      // Trigger Confetti
      try {
        confetti({
          particleCount: 90,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#d97706', '#10b981', '#ffffff'],
        });
      } catch {
        // Safe fallback
      }
    } catch {
      setFormError('אירעה שגיאה בקביעת התור. אנא נסו שוב.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetBooking = () => {
    setConfirmedAppointment(null);
    setSelectedSlot(null);
    setCustomerName('');
    setCustomerPhone('');
    setNotes('');
    setFormError(null);
  };

  // If Confirmed, render the bright, clear Success screen
  if (confirmedAppointment) {
    const srv = services.find((s) => s.id === confirmedAppointment.service_id) || currentService;

    const formattedDuration = formatDurationMinutes(srv.duration_minutes || 110);

    const whatsappMessage = encodeURIComponent(
      `היי ${SALON_INFO.ownerName} 👋\nקבעתי תור ל*${confirmedAppointment.service_name}* במערכת!\n\n📅 תאריך: ${toIsraeliDateString(
        confirmedAppointment.appointment_date
      )}\n⏰ שעה: ${confirmedAppointment.start_time}\n⏱️ משך הטיפול: כ-${formattedDuration}\n👤 שם: ${
        confirmedAppointment.customer_name
      }\n📱 טלפון: ${confirmedAppointment.customer_phone}\n💰 מחיר: ${formatILS(
        srv.price
      )}${confirmedAppointment.notes ? `\n📝 הערות: ${confirmedAppointment.notes}` : ''}\n\nנתראה! ✨`
    );

    const whatsappUrl = `https://wa.me/${SALON_INFO.whatsappNumber}?text=${whatsappMessage}`;

    const googleCalUrl = generateGoogleCalendarUrl({
      title: `תור ל${confirmedAppointment.service_name} - ${SALON_INFO.name}`,
      description: `תור ל${confirmedAppointment.service_name} עבור ${confirmedAppointment.customer_name}.\nמחיר: ${formatILS(
        srv.price
      )}\nטלפון לקוח: ${confirmedAppointment.customer_phone}`,
      location: SALON_INFO.address || SALON_INFO.name,
      date: confirmedAppointment.appointment_date,
      startTime: confirmedAppointment.start_time,
      endTime: confirmedAppointment.end_time,
    });

    const handleDownloadIcs = () => {
      const icsContent = generateIcsFile({
        title: `תור ל${confirmedAppointment.service_name} - ${SALON_INFO.name}`,
        description: `תור ל${confirmedAppointment.service_name} עבור ${confirmedAppointment.customer_name}. טלפון: ${SALON_INFO.phone}`,
        location: SALON_INFO.address || SALON_INFO.name,
        date: confirmedAppointment.appointment_date,
        startTime: confirmedAppointment.start_time,
        endTime: confirmedAppointment.end_time,
      });

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', `appointment-${confirmedAppointment.appointment_date}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="w-full max-w-xl mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-300">
        {/* Celebration Box in Bright Clean Theme */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xl shadow-slate-200/50 text-center space-y-5">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 border border-emerald-300 rounded-full flex items-center justify-center mx-auto ring-8 ring-emerald-50 shadow-xs">
            <CheckCircle className="w-9 h-9" />
          </div>

          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-['Frank_Ruhl_Libre',serif]">
              התור נקבע בהצלחה!
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              התור שוריין ביומן של <span className="font-bold text-purple-700">{SALON_INFO.name}</span>
            </p>
          </div>

          {/* Details Card */}
          <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 text-right space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[11px] text-slate-500 block">שירות נבחר</span>
                <span className="text-base font-bold text-slate-900">
                  {confirmedAppointment.service_name}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[11px] text-slate-500 block">מחיר לתשלום</span>
                <span className="text-xl font-black text-purple-700 font-['Rubik',sans-serif]">
                  {formatILS(srv.price)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-slate-700">
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">תאריך</span>
                  <span className="font-bold text-slate-900">
                    {formatHebrewFullDate(confirmedAppointment.appointment_date)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">שעה שנקבעה</span>
                  <span className="font-bold text-purple-800 font-['Rubik',sans-serif] text-sm">
                    {confirmedAppointment.start_time}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-medium">
                    (כ-{formattedDuration})
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">שם הלקוח/ה</span>
                  <span className="font-semibold text-slate-900">
                    {confirmedAppointment.customer_name}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <div>
                  <span className="text-slate-400 block text-[10px]">טלפון</span>
                  <span dir="ltr" className="font-semibold text-slate-900">
                    {confirmedAppointment.customer_phone}
                  </span>
                </div>
              </div>

              {SALON_INFO.address ? (
                <div className="flex items-center gap-2.5 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <div>
                    <span className="text-slate-400 block text-[10px]">כתובת</span>
                    <span className="font-medium text-slate-900">{SALON_INFO.address}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {confirmedAppointment.notes && (
              <div className="mt-2 p-2.5 bg-white rounded-xl border border-slate-200 text-xs text-slate-600">
                <span className="text-slate-500 font-bold">הערות: </span>
                <span>{confirmedAppointment.notes}</span>
              </div>
            )}
          </div>

          {/* Direct Actions */}
          <div className="space-y-2.5">
            <a
              id="whatsapp-confirm-btn"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 transition cursor-pointer"
            >
              <MessageCircle className="w-5 h-5 fill-white/20 text-white" />
              <span>שליחת הודעת אישור בוואטסאפ</span>
            </a>

            <div className="grid grid-cols-2 gap-2">
              <a
                id="google-cal-btn"
                href={googleCalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border border-slate-200 shadow-xs"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>יומן Google</span>
              </a>

              <button
                id="ics-download-btn"
                type="button"
                onClick={handleDownloadIcs}
                className="py-2.5 px-3 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border border-slate-200 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>הורדת יומן (.ics)</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <button
              id="book-another-btn"
              type="button"
              onClick={handleResetBooking}
              className="w-full py-3 bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200 font-bold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-xs"
            >
              <RefreshCw className="w-4 h-4 text-purple-700" />
              <span>קביעת תור נוסף</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full bg-white rounded-3xl p-5 sm:p-8 border border-slate-200/90 shadow-xl shadow-slate-200/50 space-y-7"
    >
      {/* Top Header with Back Button */}
      {onBackToHome && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <span>חזרה למסך הראשי</span>
          </button>
          <span className="text-xs text-purple-700 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>תהליך קביעת תור מהיר</span>
          </span>
        </div>
      )}

      {/* Sticky Floating Step Progression Navigator */}
      <div className="sticky top-20 z-20 bg-white/95 backdrop-blur-md rounded-2xl border border-purple-200/80 shadow-[0_8px_24px_-4px_rgba(168,85,247,0.14)] p-2 sm:p-2.5 transition-all">
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
          {/* Step 1 Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl bg-purple-50/70 border border-purple-200/60 text-purple-950">
            <div className="w-5 h-5 rounded-lg bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs">
              ✓
            </div>
            <div className="truncate text-right">
              <span className="text-[9px] text-purple-700 block font-bold leading-none">שלב 1</span>
              <span className="text-[11px] sm:text-xs font-black truncate block mt-0.5">{currentService.name}</span>
            </div>
          </div>

          {/* Step 2 Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl bg-purple-50/70 border border-purple-200/60 text-purple-950">
            <div className="w-5 h-5 rounded-lg bg-purple-600 text-white text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs">
              ✓
            </div>
            <div className="truncate text-right">
              <span className="text-[9px] text-purple-700 block font-bold leading-none">שלב 2</span>
              <span className="text-[11px] sm:text-xs font-black truncate block mt-0.5">
                {selectedDate ? toIsraeliDateString(selectedDate).substring(0, 5) : 'תאריך'}
              </span>
            </div>
          </div>

          {/* Step 3 Pill */}
          <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl border transition-all ${
            selectedSlot
              ? 'bg-purple-50/70 border-purple-200/60 text-purple-950'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className={`w-5 h-5 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs ${
              selectedSlot ? 'bg-purple-600 text-white' : 'bg-slate-900 text-white'
            }`}>
              {selectedSlot ? '✓' : '3'}
            </div>
            <div className="truncate text-right">
              <span className="text-[9px] text-slate-500 block font-bold leading-none">שלב 3</span>
              <span className={`text-[11px] sm:text-xs font-black truncate block mt-0.5 ${
                selectedSlot ? 'text-purple-950 font-extrabold' : 'text-slate-700'
              }`}>
                {selectedSlot || 'בחירת שעה'}
              </span>
            </div>
          </div>

          {/* Step 4 Pill */}
          <div className={`flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl border transition-all ${
            customerName && customerPhone
              ? 'bg-purple-50/70 border-purple-200/60 text-purple-950'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className={`w-5 h-5 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 shadow-xs ${
              customerName && customerPhone ? 'bg-purple-600 text-white' : 'bg-slate-300 text-slate-700'
            }`}>
              {customerName && customerPhone ? '✓' : '4'}
            </div>
            <div className="truncate text-right">
              <span className="text-[9px] text-slate-500 block font-bold leading-none">שלב 4</span>
              <span className="text-[11px] sm:text-xs font-black truncate block mt-0.5">
                {customerName ? customerName.split(' ')[0] : 'פרטים'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: Services */}
      <ServiceSelector
        services={services}
        selectedServiceId={selectedServiceId}
        onSelectService={handleSelectService}
      />

      {/* Step 2: Date Carousel */}
      <DatePickerCarousel
        days={days}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />

      {/* Step 3: Slots */}
      <SlotSelector
        availableSlots={availableSlots}
        selectedSlot={selectedSlot}
        onSelectSlot={(slot) => setSelectedSlot(slot)}
        selectedDate={selectedDate}
        durationMinutes={currentService.duration_minutes}
      />

      {/* Step 4: Personal Details */}
      <div className="space-y-4 pt-4 border-t border-slate-100">
        {/* Prominent Floating Section Header */}
        <div className="flex items-center justify-between flex-wrap gap-2.5">
          <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-md border border-purple-200/90 shadow-[0_4px_16px_rgba(168,85,247,0.12)] transition-all hover:shadow-[0_6px_20px_rgba(168,85,247,0.18)] hover:-translate-y-0.5">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-950 to-purple-950 text-purple-300 text-xs font-black flex items-center justify-center border border-purple-500/40 shadow-xs">
              4
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 font-['Rubik',sans-serif]">
                פרטים אישיים לסיום
              </h3>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-slate-50 via-white to-purple-50/60 border border-slate-200 text-slate-800 text-xs font-bold shadow-xs">
            <User className="w-3.5 h-3.5 text-purple-600" />
            <span>שלב סיום ואישור מיידי</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currentUser?.name && currentUser?.phone && !isEditingDetails ? (
            <div className="sm:col-span-2 bg-purple-50/70 border border-purple-200/80 p-4 rounded-2xl flex items-center justify-between shadow-2xs">
              <div className="space-y-0.5 text-right">
                <span className="text-xs font-bold text-purple-900 block">התור ייקבע עבור:</span>
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
                <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <CheckCircle className="w-4 h-4" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {currentUser?.name && currentUser?.phone && isEditingDetails && (
                <div className="sm:col-span-2 flex justify-end">
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

              {/* Customer Name */}
              <div>
                <label
                  htmlFor="customer-name-input"
                  className="block text-xs font-extrabold text-slate-800 mb-1.5"
                >
                  שם מלא <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="customer-name-input"
                    type="text"
                    required
                    placeholder="שם מלא (פרטי ומשפחה)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full pl-3 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15 outline-none text-sm font-semibold text-slate-900 placeholder-slate-400 transition-all shadow-xs"
                  />
                  <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-purple-700 flex items-center justify-center absolute right-2.5 top-2.5 shadow-2xs">
                    <User className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Customer Phone */}
              <div>
                <label
                  htmlFor="customer-phone-input"
                  className="block text-xs font-extrabold text-slate-800 mb-1.5"
                >
                  טלפון נייד <span className="text-purple-600">*</span>
                </label>
                <div className="relative">
                  <input
                    id="customer-phone-input"
                    type="tel"
                    required
                    placeholder="050-1234567"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    dir="ltr"
                    className="w-full pl-3 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15 outline-none text-sm font-semibold text-slate-900 placeholder-slate-400 text-right transition-all shadow-xs"
                  />
                  <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-purple-700 flex items-center justify-center absolute right-2.5 top-2.5 shadow-2xs">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label
            htmlFor="customer-notes-input"
            className="block text-xs font-extrabold text-slate-800 mb-1.5"
          >
            הערות או בקשות מיוחדות (רשות)
          </label>
          <div className="relative">
            <input
              id="customer-notes-input"
              type="text"
              placeholder="למשל: סגנון מועדף, קישוט, גוון מסוים..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full pl-3 pr-11 py-3 rounded-2xl bg-slate-50 border border-slate-200 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/15 outline-none text-sm font-normal text-slate-900 placeholder-slate-400 transition-all shadow-xs"
            />
            <div className="w-7 h-7 rounded-xl bg-white border border-slate-200 text-purple-700 flex items-center justify-center absolute right-2.5 top-2.5 shadow-2xs">
              <FileText className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Booking Summary Box */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm space-y-3 text-xs text-slate-700">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 font-bold text-slate-900 text-sm">
          <div className="inline-flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <span className="font-bold text-slate-900 font-['Rubik',sans-serif]">
              סיכום הזמנה
            </span>
          </div>
          <span className="text-slate-900 font-['Rubik',sans-serif] font-bold text-base px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 shadow-xs">
            {currentService.name} — {formatILS(currentService.price)}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-slate-500 font-medium">תאריך נבחר:</span>
          <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-purple-100">
            {toIsraeliDateString(selectedDate)} ({formatHebrewFullDate(selectedDate)})
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-slate-500 font-medium">שעה שנקבעה:</span>
          <span className="font-black text-purple-900 font-['Rubik',sans-serif] text-sm bg-purple-100/70 px-2.5 py-0.5 rounded-lg border border-purple-200">
            {selectedSlot ? selectedSlot : 'נא לבחור שעה למעלה'}
          </span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-slate-500 font-medium">משך הטיפול:</span>
          <span className="font-bold text-slate-800">כשעה ו-50 דקות</span>
        </div>

        <div className="flex justify-between items-center py-0.5">
          <span className="text-slate-500 font-medium">מיקום הקליניקה:</span>
          <span className="font-semibold text-slate-800">{SALON_INFO.address || 'קליניקה פרטית'}</span>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-purple-200 text-[11px]">
          <span className="text-slate-500">תשלום:</span>
          <span className="font-extrabold text-purple-950">בסיום הטיפול במקום (מזומן / ביט / פייבוקס / אשראי)</span>
        </div>
      </div>

      {/* Form Error Alert */}
      {formError && (
        <div className="p-3.5 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600" />
          <span>{formError}</span>
        </div>
      )}

      {/* Submit Button - Sleek Black & Glowing Purple */}
      <button
        id="submit-booking-action-btn"
        type="submit"
        disabled={!selectedSlot || isSubmitting}
        className={`w-full py-4 px-6 rounded-2xl text-base font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
          selectedSlot && !isSubmitting
            ? 'bg-slate-950 hover:bg-black text-white border border-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:shadow-[0_0_25px_rgba(168,85,247,0.55)] hover:scale-[1.01]'
            : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
        }`}
      >
        <Sparkles className="w-5 h-5 text-purple-400" />
        <span>
          קביעת תור ל{currentService.name} ({formatILS(currentService.price)})
        </span>
      </button>

      <p className="text-xs text-center text-slate-500 font-medium">
        בלחיצה על "קביעת תור" התור ישוריין מיידית ביומן של {SALON_INFO.ownerName}
      </p>
    </form>
  );
};

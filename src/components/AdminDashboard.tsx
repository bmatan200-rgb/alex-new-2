import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Phone,
  MessageCircle,
  PlusCircle,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  Palmtree,
  Coffee,
  User,
  AlertTriangle,
  Sparkles,
  Bell,
  Settings,
  Smartphone,
  Send,
  Zap,
  Loader2,
  CheckCircle2,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History,
  CalendarDays,
} from 'lucide-react';
import { Appointment, ScheduleSettings, Service } from '../types';
import {
  toIsraeliDateString,
  formatILS,
  toISODateString,
  minutesToTime,
  timeToMinutes,
  getDailySlotsOccupancy,
  formatHebrewFullDate,
  formatDurationMinutes,
  BUSINESS_OPEN,
  BUSINESS_CLOSE,
  FRIDAY_CLOSE,
} from '../utils/dateUtils';
import { SALON_INFO } from '../utils/storage';
import { WhatsApp2HourAlertBanner } from './WhatsApp2HourAlertBanner';
import { WhatsAppReminderModal } from './WhatsAppReminderModal';
import { ServiceDurationModal } from './ServiceDurationModal';
import {
  buildCustomerTodayReminderText,
  buildCustomer1DayReminderText,
  buildCustomerReminderText,
  buildAlex1DayReminderText,
  buildAlexReminderText,
  createWhatsAppDirectLink,
  openWhatsAppDirect,
  formatIsraeliPhoneToE164,
  isProviderConfigured,
  markReminderSent,
  getSentRemindersLog,
  dispatchAutomatedWhatsAppApi,
  getStoredReminderSettings,
} from '../utils/whatsappReminder';

interface AdminDashboardProps {
  appointments: Appointment[];
  services: Service[];
  onAddAppointment: (appointment: Appointment) => void;
  onCancelAppointment: (id: number | string) => void;
  onDeleteAppointment: (id: number | string) => void;
  onSwitchToClientView?: () => void;
  onUpdateServices?: (services: Service[]) => void;
  scheduleSettings?: ScheduleSettings;
  onUpdateScheduleSettings?: (settings: ScheduleSettings) => void;
}

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  confirmed: {
    text: 'מאושר',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  cancelled: {
    text: 'בוטל / שוחרר',
    className: 'bg-slate-100 text-slate-500 line-through border border-slate-200',
  },
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  appointments,
  services,
  onAddAppointment,
  onCancelAppointment,
  onDeleteAppointment,
  onSwitchToClientView,
  onUpdateServices,
}) => {
  const todayIso = toISODateString(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowIso = toISODateString(tomorrowDate);

  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'today' | 'blocked' | 'past'>('upcoming');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [actionTab, setActionTab] = useState<'block' | 'client'>('block');
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppModalTab, setWhatsAppModalTab] = useState<'how_it_works' | 'templates' | 'automation'>('how_it_works');
  const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null);
  const [sendingApptId, setSendingApptId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [sentLog, setSentLog] = useState<Record<string, { customerSentAt?: string; alexSentAt?: string }>>(() =>
    getSentRemindersLog()
  );
  const reminderSettings = getStoredReminderSettings();

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSendReminderAutomated = async (appt: Appointment, target: 'customer' | 'alex') => {
    const key = `${appt.id}-${target}`;
    setSendingApptId(key);
    const settings = getStoredReminderSettings();

    // If a provider is selected but not properly configured (except Twilio which is server-side only)
    if (settings.provider !== 'direct' && settings.provider !== 'twilio' && !isProviderConfigured(settings)) {
      showToast('כדי לשלוח אוטומטית ברקע, יש להשלים את הגדרות ספק ה-API במסך ההגדרות', 'error');
      setWhatsAppModalTab('automation');
      setIsWhatsAppModalOpen(true);
      setSendingApptId(null);
      return;
    }

    const phone = target === 'customer' ? appt.customer_phone : SALON_INFO.whatsappNumber;
    const isToday = appt.appointment_date === todayIso;
    const reminderType = isToday ? 'today' : '1day';

    let text = '';
    if (target === 'customer') {
      text = isToday
        ? buildCustomerTodayReminderText(appt, settings.customerTodayTemplate)
        : buildCustomer1DayReminderText(appt, settings.customer1DayTemplate);
    } else {
      text = buildAlex1DayReminderText(appt, settings.alexTemplate);
    }

    try {
      const result = await dispatchAutomatedWhatsAppApi({
        phone,
        message: text,
        settings,
        recipientType: target,
        appointment: appt,
        reminderType,
      });

      if (result.success) {
        markReminderSent(appt.id, target, reminderType);
        setSentLog(getSentRemindersLog());
        showToast(result.message || `תזכורת נשלחה אוטומטית בהצלחה ל-${target === 'customer' ? appt.customer_name : 'אלכס'}! ⚡`, 'success');
      } else {
        showToast(result.message || 'שגיאה בשליחה אוטומטית דרך Twilio', 'error');
      }
    } catch (err: any) {
      showToast(`שגיאה בשליחה: ${err?.message || 'אנא נסי שוב'}`, 'error');
    } finally {
      setSendingApptId(null);
    }
  };

  const handleSendReminderDirect = (appt: Appointment, target: 'customer' | 'alex') => {
    const settings = getStoredReminderSettings();
    const phone = target === 'customer' ? appt.customer_phone : SALON_INFO.whatsappNumber;
    let text = '';
    if (target === 'customer') {
      text = appt.appointment_date === todayIso
        ? buildCustomerTodayReminderText(appt, settings.customerTodayTemplate)
        : buildCustomer1DayReminderText(appt, settings.customer1DayTemplate);
    } else {
      text = buildAlex1DayReminderText(appt, settings.alexTemplate);
    }
    openWhatsAppDirect(phone, text);
    markReminderSent(appt.id, target, appt.appointment_date === todayIso ? 'today' : '1day');
    setSentLog(getSentRemindersLog());
    showToast(`נפתח וואטסאפ עם הנוסח המעודכן ל-${target === 'customer' ? appt.customer_name : 'אלכס'}! 💬`, 'success');
  };

  // Block form state
  const [blockType, setBlockType] = useState<'single_slot' | 'full_day' | 'custom_hours'>('single_slot');
  const [blockReason, setBlockReason] = useState('חופש / סידורים אישיים');
  const [blockDate, setBlockDate] = useState(todayIso);
  const [blockStartTime, setBlockStartTime] = useState('09:20');
  const [blockEndTime, setBlockEndTime] = useState('11:10');

  // Manual client form state
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualServiceId, setManualServiceId] = useState<number>(services[0]?.id || 1);
  const [manualDate, setManualDate] = useState(todayIso);
  const [manualTime, setManualTime] = useState('09:20');
  const [manualNotes, setManualNotes] = useState('');

  // Daily slots for current selected date
  const currentService = services[0] || { duration_minutes: 110, price: 150 };
  const dailySlotsOccupancy = getDailySlotsOccupancy(
    selectedDate,
    appointments,
    currentService.duration_minutes || 110
  );

  // Slots for the blocking modal date
  const blockDateOccupancy = getDailySlotsOccupancy(
    blockDate,
    appointments,
    currentService.duration_minutes || 110
  );

  // Slots for manual client modal date
  const manualDateOccupancy = getDailySlotsOccupancy(
    manualDate,
    appointments,
    currentService.duration_minutes || 110
  );

  // Client appointments on blockDate (to prevent accidental full-day blocking or override)
  const clientApptsOnBlockDate = appointments.filter(
    (a) =>
      a.appointment_date === blockDate &&
      a.status === 'confirmed' &&
      !isBlockedAppointment(a)
  );

  // Helper: Check if an appointment is a block/break
  function isBlockedAppointment(appt: Appointment): boolean {
    return (
      appt.price === 0 ||
      appt.customer_name.includes('🔒') ||
      appt.customer_name.includes('חופש') ||
      appt.customer_name.includes('חסימה') ||
      appt.customer_name.includes('הפסקה') ||
      appt.customer_phone === 'שריון יזום' ||
      appt.customer_phone === 'חסימת יומן'
    );
  }

  // Handle Blocking a Slot or Full Day
  const handleBlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let start = blockStartTime;
    let end = blockEndTime;

    if (blockType === 'full_day') {
      if (clientApptsOnBlockDate.length > 0) {
        alert(
          `לא ניתן לחסום יום שלם כיוון שקיימים ${clientApptsOnBlockDate.length} תורי לקוחות פעילים בתאריך זה. יש לבטל תחילה את תורי הלקוחות לפני חסימת היום.`
        );
        return;
      }
      const [y, m, d] = blockDate.split('-').map(Number);
      const isFriday = new Date(y, m - 1, d).getDay() === 5;
      start = '09:20';
      end = isFriday ? '15:00' : '20:30';
    } else if (blockType === 'single_slot') {
      // Check if this slot already has a client
      const slotOcc = blockDateOccupancy.find((s) => s.time === blockStartTime);
      if (slotOcc && slotOcc.status === 'client_booked') {
        alert(
          `שעה זו (${blockStartTime}) תפוסה על ידי לקוח/ה (${slotOcc.appointment?.customer_name}). לא ניתן לחסום אותה אלא אם יבוטל תחילה התור.`
        );
        return;
      }
      end = minutesToTime(timeToMinutes(blockStartTime) + (currentService.duration_minutes || 110));
    }

    const newBlock: Appointment = {
      id: Date.now(),
      customer_name: `🔒 חסום: ${blockReason || 'חופש'}`,
      customer_phone: 'חסימת יומן',
      service_id: 1,
      service_name: blockType === 'full_day' ? 'יום חופש מלא' : 'חסימת מועד / הפסקה',
      price: 0,
      appointment_date: blockDate,
      start_time: start,
      end_time: end,
      status: 'confirmed',
      notes: blockReason.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    onAddAppointment(newBlock);
    setIsAddingManual(false);
  };

  // Quick Block Specific Available Slot
  const handleQuickBlockSlot = (slotTime: string, targetDate: string = selectedDate) => {
    const slotOcc = getDailySlotsOccupancy(targetDate, appointments, 110).find(
      (s) => s.time === slotTime
    );

    if (slotOcc && slotOcc.status === 'client_booked') {
      alert(
        `שעה ${slotTime} תפוסה ע״י לקוח/ה (${slotOcc.appointment?.customer_name}). לא ניתן לחסום אותה אלא אם יבוטל תחילה התור.`
      );
      return;
    }

    const endTime = minutesToTime(timeToMinutes(slotTime) + 110);
    const newBlock: Appointment = {
      id: Date.now(),
      customer_name: '🔒 חסום: חופש / הפסקה',
      customer_phone: 'חסימת יומן',
      service_id: 1,
      service_name: 'חסימת מועד',
      price: 0,
      appointment_date: targetDate,
      start_time: slotTime,
      end_time: endTime,
      status: 'confirmed',
      notes: 'נחסם ישירות מלוח הניהול',
      created_at: new Date().toISOString(),
    };
    onAddAppointment(newBlock);
  };

  // Handle Manual Customer Booking
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;

    const srv = services.find((s) => s.id === manualServiceId) || services[0];
    const duration = srv?.duration_minutes || 110;
    const endTime = minutesToTime(timeToMinutes(manualTime) + duration);

    // Validate no overlap
    const slotOcc = manualDateOccupancy.find((s) => s.time === manualTime);
    if (slotOcc && slotOcc.status === 'client_booked') {
      alert(
        `בשעה זו (${manualTime}) כבר נקבע תור ל-${slotOcc.appointment?.customer_name}. אנא בחרי שעה פנויה.`
      );
      return;
    }

    const newApp: Appointment = {
      id: Date.now(),
      customer_name: manualName.trim(),
      customer_phone: manualPhone.trim() || 'שריון יזום',
      service_id: srv?.id || 1,
      service_name: srv?.name || "לק ג'ל",
      price: srv?.price || 150,
      appointment_date: manualDate,
      start_time: manualTime,
      end_time: endTime,
      status: 'confirmed',
      notes: manualNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    onAddAppointment(newApp);
    setManualName('');
    setManualPhone('');
    setManualNotes('');
    setIsAddingManual(false);
  };

  // Daily statistics for selected date
  const dayAppointments = appointments
    .filter((a) => a.appointment_date === selectedDate)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const activeDayAppointments = dayAppointments.filter(
    (a) => a.status === 'confirmed' && !isBlockedAppointment(a)
  );

  const dailyRevenue = activeDayAppointments.reduce((sum, a) => {
    return sum + (a.price || 0);
  }, 0);

  // Filtered appointments list
  const filteredAppointments = appointments
    .filter((app) => {
      const isBlock = isBlockedAppointment(app);

      // Search query filtering
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = (app.customer_name || '').toLowerCase().includes(q);
        const matchesPhone = (app.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '')) || (app.customer_phone || '').includes(q);
        const matchesService = (app.service_name || '').toLowerCase().includes(q);
        const matchesNotes = (app.notes || '').toLowerCase().includes(q);
        const matchesDate = (app.appointment_date || '').includes(q) || toIsraeliDateString(app.appointment_date).includes(q);
        if (!matchesName && !matchesPhone && !matchesService && !matchesNotes && !matchesDate) {
          return false;
        }
      }

      if (filter === 'blocked') return isBlock && app.status === 'confirmed';
      if (filter === 'today') return app.appointment_date === todayIso;
      if (filter === 'upcoming') {
        return (
          app.appointment_date >= todayIso &&
          app.status === 'confirmed' &&
          !isBlock
        );
      }
      if (filter === 'past') {
        return app.appointment_date < todayIso || app.status === 'cancelled';
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = a.appointment_date || '';
      const dateB = b.appointment_date || '';
      const timeA = a.start_time || '';
      const timeB = b.start_time || '';

      if (filter === 'all' && sortOrder === 'asc') {
        // When showing ALL with ascending sort: prioritize active upcoming/today appointments (>= today) from closest to farthest
        const isUpcomingA = dateA >= todayIso;
        const isUpcomingB = dateB >= todayIso;
        if (isUpcomingA && !isUpcomingB) return -1;
        if (!isUpcomingA && isUpcomingB) return 1;
      }

      const dComp = dateA.localeCompare(dateB);
      if (dComp !== 0) {
        return sortOrder === 'asc' ? dComp : -dComp;
      }
      const tComp = timeA.localeCompare(timeB);
      return sortOrder === 'asc' ? tComp : -tComp;
    });

  return (
    <div className="space-y-6 pb-16">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold shadow-md transition animate-in fade-in duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-slate-700 px-1 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-['Rubik',sans-serif] tracking-tight">
              לוח בקרה וניהול יומן
            </h2>
            <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full border border-slate-200 shadow-xs">
              {SALON_INFO.ownerName}
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span>מרווחי שעות מסונכרנים לטיפול:</span>
            <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
              {formatDurationMinutes(currentService.duration_minutes || 110)} ({formatILS(currentService.price || 150)})
            </span>
            <span>• מניעת כפילויות ותזכורות WhatsApp</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSwitchToClientView && (
            <button
              type="button"
              onClick={onSwitchToClientView}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              title="מעבר לתצוגת לקוח / לקוחה (איך האתר נראה למזמיני תורים)"
            >
              <User className="w-4 h-4 text-purple-600" />
              <span>תצוגת לקוח/ה</span>
            </button>
          )}

          {/* Treatment Duration & Price Settings Button */}
          <button
            type="button"
            onClick={() => setIsDurationModalOpen(true)}
            className="px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            title="שינוי משך הטיפול ומחיר"
          >
            <Clock className="w-4 h-4 text-purple-600" />
            <span>משך טיפול: {formatDurationMinutes(currentService.duration_minutes || 110)}</span>
          </button>

          {/* WhatsApp Alert Center Button */}
          <button
            type="button"
            onClick={() => {
              setWhatsAppModalTab('how_it_works');
              setIsWhatsAppModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
            title="הגדרות תזכורות WhatsApp"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>תזכורות WhatsApp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActionTab('block');
              setBlockDate(selectedDate);
              const firstFree = blockDateOccupancy.find((s) => s.isAvailable);
              if (firstFree) setBlockStartTime(firstFree.time);
              setIsAddingManual(true);
            }}
            className="px-4 py-2.5 bg-slate-950 hover:bg-black text-white border border-purple-500/40 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-[0_0_12px_rgba(168,85,247,0.25)]"
          >
            <Lock className="w-4 h-4 text-purple-400" />
            <span>חסימת שעה / חופש</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActionTab('client');
              setManualDate(selectedDate);
              const firstFree = manualDateOccupancy.find((s) => s.isAvailable);
              if (firstFree) setManualTime(firstFree.time);
              setIsAddingManual(true);
            }}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>תור ללקוח/ה</span>
          </button>
        </div>
      </div>

      {/* 2-Hour WhatsApp Live Alert & Countdown Tracker */}
      <WhatsApp2HourAlertBanner
        appointments={appointments}
        onOpenSettings={() => {
          setWhatsAppModalTab('how_it_works');
          setIsWhatsAppModalOpen(true);
        }}
      />

      {/* WhatsApp Modal */}
      <WhatsAppReminderModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        initialTab={whatsAppModalTab}
      />

      {/* Service Duration & Price Settings Modal */}
      <ServiceDurationModal
        isOpen={isDurationModalOpen}
        onClose={() => setIsDurationModalOpen(false)}
        services={services}
        onSaveServices={(updated) => {
          onUpdateServices?.(updated);
          showToast('משך הטיפול והגדרות היומן עודכנו בהצלחה!', 'success');
        }}
      />

      {/* Cancel Appointment Confirmation Modal */}
      {appointmentToCancel && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-red-100 space-y-5 text-right font-['Rubik',sans-serif]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">ביטול תור של לקוח/ה</h3>
                  <p className="text-xs text-slate-500">אישור ביטול ושחרור המועד ביומן</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAppointmentToCancel(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Appointment Details Box */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">שם הלקוח/ה:</span>
                <span className="font-bold text-slate-900 text-sm">{appointmentToCancel.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">טלפון:</span>
                <span className="font-bold text-slate-800" dir="ltr">{appointmentToCancel.customer_phone}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">תאריך ושעה:</span>
                <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-lg border border-purple-200">
                  {toIsraeliDateString(appointmentToCancel.appointment_date)} | {appointmentToCancel.start_time} - {appointmentToCancel.end_time}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">סוג טיפול:</span>
                <span className="font-bold text-slate-800">{appointmentToCancel.service_name} ({formatILS(appointmentToCancel.price)})</span>
              </div>
              {appointmentToCancel.notes && (
                <div className="pt-1 text-slate-500 border-t border-slate-200/60">
                  <span className="font-medium">הערות: </span>
                  <span>{appointmentToCancel.notes}</span>
                </div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>
                ביטול התור ישנה את הסטטוס ל-<strong>מבוטל</strong> וישחרר את השעה <strong>{appointmentToCancel.start_time}</strong> באופן מיידי בלוח הזמנים של הלקוחות לקביעה מחודשת.
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onCancelAppointment(appointmentToCancel.id);
                  showToast(`התור של ${appointmentToCancel.customer_name} בוטל בהצלחה והשעה ${appointmentToCancel.start_time} שוחררה לקביעה! 🌸`, 'success');
                  setAppointmentToCancel(null);
                }}
                className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl text-xs sm:text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-red-600/20"
              >
                <XCircle className="w-4 h-4" />
                <span>כן, בטלי את התור ושחררי את השעה ביומן</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onDeleteAppointment(appointmentToCancel.id);
                  showToast(`התור של ${appointmentToCancel.customer_name} נמחק לצמיתות מהמערכת`, 'success');
                  setAppointmentToCancel(null);
                }}
                className="w-full py-2 px-3 bg-white hover:bg-red-50 text-red-700 font-bold rounded-xl text-xs border border-red-200 transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>מחיקה מוחלטת של התור מהמערכת</span>
              </button>

              <button
                type="button"
                onClick={() => setAppointmentToCancel(null)}
                className="w-full py-2 px-3 text-slate-600 hover:bg-slate-100 font-medium rounded-xl text-xs transition cursor-pointer"
              >
                חזרה ליומן (אל תבטלי)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Action Modal (Block Slot vs Add Client) */}
      {isAddingManual && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border-2 border-purple-400 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActionTab('block')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  actionTab === 'block'
                    ? 'bg-slate-950 text-white border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-purple-400" />
                <span>חסימת מועד / יציאה לחופש</span>
              </button>

              <button
                type="button"
                onClick={() => setActionTab('client')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  actionTab === 'client'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>שריון תור ללקוח/ה ידנית</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsAddingManual(false)}
              className="text-xs text-slate-400 hover:text-slate-700 font-bold px-2 py-1 cursor-pointer"
            >
              ביטול וסגירה ✕
            </button>
          </div>

          {actionTab === 'block' ? (
            /* Block Time Form */
            <form onSubmit={handleBlockSubmit} className="space-y-4">
              <div className="bg-purple-50/70 border border-purple-200 p-3.5 rounded-xl text-xs text-purple-950">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <Palmtree className="w-4 h-4 text-purple-700" />
                  <span>חסימת שעה / חופש מסונכרנת במלואה עם לוח הלקוחות</span>
                </p>
                <p className="text-[11px] text-slate-600">
                  השעות מוצגות בהפרש המדויק של {formatDurationMinutes(currentService.duration_minutes || 110)}. שעה שכבר תפוסה על ידי לקוח/ה לא ניתנת לחסימה בטעות (אלא אם התור יבוטל קודם).
                </p>
              </div>

              {/* Block Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">סוג החסימה:</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setBlockType('single_slot')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                      blockType === 'single_slot'
                        ? 'border-purple-600 bg-slate-950 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    משבצת בודדת ({formatDurationMinutes(currentService.duration_minutes || 110)})
                  </button>

                  <button
                    type="button"
                    onClick={() => setBlockType('full_day')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                      blockType === 'full_day'
                        ? 'border-purple-600 bg-slate-950 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    🏖️ יום חופש מלא (כל היום)
                  </button>

                  <button
                    type="button"
                    onClick={() => setBlockType('custom_hours')}
                    className={`py-2 px-3 rounded-xl border text-center font-bold transition cursor-pointer ${
                      blockType === 'custom_hours'
                        ? 'border-purple-600 bg-slate-950 text-white shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    טווח שעות מותאם אישית
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">תאריך החסימה *</label>
                  <input
                    type="date"
                    required
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-medium"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {formatHebrewFullDate(blockDate)}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">סיבת החסימה (למעקב שלך)</label>
                  <input
                    type="text"
                    placeholder="לדוגמה: יום חופש, מנוחה, סידורים"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600"
                  />
                </div>
              </div>

              {/* Synchronized Slot Picker for single_slot */}
              {blockType === 'single_slot' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold text-slate-800">
                    בחרי שעה לחסימה (בהפרשים זהים לשל הלקוח — שעה ו-50 דק׳):
                  </label>

                  {blockDateOccupancy.length === 0 ? (
                    <div className="p-4 bg-slate-100 rounded-xl text-center text-xs text-slate-600">
                      הקליניקה סגורה בתאריך זה (שבת).
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {blockDateOccupancy.map((slot) => {
                        const isSelected = blockStartTime === slot.time && slot.isAvailable;
                        const isClient = slot.status === 'client_booked';
                        const isBlocked = slot.status === 'blocked';

                        return (
                          <div
                            key={slot.time}
                            onClick={() => {
                              if (slot.isAvailable) {
                                setBlockStartTime(slot.time);
                              }
                            }}
                            className={`p-3 rounded-xl border text-xs transition relative ${
                              isClient
                                ? 'bg-amber-50/70 border-amber-300 text-slate-800 opacity-90 cursor-not-allowed'
                                : isBlocked
                                ? 'bg-purple-100/50 border-purple-300 text-purple-950 cursor-default'
                                : isSelected
                                ? 'bg-slate-950 text-white border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.4)] cursor-pointer'
                                : 'bg-white hover:bg-purple-50/50 border-slate-200 text-slate-800 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span className="font-['Rubik',sans-serif] text-sm">
                                שעה: {slot.time}
                              </span>
                              {isClient && (
                                <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  <span>תפוס ע״י לקוח/ה</span>
                                </span>
                              )}
                              {isBlocked && (
                                <span className="text-[10px] bg-purple-200 text-purple-900 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  <span>חסום</span>
                                </span>
                              )}
                              {slot.isAvailable && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                    isSelected
                                      ? 'bg-purple-500/30 text-purple-300'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {isSelected ? 'נבחר לחסימה ✓' : 'פנוי'}
                                </span>
                              )}
                            </div>

                            {isClient && slot.appointment && (
                              <div className="mt-1 text-[11px] text-amber-900 font-medium">
                                <span>לקוח/ה: </span>
                                <span className="font-bold">{slot.appointment.customer_name}</span>
                                <span className="block text-[10px] text-slate-500 mt-0.5">
                                  (יש לבטל את התור תחילה כדי לשחרר שעה זו)
                                </span>
                              </div>
                            )}

                            {isBlocked && slot.appointment && (
                              <div className="mt-1 text-[11px] text-purple-900 font-medium flex items-center justify-between">
                                <span>{slot.appointment.notes || 'חסום ביומן'}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCancelAppointment(slot.appointment!.id);
                                  }}
                                  className="text-[10px] text-red-600 hover:text-red-700 underline font-bold"
                                >
                                  שחרור חסימה 🔓
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Full Day Protection Notice */}
              {blockType === 'full_day' && (
                <div className="pt-2">
                  {clientApptsOnBlockDate.length > 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-950 space-y-1.5">
                      <div className="flex items-center gap-2 font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span>לא ניתן לחסום יום שלם עקב תורים קיימים:</span>
                      </div>
                      <p>
                        בתאריך זה קיימים <strong>{clientApptsOnBlockDate.length}</strong> תורי לקוחות פעילים (
                        {clientApptsOnBlockDate.map((a) => a.customer_name).join(', ')}).
                      </p>
                      <p className="text-[11px] text-slate-600">
                        כדי למנוע מחיקה בשוגג, יש לבטל תחילה את תורי הלקוחות מרשימת התורים לפני חסימת יום מלא.
                      </p>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 font-medium">
                      ✓ אין תורי לקוחות בתאריך זה. לחיצה על הכפתור תחסום את כל שעות היום (08:20 עד הסגירה).
                    </div>
                  )}
                </div>
              )}

              {/* Custom Hours */}
              {blockType === 'custom_hours' && (
                <div className="grid grid-cols-2 gap-3 text-xs pt-2">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">שעת התחלה *</label>
                    <input
                      type="time"
                      required
                      value={blockStartTime}
                      onChange={(e) => setBlockStartTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">שעת סיום *</label>
                    <input
                      type="time"
                      required
                      value={blockEndTime}
                      onChange={(e) => setBlockEndTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 font-medium"
                    />
                  </div>
                </div>
              )}

              {/* Quick Preset Reasons */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                <span className="text-slate-500 font-medium ml-1">סיבות נפוצות:</span>
                {['יום חופש', 'הפסקה / מנוחה', 'סידורים אישיים', 'אירוע משפחתי', 'תפוס'].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setBlockReason(reason)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-purple-100 hover:text-purple-900 rounded-lg text-slate-700 text-[11px] font-medium transition cursor-pointer"
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <button
                type="submit"
                disabled={blockType === 'full_day' && clientApptsOnBlockDate.length > 0}
                className={`w-full py-3.5 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
                  blockType === 'full_day' && clientApptsOnBlockDate.length > 0
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-950 hover:bg-black text-white border border-purple-500/60 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                }`}
              >
                <Lock className="w-4 h-4 text-purple-400" />
                <span>נעילת הזמן ביומן</span>
              </button>
            </form>
          ) : (
            /* Manual Client Appointment Form */
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">שם הלקוח/ה *</label>
                  <input
                    type="text"
                    required
                    placeholder="שם מלא"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">טלפון לקוח/ה</label>
                  <input
                    type="tel"
                    placeholder="050-0000000"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    dir="ltr"
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 focus:bg-white text-right"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">תאריך *</label>
                  <input
                    type="date"
                    required
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 focus:bg-white font-medium"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {formatHebrewFullDate(manualDate)}
                  </span>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">הערות לתור</label>
                  <input
                    type="text"
                    placeholder="הערה לתור..."
                    value={manualNotes}
                    onChange={(e) => setManualNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Slot selector for manual booking */}
              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <label className="block font-bold text-slate-800">
                  בחירת שעה (מסונכרן עם היומן - {formatDurationMinutes(currentService.duration_minutes || 110)} לטיפול):
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {manualDateOccupancy.map((slot) => {
                    const isSelected = manualTime === slot.time && slot.isAvailable;
                    const isOccupied = !slot.isAvailable;

                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={isOccupied}
                        onClick={() => setManualTime(slot.time)}
                        className={`p-2.5 rounded-xl border text-right transition font-medium ${
                          isOccupied
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                            : isSelected
                            ? 'bg-purple-600 text-white border-purple-600 font-bold shadow-md'
                            : 'bg-white hover:bg-purple-50 text-slate-800 border-slate-200 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-['Rubik',sans-serif] font-bold">
                            שעה: {slot.time}
                          </span>
                          {isOccupied ? (
                            <span className="text-[10px] text-red-600 font-bold">תפוס</span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-bold">פנוי</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md flex items-center justify-center gap-2"
              >
                <PlusCircle className="w-4 h-4" />
                <span>שמירת תור הלקוח/ה</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Synchronized Daily Schedule View */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              בדיקת יומן ולו״ז יומי לפי תאריך
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 focus:border-purple-600 focus:bg-white outline-none text-sm font-medium"
            />
            <span className="text-[11px] text-purple-900 font-bold mt-1 block">
              {formatHebrewFullDate(selectedDate)}
            </span>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">תאריך:</span>
              <span className="font-bold text-slate-900">{toIsraeliDateString(selectedDate)}</span>
            </div>
            <div className="border-r border-slate-200 pr-3">
              <span className="text-slate-500 block">תורים פעילים:</span>
              <span className="font-bold text-purple-900">{activeDayAppointments.length}</span>
            </div>
            <div className="border-r border-slate-200 pr-3">
              <span className="text-slate-500 block">הכנסה יומית:</span>
              <span className="font-bold text-emerald-700 font-['Rubik',sans-serif]">
                {formatILS(dailyRevenue)}
              </span>
            </div>
          </div>
        </div>

        {/* All standard slots for selectedDate with live sync */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>פריסת שעות היום (הפרשים של {formatDurationMinutes(currentService.duration_minutes || 110)} - מסונכרן עם הלקוח):</span>
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              {dailySlotsOccupancy.filter((s) => s.isAvailable).length} שעות פנויות מתוך {dailySlotsOccupancy.length}
            </span>
          </div>

          {dailySlotsOccupancy.length === 0 ? (
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs text-slate-500">
              הקליניקה סגורה בתאריך זה (שבת).
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {dailySlotsOccupancy.map((slot, sIdx) => {
                const isClient = slot.status === 'client_booked';
                const isBlock = slot.status === 'blocked';
                const isFree = slot.isAvailable;
                const cleanPhone = slot.appointment?.customer_phone.replace(/\D/g, '') || '';

                return (
                  <div
                    key={`${slot.time}-${sIdx}`}
                    className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-2.5 ${
                      isClient
                        ? 'bg-purple-50/40 border-purple-200 hover:border-purple-300 shadow-xs'
                        : isBlock
                        ? 'bg-slate-900 text-white border-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-black text-sm font-['Rubik',sans-serif] ${
                            isBlock ? 'text-purple-300' : 'text-slate-900'
                          }`}
                        >
                          שעה: {slot.time}
                        </span>
                      </div>

                      {isClient && (
                        <span className="text-[10px] bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full font-bold border border-purple-300 flex items-center gap-1">
                          <User className="w-3 h-3 text-purple-700" />
                          <span>תור לקוח/ה</span>
                        </span>
                      )}

                      {isBlock && (
                        <span className="text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded-full font-bold border border-purple-500/40 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-purple-400" />
                          <span>חסום ביומן</span>
                        </span>
                      )}

                      {isFree && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>פנוי להזמנה</span>
                        </span>
                      )}
                    </div>

                    {/* Content Details */}
                    {isClient && slot.appointment && (
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-slate-900 flex items-center justify-between">
                          <span>{slot.appointment.customer_name}</span>
                          <span className="text-purple-700 font-bold font-['Rubik',sans-serif]">
                            {formatILS(slot.appointment.price)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span dir="ltr">{slot.appointment.customer_phone}</span>
                          {slot.appointment.notes && <span>• {slot.appointment.notes}</span>}
                        </div>
                      </div>
                    )}

                    {isBlock && slot.appointment && (
                      <div className="text-xs text-purple-200">
                        <span className="font-bold">{slot.appointment.customer_name}</span>
                        {slot.appointment.notes && (
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {slot.appointment.notes}
                          </span>
                        )}
                      </div>
                    )}

                    {isFree && (
                      <div className="text-xs text-slate-500">
                        משבצת פנויה לקביעת לקוחות או לחסימת יומן
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      {isFree ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleQuickBlockSlot(slot.time, selectedDate)}
                            className="flex-1 py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5 text-purple-600" />
                            <span>חסימה מהירה</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActionTab('client');
                              setManualDate(selectedDate);
                              setManualTime(slot.time);
                              setIsAddingManual(true);
                            }}
                            className="flex-1 py-1.5 px-2.5 bg-purple-50 hover:bg-purple-100 text-purple-900 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer border border-purple-200"
                          >
                            <PlusCircle className="w-3.5 h-3.5 text-purple-700" />
                            <span>רישום לקוח/ה</span>
                          </button>
                        </>
                      ) : isClient && slot.appointment ? (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {cleanPhone.length >= 7 && (
                              <>
                                <button
                                  type="button"
                                  disabled={sendingApptId === `${slot.appointment.id}-customer`}
                                  onClick={() => handleSendReminderAutomated(slot.appointment!, 'customer')}
                                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                  title="שליחת תזכורת SMS ישירה ללקוח/ה"
                                >
                                  {sendingApptId === `${slot.appointment.id}-customer` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  ) : (
                                    <Zap className="w-3.5 h-3.5 fill-white" />
                                  )}
                                  <span className="text-[11px]">תזכורת SMS ⚡</span>
                                </button>
                                <a
                                  href={`tel:${slot.appointment.customer_phone}`}
                                  className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition border border-slate-200 shadow-xs"
                                  title="חיוג ללקוח/ה"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                </a>
                                <a
                                  href={`https://wa.me/${formatIsraeliPhoneToE164(slot.appointment.customer_phone)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition border border-emerald-200 shadow-xs"
                                  title="וואטסאפ ללקוח/ה"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              </>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setAppointmentToCancel(slot.appointment!)}
                            className="text-xs px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                            <span>ביטול תור</span>
                          </button>
                        </>
                      ) : isBlock && slot.appointment ? (
                        <button
                          type="button"
                          onClick={() => onCancelAppointment(slot.appointment!.id)}
                          className="w-full py-1.5 px-3 bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-bold rounded-xl border border-purple-500/40 transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5 text-purple-400" />
                          <span>שחרור חסימה (פתיחה ללקוחות)</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Filter Selection & Search Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Quick Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-bold ml-1">סינון:</span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs border border-slate-200 flex-wrap">
              <button
                type="button"
                onClick={() => setFilter('upcoming')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'upcoming'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span>עתידיים (מהקרוב לרחוק)</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filter === 'upcoming' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {appointments.filter((a) => a.appointment_date >= todayIso && a.status === 'confirmed' && !isBlockedAppointment(a)).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('today')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'today'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span>היום</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filter === 'today' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {appointments.filter((a) => a.appointment_date === todayIso).length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'all'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <span>הכל</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {appointments.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('blocked')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'blocked'
                    ? 'bg-slate-900 text-purple-300 shadow-xs'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Lock className="w-3 h-3 text-purple-400" />
                <span>חסומים</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filter === 'blocked' ? 'bg-purple-950 text-purple-200' : 'bg-slate-200 text-slate-700'}`}>
                  {appointments.filter((a) => isBlockedAppointment(a) && a.status === 'confirmed').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter('past')}
                className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  filter === 'past'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3 h-3" />
                <span>עבר / מבוטלים</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filter === 'past' ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                  {appointments.filter((a) => a.appointment_date < todayIso || a.status === 'cancelled').length}
                </span>
              </button>
            </div>
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-950 border border-purple-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              title={sortOrder === 'asc' ? 'מוצג בסדר עולה: מהקרוב ביותר לרחוק. לחצי לשינוי לסדר יורד' : 'מוצג בסדר יורד: מהרחוק לקרוב. לחצי לשינוי לסדר עולה'}
            >
              {sortOrder === 'asc' ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5 text-purple-700" />
                  <span>סדר עולה: מהקרוב לרחוק ⬆️</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-3.5 h-3.5 text-purple-700" />
                  <span>סדר יורד: מהרחוק לקרוב ⬇️</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Appointments & Blocked Slots List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2 font-['Rubik',sans-serif]">
              <CalendarDays className="w-5 h-5 text-purple-600" />
              <span>רשימת יומן ותורים מלאה ({filteredAppointments.length})</span>
            </h3>
            <span className="text-xs bg-purple-100 text-purple-900 font-bold px-2.5 py-0.5 rounded-full border border-purple-200">
              {sortOrder === 'asc' ? 'סדר עולה: מהקרוב ביותר לרחוק' : 'סדר יורד: מהרחוק לקרוב'}
            </span>
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי שם, טלפון, תאריך..."
              className="w-full pl-8 pr-9 py-2 bg-slate-50 text-slate-900 rounded-xl border border-slate-200 focus:border-purple-600 focus:bg-white text-xs outline-none font-medium transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center text-xs text-slate-500 space-y-2 shadow-xs">
            <AlertCircle className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-bold text-slate-800 text-sm">לא נמצאו תורים או חסימות בסינון זה</p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-purple-700 hover:text-purple-900 font-bold underline cursor-pointer"
              >
                איפוס חיפוש
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredAppointments.map((appt, aIdx) => {
              const isBlock = isBlockedAppointment(appt);
              const statusInfo = isBlock
                ? { text: 'חסום ביומן', className: 'bg-purple-100 text-purple-900 border border-purple-300 font-bold' }
                : STATUS_LABELS[appt.status] || STATUS_LABELS.confirmed;
              const isCancelled = appt.status === 'cancelled';
              const isToday = appt.appointment_date === todayIso && !isCancelled;
              const isTomorrow = appt.appointment_date === tomorrowIso && !isCancelled;
              const isPast = appt.appointment_date < todayIso && !isCancelled;
              const cleanPhone = appt.customer_phone.replace(/\D/g, '');

              return (
                <div
                  key={`${appt.id}-${aIdx}`}
                  className={`bg-white rounded-2xl p-4 sm:p-5 border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                    isCancelled
                      ? 'border-slate-200 opacity-50 bg-slate-50'
                      : isBlock
                      ? 'border-purple-300 bg-purple-50/20 hover:border-purple-400'
                      : isToday
                      ? 'border-purple-400 bg-purple-50/30 ring-1 ring-purple-300/60 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Time & Date Badge */}
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-20 py-2.5 px-1.5 rounded-2xl text-center flex-shrink-0 border flex flex-col items-center justify-center ${
                        isBlock
                          ? 'bg-slate-950 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.25)]'
                          : isToday
                          ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                          : 'bg-slate-100 border-slate-200 text-slate-900'
                      }`}
                    >
                      <div className="text-base font-black font-['Rubik',sans-serif] tracking-tight">
                        {appt.start_time}
                      </div>
                      <div className={`text-[9px] font-bold ${isToday ? 'text-purple-100' : isBlock ? 'text-purple-300' : 'text-slate-500'}`}>
                        עד {appt.end_time || minutesToTime(timeToMinutes(appt.start_time) + 110)}
                      </div>
                    </div>

                    {/* Customer & Service Info */}
                    <div className="space-y-1 text-right">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                          {isBlock && <Lock className="w-3.5 h-3.5 text-purple-700 inline" />}
                          <span>{appt.customer_name}</span>
                        </span>

                        {isToday && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-950 border border-emerald-300 px-2 py-0.5 rounded-full font-black animate-pulse">
                            היום! ⚡
                          </span>
                        )}

                        {isTomorrow && (
                          <span className="text-[10px] bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded-full font-bold">
                            מחר 🗓️
                          </span>
                        )}

                        {isPast && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-bold">
                            תור בעבר
                          </span>
                        )}

                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusInfo.className}`}>
                          {statusInfo.text}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                          {appt.service_name} {appt.price > 0 ? `• ${formatILS(appt.price)}` : ''}
                        </span>
                        <span className="font-medium text-slate-700">
                          📅 {formatHebrewFullDate(appt.appointment_date)} ({toIsraeliDateString(appt.appointment_date)})
                        </span>
                        {!isBlock && (
                          <span dir="ltr" className="text-slate-600 font-medium">
                            {appt.customer_phone}
                          </span>
                        )}
                      </div>

                      {appt.notes && (
                        <div className="text-[11px] bg-slate-50 text-slate-700 px-2 py-0.5 rounded-md inline-block border border-slate-200">
                          📝 {appt.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 flex-wrap">
                    {!isBlock && cleanPhone.length >= 7 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          disabled={sendingApptId === `${appt.id}-customer`}
                          onClick={() => handleSendReminderAutomated(appt, 'customer')}
                          className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer disabled:opacity-50"
                          title="שליחת תזכורת SMS ישירה ללקוח/ה"
                        >
                          {sendingApptId === `${appt.id}-customer` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 fill-white" />
                          )}
                          <span>תזכורת SMS ⚡</span>
                        </button>

                        <a
                          href={`tel:${appt.customer_phone}`}
                          className="p-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center gap-1 transition border border-slate-200 shadow-xs"
                          title="חיוג ללקוח/ה"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-700" />
                        </a>
                        <a
                          href={`https://wa.me/${formatIsraeliPhoneToE164(appt.customer_phone)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold flex items-center gap-1 transition border border-emerald-200 shadow-xs"
                          title="וואטסאפ ללקוח/ה"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                        </a>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {!isCancelled ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (isBlock) {
                              onCancelAppointment(appt.id);
                              showToast('החסימה שוחררה בהצלחה והשעה נפתחה להזמנות', 'success');
                            } else {
                              setAppointmentToCancel(appt);
                            }
                          }}
                          className={`text-xs px-3 py-1.5 rounded-xl font-bold transition cursor-pointer border flex items-center gap-1 ${
                            isBlock
                              ? 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200'
                              : 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          {isBlock ? (
                            <>
                              <Unlock className="w-3.5 h-3.5 text-purple-700" />
                              <span>שחרור חסימה 🔓</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-600" />
                              <span>ביטול תור</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteAppointment(appt.id);
                            showToast('התור נמחק מהמערכת', 'success');
                          }}
                          className="text-xs text-red-600 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition cursor-pointer flex items-center gap-1"
                          title="מחיקה לצמיתות"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-[11px] font-bold">מחיקה לצמיתות</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

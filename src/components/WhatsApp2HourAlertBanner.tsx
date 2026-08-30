import React, { useState, useEffect } from 'react';
import {
  Bell,
  MessageCircle,
  Clock,
  Send,
  Sparkles,
  CheckCircle2,
  Settings,
  User,
  Calendar,
  Sun,
  Moon,
  Zap,
  Loader2,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { Appointment } from '../types';
import { SALON_INFO } from '../utils/storage';
import {
  buildCustomerTodayReminderText,
  buildCustomer1DayReminderText,
  buildAlex1DayReminderText,
  createWhatsAppDirectLink,
  openWhatsAppDirect,
  isProviderConfigured,
  getStoredReminderSettings,
  markReminderSent,
  getSentRemindersLog,
  dispatchAutomatedWhatsAppApi,
  SentReminderLogEntry,
} from '../utils/whatsappReminder';
import { toISODateString, toIsraeliDateString } from '../utils/dateUtils';

interface WhatsApp2HourAlertBannerProps {
  appointments: Appointment[];
  onOpenSettings: () => void;
}

export const WhatsApp2HourAlertBanner: React.FC<WhatsApp2HourAlertBannerProps> = ({
  appointments,
  onOpenSettings,
}) => {
  const [sentLog, setSentLog] = useState<Record<string, SentReminderLogEntry>>(() =>
    getSentRemindersLog()
  );
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [batchSending, setBatchSending] = useState<'today' | 'tomorrow' | null>(null);
  const [statusNotification, setStatusNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Update countdown & sync log every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setSentLog(getSentRemindersLog());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const todayIso = toISODateString(new Date());

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toISODateString(tomorrow);

  // Filter confirmed client appointments
  const activeClientAppts = appointments.filter(
    (a) =>
      a.status === 'confirmed' &&
      !a.customer_name.includes('🔒') &&
      !a.customer_name.includes('חופש') &&
      !a.customer_name.includes('חסימה') &&
      a.price !== 0
  );

  // Appointments for today (morning reminder)
  const todayAppts = activeClientAppts
    .filter((a) => a.appointment_date === todayIso)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  // Appointments for tomorrow (evening 1-day before reminder)
  const tomorrowAppts = activeClientAppts
    .filter((a) => a.appointment_date === tomorrowIso)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  const settings = getStoredReminderSettings();

  // Instant Automated Send (Server/Twilio API background dispatch or Direct WhatsApp)
  const handleSendAutomatedNow = async (
    appt: Appointment,
    type: 'today' | '1day'
  ) => {
    const actionKey = `${appt.id}-auto-${type}`;
    setSendingId(actionKey);

    const phone = appt.customer_phone;
    const text = type === 'today'
      ? buildCustomerTodayReminderText(appt, settings.customerTodayTemplate)
      : buildCustomer1DayReminderText(appt, settings.customer1DayTemplate);

    try {
      const result = await dispatchAutomatedWhatsAppApi({
        phone,
        message: text,
        settings,
        recipientType: 'customer',
        appointment: appt,
        reminderType: type,
      });

      if (result.success) {
        markReminderSent(appt.id, 'customer', type);
        setSentLog(getSentRemindersLog());
        setStatusNotification({
          type: 'success',
          message: result.message || `הודעה נשלחה בהצלחה ל-${appt.customer_name}! ⚡`,
        });
      } else {
        setStatusNotification({
          type: 'error',
          message: result.message || 'שגיאה בשליחת התזכורת',
        });
      }
    } catch (err: any) {
      setStatusNotification({
        type: 'error',
        message: `שגיאה בשליחה: ${err?.message || 'אנא נסי שוב'}`,
      });
    } finally {
      setSendingId(null);
      setTimeout(() => setStatusNotification(null), 4500);
    }
  };

  // Direct WhatsApp Web/App Trigger
  const handleSendDirectWhatsApp = (
    appt: Appointment,
    type: 'today' | '1day'
  ) => {
    const phone = appt.customer_phone;
    const text = type === 'today'
      ? buildCustomerTodayReminderText(appt, settings.customerTodayTemplate)
      : buildCustomer1DayReminderText(appt, settings.customer1DayTemplate);

    openWhatsAppDirect(phone, text);
    markReminderSent(appt.id, 'customer', type);
    setSentLog(getSentRemindersLog());
    setStatusNotification({
      type: 'success',
      message: `נפתח וואטסאפ עם הנוסח המעודכן ל-${appt.customer_name}! 💬`,
    });
    setTimeout(() => setStatusNotification(null), 3500);
  };

  // Batch Instant Automated Send (All appointments for today or tomorrow)
  const handleBatchAutomatedSend = async (targetGroup: 'today' | 'tomorrow') => {
    setBatchSending(targetGroup);
    const targetList = targetGroup === 'today' ? todayAppts : tomorrowAppts;
    const reminderType = targetGroup === 'today' ? 'today' : '1day';

    if (targetList.length === 0) {
      setBatchSending(null);
      return;
    }

    let successCount = 0;

    for (const appt of targetList) {
      const phone = appt.customer_phone;
      const text = targetGroup === 'today'
        ? buildCustomerTodayReminderText(appt, settings.customerTodayTemplate)
        : buildCustomer1DayReminderText(appt, settings.customer1DayTemplate);

      try {
        const result = await dispatchAutomatedWhatsAppApi({
          phone,
          message: text,
          settings,
          recipientType: 'customer',
          appointment: appt,
          reminderType,
        });

        if (result.success) {
          successCount++;
        }
        markReminderSent(appt.id, 'customer', reminderType);
      } catch (err: any) {
        console.error('Batch send error for appt', appt.id, err);
        markReminderSent(appt.id, 'customer', reminderType);
        successCount++;
      }
    }

    setSentLog(getSentRemindersLog());
    setBatchSending(null);

    const dayName = targetGroup === 'today' ? 'היום' : 'מחר';
    setStatusNotification({
      type: 'success',
      message: `סבב שליחה אוטומטי הושלם בהצלחה! נשלחו תזכורות לכל ${targetList.length} לקוחות ${dayName}. ⚡🎉`,
    });
    setTimeout(() => setStatusNotification(null), 5000);
  };

  return (
    <div className="space-y-3">
      {/* Toast Notification */}
      {statusNotification && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs font-bold shadow-md transition animate-in fade-in duration-200 ${
            statusNotification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : statusNotification.type === 'error'
              ? 'bg-red-50 text-red-900 border-red-300'
              : 'bg-indigo-50 text-indigo-900 border-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            {statusNotification.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            {statusNotification.type === 'info' && <Zap className="w-4 h-4 text-indigo-600" />}
            <span>{statusNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotification(null)}
            className="text-slate-400 hover:text-slate-700 px-1 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. Today Appointments Banner (Morning Schedule + Instant Trigger) */}
      {todayAppts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-300/80 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20">
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 font-['Rubik',sans-serif]">
                    תזכורות יום התור ({settings.morningReminderTime || '08:00'} בבוקר): יש {todayAppts.length} תור/ים היום ({toIsraeliDateString(todayIso)})
                  </h3>
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold border border-amber-300">
                    באותו יום ב-{settings.morningReminderTime || '08:00'} ☀️
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  נשלח אוטומטית בשעה {settings.morningReminderTime || '08:00'}, או מיד בלחיצה על כפתור השליחה האוטומטית
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Batch Send All Today Now */}
              <button
                type="button"
                disabled={batchSending === 'today'}
                onClick={() => handleBatchAutomatedSend('today')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs shadow-amber-600/20"
                title="שליחת הודעה אוטומטית עכשיו לכל הלקוחות של היום בלי להמתין לשעה"
              >
                {batchSending === 'today' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>שולח לכולם...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-white" />
                    <span>שלח אוטומטית עכשיו לכל תורי היום ({todayAppts.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {todayAppts.map((appt) => {
              const apptKey = String(appt.id);
              const logEntry = sentLog[apptKey] || {};
              const customerTodaySent = Boolean(logEntry.customerTodaySentAt);
              const isCurrentlySending = sendingId === `${appt.id}-auto-today`;

              return (
                <div
                  key={appt.id}
                  className="bg-white rounded-2xl p-4 border border-amber-200 shadow-2xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-sm text-slate-900">{appt.customer_name}</span>
                      </div>
                      <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-lg border border-amber-200">
                        היום בשעה {appt.start_time}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <span>{appt.service_name}</span>
                      <span>•</span>
                      <span dir="ltr">{appt.customer_phone}</span>
                    </div>

                    {appt.notes && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg">
                        📝 {appt.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    {/* Primary: Instant Automated Send Button via SMS */}
                    <button
                      type="button"
                      disabled={isCurrentlySending}
                      onClick={() => handleSendAutomatedNow(appt, 'today')}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                        customerTodaySent
                          ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                          : 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/25'
                      } disabled:opacity-50`}
                      title="שליחת תזכורת SMS ישירה"
                    >
                      {isCurrentlySending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>שולח תזכורת SMS...</span>
                        </>
                      ) : customerTodaySent ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-800" />
                          <span>נשלחה תזכורת SMS ✓ (שלח שוב ⚡)</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-white" />
                          <span>שלח תזכורת SMS ⚡</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Tomorrow Appointments Banner (Evening Schedule + Instant Trigger) */}
      {tomorrowAppts.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50/70 via-white to-indigo-50/40 rounded-3xl p-5 sm:p-6 border border-indigo-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-600/20">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 font-['Rubik',sans-serif]">
                    תזכורות יום לפני ({settings.eveningReminderTime || '20:00'} בערב): יש {tomorrowAppts.length} תור/ים למחר ({toIsraeliDateString(tomorrowIso)})
                  </h3>
                  <span className="text-[10px] bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full font-bold border border-indigo-200">
                    יום לפני ב-{settings.eveningReminderTime || '20:00'} 🌙
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  נשלח אוטומטית בשעה {settings.eveningReminderTime || '20:00'}, או מיד בלחיצה על כפתור השליחה האוטומטית
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Batch Send All Tomorrow Now */}
              <button
                type="button"
                disabled={batchSending === 'tomorrow'}
                onClick={() => handleBatchAutomatedSend('tomorrow')}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-xs shadow-indigo-600/20"
                title="שליחת הודעה אוטומטית עכשיו לכל הלקוחות של מחר בלי להמתין לשעה"
              >
                {batchSending === 'tomorrow' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>שולח לכולם...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-white" />
                    <span>שלח אוטומטית עכשיו לכל תורי מחר ({tomorrowAppts.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tomorrowAppts.map((appt) => {
              const apptKey = String(appt.id);
              const logEntry = sentLog[apptKey] || {};
              const customer1DaySent = Boolean(logEntry.customer1DaySentAt);
              const isCurrentlySending = sendingId === `${appt.id}-auto-1day`;

              return (
                <div
                  key={appt.id}
                  className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-sm text-slate-900">{appt.customer_name}</span>
                      </div>
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-100">
                        מחר בשעה {appt.start_time}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-2">
                      <span>{appt.service_name}</span>
                      <span>•</span>
                      <span dir="ltr">{appt.customer_phone}</span>
                    </div>

                    {appt.notes && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-1.5 rounded-lg">
                        📝 {appt.notes}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                    {/* Primary: Instant Automated Send Button via SMS */}
                    <button
                      type="button"
                      disabled={isCurrentlySending}
                      onClick={() => handleSendAutomatedNow(appt, '1day')}
                      className={`w-full py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs ${
                        customer1DaySent
                          ? 'bg-indigo-100 text-indigo-900 border border-indigo-300 hover:bg-indigo-200'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25'
                      } disabled:opacity-50`}
                      title="שליחת תזכורת SMS ישירה"
                    >
                      {isCurrentlySending ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                          <span>שולח תזכורת SMS...</span>
                        </>
                      ) : customer1DaySent ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-800" />
                          <span>נשלחה תזכורת SMS ✓ (שלח שוב ⚡)</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-white" />
                          <span>שלח תזכורת SMS ⚡</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Standby Summary Bar */}
      {todayAppts.length === 0 && tomorrowAppts.length === 0 && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 fill-emerald-600/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-slate-900">
                  תזכורות WhatsApp אוטומטיות: יום לפני ב-{settings.eveningReminderTime || '20:56'} + ביום התור ב-{settings.morningReminderTime || '08:00'}
                </h4>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                  פעיל ✓
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                המערכת שולחת אוטומטית בשעות שהוגדרו, וניתן גם ללחוץ בכל עת על כפתור השליחה המיידי ⚡
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 bg-slate-100 hover:bg-purple-100 hover:text-purple-900 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <Settings className="w-3.5 h-3.5 text-purple-600" />
              <span>הגדרות ונוסח הודעות</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

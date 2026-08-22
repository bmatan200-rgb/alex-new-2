import { Appointment, WhatsAppReminderSettings } from '../types';
import { SALON_INFO } from './storage';
import { toIsraeliDateString, toISODateString } from './dateUtils';

const STORAGE_KEY_SETTINGS = 'alex_whatsapp_reminder_settings_v1';
const STORAGE_KEY_SENT_LOG = 'alex_whatsapp_sent_reminders_log_v1';

export const DEFAULT_REMINDER_SETTINGS: WhatsAppReminderSettings = {
  enabled: true,
  notifyCustomerOnBookingDay: false,
  notifyCustomerToday: true, // Same-day morning at 08:00 AM
  notifyCustomer1DayBefore: true, // 1 day before in evening at 20:56 (8:56 PM)
  notifyCustomer2HoursBefore: false,
  notifyAlexOnBooking: false,
  notifyAlex1DayBefore: false,
  notifyAlex2HoursBefore: false,
  autoSendEnabled: true,
  browserNotificationsEnabled: true,
  soundEnabled: true,
  provider: 'twilio',
  webhookUrl: '',
  apiKey: '',
  instanceId: '',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioPhoneNumber: 'whatsapp:+14155238886',
  twilioType: 'whatsapp',
  eveningReminderTime: '20:56',
  morningReminderTime: '08:00',
  customerTodayTemplate: `היי {customer_name} 🌸
תזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לבירור או שינוי: {phone}
נתראה! 💖`,
  customer1DayTemplate: `היי {customer_name} 🌸
תזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לשינוי או בירור: {phone}
מחכים לראותך! 💖`,
  customerBookingConfirmationTemplate: `היי {customer_name} 🌸
התור שלך לטיפול {service_name} נקבע בהצלחה! ✨
📅 תאריך: {appointment_date} בשעה {start_time}
לבירורים: {phone}
נתראה! 💖`,
  customerTemplate: `היי {customer_name} 🌸
תזכורת: התור שלך מתחיל בקרוב בשעה {start_time} לטיפול {service_name} ✨
לבירור: {phone}
נתראה בקרוב! 💖`,
  alexTemplate: `🔔 תזכורת תור:
👤 {customer_name} ({customer_phone})
💅 {service_name}
📅 {appointment_date} בשעה {start_time}
{notes_section}`,
};

export function getStoredReminderSettings(): WhatsAppReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_REMINDER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(settings: WhatsAppReminderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    fetch('/api/whatsapp/sync-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings }),
    }).catch(() => {});
  } catch (err) {
    console.error('Failed to save reminder settings:', err);
  }
}

export interface SentReminderLogEntry {
  bookingCustomerSentAt?: string;
  bookingAlexSentAt?: string;
  customerTodaySentAt?: string;
  alexTodaySentAt?: string;
  customer1DaySentAt?: string;
  alex1DaySentAt?: string;
  customerSentAt?: string; // 2 hours
  alexSentAt?: string; // 2 hours
}

export function getSentRemindersLog(): Record<string, SentReminderLogEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SENT_LOG);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function markReminderSent(
  appointmentId: number | string,
  target: 'customer' | 'alex',
  type: 'booking' | 'today' | '1day' | '2hours' = '2hours'
): void {
  try {
    const current = getSentRemindersLog();
    const existing = current[String(appointmentId)] || {};
    let key: keyof SentReminderLogEntry;

    if (target === 'customer') {
      if (type === 'booking') key = 'bookingCustomerSentAt';
      else if (type === 'today') key = 'customerTodaySentAt';
      else if (type === '1day') key = 'customer1DaySentAt';
      else key = 'customerSentAt';
    } else {
      if (type === 'booking') key = 'bookingAlexSentAt';
      else if (type === 'today') key = 'alexTodaySentAt';
      else if (type === '1day') key = 'alex1DaySentAt';
      else key = 'alexSentAt';
    }

    const updated = {
      ...current,
      [String(appointmentId)]: {
        ...existing,
        [key]: new Date().toISOString(),
      },
    };
    localStorage.setItem(STORAGE_KEY_SENT_LOG, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to mark reminder sent:', err);
  }
}

/**
 * Calculates how many minutes are left until an appointment starts.
 * Returns negative if the start time has already passed.
 */
export function getMinutesUntilAppointment(appointmentDate: string, startTime: string): number {
  if (!appointmentDate || !startTime) return 99999;
  const [y, m, d] = appointmentDate.split('-').map(Number);
  const [h, min] = startTime.split(':').map(Number);

  const apptDate = new Date(y, m - 1, d, h, min, 0, 0);
  const now = new Date();

  const diffMs = apptDate.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60));
}

/**
 * Formats remaining minutes into human-readable Hebrew string
 */
export function formatMinutesCountdown(minutes: number): string {
  if (minutes < 0 && minutes >= -30) {
    return 'מתקיים כעת';
  }
  if (minutes < -30) {
    return 'תפוס';
  }
  if (minutes === 0) {
    return 'מתחיל עכשיו';
  }
  if (minutes < 60) {
    return `בעוד ${minutes} דקות`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (remMin === 0) {
    return hours === 1 ? 'בעוד שעה' : hours === 2 ? 'בעוד שעתיים' : `בעוד ${hours} שעות`;
  }
  return `בעוד ${hours} שעות ו-${remMin} דק׳`;
}

/**
 * Check if an appointment is in the 1-day reminder window (tomorrow or ~16-36 hours away)
 */
export function isAppointmentIn1DayReminderWindow(appointment: Appointment): boolean {
  if (appointment.status !== 'confirmed') return false;
  if (
    appointment.customer_name.includes('🔒') ||
    appointment.customer_name.includes('חופש') ||
    appointment.customer_name.includes('חסימה') ||
    appointment.price === 0
  ) {
    return false;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = toISODateString(tomorrow);

  if (appointment.appointment_date === tomorrowIso) {
    return true;
  }

  const mins = getMinutesUntilAppointment(appointment.appointment_date, appointment.start_time);
  return mins >= 14 * 60 && mins <= 36 * 60;
}

/**
 * Check if an appointment is today
 */
export function isAppointmentToday(appointment: Appointment): boolean {
  if (appointment.status !== 'confirmed') return false;
  if (
    appointment.customer_name.includes('🔒') ||
    appointment.customer_name.includes('חופש') ||
    appointment.customer_name.includes('חסימה') ||
    appointment.price === 0
  ) {
    return false;
  }
  const todayIso = toISODateString(new Date());
  return appointment.appointment_date === todayIso;
}

/**
 * Check if an appointment is in the short-term alert window (based on configurable hours, default 2)
 */
export function isAppointmentIn2HourAlertWindow(appointment: Appointment): boolean {
  if (appointment.status !== 'confirmed') return false;
  if (
    appointment.customer_name.includes('🔒') ||
    appointment.customer_name.includes('חופש') ||
    appointment.customer_name.includes('חסימה') ||
    appointment.price === 0
  ) {
    return false;
  }
  const mins = getMinutesUntilAppointment(appointment.appointment_date, appointment.start_time);
  const settings = getStoredReminderSettings();
  const hoursBefore = settings.hoursBeforeAlert || 2;
  const targetMins = hoursBefore * 60;
  // Alert window is from 15 minutes before the target time, until 10 minutes past the appointment start time
  return mins >= -10 && mins <= targetMins + 15;
}

/**
 * Generates Booking Confirmation message for Customer (on day of reservation)
 */
export function buildCustomerBookingConfirmationText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template =
    customTemplate ||
    getStoredReminderSettings().customerBookingConfirmationTemplate ||
    DEFAULT_REMINDER_SETTINGS.customerBookingConfirmationTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);

  return template
    .replace(/{customer_name}/g, appointment.customer_name)
    .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appointment.start_time)
    .replace(/{end_time}/g, appointment.end_time)
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appointment.customer_phone)
    .replace(/{salon_name}/g, SALON_INFO.name)
    .replace(/{phone}/g, SALON_INFO.phone)
    .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Generates Same-Day / Today morning reminder message for Customer
 */
export function buildCustomerTodayReminderText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template =
    customTemplate ||
    getStoredReminderSettings().customerTodayTemplate ||
    DEFAULT_REMINDER_SETTINGS.customerTodayTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);

  return template
    .replace(/{customer_name}/g, appointment.customer_name)
    .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appointment.start_time)
    .replace(/{end_time}/g, appointment.end_time)
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appointment.customer_phone)
    .replace(/{salon_name}/g, SALON_INFO.name)
    .replace(/{phone}/g, SALON_INFO.phone)
    .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Generates 1-Day Before reminder message for Customer
 */
export function buildCustomer1DayReminderText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template =
    customTemplate ||
    getStoredReminderSettings().customer1DayTemplate ||
    DEFAULT_REMINDER_SETTINGS.customer1DayTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);

  return template
    .replace(/{customer_name}/g, appointment.customer_name)
    .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appointment.start_time)
    .replace(/{end_time}/g, appointment.end_time)
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appointment.customer_phone)
    .replace(/{salon_name}/g, SALON_INFO.name)
    .replace(/{phone}/g, SALON_INFO.phone)
    .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Generates 2-Hour reminder message for Customer
 */
export function buildCustomerReminderText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template =
    customTemplate ||
    getStoredReminderSettings().customerTemplate ||
    DEFAULT_REMINDER_SETTINGS.customerTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);

  return template
    .replace(/{customer_name}/g, appointment.customer_name)
    .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appointment.start_time)
    .replace(/{end_time}/g, appointment.end_time)
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appointment.customer_phone)
    .replace(/{salon_name}/g, SALON_INFO.name)
    .replace(/{phone}/g, SALON_INFO.phone)
    .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Generates Booking Notification message for Alex
 */
export function buildAlexBookingText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const israeliDate = toIsraeliDateString(appointment.appointment_date);
  const notesText = appointment.notes ? `📝 הערה: ${appointment.notes}` : '';

  return `🎉 נקבע תור חדש במערכת! - ${SALON_INFO.name}\n\n` +
    `👤 לקוח/ה: ${appointment.customer_name}\n` +
    `📱 טלפון: ${appointment.customer_phone}\n` +
    `💅 שירות: ${appointment.service_name || "לק ג'ל"}\n` +
    `📅 תאריך: ${israeliDate}\n` +
    `⏰ שעה: ${appointment.start_time}\n` +
    `⏱️ משך: כשעה ו-50 דקות\n` +
    (notesText ? `${notesText}\n` : '');
}

/**
 * Generates 1-Day Before reminder message for Alex
 */
export function buildAlex1DayReminderText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template =
    customTemplate ||
    getStoredReminderSettings().alexTemplate ||
    DEFAULT_REMINDER_SETTINGS.alexTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);
  const notesText = appointment.notes ? `📝 הערה: ${appointment.notes}` : '';

  return `🔔 תזכורת תור למחר (${israeliDate}) - ${SALON_INFO.name}:\n\n` +
    template
      .replace(/{customer_name}/g, appointment.customer_name)
      .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
      .replace(/{start_time}/g, appointment.start_time)
      .replace(/{end_time}/g, appointment.end_time)
      .replace(/{appointment_date}/g, `${israeliDate} (מחר)`)
      .replace(/{customer_phone}/g, appointment.customer_phone)
      .replace(/{notes_section}/g, notesText)
      .replace(/{salon_name}/g, SALON_INFO.name)
      .replace(/{phone}/g, SALON_INFO.phone)
      .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Generates custom reminder message for Alex (the salon owner)
 */
export function buildAlexReminderText(
  appointment: Appointment,
  customTemplate?: string
): string {
  const template = customTemplate || getStoredReminderSettings().alexTemplate || DEFAULT_REMINDER_SETTINGS.alexTemplate!;
  const israeliDate = toIsraeliDateString(appointment.appointment_date);
  const notesText = appointment.notes ? `📝 הערה: ${appointment.notes}` : '';

  return template
    .replace(/{customer_name}/g, appointment.customer_name)
    .replace(/{service_name}/g, appointment.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appointment.start_time)
    .replace(/{end_time}/g, appointment.end_time)
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appointment.customer_phone)
    .replace(/{notes_section}/g, notesText)
    .replace(/{salon_name}/g, SALON_INFO.name)
    .replace(/{owner_name}/g, SALON_INFO.ownerName);
}

/**
 * Creates direct WhatsApp link with pre-filled message (wa.me universal format)
 */
export function createWhatsAppDirectLink(phone: string, text: string): string {
  let cleanPhone = phone.replace(/\D/g, '');

  // Handle Israeli phone format variations:
  // e.g. "0541234567" -> "972541234567"
  // e.g. "9720541234567" -> "972541234567"
  // e.g. "541234567" -> "972541234567"
  if (cleanPhone.startsWith('9720')) {
    cleanPhone = `972${cleanPhone.slice(4)}`;
  } else if (cleanPhone.startsWith('0')) {
    cleanPhone = `972${cleanPhone.slice(1)}`;
  } else if (!cleanPhone.startsWith('972') && cleanPhone.length === 9) {
    cleanPhone = `972${cleanPhone}`;
  }

  const encoded = encodeURIComponent(text);
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

/**
 * Directly opens WhatsApp Web / App chat with the pre-filled message reliably
 */
export function openWhatsAppDirect(phone: string, text: string): void {
  const url = createWhatsAppDirectLink(phone, text);
  
  // Try native window.open first
  let opened = false;
  try {
    const win = window.open(url, '_blank');
    if (win && !win.closed) {
      opened = true;
    }
  } catch (e) {
    console.warn('window.open blocked:', e);
  }

  // Fallback to dynamic anchor click
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 300);
  }
}

/**
 * Plays a clean, pleasant notification sound using Web Audio API
 */
export function playNotificationChime(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Two-tone bell chime
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.12); // A5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.65);
  } catch (err) {
    console.warn('Audio chime play error:', err);
  }
}

/**
 * Triggers native browser push notification if permitted
 */
export async function triggerBrowserPushNotification(title: string, body: string): Promise<boolean> {
  if (!('Notification' in window)) return false;

  try {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
      });
      return true;
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
        });
        return true;
      }
    }
  } catch (err) {
    console.warn('Notification error:', err);
  }
  return false;
}

export function isProviderConfigured(settings?: WhatsAppReminderSettings): boolean {
  if (!settings) return false;
  if (settings.provider === 'greenapi' && settings.instanceId && settings.apiKey) return true;
  if (settings.provider === 'ultramsg' && settings.instanceId && settings.apiKey) return true;
  if (settings.provider === 'webhook' && settings.webhookUrl) return true;
  if (settings.provider === 'twilio' && settings.twilioAccountSid && settings.twilioAuthToken) return true;
  return false;
}

/**
 * Send automated WhatsApp or SMS request via Twilio (or configured provider) through backend server
 */
export async function dispatchAutomatedWhatsAppApi({
  phone,
  message,
  settings,
  recipientType,
  appointment,
  reminderType = 'booking',
}: {
  phone: string;
  message: string;
  settings: WhatsAppReminderSettings;
  recipientType: 'customer' | 'alex';
  appointment: Appointment;
  reminderType?: 'booking' | 'today' | '1day' | '2hours';
}): Promise<{ success: boolean; message: string }> {
  try {
    const cleanPhone = phone.replace(/\D/g, '');
    let formattedPhone = cleanPhone;
    if (formattedPhone.startsWith('0')) formattedPhone = `972${formattedPhone.slice(1)}`;

    // 1. Green API if explicitly configured
    if (settings.provider === 'greenapi' && settings.instanceId && settings.apiKey) {
      const url = `https://api.green-api.com/waInstance${settings.instanceId}/sendMessage/${settings.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: `${formattedPhone}@c.us`,
          message: message,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: `ההודעה נשלחה בהצלחה דרך Green API (ID: ${data.idMessage || 'ok'})` };
      }
      return { success: false, message: `שגיאה מ-Green API: ${data.message || res.statusText}` };
    }

    // 2. UltraMsg if explicitly configured
    if (settings.provider === 'ultramsg' && settings.instanceId && settings.apiKey) {
      const url = `https://api.ultramsg.com/${settings.instanceId}/messages/chat`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token: settings.apiKey,
          to: formattedPhone,
          body: message,
        }),
      });
      const data = await res.json();
      if (res.ok && data.sent === 'true') {
        return { success: true, message: 'ההודעה נשלחה בהצלחה דרך UltraMsg' };
      }
      return { success: false, message: `שגיאה מ-UltraMsg: ${data.error || 'נכשלה שליחה'}` };
    }

    // 3. Webhook / Make / Zapier if explicitly configured
    if (settings.provider === 'webhook' && settings.webhookUrl) {
      let eventName = 'appointment_booking_confirmation';
      if (reminderType === 'today') eventName = 'appointment_reminder_today';
      else if (reminderType === '1day') eventName = 'appointment_reminder_1day';
      else if (reminderType === '2hours') eventName = 'appointment_reminder_2h';

      const payload = {
        event: eventName,
        reminderType,
        recipientType,
        recipientPhone: formattedPhone,
        message,
        appointment: {
          id: appointment.id,
          customer_name: appointment.customer_name,
          customer_phone: appointment.customer_phone,
          service_name: appointment.service_name,
          price: appointment.price,
          appointment_date: appointment.appointment_date,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          notes: appointment.notes,
        },
        timestamp: new Date().toISOString(),
      };

      const res = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return { success: true, message: 'הבקשה נשלחה בהצלחה ל-Webhook!' };
      }
      return { success: false, message: `Webhook החזיר סטטוס שגיאה: ${res.status}` };
    }

    // 4. Primary: Backend Twilio Gateway (/api/whatsapp/send)
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: formattedPhone,
        message,
        provider: 'twilio',
        twilioAccountSid: settings.twilioAccountSid || undefined,
        twilioAuthToken: settings.twilioAuthToken || undefined,
        twilioPhoneNumber: settings.twilioPhoneNumber || undefined,
        twilioType: settings.twilioType || 'whatsapp',
        reminderType,
        appointment,
      }),
    });

    let data;
    try {
      data = await res.json();
    } catch (err) {
      console.warn('Failed to parse response:', err);
      return { success: false, message: `השרת החזיר תשובה לא חוקית (${res.status}). ייתכן ושגיאת התחברות.` };
    }

    if (res.ok && (data.success || data.data?.sid)) {
      const channel = settings.twilioType === 'sms' ? 'SMS' : 'WhatsApp';
      return {
        success: true,
        message: `התזכורת נשלחה אוטומטית בהצלחה דרך Twilio (${channel})! ⚡`,
      };
    }

    return {
      success: false,
      message: `שגיאה משרת Twilio: ${data.error || res.statusText}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.warn('[Auto Dispatch Twilio] Error:', errorMsg);
    return { success: false, message: `שגיאת תקשורת בשליחה: ${errorMsg}` };
  }
}

/**
 * Automatically dispatches booking confirmation to customer & owner immediately on reservation
 */
export async function autoDispatchAppointmentBooking(appointment: Appointment): Promise<void> {
  const settings = getStoredReminderSettings();
  if (!settings.enabled) return;

  const apptKey = String(appointment.id);
  const log = getSentRemindersLog();
  const entry = log[apptKey] || {};

  // 1. Send to Customer
  if (settings.notifyCustomerOnBookingDay && !entry.bookingCustomerSentAt) {
    const customerMsg = buildCustomerBookingConfirmationText(appointment);
    if (settings.provider !== 'direct' && isProviderConfigured(settings)) {
      await dispatchAutomatedWhatsAppApi({
        phone: appointment.customer_phone,
        message: customerMsg,
        settings,
        recipientType: 'customer',
        appointment,
        reminderType: 'booking',
      });
      markReminderSent(appointment.id, 'customer', 'booking');
    }
  }

  // 2. Send to Alex (Owner)
  if (settings.notifyAlexOnBooking && !entry.bookingAlexSentAt) {
    const alexMsg = buildAlexBookingText(appointment);
    if (settings.provider !== 'direct' && isProviderConfigured(settings)) {
      await dispatchAutomatedWhatsAppApi({
        phone: SALON_INFO.whatsappNumber,
        message: alexMsg,
        settings,
        recipientType: 'alex',
        appointment,
        reminderType: 'booking',
      });
      markReminderSent(appointment.id, 'alex', 'booking');
    }
  }
}

/**
 * Helper to get current Israel date and time parts
 */
export function getIsraelTimeParts(): { dateIso: string; hour: number; minute: number; totalMinutes: number } {
  const now = new Date();
  const optionsDate: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const optionsTime: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  const formatterDate = new Intl.DateTimeFormat('en-CA', optionsDate); // YYYY-MM-DD
  const dateIso = formatterDate.format(now);

  const formatterTime = new Intl.DateTimeFormat('en-GB', optionsTime);
  const timeStr = formatterTime.format(now);
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minStr, 10) || 0;
  const totalMinutes = hour * 60 + minute;

  return { dateIso, hour, minute, totalMinutes };
}

/**
 * Background auto-dispatch runner for pending reminders when their designated times arrive
 */
export async function autoDispatchAllPendingReminders(appointments: Appointment[]): Promise<void> {
  const settings = getStoredReminderSettings();
  if (!settings.enabled || !settings.autoSendEnabled) return;

  const log = getSentRemindersLog();
  const { hour, minute, totalMinutes } = getIsraelTimeParts();

  // 1. Parse Morning Reminder Target Time (default 08:00)
  const morningTimeStr = settings.morningReminderTime || '08:00';
  const [mornH, mornM] = morningTimeStr.split(':').map((v) => parseInt(v, 10) || 0);
  const targetMornTotalMinutes = mornH * 60 + mornM;
  const isMorningDue = totalMinutes >= targetMornTotalMinutes;

  // 2. Parse Evening Reminder Target Time (default 20:56)
  const eveningTimeStr = settings.eveningReminderTime || '20:56';
  const [eveH, eveM] = eveningTimeStr.split(':').map((v) => parseInt(v, 10) || 0);
  const targetEveTotalMinutes = eveH * 60 + eveM;
  const isEveningDue = totalMinutes >= targetEveTotalMinutes;

  for (const appt of appointments) {
    if (appt.status !== 'confirmed') continue;
    if (
      appt.customer_name.includes('🔒') ||
      appt.customer_name.includes('חופש') ||
      appt.customer_name.includes('חסימה') ||
      appt.price === 0
    ) {
      continue;
    }

    const apptKey = String(appt.id);
    const entry = log[apptKey] || {};

    // 1. Same-Day Morning Reminder (from configured hour onwards, e.g. 08:00 AM)
    if (
      isMorningDue &&
      isAppointmentToday(appt) &&
      settings.notifyCustomerToday &&
      !entry.customerTodaySentAt
    ) {
      const msg = buildCustomerTodayReminderText(appt);
      await dispatchAutomatedWhatsAppApi({
        phone: appt.customer_phone,
        message: msg,
        settings,
        recipientType: 'customer',
        appointment: appt,
        reminderType: 'today',
      });
      markReminderSent(appt.id, 'customer', 'today');
    }

    // 2. 1-Day Before Evening Reminder (from configured hour onwards, e.g. 20:56 PM)
    if (
      isEveningDue &&
      isAppointmentIn1DayReminderWindow(appt) &&
      settings.notifyCustomer1DayBefore &&
      !entry.customer1DaySentAt
    ) {
      const msg = buildCustomer1DayReminderText(appt);
      await dispatchAutomatedWhatsAppApi({
        phone: appt.customer_phone,
        message: msg,
        settings,
        recipientType: 'customer',
        appointment: appt,
        reminderType: '1day',
      });
      markReminderSent(appt.id, 'customer', '1day');
    }

    // 3. 2-Hours Before Reminder (in the alert window before appointment)
    if (
      settings.notifyCustomer2HoursBefore &&
      isAppointmentIn2HourAlertWindow(appt) &&
      !entry.customerSentAt
    ) {
      const msg = buildCustomerReminderText(appt);
      await dispatchAutomatedWhatsAppApi({
        phone: appt.customer_phone,
        message: msg,
        settings,
        recipientType: 'customer',
        appointment: appt,
        reminderType: '2hours',
      });
      markReminderSent(appt.id, 'customer', '2hours');
    }
  }
}


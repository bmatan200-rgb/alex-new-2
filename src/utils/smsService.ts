import { auth, db, getCurrentTenantId, tenantApi } from '../lib/firebase';
import { getCurrentSalonInfo, getStoredAdminSession } from './storage';

export interface SmsReminderSettings {
  enabled: boolean;
  autoSendEnabled: boolean;
  notifyCustomerToday: boolean;
  morningReminderTime: string; // HH:MM, default '08:00'
  notifyCustomer1DayBefore: boolean;
  eveningReminderTime: string; // HH:MM, default '20:00'
  morningTemplate: string;
  eveningTemplate: string;
  bookingConfirmationTemplate: string;
  telnyxApiKey?: string;
  telnyxFromNumber?: string;
}

export interface SmsLogEntry {
  id: string;
  recipientName: string;
  recipientPhone: string;
  messageText: string;
  channel: 'sms';
  status: 'sent' | 'failed' | 'queued' | 'sending' | 'delivered' | 'unconfirmed' | 'unknown';
  provider?: string;
  providerMessageId?: string;
  providerStatus?: string;
  deliveryCheckedAt?: string;
  deliveryAttention?: boolean;
  deliveryAttentionReason?: string;
  deliveryLookupError?: string;
  reminderType: 'morning_today' | 'evening_1day' | 'manual_single' | 'test';
  appointmentDate?: string;
  startTime?: string;
  sentAt: string;
  errorMessage?: string;
}

const STORAGE_KEY_SMS_SETTINGS = 'alex_sms_reminder_settings_v2';

export const DEFAULT_SMS_SETTINGS: SmsReminderSettings = {
  enabled: true,
  autoSendEnabled: true,
  notifyCustomerToday: true,
  morningReminderTime: '08:00',
  notifyCustomer1DayBefore: true,
  eveningReminderTime: '20:00',
  morningTemplate: `היי {customer_name} 🌸
תזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לבירור או שינוי: {phone}
נתראה! 💖`,
  eveningTemplate: `היי {customer_name} 🌸
תזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לשינוי או בירור: {phone}
מחכים לראותך! 💖`,
  bookingConfirmationTemplate: `היי {customer_name} 🌸
התור שלך נקבע בהצלחה לטיפול {service_name}! ✨
תאריך: {appointment_date} בשעה {start_time}
לבירורים: {phone}
נתראה! 💖`,
};

export function formatIsraeliPhoneToE164(phone: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('00972')) {
    cleaned = '972' + cleaned.slice(5);
  } else if (cleaned.startsWith('9720')) {
    cleaned = '972' + cleaned.slice(4);
  } else if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1);
  } else if (!cleaned.startsWith('972') && (cleaned.length === 9 || cleaned.length === 8)) {
    cleaned = '972' + cleaned;
  }
  return '+' + cleaned;
}

export function cleanPhoneForWhatsApp(phone: string): string {
  const e164 = formatIsraeliPhoneToE164(phone);
  return e164.replace(/\D/g, '');
}

/**
 * Creates direct 1-on-1 WhatsApp chat link with manager or customer
 */
export function createWhatsAppDirectLink(phone: string, text: string = ''): string {
  const cleanPhone = cleanPhoneForWhatsApp(phone || getCurrentSalonInfo().whatsappNumber);
  const encoded = encodeURIComponent(text);
  if (!encoded) {
    return `https://wa.me/${cleanPhone}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

export async function getAdminApiHeaders(): Promise<Record<string, string>> {
  const tid = getCurrentTenantId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tenant-id': tid,
  };

  try {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // ignore
  }

  return headers;
}

export function getStoredSmsSettings(): SmsReminderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SMS_SETTINGS + "__" + getCurrentTenantId());
    let parsed: any = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }

    // Also check legacy/whatsapp settings key for custom templates if not set in v2
    const legacyRaw = localStorage.getItem('alex_whatsapp_reminder_settings_v1' + "__" + getCurrentTenantId());
    let legacyParsed: any = {};
    if (legacyRaw) {
      try {
        legacyParsed = JSON.parse(legacyRaw);
      } catch {
        legacyParsed = {};
      }
    }

    const morningTemplate =
      parsed.morningTemplate ||
      legacyParsed.customerTodayTemplate ||
      DEFAULT_SMS_SETTINGS.morningTemplate;

    const eveningTemplate =
      parsed.eveningTemplate ||
      legacyParsed.customer1DayTemplate ||
      DEFAULT_SMS_SETTINGS.eveningTemplate;

    return {
      ...DEFAULT_SMS_SETTINGS,
      ...legacyParsed,
      ...parsed,
      morningTemplate,
      eveningTemplate,
      morningReminderTime: parsed.morningReminderTime || legacyParsed.morningReminderTime || '08:00',
      eveningReminderTime: parsed.eveningReminderTime || legacyParsed.eveningReminderTime || '20:00',
      notifyCustomerToday: parsed.notifyCustomerToday !== undefined ? parsed.notifyCustomerToday : (legacyParsed.notifyCustomerToday !== undefined ? legacyParsed.notifyCustomerToday : true),
      notifyCustomer1DayBefore: parsed.notifyCustomer1DayBefore !== undefined ? parsed.notifyCustomer1DayBefore : (legacyParsed.notifyCustomer1DayBefore !== undefined ? legacyParsed.notifyCustomer1DayBefore : true),
      autoSendEnabled: parsed.autoSendEnabled !== undefined ? parsed.autoSendEnabled : (legacyParsed.autoSendEnabled !== undefined ? legacyParsed.autoSendEnabled : true),
    };
  } catch {
    return DEFAULT_SMS_SETTINGS;
  }
}

export async function saveSmsSettings(settings: SmsReminderSettings): Promise<void> {
  try {
    // 1. Save to primary SMS settings key
    localStorage.setItem(STORAGE_KEY_SMS_SETTINGS + "__" + getCurrentTenantId(), JSON.stringify(settings));

    // 2. Also save to legacy WhatsApp/general reminder key to keep all views 100% in sync
    try {
      const legacyRaw = localStorage.getItem('alex_whatsapp_reminder_settings_v1' + "__" + getCurrentTenantId());
      const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : {};
      const updatedLegacy = {
        ...legacyParsed,
        customerTodayTemplate: settings.morningTemplate,
        customer1DayTemplate: settings.eveningTemplate,
        morningReminderTime: settings.morningReminderTime || '08:00',
        eveningReminderTime: settings.eveningReminderTime || '20:00',
        notifyCustomerToday: settings.notifyCustomerToday !== false,
        notifyCustomer1DayBefore: settings.notifyCustomer1DayBefore !== false,
        autoSendEnabled: settings.autoSendEnabled !== false,
        morningTemplate: settings.morningTemplate,
        eveningTemplate: settings.eveningTemplate,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('alex_whatsapp_reminder_settings_v1' + "__" + getCurrentTenantId(), JSON.stringify(updatedLegacy));
    } catch {
      // ignore
    }

    const payloadWithAliases = {
      ...settings,
      customerTodayTemplate: settings.morningTemplate,
      customer1DayTemplate: settings.eveningTemplate,
      updatedAt: new Date().toISOString(),
    };

    await tenantApi('/api/sms/settings', {settings:payloadWithAliases});
  } catch (err) {
    console.error('[SmsService] Save error:', err);
    throw err;
  }
}

export async function fetchServerSmsSettings(): Promise<SmsReminderSettings | null> {
  try {
    const headers = await getAdminApiHeaders();
    const res = await fetch('/api/sms/settings', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.settings) {
        const unifiedSettings: SmsReminderSettings = {
          ...DEFAULT_SMS_SETTINGS,
          ...data.settings,
          morningTemplate: data.settings.morningTemplate || data.settings.customerTodayTemplate || DEFAULT_SMS_SETTINGS.morningTemplate,
          eveningTemplate: data.settings.eveningTemplate || data.settings.customer1DayTemplate || DEFAULT_SMS_SETTINGS.eveningTemplate,
        };
        localStorage.setItem(STORAGE_KEY_SMS_SETTINGS + "__" + getCurrentTenantId(), JSON.stringify(unifiedSettings));

        try {
          const legacyRaw = localStorage.getItem('alex_whatsapp_reminder_settings_v1' + "__" + getCurrentTenantId());
          const legacyParsed = legacyRaw ? JSON.parse(legacyRaw) : {};
          localStorage.setItem(
            'alex_whatsapp_reminder_settings_v1' + "__" + getCurrentTenantId(),
            JSON.stringify({
              ...legacyParsed,
              ...unifiedSettings,
              customerTodayTemplate: unifiedSettings.morningTemplate,
              customer1DayTemplate: unifiedSettings.eveningTemplate,
            })
          );
        } catch {
          // ignore
        }

        return unifiedSettings;
      }
    }
  } catch (err) {
    console.warn('[SmsService] Fetch settings error:', err);
  }
  return null;
}

// Repeated clicks while the same request is running reuse its promise and ID.
const manualSmsInFlight = new Map<string, Promise<{success:boolean;error?:string;data?:any}>>();
function sendManualSmsRequest(endpoint: string, params: Record<string, unknown>) {
  const key=JSON.stringify([getCurrentTenantId(),endpoint,params]);
  const pending=manualSmsInFlight.get(key);
  if (pending) return pending;
  const requestId=crypto.randomUUID();
  const operation=(async()=>{
    try {
      const headers=await getAdminApiHeaders();
      const response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...params,requestId})});
      return await response.json();
    } catch {
      return {success:false,error:'תוצאת השליחה אינה ידועה עקב שגיאת תקשורת. בדוק ביומן SMS לפני שליחה נוספת'};
    } finally { manualSmsInFlight.delete(key); }
  })();
  manualSmsInFlight.set(key,operation);
  return operation;
}

export async function sendSingleSms(params: {
  phone: string;
  message: string;
  appointmentId?: string | number;
  customerName?: string;
  reminderType?: 'today' | '1day' | 'manual';
}): Promise<{success:boolean;error?:string;data?:any}> {
  return sendManualSmsRequest('/api/sms/send-single',params);
}

export async function triggerBatchSms(type: 'today' | '1day'): Promise<{
  success: boolean;
  message: string;
  sentCount?: number;
  totalDispatched?: number;
  results?: any[];
  error?: string;
}> {
  try {
    const headers = await getAdminApiHeaders();
    const res = await fetch('/api/sms/send-batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: 'שגיאת שרת', error: err?.message };
  }
}

export async function sendTestSms(phone: string, message: string): Promise<{success:boolean;error?:string;data?:any}> {
  return sendManualSmsRequest('/api/sms/test',{phone,message});
}

export async function fetchSmsLogs(): Promise<SmsLogEntry[]> {
  try {
    const headers = await getAdminApiHeaders();
    const res = await fetch('/api/sms/logs', { headers });
    if (res.ok) {
      const data = await res.json();
      return data.logs || [];
    }
  } catch (err) {
    console.warn('[SmsService] Fetch logs error:', err);
  }
  return [];
}

export async function checkSmsDelivery(logId: string): Promise<{success:boolean;log?:SmsLogEntry;error?:string}> {
  try {
    const headers=await getAdminApiHeaders();
    const response=await fetch(`/api/sms/logs/${encodeURIComponent(logId)}/check-delivery`,{method:'POST',headers});
    return await response.json();
  } catch { return {success:false,error:'לא ניתן לבדוק כרגע את המסירה. נסה שוב'}; }
}

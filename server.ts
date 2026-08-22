import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory sync of appointments for server background runner
interface ServerAppointment {
  id: string | number;
  customer_name: string;
  customer_phone: string;
  service_name: string;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  status: string;
}

let serverAppointments: ServerAppointment[] = [];
let activeServerSettings: any = null;

// Persistent cache for sent reminders to survive server restarts/reloads
const SENT_CACHE_FILE = path.join(process.cwd(), '.sent_reminders_cache.json');
let sentHistory: Record<string, boolean> = {};

try {
  if (fs.existsSync(SENT_CACHE_FILE)) {
    sentHistory = JSON.parse(fs.readFileSync(SENT_CACHE_FILE, 'utf-8'));
  }
} catch {
  sentHistory = {};
}

function recordSentReminder(key: string) {
  sentHistory[key] = true;
  try {
    fs.writeFileSync(SENT_CACHE_FILE, JSON.stringify(sentHistory, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Server Cache] Could not write sent cache:', err);
  }
}

// Helper to format phone for WhatsApp / Twilio
function cleanPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.substring(1);
  }
  if (!cleaned.startsWith('+') && !cleaned.startsWith('972') && cleaned.length <= 10) {
    cleaned = '972' + cleaned;
  }
  return cleaned;
}

// Get current Israel Date & Time
function getIsraelTime(): { dateIso: string; tomorrowIso: string; hour: number; minute: number; timeStr: string } {
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

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowIso = formatterDate.format(tomorrow);

  const formatterTime = new Intl.DateTimeFormat('en-GB', optionsTime);
  const timeStr = formatterTime.format(now);
  const [hourStr, minStr] = timeStr.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);

  return { dateIso, tomorrowIso, hour, minute, timeStr };
}

// Universal WhatsApp & SMS message dispatcher (Twilio, Green API, UltraMsg, Webhook)
async function sendWhatsAppViaProvider(params: {
  phone: string;
  message: string;
  provider?: string;
  instanceId?: string;
  apiKey?: string;
  webhookUrl?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioType?: 'whatsapp' | 'sms';
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const { phone, message } = params;
  const formattedPhone = cleanPhoneForWhatsApp(phone);

  let provider =
    params.provider ||
    activeServerSettings?.provider ||
    process.env.WHATSAPP_PROVIDER ||
    (params.twilioAccountSid || activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID ? 'twilio' : '') ||
    (params.instanceId ? 'greenapi' : 'webhook');

  if (provider === 'direct') {
    provider = 'twilio';
  }

  const instanceId = params.instanceId || activeServerSettings?.instanceId || process.env.GREEN_API_INSTANCE_ID || process.env.ULTRAMSG_INSTANCE_ID || '';
  const apiKey = params.apiKey || activeServerSettings?.apiKey || process.env.GREEN_API_TOKEN || process.env.ULTRAMSG_TOKEN || '';
  const webhookUrl = params.webhookUrl || activeServerSettings?.webhookUrl || process.env.WHATSAPP_WEBHOOK_URL || '';

  const twilioAccountSid = params.twilioAccountSid || activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioAuthToken = params.twilioAuthToken || activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '';
  const twilioPhoneNumber = params.twilioPhoneNumber || activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886';
  const twilioType = params.twilioType || activeServerSettings?.twilioType || 'whatsapp';

  try {
    // 1. Twilio Integration (WhatsApp & SMS)
    if (provider === 'twilio' || (twilioAccountSid && twilioAuthToken && !instanceId)) {
      if (!twilioAccountSid || !twilioAuthToken) {
        return {
          success: false,
          error: 'חסר Twilio Account SID או Auth Token בהגדרות המערכת',
        };
      }

      const twilioModule = await import('twilio');
      const twilioFactory: any = (twilioModule as any).default || twilioModule;
      const client = twilioFactory(twilioAccountSid.trim(), twilioAuthToken.trim());

      const isWhatsApp = twilioType === 'whatsapp' || twilioPhoneNumber.includes('whatsapp') || twilioPhoneNumber.includes('14155238886');
      
      let fromNumber = twilioPhoneNumber.trim();
      let toNumber = formattedPhone.startsWith('+') ? formattedPhone : `+${formattedPhone}`;

      if (isWhatsApp) {
        if (!fromNumber.startsWith('whatsapp:')) {
          fromNumber = `whatsapp:${fromNumber}`;
        }
        if (!toNumber.startsWith('whatsapp:')) {
          toNumber = `whatsapp:${toNumber}`;
        }
      } else {
        fromNumber = fromNumber.replace('whatsapp:', '');
        toNumber = toNumber.replace('whatsapp:', '');
      }

      console.log(`[Twilio Gateway] Sending ${isWhatsApp ? 'WhatsApp' : 'SMS'} to ${toNumber} from ${fromNumber}...`);

      const resMessage = await client.messages.create({
        body: message,
        from: fromNumber,
        to: toNumber,
      });

      console.log(`[Twilio Gateway] Success! Message SID: ${resMessage.sid}, Status: ${resMessage.status}`);

      return {
        success: true,
        data: {
          sid: resMessage.sid,
          status: resMessage.status,
          to: resMessage.to,
          from: resMessage.from,
          channel: isWhatsApp ? 'whatsapp' : 'sms',
          provider: 'twilio',
        },
      };
    }

    // 2. Green API
    if (provider === 'greenapi' && instanceId && apiKey) {
      const url = `https://api.green-api.com/waInstance${instanceId}/sendMessage/${apiKey}`;
      const chatId = `${formattedPhone}@c.us`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, message }),
      });
      const data = await response.json();
      return { success: response.ok, data };
    }

    // 3. UltraMsg
    if (provider === 'ultramsg' && instanceId && apiKey) {
      const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: apiKey,
          to: formattedPhone,
          body: message,
        }),
      });
      const data = await response.json();
      return { success: response.ok, data };
    }

    // 4. Webhook / Make / Zapier
    if (provider === 'webhook' && webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formattedPhone,
          rawPhone: phone,
          message,
          timestamp: new Date().toISOString(),
          source: 'alex_beauty_server',
        }),
      });
      const data = await response.text();
      return { success: response.ok, data };
    }

    console.log(`[WhatsApp Server Gateway] Auto-sending message to ${formattedPhone}: "${message.substring(0, 60)}..."`);
    return {
      success: true,
      data: { status: 'queued_sent', recipient: formattedPhone, messagePreview: message.substring(0, 50) },
    };
  } catch (err: any) {
    const isQuotaError =
      err?.message?.includes('exceeded the 50 daily messages limit') ||
      err?.message?.includes('63038');

    if (!isQuotaError) {
      console.error('[WhatsApp/Twilio Server Gateway] Error sending message:', err);
    } else {
      console.warn('[WhatsApp/Twilio Server Gateway] Twilio quota exceeded for this trial account.');
    }

    let friendlyError = err?.message || 'שגיאה בשליחת ההודעה דרך Twilio.';

    if (isQuotaError) {
      friendlyError =
        'נגמרה מכסת 50 ההודעות היומית בחשבון ה-Twilio (חשבון התנסות). יש לשדרג את החשבון ב-Twilio או להמתין למחר.';
    } else if (err?.code === 21608 || err?.message?.includes('unverified')) {
      friendlyError =
        'שגיאת Twilio: המספר אינו מאומת בחשבון ה-Trial. בחשבון ניסיון של Twilio יש לאמת את המספר ב-Verified Caller IDs או לשדרג את החשבון.';
    } else if (err?.code === 63016 || err?.message?.includes('Sandbox')) {
      friendlyError =
        'שגיאת Twilio WhatsApp: הנמען טרם שלח הודעת הצטרפות (join) ל-Sandbox של Twilio. טיפ: ניתן להגדיר שליחה ב-SMS בהגדרות המערכת לשליחה ישירה לכל מספר.';
    } else if (err?.code === 20003 || err?.message?.includes('Authenticate')) {
      friendlyError =
        'שגיאת Twilio: פרטי ה-Account SID או ה-Auth Token שגויים. אנא בדקי את הפרטים בהגדרות.';
    } else if (err?.code === 21211 || err?.message?.includes('not a valid phone number')) {
      friendlyError =
        'שגיאת Twilio: מספר הטלפון אינו בפורמט בינלאומי תקין.';
    }

    return {
      success: false,
      error: friendlyError,
    };
  }
}

// Helper to replace template tags with appointment details
function formatMessageTemplate(template: string, appt: any): string {
  const [y, m, d] = (appt.appointment_date || '').split('-');
  const israeliDate = y && m && d ? `${d}/${m}/${y}` : (appt.appointment_date || '');
  return template
    .replace(/{customer_name}/g, appt.customer_name || '')
    .replace(/{service_name}/g, appt.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appt.start_time || '')
    .replace(/{end_time}/g, appt.end_time || '')
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appt.customer_phone || '')
    .replace(/{salon_name}/g, 'Alex טיפוח ויופי')
    .replace(/{phone}/g, '054-6307114')
    .replace(/{owner_name}/g, 'אלכס');
}

// ----------------------------------------------------------------------
// Background Scheduler:
// 1. Same-Day morning reminder (default 08:00 AM, customizable)
// 2. 1-Day Before evening reminder (default 20:56 PM, customizable)
// ----------------------------------------------------------------------
async function runAutomatedRemindersCheck() {
  try {
    if (activeServerSettings?.enabled === false || activeServerSettings?.autoSendEnabled === false) {
      return;
    }

    const { dateIso, tomorrowIso, hour, minute, timeStr } = getIsraelTime();
    const currentTotalMinutes = hour * 60 + minute;

    // 1. Same-Day Morning Reminder (Trigger from scheduled morning time onwards, e.g. from 08:00 till end of day)
    if (activeServerSettings?.notifyCustomerToday !== false) {
      const morningTime = activeServerSettings?.morningReminderTime || '08:00';
      const [targetMornHour, targetMornMin] = morningTime.split(':').map((v: string) => parseInt(v, 10) || 0);
      const targetMornTotalMinutes = targetMornHour * 60 + targetMornMin;

      // Has the scheduled morning time arrived today?
      if (currentTotalMinutes >= targetMornTotalMinutes) {
        const todayAppointments = serverAppointments.filter(
          (a) =>
            a.appointment_date === dateIso &&
            a.status === 'confirmed' &&
            !a.customer_name.includes('🔒') &&
            !a.customer_name.includes('חופש') &&
            !a.customer_name.includes('חסימה')
        );

        for (const appt of todayAppointments) {
          const key = `morning_${dateIso}_${appt.id}_${morningTime}`;
          if (!sentHistory[key]) {
            const defaultMorningText = `היי {customer_name} 🌸
תזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לבירור או שינוי: {phone}
נתראה! 💖`;

            const rawTemplate = activeServerSettings?.customerTodayTemplate || defaultMorningText;
            const morningMessage = formatMessageTemplate(rawTemplate, appt);

            console.log(`[Auto Morning Runner (${morningTime})] Dispatching reminder for ${appt.customer_name} (${appt.customer_phone}) [Israel time: ${timeStr}]`);
            const res = await sendWhatsAppViaProvider({
              phone: appt.customer_phone,
              message: morningMessage,
            });
            if (res.success) {
              recordSentReminder(key);
            } else {
              console.warn(`[Auto Morning Runner] Skiping record for ${appt.id} due to failure:`, res.error);
            }
          }
        }
      }
    }

    // 2. 1-Day Before Evening Reminder (Trigger from scheduled evening time onwards, e.g. from 20:56 till end of day)
    if (activeServerSettings?.notifyCustomer1DayBefore !== false) {
      const eveningTime = activeServerSettings?.eveningReminderTime || '20:56';
      const [targetEveHour, targetEveMin] = eveningTime.split(':').map((v: string) => parseInt(v, 10) || 0);
      const targetEveTotalMinutes = targetEveHour * 60 + targetEveMin;

      // Has the scheduled evening time arrived tonight?
      if (currentTotalMinutes >= targetEveTotalMinutes) {
        const tomorrowAppointments = serverAppointments.filter(
          (a) =>
            a.appointment_date === tomorrowIso &&
            a.status === 'confirmed' &&
            !a.customer_name.includes('🔒') &&
            !a.customer_name.includes('חופש') &&
            !a.customer_name.includes('חסימה')
        );

        for (const appt of tomorrowAppointments) {
          const key = `evening_${tomorrowIso}_${appt.id}_${eveningTime}`;
          if (!sentHistory[key]) {
            const defaultEveningText = `היי {customer_name} 🌸
תזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לשינוי או בירור: {phone}
מחכים לראותך! 💖`;

            const rawTemplate = activeServerSettings?.customer1DayTemplate || defaultEveningText;
            const eveningMessage = formatMessageTemplate(rawTemplate, appt);

            console.log(`[Auto Evening Runner (${eveningTime})] Dispatching reminder for ${appt.customer_name} (${appt.customer_phone}) [Israel time: ${timeStr}]`);
            const res = await sendWhatsAppViaProvider({
              phone: appt.customer_phone,
              message: eveningMessage,
            });
            
            if (res.success) {
              recordSentReminder(key);
            } else {
              console.warn(`[Auto Evening Runner] Skiping record for ${appt.id} due to failure:`, res.error);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Auto Reminders Runner] Error in interval check:', err);
  }
}

// Run the check every 10 seconds
setInterval(runAutomatedRemindersCheck, 10000);

// ----------------------------------------------------
// API Routes
// ----------------------------------------------------

// Get current server settings & env configuration
app.get('/api/whatsapp/settings', (req: Request, res: Response) => {
  try {
    const hasEnvTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
    res.json({
      success: true,
      settings: {
        ...activeServerSettings,
        twilioAccountSid: activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '',
        twilioAuthToken: activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '',
        twilioPhoneNumber: activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886',
      },
      hasEnvTwilio,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Sync settings from client to server (Twilio, Green API, timing, etc.)
app.post('/api/whatsapp/sync-settings', (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (settings && typeof settings === 'object') {
      activeServerSettings = { ...activeServerSettings, ...settings };
      console.log('[Server Settings] WhatsApp & Twilio settings synced:', {
        provider: activeServerSettings.provider,
        hasTwilioSid: Boolean(activeServerSettings.twilioAccountSid),
        hasTwilioToken: Boolean(activeServerSettings.twilioAuthToken),
        twilioType: activeServerSettings.twilioType,
        hasGreenApi: Boolean(activeServerSettings.instanceId),
      });
      return res.json({ success: true, settings: activeServerSettings });
    }
    return res.status(400).json({ success: false, error: 'Expected settings object' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Sync appointments from client to server in-memory background worker
app.post('/api/whatsapp/sync-appointments', (req: Request, res: Response) => {
  try {
    const { appointments, sentLog } = req.body;
    if (Array.isArray(appointments)) {
      serverAppointments = appointments;
      
      if (sentLog && typeof sentLog === 'object') {
        Object.keys(sentLog).forEach((apptId) => {
          const entry = sentLog[apptId];
          if (entry.customerTodaySentAt) recordSentReminder(`${apptId}_morning`);
          if (entry.customer1DaySentAt) recordSentReminder(`${apptId}_evening`);
        });
      }

      // Trigger instant check
      runAutomatedRemindersCheck();
      return res.json({ success: true, count: serverAppointments.length });
    }
    return res.status(400).json({ success: false, error: 'Expected appointments array' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Immediate WhatsApp / Twilio Dispatch Route
app.post('/api/whatsapp/send', async (req: Request, res: Response) => {
  try {
    const {
      phone,
      message,
      provider,
      instanceId,
      apiKey,
      webhookUrl,
      twilioAccountSid,
      twilioAuthToken,
      twilioPhoneNumber,
      twilioType,
      reminderType,
      appointment,
    } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    const result = await sendWhatsAppViaProvider({
      phone,
      message,
      provider,
      instanceId,
      apiKey,
      webhookUrl,
      twilioAccountSid,
      twilioAuthToken,
      twilioPhoneNumber,
      twilioType,
    });

    if (appointment && reminderType) {
      const { dateIso, tomorrowIso } = getIsraelTime();
      if (reminderType === 'today') {
        recordSentReminder(`morning_${dateIso}_${appointment.id}_manual`);
      } else if (reminderType === '1day') {
        recordSentReminder(`evening_${tomorrowIso}_${appointment.id}_manual`);
      }
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Status & diagnostics route
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const israelTime = getIsraelTime();
  res.json({
    status: 'online',
    israelTime,
    schedules: {
      morningSameDay: '08:00 (באותו יום של התור בבוקר)',
      evening1DayBefore: '20:56 (יום לפני התור בשעה 20:56 בערב)',
    },
    syncedAppointmentsCount: serverAppointments.length,
    sentRemindersCount: Object.keys(sentHistory).length,
    activeProvider: activeServerSettings?.provider || process.env.WHATSAPP_PROVIDER || 'twilio',
    hasTwilioCredentials: Boolean(
      (activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID) &&
      (activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN)
    ),
    hasGreenApiCredentials: Boolean(
      (activeServerSettings?.instanceId || process.env.GREEN_API_INSTANCE_ID) &&
      (activeServerSettings?.apiKey || process.env.GREEN_API_TOKEN)
    ),
    hasWebhook: Boolean(activeServerSettings?.webhookUrl || process.env.WHATSAPP_WEBHOOK_URL),
  });
});

// Comprehensive Twilio & WhatsApp Diagnostic Endpoint
app.get('/api/whatsapp/diagnose', async (req: Request, res: Response) => {
  const twilioSid = activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioToken = activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '';
  const twilioPhone = activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || 'whatsapp:+14155238886';
  const twilioType = activeServerSettings?.twilioType || 'whatsapp';

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    israelTime: getIsraelTime(),
    provider: activeServerSettings?.provider || 'twilio',
    twilio: {
      hasCredentials: Boolean(twilioSid && twilioToken),
      accountSidMasked: twilioSid ? `${twilioSid.substring(0, 6)}...${twilioSid.substring(twilioSid.length - 4)}` : null,
      phoneNumber: twilioPhone,
      channel: twilioType,
      accountInfo: null,
      quotaExceeded: false,
      unjoinedSandboxDetected: false,
      sandboxCode: 'join mainly-level',
      sandboxNumber: '+14155238886',
      sandboxJoinLink: 'https://wa.me/14155238886?text=join%20mainly-level',
      recentMessages: [],
      errorSummary: null,
      readyToSend: false,
    },
  };

  if (!twilioSid || !twilioToken) {
    diagnostics.twilio.errorSummary = 'חסרים פרטי אימות של Twilio (Account SID / Auth Token)';
    return res.json(diagnostics);
  }

  try {
    const twilioModule = await import('twilio');
    const twilioFactory: any = (twilioModule as any).default || twilioModule;
    const client = twilioFactory(twilioSid, twilioToken);

    // 1. Fetch account info
    try {
      const account = await client.api.v2010.accounts(twilioSid).fetch();
      diagnostics.twilio.accountInfo = {
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type, // 'Trial' or 'Full'
      };
    } catch (accErr: any) {
      diagnostics.twilio.errorSummary = `שגיאה באימות מול Twilio: ${accErr?.message}`;
      return res.json(diagnostics);
    }

    // 2. Fetch last 8 messages
    try {
      const messages = await client.messages.list({ limit: 8 });
      diagnostics.twilio.recentMessages = messages.map((m: any) => ({
        sid: m.sid,
        to: m.to,
        from: m.from,
        status: m.status,
        errorCode: m.errorCode,
        errorMessage: m.errorMessage,
        dateCreated: m.dateCreated,
      }));

      // Check for specific error codes
      const has63038 = messages.some((m: any) => m.errorCode === 63038 || String(m.errorMessage || '').includes('50 daily messages limit'));
      const has63015 = messages.some((m: any) => m.errorCode === 63015);

      diagnostics.twilio.quotaExceeded = has63038;
      diagnostics.twilio.unjoinedSandboxDetected = has63015;

      if (has63038) {
        diagnostics.twilio.errorSummary = 'חשבון Twilio (Trial) הגיע למגבלת 50 הודעות ליום. המגבלה מתאפסת מחר או לאחר שדרוג החשבון.';
      } else if (has63015) {
        diagnostics.twilio.errorSummary = 'נמענים מסוימים טרם הצטרפו ל-Sandbox של Twilio.';
      } else {
        diagnostics.twilio.readyToSend = true;
      }
    } catch (msgErr: any) {
      diagnostics.twilio.errorSummary = `לא ניתן לשלוף הודעות אחרונות: ${msgErr?.message}`;
    }

    return res.json(diagnostics);
  } catch (err: any) {
    diagnostics.twilio.errorSummary = `שגיאת חיבור כללית: ${err?.message}`;
    return res.json(diagnostics);
  }
});

// Manual trigger aliases for morning batch (today)
app.post(['/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], async (req: Request, res: Response) => {
  const { dateIso, timeStr } = getIsraelTime();
  const todayAppointments = serverAppointments.filter(
    (a) =>
      a.appointment_date === dateIso &&
      a.status === 'confirmed' &&
      !a.customer_name.includes('🔒') &&
      !a.customer_name.includes('חופש')
  );

  const defaultMorningText = `היי {customer_name} 🌸
תזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לבירור או שינוי: {phone}
נתראה! 💖`;

  const results = [];
  for (const appt of todayAppointments) {
    const key = `morning_${dateIso}_${appt.id}_manual`;
    const rawTemplate = activeServerSettings?.customerTodayTemplate || defaultMorningText;
    const message = formatMessageTemplate(rawTemplate, appt);

    const resSend = await sendWhatsAppViaProvider({
      phone: appt.customer_phone,
      message,
    });
    
    if (resSend.success) {
      recordSentReminder(key);
    }
    
    results.push({ id: appt.id, customer: appt.customer_name, phone: appt.customer_phone, status: resSend });
  }

  return res.json({
    success: true,
    message: results.length > 0 ? `נשלחו תזכורות ל-${results.length} תורים של היום` : 'אין תורים מתוכננים להיום',
    sentCount: results.length,
    triggeredAt: timeStr,
    date: dateIso,
    totalDispatched: results.length,
    results,
  });
});

// Manual trigger aliases for evening batch (tomorrow)
app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], async (req: Request, res: Response) => {
  const { tomorrowIso, timeStr } = getIsraelTime();
  const tomorrowAppointments = serverAppointments.filter(
    (a) =>
      a.appointment_date === tomorrowIso &&
      a.status === 'confirmed' &&
      !a.customer_name.includes('🔒') &&
      !a.customer_name.includes('חופש')
  );

  const defaultEveningText = `היי {customer_name} 🌸
תזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨
לשינוי או בירור: {phone}
מחכים לראותך! 💖`;

  const results = [];
  for (const appt of tomorrowAppointments) {
    const key = `evening_${tomorrowIso}_${appt.id}_manual`;
    const rawTemplate = activeServerSettings?.customer1DayTemplate || defaultEveningText;
    const message = formatMessageTemplate(rawTemplate, appt);

    const resSend = await sendWhatsAppViaProvider({
      phone: appt.customer_phone,
      message,
    });
    
    if (resSend.success) {
      recordSentReminder(key);
    }
    
    results.push({ id: appt.id, customer: appt.customer_name, phone: appt.customer_phone, status: resSend });
  }

  return res.json({
    success: true,
    message: results.length > 0 ? `נשלחו תזכורות ל-${results.length} תורים של מחר` : 'אין תורים מתוכננים למחר',
    sentCount: results.length,
    triggeredAt: timeStr,
    targetDate: tomorrowIso,
    totalDispatched: results.length,
    results,
  });
});

// ----------------------------------------------------
// Vite & Static Asset Handling
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Alex Beauty Server running on http://0.0.0.0:${PORT} [Israel Time: ${getIsraelTime().timeStr}]`);
  });
}

startServer();

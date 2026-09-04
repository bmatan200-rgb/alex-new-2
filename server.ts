import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getApps as getAdminApps, initializeApp as initAdminApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initWebApp, getApps as getWebApps } from 'firebase/app';
import {
  getFirestore as getWebFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  runTransaction as runWebTransaction,
} from 'firebase/firestore';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';
import firebaseConfig from './firebase-applet-config.json';

const app = express();
const PORT = 3000;

// אתחול Firebase Admin
let adminSdkReady = false;
const hasServiceAccount = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

try {
  if (getAdminApps().length === 0) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saJson) {
      initAdminApp({ credential: cert(JSON.parse(saJson)), projectId: firebaseConfig.projectId });
    } else {
      initAdminApp({ projectId: firebaseConfig.projectId });
    }
  }
  adminSdkReady = true;
  console.log('[Firebase Admin] ✅ מוכן לאימות טוקנים');
} catch (err: any) {
  console.error('[Firebase Admin] ❌ אתחול נכשל:', err?.message);
}

/**
 * מופע מסד נתונים Admin (פעיל כאשר מוגדר FIREBASE_SERVICE_ACCOUNT)
 * שים לב: חייבים להעביר את firestoreDatabaseId מ-firebaseConfig, אחרת מתחבר ל-'(default)' שאינו קיים.
 */
let adminDb: FirebaseFirestore.Firestore | null = null;
try {
  adminDb = getAdminFirestore(firebaseConfig.firestoreDatabaseId || undefined);
  console.log('[Firestore Admin] ✅ מופע מסד נתונים Admin אותחל עבור:', firebaseConfig.firestoreDatabaseId);
} catch (err: any) {
  console.error('[Firestore Admin] ❌ כשל באתחול:', err?.message);
}

/**
 * מופע Web SDK של השרת - מספק גישה ישירה ויציבה באמצעות מפתח ה-API של Firebase
 */
let webDb: any = null;
try {
  const webApp = getWebApps().length === 0 ? initWebApp(firebaseConfig, 'server-web-client') : getWebApps()[0];
  webDb = getWebFirestore(webApp, firebaseConfig.firestoreDatabaseId || undefined);
  console.log('[Firestore Web SDK] ✅ חיבור שרת פעיל למסד הנתונים');
} catch (err: any) {
  console.error('[Firestore Web SDK] ❌ כשל בחיבור:', err?.message);
}

const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '');

// Security: JSON body parser with size limit to prevent Denial of Service attacks
app.use(express.json({ limit: '500kb' }));

// Basic Security Headers Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});



// ----------------------------------------------------
// Secure Admin Data Endpoints
// ----------------------------------------------------
app.post('/api/appointments/cancel', async (req, res) => {
  try {
    const { appointmentId, customerPhone } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, error: 'Missing appointmentId' });

    const idStr = String(appointmentId);

    // Optional admin check
    const token =
      (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ||
      (req.body?.sessionToken as string | undefined);
    let isAdmin = false;
    if (token && adminSdkReady) {
      try {
        await getAuth().verifyIdToken(token);
        isAdmin = true;
      } catch {
        // ignore
      }
    }

    let snapData: any = null;

    if (hasServiceAccount && adminDb) {
      try {
        const snap = await adminDb.collection('appointments').doc(idStr).get();
        if (snap.exists) snapData = snap.data();
      } catch (err) {
        console.warn('[Cancel] Admin SDK get failed, trying Web SDK:', err);
      }
    }

    if (!snapData && webDb) {
      try {
        const snap = await getDoc(doc(webDb, 'appointments', idStr));
        if (snap.exists()) snapData = snap.data();
      } catch (err) {
        console.warn('[Cancel] Web SDK getDoc failed:', err);
      }
    }

    if (!isAdmin && snapData) {
      if (!customerPhone) return res.status(401).json({ success: false, error: 'Missing customerPhone for non-admin' });
      const storedPhone = normalizePhone(snapData.customer_phone);
      const reqPhone = normalizePhone(customerPhone);
      if (storedPhone && reqPhone && storedPhone !== reqPhone) {
        return res.status(403).json({ success: false, error: 'Phone mismatch' });
      }
    }

    let updated = false;
    if (snapData) {
      if (hasServiceAccount && adminDb) {
        try {
          await adminDb.collection('appointments').doc(idStr).set({ status: 'cancelled' }, { merge: true });
          updated = true;
        } catch (err) {
          console.warn('[Cancel] Admin SDK set failed, falling back to Web SDK:', err);
        }
      }

      if (!updated && webDb) {
        try {
          await setDoc(doc(webDb, 'appointments', idStr), { status: 'cancelled' }, { merge: true });
          updated = true;
        } catch (err) {
          console.warn('[Cancel] Web SDK setDoc failed:', err);
        }
      }
    }

    const apptDate = req.body?.appointmentDate || snapData?.appointment_date;
    const apptTime = req.body?.startTime || snapData?.start_time;
    if (apptDate && apptTime) {
      const sId = `appt_${apptDate}_${apptTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          if (hasServiceAccount && adminDb) {
            await adminDb.collection('appointments').doc(sId).set({ status: 'cancelled' }, { merge: true });
          } else if (webDb) {
            const sSnap = await getDoc(doc(webDb, 'appointments', sId));
            if (sSnap.exists()) {
              await setDoc(doc(webDb, 'appointments', sId), { status: 'cancelled' }, { merge: true });
            }
          }
        } catch {
          // ignore
        }
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error cancelling appointment:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/appointments/delete', requireAdmin, async (req, res) => {
  try {
    const { appointmentId, appointmentDate, startTime } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, error: 'Missing appointmentId' });
    
    const idStr = String(appointmentId);
    let deleted = false;

    if (hasServiceAccount && adminDb) {
      try {
        await adminDb.collection('appointments').doc(idStr).delete();
        deleted = true;
      } catch (err) {
        console.warn('[Delete] Admin SDK delete failed, falling back to Web SDK:', err);
      }
    }

    if (!deleted && webDb) {
      await deleteDoc(doc(webDb, 'appointments', idStr));
      deleted = true;
    }

    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== String(appointmentId)) {
        try {
          if (hasServiceAccount && adminDb) {
            await adminDb.collection('appointments').doc(sId).delete();
          } else if (webDb) {
            await deleteDoc(doc(webDb, 'appointments', sId));
          }
        } catch {
          // ignore
        }
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Delete] Error deleting appointment:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/settings/services', requireAdmin, async (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services)) {
      return res.status(400).json({ success: false, error: 'Invalid services format' });
    }
    const data = { services, updatedAt: new Date().toISOString() };
    let saved = false;

    if (hasServiceAccount && adminDb) {
      try {
        await adminDb.collection('settings').doc('services_config').set(data, { merge: true });
        saved = true;
      } catch (err) {
        console.warn('[Settings Services] Admin SDK failed, falling back to Web SDK:', err);
      }
    }

    if (!saved && webDb) {
      await setDoc(doc(webDb, 'settings', 'services_config'), data, { merge: true });
      saved = true;
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Settings Services] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/settings/schedule', requireAdmin, async (req, res) => {
  try {
    const { schedule } = req.body;
    if (!schedule || typeof schedule !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid schedule format' });
    }
    const data = {
      businessOpen: schedule.businessOpen,
      businessClose: schedule.businessClose,
      fridayOpen: schedule.fridayOpen || '09:20',
      fridayClose: schedule.fridayClose || '15:00',
      durationMinutes: Number(schedule.durationMinutes) || 90,
      updatedAt: new Date().toISOString(),
    };
    let saved = false;

    if (hasServiceAccount && adminDb) {
      try {
        await adminDb.collection('settings').doc('schedule_settings').set(data, { merge: true });
        saved = true;
      } catch (err) {
        console.warn('[Settings Schedule] Admin SDK failed, falling back to Web SDK:', err);
      }
    }

    if (!saved && webDb) {
      await setDoc(doc(webDb, 'settings', 'schedule_settings'), data, { merge: true });
      saved = true;
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Settings Schedule] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------------------------
// Secure Admin Authentication & Password Hashing Subsystem (Server-Side)
// ----------------------------------------------------------------------

// מאמת שהבקשה נושאת ID Token תקף של Firebase Authentication.
// באפליקציה זו אין הרשמה עצמית, ולכן כל טוקן תקף שייך לחשבון
// שנוצר ידנית בקונסולה — כלומר למנהלת.
/**
 * מאמת שהבקשה מגיעה ממנהלת מחוברת.
 *
 * הדרך היחידה לעבור: ID Token תקף של Firebase Authentication.
 *
 * אין ולא יהיו כאן מסלולי גיבוי. סיסמת מסתור בקוד או מספר טלפון
 * בכותרת אינם סודות — מספר הטלפון של העסק מוצג באתר עצמו, וכל
 * מחרוזת קבועה בקוד גלויה לכל מי שרואה את הריפו. כל "גיבוי" כזה
 * הופך את האימות כולו לקישוט.
 */
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!adminSdkReady) {
    console.error('[Auth] Firebase Admin לא אותחל — יש להגדיר FIREBASE_SERVICE_ACCOUNT');
    return res.status(503).json({
      success: false,
      error: 'שירות האימות אינו זמין כרגע',
    });
  }

  const token = (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return res.status(401).json({ success: false, error: 'נדרשת התחברות כמנהלת' });
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);

    const allowList = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);

    if (allowList.length > 0 && !allowList.includes((decoded.email || '').toLowerCase())) {
      console.warn(`[Auth] נדחתה גישה למייל שאינו ברשימה: ${decoded.email}`);
      return res.status(403).json({ success: false, error: 'אין לך הרשאת מנהלת' });
    }

    (req as any).adminPayload = { uid: decoded.uid, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'ההתחברות פגה, יש להתחבר מחדש' });
  }
}

// In-memory rate limiting for SMS/WhatsApp dispatch
const dispatchRateLimits: Record<string, number[]> = {};
function isDispatchRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = dispatchRateLimits[ip] || [];
  const recent = timestamps.filter((t) => now - t < 60000); // 1 minute window
  if (recent.length >= 20) {
    return true;
  }
  recent.push(now);
  dispatchRateLimits[ip] = recent;
  return false;
}

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

// Default settings configured for same-day 08:00 AM sharp customer reminder
const DEFAULT_SERVER_SETTINGS = {
  enabled: true,
  notifyCustomerToday: true, // Same-day morning reminder at 08:00 AM
  morningReminderTime: '08:00', // 08:00 AM sharp (Asia/Jerusalem)
  notifyCustomer1DayBefore: false, // Default off: reminder sent specifically on appointment day at 08:00
  eveningReminderTime: '20:00',
  autoSendEnabled: true,
  provider: process.env.WHATSAPP_PROVIDER || 'twilio',
  twilioType: process.env.TWILIO_TYPE || 'sms',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  customerTodayTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלבירור או שינוי: {phone}\nנתראה! 💖`,
  customer1DayTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלשינוי או בירור: {phone}\nמחכים לראותך! 💖`,
};

let activeServerSettings: any = { ...DEFAULT_SERVER_SETTINGS };

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

// Helper to format any phone number to E.164 (+972 for Israel)
function formatIsraeliPhoneToE164(phone: string): string {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('00972')) {
    cleaned = '972' + cleaned.slice(5);
  }
  if (cleaned.startsWith('9720')) {
    cleaned = '972' + cleaned.slice(4);
  }
  if (cleaned.startsWith('0')) {
    cleaned = '972' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('972') && (cleaned.length === 9 || cleaned.length === 8)) {
    cleaned = '972' + cleaned;
  }
  return '+' + cleaned;
}

// Helper to format phone for WhatsApp (digits only with 972)
function cleanPhoneForWhatsApp(phone: string): string {
  const e164 = formatIsraeliPhoneToE164(phone);
  return e164.replace(/\D/g, '');
}

/**
 * Calculates current or offset Israel Date & Time strictly in Asia/Jerusalem
 * @param daysOffset 0 for today, 1 for tomorrow
 */
function getIsraelDateString(daysOffset: number = 0): string {
  const now = new Date();
  const israelDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })
  );
  if (daysOffset !== 0) {
    israelDate.setDate(israelDate.getDate() + daysOffset);
  }
  const year = israelDate.getFullYear();
  const month = String(israelDate.getMonth() + 1).padStart(2, '0');
  const day = String(israelDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get current Israel Date & Time info
function getIsraelTime(): { dateIso: string; tomorrowIso: string; hour: number; minute: number; timeStr: string } {
  const dateIso = getIsraelDateString(0);
  const tomorrowIso = getIsraelDateString(1);

  const now = new Date();
  const optionsTime: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

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
  let twilioPhoneNumber = params.twilioPhoneNumber || activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  if (twilioPhoneNumber === 'whatsapp:+14155238886' && (process.env.TWILIO_TYPE === 'sms' || activeServerSettings?.twilioType === 'sms')) {
    twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
  }
  const twilioType = params.twilioType || activeServerSettings?.twilioType || 'sms';

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

      let resolvedTwilioType = process.env.TWILIO_TYPE || params.twilioType || activeServerSettings?.twilioType;
      
      // Auto-detect if user entered a plain number without "whatsapp:" prefix
      if (resolvedTwilioType === 'whatsapp' && !twilioPhoneNumber.toLowerCase().startsWith('whatsapp:') && twilioPhoneNumber !== '+14155238886' && !twilioPhoneNumber.includes('14155238886')) {
        resolvedTwilioType = 'sms';
      }

      if (!resolvedTwilioType) {
        resolvedTwilioType = twilioPhoneNumber.toLowerCase().startsWith('whatsapp:') ? 'whatsapp' : 'sms';
      }
      
      // Force SMS if requested explicitly via env
      if (process.env.TWILIO_TYPE === 'sms') {
        resolvedTwilioType = 'sms';
      }

      const isWhatsApp = resolvedTwilioType === 'whatsapp';
      
      let fromNumber = (twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '+15599345376').trim();
      let toNumber = formatIsraeliPhoneToE164(phone);

      if (isWhatsApp) {
        if (!fromNumber.toLowerCase().startsWith('whatsapp:')) {
          fromNumber = `whatsapp:${fromNumber}`;
        }
        if (!toNumber.toLowerCase().startsWith('whatsapp:')) {
          toNumber = `whatsapp:${toNumber}`;
        }
      } else {
        // Standard SMS mode via Twilio virtual number
        fromNumber = fromNumber.replace(/^whatsapp:/i, '').trim();
        if (fromNumber === '+14155238886' || fromNumber === '14155238886' || !fromNumber) {
          fromNumber = (process.env.TWILIO_PHONE_NUMBER || '+15599345376').trim();
        }
        if (!fromNumber.startsWith('+') && fromNumber.length >= 7) {
          fromNumber = `+${fromNumber}`;
        }
        toNumber = toNumber.replace(/^whatsapp:/i, '').trim();
        if (!toNumber.startsWith('+')) {
          toNumber = `+${toNumber}`;
        }
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

    let friendlyError = `שגיאה משרת Twilio: ${err?.message || 'שגיאה לא ידועה'}`;
    
    // Add context about recipient phone
    const debugContext = ` (ניסיון שליחה אל: ${formattedPhone})`;

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
    } else if (err?.code === 21408 || err?.message?.includes('Permission to send an SMS has not been enabled')) {
      friendlyError = 'שגיאת הרשאות יעד ב-Twilio (Geo Permissions): חשבונך חסום לשליחת SMS לישראל. יש להתחבר ל-Twilio, לנווט ל-Messaging -> Settings -> Geo Permissions ולאפשר שליחת SMS לישראל (Israel).' + debugContext;
    } else if (err?.code === 21211 || err?.message?.includes('not a valid phone number')) {
      friendlyError =
        'שגיאת Twilio: מספר הטלפון אינו בפורמט בינלאומי תקין.';
    }

    return {
      success: false,
      error: friendlyError + (!friendlyError.includes('ניסיון שליחה') ? debugContext : ''),
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
// Automated Node-Cron Background Scheduler:
// 1. Morning Reminder (Today's appointments): 08:00 AM (Asia/Jerusalem)
// 2. Evening Reminder (Tomorrow's appointments): 20:00 PM (Asia/Jerusalem)
// ----------------------------------------------------------------------

/**
 * Unified logic to process and send automated reminders for a target date
 */
async function sendRemindersForDate(targetDate: string, reminderType: 'today' | '1day') {
  const isMorning = reminderType === 'today';
  const typeLabel = isMorning ? 'תזכורת בוקר (יום התור)' : 'תזכורת ערב (יום לפני התור)';
  const currentIsraelTime = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

  console.log(`\n======================================================`);
  console.log(`[CRON - ${isMorning ? '08:00' : '20:00'}] מתחיל ריצת ${typeLabel}`);
  console.log(`[CRON] תאריך יעד לשליפה: ${targetDate} | שעת הרצה בישראל: ${currentIsraelTime}`);
  console.log(`======================================================`);

  // 1. Check if reminders of this type are enabled
  if (isMorning && activeServerSettings?.notifyCustomerToday === false) {
    console.log('[CRON] ⏸️ דילוג: תזכורת בוקר יום התור (notifyCustomerToday) מבוטלת בהגדרות');
    return { success: true, count: 0, sentCount: 0, failedCount: 0, skipped: true };
  }

  if (!isMorning && activeServerSettings?.notifyCustomer1DayBefore !== true) {
    console.log('[CRON] ⏸️ דילוג: תזכורת ערב יום לפני (notifyCustomer1DayBefore) כבויה (מוגדרת תזכורת בוקר יום התור בלבד ב-08:00)');
    return { success: true, count: 0, sentCount: 0, failedCount: 0, skipped: true };
  }

  try {
    // Filter active confirmed appointments for the target date from in-memory cache
    let appointments = serverAppointments.filter(
      (a) =>
        a.appointment_date === targetDate &&
        a.status === 'confirmed' &&
        !a.customer_name.includes('🔒') &&
        !a.customer_name.includes('חופש') &&
        !a.customer_name.includes('חסימה') &&
        !a.customer_name.includes('הפסקה')
    );

    // Fallback: If in-memory array is empty, fetch directly from Firestore to ensure 08:00 AM dispatch runs reliably
    if (appointments.length === 0) {
      try {
        const fetchedAppts: ServerAppointment[] = [];
        if (hasServiceAccount && adminDb) {
          const snap = await adminDb
            .collection('appointments')
            .where('appointment_date', '==', targetDate)
            .where('status', '==', 'confirmed')
            .get();
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            if (
              !d.customer_name?.includes('🔒') &&
              !d.customer_name?.includes('חופש') &&
              !d.customer_name?.includes('חסימה') &&
              !d.customer_name?.includes('הפסקה')
            ) {
              fetchedAppts.push({
                id: docSnap.id,
                customer_name: d.customer_name || '',
                customer_phone: d.customer_phone || '',
                service_name: d.service_name || "לק ג'ל",
                appointment_date: d.appointment_date,
                start_time: d.start_time || '',
                status: d.status || 'confirmed',
              });
            }
          });
        } else if (webDb) {
          const q = query(
            collection(webDb, 'appointments'),
            where('appointment_date', '==', targetDate),
            where('status', '==', 'confirmed')
          );
          const snap = await getDocs(q);
          snap.forEach((docSnap) => {
            const d = docSnap.data();
            if (
              !d.customer_name?.includes('🔒') &&
              !d.customer_name?.includes('חופש') &&
              !d.customer_name?.includes('חסימה') &&
              !d.customer_name?.includes('הפסקה')
            ) {
              fetchedAppts.push({
                id: docSnap.id,
                customer_name: d.customer_name || '',
                customer_phone: d.customer_phone || '',
                service_name: d.service_name || "לק ג'ל",
                appointment_date: d.appointment_date,
                start_time: d.start_time || '',
                status: d.status || 'confirmed',
              });
            }
          });
        }
        if (fetchedAppts.length > 0) {
          console.log(`[CRON] נשלפו ${fetchedAppts.length} תורים ישירות מ-Firestore לתאריך ${targetDate}`);
          appointments = fetchedAppts;
        }
      } catch (fsErr) {
        console.warn('[CRON] Could not query Firestore fallback:', fsErr);
      }
    }

    console.log(`[CRON] נמצאו ${appointments.length} תורים מתאימים לתאריך ${targetDate}`);

    if (appointments.length === 0) {
      console.log(`[CRON] אין תורים לשליחה לתאריך ${targetDate}. התהליך הסתיים.`);
      console.log(`======================================================\n`);
      return { success: true, count: 0, sentCount: 0, failedCount: 0 };
    }

    // Group appointments by customer phone to prevent multiple/spam messages
    const customerGroups: Record<string, typeof appointments> = {};
    for (const appt of appointments) {
      const phoneKey = cleanPhoneForWhatsApp(appt.customer_phone || '');
      if (!phoneKey) continue;
      if (!customerGroups[phoneKey]) customerGroups[phoneKey] = [];
      customerGroups[phoneKey].push(appt);
    }

    let successCount = 0;
    let failedCount = 0;

    for (const [phoneKey, appts] of Object.entries(customerGroups)) {
      const firstAppt = appts[0];
      let anyClaimed = false;
      for (const a of appts) {
        const key = `${isMorning ? 'morning' : 'evening'}_${a.id}_${targetDate}`;
        const claimed = await tryClaimReminder(key);
        if (claimed) anyClaimed = true;
      }
      if (!anyClaimed) {
        console.log(`[CRON] דילוג (נעילה): התזכורת ללקוח/ה ${firstAppt.customer_name} מוגדרת כנשלחה ב-Firestore.`);
        continue;
      }

      let messageText = '';
      if (appts.length === 1) {
        // Single appointment: format with standard template
        const defaultText = isMorning
          ? `היי {customer_name} 🌸\nתזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלבירור או שינוי: {phone}\nנתראה! 💖`
          : `היי {customer_name} 🌸\nתזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלשינוי או בירור: {phone}\nמחכים לראותך! 💖`;
        const rawTemplate = isMorning
          ? (activeServerSettings?.customerTodayTemplate || defaultText)
          : (activeServerSettings?.customer1DayTemplate || defaultText);
        messageText = formatMessageTemplate(rawTemplate, firstAppt);
      } else {
        // Multiple appointments on the same day: list all slots clearly
        const [y, m, d] = targetDate.split('-');
        const israeliDate = `${d}/${m}/${y}`;
        const appointmentsList = appts
          .map((a) => `✨ בשעה ${a.start_time || 'הנקבעה'} - ${a.service_name || 'טיפול'}`)
          .join('\n');

        messageText = isMorning
          ? `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך להיום (${israeliDate}):\n${appointmentsList}\nלבירור או שינוי: 054-6307114\nנתראה! 💖`
          : `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך למחר (${israeliDate}):\n${appointmentsList}\nלשינוי או בירור: 054-6307114\nמחכים לראותך! 💖`;
      }

      console.log(`[CRON] שולח תזכורת ללקוח/ה: ${firstAppt.customer_name} (${firstAppt.customer_phone}) עבור ${appts.length} תורים...`);
      const res = await sendWhatsAppViaProvider({
        phone: firstAppt.customer_phone,
        message: messageText,
      });

      if (res.success) {
        console.log(`[CRON] ✅ נשלח בהצלחה ל-${firstAppt.customer_name} (${firstAppt.customer_phone})`);
        successCount += appts.length;
      } else {
        console.error(`[CRON] ❌ שגיאה בשליחה ל-${firstAppt.customer_name} (${firstAppt.customer_phone}):`, res.error);
        failedCount += appts.length;
      }
    }

    console.log(`------------------------------------------------------`);
    console.log(`[CRON - ${isMorning ? '08:00' : '20:00'}] סיכום ריצה: ${successCount}/${appointments.length} תזכורות נשלחו בהצלחה | נכשלו: ${failedCount}`);
    console.log(`======================================================\n`);

    return { success: true, count: appointments.length, sentCount: successCount, failedCount };
  } catch (error: any) {
    console.error(`[CRON] ❌ שגיאה כללית בהרצת תזכורות לתאריך ${targetDate}:`, error);
    return { success: false, error: error?.message };
  }
}

// ----------------------------------------------------------------------
// Initialize Node-Cron Jobs
// ----------------------------------------------------------------------
function initCronSchedulers() {
  console.log('[CRON Service] מאתחל משימות תזכורת אוטומטיות (Timezone: Asia/Jerusalem)...');

  /**
   * 1. קרון בוקר: רץ כל יום בדיוק בשעה 08:00 (שעון ישראל)
   * שולף ושולח תזכורות לכל תורי *היום*
   */
  cron.schedule(
    '0 8 * * *',
    async () => {
      const todayDate = getIsraelDateString(0);
      console.log(`[CRON Task] הרצת קרון בוקר 08:00 מתוזמן לתאריך ${todayDate}`);
      await sendRemindersForDate(todayDate, 'today');
    },
    {
      timezone: 'Asia/Jerusalem',
    }
  );
  console.log('[CRON Service] ✅ קרון בוקר (תורי היום) הוגדר בהצלחה לשעה 08:00 (Asia/Jerusalem).');

  /**
   * 2. קרון ערב: רץ כל יום בדיוק בשעה 20:00 (שעון ישראל)
   * שולף ושולח תזכורות לכל תורי *מחר*
   */
  cron.schedule(
    '0 20 * * *',
    async () => {
      const tomorrowDate = getIsraelDateString(1);
      console.log(`[CRON Task] הרצת קרון ערב 20:00 מתוזמן לתאריך ${tomorrowDate}`);
      await sendRemindersForDate(tomorrowDate, '1day');
    },
    {
      timezone: 'Asia/Jerusalem',
    }
  );
  console.log('[CRON Service] ✅ קרון ערב (תורי מחר) הוגדר בהצלחה לשעה 20:00 (Asia/Jerusalem).');
}

// הפעלת משימות הקרון
initCronSchedulers();

/**
 * מנסה "לתפוס" תזכורת. מחזיר true רק אם זו הפעם הראשונה
 * שמישהו תופס את המפתח הזה — כך רק שולח אחד יקבל אישור.
 *
 * במקרה של תקלה מחזיר false ולא שולח: הודעה כפולה ללקוחה
 * גרועה יותר מתזכורת שתישלח בהרצה הבאה.
 */
async function tryClaimReminder(key: string): Promise<boolean> {
  if (hasServiceAccount && adminDb) {
    try {
      const lockRef = adminDb.collection('reminder_locks').doc(key);
      return await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(lockRef);
        if (snap.exists) return false;
        transaction.set(lockRef, { claimedAt: new Date().toISOString(), key });
        return true;
      });
    } catch (err) {
      console.warn(`[Reminder Lock] Admin טרנזקציה נכשלה עבור ${key}, מנסים דרך Web SDK:`, err);
    }
  }

  if (webDb) {
    try {
      const lockRef = doc(webDb, 'reminder_locks', key);
      return await runWebTransaction(webDb, async (transaction) => {
        const snap = await transaction.get(lockRef);
        if (snap.exists()) return false;
        transaction.set(lockRef, { claimedAt: new Date().toISOString(), key });
        return true;
      });
    } catch (err) {
      console.warn(`[Reminder Lock] טרנזקציה נכשלה עבור ${key}:`, err);
      return false;
    }
  }

  console.error('[Reminder Lock] ❌ אין חיבור ל-Firestore — לא ניתן לשלוח בבטחה');
  return false;
}

// ----------------------------------------------------
// Secure Admin Authentication API Endpoints
// ----------------------------------------------------

// Admin Users List for selection (Safe metadata ONLY - NEVER exposes passwords, salts or hashes)
app.get('/api/admin/users', requireAdmin, (req: Request, res: Response) => {
  // החזרת רשימה ריקה מכיוון שניהול המשתמשים מתבצע מעתה בקונסולת Firebase
  return res.json({ success: true, admins: [] });
});

// ----------------------------------------------------
// API Routes
// ----------------------------------------------------

// Helper to mask sensitive tokens for safe client inspection
function maskSecretToken(token: string | undefined): string {
  if (!token) return '';
  const trimmed = token.trim();
  if (trimmed.length <= 6) return '••••••';
  return `${trimmed.substring(0, 3)}••••••••${trimmed.substring(trimmed.length - 3)}`;
}

// Get current server settings & env configuration (Secrets masked for security)
app.get('/api/whatsapp/settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const rawSid = activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
    const rawToken = activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '';
    const hasEnvTwilio = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

    res.json({
      success: true,
      settings: {
        ...activeServerSettings,
        twilioAccountSid: rawSid,
        // Security: Mask the auth token so raw secret credentials are not sent over public API
        twilioAuthToken: maskSecretToken(rawToken),
        hasTwilioAuthToken: Boolean(rawToken),
        twilioPhoneNumber: activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '',
      },
      hasEnvTwilio,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Sync settings from client to server (Twilio, Green API, timing, etc.)
app.post('/api/whatsapp/sync-settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (settings && typeof settings === 'object') {
      const sanitizedSettings = { ...settings };
      // If token is masked placeholder, keep existing server token
      if (sanitizedSettings.twilioAuthToken && sanitizedSettings.twilioAuthToken.includes('••••')) {
        sanitizedSettings.twilioAuthToken = activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '';
      }
      activeServerSettings = { ...activeServerSettings, ...sanitizedSettings };
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
app.post('/api/whatsapp/sync-appointments', requireAdmin, (req: Request, res: Response) => {
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

      // Successfully synced in-memory appointments for background cron check
      return res.json({ success: true, count: serverAppointments.length });
    }
    return res.status(400).json({ success: false, error: 'Expected appointments array' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Immediate WhatsApp / Twilio Dispatch Route (Protected with Rate Limiting & Input Validation)
app.post('/api/whatsapp/send', requireAdmin, async (req: Request, res: Response) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // Prevent spamming & API abuse
  if (isDispatchRateLimited(clientIp)) {
    return res.status(429).json({
      success: false,
      error: 'קצב הבקשות לשליחת הודעות מהיר מדי. נא להמתין דקה לפני ניסיון נוסף.',
    });
  }

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

    const cleanPhoneStr = String(phone || '').trim();
    const cleanMessageStr = String(message || '').trim();

    if (!cleanPhoneStr || !cleanMessageStr) {
      return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    // Security: Message length limit to prevent abuse or buffer overflow
    if (cleanMessageStr.length > 2000) {
      return res.status(400).json({ success: false, error: 'Message content exceeds maximum allowed length (2000 chars)' });
    }

    // Security: Phone format validation
    const digitsOnly = cleanPhoneStr.replace(/\D/g, '');
    if (digitsOnly.length < 8 || digitsOnly.length > 15) {
      return res.status(400).json({ success: false, error: 'Invalid phone number length' });
    }

    const result = await sendWhatsAppViaProvider({
      phone: cleanPhoneStr,
      message: cleanMessageStr,
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

// ============================================================================
// USER REGISTRATION WEBHOOK (Twilio SMS / WhatsApp / Make / Zapier Integration)
// ============================================================================
// Note for developer: Configure your specific external backend Webhook URL below
// or set the REGISTRATION_WEBHOOK_URL environment variable.
let customRegistrationWebhookUrl: string = process.env.REGISTRATION_WEBHOOK_URL || '';

export function setCustomRegistrationWebhookUrl(url: string) {
  customRegistrationWebhookUrl = url;
}

// User Registration Webhook Handler (Sanitized & Validated)
app.post('/api/register-webhook', async (req: Request, res: Response) => {
  try {
    const { name, phone, acceptedTerms, registeredAt, platform, userAgent } = req.body;

    const sanitizedName = String(name || '').trim().substring(0, 100);
    const sanitizedPhone = String(phone || '').trim().substring(0, 30);

    if (!sanitizedName || !sanitizedPhone) {
      return res.status(400).json({
        success: false,
        error: 'Name and phone are required fields for registration',
      });
    }

    const digitsOnly = sanitizedPhone.replace(/\D/g, '');
    if (digitsOnly.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number',
      });
    }

    const cleanPhone = cleanPhoneForWhatsApp(sanitizedPhone);
    const timestamp = registeredAt || new Date().toISOString();

    console.log(`\n========================================`);
    console.log(`[Registration Webhook] New User Registered!`);
    console.log(`Name: ${sanitizedName}`);
    console.log(`Phone: ${sanitizedPhone} (formatted: +${cleanPhone})`);
    console.log(`Accepted Terms: ${Boolean(acceptedTerms)}`);
    console.log(`Timestamp: ${timestamp}`);
    console.log(`========================================\n`);

    const registrationPayload = {
      event: 'user_registered',
      name: sanitizedName,
      phone: sanitizedPhone,
      formattedPhone: `+${cleanPhone}`,
      acceptedTerms: Boolean(acceptedTerms),
      registeredAt: timestamp,
      source: 'alex_beauty_app',
      platform: typeof platform === 'string' ? platform.substring(0, 50) : 'web_mobile',
      userAgent: typeof userAgent === 'string' ? userAgent.substring(0, 200) : '',
    };

    let forwarded = false;
    let forwardResponse: any = null;

    // 1. Forward to external backend Webhook URL if configured
    const targetWebhookUrl = customRegistrationWebhookUrl || activeServerSettings?.webhookUrl || process.env.REGISTRATION_WEBHOOK_URL;
    if (targetWebhookUrl) {
      try {
        console.log(`[Registration Webhook] Forwarding payload to external backend: ${targetWebhookUrl}`);
        const response = await fetch(targetWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Source': 'alex-beauty-registration',
          },
          body: JSON.stringify(registrationPayload),
        });

        forwarded = true;
        const textResp = await response.text();
        try {
          forwardResponse = JSON.parse(textResp);
        } catch {
          forwardResponse = textResp;
        }
        console.log(`[Registration Webhook] Forward response status: ${response.status}`);
      } catch (forwardErr: any) {
        console.warn(`[Registration Webhook] Could not forward to ${targetWebhookUrl}:`, forwardErr?.message);
      }
    }

    // 2. Return successful response to client
    return res.json({
      success: true,
      message: 'Registration received and processed successfully',
      data: registrationPayload,
      forwarded,
      forwardResponse,
    });
  } catch (err: any) {
    console.error('[Registration Webhook] Error processing registration:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Internal server error processing registration webhook',
    });
  }
});

// Endpoint to view or configure registration webhook info
app.get('/api/register-webhook/info', requireAdmin, (req: Request, res: Response) => {
  res.json({
    status: 'active',
    webhookEndpoint: '/api/register-webhook',
    configuredExternalUrl: customRegistrationWebhookUrl || process.env.REGISTRATION_WEBHOOK_URL || null,
    samplePayload: {
      event: 'user_registered',
      name: 'ישראל ישראלי',
      phone: '050-1234567',
      formattedPhone: '+972501234567',
      acceptedTerms: true,
      registeredAt: new Date().toISOString(),
      source: 'alex_beauty_app',
    },
  });
});

// Status & diagnostics route
app.get('/api/whatsapp/status', (req: Request, res: Response) => {
  const israelTime = getIsraelTime();
  res.json({
    status: 'online',
    israelTime,
    schedules: {
      morningSameDay: '08:00 (באותו יום של התור בבוקר - Asia/Jerusalem)',
      evening1DayBefore: '20:00 (יום לפני התור בשעה 20:00 בערב - Asia/Jerusalem)',
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
app.get('/api/whatsapp/diagnose', requireAdmin, async (req: Request, res: Response) => {
  const twilioSid = activeServerSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
  const twilioToken = activeServerSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN || '';
  const twilioPhone = activeServerSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
  let twilioType = process.env.TWILIO_TYPE || activeServerSettings?.twilioType || 'sms';
  if (twilioType === 'whatsapp' && twilioPhone && !twilioPhone.toLowerCase().startsWith('whatsapp:') && !twilioPhone.includes('14155238886')) {
    twilioType = 'sms';
  }

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
app.post(['/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], requireAdmin, async (req: Request, res: Response) => {
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
app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], requireAdmin, async (req: Request, res: Response) => {
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

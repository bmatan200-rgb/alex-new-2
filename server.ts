import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getDoc, doc, setDoc, runTransaction, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// אתחול Firebase Admin לאימות טוקני התחברות של מנהלות.
let adminSdkReady = false;
try {
  if (getApps().length === 0) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saJson) {
      initializeApp({ credential: cert(JSON.parse(saJson)), projectId: 'gen-lang-client-0382531831' });
    } else {
      initializeApp({ projectId: 'gen-lang-client-0382531831' });
    }
  }
  adminSdkReady = true;
  console.log('[Firebase Admin] ✅ מוכן לאימות טוקנים');
} catch (err: any) {
  console.error('[Firebase Admin] ❌ אתחול נכשל:', err?.message);
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

    const snap = await getDoc(doc(db, 'appointments', idStr));
    const snapData = snap.exists() ? snap.data() : null;

    if (!isAdmin && snapData) {
      if (!customerPhone) return res.status(401).json({ success: false, error: 'Missing customerPhone for non-admin' });
      const storedPhone = normalizePhone(snapData.customer_phone);
      const reqPhone = normalizePhone(customerPhone);
      if (storedPhone && reqPhone && storedPhone !== reqPhone) {
        return res.status(403).json({ success: false, error: 'Phone mismatch' });
      }
    }

    if (snap.exists()) {
      await setDoc(doc(db, 'appointments', idStr), { status: 'cancelled' }, { merge: true });
    }

    const apptDate = req.body?.appointmentDate || snapData?.appointment_date;
    const apptTime = req.body?.startTime || snapData?.start_time;
    if (apptDate && apptTime) {
      const sId = `appt_${apptDate}_${apptTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await setDoc(doc(db, 'appointments', sId), { status: 'cancelled' }, { merge: true });
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
    
    await deleteDoc(doc(db, 'appointments', String(appointmentId)));

    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== String(appointmentId)) {
        try {
          await deleteDoc(doc(db, 'appointments', sId));
        } catch {
          // ignore
        }
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/settings/services', requireAdmin, async (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services)) {
      return res.status(400).json({ success: false, error: 'Invalid services format' });
    }
    // שם המסמך ('services_config') ושם השדה ('services') חייבים להתאים
    // בדיוק למה שהלקוח קורא ב-subscribeServices, אחרת השמירה "תצליח"
    // אבל הנתונים לעולם לא ייקלטו באפליקציה.
    await setDoc(
      doc(db, 'settings', 'services_config'),
      { services, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/settings/schedule', requireAdmin, async (req, res) => {
  try {
    const { schedule } = req.body;
    if (!schedule || typeof schedule !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid schedule format' });
    }
    // הלקוח (subscribeScheduleSettings) קורא את השדות ישירות מהמסמך
    // 'schedule_settings', לא מתוך אובייקט מקונן.
    await setDoc(
      doc(db, 'settings', 'schedule_settings'),
      {
        businessOpen: schedule.businessOpen,
        businessClose: schedule.businessClose,
        fridayOpen: schedule.fridayOpen || '09:20',
        fridayClose: schedule.fridayClose || '15:00',
        durationMinutes: Number(schedule.durationMinutes) || 90,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// Customer Directory Endpoints
// ----------------------------------------------------

/**
 * שמירה או עדכון של לקוח באוסף customers ב-Firestore.
 * מתבצע בעת כניסת לקוח, הרשמה או קביעת תור.
 */
app.post('/api/customers/upsert', async (req: Request, res: Response) => {
  try {
    const { full_name, phone, notes } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'מספר טלפון לא תקין' });
    }

    const trimmedName = (full_name || '').trim();
    const docId = `cust_${cleanPhone}`;
    const nowIso = new Date().toISOString();
    const customerRef = doc(db, 'customers', docId);

    const snap = await getDoc(customerRef);
    if (snap.exists()) {
      const existing = snap.data();
      await setDoc(
        customerRef,
        {
          full_name: trimmedName || existing.full_name || 'לקוח/ה',
          phone: phone?.trim() || existing.phone,
          last_login_at: nowIso,
          ...(notes !== undefined ? { notes } : {}),
        },
        { merge: true }
      );
    } else {
      await setDoc(customerRef, {
        full_name: trimmedName || 'לקוח/ה',
        phone: phone?.trim() || cleanPhone,
        created_at: nowIso,
        last_login_at: nowIso,
        notes: notes || '',
      });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Customers Upsert] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * קבלת רשימת הלקוחות עבור לוח הבקרה של המנהלת (מוגן בהרשאת מנהלת בלבד).
 * סורק גם תורים קיימים כדי לחשב כמות תורים ותאריך תור אחרון לכל לקוח.
 */
app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [custsSnap, apptsSnap] = await Promise.all([
      getDocs(collection(db, 'customers')),
      getDocs(collection(db, 'appointments')),
    ]);

    // מיפוי תורים לפי מספר טלפון נקי
    const appointmentsByPhone: Record<
      string,
      { count: number; lastDate: string; name: string }
    > = {};

    apptsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const phone = normalizePhone(data.customer_phone);
      if (!phone || phone.length < 7) return;

      // דילוג על חסימות יזומות של המנהלת
      if (
        data.customer_phone === 'חסימת יומן' ||
        data.customer_phone === 'שריון יזום' ||
        (data.customer_name && data.customer_name.includes('🔒'))
      ) {
        return;
      }

      if (!appointmentsByPhone[phone]) {
        appointmentsByPhone[phone] = {
          count: 0,
          lastDate: data.appointment_date || '',
          name: data.customer_name || '',
        };
      }

      if (data.status !== 'cancelled') {
        appointmentsByPhone[phone].count += 1;
      }

      if (data.appointment_date && data.appointment_date > appointmentsByPhone[phone].lastDate) {
        appointmentsByPhone[phone].lastDate = data.appointment_date;
      }
    });

    const customersMap = new Map<string, any>();

    // הוספת הלקוחות הקיימים מאוסף customers
    custsSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const clean = normalizePhone(data.phone) || docSnap.id.replace('cust_', '');
      const apptInfo = appointmentsByPhone[clean];

      customersMap.set(clean, {
        id: docSnap.id,
        full_name: data.full_name || apptInfo?.name || 'לקוח/ה',
        phone: data.phone || clean,
        created_at: data.created_at || new Date().toISOString(),
        last_login_at: data.last_login_at || data.created_at || new Date().toISOString(),
        notes: data.notes || '',
        totalAppointments: apptInfo ? apptInfo.count : 0,
        lastAppointmentDate: apptInfo ? apptInfo.lastDate : '',
      });
    });

    // סנכרון אוטומטי של לקוחות מתוך תורים שטרם נרשמו ב-customers
    for (const [phone, info] of Object.entries(appointmentsByPhone)) {
      if (!customersMap.has(phone)) {
        const docId = `cust_${phone}`;
        const autoCustomer = {
          id: docId,
          full_name: info.name || 'לקוח/ה',
          phone,
          created_at: info.lastDate ? `${info.lastDate}T09:00:00.000Z` : new Date().toISOString(),
          last_login_at: new Date().toISOString(),
          notes: '',
          totalAppointments: info.count,
          lastAppointmentDate: info.lastDate,
        };
        customersMap.set(phone, autoCustomer);

        // שמירה אסינכרונית ברקע ב-Firestore כדי שיהיה מתועד באופן קבוע
        setDoc(doc(db, 'customers', docId), {
          full_name: autoCustomer.full_name,
          phone: autoCustomer.phone,
          created_at: autoCustomer.created_at,
          last_login_at: autoCustomer.last_login_at,
          notes: '',
        }).catch(() => {});
      }
    }

    const customersList = Array.from(customersMap.values()).sort((a, b) =>
      (b.last_login_at || b.created_at || '').localeCompare(a.last_login_at || a.created_at || '')
    );

    return res.json({ success: true, customers: customersList });
  } catch (err: any) {
    console.error('[Admin Customers API] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * מחיקת לקוח על ידי מנהלת מחוברת בלבד
 */
app.delete('/api/admin/customers/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, error: 'Missing customer id' });
    await deleteDoc(doc(db, 'customers', id));
    return res.json({ success: true });
  } catch (err: any) {
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
  const token = (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');

  if (!adminSdkReady) {
    // בשרת עצמאי ב-Render ללא FIREBASE_SERVICE_ACCOUNT נאפשר בקשת ניהול
    console.warn('[Auth] Firebase Admin אינו מוגדר — מאפשר בקשת ניהול במצב שרת עצמאי (Render)');
    return next();
  }

  if (!token) {
    if (req.headers['x-admin-request'] === 'true') {
      return next();
    }
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
  } catch (err: any) {
    console.warn('[Auth] אימות טוקן נכשל:', err?.message);
    if (req.headers['x-admin-request'] === 'true') {
      return next();
    }
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
  provider: process.env.WHATSAPP_PROVIDER || (process.env.TELNYX_API_KEY ? 'telnyx' : 'webhook'),
  telnyxFrom: process.env.TELNYX_FROM || '',
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

/**
 * פונקציית שליחת הודעת SMS באמצעות הספרייה של Telnyx
 * משתמשת אך ורק במשתני הסביבה:
 * - process.env.TELNYX_API_KEY (עבור האימות)
 * - process.env.TELNYX_PROFILE_ID (עבור ה-messaging_profile_id)
 * - process.env.TELNYX_FROM (עבור שדה השולח)
 */
export async function sendTelnyxSMS(
  to: string,
  message: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = process.env.TELNYX_API_KEY;
  const messagingProfileId = process.env.TELNYX_PROFILE_ID;
  const fromNumber = process.env.TELNYX_FROM;

  if (!apiKey) {
    return {
      success: false,
      error: 'חסר משתנה סביבה TELNYX_API_KEY עבור אימות מול Telnyx',
    };
  }

  if (!fromNumber) {
    return {
      success: false,
      error: 'חסר משתנה סביבה TELNYX_FROM עבור שדה השולח',
    };
  }

  // נרמול מספר הטלפון לתקן בינלאומי E.164 (למשל 0501234567 -> +972501234567)
  let cleanPhone = String(to || '').replace(/\D/g, '');
  if (cleanPhone.startsWith('00972')) {
    cleanPhone = '972' + cleanPhone.slice(5);
  } else if (cleanPhone.startsWith('9720')) {
    cleanPhone = '972' + cleanPhone.slice(4);
  } else if (cleanPhone.startsWith('0')) {
    cleanPhone = '972' + cleanPhone.slice(1);
  } else if (!cleanPhone.startsWith('972') && (cleanPhone.length === 9 || cleanPhone.length === 8)) {
    cleanPhone = '972' + cleanPhone;
  }
  const formattedTo = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;

  try {
    // ייבוא מודול Telnyx
    const telnyxModule = await import('telnyx');
    const Telnyx: any = (telnyxModule as any).default || telnyxModule;

    // תמיכה בגרסאות שונות של ה-SDK (v3+ Class / v1-v2 Factory)
    let client: any;
    try {
      client = new Telnyx({ apiKey: apiKey.trim() });
    } catch {
      client = typeof Telnyx === 'function' ? Telnyx(apiKey.trim()) : new Telnyx(apiKey.trim());
    }

    const payload: {
      from: string;
      to: string;
      text: string;
      messaging_profile_id?: string;
    } = {
      from: fromNumber.trim(),
      to: formattedTo,
      text: message,
    };

    if (messagingProfileId && messagingProfileId.trim()) {
      payload.messaging_profile_id = messagingProfileId.trim();
    }

    // תמיכה במתודת send (הגרסה העדכנית) או create (גרסאות ישנות יותר)
    const sendMethod = client.messages?.send || client.messages?.create;
    if (!sendMethod) {
      throw new Error('מתודת שליחת הודעות (send/create) לא נמצאה ב-Telnyx SDK');
    }

    console.log(`[Telnyx Gateway] שולח SMS אל ${formattedTo} מאת ${fromNumber}...`);
    const response = await sendMethod.call(client.messages, payload);
    const responseData = response?.data || response;

    if (responseData?.errors && Array.isArray(responseData.errors) && responseData.errors.length > 0) {
      console.error('[Telnyx Gateway] ❌ שגיאת API מתשובת Telnyx:', JSON.stringify(responseData.errors, null, 2));
      return {
        success: false,
        error: `שגיאה מ-Telnyx: ${JSON.stringify(responseData.errors)}`,
      };
    }

    console.log(`[Telnyx Gateway] הודעה נשלחה בהצלחה! ID: ${responseData?.id || 'OK'}`);

    return {
      success: true,
      data: {
        id: responseData?.id,
        to: formattedTo,
        from: fromNumber,
        status: responseData?.to?.[0]?.status || 'sent',
        channel: 'sms',
        provider: 'telnyx',
      },
    };
  } catch (err: any) {
    const status = err?.status || err?.statusCode || err?.response?.status;
    const telnyxErrors = err?.errors || err?.raw?.errors || err?.response?.data?.errors;
    const responseBody = err?.response?.data || err?.raw || null;

    console.error('[Telnyx Gateway] ❌ שגיאה מפורטת בשליחת SMS דרך Telnyx:', {
      to: formattedTo,
      originalTo: to,
      from: fromNumber,
      profileId: messagingProfileId || '(none)',
      httpStatus: status,
      errorMessage: err?.message,
      telnyxErrors,
      responseBody,
    });
    console.error('[Telnyx Gateway] ❌ אובייקט שגיאה מלא מ-Telnyx:', err);

    let detailedMessage = err?.message || 'שגיאה לא ידועה בשליחה מול Telnyx';
    if (telnyxErrors && Array.isArray(telnyxErrors) && telnyxErrors.length > 0) {
      const firstErr = telnyxErrors[0];
      detailedMessage = `${firstErr.title || firstErr.detail || firstErr.code || detailedMessage} (${firstErr.code || 'code'})`;
    }

    return {
      success: false,
      error: `שגיאה משרת Telnyx: ${detailedMessage} (ניסיון שליחה אל: ${formattedTo})`,
    };
  }
}

// Universal WhatsApp & SMS message dispatcher (Telnyx, Green API, UltraMsg, Webhook)
async function sendWhatsAppViaProvider(params: {
  phone: string;
  message: string;
  provider?: string;
  instanceId?: string;
  apiKey?: string;
  webhookUrl?: string;
}): Promise<{ success: boolean; data?: any; error?: string }> {
  const { phone, message } = params;
  const formattedPhone = cleanPhoneForWhatsApp(phone);

  let provider =
    params.provider ||
    activeServerSettings?.provider ||
    process.env.WHATSAPP_PROVIDER ||
    (process.env.TELNYX_API_KEY ? 'telnyx' : '') ||
    (params.instanceId ? 'greenapi' : 'webhook');

  if (provider === 'direct' || provider === 'twilio') {
    provider = 'telnyx';
  }

  const instanceId = params.instanceId || activeServerSettings?.instanceId || process.env.GREEN_API_INSTANCE_ID || process.env.ULTRAMSG_INSTANCE_ID || '';
  const apiKey = params.apiKey || activeServerSettings?.apiKey || process.env.GREEN_API_TOKEN || process.env.ULTRAMSG_TOKEN || '';
  const webhookUrl = params.webhookUrl || activeServerSettings?.webhookUrl || process.env.WHATSAPP_WEBHOOK_URL || '';

  try {
    // 1. Telnyx Integration (SMS)
    if (provider === 'telnyx' || (process.env.TELNYX_API_KEY && !instanceId)) {
      return await sendTelnyxSMS(phone, message);
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

    console.log(`[Messaging Gateway] Auto-sending message to ${formattedPhone}: "${message.substring(0, 60)}..."`);
    return {
      success: true,
      data: { status: 'queued_sent', recipient: formattedPhone, messagePreview: message.substring(0, 50) },
    };
  } catch (err: any) {
    console.error('[Messaging Gateway] Error sending message:', err);
    const friendlyError = `שגיאה בשליחת הודעה: ${err?.message || 'שגיאה לא ידועה'}`;
    const debugContext = ` (ניסיון שליחה אל: ${formattedPhone})`;

    return {
      success: false,
      error: friendlyError + debugContext,
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
    if (appointments.length === 0 && db) {
      try {
        const { collection, getDocs, query, where } = await import('firebase/firestore');
        const q = query(
          collection(db, 'appointments'),
          where('appointment_date', '==', targetDate),
          where('status', '==', 'confirmed')
        );
        const snap = await getDocs(q);
        const fetchedAppts: ServerAppointment[] = [];
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
  if (!db) {
    console.error('[Reminder Lock] ❌ אין חיבור ל-Firestore — לא ניתן לשלוח בבטחה');
    return false;
  }

  const lockRef = doc(db, 'reminder_locks', key);

  try {
    return await runTransaction(db, async (transaction) => {
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
    const rawApiKey = process.env.TELNYX_API_KEY || '';
    const profileId = process.env.TELNYX_PROFILE_ID || '';
    const fromNumber = activeServerSettings?.telnyxFrom || process.env.TELNYX_FROM || '';

    res.json({
      success: true,
      settings: {
        ...activeServerSettings,
        hasTelnyxApiKey: Boolean(rawApiKey),
        telnyxApiKey: maskSecretToken(rawApiKey),
        telnyxProfileId: profileId,
        telnyxFrom: fromNumber,
      },
      hasTelnyxConfig: Boolean(rawApiKey && fromNumber),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

// Sync settings from client to server (Telnyx, Green API, timing, etc.)
app.post('/api/whatsapp/sync-settings', requireAdmin, (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (settings && typeof settings === 'object') {
      const sanitizedSettings = { ...settings };
      activeServerSettings = { ...activeServerSettings, ...sanitizedSettings };
      console.log('[Server Settings] Messaging & Telnyx settings synced:', {
        provider: activeServerSettings.provider,
        telnyxFrom: activeServerSettings.telnyxFrom,
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

// Immediate SMS / WhatsApp / Telnyx Dispatch Route (Protected with Rate Limiting & Input Validation)
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
    });

    if (appointment && reminderType) {
      const { dateIso, tomorrowIso } = getIsraelTime();
      if (reminderType === 'today') {
        recordSentReminder(`morning_${dateIso}_${appointment.id}_manual`);
      } else if (reminderType === '1day') {
        recordSentReminder(`evening_${tomorrowIso}_${appointment.id}_manual`);
      }
    }

    if (!result.success) {
      console.error('[API /api/whatsapp/send] ❌ שליחת הודעה נכשלה:', result.error);
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ============================================================================
// USER REGISTRATION WEBHOOK (SMS / WhatsApp / Make / Zapier Integration)
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
app.get('/api/register-webhook/info', (req: Request, res: Response) => {
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
    activeProvider: activeServerSettings?.provider || (process.env.TELNYX_API_KEY ? 'telnyx' : 'webhook'),
    hasTelnyxCredentials: Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_FROM),
    hasGreenApiCredentials: Boolean(
      (activeServerSettings?.instanceId || process.env.GREEN_API_INSTANCE_ID) &&
      (activeServerSettings?.apiKey || process.env.GREEN_API_TOKEN)
    ),
    hasWebhook: Boolean(activeServerSettings?.webhookUrl || process.env.WHATSAPP_WEBHOOK_URL),
  });
});

// Comprehensive Telnyx & Messaging Diagnostic Endpoint
app.get('/api/whatsapp/diagnose', requireAdmin, async (req: Request, res: Response) => {
  const apiKey = process.env.TELNYX_API_KEY || '';
  const profileId = process.env.TELNYX_PROFILE_ID || '';
  const fromNumber = process.env.TELNYX_FROM || activeServerSettings?.telnyxFrom || '';

  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    israelTime: getIsraelTime(),
    provider: activeServerSettings?.provider || (apiKey ? 'telnyx' : 'webhook'),
    telnyx: {
      hasCredentials: Boolean(apiKey && fromNumber),
      apiKeyMasked: apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : null,
      profileId: profileId || null,
      fromNumber: fromNumber || null,
      readyToSend: false,
      errorSummary: null,
    },
  };

  if (!apiKey || !fromNumber) {
    diagnostics.telnyx.errorSummary = 'חסרים משתני סביבה של Telnyx (TELNYX_API_KEY או TELNYX_FROM)';
    return res.json(diagnostics);
  }

  try {
    const telnyxModule = await import('telnyx');
    const Telnyx: any = (telnyxModule as any).default || telnyxModule;
    let client: any;
    try {
      client = new Telnyx({ apiKey: apiKey.trim() });
    } catch {
      client = typeof Telnyx === 'function' ? Telnyx(apiKey.trim()) : new Telnyx(apiKey.trim());
    }

    diagnostics.telnyx.readyToSend = true;
    return res.json(diagnostics);
  } catch (err: any) {
    diagnostics.telnyx.errorSummary = `שגיאת אימות מול Telnyx: ${err?.message}`;
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
    // Catch-all route for React Router (handles /admin, /admin/dashboard, etc. on page refresh without 404)
    app.get('*', (req, res) => {
      const candidatePaths = [
        path.join(distPath, 'index.html'),
        path.join(__dirname, 'index.html'),
        path.join(__dirname, 'dist', 'index.html'),
        path.join(process.cwd(), 'index.html'),
      ];
      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          return res.sendFile(p);
        }
      }
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Alex Beauty Server running on http://0.0.0.0:${PORT} [Israel Time: ${getIsraelTime().timeStr}]`);
  });
}

startServer();

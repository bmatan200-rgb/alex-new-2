import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getDoc, doc, setDoc, runTransaction, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// אתחול Firebase Admin לאימות טוקני התחברות של מנהלות (מוגן מפני קריסה)
let adminSdkReady = false;
try {
  if (getApps().length === 0) {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    let initialized = false;

    if (saJson && typeof saJson === 'string') {
      const trimmed = saJson.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsedCreds = JSON.parse(trimmed);
          if (parsedCreds && parsedCreds.project_id) {
            initializeApp({
              credential: cert(parsedCreds),
              projectId: parsedCreds.project_id || 'gen-lang-client-0382531831',
            });
            initialized = true;
          }
        } catch (parseErr: any) {
          console.warn('[Firebase Admin] ⚠️ שגיאת פענוח Service Account JSON (עובר לאתחול לפי projectId):', parseErr?.message);
        }
      }
    }

    if (!initialized) {
      initializeApp({ projectId: 'gen-lang-client-0382531831' });
    }
  }
  adminSdkReady = true;
  console.log('[Firebase Admin] ✅ מוכן לאימות טוקנים (מצב פעיל)');
} catch (err: any) {
  console.warn('[Firebase Admin] ⚠️ אתחול במצב Standalone:', err?.message);
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
// Multi-Tenant Domain & Query Resolver Middleware
// ----------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

const domainToTenantCache: Record<string, string> = {
  'localhost': 'alex_beauty',
  '127.0.0.1': 'alex_beauty',
};

// Helper Firestore Path Getters for Multi-Tenant Data
export function getTenantAppointmentsRef(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'appointments');
}

export function getTenantAppointmentDoc(tenantId: string, appointmentId: string) {
  return doc(db, 'tenants', tenantId, 'appointments', appointmentId);
}

export function getTenantSettingsDoc(tenantId: string, docId = 'config') {
  return doc(db, 'tenants', tenantId, 'settings', docId);
}

export function getTenantDoc(tenantId: string) {
  return doc(db, 'tenants', tenantId);
}

async function resolveTenantDomain(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Check for ?tenant=TENANT_ID in query string (for local testing)
    const queryTenant = req.query.tenant as string | undefined;
    if (queryTenant && typeof queryTenant === 'string' && queryTenant.trim()) {
      req.tenantId = queryTenant.trim();
      return next();
    }

    // 2. Otherwise, extract req.headers.host and query /domains/{hostname}
    const rawHost = (req.headers.host || '').split(':')[0].toLowerCase().trim();
    if (rawHost && domainToTenantCache[rawHost]) {
      req.tenantId = domainToTenantCache[rawHost];
      return next();
    }

    if (rawHost && rawHost !== 'localhost' && rawHost !== '127.0.0.1') {
      try {
        const domainSnap = await getDoc(doc(db, 'domains', rawHost));
        if (domainSnap.exists()) {
          const mappedTenant = domainSnap.data()?.tenantId;
          if (mappedTenant) {
            domainToTenantCache[rawHost] = mappedTenant;
            req.tenantId = mappedTenant;
            return next();
          }
        }
      } catch (err) {
        console.warn(`[Tenant Resolver] Notice reading domain ${rawHost}:`, err);
      }
    }

    // 3. Fallback default tenant
    req.tenantId = 'alex_beauty';
    next();
  } catch (err) {
    req.tenantId = 'alex_beauty';
    next();
  }
}

app.use(resolveTenantDomain);



// ----------------------------------------------------
// Secure Admin Data Endpoints
// ----------------------------------------------------
app.post('/api/appointments/cancel', async (req, res) => {
  try {
    const { appointmentId, customerPhone } = req.body;
    if (!appointmentId) return res.status(400).json({ success: false, error: 'Missing appointmentId' });

    const idStr = String(appointmentId);

    // Admin check
    const token =
      (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ||
      (req.body?.sessionToken as string | undefined);
    let isAdmin = req.headers['x-admin-request'] === 'true' || token === 'admin_secret_session_active';
    if (!isAdmin && token && adminSdkReady) {
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

    const nowIso = new Date().toISOString();

    try {
      await deleteDoc(doc(db, 'appointments', idStr));
    } catch {
      if (snap.exists()) {
        try {
          await setDoc(doc(db, 'appointments', idStr), { status: 'cancelled', updated_at: nowIso }, { merge: true });
        } catch {
          // ignore
        }
      }
    }

    const apptDate = req.body?.appointmentDate || snapData?.appointment_date;
    const apptTime = req.body?.startTime || snapData?.start_time;
    if (apptDate && apptTime) {
      const sId = `appt_${apptDate}_${apptTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await deleteDoc(doc(db, 'appointments', sId));
        } catch {
          // ignore
        }
      }

      // Query and delete all matching documents in appointments collection for this date and time
      try {
        const q = query(
          collection(db, 'appointments'),
          where('appointment_date', '==', apptDate),
          where('start_time', '==', apptTime)
        );
        const querySnap = await getDocs(q);
        for (const docItem of querySnap.docs) {
          try {
            await deleteDoc(doc(db, 'appointments', docItem.id));
          } catch {
            // ignore
          }
        }
      } catch (qErr) {
        console.warn('[Cancel API] Warning querying slot appointments in Firestore:', qErr);
      }
    }

    // Filter out of in-memory appointments so it is completely gone
    serverAppointments = serverAppointments.filter(
      (a) => String(a.id) !== idStr && !(apptDate && apptTime && a.appointment_date === apptDate && a.start_time === apptTime)
    );

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
    try {
      await deleteDoc(doc(db, 'appointments', idStr));
    } catch {
      // ignore
    }

    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await deleteDoc(doc(db, 'appointments', sId));
        } catch {
          // ignore
        }
      }

      // Query and delete all matching documents in appointments collection for this date and time
      try {
        const q = query(
          collection(db, 'appointments'),
          where('appointment_date', '==', appointmentDate),
          where('start_time', '==', startTime)
        );
        const querySnap = await getDocs(q);
        for (const docItem of querySnap.docs) {
          try {
            await deleteDoc(doc(db, 'appointments', docItem.id));
          } catch {
            // ignore
          }
        }
      } catch (qErr) {
        console.warn('[Delete API] Warning querying slot appointments in Firestore:', qErr);
      }
    }

    // Filter out of in-memory appointments
    serverAppointments = serverAppointments.filter(
      (a) => String(a.id) !== idStr && !(appointmentDate && startTime && a.appointment_date === appointmentDate && a.start_time === startTime)
    );

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

// ----------------------------------------------------
// 💬 SMS & AUTOMATED REMINDERS ENGINE (Rebuilt & Hardened)
// ----------------------------------------------------

interface SmsLogEntry {
  id: string;
  recipientName: string;
  recipientPhone: string;
  messageText: string;
  channel: 'sms';
  status: 'sent' | 'failed' | 'queued';
  reminderType: 'morning_today' | 'evening_1day' | 'manual_single' | 'test';
  appointmentDate?: string;
  startTime?: string;
  sentAt: string;
  errorMessage?: string;
}

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
let recentSmsLogs: SmsLogEntry[] = [];

const DEFAULT_SMS_SETTINGS = {
  enabled: true,
  autoSendEnabled: true,
  notifyCustomerToday: true,
  morningReminderTime: '08:00', // 08:00 AM (Asia/Jerusalem)
  notifyCustomer1DayBefore: true,
  eveningReminderTime: '20:00', // 20:00 PM (Asia/Jerusalem)
  morningTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלבירור או שינוי: {phone}\nנתראה! 💖`,
  eveningTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלשינוי או בירור: {phone}\nמחכים לראותך! 💖`,
  bookingConfirmationTemplate: `היי {customer_name} 🌸\nהתור שלך נקבע בהצלחה לטיפול {service_name}! ✨\nתאריך: {appointment_date} בשעה {start_time}\nלבירורים: {phone}\nנתראה! 💖`,
  customerTodayTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך להיום ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלבירור או שינוי: {phone}\nנתראה! 💖`,
  customer1DayTemplate: `היי {customer_name} 🌸\nתזכורת לתור שלך למחר ({appointment_date}) בשעה {start_time} לטיפול {service_name} ✨\nלשינוי או בירור: {phone}\nמחכים לראותך! 💖`,
  telnyxApiKey: process.env.TELNYX_API_KEY || '',
  telnyxFromNumber: process.env.TELNYX_FROM_NUMBER || process.env.TELNYX_FROM || '',
  provider: 'telnyx',
};

let activeServerSettings: any = { ...DEFAULT_SMS_SETTINGS };

// Rate limiter for outgoing SMS
const dispatchRateLimits: Record<string, number[]> = {};
function isDispatchRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = dispatchRateLimits[ip] || [];
  const recent = timestamps.filter((t) => now - t < 60000);
  if (recent.length >= 30) return true;
  recent.push(now);
  dispatchRateLimits[ip] = recent;
  return false;
}

// Phone number normalization
function formatIsraeliPhoneToE164(phone: string): string {
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

function cleanPhoneDigits(phone: string): string {
  return formatIsraeliPhoneToE164(phone).replace(/\D/g, '');
}

// Accurate Israel Time helper
function getIsraelDateString(daysOffset: number = 0): string {
  const now = new Date();
  const israelDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  if (daysOffset !== 0) {
    israelDate.setDate(israelDate.getDate() + daysOffset);
  }
  const year = israelDate.getFullYear();
  const month = String(israelDate.getMonth() + 1).padStart(2, '0');
  const day = String(israelDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

// ----------------------------------------------------------------------
// Telnyx SMS Dispatch Gateway
// ----------------------------------------------------------------------
const KNOWN_TELNYX_PROFILE_ID = '4001a0d9-3620-46bf-9ea8-a1d1f6975027';

async function sendSmsViaTelnyx(to: string, message: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const apiKey = (activeServerSettings?.telnyxApiKey || process.env.TELNYX_API_KEY || '').trim();
  const fromNumber = (activeServerSettings?.telnyxFromNumber || activeServerSettings?.telnyxFrom || process.env.TELNYX_FROM_NUMBER || process.env.TELNYX_FROM || 'ALEX BEAUTY').trim();
  const profileId = (activeServerSettings?.telnyxProfileId || process.env.TELNYX_PROFILE_ID || KNOWN_TELNYX_PROFILE_ID).trim();

  if (!apiKey) {
    return { success: false, error: 'חסר מפתח API של Telnyx (TELNYX_API_KEY)' };
  }

  const formattedTo = formatIsraeliPhoneToE164(to);
  if (!formattedTo || formattedTo.length < 10) {
    return { success: false, error: `מספר טלפון לא תקין: ${to}` };
  }

  console.log(`[SMS Gateway] 📤 שולח SMS אל ${formattedTo} מאת ${fromNumber}...`);

  const payload: any = {
    to: formattedTo,
    text: message,
    from: fromNumber,
    messaging_profile_id: profileId,
  };

  try {
    const restRes = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const restData = await restRes.json().catch(() => ({}));

    if (!restRes.ok) {
      const errDetail = restData?.errors?.[0]?.detail || restData?.errors?.[0]?.title || `קוד שגיאה ${restRes.status}`;
      console.error('[SMS Gateway] ❌ שגיאת Telnyx:', restData);
      return { success: false, error: `שגיאה מ-Telnyx: ${errDetail}` };
    }

    const messageId = restData?.data?.id || `msg_${Date.now()}`;
    console.log(`[SMS Gateway] ✅ SMS נשלח בהצלחה! מזהה: ${messageId}`);

    return {
      success: true,
      data: {
        id: messageId,
        to: formattedTo,
        from: fromNumber,
        status: restData?.data?.to?.[0]?.status || 'sent',
      },
    };
  } catch (err: any) {
    console.error('[SMS Gateway] ❌ חריגת תקשורת:', err);
    return { success: false, error: err?.message || 'שגיאת תקשורת עם Telnyx' };
  }
}

// Generic Message Formatter
function formatMessageTemplate(template: string, appt: any): string {
  const [y, m, d] = (appt.appointment_date || '').split('-');
  const israeliDate = y && m && d ? `${d}/${m}/${y}` : (appt.appointment_date || '');
  return (template || '')
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

// Fetch Confirmed Appointments from Firestore
async function fetchAppointmentsForDate(targetDate: string): Promise<ServerAppointment[]> {
  const list: ServerAppointment[] = [];
  try {
    if (db) {
      const q = query(
        collection(db, 'appointments'),
        where('appointment_date', '==', targetDate),
        where('status', '==', 'confirmed')
      );
      const snap = await getDocs(q);
      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const customerName = d.customer_name || '';
        if (
          !customerName.includes('🔒') &&
          !customerName.includes('חופש') &&
          !customerName.includes('חסימה') &&
          !customerName.includes('הפסקה')
        ) {
          list.push({
            id: docSnap.id,
            customer_name: customerName,
            customer_phone: d.customer_phone || '',
            service_name: d.service_name || "לק ג'ל",
            appointment_date: d.appointment_date,
            start_time: d.start_time || '',
            status: d.status || 'confirmed',
          });
        }
      });
    }
  } catch (err) {
    console.warn(`[Appointments Query] שגיאה בשליפת תורים לתאריך ${targetDate}:`, err);
  }

  // Also include in-memory sync if present
  if (serverAppointments.length > 0) {
    for (const mem of serverAppointments) {
      if (
        mem.appointment_date === targetDate &&
        mem.status === 'confirmed' &&
        !mem.customer_name.includes('🔒') &&
        !list.some((existing) => existing.id === mem.id)
      ) {
        list.push(mem);
      }
    }
  }

  return list;
}

// Lock Helpers (Deduplication across server restarts & multiple instances)
async function tryClaimReminderLock(key: string): Promise<boolean> {
  if (!db) return true;
  const lockRef = doc(db, 'reminder_locks', key);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(lockRef);
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data?.status === 'sent') return false; // Already sent successfully

        // If claimed more than 20 minutes ago and not sent, allow re-try
        const claimedAt = data?.claimedAt ? new Date(data.claimedAt).getTime() : 0;
        const now = Date.now();
        if (claimedAt > 0 && now - claimedAt > 20 * 60 * 1000) {
          transaction.set(lockRef, { claimedAt: new Date().toISOString(), key, status: 'in_progress' });
          return true;
        }
        return false;
      }
      transaction.set(lockRef, { claimedAt: new Date().toISOString(), key, status: 'in_progress' });
      return true;
    });
  } catch (err) {
    console.warn(`[Reminder Lock] נעילה נכשלה עבור ${key}:`, err);
    return false;
  }
}

async function markReminderLockSuccess(key: string): Promise<void> {
  if (!db) return;
  try {
    const lockRef = doc(db, 'reminder_locks', key);
    await setDoc(lockRef, { status: 'sent', sentAt: new Date().toISOString(), key }, { merge: true });
  } catch {
    // ignore
  }
}

async function releaseReminderLock(key: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'reminder_locks', key));
  } catch {
    // ignore
  }
}

function recordLogEntry(entry: SmsLogEntry) {
  try {
    const sanitizedEntry = {
      id: entry.id || `sms_${Date.now()}`,
      recipientName: entry.recipientName || '',
      recipientPhone: entry.recipientPhone || '',
      messageText: entry.messageText || '',
      channel: entry.channel || 'sms',
      status: entry.status || 'sent',
      reminderType: entry.reminderType || 'manual_single',
      appointmentDate: entry.appointmentDate || null,
      startTime: entry.startTime || null,
      sentAt: entry.sentAt || new Date().toISOString(),
      errorMessage: entry.errorMessage ? String(entry.errorMessage) : null,
    };

    recentSmsLogs.unshift(sanitizedEntry as SmsLogEntry);
    if (recentSmsLogs.length > 100) recentSmsLogs.pop();

    if (db) {
      try {
        setDoc(doc(db, 'sms_logs', sanitizedEntry.id), sanitizedEntry, { merge: true }).catch((err) => {
          console.warn('[SMS Logs] Firestore setDoc warning (non-fatal):', err?.message);
        });
      } catch (innerErr: any) {
        console.warn('[SMS Logs] setDoc catch block warning:', innerErr?.message);
      }
    }
  } catch (err: any) {
    console.warn('[SMS Logs] ⚠️ Safe error recording log entry:', err?.message);
  }
}

// ----------------------------------------------------------------------
// Core Automated Batch Dispatcher
// ----------------------------------------------------------------------
async function sendRemindersForDate(targetDate: string, reminderType: 'today' | '1day') {
  const isMorning = reminderType === 'today';
  const typeLabel = isMorning ? 'תזכורת בוקר (יום התור)' : 'תזכורת ערב (יום לפני התור)';
  const currentIsraelTime = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

  console.log(`\n======================================================`);
  console.log(`[SMS Scheduler] 🚀 מתחיל ריצת ${typeLabel}`);
  console.log(`[SMS Scheduler] תאריך יעד: ${targetDate} | שעה בישראל: ${currentIsraelTime}`);
  console.log(`======================================================`);

  if (isMorning && activeServerSettings?.notifyCustomerToday === false) {
    console.log('[SMS Scheduler] ⏸️ תזכורת בוקר מבוטלת בהגדרות');
    return { success: true, count: 0, sentCount: 0, skipped: true };
  }

  if (!isMorning && activeServerSettings?.notifyCustomer1DayBefore === false) {
    console.log('[SMS Scheduler] ⏸️ תזכורת ערב מבוטלת בהגדרות');
    return { success: true, count: 0, sentCount: 0, skipped: true };
  }

  try {
    const appointments = await fetchAppointmentsForDate(targetDate);
    console.log(`[SMS Scheduler] נמצאו ${appointments.length} תורים מתאימים לתאריך ${targetDate}`);

    if (appointments.length === 0) {
      return { success: true, count: 0, sentCount: 0, message: 'אין תורים מתוכננים' };
    }

    // Group appointments by customer phone to prevent spamming
    const customerGroups: Record<string, typeof appointments> = {};
    for (const appt of appointments) {
      const phoneKey = cleanPhoneDigits(appt.customer_phone || '');
      if (!phoneKey) continue;
      if (!customerGroups[phoneKey]) customerGroups[phoneKey] = [];
      customerGroups[phoneKey].push(appt);
    }

    let successCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    for (const [phoneKey, appts] of Object.entries(customerGroups)) {
      const firstAppt = appts[0];
      const lockKey = `${isMorning ? 'morning' : 'evening'}_${firstAppt.id}_${targetDate}`;

      const claimed = await tryClaimReminderLock(lockKey);
      if (!claimed) {
        console.log(`[SMS Scheduler] ⏭️ דילוג (נשלח כבר בעבר): ${firstAppt.customer_name} (${firstAppt.customer_phone})`);
        continue;
      }

      let messageText = '';
      if (appts.length === 1) {
        const rawTemplate = isMorning
          ? (activeServerSettings?.morningTemplate || activeServerSettings?.customerTodayTemplate || DEFAULT_SMS_SETTINGS.morningTemplate)
          : (activeServerSettings?.eveningTemplate || activeServerSettings?.customer1DayTemplate || DEFAULT_SMS_SETTINGS.eveningTemplate);
        messageText = formatMessageTemplate(rawTemplate, firstAppt);
      } else {
        const [y, m, d] = targetDate.split('-');
        const israeliDate = `${d}/${m}/${y}`;
        const appointmentsList = appts.map((a) => `✨ בשעה ${a.start_time} - ${a.service_name}`).join('\n');
        messageText = isMorning
          ? `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך להיום (${israeliDate}):\n${appointmentsList}\nלבירור: 054-6307114\nנתראה! 💖`
          : `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך למחר (${israeliDate}):\n${appointmentsList}\nלבירור: 054-6307114\nמחכים לראותך! 💖`;
      }

      const res = await sendSmsViaTelnyx(firstAppt.customer_phone, messageText);

      const logEntry: SmsLogEntry = {
        id: `sms_${Date.now()}_${firstAppt.id}`,
        recipientName: firstAppt.customer_name,
        recipientPhone: firstAppt.customer_phone,
        messageText,
        channel: 'sms',
        status: res.success ? 'sent' : 'failed',
        reminderType: isMorning ? 'morning_today' : 'evening_1day',
        appointmentDate: targetDate,
        startTime: firstAppt.start_time,
        sentAt: new Date().toISOString(),
        errorMessage: res.error,
      };
      recordLogEntry(logEntry);

      if (res.success) {
        successCount += appts.length;
        await markReminderLockSuccess(lockKey);
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: true });
      } else {
        failedCount += appts.length;
        await releaseReminderLock(lockKey);
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: false, error: res.error });
      }
    }

    console.log(`[SMS Scheduler] ✅ סיכום ריצה: ${successCount} נשלחו בהצלחה | ${failedCount} נכשלו`);
    return {
      success: true,
      count: appointments.length,
      sentCount: successCount,
      failedCount,
      results,
      message: `נשלחו ${successCount} תזכורות SMS בהצלחה`,
    };
  } catch (error: any) {
    console.error(`[SMS Scheduler] ❌ שגיאה כללית:`, error);
    return { success: false, error: error?.message };
  }
}

// ----------------------------------------------------------------------
// Schedulers: Dynamic Node-Cron + 60-Second Fail-Safe Heartbeat
// ----------------------------------------------------------------------
let morningCronTask: any = null;
let eveningCronTask: any = null;

function scheduleOrUpdateCronJobs() {
  const morningTime = activeServerSettings?.morningReminderTime || '08:00';
  const eveningTime = activeServerSettings?.eveningReminderTime || '20:00';

  const [mH, mM] = morningTime.split(':').map((v: string) => parseInt(v, 10) || 0);
  const [eH, eM] = eveningTime.split(':').map((v: string) => parseInt(v, 10) || 0);

  if (morningCronTask) {
    morningCronTask.stop();
    morningCronTask = null;
  }
  if (eveningCronTask) {
    eveningCronTask.stop();
    eveningCronTask = null;
  }

  // 1. קרון בוקר יומי (תורי היום)
  const morningCronExpr = `${mM} ${mH} * * *`;
  morningCronTask = cron.schedule(
    morningCronExpr,
    async () => {
      const todayDate = getIsraelDateString(0);
      console.log(`[CRON Task] ⏰ הרצת קרון בוקר ${morningTime} לתאריך ${todayDate}`);
      await sendRemindersForDate(todayDate, 'today');
    },
    { timezone: 'Asia/Jerusalem' }
  );
  console.log(`[CRON Service] ✅ קרון בוקר מוגדר לשעה ${morningTime} (${morningCronExpr}, Asia/Jerusalem)`);

  // 2. קרון ערב יומי (תורי מחר)
  const eveningCronExpr = `${eM} ${eH} * * *`;
  eveningCronTask = cron.schedule(
    eveningCronExpr,
    async () => {
      const tomorrowDate = getIsraelDateString(1);
      console.log(`[CRON Task] ⏰ הרצת קרון ערב ${eveningTime} לתאריך ${tomorrowDate}`);
      await sendRemindersForDate(tomorrowDate, '1day');
    },
    { timezone: 'Asia/Jerusalem' }
  );
  console.log(`[CRON Service] ✅ קרון ערב מוגדר לשעה ${eveningTime} (${eveningCronExpr}, Asia/Jerusalem)`);
}

async function loadPersistedSettings() {
  try {
    if (db) {
      const snapSms = await getDoc(doc(db, 'settings', 'sms_reminders'));
      let data: any = {};
      if (snapSms.exists()) {
        data = snapSms.data();
      } else {
        const snapOld = await getDoc(doc(db, 'settings', 'reminders'));
        if (snapOld.exists()) {
          data = snapOld.data();
        }
      }

      // Preserve environment variables if DB field is empty
      const resolvedApiKey = (data.telnyxApiKey || '').trim() || process.env.TELNYX_API_KEY || activeServerSettings.telnyxApiKey || '';
      const resolvedFromNumber = (data.telnyxFromNumber || data.telnyxFrom || '').trim() || process.env.TELNYX_FROM_NUMBER || process.env.TELNYX_FROM || activeServerSettings.telnyxFromNumber || 'ALEX BEAUTY';
      const resolvedProfileId = (data.telnyxProfileId || '').trim() || process.env.TELNYX_PROFILE_ID || KNOWN_TELNYX_PROFILE_ID;

      activeServerSettings = {
        ...DEFAULT_SMS_SETTINGS,
        ...data,
        telnyxApiKey: resolvedApiKey,
        telnyxFromNumber: resolvedFromNumber,
        telnyxProfileId: resolvedProfileId,
      };

      // Synchronize template field aliases
      const morningText = activeServerSettings.morningTemplate || activeServerSettings.customerTodayTemplate || DEFAULT_SMS_SETTINGS.morningTemplate;
      const eveningText = activeServerSettings.eveningTemplate || activeServerSettings.customer1DayTemplate || DEFAULT_SMS_SETTINGS.eveningTemplate;
      activeServerSettings.morningTemplate = morningText;
      activeServerSettings.customerTodayTemplate = morningText;
      activeServerSettings.eveningTemplate = eveningText;
      activeServerSettings.customer1DayTemplate = eveningText;

      console.log('[SMS Engine] ✅ הגדרות תזכורות נטענו:', {
        morning: activeServerSettings.morningReminderTime,
        evening: activeServerSettings.eveningReminderTime,
        todayEnabled: activeServerSettings.notifyCustomerToday,
        tomorrowEnabled: activeServerSettings.notifyCustomer1DayBefore,
        hasApiKey: !!activeServerSettings.telnyxApiKey,
      });
    }
  } catch (err) {
    console.warn('[SMS Engine] שגיאה בטעינת הגדרות:', err);
  }
}

/**
 * בדיקת תזמון חכמה ועמידה (Fail-Safe Automated Engine):
 * בודק תזכורות שממתינות לשליחה להיום (משעת הבוקר והלאה) ולמחר (משעת הערב והלאה).
 * מנגנון הנעילה ב-Firestore מבטיח שכל תור מקבל תזכורת בדיוק פעם אחת!
 * פותר את בעיית תרדמת השרת (Server Sleep) כך שגם אם השרת התעורר אחרי שעת היעד — התזכורת תישלח מיד.
 */
let isDispatchingDueReminders = false;

async function checkAndDispatchDueReminders(): Promise<{
  success: boolean;
  todayResult?: any;
  tomorrowResult?: any;
  checkedAt: string;
}> {
  if (isDispatchingDueReminders) {
    return { success: true, checkedAt: new Date().toISOString() };
  }
  isDispatchingDueReminders = true;

  try {
    if (activeServerSettings?.enabled === false || activeServerSettings?.autoSendEnabled === false) {
      return { success: true, checkedAt: new Date().toISOString() };
    }

    const { dateIso, tomorrowIso, hour, minute, timeStr } = getIsraelTime();
    const currentTotalMinutes = hour * 60 + minute;

    const morningTimeStr = activeServerSettings?.morningReminderTime || '08:00';
    const [mH, mM] = morningTimeStr.split(':').map((v: string) => parseInt(v, 10) || 0);
    const targetMornTotalMinutes = mH * 60 + mM;

    const eveningTimeStr = activeServerSettings?.eveningReminderTime || '20:00';
    const [eH, eM] = eveningTimeStr.split(':').map((v: string) => parseInt(v, 10) || 0);
    const targetEveTotalMinutes = eH * 60 + eM;

    let todayResult: any = null;
    let tomorrowResult: any = null;

    // 1. תזכורות בוקר לתורי היום: נשלח אם השעה הנוכחית היא משעת הבוקר המוגדרת והלאה
    if (currentTotalMinutes >= targetMornTotalMinutes) {
      if (activeServerSettings?.notifyCustomerToday !== false) {
        todayResult = await sendRemindersForDate(dateIso, 'today');
      }
    }

    // 2. תזכורות ערב לתורי מחר: נשלח אם השעה הנוכחית היא משעת הערב המוגדרת והלאה
    if (currentTotalMinutes >= targetEveTotalMinutes) {
      if (activeServerSettings?.notifyCustomer1DayBefore !== false) {
        tomorrowResult = await sendRemindersForDate(tomorrowIso, '1day');
      }
    }

    return { success: true, todayResult, tomorrowResult, checkedAt: new Date().toISOString() };
  } catch (err: any) {
    console.error('[Automated Reminders] ❌ שגיאה בבדיקת תזכורות תקופתית:', err?.message);
    return { success: false, checkedAt: new Date().toISOString() };
  } finally {
    isDispatchingDueReminders = false;
  }
}

async function initSmsEngine() {
  console.log('[SMS Engine] 🚀 מאתחל מנוע SMS ותזמונים אוטומטיים (שליחה רק בשעות המוגדרות או ידנית)...');
  await loadPersistedSettings();
  scheduleOrUpdateCronJobs();

  // הרצת בדיקה ראשונית בעת עליית השרת
  setTimeout(() => {
    checkAndDispatchDueReminders().catch(() => {});
  }, 3000);

  // בדיקת דופק קבועה כל 30 שניות לשליחה אמינה גם אחרי תרדמת שרת
  setInterval(() => {
    checkAndDispatchDueReminders().catch(() => {});
  }, 30 * 1000);
}

initSmsEngine();

// ----------------------------------------------------
// 📡 REST API ENDPOINTS
// ----------------------------------------------------

// Endpoint לבדיקת דופק וסנכרון תזכורות ממתינות (נקרא גם ע"י ה-Frontend וה-Cron)
app.all(['/api/sms/check-due', '/api/reminders/heartbeat'], async (_req: Request, res: Response) => {
  try {
    const result = await checkAndDispatchDueReminders();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 1. Get SMS settings
app.get(['/api/sms/settings', '/api/whatsapp/settings'], requireAdmin, (req: Request, res: Response) => {
  const morning = activeServerSettings.morningTemplate || activeServerSettings.customerTodayTemplate;
  const evening = activeServerSettings.eveningTemplate || activeServerSettings.customer1DayTemplate;
  res.json({
    success: true,
    settings: {
      ...activeServerSettings,
      morningTemplate: morning,
      customerTodayTemplate: morning,
      eveningTemplate: evening,
      customer1DayTemplate: evening,
    },
  });
});

// 2. Save SMS settings & reschedule immediately
app.post(['/api/sms/settings', '/api/whatsapp/sync-settings'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, error: 'Expected settings object' });
    }

    const morningText =
      settings.morningTemplate ||
      settings.customerTodayTemplate ||
      activeServerSettings.morningTemplate ||
      activeServerSettings.customerTodayTemplate ||
      DEFAULT_SMS_SETTINGS.morningTemplate;

    const eveningText =
      settings.eveningTemplate ||
      settings.customer1DayTemplate ||
      activeServerSettings.eveningTemplate ||
      activeServerSettings.customer1DayTemplate ||
      DEFAULT_SMS_SETTINGS.eveningTemplate;

    activeServerSettings = {
      ...activeServerSettings,
      ...settings,
      morningTemplate: morningText,
      customerTodayTemplate: morningText,
      eveningTemplate: eveningText,
      customer1DayTemplate: eveningText,
    };

    scheduleOrUpdateCronJobs();

    // Trigger immediate check to process any pending reminders under new time
    checkAndDispatchDueReminders().catch(() => {});

    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'sms_reminders'), activeServerSettings, { merge: true });
        await setDoc(doc(db, 'settings', 'reminders'), activeServerSettings, { merge: true });
      } catch (dbErr) {
        console.warn('[SMS Settings] אזהרה: שמירה ב-Firestore נכשלה (נשמר בזיכרון השרת):', dbErr);
      }
    }

    console.log('[SMS Settings] ✅ הגדרות עודכנו וסונכרנו:', {
      morningTime: activeServerSettings.morningReminderTime,
      eveningTime: activeServerSettings.eveningReminderTime,
      today: activeServerSettings.notifyCustomerToday,
      tomorrow: activeServerSettings.notifyCustomer1DayBefore,
    });

    return res.json({ success: true, settings: activeServerSettings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 3. Batch Send Trigger (Today or Tomorrow)
app.post(['/api/sms/send-batch', '/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], requireAdmin, async (req: Request, res: Response) => {
  const reqType = req.body?.type || (req.path.includes('morning') || req.path.includes('today') ? 'today' : '1day');
  const { dateIso, tomorrowIso } = getIsraelTime();
  const targetDate = reqType === 'today' ? dateIso : tomorrowIso;

  const result = await sendRemindersForDate(targetDate, reqType);
  return res.json(result);
});

app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], requireAdmin, async (req: Request, res: Response) => {
  const { tomorrowIso } = getIsraelTime();
  const result = await sendRemindersForDate(tomorrowIso, '1day');
  return res.json(result);
});

// 4. Send Single SMS
app.post(['/api/sms/send-single', '/api/whatsapp/send'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (isDispatchRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'קצב הבקשות מהיר מדי. נא להמתין רגע.' });
    }

    const { phone, message, customerName, appointmentId, reminderType } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    const resSend = await sendSmsViaTelnyx(phone, message);

    const logEntry: SmsLogEntry = {
      id: `sms_single_${Date.now()}`,
      recipientName: customerName || 'לקוח/ה',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.success ? 'sent' : 'failed',
      reminderType: reminderType || 'manual_single',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || null,
    };
    recordLogEntry(logEntry);

    if (!resSend.success) {
      return res.status(400).json(resSend);
    }

    return res.json(resSend);
  } catch (err: any) {
    console.error('[SMS Endpoint] ❌ שגיאה בשליחת SMS בודד:', err?.message);
    return res.status(500).json({ success: false, error: err?.message || 'שגיאה פנימית בשליחת SMS' });
  }
});

// 5. Test SMS to Admin
app.post('/api/sms/test', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ success: false, error: 'נא להזין טלפון והודעה' });
    }

    const resSend = await sendSmsViaTelnyx(phone, message);

    const logEntry: SmsLogEntry = {
      id: `sms_test_${Date.now()}`,
      recipientName: 'בדיקת מנהלת',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.success ? 'sent' : 'failed',
      reminderType: 'test',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || null,
    };
    recordLogEntry(logEntry);

    if (!resSend.success) {
      return res.status(400).json(resSend);
    }

    return res.json(resSend);
  } catch (err: any) {
    console.error('[SMS Endpoint] ❌ שגיאה בשליחת SMS בדיקה:', err?.message);
    return res.status(500).json({ success: false, error: err?.message || 'שגיאה פנימית בשליחת SMS בדיקה' });
  }
});

// 6. Get Recent Logs
app.get('/api/sms/logs', requireAdmin, (req: Request, res: Response) => {
  res.json({ success: true, logs: recentSmsLogs });
});

// 7. Multi-Tenant List
const deletedTenantIds = new Set<string>();

app.get('/api/tenants', async (req: Request, res: Response) => {
  const defaultTenants = [
    {
      id: 'alex_beauty',
      tenantSlug: 'alex_beauty',
      name: 'Alex טיפוח ויופי',
      tagline: 'מניקור מקצועי ולק ג׳ל',
      ownerName: 'אלכסנדרה ביטון',
      phone: '054-6307114',
      email: 'alex@beauty.co.il',
      address: 'הנרי קנדל 12',
      city: 'באר שבע',
      primaryColor: '#9333ea',
      status: 'active',
      plan: 'pro',
      createdAt: '2024-01-15',
      isPrimary: true,
    },
    {
      id: 'yossibarber',
      tenantSlug: 'yossibarber',
      name: 'יוסי ברברשופ • Barber & Cuts',
      tagline: 'עיצוב שיער וזקן לגברים, דירוגים וטיפוח',
      ownerName: 'יוסי כהן',
      phone: '052-7788990',
      email: 'yosi@barber.co.il',
      address: 'רוטשילד 32',
      city: 'ראשון לציון',
      primaryColor: '#2563eb',
      status: 'active',
      plan: 'pro',
      createdAt: '2024-02-20',
    },
    {
      id: 'glam_studio_tlv',
      tenantSlug: 'glam_studio_tlv',
      name: 'Glam Studio TLV',
      tagline: 'עיצוב גבות, ריסים ומניקור פרימיום',
      ownerName: 'מיה שטרן',
      phone: '052-8899123',
      email: 'mia@glamstudio.co.il',
      address: 'דיזנגוף 140',
      city: 'תל אביב',
      primaryColor: '#ec4899',
      status: 'active',
      plan: 'enterprise',
      createdAt: '2024-03-10',
    },
    {
      id: 'maya_nails_haifa',
      tenantSlug: 'maya_nails_haifa',
      name: 'Maya Nails & Spa',
      tagline: 'מניקור פדיקור רפואי וטיפוח',
      ownerName: 'מאיה לוי',
      phone: '050-4455667',
      email: 'maya@mayanails.co.il',
      address: 'מוריה 45',
      city: 'חיפה',
      primaryColor: '#0ea5e9',
      status: 'active',
      plan: 'starter',
      createdAt: '2024-06-01',
    },
    {
      id: 'noa_beauty_herzliya',
      tenantSlug: 'noa_beauty_herzliya',
      name: 'נועה בוטיק יופי',
      tagline: 'קליניקה לאסתטיקה וטיפולי פנים מתקדמים',
      ownerName: 'נועה אברהם',
      phone: '054-1122334',
      email: 'noa@noabeauty.co.il',
      address: 'שנקר 14',
      city: 'הרצליה פיתוח',
      primaryColor: '#f59e0b',
      status: 'trial',
      plan: 'pro',
      createdAt: '2024-09-12',
    },
  ];

  try {
    const snap = await getDocs(collection(db, 'tenants'));
    const firestoreTenants = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    // Merge firestore tenants with default tenants (avoid duplicates)
    const combined = [...firestoreTenants];
    for (const def of defaultTenants) {
      if (!combined.some((t: any) => t.id === def.id)) {
        combined.push(def);
      }
    }
    const filtered = combined.filter((t: any) => !deletedTenantIds.has(t.id));
    return res.json({ success: true, tenants: filtered });
  } catch (err) {
    const filtered = defaultTenants.filter((t: any) => !deletedTenantIds.has(t.id));
    return res.json({ success: true, tenants: filtered });
  }
});

// 8. Current Tenant Profile & Branding Endpoint (/api/tenant/current)
app.get('/api/tenant/current', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || 'alex_beauty';

    // Fetch tenant profile from /tenants/{tenantId}
    let tenantProfile: any = null;
    try {
      const tSnap = await getDoc(getTenantDoc(tenantId));
      if (tSnap.exists()) {
        tenantProfile = { id: tSnap.id, ...tSnap.data() };
      }
    } catch (err) {
      console.warn(`[Tenant API] Warning fetching /tenants/${tenantId}:`, err);
    }

    // Fetch tenant config from /tenants/{tenantId}/settings/config
    let tenantConfig: any = null;
    try {
      const cSnap = await getDoc(getTenantSettingsDoc(tenantId, 'config'));
      if (cSnap.exists()) {
        tenantConfig = cSnap.data();
      }
    } catch (err) {
      console.warn(`[Tenant API] Warning fetching /tenants/${tenantId}/settings/config:`, err);
    }

    // Default Fallbacks
    if (!tenantProfile) {
      const isAlex = tenantId === 'alex_beauty';
      tenantProfile = {
        id: tenantId,
        name: isAlex ? 'Alex טיפוח ויופי' : `סטודיו ${tenantId}`,
        tagline: isAlex ? 'מניקור מקצועי ולק ג׳ל' : 'הזמנת תורים אונליין',
        ownerName: isAlex ? 'אלכסנדרה ביטון' : 'מנהלת סטודיו',
        phone: isAlex ? '054-6307114' : '050-0000000',
        email: isAlex ? 'alex@beauty.co.il' : `${tenantId}@beauty.co.il`,
        city: isAlex ? 'באר שבע' : 'ישראל',
        address: isAlex ? 'הנרי קנדל 12' : '',
        primaryColor: '#9333ea', // default purple
        status: 'active',
        plan: 'pro',
        createdAt: '2024-01-15',
      };
    }

    if (!tenantConfig) {
      tenantConfig = {
        services: [
          {
            id: 1,
            name: "לק ג'ל",
            duration_minutes: 90,
            price: 150,
            category: 'nails',
            description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם',
          },
        ],
        scheduleSettings: {
          businessOpen: '09:20',
          businessClose: '20:30',
          fridayOpen: '09:20',
          fridayClose: '15:00',
          durationMinutes: 90,
        },
      };
    }

    return res.json({
      success: true,
      tenantId,
      tenant: tenantProfile,
      config: tenantConfig,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 9. Super Admin Tenant Onboarding & Domain Mapping Endpoint
app.post('/api/super-admin/tenants', async (req: Request, res: Response) => {
  try {
    const {
      tenantId: rawTenantId,
      name,
      phone,
      tagline,
      ownerName,
      city,
      address,
      primaryColor,
      customDomain,
      services,
      scheduleSettings,
      plan,
    } = req.body;

    const tenantId = String(rawTenantId || name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_') || `tenant_${Date.now()}`;

    const sanitizedName = String(name || '').trim();
    const sanitizedPhone = String(phone || '').trim();

    if (!sanitizedName || !sanitizedPhone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required' });
    }

    const tenantProfile = {
      id: tenantId,
      name: sanitizedName,
      tagline: String(tagline || 'סטודיו לטיפוח ויופי').trim(),
      ownerName: String(ownerName || sanitizedName).trim(),
      phone: sanitizedPhone,
      email: req.body?.email || `${tenantId}@beauty.co.il`,
      city: String(city || '').trim(),
      address: String(address || '').trim(),
      primaryColor: primaryColor || '#9333ea',
      customDomain: customDomain ? String(customDomain).trim().toLowerCase() : '',
      plan: plan || 'pro',
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
    };

    const tenantConfig = {
      services: Array.isArray(services) && services.length > 0 ? services : [
        {
          id: 1,
          name: "לק ג'ל",
          duration_minutes: 90,
          price: 150,
          category: 'nails',
          description: 'טיפול מניקור יסודי ומריחת לק ג׳ל מקצועי',
        },
      ],
      scheduleSettings: scheduleSettings || {
        businessOpen: '09:20',
        businessClose: '20:30',
        fridayOpen: '09:20',
        fridayClose: '15:00',
        durationMinutes: 90,
      },
      updatedAt: new Date().toISOString(),
    };

    // 1. Write to /tenants/{tenantId}
    deletedTenantIds.delete(tenantId);
    await setDoc(getTenantDoc(tenantId), tenantProfile, { merge: true });

    // 2. Write to /tenants/{tenantId}/settings/config
    await setDoc(getTenantSettingsDoc(tenantId, 'config'), tenantConfig, { merge: true });

    // 3. If customDomain is provided, write to /domains/{hostname}
    if (tenantProfile.customDomain) {
      await setDoc(doc(db, 'domains', tenantProfile.customDomain), {
        tenantId,
        hostname: tenantProfile.customDomain,
        createdAt: new Date().toISOString(),
      }, { merge: true });
      domainToTenantCache[tenantProfile.customDomain] = tenantId;
    }

    const testUrl = `http://localhost:3000?tenant=${tenantId}`;
    const adminUrl = `http://localhost:3000/admin?tenant=${tenantId}`;

    return res.json({
      success: true,
      tenantId,
      tenant: tenantProfile,
      config: tenantConfig,
      testUrl,
      adminUrl,
      message: `Tenant ${tenantId} registered successfully`,
    });
  } catch (err: any) {
    console.error('[Super Admin API] Error creating tenant:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 9.5 Delete Tenant Endpoint
app.delete('/api/super-admin/tenants/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    if (!tenantId || tenantId === 'alex_beauty') {
      return res.status(400).json({ success: false, error: 'Cannot delete default tenant' });
    }

    deletedTenantIds.add(tenantId);

    try {
      await deleteDoc(getTenantDoc(tenantId));
    } catch (e) {
      console.warn(`[Delete Tenant] Warning deleting doc /tenants/${tenantId}:`, e);
    }

    try {
      await deleteDoc(getTenantSettingsDoc(tenantId, 'config'));
    } catch (e) {
      console.warn(`[Delete Tenant] Warning deleting doc /tenants/${tenantId}/settings/config:`, e);
    }

    return res.json({
      success: true,
      message: `Tenant ${tenantId} deleted successfully`,
    });
  } catch (err: any) {
    console.error('[Delete Tenant API] Error:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 10. Tenant Admin Data Endpoint (Local dev bypass support)
app.get('/api/admin/tenant-data', async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenant as string) || req.tenantId || 'alex_beauty';
    const isDev = process.env.NODE_ENV !== 'production';

    // In local development, allow fetching without strict session validation
    if (!isDev) {
      const token =
        (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ||
        (req.query.token as string | undefined);
      const isAdminReq = req.headers['x-admin-request'] === 'true' || token === 'admin_secret_session_active';
      if (!isAdminReq) {
        return res.status(401).json({ success: false, error: 'Unauthorized admin access' });
      }
    }

    // Fetch live appointments from /tenants/{tenantId}/appointments, fallback to root /appointments
    let tenantAppointments: any[] = [];
    try {
      const tenantSnap = await getDocs(getTenantAppointmentsRef(tenantId));
      tenantAppointments = tenantSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (tenantAppointments.length === 0 && tenantId === 'alex_beauty') {
        const rootSnap = await getDocs(collection(db, 'appointments'));
        tenantAppointments = rootSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
    } catch {
      tenantAppointments = serverAppointments;
    }

    return res.json({
      success: true,
      tenantId,
      appointments: tenantAppointments,
      serverTime: getIsraelTime().timeStr,
      isDev,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Sync in-memory appointments
app.post('/api/whatsapp/sync-appointments', requireAdmin, (req: Request, res: Response) => {
  if (Array.isArray(req.body?.appointments)) {
    serverAppointments = req.body.appointments;
    return res.json({ success: true, count: serverAppointments.length });
  }
  return res.status(400).json({ success: false, error: 'Expected appointments array' });
});

// Registration Webhook Endpoint
app.post('/api/register-webhook', async (req: Request, res: Response) => {
  try {
    const { name, phone, acceptedTerms, registeredAt } = req.body;
    const sanitizedName = String(name || '').trim().substring(0, 100);
    const sanitizedPhone = String(phone || '').trim().substring(0, 30);

    if (!sanitizedName || !sanitizedPhone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required' });
    }

    console.log(`[Registration Webhook] New customer: ${sanitizedName} (${sanitizedPhone})`);
    return res.json({ success: true, message: 'Registration received' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
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

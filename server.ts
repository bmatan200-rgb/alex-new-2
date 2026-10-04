import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseClientConfig from './firebase-applet-config.json';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Firebase Admin must always use the explicit Render service-account secret.
// Never fall back to Application Default Credentials on Render: there is no ADC there,
// and that fallback caused the v12 deploy crash (NO_ADC_FOUND).
let adminSdkReady = false;
let db: ReturnType<typeof getFirestore>;

function parseFirebaseServiceAccount(rawValue?: string) {
  if (!rawValue || !rawValue.trim()) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing or empty');
  }

  let raw = rawValue.trim();
  let parsed: any;

  // Render secrets are commonly stored in one of three forms:
  // 1) raw JSON, 2) JSON wrapped as a quoted string, 3) base64 encoded JSON.
  const tryJson = (value: string) => {
    try { return JSON.parse(value); } catch { return null; }
  };

  parsed = tryJson(raw);
  if (typeof parsed === 'string') parsed = tryJson(parsed);

  if (!parsed || typeof parsed !== 'object') {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8').trim();
      parsed = tryJson(decoded);
      if (typeof parsed === 'string') parsed = tryJson(parsed);
    } catch {
      // handled by validation below
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON/base64 JSON');
  }

  // cert() expects real newlines in the PEM key. Render values are often pasted with \\n.
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id/client_email/private_key');
  }

  return parsed;
}

try {
  const serviceAccount = parseFirebaseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  const adminApp = getApps()[0] || initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  // IMPORTANT: this Firebase project uses a NAMED Firestore database, not `(default)`.
  // The browser app already points at firebase-applet-config.json -> firestoreDatabaseId.
  // Admin SDK must use the exact same database or Firestore returns gRPC 5 NOT_FOUND.
  const firestoreDatabaseId = (process.env.FIRESTORE_DATABASE_ID || firebaseClientConfig.firestoreDatabaseId || '').trim();
  if (!firestoreDatabaseId) {
    throw new Error('Firestore database ID is missing (set FIRESTORE_DATABASE_ID or firestoreDatabaseId in firebase-applet-config.json)');
  }
  db = getFirestore(adminApp, firestoreDatabaseId);
  adminSdkReady = true;
  console.log(`[Firebase Admin] ✅ Service Account מחובר לפרויקט ${serviceAccount.project_id}`);
  console.log(`[Firebase Admin] ✅ Firestore database: ${firestoreDatabaseId}`);
} catch (err: any) {
  console.error('[Firebase Admin] ❌ לא ניתן לאתחל FIREBASE_SERVICE_ACCOUNT:', err?.message || err);
  // Authentication, tenant isolation, migrations and reminders all depend on Admin SDK.
  // Failing clearly is safer than starting a half-working server or silently using ADC.
  process.exit(1);
  throw err;
}

// Small compatibility helpers keep the rest of this server readable while using Admin SDK.
const collection = (_db: any, ...segments: string[]) => db.collection(segments.join('/'));
const doc = (base: any, ...segments: string[]) => {
  if (base && typeof base.doc === 'function' && segments.length === 1) return base.doc(segments[0]);
  return db.doc(segments.join('/'));
};
const getDoc = (ref: any) => ref.get();
const getDocs = (ref: any) => ref.get();
const setDoc = (ref: any, data: any, options?: any) => options?.merge ? ref.set(data, { merge: true }) : ref.set(data);
const deleteDoc = (ref: any) => ref.delete();
const runTransaction = (firestore: any, fn: any) => firestore.runTransaction(fn);
type WhereConstraint = { field: string; op: any; value: any };
const where = (field: string, op: any, value: any): WhereConstraint => ({ field, op, value });
const query = (ref: any, ...constraints: WhereConstraint[]) => constraints.reduce((q: any, c) => q.where(c.field, c.op, c.value), ref);

const normalizePhone = (p?: string) => (p || '').replace(/\D/g, '');

// Security: JSON body parser with size limit to prevent Denial of Service attacks
// Tenant cover images are sent as compressed data URLs from Super Admin.
// Keep this above the client-side cover cap; Firestore still receives a much smaller (<400KB) image.
app.use(express.json({ limit: '2mb' }));

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
        if (domainSnap.exists) {
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
    const tenantId = String(req.body?.tenantId || req.tenantId || 'alex_beauty');
    const appointmentsRef = getTenantAppointmentsRef(tenantId);
    const appointmentRef = getTenantAppointmentDoc(tenantId, String(appointmentId));

    const idStr = String(appointmentId);

    // Admin check
    const token =
      (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '') ||
      (req.body?.sessionToken as string | undefined);
    let isAdmin = false;
    if (!isAdmin && token && adminSdkReady) {
      try {
        await getAuth().verifyIdToken(token);
        isAdmin = true;
      } catch {
        // ignore
      }
    }

    const snap = await getDoc(appointmentRef);
    const snapData = snap.exists ? snap.data() : null;

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
      await deleteDoc(appointmentRef);
    } catch {
      if (snap.exists) {
        try {
          await setDoc(appointmentRef, { status: 'cancelled', updated_at: nowIso }, { merge: true });
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
          await deleteDoc(getTenantAppointmentDoc(tenantId, sId));
        } catch {
          // ignore
        }
      }

      // Query and delete all matching documents in appointments collection for this date and time
      try {
        const q = query(
          appointmentsRef,
          where('appointment_date', '==', apptDate),
          where('start_time', '==', apptTime)
        );
        const querySnap = await getDocs(q);
        for (const docItem of querySnap.docs) {
          try {
            await deleteDoc(doc(appointmentsRef, docItem.id));
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
    
    const tenantId = String(req.body?.tenantId || req.tenantId || 'alex_beauty');
    const appointmentsRef = getTenantAppointmentsRef(tenantId);
    const idStr = String(appointmentId);
    try {
      await deleteDoc(getTenantAppointmentDoc(tenantId, idStr));
    } catch {
      // ignore
    }

    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await deleteDoc(getTenantAppointmentDoc(tenantId, sId));
        } catch {
          // ignore
        }
      }

      // Query and delete all matching documents in appointments collection for this date and time
      try {
        const q = query(
          appointmentsRef,
          where('appointment_date', '==', appointmentDate),
          where('start_time', '==', startTime)
        );
        const querySnap = await getDocs(q);
        for (const docItem of querySnap.docs) {
          try {
            await deleteDoc(doc(appointmentsRef, docItem.id));
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
      getTenantSettingsDoc(String(req.body?.tenantId || req.tenantId || 'alex_beauty'), 'config'),
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
      getTenantSettingsDoc(String(req.body?.tenantId || req.tenantId || 'alex_beauty'), 'config'),
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
// One-time legacy data migration (old global collections -> primary tenant)
// ----------------------------------------------------
app.post('/api/admin/migrate-legacy-alex', requireAdmin, async (req: Request, res: Response) => {
  try {
    const targetTenantId = 'alex_beauty';
    const [legacyAppointments, legacyCustomers] = await Promise.all([
      getDocs(collection(db, 'appointments')),
      getDocs(collection(db, 'customers')),
    ]);

    let appointmentsCopied = 0;
    let customersCopied = 0;

    for (const item of legacyAppointments.docs) {
      const targetRef = getTenantAppointmentDoc(targetTenantId, item.id);
      const existing = await getDoc(targetRef);
      if (!existing.exists) {
        await setDoc(targetRef, { ...item.data(), tenantId: targetTenantId }, { merge: true });
        appointmentsCopied++;
      }
    }

    for (const item of legacyCustomers.docs) {
      const targetRef = doc(db, 'tenants', targetTenantId, 'customers', item.id);
      const existing = await getDoc(targetRef);
      if (!existing.exists) {
        await setDoc(targetRef, { ...item.data(), tenantId: targetTenantId }, { merge: true });
        customersCopied++;
      }
    }

    return res.json({
      success: true,
      targetTenantId,
      appointmentsFound: legacyAppointments.size,
      customersFound: legacyCustomers.size,
      appointmentsCopied,
      customersCopied,
      message: 'Legacy data copied to the primary tenant. Global collections were not deleted.',
    });
  } catch (err: any) {
    console.error('[Legacy Migration] Error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Migration failed' });
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
    const tenantId = String(req.body?.tenantId || req.tenantId || 'alex_beauty');
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'מספר טלפון לא תקין' });
    }

    const trimmedName = (full_name || '').trim();
    const docId = `cust_${cleanPhone}`;
    const nowIso = new Date().toISOString();
    const customerRef = doc(db, 'tenants', tenantId, 'customers', docId);

    const snap = await getDoc(customerRef);
    if (snap.exists) {
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
    const tenantId = String(req.query?.tenant || req.tenantId || 'alex_beauty');
    const [custsSnap, apptsSnap] = await Promise.all([
      getDocs(collection(db, 'tenants', tenantId, 'customers')),
      getDocs(getTenantAppointmentsRef(tenantId)),
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
        setDoc(doc(db, 'tenants', tenantId, 'customers', docId), {
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
    const tenantId = String(req.query?.tenant || req.tenantId || 'alex_beauty');
    if (!id) return res.status(400).json({ success: false, error: 'Missing customer id' });
    await deleteDoc(doc(db, 'tenants', tenantId, 'customers', id));
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
type AdminRole = 'super_admin' | 'business_admin';

type AdminPayload = {
  uid: string;
  email?: string;
  role: AdminRole;
  tenantId?: string;
};

function getSuperAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

async function decodeAdmin(req: Request): Promise<AdminPayload | null> {
  if (!adminSdkReady) return null;
  const token = (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const decoded: any = await getAuth().verifyIdToken(token);
  const email = String(decoded.email || '').toLowerCase();
  const superEmails = getSuperAdminEmails();
  if (decoded.role === 'super_admin' || superEmails.includes(email)) {
    // Bootstrap/migrate the configured owner into a real Firebase custom claim.
    if (decoded.role !== 'super_admin' && superEmails.includes(email)) {
      await getAuth().setCustomUserClaims(decoded.uid, { role: 'super_admin' });
    }
    return { uid: decoded.uid, email: decoded.email, role: 'super_admin' };
  }
  if (decoded.role === 'business_admin' && decoded.tenantId) {
    return { uid: decoded.uid, email: decoded.email, role: 'business_admin', tenantId: String(decoded.tenantId) };
  }
  return null;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await decodeAdmin(req);
    if (!admin) return res.status(403).json({ success: false, error: 'לחשבון אין הרשאת ניהול' });

    if (admin.role === 'business_admin') {
      const requestedTenant = String(req.body?.tenantId || req.query?.tenant || req.headers['x-tenant-id'] || '');
      if (requestedTenant && requestedTenant !== admin.tenantId) {
        return res.status(403).json({ success: false, error: 'אין הרשאה לעסק אחר' });
      }
      req.tenantId = admin.tenantId;
      if (req.body && typeof req.body === 'object') req.body.tenantId = admin.tenantId;
    }
    (req as any).adminPayload = admin;
    return next();
  } catch (err: any) {
    console.warn('[Auth] token verification failed:', err?.message);
    return res.status(401).json({ success: false, error: 'ההתחברות פגה, יש להתחבר מחדש' });
  }
}

async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await decodeAdmin(req);
    if (!admin || admin.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'נדרשת הרשאת Super Admin' });
    }
    (req as any).adminPayload = admin;
    return next();
  } catch {
    return res.status(401).json({ success: false, error: 'ההתחברות פגה, יש להתחבר מחדש' });
  }
}

app.get('/api/auth/me', requireAdmin, (req: Request, res: Response) => {
  const admin = (req as any).adminPayload as AdminPayload;
  res.json({ success: true, user: admin });
});

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
  created_at?: string;
}

const serverAppointmentsByTenant: Record<string, ServerAppointment[]> = {};
let serverAppointments: ServerAppointment[] = []; // legacy process-local mirror
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
function formatMessageTemplate(template: string, appt: any, brand: any = PRIMARY_TENANT_PROFILE): string {
  const [y, m, d] = (appt.appointment_date || '').split('-');
  const israeliDate = y && m && d ? `${d}/${m}/${y}` : (appt.appointment_date || '');
  return (template || '')
    .replace(/{customer_name}/g, appt.customer_name || '')
    .replace(/{service_name}/g, appt.service_name || "לק ג'ל")
    .replace(/{start_time}/g, appt.start_time || '')
    .replace(/{end_time}/g, appt.end_time || '')
    .replace(/{appointment_date}/g, israeliDate)
    .replace(/{customer_phone}/g, appt.customer_phone || '')
    .replace(/{salon_name}/g, brand?.name || 'העסק')
    .replace(/{phone}/g, brand?.phone || '')
    .replace(/{owner_name}/g, brand?.ownerName || brand?.name || '');
}

// Fetch Confirmed Appointments from Firestore
async function fetchAppointmentsForDate(targetDate: string, tenantId = 'alex_beauty'): Promise<ServerAppointment[]> {
  const list: ServerAppointment[] = [];
  try {
    if (db) {
      const q = query(
        getTenantAppointmentsRef(tenantId),
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
            created_at: d.created_at || d.createdAt || '',
          });
        }
      });
    }
  } catch (err) {
    console.warn(`[Appointments Query] שגיאה בשליפת תורים לתאריך ${targetDate}:`, err);
  }

  // Also include in-memory sync if present
  const tenantMemoryAppointments = serverAppointmentsByTenant[tenantId] || [];
  if (tenantMemoryAppointments.length > 0) {
    for (const mem of tenantMemoryAppointments) {
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
async function tryClaimReminderLock(key: string, tenantId = 'alex_beauty'): Promise<boolean> {
  if (!db) return true;
  const lockRef = doc(db, 'tenants', tenantId, 'reminder_locks', key);
  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(lockRef);
      if (snap.exists) {
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

async function markReminderLockSuccess(key: string, tenantId = 'alex_beauty'): Promise<void> {
  if (!db) return;
  try {
    const lockRef = doc(db, 'tenants', tenantId, 'reminder_locks', key);
    await setDoc(lockRef, { status: 'sent', sentAt: new Date().toISOString(), key }, { merge: true });
  } catch {
    // ignore
  }
}

async function releaseReminderLock(key: string, tenantId = 'alex_beauty'): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, 'tenants', tenantId, 'reminder_locks', key));
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

async function getTenantSmsSettings(tenantId: string): Promise<any> {
  try {
    const snap = await getDoc(getTenantSettingsDoc(tenantId, 'sms_reminders'));
    if (snap.exists) return { ...DEFAULT_SMS_SETTINGS, ...snap.data() };
    const config = await getDoc(getTenantSettingsDoc(tenantId, 'config'));
    if (config.exists) {
      const data: any = config.data();
      if (data.smsSettings) return { ...DEFAULT_SMS_SETTINGS, ...data.smsSettings };
    }
  } catch (err) { console.warn(`[SMS] settings load warning for ${tenantId}`, err); }
  return tenantId === PRIMARY_TENANT_ID ? { ...activeServerSettings } : { ...DEFAULT_SMS_SETTINGS };
}

async function getTenantBrand(tenantId: string): Promise<any> {
  try {
    const snap = await getDoc(getTenantDoc(tenantId));
    if (snap.exists) return { id: snap.id, ...snap.data() };
  } catch {}
  return tenantId === PRIMARY_TENANT_ID ? PRIMARY_TENANT_PROFILE : { id: tenantId, name: tenantId, phone: '', ownerName: '' };
}

// ----------------------------------------------------------------------
// Core Automated Batch Dispatcher
// ----------------------------------------------------------------------
function israelLocalStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d).reduce((a: any, p) => { a[p.type] = p.value; return a; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
function previousIsoDate(dateIso: string): string {
  const [y,m,d] = dateIso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - 1));
  return x.toISOString().slice(0, 10);
}

async function sendRemindersForDate(targetDate: string, reminderType: 'today' | '1day', tenantId = PRIMARY_TENANT_ID, tenantSettings?: any) {
  const smsSettings = tenantSettings || await getTenantSmsSettings(tenantId);
  const brand = await getTenantBrand(tenantId);
  const isMorning = reminderType === 'today';
  const typeLabel = isMorning ? 'תזכורת בוקר (יום התור)' : 'תזכורת ערב (יום לפני התור)';
  const currentIsraelTime = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

  console.log(`\n======================================================`);
  console.log(`[SMS Scheduler] 🚀 מתחיל ריצת ${typeLabel}`);
  console.log(`[SMS Scheduler] תאריך יעד: ${targetDate} | שעה בישראל: ${currentIsraelTime}`);
  console.log(`======================================================`);

  if (isMorning && smsSettings?.notifyCustomerToday === false) {
    console.log('[SMS Scheduler] ⏸️ תזכורת בוקר מבוטלת בהגדרות');
    return { success: true, count: 0, sentCount: 0, skipped: true };
  }

  if (!isMorning && smsSettings?.notifyCustomer1DayBefore === false) {
    console.log('[SMS Scheduler] ⏸️ תזכורת ערב מבוטלת בהגדרות');
    return { success: true, count: 0, sentCount: 0, skipped: true };
  }

  try {
    let appointments = await fetchAppointmentsForDate(targetDate, tenantId);
    // Do not instantly send a scheduled reminder to an appointment that was created AFTER
    // that day's configured reminder time. This fixes the 'created after 20:00 => immediate SMS' bug.
    const cutoffDate = isMorning ? targetDate : previousIsoDate(targetDate);
    const cutoffTime = isMorning ? String(smsSettings.morningReminderTime || '08:00') : String(smsSettings.eveningReminderTime || '20:00');
    const cutoffStamp = `${cutoffDate} ${cutoffTime}`;
    appointments = appointments.filter((a) => !a.created_at || israelLocalStamp(a.created_at) <= cutoffStamp);
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

      const claimed = await tryClaimReminderLock(lockKey, tenantId);
      if (!claimed) {
        console.log(`[SMS Scheduler] ⏭️ דילוג (נשלח כבר בעבר): ${firstAppt.customer_name} (${firstAppt.customer_phone})`);
        continue;
      }

      let messageText = '';
      if (appts.length === 1) {
        const rawTemplate = isMorning
          ? (smsSettings?.morningTemplate || smsSettings?.customerTodayTemplate || DEFAULT_SMS_SETTINGS.morningTemplate)
          : (smsSettings?.eveningTemplate || smsSettings?.customer1DayTemplate || DEFAULT_SMS_SETTINGS.eveningTemplate);
        messageText = formatMessageTemplate(rawTemplate, firstAppt, brand);
      } else {
        const [y, m, d] = targetDate.split('-');
        const israeliDate = `${d}/${m}/${y}`;
        const appointmentsList = appts.map((a) => `✨ בשעה ${a.start_time} - ${a.service_name}`).join('\n');
        messageText = isMorning
          ? `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך להיום (${israeliDate}):\n${appointmentsList}\nלבירור: ${brand?.phone || ''}\nנתראה! 💖`
          : `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך למחר (${israeliDate}):\n${appointmentsList}\nלבירור: ${brand?.phone || ''}\nמחכים לראותך! 💖`;
      }

      const res = await sendSmsViaTelnyx(firstAppt.customer_phone, messageText);

      const logEntry: SmsLogEntry = {
        id: `sms_${tenantId}_${Date.now()}_${firstAppt.id}`,
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
        await markReminderLockSuccess(lockKey, tenantId);
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: true });
      } else {
        failedCount += appts.length;
        await releaseReminderLock(lockKey, tenantId);
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
      if (snapSms.exists) {
        data = snapSms.data();
      } else {
        const snapOld = await getDoc(doc(db, 'settings', 'reminders'));
        if (snapOld.exists) {
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

async function checkAndDispatchDueReminders(): Promise<any> {
  if (isDispatchingDueReminders) return { success: true, checkedAt: new Date().toISOString() };
  isDispatchingDueReminders = true;
  try {
    const { dateIso, tomorrowIso, hour, minute } = getIsraelTime();
    const currentTotalMinutes = hour * 60 + minute;
    let tenantIds: string[] = [PRIMARY_TENANT_ID];
    try {
      const snap = await getDocs(collection(db, 'tenants'));
      tenantIds = Array.from(new Set([PRIMARY_TENANT_ID, ...snap.docs.map((d: any) => d.id)]));
    } catch {}

    const results: any[] = [];
    for (const tenantId of tenantIds) {
      const settings = await getTenantSmsSettings(tenantId);
      if (settings?.enabled === false || settings?.autoSendEnabled === false) continue;
      const [mH, mM] = String(settings.morningReminderTime || '08:00').split(':').map((v: string) => parseInt(v, 10) || 0);
      const [eH, eM] = String(settings.eveningReminderTime || '20:00').split(':').map((v: string) => parseInt(v, 10) || 0);
      const item: any = { tenantId };
      if (currentTotalMinutes >= mH * 60 + mM && settings.notifyCustomerToday !== false) {
        item.today = await sendRemindersForDate(dateIso, 'today', tenantId, settings);
      }
      if (currentTotalMinutes >= eH * 60 + eM && settings.notifyCustomer1DayBefore !== false) {
        item.tomorrow = await sendRemindersForDate(tomorrowIso, '1day', tenantId, settings);
      }
      results.push(item);
    }
    return { success: true, tenants: results, checkedAt: new Date().toISOString() };
  } catch (err: any) {
    console.error('[Automated Reminders] ❌ שגיאה בבדיקת תזכורות תקופתית:', err?.message);
    return { success: false, error: err?.message, checkedAt: new Date().toISOString() };
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
app.get(['/api/sms/settings', '/api/whatsapp/settings'], requireAdmin, async (req: Request, res: Response) => {
  const tenantId = String(req.query?.tenant || req.tenantId || PRIMARY_TENANT_ID);
  const settings = await getTenantSmsSettings(tenantId);
  const morning = settings.morningTemplate || settings.customerTodayTemplate;
  const evening = settings.eveningTemplate || settings.customer1DayTemplate;
  res.json({ success: true, settings: { ...settings, morningTemplate: morning, customerTodayTemplate: morning, eveningTemplate: evening, customer1DayTemplate: evening } });
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

    const tenantIdForSettings = String(req.body?.tenantId || req.tenantId || PRIMARY_TENANT_ID);
    const tenantSettings = {
      ...(await getTenantSmsSettings(tenantIdForSettings)),
      ...settings,
      morningTemplate: morningText,
      customerTodayTemplate: morningText,
      eveningTemplate: eveningText,
      customer1DayTemplate: eveningText,
    };
    if (tenantIdForSettings === PRIMARY_TENANT_ID) {
      activeServerSettings = { ...activeServerSettings, ...tenantSettings };
      scheduleOrUpdateCronJobs();
    }

    // Trigger immediate check to process any pending reminders under new time
    checkAndDispatchDueReminders().catch(() => {});

    if (db) {
      try {
        const tenantId = tenantIdForSettings;
        await setDoc(getTenantSettingsDoc(tenantId, 'sms_reminders'), tenantSettings, { merge: true });
        if (tenantId === PRIMARY_TENANT_ID) {
          // Keep legacy Alex settings mirrored during the migration period.
          await setDoc(doc(db, 'settings', 'sms_reminders'), tenantSettings, { merge: true });
        }
      } catch (dbErr) {
        console.warn('[SMS Settings] אזהרה: שמירה ב-Firestore נכשלה:', dbErr);
      }
    }

    console.log('[SMS Settings] ✅ הגדרות עודכנו וסונכרנו:', {
      morningTime: activeServerSettings.morningReminderTime,
      eveningTime: activeServerSettings.eveningReminderTime,
      today: activeServerSettings.notifyCustomerToday,
      tomorrow: activeServerSettings.notifyCustomer1DayBefore,
    });

    return res.json({ success: true, settings: tenantSettings });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 3. Batch Send Trigger (Today or Tomorrow)
app.post(['/api/sms/send-batch', '/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], requireAdmin, async (req: Request, res: Response) => {
  const reqType = req.body?.type || (req.path.includes('morning') || req.path.includes('today') ? 'today' : '1day');
  const { dateIso, tomorrowIso } = getIsraelTime();
  const targetDate = reqType === 'today' ? dateIso : tomorrowIso;

  const result = await sendRemindersForDate(targetDate, reqType, String(req.body?.tenantId || req.tenantId || PRIMARY_TENANT_ID));
  return res.json(result);
});

app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], requireAdmin, async (req: Request, res: Response) => {
  const { tomorrowIso } = getIsraelTime();
  const result = await sendRemindersForDate(tomorrowIso, '1day', String(req.body?.tenantId || req.tenantId || PRIMARY_TENANT_ID));
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

const PRIMARY_TENANT_ID = 'alex_beauty';
const PRIMARY_TENANT_PROFILE = {
  id: PRIMARY_TENANT_ID,
  tenantSlug: PRIMARY_TENANT_ID,
  name: 'Alex טיפוח ויופי',
  tagline: 'מניקור מקצועי ולק ג׳ל',
  ownerName: 'אלכסנדרה ביטון',
  phone: '054-6307114',
  email: 'alex@beauty.co.il',
  address: 'הנרי קנדל 12',
  city: 'באר שבע',
  primaryColor: '#9333ea',
  secondaryColor: '#c4b5fd',
  status: 'active',
  plan: 'pro',
  createdAt: '2024-01-15',
  isPrimary: true,
};

async function ensurePrimaryTenant(): Promise<void> {
  const tenantRef = getTenantDoc(PRIMARY_TENANT_ID);
  const existing = await getDoc(tenantRef);
  if (!existing.exists) {
    await setDoc(tenantRef, { ...PRIMARY_TENANT_PROFILE, migratedAt: new Date().toISOString() }, { merge: true });
  }

  const configRef = getTenantSettingsDoc(PRIMARY_TENANT_ID, 'config');
  const config = await getDoc(configRef);
  if (!config.exists) {
    await setDoc(configRef, {
      services: [{ id: 1, name: "לק ג'ל", duration_minutes: 90, price: 150, category: 'nails', description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם' }],
      scheduleSettings: { businessOpen: '09:20', businessClose: '20:30', fridayOpen: '09:20', fridayClose: '15:00', durationMinutes: 90 },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  // Idempotent legacy migration: copy only missing docs; never delete the old collections.
  const [legacyAppointments, legacyCustomers] = await Promise.all([
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'customers')),
  ]);
  for (const item of legacyAppointments.docs) {
    const target = getTenantAppointmentDoc(PRIMARY_TENANT_ID, item.id);
    if (!(await getDoc(target)).exists) await setDoc(target, { ...item.data(), tenantId: PRIMARY_TENANT_ID }, { merge: true });
  }
  for (const item of legacyCustomers.docs) {
    const target = doc(db, 'tenants', PRIMARY_TENANT_ID, 'customers', item.id);
    if (!(await getDoc(target)).exists) await setDoc(target, { ...item.data(), tenantId: PRIMARY_TENANT_ID }, { merge: true });
  }
}

app.get('/api/tenants', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    await ensurePrimaryTenant();
    const snap = await getDocs(collection(db, 'tenants'));
    const baseTenants = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((t: any) => !deletedTenantIds.has(t.id));

    // Keep dashboard counters truthful. Tenant documents are the source of identity;
    // appointment/customer counts are derived from each tenant's own collections.
    const tenants = await Promise.all(baseTenants.map(async (tenant: any) => {
      try {
        const [appointmentsSnap, customersSnap] = await Promise.all([
          getDocs(collection(db, 'tenants', tenant.id, 'appointments')),
          getDocs(collection(db, 'tenants', tenant.id, 'customers')),
        ]);
        return {
          ...tenant,
          totalAppointments: appointmentsSnap.size,
          totalCustomers: customersSnap.size,
          totalRevenue: Number(tenant.totalRevenue || 0),
        };
      } catch (countErr: any) {
        console.warn(`[Tenants API] count warning for ${tenant.id}:`, countErr?.message || countErr);
        return tenant;
      }
    }));
    return res.json({ success: true, tenants });
  } catch (err: any) {
    console.error('[Tenants API] Failed:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Failed to load tenants' });
  }
});

// 8. Current Tenant Profile & Branding Endpoint (/api/tenant/current)
app.get('/api/tenant/current', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || 'alex_beauty';
    if (tenantId === PRIMARY_TENANT_ID) {
      try { await ensurePrimaryTenant(); } catch (e) { console.warn('[Tenant API] primary tenant bootstrap warning', e); }
    }

    // Fetch tenant profile from /tenants/{tenantId}
    let tenantProfile: any = null;
    try {
      const tSnap = await getDoc(getTenantDoc(tenantId));
      if (tSnap.exists) {
        tenantProfile = { id: tSnap.id, ...tSnap.data() };
      }
    } catch (err) {
      console.warn(`[Tenant API] Warning fetching /tenants/${tenantId}:`, err);
    }

    // Fetch tenant config from /tenants/{tenantId}/settings/config
    let tenantConfig: any = null;
    try {
      const cSnap = await getDoc(getTenantSettingsDoc(tenantId, 'config'));
      if (cSnap.exists) {
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
app.post('/api/super-admin/tenants', requireSuperAdmin, async (req: Request, res: Response) => {
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
      secondaryColor,
      customDomain,
      coverImage,
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
      tagline: String(tagline || '').trim(),
      ownerName: String(ownerName || sanitizedName).trim(),
      phone: sanitizedPhone,
      email: req.body?.email || `${tenantId}@beauty.co.il`,
      city: String(city || '').trim(),
      address: String(address || '').trim(),
      primaryColor: primaryColor || '#7c3aed',
      secondaryColor: secondaryColor || '#c4b5fd',
      customDomain: customDomain ? String(customDomain).trim().toLowerCase() : '',
      coverImage: String(coverImage || '').trim(),
      plan: plan || 'pro',
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString(),
    };

    const tenantConfig = {
      // New tenants start clean: never inherit Alex Beauty services or business hours.
      services: Array.isArray(services) ? services.filter((s: any) => String(s?.name || '').trim()) : [],
      scheduleSettings: scheduleSettings || {
        businessOpen: '',
        businessClose: '',
        fridayOpen: '',
        fridayClose: '',
        durationMinutes: 60,
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

// 9.4 Super Admin: load one tenant for editing
app.get('/api/super-admin/tenants/:tenantId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant ID is required' });
    const [tenantSnap, configSnap] = await Promise.all([
      getDoc(getTenantDoc(tenantId)),
      getDoc(getTenantSettingsDoc(tenantId, 'config')),
    ]);
    if (!tenantSnap.exists) return res.status(404).json({ success: false, error: 'Tenant not found' });
    return res.json({
      success: true,
      tenant: { id: tenantSnap.id, ...tenantSnap.data() },
      config: configSnap.exists ? configSnap.data() : { services: [], scheduleSettings: {} },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// 9.45 Super Admin: update an existing tenant. Tenant ID stays immutable.
app.put('/api/super-admin/tenants/:tenantId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '').trim();
    if (!tenantId) return res.status(400).json({ success: false, error: 'Tenant ID is required' });
    const existingSnap = await getDoc(getTenantDoc(tenantId));
    if (!existingSnap.exists) return res.status(404).json({ success: false, error: 'Tenant not found' });
    const existing: any = existingSnap.data();
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    if (!name || !phone) return res.status(400).json({ success: false, error: 'Name and phone are required' });

    const customDomain = String(req.body?.customDomain || '').trim().toLowerCase();
    const tenantProfile = {
      name,
      tagline: String(req.body?.tagline || '').trim(),
      ownerName: String(req.body?.ownerName || name).trim(),
      phone,
      email: String(req.body?.email || '').trim(),
      city: String(req.body?.city || '').trim(),
      address: String(req.body?.address || '').trim(),
      primaryColor: req.body?.primaryColor || existing.primaryColor || '#7c3aed',
      secondaryColor: req.body?.secondaryColor || existing.secondaryColor || '#c4b5fd',
      customDomain,
      coverImage: String(req.body?.coverImage || '').trim(),
      plan: req.body?.plan || existing.plan || 'pro',
      updatedAt: new Date().toISOString(),
    };
    const tenantConfig = {
      services: Array.isArray(req.body?.services) ? req.body.services.filter((x: any) => String(x?.name || '').trim()) : [],
      scheduleSettings: req.body?.scheduleSettings || {},
      updatedAt: new Date().toISOString(),
    };

    await setDoc(getTenantDoc(tenantId), tenantProfile, { merge: true });
    await setDoc(getTenantSettingsDoc(tenantId, 'config'), tenantConfig, { merge: true });

    const oldDomain = String(existing.customDomain || '').trim().toLowerCase();
    if (oldDomain && oldDomain !== customDomain) {
      try { await deleteDoc(doc(db, 'domains', oldDomain)); } catch (_) {}
      delete domainToTenantCache[oldDomain];
    }
    if (customDomain) {
      await setDoc(doc(db, 'domains', customDomain), { tenantId, hostname: customDomain, updatedAt: new Date().toISOString() }, { merge: true });
      domainToTenantCache[customDomain] = tenantId;
    }

    return res.json({ success: true, tenantId, tenant: { id: tenantId, ...existing, ...tenantProfile }, config: tenantConfig,
      testUrl: `http://localhost:3000?tenant=${tenantId}`, adminUrl: `http://localhost:3000/admin?tenant=${tenantId}` });
  } catch (err: any) {
    console.error('[Super Admin API] Error updating tenant:', err);
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Super Admin: create/replace the Firebase login for one business owner.
app.post('/api/super-admin/tenants/:tenantId/owner-account', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim();
    if (!tenantId || !email) return res.status(400).json({ success: false, error: 'חובה להזין עסק ואימייל' });
    if (password.length < 6) return res.status(400).json({ success: false, error: 'הסיסמה הזמנית חייבת להכיל לפחות 6 תווים' });
    const tenantSnap = await getDoc(getTenantDoc(tenantId));
    if (!tenantSnap.exists) return res.status(404).json({ success: false, error: 'העסק לא נמצא' });

    let user;
    try { user = await getAuth().getUserByEmail(email); }
    catch { user = await getAuth().createUser({ email, password, displayName: displayName || undefined, emailVerified: false }); }
    if (user.email === email) {
      await getAuth().updateUser(user.uid, { password, displayName: displayName || user.displayName || undefined, disabled: false });
    }
    await getAuth().setCustomUserClaims(user.uid, { role: 'business_admin', tenantId });
    await setDoc(doc(db, 'adminUsers', user.uid), {
      uid: user.uid, email, displayName, role: 'business_admin', tenantId, disabled: false, updatedAt: new Date().toISOString()
    }, { merge: true });
    await setDoc(getTenantDoc(tenantId), { ownerAuthUid: user.uid, ownerAuthEmail: email, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, account: { uid: user.uid, email, role: 'business_admin', tenantId } });
  } catch (err: any) {
    console.error('[Owner account]', err);
    return res.status(500).json({ success: false, error: err?.message || 'שגיאה ביצירת חשבון בעל העסק' });
  }
});

app.post('/api/super-admin/tenants/:tenantId/owner-account/disable', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.params.tenantId || '').trim();
    const tenantSnap = await getDoc(getTenantDoc(tenantId));
    const uid = String(tenantSnap.data()?.ownerAuthUid || '');
    if (!uid) return res.status(404).json({ success: false, error: 'לא הוגדר חשבון בעלים לעסק' });
    const disabled = req.body?.disabled !== false;
    await getAuth().updateUser(uid, { disabled });
    await setDoc(doc(db, 'adminUsers', uid), { disabled, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, disabled });
  } catch (err: any) { return res.status(500).json({ success: false, error: err?.message }); }
});

// 9.5 Delete Tenant Endpoint
app.delete('/api/super-admin/tenants/:tenantId', requireSuperAdmin, async (req: Request, res: Response) => {
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
app.get('/api/admin/tenant-data', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenant as string) || req.tenantId || 'alex_beauty';
    const isDev = process.env.NODE_ENV !== 'production';

    // Fetch live appointments from /tenants/{tenantId}/appointments, fallback to root /appointments
    let tenantAppointments: any[] = [];
    try {
      const tenantSnap = await getDocs(getTenantAppointmentsRef(tenantId));
      tenantAppointments = tenantSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    } catch {
      tenantAppointments = serverAppointmentsByTenant[tenantId] || [];
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
    const tenantId = String(req.body?.tenantId || req.tenantId || 'alex_beauty');
    serverAppointmentsByTenant[tenantId] = req.body.appointments;
    serverAppointments = req.body.appointments;
    return res.json({ success: true, count: req.body.appointments.length, tenantId });
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

  // Production bootstrap must not depend on someone opening /super-admin first.
  // Register/migrate the real legacy Alex Beauty business before accepting traffic.
  try {
    await ensurePrimaryTenant();
    const primarySnap = await getDoc(getTenantDoc(PRIMARY_TENANT_ID));
    const appointmentSnap = await getDocs(getTenantAppointmentsRef(PRIMARY_TENANT_ID));
    const customerSnap = await getDocs(collection(db, 'tenants', PRIMARY_TENANT_ID, 'customers'));
    console.log(`[Tenant Bootstrap] ✅ ${PRIMARY_TENANT_ID} registered=${primarySnap.exists} appointments=${appointmentSnap.size} customers=${customerSnap.size}`);
  } catch (bootstrapErr: any) {
    // This is core production data. Fail deployment rather than serving a misleading empty SaaS dashboard.
    console.error('[Tenant Bootstrap] ❌ failed:', bootstrapErr?.message || bootstrapErr);
    throw bootstrapErr;
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Alex Beauty Server running on http://0.0.0.0:${PORT} [Israel Time: ${getIsraelTime().timeStr}]`);
  });
}

startServer();

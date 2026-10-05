import 'dotenv/config';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { validId, validTime, validDate, phoneDigits, hash, reminderKey, overlaps, israelClock, parseFirebaseServiceAccount, authorizeTenant, publicSettings, claimOnce, copyOnce } from './server/core';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import firebaseClientConfig from './firebase-applet-config.json';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Firebase Admin must always use the explicit Render service-account secret.
// Never fall back to Application Default Credentials on Render: there is no ADC there,
// and that fallback caused the v12 deploy crash (NO_ADC_FOUND).
let adminSdkReady = false;
let db: ReturnType<typeof getFirestore>;


try {
  const serviceAccount = parseFirebaseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.project_id !== firebaseClientConfig.projectId) throw new Error('Service account project does not match browser Firebase project');
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
  if (firestoreDatabaseId !== firebaseClientConfig.firestoreDatabaseId) throw new Error('FIRESTORE_DATABASE_ID must match browser firestoreDatabaseId');
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
const doc = (base: any, ...segments: string[]): DocumentReference => {
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

// Firestore free-tier protection -------------------------------------------------
// v17 could burn the daily read quota quickly because the browser polled every
// 10 seconds, the Super Admin loaded every appointment/customer document just to
// count them, and the SMS heartbeat rescanned after its due time every 30 seconds.
// Keep short-lived server caches, aggregate counters and explicit quota backoff so
// a quota event degrades data APIs instead of crashing/restarting the whole service.
const clampMs = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};
const APPOINTMENTS_CACHE_TTL_MS = clampMs(process.env.APPOINTMENTS_CACHE_TTL_MS, 10 * 60_000, 30_000, 30 * 60_000);
const TENANT_CACHE_TTL_MS = clampMs(process.env.TENANT_CACHE_TTL_MS, 5 * 60_000, 10_000, 30 * 60_000);
const SUPER_ADMIN_CACHE_TTL_MS = clampMs(process.env.SUPER_ADMIN_CACHE_TTL_MS, 2 * 60_000, 10_000, 10 * 60_000);
const FIRESTORE_QUOTA_BACKOFF_MS = clampMs(process.env.FIRESTORE_QUOTA_BACKOFF_MS, 15 * 60_000, 60_000, 6 * 60 * 60_000);

function isFirestoreQuotaError(err: any): boolean {
  const code = err?.code;
  const message = String(err?.message || err || '');
  return code === 8 || code === '8' || code === 'resource-exhausted' || /RESOURCE_EXHAUSTED|quota limit exceeded|free daily read units/i.test(message);
}
function isRetryableFirestoreError(err: any): boolean {
  const code = Number(err?.code);
  return isFirestoreQuotaError(err) || [4, 10, 13, 14].includes(code) || /DEADLINE_EXCEEDED|ABORTED|INTERNAL|UNAVAILABLE/i.test(String(err?.message || ''));
}

let firestoreQuotaBackoffUntil = 0;
function noteFirestoreQuota(err: any, source: string) {
  if (!isFirestoreQuotaError(err)) return false;
  firestoreQuotaBackoffUntil = Math.max(firestoreQuotaBackoffUntil, Date.now() + FIRESTORE_QUOTA_BACKOFF_MS);
  console.warn(`[Firestore] ⚠️ quota exhausted during ${source}; backing off until ${new Date(firestoreQuotaBackoffUntil).toISOString()}`);
  return true;
}
function firestoreQuotaBackoffActive() {
  return Date.now() < firestoreQuotaBackoffUntil;
}
function quotaBackoffError(source: string) {
  const err: any = new Error(`Firestore quota backoff is active for ${source} until ${new Date(firestoreQuotaBackoffUntil).toISOString()}`);
  err.code = 8;
  err.localQuotaBackoff = true;
  return err;
}

type CachedAppointments = { expiresAt: number; rows: any[] };
const appointmentListCache = new Map<string, CachedAppointments>();
const tenantProfileCache = new Map<string, { expiresAt: number; data: any }>();
const domainTenantCache = new Map<string, { expiresAt: number; tenantId: string }>();
let superAdminTenantsCache: { expiresAt: number; tenants: any[] } | null = null;

function invalidateTenantCaches(tenantId: string) {
  appointmentListCache.delete(`${tenantId}:admin`);
  appointmentListCache.delete(`${tenantId}:public`);
  tenantProfileCache.delete(tenantId);
  superAdminTenantsCache = null;
}
function invalidateAppointmentsCache(tenantId: string) {
  appointmentListCache.delete(`${tenantId}:admin`);
  appointmentListCache.delete(`${tenantId}:public`);
  superAdminTenantsCache = null;
}

async function cachedAppointmentRows(tenantId: string, adminView: boolean): Promise<any[]> {
  const key = `${tenantId}:${adminView ? 'admin' : 'public'}`;
  const cached = appointmentListCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  // Once Google has told us the daily quota is exhausted, do not hammer the
  // same database on every browser poll. Serve the last known snapshot when we
  // have one; otherwise fail locally with 503 until the backoff expires.
  if (firestoreQuotaBackoffActive()) {
    if (cached) return cached.rows;
    throw quotaBackoffError(`appointments ${tenantId}`);
  }
  let ref: any = getTenantAppointmentsRef(tenantId);
  // Public availability only needs current/future slots. Avoid rereading historical
  // appointments for every visitor. Admins still receive the complete history.
  if (!adminView) ref = ref.where('appointment_date', '>=', israelClock().dateIso);
  const snap = await getDocs(ref);
  const rows = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  appointmentListCache.set(key, { expiresAt: Date.now() + APPOINTMENTS_CACHE_TTL_MS, rows });
  return rows;
}

const normalizePhone = phoneDigits;

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
    const selectors = [req.body?.tenantId, req.query.tenant, req.headers['x-tenant-id']].filter(v => v !== undefined && v !== '');
    if (selectors.some(v => !validId(v)) || new Set(selectors).size > 1) return res.status(400).json({success:false,error:'Invalid or conflicting tenant selectors'});
    if (selectors.length) req.tenantId = String(selectors[0]);
    else {
      const hostname = req.hostname.toLowerCase();
      const cachedDomain = domainTenantCache.get(hostname);
      if (cachedDomain && cachedDomain.expiresAt > Date.now()) req.tenantId = cachedDomain.tenantId;
      else if (firestoreQuotaBackoffActive() && cachedDomain) req.tenantId = cachedDomain.tenantId;
      else {
        if (firestoreQuotaBackoffActive()) throw quotaBackoffError(`domain ${hostname}`);
        const mapped = await getDoc(doc(db, 'domains', hostname));
        const resolvedTenantId = mapped.exists ? String(mapped.data()?.tenantId || '') : PRIMARY_TENANT_ID;
        req.tenantId = resolvedTenantId;
        if (validId(resolvedTenantId)) domainTenantCache.set(hostname, { expiresAt: Date.now() + 10 * 60_000, tenantId: resolvedTenantId });
      }
    }
    if (!validId(req.tenantId)) return res.status(400).json({success:false,error:'Invalid tenant ID'});
    next();
  } catch (err) { next(err); }
}

app.use('/api', (req,res,next)=>req.path==='/health'?next():resolveTenantDomain(req,res,next));
app.param(['tenantId','id'], (req,res,next,value)=>{
  if(!validId(value)) return res.status(400).json({success:false,error:'Invalid document ID'});
  next();
});



// ----------------------------------------------------
// Secure Admin Data Endpoints
// ----------------------------------------------------
async function optionalAdmin(req: Request) { return req.headers.authorization ? await decodeAdmin(req) : null; }
async function activeTenant(tenantId: string) {
  const cached = tenantProfileCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    if (!['active','trial'].includes(cached.data?.status)) throw new Error('העסק אינו פעיל או לא נמצא');
    return cached.data;
  }
  if (firestoreQuotaBackoffActive()) {
    if (cached) {
      if (!['active','trial'].includes(cached.data?.status)) throw new Error('העסק אינו פעיל או לא נמצא');
      return cached.data;
    }
    throw quotaBackoffError(`tenant ${tenantId}`);
  }
  const snap = await getDoc(getTenantDoc(tenantId));
  if (!snap.exists || !['active','trial'].includes(snap.data()?.status)) throw new Error('העסק אינו פעיל או לא נמצא');
  const data = snap.data();
  tenantProfileCache.set(tenantId, { expiresAt: Date.now() + TENANT_CACHE_TTL_MS, data });
  return data;
}
async function cancelBooking(req: Request, res: Response) {
  try {
    const tenantId = req.tenantId!;
    const {appointmentId, accessToken} = req.body;
    if (!validId(appointmentId)) return res.status(400).json({success:false,error:'Invalid appointment ID'});
    const admin = await optionalAdmin(req);
    const allowed = admin && authorizeTenant(admin,[tenantId],tenantId) === tenantId;
    await activeTenant(tenantId);
    await db.runTransaction(async tx => {
      const ref=getTenantAppointmentDoc(tenantId,appointmentId);
      const snap=await tx.get(ref);
      if(!snap.exists) throw new Error('התור לא נמצא');
      const data=snap.data()!;
      if(!allowed && !(typeof accessToken==='string' && data.accessTokenHash && hash(accessToken)===data.accessTokenHash)) throw new Error('נדרש קישור הביטול המקורי או הרשאת מנהלת');
      // Keep a tombstone so legacy migration can never resurrect cancelled bookings.
      tx.update(ref,{status:'cancelled',updated_at:new Date().toISOString()});
      tx.set(doc(db,'tenants',tenantId,'booking_days',data.appointment_date),{updatedAt:new Date().toISOString()});
    });
    invalidateAppointmentsCache(tenantId);
    res.json({success:true});
  } catch(err:any) {
    const quotaExceeded = noteFirestoreQuota(err, 'cancel appointment');
    res.status(quotaExceeded ? 503 : 403).json({success:false,error:quotaExceeded?'Firestore quota temporarily exhausted':err.message});
  }
}
app.post('/api/appointments/cancel',cancelBooking);
app.post('/api/admin/appointments/delete',requireAdmin,cancelBooking);
app.post('/api/appointments/list',async(req,res)=>{
  try {
    const tenantId=req.tenantId!;
    await activeTenant(tenantId);
    const admin=await optionalAdmin(req);
    const canRead=!!(admin && authorizeTenant(admin,[tenantId],tenantId)===tenantId);
    const capabilities=req.body?.capabilities || {};
    const rows=await cachedAppointmentRows(tenantId, canRead);
    const appointments=rows.filter((row:any)=>row.status!=='cancelled').map((row:any)=>{
      const {id,accessTokenHash,...data}=row;
      if(canRead || (accessTokenHash && typeof capabilities[id]==='string' && hash(capabilities[id])===accessTokenHash)) return {...data,id};
      return {id,appointment_date:data.appointment_date,start_time:data.start_time,end_time:data.end_time,status:'confirmed',customer_name:'תפוס',customer_phone:'',service_id:0,service_name:'',price:0,notes:''};
    });
    res.json({success:true,appointments});
  }catch(err:any){
    const quotaExceeded = noteFirestoreQuota(err, 'appointments list');
    res.status(quotaExceeded ? 503 : 403).json({success:false,error:quotaExceeded?'Firestore quota temporarily exhausted':err.message});
  }
});
app.post('/api/appointments/book',async(req,res)=>{
  try {
    if(isDispatchRateLimited('book:'+req.ip)) return res.status(429).json({success:false,error:'יש להמתין לפני קביעת תור נוסף'});
    const tenantId=req.tenantId!;
    const admin=await optionalAdmin(req);
    const canManage=admin && authorizeTenant(admin,[tenantId],tenantId)===tenantId;
    const a=req.body?.appointment || {};
    if(!validDate(a.appointment_date) || !validTime(a.start_time) || !validTime(a.end_time) || a.start_time>=a.end_time || typeof a.customer_name!=='string' || !a.customer_name.trim() || a.customer_name.length>100 || (!canManage && !phoneDigits(a.customer_phone))) return res.status(400).json({success:false,error:'פרטי תור לא תקינים'});
    const accessToken=randomBytes(32).toString('hex');
    const id=validId(req.body.requestId) ? req.body.requestId : randomUUID();
    const ref=getTenantAppointmentDoc(tenantId,id);
    await db.runTransaction(async tx=>{
      const tenant=await tx.get(getTenantDoc(tenantId));
      if(!tenant.exists || !['active','trial'].includes(tenant.data()?.status)) throw new Error('העסק אינו פעיל');
      const config=await tx.get(getTenantSettingsDoc(tenantId));
      const guard=doc(db,'tenants',tenantId,'booking_days',a.appointment_date);
      await tx.get(guard);
      const existing=await tx.get(ref);
      if(existing.exists) throw new Error('בקשה זו כבר נשמרה; יש לרענן את היומן');
      const sameDay=await tx.get(getTenantAppointmentsRef(tenantId).where('appointment_date','==',a.appointment_date));
      if(sameDay.docs.some((d:any)=>overlaps(d.data(),a))) throw new Error('השעה הזו כבר נתפסה, נא לבחור שעה אחרת');
      let service:any;
      if(!canManage){
        service=config.data()?.services?.find((x:any)=>String(x.id)===String(a.service_id));
        if(!service) throw new Error('השירות אינו זמין');
        const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
        if(minutes(a.end_time)-minutes(a.start_time)!==Number(service.duration_minutes)) throw new Error('משך תור לא תקין');
        const clock=israelClock();
        if(a.appointment_date<clock.dateIso || (a.appointment_date===clock.dateIso && a.start_time<=clock.timeStr)) throw new Error('לא ניתן לקבוע תור בעבר');
        const day=new Date(a.appointment_date+'T12:00:00Z').getUTCDay();
        const sch=config.data()?.scheduleSettings || {};
        const open=day===5?sch.fridayOpen:sch.businessOpen, close=day===5?sch.fridayClose:sch.businessClose;
        if(day===6 || !validTime(open) || !validTime(close) || a.start_time<open || a.end_time>close) throw new Error('השעה מחוץ לשעות הפעילות');
      }
      const customerRef=phoneDigits(a.customer_phone)?doc(db,'tenants',tenantId,'customers','cust_'+phoneDigits(a.customer_phone)):null;
      const customer=customerRef ? await tx.get(customerRef):null;
      const saved={customer_name:a.customer_name.trim(),customer_phone:String(a.customer_phone||''),service_id:a.service_id ?? 0,service_name:service?.name || String(a.service_name||''),price:service?.price ?? Number(a.price||0),appointment_date:a.appointment_date,start_time:a.start_time,end_time:a.end_time,status:'confirmed',notes:String(a.notes||'').slice(0,2000),created_at:new Date().toISOString(),tenantId,accessTokenHash:hash(accessToken)};
      tx.create(ref,saved);
      if(customerRef && !customer?.exists) tx.create(customerRef,{full_name:saved.customer_name,phone:saved.customer_phone,notes:'',created_at:saved.created_at,last_login_at:saved.created_at});
      tx.set(guard,{updatedAt:new Date().toISOString()});
    });
    invalidateAppointmentsCache(tenantId);
    res.json({success:true,id,accessToken});
  }catch(err:any){
    const quotaExceeded = noteFirestoreQuota(err, 'book appointment');
    res.status(quotaExceeded ? 503 : 409).json({success:false,error:quotaExceeded?'Firestore quota temporarily exhausted':err.message});
  }
});

app.post('/api/admin/settings/services', requireAdmin, async (req, res) => {
  try {
    const { services } = req.body;
    if (!Array.isArray(services) || services.length>200 || services.some((x:any)=>!x || typeof x.name!=='string' || !x.name.trim() || !Number.isFinite(x.price) || x.price<0 || !Number.isInteger(x.duration_minutes) || x.duration_minutes<5 || x.duration_minutes>720)) {
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
    if (!schedule || typeof schedule !== 'object' || !validTime(schedule.businessOpen) || !validTime(schedule.businessClose) || schedule.businessOpen>=schedule.businessClose || !Number.isInteger(schedule.durationMinutes) || schedule.durationMinutes<5 || schedule.durationMinutes>720) {
      return res.status(400).json({ success: false, error: 'Invalid schedule format' });
    }
    // הלקוח (subscribeScheduleSettings) קורא את השדות ישירות מהמסמך
    // 'schedule_settings', לא מתוך אובייקט מקונן.
    await setDoc(
      getTenantSettingsDoc(String(req.body?.tenantId || req.tenantId || 'alex_beauty'), 'config'),
      {
        scheduleSettings: {
        businessOpen: schedule.businessOpen,
        businessClose: schedule.businessClose,
        fridayOpen: schedule.fridayOpen || '09:20',
        fridayClose: schedule.fridayClose || '15:00',
        durationMinutes: Number(schedule.durationMinutes) || 90,
        },
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
app.post('/api/admin/migrate-legacy-alex', requireSuperAdmin, async (_req, res, next) => {
  try { await ensurePrimaryTenant(); res.json({success:true,message:'Migration completed; source data preserved'}); } catch(err){next(err);}
});

// ----------------------------------------------------
// Customer Directory Endpoints
// ----------------------------------------------------

/**
 * שמירה או עדכון של לקוח באוסף customers ב-Firestore.
 * מתבצע בעת כניסת לקוח, הרשמה או קביעת תור.
 */
app.post('/api/customers/upsert', requireAdmin, async (req: Request, res: Response) => {
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

    superAdminTenantsCache = null;
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[Customers Upsert] Error:', err);
    const quotaExceeded = noteFirestoreQuota(err, 'customer upsert');
    return res.status(quotaExceeded ? 503 : 500).json({ success: false, error: quotaExceeded ? 'Firestore quota temporarily exhausted' : err.message });
  }
});

/**
 * קבלת רשימת הלקוחות עבור לוח הבקרה של המנהלת (מוגן בהרשאת מנהלת בלבד).
 * סורק גם תורים קיימים כדי לחשב כמות תורים ותאריך תור אחרון לכל לקוח.
 */
app.get('/api/admin/customers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = String(req.query?.tenant || req.tenantId || 'alex_beauty');
    const [custsSnap, appointmentRows] = await Promise.all([
      getDocs(collection(db, 'tenants', tenantId, 'customers')),
      cachedAppointmentRows(tenantId, true),
    ]);

    // מיפוי תורים לפי מספר טלפון נקי
    const appointmentsByPhone: Record<
      string,
      { count: number; lastDate: string; name: string }
    > = {};

    appointmentRows.forEach((data: any) => {
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

    // Customer deletion is independent of appointments; reads never recreate records.
    const customersList = Array.from(customersMap.values()).sort((a, b) =>
      (b.last_login_at || b.created_at || '').localeCompare(a.last_login_at || a.created_at || '')
    );

    return res.json({ success: true, customers: customersList });
  } catch (err: any) {
    console.error('[Admin Customers API] Error:', err);
    const quotaExceeded = noteFirestoreQuota(err, 'admin customers');
    return res.status(quotaExceeded ? 503 : 500).json({ success: false, error: quotaExceeded ? 'Firestore quota temporarily exhausted' : err.message });
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
    superAdminTenantsCache = null;
    return res.json({ success: true });
  } catch (err: any) {
    const quotaExceeded = noteFirestoreQuota(err, 'customer delete');
    return res.status(quotaExceeded ? 503 : 500).json({ success: false, error: quotaExceeded ? 'Firestore quota temporarily exhausted' : err.message });
  }
});

// ----------------------------------------------------------------------
// Secure Admin Authentication & Password Hashing Subsystem (Server-Side)
// ----------------------------------------------------------------------

// Verify Firebase identity, current server-side roles, revocation and tenant ownership.
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
  const decoded: any = await getAuth().verifyIdToken(token, true);
  const currentUser = await getAuth().getUser(decoded.uid);
  if(currentUser.disabled) return null;
  const claims = currentUser.customClaims || {};
  const email = String(currentUser.email || '').toLowerCase();
  const superEmails = getSuperAdminEmails();
  if (claims.role === 'super_admin' || (currentUser.emailVerified && superEmails.includes(email))) {
    // Bootstrap/migrate the configured owner into a real Firebase custom claim.
    if (claims.role !== 'super_admin' && currentUser.emailVerified && superEmails.includes(email)) {
      await getAuth().setCustomUserClaims(decoded.uid, { ...claims, role: 'super_admin' });
    }
    return { uid: decoded.uid, email: decoded.email, role: 'super_admin' };
  }
  if (claims.role === 'business_admin' && validId(claims.tenantId)) {
    const binding=await getDoc(doc(db,'adminUsers',decoded.uid));
    if(binding.exists && binding.data()?.disabled===true) return null;
    const tenant = await getDoc(getTenantDoc(claims.tenantId));
    if(!tenant.exists || !['active','trial'].includes(tenant.data()?.status) || tenant.data()?.ownerAuthUid !== decoded.uid) return null;
    return { uid: decoded.uid, email: currentUser.email, role: 'business_admin', tenantId: claims.tenantId };
  }
  return null;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await decodeAdmin(req);
    if (!admin) return res.status(403).json({ success: false, error: 'לחשבון אין הרשאת ניהול' });

    req.tenantId = authorizeTenant(admin,[req.body?.tenantId,req.query.tenant,req.headers['x-tenant-id']],req.tenantId || 'alex_beauty');
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

// Secure machine authentication for cron-job.org / external wake-up calls.
function safeSecretEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function requireCronSecret(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (expected.length < 24) {
    return res.status(503).json({ success: false, error: 'CRON_SECRET is not configured. Set a random secret of at least 24 characters in Render.' });
  }
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
  const headerSecret = String(req.headers['x-cron-secret'] || '').trim();
  const querySecret = typeof req.query.key === 'string' ? req.query.key.trim() : '';
  const provided = headerSecret || bearer || querySecret;
  if (!provided || !safeSecretEquals(provided, expected)) {
    return res.status(401).json({ success: false, error: 'Invalid cron secret' });
  }
  return next();
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


  provider: 'telnyx',
};



// Rate limiter for outgoing SMS
const dispatchRateLimits: Record<string, number[]> = {};
function isDispatchRateLimited(ip: string): boolean {
  const now = Date.now();
  if(Object.keys(dispatchRateLimits).length>10000) {for(const key of Object.keys(dispatchRateLimits)) if(!dispatchRateLimits[key].some(t=>now-t<60000)) delete dispatchRateLimits[key];}
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
function getIsraelDateString(daysOffset = 0): string {
  const date = new Date(israelClock().dateIso + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()+daysOffset);
  return date.toISOString().slice(0,10);
}
const getIsraelTime = israelClock;

// The product uses one central SMS provider for all tenants by default.
// Per-tenant private_settings may override credentials; setting
// ALLOW_SHARED_SMS_PROVIDER=false explicitly disables the shared fallback for
// non-primary businesses.
function sharedSmsProviderAllowed(tenantId: string): boolean {
  return tenantId === PRIMARY_TENANT_ID || process.env.ALLOW_SHARED_SMS_PROVIDER !== 'false';
}

// ----------------------------------------------------------------------
// Telnyx SMS Dispatch Gateway
// ----------------------------------------------------------------------
// Provider credentials are server-only. Tenant overrides live under private_settings/sms_provider.

async function sendSmsViaTelnyx(to: string, message: string, tenantId: string): Promise<{ success: boolean; data?: any; error?: string; uncertain?:boolean }> {
  const providerSnap = await getDoc(doc(db,'tenants',tenantId,'private_settings','sms_provider'));
  const provider = providerSnap.data() || {};
  const shared = sharedSmsProviderAllowed(tenantId);
  const apiKey = String(provider.telnyxApiKey || (shared ? process.env.TELNYX_API_KEY : '') || '').trim();
  const fromNumber = String(provider.telnyxFromNumber || provider.telnyxFrom || (shared ? process.env.TELNYX_FROM_NUMBER || process.env.TELNYX_FROM : '') || '').trim();
  const profileId = String(provider.telnyxProfileId || (shared ? process.env.TELNYX_PROFILE_ID : '') || '').trim();
  if(!fromNumber || !profileId) return {success:false,error:'חסרות הגדרות שולח או פרופיל SMS בשרת'};

  if (!apiKey) {
    return { success: false, error: 'חסר מפתח API של Telnyx (TELNYX_API_KEY)' };
  }

  const formattedTo = phoneDigits(to) ? '+' + phoneDigits(to) : '';
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
      signal: AbortSignal.timeout(15000),
    });

    const restData = await restRes.json().catch(() => ({}));

    if (!restRes.ok) {
      const errDetail = restData?.errors?.[0]?.detail || restData?.errors?.[0]?.title || `קוד שגיאה ${restRes.status}`;
      console.error('[SMS Gateway] ❌ שגיאת Telnyx:', restData);
      return { success: false, uncertain: restRes.status >= 500, error: `שגיאה מ-Telnyx: ${errDetail}` };
    }

    const messageId = restData?.data?.id;
    if(!messageId) return {success:false,uncertain:true,error:'Provider response is missing message ID'};
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
    return { success: false, uncertain:true, error: err?.message || 'שגיאת תקשורת עם Telnyx' };
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
  const snap = await getTenantAppointmentsRef(tenantId).where('appointment_date','==',targetDate).get();
  return snap.docs.map((d:any)=>({...d.data(),id:d.id})).filter((a:any)=>a.status==='confirmed' && phoneDigits(a.customer_phone)).sort((a:any,b:any)=>a.start_time.localeCompare(b.start_time));
}

// Lock Helpers (Deduplication across server restarts & multiple instances)
async function tryClaimReminderLock(key: string, tenantId = 'alex_beauty', legacyKeys: string[] = []): Promise<boolean> {
  const ref = doc(db,'tenants',tenantId,'reminder_locks',key);
  return claimOnce(db,ref,legacyKeys.flatMap(k => [doc(db,'tenants',tenantId,'reminder_locks',k), ...(tenantId===PRIMARY_TENANT_ID ? [doc(db,'reminder_locks',k)] : [])]));
}
async function markReminderLockSuccess(key: string, tenantId = 'alex_beauty', result?: any): Promise<void> {
  await setDoc(doc(db,'tenants',tenantId,'reminder_locks',key),{status:'sent',sentAt:new Date().toISOString(),providerMessageId:result?.data?.id || null},{merge:true});
}
async function retainReminderFailure(key:string,tenantId:string,result:any) {
  // An uncertain provider result is never automatically retried: SMS APIs are not a transaction with Firestore.
  await setDoc(doc(db,'tenants',tenantId,'reminder_locks',key),{status:result.uncertain?'unknown':'failed',error:result.error || 'Unknown failure',updatedAt:new Date().toISOString()},{merge:true});
}

async function recordLogEntry(entry: SmsLogEntry, tenantId: string) {
  try {
    const sanitizedEntry = {
      tenantId,
      id: entry.id || randomUUID(),
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
        await setDoc(doc(db, 'tenants', tenantId, 'sms_logs', sanitizedEntry.id), sanitizedEntry, { merge: true }).catch((err) => {
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
  const snap = await getDoc(getTenantSettingsDoc(tenantId, 'sms_reminders'));
  return {...DEFAULT_SMS_SETTINGS, ...publicSettings(snap.exists ? snap.data() : {}), ...(snap.exists ? {} : {enabled:false,autoSendEnabled:false})};
}

async function getTenantBrand(tenantId: string): Promise<any> {
  const snap=await getDoc(getTenantDoc(tenantId));
  if(!snap.exists) throw new Error('Tenant not found');
  return {...snap.data(),id:snap.id};
}

// ----------------------------------------------------------------------
// Core Automated Batch Dispatcher
// ----------------------------------------------------------------------
function israelLocalStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(typeof (iso as any)?.toDate === 'function' ? (iso as any).toDate() : iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second:'2-digit', hourCycle: 'h23'
  }).formatToParts(d).reduce((a: any, p) => { a[p.type] = p.value; return a; }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
function previousIsoDate(dateIso: string): string {
  const [y,m,d] = dateIso.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d - 1));
  return x.toISOString().slice(0, 10);
}

async function sendRemindersForDate(targetDate: string, reminderType: 'today' | '1day', tenantId = PRIMARY_TENANT_ID, tenantSettings?: any) {
  const smsSettings = tenantSettings || await getTenantSmsSettings(tenantId);
  const brand = await getTenantBrand(tenantId);
  if (!['active','trial'].includes(brand?.status) || smsSettings.enabled===false || smsSettings.autoSendEnabled===false) return {success:true,sentCount:0,skipped:true};
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
    const cutoffStamp = `${cutoffDate} ${cutoffTime}:00`;
    appointments = appointments.filter((a) => (!a.created_at || (israelLocalStamp(a.created_at) && israelLocalStamp(a.created_at) <= cutoffStamp)) && (!isMorning || targetDate > getIsraelTime().dateIso || (targetDate === getIsraelTime().dateIso && a.start_time > getIsraelTime().timeStr)));
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

    const previousLogs=await collection(db,'tenants',tenantId,'sms_logs').where('appointmentDate','==',targetDate).get();
    const acceptedPhones=new Set(previousLogs.docs.filter((d:any)=>['sent','queued'].includes(d.data().status) && d.data().reminderType===(isMorning?'morning_today':'evening_1day')).map((d:any)=>phoneDigits(d.data().recipientPhone)));
    let successCount = 0;
    let failedCount = 0;
    const results: any[] = [];

    for (const [phoneKey, appts] of Object.entries(customerGroups)) {
      if(acceptedPhones.has(phoneKey)) continue;
      const firstAppt = appts[0];
      const lockKey = reminderKey(reminderType,phoneKey,targetDate);
      const legacyKeys = appts.map(a=>`${isMorning?'morning':'evening'}_${a.id}_${targetDate}`);

      const claimed = await tryClaimReminderLock(lockKey, tenantId, legacyKeys);
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

      const res = await sendSmsViaTelnyx(firstAppt.customer_phone, messageText, tenantId);

      const logEntry: SmsLogEntry = {
        id: `sms_${tenantId}_${Date.now()}_${firstAppt.id}`,
        recipientName: firstAppt.customer_name,
        recipientPhone: firstAppt.customer_phone,
        messageText,
        channel: 'sms',
        status: res.success ? 'queued' : 'failed',
        reminderType: isMorning ? 'morning_today' : 'evening_1day',
        appointmentDate: targetDate,
        startTime: firstAppt.start_time,
        sentAt: new Date().toISOString(),
        errorMessage: res.error,
      };
      await recordLogEntry(logEntry, tenantId);

      if (res.success) {
        successCount += 1;
        await markReminderLockSuccess(lockKey, tenantId, res);
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: true });
      } else {
        failedCount += 1;
        await retainReminderFailure(lockKey, tenantId, res);
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: false, error: res.error });
      }
    }

    console.log(`[SMS Scheduler] ✅ סיכום ריצה: ${successCount} נשלחו בהצלחה | ${failedCount} נכשלו`);
    return {
      success: failedCount === 0,
      count: appointments.length,
      sentCount: successCount,
      failedCount,
      results,
      message: `נשלחו ${successCount} תזכורות SMS בהצלחה`,
    };
  } catch (error: any) {
    const quotaExceeded = noteFirestoreQuota(error, `SMS reminder ${tenantId}/${reminderType}/${targetDate}`);
    console.error(`[SMS Scheduler] ❌ שגיאה כללית:`, error);
    return { success: false, quotaExceeded, retryable: isRetryableFirestoreError(error), error: error?.message };
  }
}

// ----------------------------------------------------------------------
// Scheduler: quota-aware, once-per-reminder-window, multi-tenant
// ----------------------------------------------------------------------
// The old 30-second heartbeat reread tenants/settings/appointments for the
// remainder of the day after a reminder became due. v18 polls lightly and,
// once a tenant/day/type has been processed, never scans that reminder again
// in the same process. Durable Firestore reminder locks remain the final
// duplicate-send guard across restarts and multiple instances.
const SMS_SCHEDULER_INTERVAL_MS = clampMs(process.env.SMS_SCHEDULER_INTERVAL_MS, 5 * 60_000, 60_000, 30 * 60_000);
const SMS_SCHEDULER_CONFIG_CACHE_MS = clampMs(process.env.SMS_SCHEDULER_CONFIG_CACHE_MS, 15 * 60_000, 60_000, 60 * 60_000);
let isDispatchingDueReminders = false;
let smsEngineInitialized = false;
let schedulerConfigCache: { expiresAt: number; items: Array<{ tenantId: string; settings: any }> } | null = null;
const completedDispatches = new Map<string, number>();

function schedulerDispatchKey(tenantId: string, type: 'today' | '1day', targetDate: string) {
  return `${tenantId}:${type}:${targetDate}`;
}
function pruneCompletedDispatches() {
  const cutoff = Date.now() - 3 * 24 * 60 * 60_000;
  for (const [key, value] of completedDispatches) if (value < cutoff) completedDispatches.delete(key);
}
async function getSchedulerTenantConfigs(force = false) {
  if (!force && schedulerConfigCache && schedulerConfigCache.expiresAt > Date.now()) return schedulerConfigCache.items;
  const snap = await getDocs(collection(db, 'tenants').select('status'));
  const ids = snap.docs.filter((d: any) => ['active', 'trial'].includes(d.data().status)).map((d: any) => d.id);
  const items = (await Promise.all(ids.map(async (tenantId: string) => {
    try { return { tenantId, settings: await getTenantSmsSettings(tenantId) }; }
    catch (err: any) {
      if (isFirestoreQuotaError(err)) throw err;
      console.warn(`[SMS Scheduler] settings warning for ${tenantId}:`, err?.message || err);
      return null;
    }
  }))).filter(Boolean) as Array<{ tenantId: string; settings: any }>;
  schedulerConfigCache = { expiresAt: Date.now() + SMS_SCHEDULER_CONFIG_CACHE_MS, items };
  return items;
}

async function checkAndDispatchDueReminders(): Promise<any> {
  if (isDispatchingDueReminders) return { success: true, skipped: true, reason: 'dispatch_in_progress', checkedAt: new Date().toISOString() };
  if (Date.now() < firestoreQuotaBackoffUntil) {
    return { success: false, skipped: true, reason: 'firestore_quota_backoff', retryAfter: new Date(firestoreQuotaBackoffUntil).toISOString() };
  }
  isDispatchingDueReminders = true;
  try {
    pruneCompletedDispatches();
    const { dateIso, tomorrowIso, hour, minute } = getIsraelTime();
    const currentTotalMinutes = hour * 60 + minute;
    const tenants = await getSchedulerTenantConfigs();
    const results: any[] = [];

    for (const { tenantId, settings } of tenants) {
      if (settings?.enabled === false || settings?.autoSendEnabled === false) continue;
      const [mH, mM] = String(settings.morningReminderTime || '08:00').split(':').map((v: string) => parseInt(v, 10) || 0);
      const [eH, eM] = String(settings.eveningReminderTime || '20:00').split(':').map((v: string) => parseInt(v, 10) || 0);
      const item: any = { tenantId };

      const runDue = async (type: 'today' | '1day', targetDate: string) => {
        const key = schedulerDispatchKey(tenantId, type, targetDate);
        if (completedDispatches.has(key)) return { success: true, skipped: true, reason: 'already_processed_this_window' };
        const result: any = await sendRemindersForDate(targetDate, type, tenantId, settings);
        if (result?.quotaExceeded) {
          noteFirestoreQuota({ code: 8, message: result.error || 'Firestore quota exceeded' }, 'SMS scheduler');
          schedulerConfigCache = null;
          return result;
        }
        // Do not repeatedly retry infrastructure failures. Quota failures are the
        // exception because they recover after quota reset/backoff. Provider-side
        // uncertainty is already protected by a durable reminder lock.
        if (!result?.retryable) completedDispatches.set(key, Date.now());
        return result;
      };

      if (currentTotalMinutes >= mH * 60 + mM && settings.notifyCustomerToday !== false) {
        item.today = await runDue('today', dateIso);
        if (item.today?.quotaExceeded) { results.push(item); break; }
      }
      if (currentTotalMinutes >= eH * 60 + eM && settings.notifyCustomer1DayBefore !== false) {
        item.tomorrow = await runDue('1day', tomorrowIso);
        if (item.tomorrow?.quotaExceeded) { results.push(item); break; }
      }
      if (item.today || item.tomorrow) results.push(item);
    }
    return { success: true, tenants: results, checkedAt: new Date().toISOString() };
  } catch (err: any) {
    const quotaExceeded = noteFirestoreQuota(err, 'SMS scheduler scan');
    if (quotaExceeded) schedulerConfigCache = null;
    console.error('[Automated Reminders] ❌ שגיאה בבדיקת תזכורות תקופתית:', err?.message || err);
    return { success: false, quotaExceeded, error: err?.message, checkedAt: new Date().toISOString() };
  } finally {
    isDispatchingDueReminders = false;
  }
}

async function initSmsEngine() {
  if (smsEngineInitialized) return;
  smsEngineInitialized = true;
  console.log(`[SMS Engine] 🚀 quota-aware scheduler active; interval=${Math.round(SMS_SCHEDULER_INTERVAL_MS / 1000)}s configCache=${Math.round(SMS_SCHEDULER_CONFIG_CACHE_MS / 1000)}s`);

  const initialTimer = setTimeout(() => {
    checkAndDispatchDueReminders().catch((err) => console.warn('[SMS Engine] initial check warning:', err?.message || err));
  }, 15_000);
  (initialTimer as any).unref?.();

  const interval = setInterval(() => {
    checkAndDispatchDueReminders().catch((err) => console.warn('[SMS Engine] heartbeat warning:', err?.message || err));
  }, SMS_SCHEDULER_INTERVAL_MS);
  (interval as any).unref?.();
}

// ----------------------------------------------------
// 📡 REST API ENDPOINTS
// ----------------------------------------------------

// Authenticated manual trigger for Super Admin users.
app.all(['/api/sms/check-due', '/api/reminders/heartbeat'], requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const result = await checkAndDispatchDueReminders();
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// Secure machine-to-machine heartbeat for cron-job.org. One Cron serves ALL tenants.
app.all('/api/cron/heartbeat', requireCronSecret, async (_req: Request, res: Response) => {
  try {
    const result = await checkAndDispatchDueReminders();
    return res.status(200).json({ success: result?.success !== false, cron: true, scheduler: result, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    console.error('[Cron] heartbeat failed:', err?.message || err);
    return res.status(500).json({ success: false, cron: true, error: err?.message || 'Cron heartbeat failed' });
  }
});

// 1. Get SMS settings
app.get(['/api/sms/settings', '/api/whatsapp/settings'],requireAdmin,async(req,res,next)=>{
  try { res.json({success:true,settings:await getTenantSmsSettings(req.tenantId!)}); } catch(err){next(err);}
});

app.get('/api/whatsapp/diagnose',requireAdmin,async(req,res,next)=>{
  try {
    const tenantId=req.tenantId!, config=(await getDoc(doc(db,'tenants',tenantId,'private_settings','sms_provider'))).data() || {};
    const shared=sharedSmsProviderAllowed(tenantId);
    const from=config.telnyxFromNumber || config.telnyxFrom || (shared ? process.env.TELNYX_FROM_NUMBER || process.env.TELNYX_FROM : '') || '';
    const hasCredentials=!!(config.telnyxApiKey || (shared && process.env.TELNYX_API_KEY));
    const hasProfile=!!(config.telnyxProfileId || (shared && process.env.TELNYX_PROFILE_ID));
    res.json({success:true,tenantId,telnyx:{hasCredentials:hasCredentials && hasProfile && !!from,fromNumber:from,errorSummary:hasCredentials && hasProfile && from?'':'חסרות הגדרות ספק בשרת'},settings:await getTenantSmsSettings(tenantId)});
  }catch(err){next(err);}
});

// 2. Save SMS settings & reschedule immediately
app.post(['/api/sms/settings', '/api/whatsapp/sync-settings'], requireAdmin, async (req,res,next)=>{
  try {
    const raw=req.body?.settings;
    if(!raw || typeof raw!=='object' || Array.isArray(raw)) return res.status(400).json({success:false,error:'Expected settings'});
    const tenantId=req.tenantId!;
    const current=await getTenantSmsSettings(tenantId);
    const settings={...current,...publicSettings(raw),provider:'telnyx'};
    for(const k of ['morningReminderTime','eveningReminderTime']) if(!validTime(settings[k])) return res.status(400).json({success:false,error:'Invalid reminder time'});
    for(const k of ['enabled','autoSendEnabled','notifyCustomerToday','notifyCustomer1DayBefore']) if(typeof settings[k]!=='boolean') return res.status(400).json({success:false,error:'Invalid reminder flag'});
    const morning=raw.morningTemplate || raw.customerTodayTemplate || current.morningTemplate;
    const evening=raw.eveningTemplate || raw.customer1DayTemplate || current.eveningTemplate;
    Object.assign(settings,{morningTemplate:morning,customerTodayTemplate:morning,eveningTemplate:evening,customer1DayTemplate:evening});
    const providerFields=['telnyxApiKey','telnyxFromNumber','telnyxFrom','telnyxProfileId'];
    const provider=Object.fromEntries(providerFields.filter(k=>typeof raw[k]==='string' && raw[k].trim()).map(k=>[k,raw[k].trim()]));
    for(const k of providerFields) delete settings[k];
    const batch=db.batch();
    batch.set(getTenantSettingsDoc(tenantId,'sms_reminders'),settings);
    if(Object.keys(provider).length) {
      if((req as any).adminPayload.role!=='super_admin') return res.status(403).json({success:false,error:'Only Super Admin may configure SMS credentials'});
      batch.set(doc(db,'tenants',tenantId,'private_settings','sms_provider'),provider,{merge:true});
    }
    await batch.commit();
    schedulerConfigCache = null;
    res.json({success:true,settings});
  }catch(err){next(err);}
});

// 3. Batch Send Trigger (Today or Tomorrow)
app.post(['/api/sms/send-batch', '/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], requireAdmin, async (req: Request, res: Response) => {
  const reqType = req.body?.type || (req.path.includes('morning') || req.path.includes('today') ? 'today' : '1day');
  const { dateIso, tomorrowIso } = getIsraelTime();
  const targetDate = reqType === 'today' ? dateIso : tomorrowIso;

  if(!['today','1day'].includes(reqType)) return res.status(400).json({success:false,error:'Invalid reminder type'});
  try {return res.json(await sendRemindersForDate(targetDate, reqType, req.tenantId!));}catch(err:any){return res.status(500).json({success:false,error:'Reminder dispatch failed'});}
});

app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], requireAdmin, async (req: Request, res: Response) => {
  const { tomorrowIso } = getIsraelTime();
  try {return res.json(await sendRemindersForDate(tomorrowIso,'1day',req.tenantId!));}catch(err:any){return res.status(500).json({success:false,error:'Reminder dispatch failed'});}
});

// 4. Send Single SMS
app.post(['/api/sms/send-single', '/api/whatsapp/send'], requireAdmin, async (req: Request, res: Response) => {
  try {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (isDispatchRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'קצב הבקשות מהיר מדי. נא להמתין רגע.' });
    }

    const { phone, message, customerName, reminderType } = req.body;
    if (!phoneDigits(phone) || typeof message !== 'string' || !message.trim() || message.length>1600) {
      return res.status(400).json({ success: false, error: 'Phone and message are required' });
    }

    const tenantId = req.tenantId!;
    await activeTenant(tenantId);
    const type=req.body.reminderType;
    const appointmentId=req.body.appointmentId || req.body.appointment?.id;
    let lockKey = 'manual_' + hash(JSON.stringify([phoneDigits(phone),message,getIsraelDateString()]));
    let legacyKeys:string[]=[];
    if(['booking','2hours'].includes(type) && validId(String(appointmentId||''))) lockKey=type+'_'+hash(JSON.stringify([String(appointmentId),phoneDigits(phone)]));
    if(['today','1day'].includes(type)) {
      if(!validId(String(appointmentId || ''))) return res.status(400).json({success:false,error:'Appointment ID required'});
      const appt=await getDoc(getTenantAppointmentDoc(tenantId,String(appointmentId)));
      if(!appt.exists || appt.data()?.status!=='confirmed' || phoneDigits(appt.data()?.customer_phone)!==phoneDigits(phone)) return res.status(400).json({success:false,error:'Appointment/recipient mismatch'});
      lockKey=reminderKey(type,phone,appt.data()?.appointment_date);
      const peers=await getTenantAppointmentsRef(tenantId).where('appointment_date','==',appt.data()?.appointment_date).get();
      legacyKeys=peers.docs.filter((d:any)=>phoneDigits(d.data().customer_phone)===phoneDigits(phone)).map((d:any)=>`${type==='today'?'morning':'evening'}_${d.id}_${appt.data()?.appointment_date}`);
    }
    if(!await tryClaimReminderLock(lockKey,tenantId,legacyKeys)) return res.status(409).json({success:false,error:'הודעה זו כבר נשלחה או ממתינה לבדיקת תוצאה'});
    const resSend = await sendSmsViaTelnyx(phone, message, tenantId);
    if(resSend.success) await markReminderLockSuccess(lockKey,tenantId,resSend);
    else await retainReminderFailure(lockKey,tenantId,resSend);

    const logEntry: SmsLogEntry = {
      id: randomUUID(),
      recipientName: customerName || 'לקוח/ה',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.success ? 'queued' : 'failed',
      reminderType: reminderType || 'manual_single',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || null,
    };
    await recordLogEntry(logEntry, tenantId);

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
    if(isDispatchRateLimited((req as any).adminPayload.uid)) return res.status(429).json({success:false,error:'Rate limit'});
    const { phone, message } = req.body;
    if (!phoneDigits(phone) || typeof message !== 'string' || !message.trim() || message.length>1600) {
      return res.status(400).json({ success: false, error: 'נא להזין טלפון והודעה' });
    }

    const tenantId = req.tenantId!;
    await activeTenant(tenantId);
    const type=req.body.reminderType;
    const appointmentId=req.body.appointmentId || req.body.appointment?.id;
    let lockKey = 'manual_' + hash(JSON.stringify([phoneDigits(phone),message,getIsraelDateString()]));
    let legacyKeys:string[]=[];
    if(['booking','2hours'].includes(type) && validId(String(appointmentId||''))) lockKey=type+'_'+hash(JSON.stringify([String(appointmentId),phoneDigits(phone)]));
    if(['today','1day'].includes(type)) {
      if(!validId(String(appointmentId || ''))) return res.status(400).json({success:false,error:'Appointment ID required'});
      const appt=await getDoc(getTenantAppointmentDoc(tenantId,String(appointmentId)));
      if(!appt.exists || appt.data()?.status!=='confirmed' || phoneDigits(appt.data()?.customer_phone)!==phoneDigits(phone)) return res.status(400).json({success:false,error:'Appointment/recipient mismatch'});
      lockKey=reminderKey(type,phone,appt.data()?.appointment_date);
      const peers=await getTenantAppointmentsRef(tenantId).where('appointment_date','==',appt.data()?.appointment_date).get();
      legacyKeys=peers.docs.filter((d:any)=>phoneDigits(d.data().customer_phone)===phoneDigits(phone)).map((d:any)=>`${type==='today'?'morning':'evening'}_${d.id}_${appt.data()?.appointment_date}`);
    }
    if(!await tryClaimReminderLock(lockKey,tenantId,legacyKeys)) return res.status(409).json({success:false,error:'הודעה זו כבר נשלחה או ממתינה לבדיקת תוצאה'});
    const resSend = await sendSmsViaTelnyx(phone, message, tenantId);
    if(resSend.success) await markReminderLockSuccess(lockKey,tenantId,resSend);
    else await retainReminderFailure(lockKey,tenantId,resSend);

    const logEntry: SmsLogEntry = {
      id: randomUUID(),
      recipientName: 'בדיקת מנהלת',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.success ? 'queued' : 'failed',
      reminderType: 'test',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || null,
    };
    await recordLogEntry(logEntry, tenantId);

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
app.get('/api/sms/logs', requireAdmin, async (req,res,next)=>{
  try {const snap=await collection(db,'tenants',req.tenantId!,'sms_logs').orderBy('sentAt','desc').limit(100).get(); res.json({success:true,logs:snap.docs.map((d:any)=>d.data())});}catch(err){next(err);}
});

// 7. Multi-Tenant List


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

const PRIMARY_MIGRATION_MARKER_ID = 'alex_primary_tenant_v18';
async function ensurePrimaryTenant(options: { force?: boolean } = {}): Promise<{ skipped: boolean; migrated: boolean }> {
  const markerRef = doc(db, 'system_migrations', PRIMARY_MIGRATION_MARKER_ID);
  const [markerBefore, primaryBefore] = await Promise.all([
    getDoc(markerRef),
    getDoc(getTenantDoc(PRIMARY_TENANT_ID)),
  ]);

  if (!options.force && markerBefore.exists && markerBefore.data()?.status === 'completed' && primaryBefore.exists) {
    return { skipped: true, migrated: false };
  }

  // Per-document migration receipts survive cancellation/deletion and interrupted runs.
  const previousImport = !!primaryBefore.data()?.migratedAt;
  const migrate = async (sourceCollection:string,targetCollection:string,transform=(x:any)=>x) => {
    const snap=await collection(db,sourceCollection).get();
    for(const item of snap.docs) {
      const target=doc(db,'tenants',PRIMARY_TENANT_ID,targetCollection,item.id);
      const receipt=doc(db,'migration_receipts',hash(sourceCollection+'/'+item.id));
      if(sourceCollection==='appointments' && previousImport && process.env.IMPORT_MISSING_LEGACY_APPOINTMENTS!=='true' && !(await getDoc(target)).exists) {
        console.warn('[Migration] Missing previously imported appointment retained only in legacy source:',item.id);
        continue;
      }
      await copyOnce(db,item.data(),target,receipt,transform);
    }
  };

  try { await getTenantDoc(PRIMARY_TENANT_ID).create(PRIMARY_TENANT_PROFILE); }
  catch(err:any){ if(err.code!==6 && err.code!=='already-exists') throw err; }

  const configRef=getTenantSettingsDoc(PRIMARY_TENANT_ID);
  const [services,schedule]=await Promise.all([getDoc(doc(db,'settings','services_config')),getDoc(doc(db,'settings','schedule_settings'))]);
  await db.runTransaction(async tx=>{
    const snap=await tx.get(configRef);
    const current=snap.data() || {};
    const patch:any={};
    if(!('services' in current)) patch.services=services.data()?.services || [{id:1,name:"לק ג׳ל",duration_minutes:90,price:150,category:'nails'}];
    if(!('scheduleSettings' in current)) patch.scheduleSettings=schedule.data() || {businessOpen:'09:20',businessClose:'20:30',fridayOpen:'09:20',fridayClose:'15:00',durationMinutes:90};
    if(Object.keys(patch).length) tx.set(configRef,patch,{merge:true});
  });

  await migrate('appointments','appointments',x=>({...x,tenantId:PRIMARY_TENANT_ID}));
  await migrate('customers','customers',x=>({...x,tenantId:PRIMARY_TENANT_ID}));
  await migrate('reminder_locks','reminder_locks');

  const legacyLogs=await collection(db,'sms_logs').get();
  for(const item of legacyLogs.docs) {
    const explicit=item.data().tenantId;
    const inferred=item.id.startsWith('sms_alex_beauty_')?PRIMARY_TENANT_ID:null;
    const targetTenant=validId(explicit)?explicit:inferred;
    if(!targetTenant) continue;
    await copyOnce(db,{...item.data(),tenantId:targetTenant},doc(db,'tenants',targetTenant,'sms_logs',item.id),doc(db,'migration_receipts',hash('sms_logs/'+item.id)));
  }

  const legacySms=await getDoc(doc(db,'settings','sms_reminders'));
  const oldSms=legacySms.exists ? legacySms : await getDoc(doc(db,'settings','reminders'));
  if(oldSms.exists) await copyOnce(db,oldSms.data(),getTenantSettingsDoc(PRIMARY_TENANT_ID,'sms_reminders'),doc(db,'migration_receipts','alex_sms_settings'),publicSettings);

  // Move provider secrets out of readable documents; clean old config copies atomically.
  const tenants=await collection(db,'tenants').get();
  for(const tenant of tenants.docs) {
    const smsRef=getTenantSettingsDoc(tenant.id,'sms_reminders'), cfgRef=getTenantSettingsDoc(tenant.id);
    const privateRef=doc(db,'tenants',tenant.id,'private_settings','sms_provider');
    await db.runTransaction(async tx=>{
      const [sms,cfg,priv]=await Promise.all([tx.get(smsRef),tx.get(cfgRef),tx.get(privateRef)]);
      const source={...(tenant.id===PRIMARY_TENANT_ID?oldSms.data():{}),...cfg.data(),...sms.data()};
      const secret=Object.fromEntries(['telnyxApiKey','telnyxFromNumber','telnyxFrom','telnyxProfileId'].filter(k=>source[k] && !priv.data()?.[k]).map(k=>[k,source[k]]));
      if(Object.keys(secret).length) tx.set(privateRef,secret,{merge:true});
      if(sms.exists) {const clean=publicSettings(sms.data()); for(const k of ['telnyxFromNumber','telnyxFrom','telnyxProfileId']) delete clean[k]; tx.set(smsRef,clean);}
      if(cfg.exists) {const clean=publicSettings(cfg.data()); if(clean.smsSettings) clean.smsSettings=publicSettings(clean.smsSettings); for(const k of ['telnyxFromNumber','telnyxFrom','telnyxProfileId']) delete clean[k]; tx.set(cfgRef,clean);}
    });
  }

  const now = new Date().toISOString();
  await Promise.all([
    setDoc(getTenantDoc(PRIMARY_TENANT_ID), { migratedAt: primaryBefore.data()?.migratedAt || now, migrationVersion: 18, updatedAt: now }, { merge: true }),
    setDoc(markerRef, { status: 'completed', version: 18, tenantId: PRIMARY_TENANT_ID, completedAt: now }, { merge: true }),
  ]);
  invalidateTenantCaches(PRIMARY_TENANT_ID);
  schedulerConfigCache = null;
  return { skipped: false, migrated: true };
}

app.get('/api/tenants', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    if (superAdminTenantsCache && superAdminTenantsCache.expiresAt > Date.now()) {
      return res.json({ success: true, tenants: superAdminTenantsCache.tenants, cached: true });
    }
    if (firestoreQuotaBackoffActive()) {
      if (superAdminTenantsCache) {
        return res.json({ success: true, tenants: superAdminTenantsCache.tenants, cached: true, stale: true, warning: 'Firestore quota temporarily exhausted' });
      }
      throw quotaBackoffError('Super Admin tenant list');
    }
    const snap = await getDocs(collection(db, 'tenants'));
    const baseTenants = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as any))
      .filter((t: any) => t.status !== 'deleted');

    // Aggregation count avoids downloading every appointment/customer document.
    // Firestore bills aggregation by index work (minimum one read) instead of one
    // full document read per record, which is crucial on the free tier.
    const tenants = await Promise.all(baseTenants.map(async (tenant: any) => {
      try {
        const [appointmentsAgg, customersAgg] = await Promise.all([
          getTenantAppointmentsRef(tenant.id).count().get(),
          collection(db, 'tenants', tenant.id, 'customers').count().get(),
        ]);
        return {
          ...tenant,
          totalAppointments: Number(appointmentsAgg.data().count || 0),
          totalCustomers: Number(customersAgg.data().count || 0),
          totalRevenue: Number(tenant.totalRevenue || 0),
        };
      } catch (countErr: any) {
        if (isFirestoreQuotaError(countErr)) throw countErr;
        console.warn(`[Tenants API] count warning for ${tenant.id}:`, countErr?.message || countErr);
        return { ...tenant, totalRevenue: Number(tenant.totalRevenue || 0) };
      }
    }));
    superAdminTenantsCache = { expiresAt: Date.now() + SUPER_ADMIN_CACHE_TTL_MS, tenants };
    return res.json({ success: true, tenants });
  } catch (err: any) {
    const quotaExceeded = noteFirestoreQuota(err, 'Super Admin tenant list');
    console.error('[Tenants API] Failed:', err);
    if (quotaExceeded && superAdminTenantsCache) {
      return res.json({ success: true, tenants: superAdminTenantsCache.tenants, cached: true, stale: true, warning: 'Firestore quota temporarily exhausted' });
    }
    return res.status(quotaExceeded ? 503 : 500).json({ success: false, error: quotaExceeded ? 'Firestore quota temporarily exhausted; try again after reset' : (err?.message || 'Failed to load tenants') });
  }
});

// 8. Current Tenant Profile & Branding Endpoint (/api/tenant/current)
app.get('/api/tenant/current', async(req,res,next)=>{
  try {
    const tenantId=req.tenantId!;
    const profile=await activeTenant(tenantId);
    const config=await getDoc(getTenantSettingsDoc(tenantId));
    const {ownerAuthUid,ownerAuthEmail,...tenant}=profile || {};
    res.json({success:true,tenantId,tenant:{...tenant,id:tenantId},config:{services:config.data()?.services || [],scheduleSettings:config.data()?.scheduleSettings || {businessOpen:'',businessClose:'',fridayOpen:'',fridayClose:'',durationMinutes:60}}});
  }catch(err){next(err);}
});

function normalizedDomain(value:unknown) {
  const domain=String(value || '').trim().toLowerCase();
  if(domain && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('Invalid custom domain');
  return domain;
}
async function saveTenant(tenantId:string,profile:any,config:any,create:boolean) {
  if(!validId(tenantId)) throw new Error('Invalid tenant ID');
  const domain=normalizedDomain(profile.customDomain);
  await db.runTransaction(async tx=>{
    const ref=getTenantDoc(tenantId), existing=await tx.get(ref);
    if(create && existing.exists) throw new Error('Tenant ID already exists');
    if(!create && !existing.exists) throw new Error('Tenant not found');
    if(existing.data()?.status==='deleted') throw new Error('Deleted tenant ID cannot be reused');
    const oldDomain=existing.data()?.customDomain;
    const mapping=domain?await tx.get(doc(db,'domains',domain)):null;
    const oldMapping=oldDomain && oldDomain!==domain?await tx.get(doc(db,'domains',oldDomain)):null;
    if(mapping?.exists && mapping.data()?.tenantId!==tenantId) throw new Error('Domain belongs to another tenant');
    tx.set(ref,{...profile,customDomain:domain},{merge:!create});
    tx.set(getTenantSettingsDoc(tenantId),config,{merge:!create});
    if(domain) tx.set(doc(db,'domains',domain),{tenantId,hostname:domain});
    if(oldMapping?.data()?.tenantId===tenantId) tx.delete(oldMapping.ref);
  });
  invalidateTenantCaches(tenantId);
  domainTenantCache.clear();
  schedulerConfigCache = null;
}

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

    await saveTenant(tenantId,tenantProfile,tenantConfig,true);

    const testUrl = `/?tenant=${tenantId}`;
    const adminUrl = `/admin?tenant=${tenantId}`;

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

    await saveTenant(tenantId,tenantProfile,tenantConfig,false);

    return res.json({ success: true, tenantId, tenant: { id: tenantId, ...existing, ...tenantProfile }, config: tenantConfig,
      testUrl: `/?tenant=${tenantId}`, adminUrl: `/admin?tenant=${tenantId}` });
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

    if(tenantSnap.data()?.status==='deleted') return res.status(409).json({success:false,error:'Tenant is deleted'});
    if(tenantSnap.data()?.ownerAuthEmail && tenantSnap.data()?.ownerAuthEmail!==email) return res.status(409).json({success:false,error:'Use the existing owner email; reassignment requires an explicit migration'});
    let user;
    try { user = await getAuth().getUserByEmail(email); }
    catch(err:any) { if(err.code!=='auth/user-not-found') throw err; user = await getAuth().createUser({ email, password, displayName: displayName || undefined, emailVerified: false }); }
    if(user.customClaims?.role==='super_admin' || getSuperAdminEmails().includes(email) || (user.customClaims?.tenantId && user.customClaims.tenantId!==tenantId) || (tenantSnap.data()?.ownerAuthUid && tenantSnap.data()?.ownerAuthUid!==user.uid)) return res.status(409).json({success:false,error:'Account is already assigned; owner reassignment requires an explicit migration'});
    await db.runTransaction(async tx=>{
      const ownerRef=doc(db,'adminUsers',user.uid), tenantRef=getTenantDoc(tenantId);
      const [binding,current]=await Promise.all([tx.get(ownerRef),tx.get(tenantRef)]);
      if((binding.exists && binding.data()?.tenantId!==tenantId) || (current.data()?.ownerAuthUid && current.data()?.ownerAuthUid!==user.uid)) throw new Error('Account/tenant assignment conflict');
      tx.set(ownerRef,{uid:user.uid,email,role:'business_admin',tenantId,disabled:true},{merge:true});
      tx.update(tenantRef,{ownerAuthUid:user.uid,ownerAuthEmail:email});
    });
    if (user.email === email) {
      await getAuth().updateUser(user.uid, { password, displayName: displayName || user.displayName || undefined, disabled: false });
    }
    await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, role: 'business_admin', tenantId });
    await getAuth().revokeRefreshTokens(user.uid);
    await setDoc(doc(db, 'adminUsers', user.uid), {
      uid: user.uid, email, displayName, role: 'business_admin', tenantId, disabled: false, updatedAt: new Date().toISOString()
    }, { merge: true });
    await setDoc(getTenantDoc(tenantId), { ownerAuthUid: user.uid, ownerAuthEmail: email, updatedAt: new Date().toISOString() }, { merge: true });
    invalidateTenantCaches(tenantId);
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
    if(disabled) await getAuth().revokeRefreshTokens(uid);
    await setDoc(doc(db, 'adminUsers', uid), { disabled, updatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true, disabled });
  } catch (err: any) { return res.status(500).json({ success: false, error: err?.message }); }
});

// 9.5 Delete Tenant Endpoint
app.delete('/api/super-admin/tenants/:tenantId',requireSuperAdmin,async(req,res,next)=>{
  try {
    const tenantId=req.params.tenantId;
    if(!validId(tenantId) || tenantId===PRIMARY_TENANT_ID) return res.status(400).json({success:false,error:'Cannot delete primary tenant'});
    const tenant=await getDoc(getTenantDoc(tenantId));
    if(!tenant.exists) return res.status(404).json({success:false,error:'Tenant not found'});
    // Persistent tombstone immediately denies access on every server and stops reminders.
    await getTenantDoc(tenantId).update({status:'deleted',deletedAt:new Date().toISOString()});
    if(tenant.data()?.ownerAuthUid) {
      await getAuth().updateUser(tenant.data()!.ownerAuthUid,{disabled:true});
      await getAuth().revokeRefreshTokens(tenant.data()!.ownerAuthUid);
    }
    const mappings=await collection(db,'domains').where('tenantId','==',tenantId).get();
    for(const mapping of mappings.docs) await mapping.ref.delete();
    invalidateTenantCaches(tenantId);
    domainTenantCache.clear();
    schedulerConfigCache = null;
    res.json({success:true,message:'Tenant deactivated; records retained for recovery'});
  }catch(err){next(err);}
});

// 10. Protected tenant admin data
app.get('/api/admin/tenant-data', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = (req.query.tenant as string) || req.tenantId || 'alex_beauty';
    const isDev = process.env.NODE_ENV !== 'production';

    // Reuse the same short-lived cache as the main admin appointment feed.
    // Mutations invalidate it immediately, so this saves reads without hiding local changes.
    let tenantAppointments: any[] = [];
    try {
      tenantAppointments = await cachedAppointmentRows(tenantId, true);
    } catch(err) { throw err; }

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

// Compatibility endpoint: Firestore remains the sole appointment source.
app.post('/api/whatsapp/sync-appointments',requireAdmin,(_req,res)=>res.json({success:true,message:'Server reads confirmed appointments from Firestore'}));

// Registration Webhook Endpoint
app.post('/api/register-webhook', async (req: Request, res: Response) => {
  try {
    const { name, phone, acceptedTerms, registeredAt } = req.body;
    const sanitizedName = String(name || '').trim().substring(0, 100);
    const sanitizedPhone = String(phone || '').trim().substring(0, 30);

    if (!sanitizedName || !sanitizedPhone) {
      return res.status(400).json({ success: false, error: 'Name and phone are required' });
    }


    return res.json({ success: true, message: 'Registration received' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message });
  }
});

// ----------------------------------------------------
// Vite & Static Asset Handling
// ----------------------------------------------------
app.get('/api/health',(_req,res)=>res.json({success:true,service:'alex-multi-tenant'}));
app.use('/api',(_req,res)=>res.status(404).json({success:false,error:'API route not found'}));
app.use((err:any,_req:Request,res:Response,_next:NextFunction)=>{
  const quotaExceeded = noteFirestoreQuota(err, 'API request');
  console.error('[API]',err?.message || err);
  if (quotaExceeded) return res.status(503).json({success:false,error:'מכסת Firestore היומית נוצלה זמנית. השירות יישאר פעיל ויחזור לנתונים לאחר איפוס המכסה.'});
  res.status(err.status || 500).json({success:false,error:'הפעולה נכשלה. יש לנסות שוב או לפנות למנהלת.'});
});
let bootstrapRetryTimer: ReturnType<typeof setTimeout> | null = null;
async function runBootstrapMaintenance() {
  try {
    const result = await ensurePrimaryTenant();
    console.log(`[Tenant Bootstrap] ✅ ${PRIMARY_TENANT_ID} migration=${result.skipped ? 'already-complete' : 'completed'}`);
  } catch (bootstrapErr: any) {
    const quotaExceeded = noteFirestoreQuota(bootstrapErr, 'Tenant Bootstrap');
    if (quotaExceeded) {
      console.warn('[Tenant Bootstrap] ⚠️ deferred because Firestore daily quota is exhausted. HTTP server remains online; retry scheduled.');
      if (!bootstrapRetryTimer) {
        bootstrapRetryTimer = setTimeout(() => {
          bootstrapRetryTimer = null;
          void runBootstrapMaintenance();
        }, Math.max(FIRESTORE_QUOTA_BACKOFF_MS, 30 * 60_000));
        (bootstrapRetryTimer as any)?.unref?.();
      }
      return;
    }
    // A migration problem must be visible in logs, but it must not put Render in
    // a restart loop. Existing tenant data can still be served and repaired from
    // the protected migration endpoint after the underlying issue is resolved.
    console.error('[Tenant Bootstrap] ❌ maintenance failed (server kept online):', bootstrapErr?.message || bootstrapErr);
  }
}

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
        if (fs.existsSync(p)) return res.sendFile(p);
      }
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind the HTTP port first. Firestore quota exhaustion must never prevent
  // Render from seeing a healthy process and must never create a restart storm.
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Alex Beauty Server running on http://0.0.0.0:${PORT} [Israel Time: ${getIsraelTime().timeStr}]`);
    const timer = setTimeout(() => void runBootstrapMaintenance(), 1_000);
    (timer as any).unref?.();
    if (String(process.env.CRON_SECRET || '').trim().length >= 24) {
      console.log('[Cron] ✅ secure heartbeat endpoint enabled at /api/cron/heartbeat');
    } else {
      console.warn('[Cron] ⚠️ CRON_SECRET missing/too short; /api/cron/heartbeat will return 503');
    }
    if(process.env.SMS_SCHEDULER_ENABLED !== 'false') void initSmsEngine();
  });
}

if(process.env.NODE_ENV!=='test') startServer().catch(err=>{console.error('[Startup]',err?.message || err);process.exitCode=1;});
export { app, ensurePrimaryTenant, sendRemindersForDate, checkAndDispatchDueReminders, db };

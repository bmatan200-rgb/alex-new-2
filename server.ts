import { DeliveryTracker, DELIVERY_JOBS } from './server/sms/deliveryTracker';
import { createSmsProvider, SmsProviderError, type SmsProvider, type SmsSendResult, type DeliveryStatus } from './server/sms/providers';
import { legacyLogLockKey, mergeDeliveryResult, manualSmsLockKey } from './server/sms/logs';
import { publicBusyAppointment } from './src/utils/calendarBlocks';
import { scheduledRetryAt } from './server/smsDeliveryPolicy';
import { DurableReminderScheduler, schedulePatch, scheduleId, SCHEDULE_COLLECTION, claimScheduledMessage, beginScheduledSend, MAX_MESSAGE_ATTEMPTS, SmsPacer, runBounded } from './server/reminderScheduler';
import { buildPwaManifest, type PwaRole } from './src/utils/pwa';
import { BUSINESS_ADMIN_ICON_IDS, businessAdminIconSvg, isBusinessAdminIconId, isBusinessAdminRasterIcon, getBusinessAdminIconDetails } from './src/utils/businessAdminIcons';
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
const tenantAdminIconCache = new Map<string, { iconId: string; expiresAt: number }>();

function invalidateTenantCaches(tenantId: string) {
  appointmentListCache.delete(`${tenantId}:admin`);
  appointmentListCache.delete(`${tenantId}:public`);
  tenantProfileCache.delete(tenantId);
  tenantAdminIconCache.delete(tenantId);
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
app.get('/manifest.json', async (req, res) => {
  const role: PwaRole = req.query.app === undefined ? 'customer'
    : req.query.app === 'admin' ? 'admin' : 'super-admin';
  if (req.query.app !== undefined && req.query.app !== 'admin' && req.query.app !== 'super-admin') {
    return res.status(400).json({ error: 'Invalid application' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.type('application/manifest+json');
  // Platform management has no tenant dependency or tenant-specific install identity.
  if (role === 'super-admin') return res.json(buildPwaManifest(role, '', ''));
  let tenantId = typeof req.query.tenant === 'string' && validId(req.query.tenant)
    ? req.query.tenant
    : PRIMARY_TENANT_ID;
  if (!req.query.tenant) {
    const cachedDomain = domainTenantCache.get(req.hostname.toLowerCase());
    if (cachedDomain && validId(cachedDomain.tenantId)) tenantId = cachedDomain.tenantId;
    else {
      try {
        const mapped = await getDoc(doc(db, 'domains', req.hostname.toLowerCase()));
        const domainTenantId = mapped.exists ? String(mapped.data()?.tenantId || '') : '';
        if (validId(domainTenantId)) {
          tenantId = domainTenantId;
          domainTenantCache.set(req.hostname.toLowerCase(), { expiresAt: Date.now() + 10 * 60_000, tenantId });
        }
      } catch {}
    }
  }
  let tenantName = 'הזמנת תורים לעסק';
  let adminIcon = '';
  try {
    const tenant = await activeTenant(tenantId);
    if (typeof tenant?.name === 'string' && tenant.name.trim()) tenantName = tenant.name.trim();
    adminIcon = await ensureTenantAdminIcon(tenantId);
  } catch {
    // Keep the manifest available when tenant data is temporarily unavailable.
  }
  res.json(buildPwaManifest(role, tenantId, tenantName, adminIcon));
});
app.get('/tenant-admin-icons/:iconId.svg', (req, res) => {
  const businessName = typeof req.query.name === 'string' ? req.query.name : '';
  let rasterDataUri = '';
  if (isBusinessAdminRasterIcon(req.params.iconId)) {
    const symbolId = getBusinessAdminIconDetails(req.params.iconId)?.symbol.id;
    if (symbolId) {
      try {
        const artwork = fs.readFileSync(path.join(process.cwd(), 'public', 'business-icon-artwork', `${symbolId}.webp`));
        rasterDataUri = `data:image/webp;base64,${artwork.toString('base64')}`;
      } catch {
        return res.status(404).type('text/plain').send('Icon artwork not found');
      }
    }
  }
  const svg = businessAdminIconSvg(req.params.iconId, businessName, rasterDataUri);
  if (!svg) return res.status(404).type('text/plain').send('Icon not found');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/svg+xml').send(svg);
});
app.param(['tenantId','id'], (req,res,next,value)=>{
  if(!validId(value)) return res.status(400).json({success:false,error:'Invalid document ID'});
  next();
});



// ----------------------------------------------------
// Secure Admin Data Endpoints
// ----------------------------------------------------
// Shared appointment endpoints are customer operations unless admin intent is
// explicit. The header selects a flow; decodeAdmin/authorizeTenant grant access.
async function optionalAdmin(req: Request) {
  if (req.headers['x-operation-context'] !== 'admin') return null;
  const admin = await decodeAdmin(req);
  if (!admin) throw new Error('נדרשת הרשאת מנהל');
  return admin;
}
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
    const admin = (req as any).adminPayload || await optionalAdmin(req);
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
      return publicBusyAppointment(id, data);
    });
    res.json({success:true,appointments});
  }catch(err:any){
    const quotaExceeded = noteFirestoreQuota(err, 'appointments list');
    res.status(quotaExceeded ? 503 : 403).json({success:false,error:quotaExceeded?'Firestore quota temporarily exhausted':err.message});
  }
});
app.post('/api/appointments/book',async(req,res)=>{
  const bookingStartedAt=Date.now();
  const recordBookingTiming=()=>{
    const durationMs=Date.now()-bookingStartedAt;
    res.setHeader('Server-Timing',`booking;dur=${durationMs}`);
    if(durationMs>=800) console.warn(`[Performance] slow booking tenant=${req.tenantId || 'unknown'} duration=${durationMs}ms`);
  };
  try {
    if(isDispatchRateLimited('book:'+req.ip)) {recordBookingTiming();return res.status(429).json({success:false,error:'יש להמתין לפני קביעת תור נוסף'});}
    const tenantId=req.tenantId!;
    const admin=await optionalAdmin(req);
    const canManage=!!(admin && authorizeTenant(admin,[tenantId],tenantId)===tenantId);
    const a=req.body?.appointment || {};
    if(!validDate(a.appointment_date) || !validTime(a.start_time) || !validTime(a.end_time) || a.start_time>=a.end_time || typeof a.customer_name!=='string' || !a.customer_name.trim() || a.customer_name.length>100 || (!canManage && !phoneDigits(a.customer_phone))) {recordBookingTiming();return res.status(400).json({success:false,error:'פרטי תור לא תקינים'});}
    const accessToken=randomBytes(32).toString('hex');
    const id=validId(req.body.requestId) ? req.body.requestId : randomUUID();
    const ref=getTenantAppointmentDoc(tenantId,id);
    const tenantRef=getTenantDoc(tenantId);
    const configRef=getTenantSettingsDoc(tenantId);
    const guard=doc(db,'tenants',tenantId,'booking_days',a.appointment_date);
    const customerRef=phoneDigits(a.customer_phone)?doc(db,'tenants',tenantId,'customers','cust_'+phoneDigits(a.customer_phone)):null;
    await db.runTransaction(async tx=>{
      // Independent document reads are batched into one Firestore round trip.
      // The booking-day guard and same-day overlap query remain in the same
      // transaction, so the double-booking protection is unchanged.
      const refs:any[]=[tenantRef,configRef,guard,ref,...(customerRef?[customerRef]:[])];
      const snapshots:any[]=await (tx as any).getAll(...refs);
      const tenant=snapshots[0], config=snapshots[1], existing=snapshots[3];
      const customer=customerRef?snapshots[4]:null;
      if(!tenant.exists || !['active','trial'].includes(tenant.data()?.status)) throw new Error('העסק אינו פעיל');
      if(existing.exists) throw new Error('בקשה זו כבר נשמרה; יש לרענן את היומן');
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
      const sameDay=await tx.get(getTenantAppointmentsRef(tenantId).where('appointment_date','==',a.appointment_date));
      if(sameDay.docs.some((d:any)=>overlaps(d.data(),a))) throw new Error('השעה הזו כבר נתפסה, נא לבחור שעה אחרת');
      const saved={customer_name:a.customer_name.trim(),customer_phone:String(a.customer_phone||''),service_id:a.service_id ?? 0,service_name:service?.name || String(a.service_name||''),price:service?.price ?? Number(a.price||0),appointment_date:a.appointment_date,start_time:a.start_time,end_time:a.end_time,status:'confirmed',notes:String(a.notes||'').slice(0,2000),created_at:new Date().toISOString(),tenantId,accessTokenHash:hash(accessToken)};
      tx.create(ref,saved);
      if(customerRef && !customer?.exists) tx.create(customerRef,{full_name:saved.customer_name,phone:saved.customer_phone,notes:'',created_at:saved.created_at,last_login_at:saved.created_at});
      tx.set(guard,{updatedAt:new Date().toISOString()});
    });
    invalidateAppointmentsCache(tenantId);
    recordBookingTiming();
    res.json({success:true,id,accessToken});
  }catch(err:any){
    recordBookingTiming();
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

// Customer registration is intentionally separate from the admin-only customer
// directory upsert API. The customer confirms terms in the UI and the server
// stores a small consent record on the tenant-scoped customer document.
async function registerCustomer(req: Request, res: Response) {
  const name = String(req.body?.full_name ?? req.body?.name ?? '').trim();
  const phone = phoneDigits(req.body?.phone);
  const signature = String(req.body?.signatureDataUrl || '');
  const acceptedTerms = req.body?.acceptedTerms === true;
  if (!name || name.length > 100 || !phone || !acceptedTerms || signature.length > 250_000 || (signature && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature))) {
    return res.status(400).json({ success: false, error: 'פרטי הרשמה או אישור תקנון אינם תקינים' });
  }
  try {
    const tenantId = req.tenantId!;
    await activeTenant(tenantId);
    const ref = doc(db, 'tenants', tenantId, 'customers', `cust_${phone}`);
    const now = new Date().toISOString();
    const existing = await getDoc(ref);
    const current = existing.data() || {};
    await setDoc(ref, {
      full_name: name,
      phone: String(req.body.phone).trim(),
      ...(current.created_at ? {} : { created_at: now }),
      last_login_at: now,
      termsConsent: { accepted: true, version: '2026-10-01', acceptedAt: now },
      ...(signature ? { signatureDataUrl: signature } : {}),
    }, { merge: true });
    return res.json({ success: true });
  } catch (err: any) {
    const quotaExceeded = noteFirestoreQuota(err, 'customer registration');
    return res.status(quotaExceeded ? 503 : 500).json({ success: false, error: quotaExceeded ? 'Firestore quota temporarily exhausted' : (err?.message || 'לא ניתן לשמור הרשמה כעת') });
  }
}
app.post('/api/customer/register', registerCustomer);

// Verify Firebase identity, current server-side roles, revocation and tenant ownership.
type AdminRole = 'super_admin' | 'business_admin';

type AdminPayload = {
  uid: string;
  email?: string;
  role: AdminRole;
  tenantId?: string;
};

// V23 security invariant: there is exactly ONE Super Admin account.
// Do not trust a stale/custom Firebase claim by itself. Even if another user somehow
// carries role=super_admin, the server will never grant global access unless the
// authenticated Firebase email is the canonical account below.
const PRIMARY_SUPER_ADMIN_EMAIL = 'bmatan200@gmail.com';
const APP_VERSION = '41.0.0';

function getSuperAdminEmails() {
  return [PRIMARY_SUPER_ADMIN_EMAIL];
}

async function decodeAdmin(req: Request): Promise<AdminPayload | null> {
  if (!adminSdkReady) return null;
  const token = (req.headers['authorization'] as string | undefined)?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const decoded: any = await getAuth().verifyIdToken(token, true);
  const currentUser = await getAuth().getUser(decoded.uid);
  if (currentUser.disabled) return null;

  const claims = currentUser.customClaims || {};
  const email = String(currentUser.email || decoded.email || '').trim().toLowerCase();

  // Hard server-side allowlist: only bmatan200@gmail.com can ever be Super Admin.
  if (email === PRIMARY_SUPER_ADMIN_EMAIL) {
    if (claims.role !== 'super_admin' || claims.tenantId) {
      const { tenantId: _legacyTenantId, ...restClaims } = claims as any;
      await getAuth().setCustomUserClaims(decoded.uid, { ...restClaims, role: 'super_admin' });
    }
    return { uid: decoded.uid, email: currentUser.email || decoded.email, role: 'super_admin' };
  }

  // Every other account is tenant-scoped only. A stale super_admin claim never grants
  // access. If the account has a valid business binding, normalize it back to
  // business_admin so Alex/Avi/any future owner can still sign in normally.
  const binding = await getDoc(doc(db, 'adminUsers', decoded.uid));
  const bindingData = binding.exists ? (binding.data() || {}) : {};
  const tenantId = validId(bindingData?.tenantId)
    ? String(bindingData.tenantId)
    : (validId(claims.tenantId) ? String(claims.tenantId) : '');

  if (bindingData?.disabled === true || !tenantId || (bindingData.role && bindingData.role !== 'business_admin')) return null;

  const tenant = await getDoc(getTenantDoc(tenantId));
  if (!tenant.exists || !['active', 'trial'].includes(tenant.data()?.status) || tenant.data()?.ownerAuthUid !== decoded.uid) return null;

  if (claims.role !== 'business_admin' || claims.tenantId !== tenantId) {
    const { role: _legacyRole, tenantId: _legacyTenantId, ...restClaims } = claims as any;
    await getAuth().setCustomUserClaims(decoded.uid, { ...restClaims, role: 'business_admin', tenantId });
  }

  return { uid: decoded.uid, email: currentUser.email || decoded.email, role: 'business_admin', tenantId };
}

async function requireIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const admin = await decodeAdmin(req);
    if (!admin) return res.status(403).json({ success: false, error: 'לחשבון אין הרשאת ניהול' });
    (req as any).adminPayload = admin;
    return next();
  } catch (err: any) {
    console.warn('[Auth] token verification failed:', err?.message);
    return res.status(401).json({ success: false, error: 'ההתחברות פגה, יש להתחבר מחדש' });
  }
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

app.get('/api/auth/me', requireIdentity, (req: Request, res: Response) => {
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
  status: DeliveryStatus;
  provider?: string;
  providerMessageId?: string;
  providerStatus?: string;
  reminderLockKey?: string;
  deliveryCheckedAt?: string;
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

const smsPacer = new SmsPacer(clampMs(process.env.SMS_SEND_INTERVAL_MS, 50, 50, 60_000));
const smsConcurrency = Math.floor(clampMs(process.env.SMS_SEND_CONCURRENCY, 20, 1, 20));
const smsProviderCache = new Map<string, { expiresAt: number; value: any }>();
async function getSmsProvider(tenantId: string, originalProvider?: string): Promise<SmsProvider> {
  let cached = smsProviderCache.get(tenantId);
  if (!cached || cached.expiresAt < Date.now()) {
    const snapshot = await getDoc(doc(db,'tenants',tenantId,'private_settings','sms_provider'));
    cached = {expiresAt:Date.now()+60_000,value:snapshot.data() || {}};
    if (smsProviderCache.size > 1000) smsProviderCache.clear();
    smsProviderCache.set(tenantId,cached);
  }
  const id = originalProvider || String(cached.value.provider || process.env.SMS_PROVIDER || 'telnyx');
  return createSmsProvider(id,cached.value,sharedSmsProviderAllowed(tenantId));
}
async function sendSmsViaProvider(to: string, message: string, tenantId: string, deadline = Infinity, begin?: () => Promise<boolean>): Promise<SmsSendResult> {
  if (process.env.SMS_SENDING_ENABLED === 'false') return {success:false,deferred:true,error:'שליחת SMS מושבתת זמנית'};
  const digits = phoneDigits(to);
  if (!digits) return {success:false,error:'מספר טלפון לא תקין'};
  const provider = await getSmsProvider(tenantId);
  const launched = await smsPacer.launch(async () => {
    if (Date.now() < smsPacer.cooldownUntil) return {result:{success:false,deferred:true,error:'הספק הגביל את הקצב. השליחה מושהית זמנית'}};
    if (Date.now() >= deadline) return {result:{success:false,deferred:true,error:'תקציב זמן הסבב הסתיים; התזכורת תמשיך בסבב הבא'}};
    if (process.env.SMS_SENDING_ENABLED === 'false') return {result:{success:false,deferred:true,error:'שליחת SMS מושבתת זמנית'}};
    if (begin && !await begin()) return {result:{success:false,lostClaim:true,error:'התזכורת השתנתה לפני השליחה'}};
    // Return a wrapped promise so pacing serializes starts, not provider response latency.
    return {response:provider.send('+'+digits,message)};
  });
  if (launched.result) return launched.result;
  const result = await launched.response!;
  if (result.retryAfterMs && result.rateLimited) smsPacer.pause(result.retryAfterMs);
  if (result.success) console.log(`[SMS Gateway] התקבל אצל ${provider.id}; delivery=${result.data?.status}; messageId=${result.data?.id}`);
  else console.warn(`[SMS Gateway] ${provider.id}: ${result.error}`);
  return result;
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
  const ref=doc(db,'tenants',tenantId,'reminder_locks',key);
  const data=result?.data;
  await db.runTransaction(async tx=>{
    tx.set(ref,{status:'sent',sentAt:new Date().toISOString(),providerMessageId:data?.id || null,provider:data?.provider || null,
      deliveryStatus:data?.status || 'unknown',deliveryAttention:data?.status === 'failed',deliveryAttentionReason:data?.status === 'failed' ? data.errorMessage || 'כישלון מסירה אצל הספק' : null},{merge:true});
    if(data?.id) tx.set(deliveryTracker.jobRef(tenantId,key,data.id),deliveryTracker.acceptedJob(tenantId,key,data));
  });
}
async function retainReminderFailure(key:string,tenantId:string,result:any, scheduledAttempts = 0) {
  // An uncertain provider result is never automatically retried: SMS APIs are not a transaction with Firestore.
  const retryAt = scheduledRetryAt(result,scheduledAttempts,MAX_MESSAGE_ATTEMPTS,Date.now()) || null;
  const retry = retryAt !== null;
  await setDoc(doc(db,'tenants',tenantId,'reminder_locks',key),{status:result.uncertain?'unknown':retry?'retry_pending':'failed', retryAt,
    error:result.error || 'Unknown failure',updatedAt:new Date().toISOString()},{merge:true});
  return retryAt;
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
      status: entry.status || 'unknown',
      provider: entry.provider || null,
      providerMessageId: entry.providerMessageId || null,
      providerStatus: entry.providerStatus || null,
      reminderLockKey: entry.reminderLockKey || null,
      deliveryCheckedAt: entry.deliveryCheckedAt || null,
      deliveryAttention:entry.status === 'failed' || (entry.status === 'unknown' && !entry.providerMessageId),
      deliveryAttentionReason:entry.status === 'failed' ? entry.errorMessage || 'שליחה נכשלה; נדרש טיפול' : (entry.status === 'unknown' && !entry.providerMessageId ? 'לא התקבלה תוצאה ודאית ואין מזהה ספק; בדוק לפני שליחה חוזרת' : null),
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
        await setDoc(doc(db, 'tenants', tenantId, 'sms_logs', sanitizedEntry.id), sanitizedEntry, { merge: true });
        if(entry.providerMessageId && entry.reminderLockKey) await deliveryTracker.attachLog(tenantId,entry.reminderLockKey,entry.providerMessageId,sanitizedEntry.id);
      } catch (innerErr: any) {
        console.warn('[SMS Logs] setDoc catch block warning:', innerErr?.message);
      }
    }
  } catch (err: any) {
    console.warn('[SMS Logs] ⚠️ Safe error recording log entry:', err?.message);
  }
}

async function getTenantSmsSettings(tenantId: string, tx?: any): Promise<any> {
  const ref=getTenantSettingsDoc(tenantId,'sms_reminders');
  const snap = tx ? await tx.get(ref) : await getDoc(ref);
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

async function sendRemindersForDate(targetDate: string, reminderType: 'today' | '1day', tenantId = PRIMARY_TENANT_ID, tenantSettings?: any, options: { scheduled?: boolean; deadline?: number; guard?: {ref:any;revision:string;token:string} } = {}) {
  if (process.env.SMS_SENDING_ENABLED === 'false') return { success: true, sentCount: 0, skipped: true, reason: 'sending_disabled' };
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
    let pendingCount = 0;
    let attention = false;
    let retryAt = Infinity;
    const results: any[] = [];

    await runBounded(Object.entries(customerGroups), options.scheduled ? smsConcurrency : 1, async ([phoneKey, appts]) => {
      if (options.scheduled && Date.now() >= (options.deadline || Infinity)) { pendingCount++; return; }
      if(acceptedPhones.has(phoneKey)) return;
      // Recheck current records before dispatch so a cancellation or reschedule
      // while a batch is draining cannot send the stale appointment text.
      const fresh = options.scheduled ? (await db.getAll(...appts.map(a => getTenantAppointmentDoc(tenantId, String(a.id)))))
        .filter(s => s.exists).map(s => ({ ...s.data(), id: s.id } as ServerAppointment))
        .filter(a => a.status === 'confirmed' && a.appointment_date === targetDate && cleanPhoneDigits(a.customer_phone) === phoneKey
          && (!isMorning || a.start_time > getIsraelTime().timeStr)) : appts;
      if (!fresh.length) return;
      const firstAppt = fresh[0];
      const lockKey = reminderKey(reminderType,phoneKey,targetDate);
      const legacyKeys = appts.map(a=>`${isMorning?'morning':'evening'}_${a.id}_${targetDate}`);

      const lockRef = doc(db,'tenants',tenantId,'reminder_locks',lockKey);
      const claim = options.scheduled ? await claimScheduledMessage(db, lockRef,
        legacyKeys.flatMap(k => [doc(db,'tenants',tenantId,'reminder_locks',k), ...(tenantId===PRIMARY_TENANT_ID ? [doc(db,'reminder_locks',k)] : [])])) : null;
      if (claim?.decision === 'wait') { pendingCount++; retryAt = Math.min(retryAt, claim.retryAt || Date.now() + 120_000); return; }
      if (claim?.decision === 'attention') { attention = true; return; }
      const claimed = options.scheduled ? claim?.decision === 'claim' : await tryClaimReminderLock(lockKey, tenantId, legacyKeys);
      if (!claimed) {
        console.log(`[SMS Scheduler] ⏭️ דילוג (נשלח כבר בעבר): ${firstAppt.customer_name} (${firstAppt.customer_phone})`);
        return;
      }

      let messageText = '';
      if (fresh.length === 1) {
        const rawTemplate = isMorning
          ? (smsSettings?.morningTemplate || smsSettings?.customerTodayTemplate || DEFAULT_SMS_SETTINGS.morningTemplate)
          : (smsSettings?.eveningTemplate || smsSettings?.customer1DayTemplate || DEFAULT_SMS_SETTINGS.eveningTemplate);
        messageText = formatMessageTemplate(rawTemplate, firstAppt, brand);
      } else {
        const [y, m, d] = targetDate.split('-');
        const israeliDate = `${d}/${m}/${y}`;
        const appointmentsList = fresh.map((a) => `✨ בשעה ${a.start_time} - ${a.service_name}`).join('\n');
        messageText = isMorning
          ? `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך להיום (${israeliDate}):\n${appointmentsList}\nלבירור: ${brand?.phone || ''}\nנתראה! 💖`
          : `היי ${firstAppt.customer_name} 🌸\nתזכורת לתורים שלך למחר (${israeliDate}):\n${appointmentsList}\nלבירור: ${brand?.phone || ''}\nמחכים לראותך! 💖`;
      }

      const res = await sendSmsViaProvider(firstAppt.customer_phone, messageText, tenantId, options.deadline,
        options.scheduled ? () => beginScheduledSend(db,lockRef,claim!.token!,Date.now(),options.guard) : undefined);
      if (options.scheduled && (res.deferred || res.lostClaim)) {
        await db.runTransaction(async tx => {
          const current = await tx.get(lockRef);
          if (current.data()?.token === claim!.token && current.data()?.status === 'prepared') tx.update(lockRef,{status:'retry_pending',retryAt:Date.now()+1000});
        });
        pendingCount++; retryAt = Math.min(retryAt, Math.max(Date.now()+1000, smsPacer.cooldownUntil)); return;
      }
      // Persist the provider result before the optional UI log. If this write
      // fails, the durable 'sending' state blocks an unsafe automatic resend.
      if (res.success) await markReminderLockSuccess(lockKey, tenantId, res);
      else {
        const nextRetry = await retainReminderFailure(lockKey, tenantId, res, options.scheduled ? (claim!.attempts || 0) + 1 : 0);
        if (nextRetry) { pendingCount++; retryAt = Math.min(retryAt,nextRetry); }
        else attention = true;
      }

      const logEntry: SmsLogEntry = {
        id: `sms_${tenantId}_${Date.now()}_${firstAppt.id}`,
        recipientName: firstAppt.customer_name,
        recipientPhone: firstAppt.customer_phone,
        messageText,
        channel: 'sms',
        status: res.data?.status || (res.uncertain ? 'unknown' : 'failed'),
        provider: res.data?.provider, providerMessageId: res.data?.id, providerStatus: res.data?.providerStatus, reminderLockKey: lockKey,
        reminderType: isMorning ? 'morning_today' : 'evening_1day',
        appointmentDate: targetDate,
        startTime: firstAppt.start_time,
        sentAt: new Date().toISOString(),
        errorMessage: res.error || res.data?.errorMessage || undefined,
      };
      await recordLogEntry(logEntry, tenantId);

      if (res.success) {
        if (res.data?.status === 'failed') attention = true;
        successCount += 1;
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: true });
      } else {
        failedCount += 1;
        results.push({ customer: firstAppt.customer_name, phone: firstAppt.customer_phone, success: false, error: res.error });
      }
    });

    console.log(`[SMS Scheduler] סיכום ריצה: ${successCount} התקבלו אצל הספק (לא אישור מסירה) | ${failedCount} בקשות נכשלו`);
    return {
      success: failedCount === 0 && !attention,
      count: appointments.length,
      sentCount: successCount,
      failedCount,
      pending: pendingCount > 0,
      retryAt: Number.isFinite(retryAt) ? retryAt : undefined,
      attention,
      results,
      message: `התקבלו אצל ספק ה־SMS ${successCount} תזכורות; טרם אומתה מסירה`,
    };
  } catch (error: any) {
    const quotaExceeded = noteFirestoreQuota(error, `SMS reminder ${tenantId}/${reminderType}/${targetDate}`);
    console.error(`[SMS Scheduler] ❌ שגיאה כללית:`, error);
    return { success: false, quotaExceeded, retryable: isRetryableFirestoreError(error), error: error?.message };
  }
}

// ----------------------------------------------------------------------
// Durable per-tenant schedules; idle ticks query only due records.
const SMS_SCHEDULER_INTERVAL_MS = clampMs(process.env.SMS_SCHEDULER_INTERVAL_MS, 60_000, 60_000, 30 * 60_000);
let isDispatchingDueReminders = false;
let smsEngineInitialized = false;
const reminderScheduler = new DurableReminderScheduler(db, getTenantSmsSettings,
  (date,type,tenantId,settings,deadline,guard) => sendRemindersForDate(date,type,tenantId,settings,{scheduled:true,deadline,guard}));

const deliveryTracker = new DeliveryTracker(db,getSmsProvider);
async function checkPendingSmsDeliveries() {
  if(Date.now()<firestoreQuotaBackoffUntil) return {checked:0,skipped:true};
  try {
    const result=await deliveryTracker.run();
    if(result.checked) console.log(`[SMS Delivery] checked=${result.checked}; lookupErrors=${result.failures || 0}; no SMS sent by delivery checks`);
    return result;
  } catch(error:any) {
    noteFirestoreQuota(error,'SMS delivery checks');
    console.error('[SMS Delivery]',error?.message || 'Delivery worker failed');
    return {checked:0,error:'Delivery checks paused; send locks preserved'};
  }
}

async function checkAndDispatchDueReminders(): Promise<any> {
  if (process.env.SMS_SENDING_ENABLED === 'false') return {success:true,skipped:true,reason:'sending_disabled'};
  if (isDispatchingDueReminders) return {success:true,skipped:true,reason:'dispatch_in_progress'};
  if (Date.now() < firestoreQuotaBackoffUntil) return {success:false,skipped:true,reason:'firestore_quota_backoff',retryAfter:new Date(firestoreQuotaBackoffUntil).toISOString()};
  isDispatchingDueReminders = true;
  try {
    const result = await reminderScheduler.run({limit:20,budgetMs:45_000});
    if (result.results.some(x=>x.quotaExceeded)) noteFirestoreQuota({code:8,message:'Firestore quota exceeded'},'SMS scheduler');
    return result;
  } catch (err:any) {
    const quotaExceeded = noteFirestoreQuota(err,'SMS scheduler');
    console.error('[SMS Scheduler]',err?.message || err);
    return {success:false,quotaExceeded,error:err?.message,checkedAt:new Date().toISOString()};
  } finally { isDispatchingDueReminders = false; }
}

async function initSmsEngine() {
  if (smsEngineInitialized) return;
  smsEngineInitialized = true;
  let followUp: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    const result = await checkAndDispatchDueReminders();
    await checkPendingSmsDeliveries();
    if (result.pending && !followUp) {
      followUp = setTimeout(()=>{followUp=undefined;void tick();},1000);
      followUp.unref?.();
    }
  };
  console.log(`[SMS Engine] durable scheduler active; interval=${SMS_SCHEDULER_INTERVAL_MS}ms`);
  const initial = setTimeout(()=>void tick(),15_000); initial.unref?.();
  const interval = setInterval(()=>void tick(),SMS_SCHEDULER_INTERVAL_MS); interval.unref?.();
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

// Operational status without phone numbers, message bodies, or credentials.
app.get('/api/super-admin/sms-scheduler', requireSuperAdmin, async (_req,res,next)=>{
  try {
    const [control,attention,deliveryAttention]=await Promise.all([
      db.doc('sms_scheduler_control/discovery').get(),
      db.collection(SCHEDULE_COLLECTION).where('attention','==',true).limit(50).get(),
      db.collection(DELIVERY_JOBS).where('attention','==',true).limit(50).get()
    ]);
    res.json({success:true,discovery:control.data() || null,deliveryAttention:deliveryAttention.docs.map(d=>{const j=d.data();return {tenantId:j.tenantId,provider:j.provider,status:j.delivery?.status,reason:j.attentionReason,lastCheckedAt:j.lastCheckedAt};}),attention:attention.docs.map(d=>{
      const s=d.data();return {tenantId:s.tenantId,type:s.type,nextRunAt:s.nextRunAt,lastRun:s.lastRun,lastAttention:s.lastAttention || null};
    })});
  }catch(err){next(err);}
});

// Secure machine-to-machine heartbeat for cron-job.org. One Cron serves ALL tenants.
app.all('/api/cron/heartbeat', requireCronSecret, async (_req: Request, res: Response) => {
  try {
    const result = await checkAndDispatchDueReminders();
    const delivery=await checkPendingSmsDeliveries();
    return res.status(200).json({ success: result?.success !== false, cron: true, scheduler: result, delivery, checkedAt: new Date().toISOString() });
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
    if(Object.keys(provider).length && (req as any).adminPayload.role!=='super_admin') return res.status(403).json({success:false,error:'Only Super Admin may configure SMS credentials'});
    await db.runTransaction(async tx=>{
      const tenant=await tx.get(getTenantDoc(tenantId));
      const refs=(['today','1day'] as const).map(type=>doc(db,SCHEDULE_COLLECTION,scheduleId(tenantId,type)));
      const snapshots=await Promise.all(refs.map(ref=>tx.get(ref)));
      tx.set(getTenantSettingsDoc(tenantId,'sms_reminders'),settings);
      if(Object.keys(provider).length) tx.set(doc(db,'tenants',tenantId,'private_settings','sms_provider'),provider,{merge:true});
      refs.forEach((ref,index)=>{
        const patch=schedulePatch(tenantId,index===0?'today':'1day',settings,['active','trial'].includes(tenant.data()?.status),snapshots[index].data(),Date.now());
        if(patch) tx.set(ref,patch,{merge:true});
      });
    });
    smsProviderCache.delete(tenantId);
    res.json({success:true,settings});
  }catch(err){next(err);}
});

// 3. Batch Send Trigger (Today or Tomorrow)
app.post(['/api/sms/send-batch', '/api/whatsapp/trigger-morning', '/api/whatsapp/test-today-morning'], requireAdmin, async (req: Request, res: Response) => {
  if (process.env.SMS_SENDING_ENABLED === 'false') return res.status(503).json({success:false,error:'שליחת SMS מושבתת זמנית לצורך תחזוקה'});
  const reqType = req.body?.type || (req.path.includes('morning') || req.path.includes('today') ? 'today' : '1day');
  const { dateIso, tomorrowIso } = getIsraelTime();
  const targetDate = reqType === 'today' ? dateIso : tomorrowIso;

  if(!['today','1day'].includes(reqType)) return res.status(400).json({success:false,error:'Invalid reminder type'});
  try {return res.json(await sendRemindersForDate(targetDate, reqType, req.tenantId!));}catch(err:any){return res.status(500).json({success:false,error:'Reminder dispatch failed'});}
});

app.post(['/api/whatsapp/trigger-evening', '/api/whatsapp/test-1day-evening'], requireAdmin, async (req: Request, res: Response) => {
  if (process.env.SMS_SENDING_ENABLED === 'false') return res.status(503).json({success:false,error:'שליחת SMS מושבתת זמנית לצורך תחזוקה'});
  const { tomorrowIso } = getIsraelTime();
  try {return res.json(await sendRemindersForDate(tomorrowIso,'1day',req.tenantId!));}catch(err:any){return res.status(500).json({success:false,error:'Reminder dispatch failed'});}
});

// 4. Send Single SMS
app.post(['/api/sms/send-single', '/api/whatsapp/send'], requireAdmin, async (req: Request, res: Response) => {
  if (process.env.SMS_SENDING_ENABLED === 'false') return res.status(503).json({success:false,error:'שליחת SMS מושבתת זמנית לצורך תחזוקה'});
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
    const manualOperation = !type || ['manual','manual_single','test'].includes(type);
    if (manualOperation && req.body.requestId !== undefined && !validId(req.body.requestId)) return res.status(400).json({success:false,error:'מזהה שליחה לא תקין'});
    let lockKey = manualSmsLockKey(phone,message,getIsraelDateString(),manualOperation ? req.body.requestId : undefined);
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
    const resSend = await sendSmsViaProvider(phone, message, tenantId);
    if(resSend.success) await markReminderLockSuccess(lockKey,tenantId,resSend);
    else await retainReminderFailure(lockKey,tenantId,resSend);

    const logEntry: SmsLogEntry = {
      id: randomUUID(),
      recipientName: customerName || 'לקוח/ה',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.data?.status || (resSend.uncertain ? 'unknown' : 'failed'),
      provider: resSend.data?.provider, providerMessageId: resSend.data?.id, providerStatus: resSend.data?.providerStatus, reminderLockKey: lockKey,
      reminderType: reminderType || 'manual_single',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || resSend.data?.errorMessage || null,
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
  if (process.env.SMS_SENDING_ENABLED === 'false') return res.status(503).json({success:false,error:'שליחת SMS מושבתת זמנית לצורך תחזוקה'});
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
    const manualOperation = !type || ['manual','manual_single','test'].includes(type);
    if (manualOperation && req.body.requestId !== undefined && !validId(req.body.requestId)) return res.status(400).json({success:false,error:'מזהה שליחה לא תקין'});
    let lockKey = manualSmsLockKey(phone,message,getIsraelDateString(),manualOperation ? req.body.requestId : undefined);
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
    const resSend = await sendSmsViaProvider(phone, message, tenantId);
    if(resSend.success) await markReminderLockSuccess(lockKey,tenantId,resSend);
    else await retainReminderFailure(lockKey,tenantId,resSend);

    const logEntry: SmsLogEntry = {
      id: randomUUID(),
      recipientName: 'בדיקת מנהלת',
      recipientPhone: phone,
      messageText: message,
      channel: 'sms',
      status: resSend.data?.status || (resSend.uncertain ? 'unknown' : 'failed'),
      provider: resSend.data?.provider, providerMessageId: resSend.data?.id, providerStatus: resSend.data?.providerStatus, reminderLockKey: lockKey,
      reminderType: 'test',
      sentAt: new Date().toISOString(),
      errorMessage: resSend.error || resSend.data?.errorMessage || null,
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

// Manual checks share durable delivery state with the bounded background worker.
const deliveryChecksInFlight = new Set<string>();
app.post('/api/sms/logs/:logId/check-delivery', requireAdmin, async (req,res) => {
  const tenantId=req.tenantId!;
  const logId=String(req.params.logId);
  if (!validId(logId)) return res.status(400).json({success:false,error:'מזהה רישום לא תקין'});
  const requestKey=tenantId+':'+logId;
  if (deliveryChecksInFlight.has(requestKey)) return res.status(429).json({success:false,error:'בדיקה של הודעה זו כבר מתבצעת'});
  if (isDispatchRateLimited('delivery:'+(req as any).adminPayload.uid)) return res.status(429).json({success:false,error:'נא להמתין לפני בדיקה נוספת'});
  deliveryChecksInFlight.add(requestKey);
  try {
    const ref=doc(db,'tenants',tenantId,'sms_logs',logId);
    const snapshot=await getDoc(ref);
    if (!snapshot.exists) return res.status(404).json({success:false,error:'ההודעה לא נמצאה ביומן העסק'});
    const log=snapshot.data()!;
    if (log.deliveryCheckedAt && Date.now()-Date.parse(log.deliveryCheckedAt)<10_000) return res.json({success:true,log:{...log,id:logId},cached:true});
    let messageId=log.providerMessageId;
    let providerId=log.provider;
    const key=legacyLogLockKey(log);
    if (!messageId && key) {
      const lock=await getDoc(doc(db,'tenants',tenantId,'reminder_locks',key));
      messageId=lock.data()?.providerMessageId;
      providerId=lock.data()?.provider || providerId;
    }
    if (!messageId) return res.status(409).json({success:false,error:'לא נשמר מזהה ספק להודעה זו ולא ניתן לשחזרו. אין אישור מסירה; בדיקה זו לא שלחה הודעה חדשה'});
    providerId=providerId || 'telnyx'; // All pre-V41 messages were Telnyx.
    const provider=await getSmsProvider(tenantId,providerId);
    const delivery=await provider.lookup(messageId,log.recipientPhone);
    const update={...delivery,provider:providerId,providerMessageId:messageId,deliveryCheckedAt:new Date().toISOString()};
    const saved=key ? await deliveryTracker.recordResult(tenantId,key,messageId,providerId,delivery,logId) : await db.runTransaction(async tx=>{
      const latest=await tx.get(ref);
      if(!latest.exists) throw new Error('Log removed during check');
      const merged=mergeDeliveryResult(latest.data(),update);
      tx.update(ref,merged);return {...latest.data(),...merged,id:logId};
    });
    return res.json({success:true,log:saved});
  } catch (error) {
    const known=error instanceof SmsProviderError;
    return res.status(known?error.statusCode:500).json({success:false,error:known?error.message:'בדיקת המסירה לא הושלמה. הסטטוס הקודם נשמר; לא נשלחה הודעה חדשה'});
  } finally { deliveryChecksInFlight.delete(requestKey); }
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
    const assignedIcons = await Promise.all(baseTenants.map((tenant: any) => ensureTenantAdminIcon(tenant.id)));
    baseTenants.forEach((tenant: any, index: number) => { tenant.adminIcon = assignedIcons[index]; });

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
    const adminIcon=await ensureTenantAdminIcon(tenantId);
    const {ownerAuthUid,ownerAuthEmail,...tenant}=profile || {};
    res.json({success:true,tenantId,tenant:{...tenant,id:tenantId,adminIcon},config:{services:config.data()?.services || [],scheduleSettings:config.data()?.scheduleSettings || {businessOpen:'',businessClose:'',fridayOpen:'',fridayClose:'',durationMinutes:60}}});
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
    const previousAdminIcon = existing.data()?.adminIcon;
    const explicitlyNoIcon = profile.adminIcon === null;
    const requestedAdminIcon = isBusinessAdminIconId(profile.adminIcon) ? profile.adminIcon
      : (!explicitlyNoIcon && !create && isBusinessAdminIconId(previousAdminIcon) ? previousAdminIcon : '');
    const allocationStart = parseInt(hash(tenantId).slice(0, 8), 16) % BUSINESS_ADMIN_ICON_IDS.length;
    const candidates = explicitlyNoIcon ? [] : requestedAdminIcon
      ? [requestedAdminIcon]
      : [...BUSINESS_ADMIN_ICON_IDS.slice(allocationStart), ...BUSINESS_ADMIN_ICON_IDS.slice(0, allocationStart)];
    let selectedAdminIcon: string | null = explicitlyNoIcon ? null : '';
    for (const iconId of candidates) {
      const assignment = await tx.get(doc(db, 'tenantAdminIcons', iconId));
      if (assignment.exists && assignment.data()?.tenantId !== tenantId) {
        if (requestedAdminIcon) throw new Error('BUSINESS_ADMIN_ICON_TAKEN');
        continue;
      }
      selectedAdminIcon = iconId;
      break;
    }
    if (!explicitlyNoIcon && !selectedAdminIcon) throw new Error('BUSINESS_ADMIN_ICONS_EXHAUSTED');
    profile.adminIcon=selectedAdminIcon;
    const selectedIconRef = selectedAdminIcon ? doc(db, 'tenantAdminIcons', selectedAdminIcon) : null;
    const previousIconRef = isBusinessAdminIconId(previousAdminIcon) && previousAdminIcon !== selectedAdminIcon
      ? doc(db, 'tenantAdminIcons', previousAdminIcon) : null;
    const previousAssignment = previousIconRef ? await tx.get(previousIconRef) : null;
    const oldDomain=existing.data()?.customDomain;
    const mapping=domain?await tx.get(doc(db,'domains',domain)):null;
    const oldMapping=oldDomain && oldDomain!==domain?await tx.get(doc(db,'domains',oldDomain)):null;
    if(mapping?.exists && mapping.data()?.tenantId!==tenantId) throw new Error('Domain belongs to another tenant');
    const smsConfig=await tx.get(getTenantSettingsDoc(tenantId,'sms_reminders'));
    const scheduleRefs=(['today','1day'] as const).map(type=>doc(db,SCHEDULE_COLLECTION,scheduleId(tenantId,type)));
    const scheduleSnapshots=await Promise.all(scheduleRefs.map(r=>tx.get(r)));
    const smsSettings={...DEFAULT_SMS_SETTINGS,...publicSettings(smsConfig.data() || {}),...(smsConfig.exists?{}:{enabled:false,autoSendEnabled:false})};
    scheduleRefs.forEach((r,index)=>{
      const patch=schedulePatch(tenantId,index===0?'today':'1day',smsSettings,['active','trial'].includes(profile.status || existing.data()?.status),scheduleSnapshots[index].data(),Date.now());
      if(patch) tx.set(r,patch,{merge:true});
    });
    tx.set(ref,{...profile,adminIcon:selectedAdminIcon,customDomain:domain},{merge:!create});
    if(selectedIconRef) tx.set(selectedIconRef,{tenantId,updatedAt:new Date().toISOString()},{merge:true});
    if(previousIconRef && previousAssignment?.data()?.tenantId===tenantId) tx.delete(previousIconRef);
    tx.set(getTenantSettingsDoc(tenantId),config,{merge:!create});
    if(domain) tx.set(doc(db,'domains',domain),{tenantId,hostname:domain});
    if(oldMapping?.data()?.tenantId===tenantId) tx.delete(oldMapping.ref);
  });
  invalidateTenantCaches(tenantId);
  domainTenantCache.clear();
}

async function ensureTenantAdminIcon(tenantId:string):Promise<string> {
  const cached=tenantAdminIconCache.get(tenantId);
  if(cached && cached.expiresAt>Date.now()) return cached.iconId;
  const start = parseInt(hash(tenantId).slice(0, 8), 16) % BUSINESS_ADMIN_ICON_IDS.length;
  const iconId=await db.runTransaction(async tx => {
    const tenantRef = getTenantDoc(tenantId);
    const tenantSnap = await tx.get(tenantRef);
    if (!tenantSnap.exists || tenantSnap.data()?.status === 'deleted') throw new Error('Tenant not found');
    const currentIcon = tenantSnap.data()?.adminIcon;
    if (currentIcon === null) return '';
    if (isBusinessAdminIconId(currentIcon)) {
      const currentRef = doc(db, 'tenantAdminIcons', currentIcon);
      const currentAssignment = await tx.get(currentRef);
      if (!currentAssignment.exists || currentAssignment.data()?.tenantId === tenantId) {
        if (!currentAssignment.exists) tx.set(currentRef,{tenantId,updatedAt:new Date().toISOString()});
        return currentIcon;
      }
    }
    for (let offset = 0; offset < BUSINESS_ADMIN_ICON_IDS.length; offset++) {
      const iconId = BUSINESS_ADMIN_ICON_IDS[(start + offset) % BUSINESS_ADMIN_ICON_IDS.length];
      const assignmentRef = doc(db, 'tenantAdminIcons', iconId);
      const assignment = await tx.get(assignmentRef);
      if (assignment.exists && assignment.data()?.tenantId !== tenantId) continue;
      tx.set(tenantRef,{adminIcon:iconId,updatedAt:new Date().toISOString()},{merge:true});
      tx.set(assignmentRef,{tenantId,updatedAt:new Date().toISOString()},{merge:true});
      return iconId;
    }
    throw new Error('BUSINESS_ADMIN_ICONS_EXHAUSTED');
  });
  tenantAdminIconCache.set(tenantId,{iconId,expiresAt:Date.now()+5*60_000});
  return iconId;
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
      adminIcon: requestedAdminIcon,
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
      adminIcon: req.body?.adminIcon === null ? null : isBusinessAdminIconId(requestedAdminIcon) ? requestedAdminIcon : '',
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

    const publicBase = tenantProfile.customDomain ? 'https://' + tenantProfile.customDomain : '';
    const testUrl = publicBase ? publicBase + '/' : `/?tenant=${tenantId}`;
    const adminUrl = publicBase ? publicBase + '/admin' : `/admin?tenant=${tenantId}`;

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
    return res.status(err?.message === 'BUSINESS_ADMIN_ICON_TAKEN' ? 409 : 500).json({ success: false, error: err?.message === 'BUSINESS_ADMIN_ICON_TAKEN' ? 'האייקון כבר הוקצה לעסק אחר. יש לבחור אייקון אחר.' : err?.message === 'BUSINESS_ADMIN_ICONS_EXHAUSTED' ? 'כל שילובי האייקונים בשימוש. יש להוסיף אפשרויות נוספות.' : err?.message });
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
    const adminIcon = await ensureTenantAdminIcon(tenantId);
    return res.json({
      success: true,
      tenant: { id: tenantSnap.id, ...tenantSnap.data(), adminIcon },
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
      adminIcon: req.body?.adminIcon === null ? null : isBusinessAdminIconId(req.body?.adminIcon) ? req.body.adminIcon : '',
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
      testUrl: customDomain ? 'https://' + customDomain + '/' : `/?tenant=${tenantId}`,
      adminUrl: customDomain ? 'https://' + customDomain + '/admin' : `/admin?tenant=${tenantId}` });
  } catch (err: any) {
    console.error('[Super Admin API] Error updating tenant:', err);
    return res.status(err?.message === 'BUSINESS_ADMIN_ICON_TAKEN' ? 409 : 500).json({ success: false, error: err?.message === 'BUSINESS_ADMIN_ICON_TAKEN' ? 'האייקון כבר הוקצה לעסק אחר. יש לבחור אייקון אחר.' : err?.message === 'BUSINESS_ADMIN_ICONS_EXHAUSTED' ? 'כל שילובי האייקונים בשימוש. יש להוסיף אפשרויות נוספות.' : err?.message });
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
    const iconId=tenant.data()?.adminIcon;
    await db.runTransaction(async tx=>{
      const tenantRef=getTenantDoc(tenantId);
      const current=await tx.get(tenantRef);
      const iconRef=isBusinessAdminIconId(iconId)?doc(db,'tenantAdminIcons',iconId):null;
      const assignment=iconRef?await tx.get(iconRef):null;
      const refs=(['today','1day'] as const).map(type=>doc(db,SCHEDULE_COLLECTION,scheduleId(tenantId,type)));
      const schedules=await Promise.all(refs.map(r=>tx.get(r)));
      refs.forEach((r,index)=>{
        const patch=schedulePatch(tenantId,index===0?'today':'1day',schedules[index].data()?.settings || {},false,schedules[index].data(),Date.now());
        if(patch) tx.set(r,patch,{merge:true});
      });
      tx.update(tenantRef,{status:'deleted',deletedAt:new Date().toISOString()});
      if(iconRef && assignment?.data()?.tenantId===tenantId) tx.delete(iconRef);
    });
    if(tenant.data()?.ownerAuthUid) {
      await getAuth().updateUser(tenant.data()!.ownerAuthUid,{disabled:true});
      await getAuth().revokeRefreshTokens(tenant.data()!.ownerAuthUid);
    }
    const mappings=await collection(db,'domains').where('tenantId','==',tenantId).get();
    for(const mapping of mappings.docs) await mapping.ref.delete();
    invalidateTenantCaches(tenantId);
    domainTenantCache.clear();
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

// Backward-compatible registration endpoint for older cached clients.
// It uses the exact same tenant-scoped persistence and validation as the current route.
app.post('/api/register-webhook', registerCustomer);

// ----------------------------------------------------
// Vite & Static Asset Handling
// ----------------------------------------------------
app.get('/api/health',(_req,res)=>res.json({success:true,service:'alex-multi-tenant',version:APP_VERSION}));
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
    console.log(`Alex Beauty Server v${APP_VERSION} running on http://0.0.0.0:${PORT} [Israel Time: ${getIsraelTime().timeStr}]`);
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
export { app, ensurePrimaryTenant, sendRemindersForDate, checkAndDispatchDueReminders, checkPendingSmsDeliveries, db };

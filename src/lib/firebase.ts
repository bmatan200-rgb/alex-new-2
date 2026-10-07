import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  memoryLocalCache,
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  Firestore,
  runTransaction,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth';
import { Appointment, Service, AdminUser, ScheduleSettings, Customer } from '../types';
import { getStoredUserSession, getStoredAdminSession } from '../utils/storage';
import { deduplicateAppointments } from '../utils/dateUtils';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export { signInWithEmailAndPassword, signOut, onAuthStateChanged };
export type { FirebaseUser };

// Initialize Firestore with clean memory cache and ignoreUndefinedProperties to prevent crashes
let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: memoryLocalCache(),
      ignoreUndefinedProperties: true,
    },
    firebaseConfig.firestoreDatabaseId || undefined
  );
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
}
export const db: Firestore = firestoreInstance;

// Helper functions for Multi-Tenant paths
export function getTenantAppointmentsCol(tenantId = 'alex_beauty') {
  return collection(db, 'tenants', tenantId, 'appointments');
}

export function getTenantAppointmentDocRef(tenantId = 'alex_beauty', docId: string) {
  return doc(db, 'tenants', tenantId, 'appointments', docId);
}

export function getTenantSettingsDocRef(tenantId = 'alex_beauty', docId = 'config') {
  return doc(db, 'tenants', tenantId, 'settings', docId);
}

/**
 * Real-time listener for appointments (Multi-Tenant aware)
 */
export type TenantApiAuthMode = 'auto' | 'required' | 'none';

export async function tenantApi(
  path: string,
  body?: any,
  tenantId = getCurrentTenantId(),
  options: { auth?: TenantApiAuthMode } = {}
) {
  const authMode = options.auth ?? 'auto';
  let token = '';
  if (authMode !== 'none') {
    await auth.authStateReady();
    token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (authMode === 'required' && !token) throw new Error('נדרשת התחברות מנהל');
  }
  const res=await fetch(path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','x-tenant-id':tenantId,...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify({...body,tenantId})})});
  const data=await res.json();
  if(!res.ok || !data.success) throw new Error(data.error || 'הפעולה נכשלה');
  return data;
}
function capabilities(tenantId:string):Record<string,string> {
  try {return JSON.parse(localStorage.getItem('booking_access__'+tenantId)||'{}');}catch{return {};}
}
export function subscribeAppointments(onUpdate:(appointments:Appointment[])=>void,onError?:(error:Error)=>void,tenantId=getCurrentTenantId()):()=>void {
  let active=true, running=false;
  const poll=async()=>{
    if(running || (typeof document!=='undefined' && document.visibilityState==='hidden')) return;
    running=true;
    try {const data=await tenantApi('/api/appointments/list',{capabilities:capabilities(tenantId)},tenantId);if(active) onUpdate(data.appointments);}
    catch(err){if(active){onError?.(err as Error);}} finally {running=false;}
  };
  void poll();
  // v17 polled every 10s and could exhaust Firestore's daily free read quota in a
  // few hours. v18 refreshes every 2 minutes while visible, plus immediately when
  // the tab regains focus/auth changes. Booking/cancel flows already update local
  // state instantly and server transactions still reject stale slot conflicts.
  const timer=setInterval(()=>{void poll();},120000);
  const onFocus=()=>{void poll();};
  const onVisibility=()=>{if(document.visibilityState==='visible') void poll();};
  if(typeof window!=='undefined') window.addEventListener('focus',onFocus);
  if(typeof document!=='undefined') document.addEventListener('visibilitychange',onVisibility);
  const unsub=onAuthStateChanged(auth,()=>{void poll();});
  return ()=>{
    active=false;clearInterval(timer);unsub();
    if(typeof window!=='undefined') window.removeEventListener('focus',onFocus);
    if(typeof document!=='undefined') document.removeEventListener('visibilitychange',onVisibility);
  };
}

/**
 * Save new appointment to Firestore (Multi-Tenant aware)
 */
export class SlotTakenError extends Error {
  constructor() {
    super('השעה הזו כבר נתפסה, נא לבחור שעה אחרת');
    this.name = 'SlotTakenError';
  }
}

export function slotDocId(date: string, startTime: string): string {
  return `appt_${date}_${startTime.replace(':', '')}`;
}

export async function addAppointmentToFirestore(
  appointment:Omit<Appointment,'id'>|Appointment,
  tenantId=getCurrentTenantId(),
  options:{asAdmin?:boolean}={}
):Promise<string> {
  try {
    const data=await tenantApi('/api/appointments/book',{appointment,requestId:crypto.randomUUID()},tenantId,{auth:options.asAdmin?'required':'none'});
    if(!options.asAdmin) {
      localStorage.setItem('booking_access__'+tenantId,JSON.stringify({...capabilities(tenantId),[data.id]:data.accessToken}));
    }
    return data.id;
  }catch(err:any){if(err.message.includes('השעה הזו כבר נתפסה')) throw new SlotTakenError();throw err;}
}
export async function cancelAppointmentInFirestore(appointmentId:string|number,_phone?:string,_date?:string,_time?:string,tenantId=getCurrentTenantId(),authMode:TenantApiAuthMode='auto'):Promise<void> {
  await tenantApi('/api/appointments/cancel',{appointmentId:String(appointmentId),accessToken:capabilities(tenantId)[String(appointmentId)]},tenantId,{auth:authMode});
}
export async function deleteAppointmentInFirestore(appointmentId:string|number,_date?:string,_time?:string,tenantId=getCurrentTenantId()):Promise<void> {
  await tenantApi('/api/admin/appointments/delete',{appointmentId:String(appointmentId)},tenantId);
}

/**
 * Real-time listener for services configuration (Multi-Tenant aware)
 */
export function subscribeServices(
  onUpdate: (services: Service[]) => void,
  tenantId = 'alex_beauty'
): () => void {
  try {
    const tenantConfigRef = getTenantSettingsDocRef(tenantId, 'config');
    const unsubscribe = onSnapshot(tenantConfigRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (Array.isArray(data.services)) {
          onUpdate(data.services);
          return;
        }
      }
    });
    return unsubscribe;
  } catch (err) {
    console.warn('Failed to set up services Firestore listener:', err);
    return () => {};
  }
}

/**
 * Save services configuration to Firestore (Multi-Tenant aware)
 */
export async function saveServicesToFirestore(services:Service[],tenantId=getCurrentTenantId()):Promise<void> {
  await tenantApi('/api/admin/settings/services',{services},tenantId);
}

/**
 * Real-time listener for salon schedule / working hours settings (Multi-Tenant aware)
 */
export function subscribeScheduleSettings(
  onUpdate: (settings: import('../types').ScheduleSettings) => void,
  tenantId = 'alex_beauty'
): () => void {
  try {
    const tenantConfigRef = getTenantSettingsDocRef(tenantId, 'config');
    const unsubscribe = onSnapshot(tenantConfigRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const schedule = data.scheduleSettings || data;
        if (schedule && typeof schedule.businessOpen === "string" && typeof schedule.businessClose === "string") {
          onUpdate({
            businessOpen: schedule.businessOpen,
            businessClose: schedule.businessClose,
            fridayOpen: schedule.fridayOpen ?? '',
            fridayClose: schedule.fridayClose ?? '',
            durationMinutes: Number(schedule.durationMinutes) || 90,
          });
          return;
        }
      }
    });
    return unsubscribe;
  } catch (err) {
    console.warn('Failed to set up schedule Firestore listener:', err);
    return () => {};
  }
}

/**
 * Save salon schedule / working hours settings to Firestore (Multi-Tenant aware)
 */
export async function saveScheduleSettingsToFirestore(schedule:ScheduleSettings|Record<string,any>,tenantId=getCurrentTenantId()):Promise<void> {
  await tenantApi('/api/admin/settings/schedule',{schedule},tenantId);
}

const ADMIN_USERS_COLLECTION = 'admin_users';

export const DEFAULT_ADMIN_ACCOUNTS: AdminUser[] = [];

/**
 * Fetch list of registered admin accounts securely from server (Safe metadata without passwords)
 */
export async function ensureDefaultAdminsInFirestore(): Promise<AdminUser[]> {
  try {
    const res = await fetch('/api/admin/users');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.admins) && data.admins.length > 0) {
        return data.admins;
      }
    }
    return DEFAULT_ADMIN_ACCOUNTS;
  } catch (err) {
    console.warn('Notice loading admin users:', err);
    return DEFAULT_ADMIN_ACCOUNTS;
  }
}

/**
 * Subscribe to Admin Users updates
 */
export function subscribeAdminUsers(onUpdate: (admins: AdminUser[]) => void): () => void {
  let active = true;

  const load = async () => {
    try {
      const admins = await ensureDefaultAdminsInFirestore();
      if (active) onUpdate(admins);
    } catch {
      if (active) onUpdate(DEFAULT_ADMIN_ACCOUNTS);
    }
  };

  load();
  const interval = setInterval(load, 30000); // 30s poll

  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Save or update Admin User credentials securely via server-side salted cryptographic hashing
 */
export async function saveAdminUserToFirestore(
  _admin: AdminUser
): Promise<{ success: boolean; id: string; error?: string; token?: string }> {
  return {
    success: false,
    id: '',
    error: 'יצירת חשבונות מנהלים מתבצעת בקונסולת Firebase: Authentication ← Users ← Add user',
  };
}

/**
 * אימות מנהלת מול Firebase Authentication.
 * הסיסמה נשלחת ישירות ל-Firebase ואינה נשמרת אצלנו בשום שלב.
 */
export async function verifyAdminLoginInFirestore(credentials: {
  usernameOrEmailOrPhone: string;
  password: string;
  phone?: string;
  email?: string;
  username?: string;
}): Promise<{
  success: boolean;
  adminUser?: AdminUser;
  error?: string;
  token?: string;
}> {
  const email = (credentials.email || credentials.usernameOrEmailOrPhone || '').trim().toLowerCase();
  const password = credentials.password || '';

  if (!email || !email.includes('@')) {
    return { success: false, error: 'יש להזין כתובת אימייל תקינה' };
  }
  if (!password) {
    return { success: false, error: 'יש להזין סיסמה' };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken();
    try { await tenantApi('/api/auth/me'); } catch(err) {await signOut(auth);throw err;}

    return {
      success: true,
      token: idToken,
      adminUser: {
        id: cred.user.uid,
        username: credentials.username || cred.user.displayName || email,
        phone: credentials.phone || '',
        email: cred.user.email || email,
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    const code = err?.code || '';

    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return { success: false, error: 'אימייל או סיסמה שגויים' };
    }
    if (code === 'auth/too-many-requests') {
      return { success: false, error: 'יותר מדי נסיונות התחברות. נסי שוב בעוד מספר דקות' };
    }
    if (code === 'auth/operation-not-allowed') {
      return { success: false, error: 'שיטת ההתחברות Email/Password אינה מופעלת בקונסולת Firebase' };
    }
    if (code === 'auth/invalid-email') {
      return { success: false, error: 'כתובת האימייל אינה תקינה' };
    }

    return { success: false, error: err?.message || 'שגיאה בהתחברות' };
  }
}

// ----------------------------------------------------
// Customer Directory & Persistence Functions
// ----------------------------------------------------
export function getCurrentTenantId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('tenant')?.trim();
    if (q) return q;
    return localStorage.getItem('active_tenant_id_v1')?.trim() || 'alex_beauty';
  } catch { return 'alex_beauty'; }
}

export function getTenantCustomersCol(tenantId = getCurrentTenantId()) {
  return collection(db, 'tenants', tenantId, 'customers');
}
export function getTenantCustomerDocRef(tenantId: string, customerId: string) {
  return doc(db, 'tenants', tenantId, 'customers', customerId);
}

/**
 * שמירה או עדכון של לקוח ב-Firestore ובשרת.
 * מתבצע בעת הרשמה/כניסת לקוח או קביעת תור חדש.
 */
export async function upsertCustomerToFirestore(data:{full_name:string;phone:string;notes?:string},tenantId=getCurrentTenantId()):Promise<void> {
  // Anonymous registration is a local customer profile, not verified identity.
  // Server derives the customer directory from successful bookings.
  if(!auth.currentUser) return;
  await tenantApi('/api/customers/upsert',data,tenantId);
}

/**
 * משיכת רשימת לקוחות מלאה למנהלת בלבד דרך ה-API המאובטח
 */
export async function fetchAdminCustomers(sessionToken?: string, tenantId = getCurrentTenantId()): Promise<Customer[]> {
  try {
    const session = getStoredAdminSession() || getStoredUserSession();
    let token = '';
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken();
    } else if (sessionToken) {
      token = sessionToken;
    } else if (session?.isAdmin) {
      token = localStorage.getItem('alex_admin_session_token') || '';
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`/api/admin/customers?tenant=${encodeURIComponent(tenantId)}`, {
      method: 'GET',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.customers)) {
        return data.customers;
      }
    }
  } catch (err) {
    console.warn('[Admin Customers] Fetch error:', err);
  }

  // גיבוי ישיר מ-Firestore במידה והמנהלת מחוברת ב-Firebase Auth
  try {
    if (auth.currentUser) {
      const snap = await getDocs(getTenantCustomersCol(tenantId));
      const list: Customer[] = [];
      snap.forEach((d) => {
        const item = d.data();
        list.push({
          id: d.id,
          full_name: item.full_name || 'לקוח/ה',
          phone: item.phone || '',
          created_at: item.created_at || new Date().toISOString(),
          last_login_at: item.last_login_at || item.created_at || new Date().toISOString(),
          notes: item.notes || '',
        });
      });
      return list;
    }
  } catch (directSnapErr) {
    console.warn('[Admin Customers] Direct Firestore query error:', directSnapErr);
  }

  return [];
}

/**
 * האזנה בזמן אמת לאוסף הלקוחות ב-Firestore (למנהלת בלבד)
 */
export function subscribeCustomers(
  onUpdate: (customers: Customer[]) => void,
  onError?: (error: Error) => void,
  tenantId = getCurrentTenantId()
): () => void {
  try {
    const q = query(getTenantCustomersCol(tenantId), orderBy('last_login_at', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const customers: Customer[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          customers.push({
            id: docSnap.id,
            full_name: data.full_name || 'לקוח/ה',
            phone: data.phone || '',
            created_at: data.created_at || new Date().toISOString(),
            last_login_at: data.last_login_at || data.created_at || new Date().toISOString(),
            notes: data.notes || '',
          });
        });
        onUpdate(customers);
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  } catch (err: any) {
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * מחיקת לקוח מרשימת הלקוחות (למנהלת בלבד)
 */
export async function deleteCustomer(customerId: string, tenantId = getCurrentTenantId()): Promise<boolean> {
  const session = getStoredAdminSession() || getStoredUserSession();
  let token = '';
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken();
  } else if (session?.isAdmin) {
    token = localStorage.getItem('alex_admin_session_token') || '';
  }

  try {
    await deleteDoc(getTenantCustomerDocRef(tenantId, customerId));
  } catch {
    // Non-blocking, will try server
  }

  try {
    const res = await fetch(`/api/admin/customers/${customerId}?tenant=${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}


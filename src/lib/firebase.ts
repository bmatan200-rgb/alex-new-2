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
export function subscribeAppointments(
  onUpdate: (appointments: Appointment[]) => void,
  onError?: (error: Error) => void,
  tenantId = 'alex_beauty'
): () => void {
  try {
    const tenantCol = getTenantAppointmentsCol(tenantId);
    const q = query(tenantCol, orderBy('appointment_date', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const seenIds = new Set<string>();
        const list: Appointment[] = [];
        for (const docSnap of snapshot.docs) {
          const id = docSnap.id;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          const data = docSnap.data();
          if (data.status === 'cancelled') continue;
          list.push({
            id,
            customer_name: data.customer_name || '',
            customer_phone: data.customer_phone || '',
            service_id: data.service_id || 1,
            service_name: data.service_name || "לק ג'ל",
            price: data.price || 150,
            appointment_date: data.appointment_date,
            start_time: data.start_time,
            end_time: data.end_time,
            status: data.status || 'confirmed',
            notes: data.notes || '',
            created_at: data.created_at || new Date().toISOString(),
          });
        }
        onUpdate(deduplicateAppointments(list));
      },
      (err) => {
        console.warn(`Firestore subscription error for tenant ${tenantId}:`, err);
        if (onError) onError(err);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error('Failed to set up Firestore listener:', err);
    if (onError && err instanceof Error) onError(err);
    return () => {};
  }
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
  appointment: Omit<Appointment, 'id'> | Appointment,
  tenantId = 'alex_beauty'
): Promise<string> {
  const isNew = !('id' in appointment) || !appointment.id;

  const docId = isNew
    ? slotDocId(appointment.appointment_date, appointment.start_time)
    : String((appointment as Appointment).id);

  const dataToSave = {
    customer_name: appointment.customer_name,
    customer_phone: appointment.customer_phone,
    service_id: appointment.service_id ?? 1,
    service_name: appointment.service_name || "לק ג'ל",
    price: appointment.price ?? 150,
    appointment_date: appointment.appointment_date,
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    status: appointment.status || 'confirmed',
    notes: appointment.notes || '',
    created_at: appointment.created_at || new Date().toISOString(),
    tenantId,
  };

  const docRef = getTenantAppointmentDocRef(tenantId, docId);
  await runTransaction(db, async (transaction) => {
    if (isNew) {
      const snap = await transaction.get(docRef);
      if (snap.exists() && snap.data().status !== 'cancelled') {
        const snapPhone = (snap.data().customer_phone || '').replace(/\D/g, '');
        const newPhone = (appointment.customer_phone || '').replace(/\D/g, '');
        if (snapPhone && newPhone && snapPhone !== newPhone) {
          throw new SlotTakenError();
        }
      }
    }
    transaction.set(docRef, dataToSave, { merge: true });
  });

  return docId;
}

/**
 * Cancel appointment in Firestore (Multi-Tenant aware)
 */
export async function cancelAppointmentInFirestore(
  appointmentId: string | number,
  customerPhone?: string,
  appointmentDate?: string,
  startTime?: string,
  tenantId = 'alex_beauty'
): Promise<void> {
  const idStr = String(appointmentId);
  const session = getStoredAdminSession() || getStoredUserSession();
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : (localStorage.getItem('alex_admin_session_token') || '');

  try {
    await fetch('/api/appointments/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        appointmentId: idStr,
        customerPhone,
        appointmentDate,
        startTime,
        tenantId,
      }),
    });
  } catch (err) {
    console.warn('Server cancel attempt warning, using Firestore direct fallback:', err);
  }

  // Delete from /tenants/{tenantId}/appointments/{idStr}
  try {
    await deleteDoc(getTenantAppointmentDocRef(tenantId, idStr));
  } catch {
    try {
      await setDoc(getTenantAppointmentDocRef(tenantId, idStr), { status: 'cancelled' }, { merge: true });
    } catch {}
  }

  if (appointmentDate && startTime) {
    const sDocId = slotDocId(appointmentDate, startTime);
    try {
      await deleteDoc(getTenantAppointmentDocRef(tenantId, sDocId));
    } catch {}
  }
}

/**
 * Permanently delete appointment in Firestore (Multi-Tenant aware)
 */
export async function deleteAppointmentInFirestore(
  appointmentId: string | number,
  appointmentDate?: string,
  startTime?: string,
  tenantId = 'alex_beauty'
): Promise<void> {
  const idStr = String(appointmentId);

  try {
    await deleteDoc(getTenantAppointmentDocRef(tenantId, idStr));
  } catch (err) {
    console.warn('Direct Firestore delete failed for idStr:', err);
  }


  if (appointmentDate && startTime) {
    const sDocId = slotDocId(appointmentDate, startTime);
    try {
      await deleteDoc(getTenantAppointmentDocRef(tenantId, sDocId));
    } catch {}
  }
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
        if (data.services && Array.isArray(data.services) && data.services.length > 0) {
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
export async function saveServicesToFirestore(
  services: Service[],
  tenantId = 'alex_beauty'
): Promise<void> {
  const session = getStoredAdminSession() || getStoredUserSession();
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : (localStorage.getItem('alex_admin_session_token') || '');

  try {
    await fetch('/api/admin/settings/services', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        services,
        tenantId,
      }),
    });
  } catch (err) {
    console.warn('Server save services warning:', err);
  }

  // Direct Firestore Write to /tenants/{tenantId}/settings/config
  try {
    await setDoc(getTenantSettingsDocRef(tenantId, 'config'), {
      services,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Error direct saving services to Firestore:', err);
  }
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
        if (schedule && schedule.businessOpen && schedule.businessClose) {
          onUpdate({
            businessOpen: schedule.businessOpen,
            businessClose: schedule.businessClose,
            fridayOpen: schedule.fridayOpen || '09:20',
            fridayClose: schedule.fridayClose || '15:00',
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
export async function saveScheduleSettingsToFirestore(
  schedule: ScheduleSettings | Record<string, any>,
  tenantId = 'alex_beauty'
): Promise<void> {
  const session = getStoredAdminSession() || getStoredUserSession();
  const token = auth.currentUser
    ? await auth.currentUser.getIdToken()
    : (localStorage.getItem('alex_admin_session_token') || '');

  try {
    await fetch('/api/admin/settings/schedule', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        schedule,
        tenantId,
      }),
    });
  } catch (err) {
    console.warn('Server save schedule warning:', err);
  }

  try {
    await setDoc(getTenantSettingsDocRef(tenantId, 'config'), {
      scheduleSettings: {
        businessOpen: schedule.businessOpen,
        businessClose: schedule.businessClose,
        fridayOpen: schedule.fridayOpen || '09:20',
        fridayClose: schedule.fridayClose || '15:00',
        durationMinutes: Number(schedule.durationMinutes) || 90,
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Error saving schedule to Firestore:', err);
  }
}

const ADMIN_USERS_COLLECTION = 'admin_users';

export const DEFAULT_ADMIN_ACCOUNTS: AdminUser[] = [
  {
    id: 'admin_alex',
    username: 'אלכסנדרה ביטון',
    phone: '054-6307114',
    email: 'alexbiton200@gmail.com', // <-- עדכון כאן
    role: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'admin_matan',
    username: 'מתן ביטון',
    phone: '054-3111408',
    email: 'bmatan200@gmail.com',
    role: 'admin',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

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
  const password = (credentials.password || '').trim();

  if (!email || !email.includes('@')) {
    return { success: false, error: 'יש להזין כתובת אימייל תקינה' };
  }
  if (!password) {
    return { success: false, error: 'יש להזין סיסמה' };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken();

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
export async function upsertCustomerToFirestore(data: {
  full_name: string;
  phone: string;
  notes?: string;
}, tenantId = getCurrentTenantId()): Promise<void> {
  const cleanPhone = (data.phone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 7) return;

  const docId = `cust_${cleanPhone}`;
  const nowIso = new Date().toISOString();
  const trimmedName = (data.full_name || '').trim();

  // 1. שמירה ישירה ל-Firestore
  try {
    const docRef = getTenantCustomerDocRef(tenantId, docId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const existing = snap.data();
      await updateDoc(docRef, {
        full_name: trimmedName || existing.full_name || 'לקוח/ה',
        last_login_at: nowIso,
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      });
    } else {
      await setDoc(docRef, {
        full_name: trimmedName || 'לקוח/ה',
        phone: data.phone.trim(),
        created_at: nowIso,
        last_login_at: nowIso,
        notes: data.notes || '',
      });
    }
  } catch (directErr) {
    // במידה ואין הרשאת כתיבה ישירה או שגיאת רשת, נבצע דרך השרת
    console.warn('[Customer Persistence] Firestore direct write error:', directErr);
  }

  // 2. שמירה בשרת לגיבוי מלא
  try {
    await fetch('/api/customers/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId,
        full_name: trimmedName,
        phone: data.phone.trim(),
        notes: data.notes,
      }),
    });
  } catch (apiErr) {
    console.warn('[Customer Persistence] Server API upsert error:', apiErr);
  }
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


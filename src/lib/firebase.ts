import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
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
import { Appointment, Service, AdminUser, ScheduleSettings } from '../types';
import { getStoredUserSession } from '../utils/storage';
import { deduplicateAppointments } from '../utils/dateUtils';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export { signInWithEmailAndPassword, signOut, onAuthStateChanged };
export type { FirebaseUser };

// Initialize Firestore with specific database ID if present
export const db: Firestore = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || undefined
);

const APPOINTMENTS_COLLECTION = 'appointments';

/**
 * מחזיר את ה-ID Token של המנהלת המחוברת כרגע.
 *
 * הטוקן נוצר ע"י Firebase עצמו, תקף לשעה ומתחדש אוטומטית.
 * הוא אינו כתוב בשום מקום בקוד ואינו ניתן לזיוף מהדפדפן.
 *
 * אין כאן ערך גיבוי בכוונה: אם אין משתמשת מחוברת, עדיף להיכשל
 * עם הודעה ברורה מאשר לשלוח טוקן חסר משמעות ולקבל שגיאה סתומה.
 */
async function getAdminIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('ההתחברות פגה. יש להתחבר מחדש כמנהלת.');
  }
  return await user.getIdToken();
}

/**
 * Real-time listener for all appointments
 */
export function subscribeAppointments(
  onUpdate: (appointments: Appointment[]) => void,
  onError?: (error: Error) => void
): () => void {
  try {
    const q = query(
      collection(db, APPOINTMENTS_COLLECTION),
      orderBy('appointment_date', 'asc')
    );

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
        // Deduplicate and sort chronologically
        const deduped = deduplicateAppointments(list);
        onUpdate(deduped);
      },
      (err) => {
        console.warn('Firestore subscription error, fallback might be used:', err);
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
 * Save new appointment to Firestore
 */
/** נזרקת כששתי לקוחות ניסו לתפוס את אותה שעה בו-זמנית */
export class SlotTakenError extends Error {
  constructor() {
    super('השעה הזו כבר נתפסה, בבקשה תבחרי שעה אחרת');
    this.name = 'SlotTakenError';
  }
}

/**
 * מזהה דטרמיניסטי לתור, נגזר מהתאריך והשעה.
 * שני תורים באותה משבצת מקבלים בהכרח את אותו מזהה מסמך,
 * ולכן Firestore עצמו מונע פיזית את קיומם של שניהם.
 */
export function slotDocId(date: string, startTime: string): string {
  return `appt_${date}_${startTime.replace(':', '')}`;
}

export async function addAppointmentToFirestore(
  appointment: Omit<Appointment, 'id'> | Appointment
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
  };

  const docRef = doc(db, APPOINTMENTS_COLLECTION, docId);

  await runTransaction(db, async (transaction) => {
    if (isNew) {
      const snap = await transaction.get(docRef);
      // תור מבוטל משחרר את השעה — אפשר להזמין עליה מחדש
      if (snap.exists() && snap.data().status !== 'cancelled') {
        const snapPhone = (snap.data().customer_phone || '').replace(/\D/g, '');
        const newPhone = (appointment.customer_phone || '').replace(/\D/g, '');
        // אם מדובר בלקוח אחר — השעה תפוסה
        if (snapPhone && newPhone && snapPhone !== newPhone) {
          throw new SlotTakenError();
        }
        // אם מדובר באותו לקוח שמשדרג/מעדכן את התור שלו או אישור חוזר — נאפשר עדכון
      }
    }
    transaction.set(docRef, dataToSave, { merge: true });
  });

  return docId;
}

/**
 * Cancel appointment in Firestore
 */
export async function cancelAppointmentInFirestore(
  appointmentId: string | number,
  customerPhone?: string,
  appointmentDate?: string,
  startTime?: string
): Promise<void> {
  const idStr = String(appointmentId);

  // ביטול תור פתוח גם ללקוחות, לא רק למנהלת — ולכן הטוקן אופציונלי.
  // כשאין מנהלת מחוברת, השרת מאמת שמספר הטלפון בבקשה תואם לתור.
  let token = '';
  try {
    token = await getAdminIdToken();
  } catch {
    // לקוחה רגילה — ממשיכים ללא טוקן
  }

  let serverSuccess = false;
  let serverErrorMsg = '';

  try {
    const res = await fetch('/api/appointments/cancel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ appointmentId: idStr, customerPhone, appointmentDate, startTime }),
    });

    if (res.ok) {
      serverSuccess = true;
    } else {
      const data = await res.json().catch(() => ({}));
      serverErrorMsg = data.error || 'ביטול התור נכשל בשרת';
    }
  } catch (err: any) {
    serverErrorMsg = err?.message || 'שגיאת תקשורת עם השרת';
  }

  if (serverSuccess) return;

  // גיבוי ישיר מול Firestore
  try {
    const docRef = doc(db, 'appointments', idStr);
    await setDoc(docRef, { status: 'cancelled' }, { merge: true });
    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await setDoc(doc(db, 'appointments', sId), { status: 'cancelled' }, { merge: true });
        } catch {
          // ignore
        }
      }
    }
  } catch (directErr: any) {
    throw new Error(serverErrorMsg || directErr?.message || 'ביטול התור נכשל');
  }
}

/**
 * Permanently delete appointment in Firestore
 */
export async function deleteAppointmentInFirestore(
  appointmentId: string | number,
  appointmentDate?: string,
  startTime?: string
): Promise<void> {
  const idStr = String(appointmentId);
  const token = await getAdminIdToken();

  let serverSuccess = false;
  let serverErrorMsg = '';

  try {
    const res = await fetch('/api/admin/appointments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ appointmentId: idStr, appointmentDate, startTime }),
    });

    if (res.ok) {
      serverSuccess = true;
    } else {
      if (res.status === 401) throw new Error('ההתחברות פגה. יש להתחבר מחדש כמנהלת.');
      const data = await res.json().catch(() => ({}));
      serverErrorMsg = data.error || 'מחיקת התור נכשלה בשרת';
    }
  } catch (err: any) {
    if (err?.message?.includes('פגה')) throw err;
    serverErrorMsg = err?.message || 'שגיאת תקשורת עם השרת';
  }

  if (serverSuccess) return;

  // גיבוי ישיר מול Firestore
  try {
    await deleteDoc(doc(db, 'appointments', idStr));
    if (appointmentDate && startTime) {
      const sId = `appt_${appointmentDate}_${startTime.replace(':', '')}`;
      if (sId !== idStr) {
        try {
          await deleteDoc(doc(db, 'appointments', sId));
        } catch {
          // ignore
        }
      }
    }
  } catch (directErr: any) {
    throw new Error(serverErrorMsg || directErr?.message || 'מחיקת התור נכשלה');
  }
}

const SETTINGS_COLLECTION = 'settings';

/**
 * Real-time listener for services configuration
 */
export function subscribeServices(
  onUpdate: (services: Service[]) => void
): () => void {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'services_config');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.services && Array.isArray(data.services) && data.services.length > 0) {
          onUpdate(data.services);
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
 * Save services configuration to Firestore
 */
export async function saveServicesToFirestore(services: Service[]): Promise<void> {
  const token = await getAdminIdToken();

  let serverSuccess = false;
  let serverErrorMsg = '';

  try {
    const res = await fetch('/api/admin/settings/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ services }),
    });

    if (res.ok) {
      serverSuccess = true;
    } else {
      if (res.status === 401) throw new Error('ההתחברות פגה. יש להתחבר מחדש כמנהלת.');
      const data = await res.json().catch(() => ({}));
      serverErrorMsg = data.error || 'שמירת השירותים נכשלה בשרת';
    }
  } catch (err: any) {
    if (err?.message?.includes('פגה')) throw err;
    serverErrorMsg = err?.message || 'שגיאת תקשורת עם השרת';
  }

  if (serverSuccess) return;

  // גיבוי ישיר מול Firestore
  try {
    await setDoc(doc(db, SETTINGS_COLLECTION, 'services_config'), { services, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (directErr: any) {
    throw new Error(serverErrorMsg || directErr?.message || 'שמירת השירותים נכשלה');
  }
}

/**
 * Real-time listener for salon schedule / working hours settings
 */
export function subscribeScheduleSettings(
  onUpdate: (settings: import('../types').ScheduleSettings) => void
): () => void {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'schedule_settings');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && data.businessOpen && data.businessClose) {
          onUpdate({
            businessOpen: data.businessOpen,
            businessClose: data.businessClose,
            fridayOpen: data.fridayOpen || '09:20',
            fridayClose: data.fridayClose || '15:00',
            durationMinutes: Number(data.durationMinutes) || 90,
          });
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
 * Save salon schedule / working hours settings to Firestore
 */
export async function saveScheduleSettingsToFirestore(
  schedule: ScheduleSettings | Record<string, any>
): Promise<void> {
  const token = await getAdminIdToken();

  let serverSuccess = false;
  let serverErrorMsg = '';

  try {
    const res = await fetch('/api/admin/settings/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ schedule }),
    });

    if (res.ok) {
      serverSuccess = true;
    } else {
      if (res.status === 401) throw new Error('ההתחברות פגה. יש להתחבר מחדש כמנהלת.');
      const data = await res.json().catch(() => ({}));
      serverErrorMsg = data.error || 'שמירת שעות הפעילות נכשלה בשרת';
    }
  } catch (err: any) {
    if (err?.message?.includes('פגה')) throw err;
    serverErrorMsg = err?.message || 'שגיאת תקשורת עם השרת';
  }

  if (serverSuccess) return;

  // גיבוי ישיר מול Firestore
  try {
    await setDoc(
      doc(db, SETTINGS_COLLECTION, 'schedule_settings'),
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
  } catch (directErr: any) {
    throw new Error(serverErrorMsg || directErr?.message || 'שמירת שעות הפעילות נכשלה');
  }
}

const ADMIN_USERS_COLLECTION = 'admin_users';

export const DEFAULT_ADMIN_ACCOUNTS: AdminUser[] = [
  {
    id: 'admin_alex',
    username: 'אלכסנדרה ביטון',
    phone: '054-6307114',
    email: 'alex@beauty.co.il',
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

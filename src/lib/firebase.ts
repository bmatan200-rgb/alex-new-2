import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
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
  getDocs,
  orderBy,
  runTransaction,
  Firestore,
} from 'firebase/firestore';
import { Appointment, Service } from '../types';
import { timeToMinutes } from '../utils/dateUtils';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
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
        // Sort ascending: from closest date and time to furthest
        list.sort((a, b) => {
          const dComp = (a.appointment_date || '').localeCompare(b.appointment_date || '');
          if (dComp !== 0) return dComp;
          return (a.start_time || '').localeCompare(b.start_time || '');
        });
        onUpdate(list);
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
 * Save new appointment to Firestore with atomic availability check
 */
export async function addAppointmentToFirestore(
  appointment: Omit<Appointment, 'id'> | Appointment
): Promise<string> {
  const apptDate = appointment.appointment_date;
  const startTime = appointment.start_time;
  
  // Use a deterministic ID for new appointments based on date and time to allow atomic locking
  const isNew = !('id' in appointment) || !appointment.id;
  const docId = isNew 
    ? `appt_${apptDate}_${startTime.replace(':', '')}` 
    : String(appointment.id);

  const dataToSave = {
    customer_name: appointment.customer_name,
    customer_phone: appointment.customer_phone,
    service_id: appointment.service_id || 1,
    service_name: appointment.service_name || "לק ג'ל",
    price: appointment.price || 150,
    appointment_date: appointment.appointment_date,
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    status: appointment.status || 'confirmed',
    notes: appointment.notes || '',
    created_at: appointment.created_at || new Date().toISOString(),
  };

  const docRef = doc(db, APPOINTMENTS_COLLECTION, docId);

  // Perform atomic transaction
  await runTransaction(db, async (transaction) => {
    // If it's a new appointment, check if the deterministic slot document already exists
    if (isNew) {
      const docSnap = await transaction.get(docRef);
      if (docSnap.exists()) {
        const existingData = docSnap.data();
        if (existingData.status !== 'cancelled') {
          // Another booking just grabbed this exact slot!
          throw new Error('השעה הזו כבר נתפסה, בבקשה תבחרי שעה אחרת');
        }
      }
    }
    
    // If it's clear or it's an update, set/merge the data
    transaction.set(docRef, dataToSave, { merge: true });
  });

  return docId;
}

/**
 * Cancel appointment in Firestore
 */
export async function cancelAppointmentInFirestore(appointmentId: string | number): Promise<void> {
  const idStr = String(appointmentId);
  try {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, idStr);
    await updateDoc(docRef, { status: 'cancelled' });
  } catch (err) {
    console.warn(`Direct updateDoc for ${idStr} failed, trying fallback:`, err);
    // If setDoc fallback is needed
    try {
      const docRef = doc(db, APPOINTMENTS_COLLECTION, idStr);
      await setDoc(docRef, { status: 'cancelled' }, { merge: true });
    } catch (fallbackErr) {
      console.error('Failed to cancel appointment in Firestore fallback:', fallbackErr);
    }
  }
}

/**
 * Permanently delete appointment in Firestore
 */
export async function deleteAppointmentInFirestore(appointmentId: string | number): Promise<void> {
  const idStr = String(appointmentId);
  try {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, idStr);
    await deleteDoc(docRef);
  } catch (err) {
    console.error(`Failed to delete appointment ${idStr} in Firestore:`, err);
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
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'services_config');
    await setDoc(docRef, { services, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Could not save services to Firestore:', err);
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
  settings: import('../types').ScheduleSettings
): Promise<void> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'schedule_settings');
    await setDoc(docRef, { ...settings, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Could not save schedule settings to Firestore:', err);
  }
}

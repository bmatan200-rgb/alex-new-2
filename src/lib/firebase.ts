import { initializeApp, getApps, getApp } from 'firebase/app';
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
  orderBy,
  Firestore,
} from 'firebase/firestore';
import { Appointment, Service } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

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
      orderBy('appointment_date', 'desc')
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
 * Save new appointment to Firestore
 */
export async function addAppointmentToFirestore(
  appointment: Omit<Appointment, 'id'> | Appointment
): Promise<string> {
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

  if ('id' in appointment && typeof appointment.id === 'string' && appointment.id.length > 5) {
    const docRef = doc(db, APPOINTMENTS_COLLECTION, appointment.id);
    await setDoc(docRef, dataToSave);
    return appointment.id;
  } else {
    const docRef = await addDoc(collection(db, APPOINTMENTS_COLLECTION), dataToSave);
    return docRef.id;
  }
}

/**
 * Cancel appointment in Firestore
 */
export async function cancelAppointmentInFirestore(appointmentId: string | number): Promise<void> {
  const docRef = doc(db, APPOINTMENTS_COLLECTION, String(appointmentId));
  await updateDoc(docRef, { status: 'cancelled' });
}

/**
 * Permanently delete appointment in Firestore
 */
export async function deleteAppointmentInFirestore(appointmentId: string | number): Promise<void> {
  const docRef = doc(db, APPOINTMENTS_COLLECTION, String(appointmentId));
  await deleteDoc(docRef);
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

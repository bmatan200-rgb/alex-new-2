import { Appointment, SalonInfo, Service, UserSession } from '../types';
import { toISODateString } from './dateUtils';

export const ADMIN_PHONE_RAW = '0546307114';

export function isAdminPhone(phone: string): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return (
    digits === '0546307114' ||
    digits === '972546307114' ||
    digits.endsWith('546307114') ||
    digits === '0543111408' ||
    digits === '972543111408' ||
    digits.endsWith('543111408')
  );
}

export const SALON_INFO: SalonInfo = {
  name: 'Alex טיפוח ויופי',
  tagline: 'מניקור מקצועי ולק ג׳ל',
  ownerName: 'אלכסנדרה ביטון',
  phone: '054-6307114',
  whatsappNumber: '972546307114',
  address: '',
  city: '',
  openingHours: [
    { days: 'ראשון - חמישי', hours: '09:20 - 20:30' },
    { days: 'שישי', hours: '09:20 - 15:00' },
    { days: 'שבת', hours: 'סגור (מנוחה)' },
  ],
};

export const SERVICES: Service[] = [
  {
    id: 1,
    name: "לק ג'ל",
    duration_minutes: 110,
    price: 150,
    category: 'nails',
    description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם',
  },
];

const STORAGE_KEY_SERVICES = 'alex_beauty_services_v1';
const STORAGE_KEY_APPOINTMENTS = 'alex_beauty_appointments_v5';
const STORAGE_KEY_USER_SESSION = 'alex_beauty_user_session_v1';

export function getStoredServices(): Service[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SERVICES);
    if (!raw) return SERVICES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return SERVICES;
  } catch {
    return SERVICES;
  }
}

export function saveStoredServices(services: Service[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SERVICES, JSON.stringify(services));
  } catch (err) {
    console.warn('Error saving services to localStorage:', err);
  }
}

export function getStoredAppointments(): Appointment[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_APPOINTMENTS);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAppointment(appointment: Appointment): void {
  const current = getStoredAppointments();
  const updated = [appointment, ...current];
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(updated));
}

export function cancelAppointment(appointmentId: number | string): void {
  const current = getStoredAppointments();
  const updated = current.map((app) =>
    app.id === appointmentId ? { ...app, status: 'cancelled' as const } : app
  );
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(updated));
}

export function deleteAppointmentPermanently(appointmentId: number | string): void {
  const current = getStoredAppointments();
  const updated = current.filter((app) => app.id !== appointmentId);
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(updated));
}

export function getStoredUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.phone) {
      // Strictly enforce admin verification solely based on authorized numbers
      parsed.isAdmin = isAdminPhone(parsed.phone);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserSession(session: UserSession): void {
  try {
    const isAdmin = isAdminPhone(session.phone);
    const sessionToSave: UserSession = {
      ...session,
      isAdmin,
      name: (session.name || '').trim(),
      phone: (session.phone || '').trim(),
      loggedInAt: session.loggedInAt || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(sessionToSave));
  } catch {
    // Ignore storage errors
  }
}

export function clearUserSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_USER_SESSION);
  } catch {
    // Ignore
  }
}



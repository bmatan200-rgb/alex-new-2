import { Appointment, SalonInfo, ScheduleSettings, Service, UserSession } from '../types';
import { toISODateString, deduplicateAppointments } from './dateUtils';

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
  address: 'הנרי קנדל 12',
  city: '',
  openingHours: [
    { days: 'ראשון - חמישי', hours: '09:20 - 20:30' },
    { days: 'שישי', hours: '09:20 - 15:00' },
    { days: 'שבת', hours: 'סגור (מנוחה)' },
  ],
};

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  businessOpen: '09:20',
  businessClose: '20:30',
  fridayOpen: '09:20',
  fridayClose: '15:00',
  durationMinutes: 90, // 1 hour and 30 minutes (90 mins / 1:30)
};

export const SERVICES: Service[] = [
  {
    id: 1,
    name: "לק ג'ל",
    duration_minutes: 90, // 1:30 (90 minutes)
    price: 150,
    category: 'nails',
    description: 'מניקור יסודי משולב ומריחת לק ג׳ל איכותי בגימור מושלם',
  },
];

const STORAGE_KEY_SERVICES = 'alex_beauty_services_v2';
const STORAGE_KEY_SCHEDULE_SETTINGS = 'alex_beauty_schedule_settings_v1';
const STORAGE_KEY_APPOINTMENTS = 'alex_beauty_appointments_v5';
const STORAGE_KEY_USER_SESSION = 'alex_beauty_user_session_v1';

export function getStoredScheduleSettings(): ScheduleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCHEDULE_SETTINGS);
    if (!raw) return DEFAULT_SCHEDULE_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      businessOpen: parsed.businessOpen || DEFAULT_SCHEDULE_SETTINGS.businessOpen,
      businessClose: parsed.businessClose || DEFAULT_SCHEDULE_SETTINGS.businessClose,
      fridayOpen: parsed.fridayOpen || DEFAULT_SCHEDULE_SETTINGS.fridayOpen,
      fridayClose: parsed.fridayClose || DEFAULT_SCHEDULE_SETTINGS.fridayClose,
      durationMinutes: Number(parsed.durationMinutes) || DEFAULT_SCHEDULE_SETTINGS.durationMinutes,
    };
  } catch {
    return DEFAULT_SCHEDULE_SETTINGS;
  }
}

export function saveStoredScheduleSettings(settings: ScheduleSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SCHEDULE_SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn('Error saving schedule settings to localStorage:', err);
  }
}

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
    const parsed: Appointment[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    return deduplicateAppointments(parsed);
  } catch {
    return [];
  }
}

export function saveAppointment(appointment: Appointment): void {
  const current = getStoredAppointments();
  const idStr = appointment.id ? String(appointment.id) : null;
  const filtered = current.filter((app) => {
    if (idStr && app.id && String(app.id) === idStr) return false;
    if (app.appointment_date === appointment.appointment_date && app.start_time === appointment.start_time) {
      return false;
    }
    return true;
  });
  const updated = deduplicateAppointments([appointment, ...filtered]);
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(updated));
}

export function cancelAppointment(appointmentId: number | string): void {
  const current = getStoredAppointments();
  const idStr = String(appointmentId);
  const target = current.find((a) => String(a.id) === idStr);

  const updated = current.map((app) => {
    if (String(app.id) === idStr) return { ...app, status: 'cancelled' as const };
    if (target && app.appointment_date === target.appointment_date && app.start_time === target.start_time) {
      return { ...app, status: 'cancelled' as const };
    }
    return app;
  });
  const deduped = deduplicateAppointments(updated);
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(deduped));
}

export function deleteAppointmentPermanently(appointmentId: number | string): void {
  const current = getStoredAppointments();
  const idStr = String(appointmentId);
  const target = current.find((a) => String(a.id) === idStr);

  const updated = current.filter((app) => {
    if (String(app.id) === idStr) return false;
    if (target && app.appointment_date === target.appointment_date && app.start_time === target.start_time) {
      return false;
    }
    return true;
  });
  const deduped = deduplicateAppointments(updated);
  localStorage.setItem(STORAGE_KEY_APPOINTMENTS, JSON.stringify(deduped));
}

export function getStoredUserSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.phone) {
      // Strictly enforce admin verification solely based on authorized numbers
      parsed.isAdmin = false;
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserSession(session: UserSession): void {
  try {
    const isAdmin = false;
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



import { Appointment, SalonInfo, ScheduleSettings, Service, UserSession } from '../types';
import { toISODateString, deduplicateAppointments } from './dateUtils';

export const ADMIN_PHONE_RAW = '0546307114';

// A phone number is never proof of an administrator role.
export function isAdminPhone(_phone:string):boolean { return false; }

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

function getStorageTenantId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryTenant = params.get('tenant')?.trim();
    if (queryTenant) return queryTenant;
    const active = localStorage.getItem('active_tenant_id_v1')?.trim();
    if (active) return active;
  } catch {}
  return 'alex_beauty';
}

function tenantStorageKey(base: string, tenantId = getStorageTenantId()): string {
  return `${base}__${tenantId}`;
}

function getTenantOrLegacyRaw(base: string, tenantId = getStorageTenantId()): string | null {
  const namespacedKey = tenantStorageKey(base, tenantId);
  const current = localStorage.getItem(namespacedKey);
  if (current !== null) return current;
  if (tenantId === 'alex_beauty') {
    const legacy = localStorage.getItem(base);
    if (legacy !== null) {
      try { localStorage.setItem(namespacedKey, legacy); } catch {}
      return legacy;
    }
  }
  return null;
}

const STORAGE_KEY_SERVICES = 'alex_beauty_services_v2';
const STORAGE_KEY_SCHEDULE_SETTINGS = 'alex_beauty_schedule_settings_v1';
const STORAGE_KEY_APPOINTMENTS = 'alex_beauty_appointments_v5';
const STORAGE_KEY_USER_SESSION = 'alex_customer_session_v6';
const STORAGE_KEY_ADMIN_SESSION = 'alex_admin_auth_session_v6';

export function getActiveTenantId(): string { return getStorageTenantId(); }

export function getStoredScheduleSettings(): ScheduleSettings {
  try {
    const raw = getTenantOrLegacyRaw(STORAGE_KEY_SCHEDULE_SETTINGS);
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
    localStorage.setItem(tenantStorageKey(STORAGE_KEY_SCHEDULE_SETTINGS), JSON.stringify(settings));
  } catch (err) {
    console.warn('Error saving schedule settings to localStorage:', err);
  }
}

export function getStoredServices(): Service[] {
  try {
    const raw = getTenantOrLegacyRaw(STORAGE_KEY_SERVICES);
    if (!raw) return getStorageTenantId()==='alex_beauty'?SERVICES:[];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return SERVICES;
  } catch {
    return SERVICES;
  }
}

export function saveStoredServices(services: Service[]): void {
  try {
    localStorage.setItem(tenantStorageKey(STORAGE_KEY_SERVICES), JSON.stringify(services));
  } catch (err) {
    console.warn('Error saving services to localStorage:', err);
  }
}

export function getStoredAppointments(): Appointment[] {
  try {
    const raw = getTenantOrLegacyRaw(STORAGE_KEY_APPOINTMENTS);
    if (!raw) {
      return [];
    }
    const parsed: Appointment[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    
    return deduplicateAppointments(parsed.filter((a) => a.status !== 'cancelled'));
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
  localStorage.setItem(tenantStorageKey(STORAGE_KEY_APPOINTMENTS), JSON.stringify(updated));
}

export function cancelAppointment(appointmentId: number | string): void {
  deleteAppointmentPermanently(appointmentId);
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
  localStorage.setItem(tenantStorageKey(STORAGE_KEY_APPOINTMENTS), JSON.stringify(deduped));
}

export function getStoredUserSession(): UserSession | null {
  try {
    // Clean up all legacy session keys so the app always starts clean
    [
      'alex_beauty_user_session_v1',
      'alex_beauty_user_session_v2',
      'alex_beauty_user_session_v3',
      'alex_beauty_user_session_v4',
      'alex_beauty_user_session_v5',
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    const raw = getTenantOrLegacyRaw(STORAGE_KEY_USER_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.phone && parsed.name) {
      // Customer session is strictly customer data (never admin)
      return {
        ...parsed,
        isAdmin: false,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveUserSession(session: UserSession): void {
  try {
    const sessionToSave: UserSession = {
      ...session,
      isAdmin: false, // Customer sessions are always non-admin
      name: (session.name || '').trim(),
      phone: (session.phone || '').trim(),
      loggedInAt: session.loggedInAt || new Date().toISOString(),
    };
    localStorage.setItem(tenantStorageKey(STORAGE_KEY_USER_SESSION), JSON.stringify(sessionToSave));
  } catch {
    // Ignore storage errors
  }
}

export function getStoredAdminSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ADMIN_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.isAdmin === true) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: UserSession): void {
  try {
    const sessionToSave: UserSession = {
      ...session,
      isAdmin: true,
      name: (session.name || 'מנהלת').trim(),
      email: (session.email || '').trim(),
      phone: (session.phone || '').trim(),
      loggedInAt: session.loggedInAt || new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY_ADMIN_SESSION, JSON.stringify(sessionToSave));
  } catch {
    // Ignore storage errors
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_ADMIN_SESSION);
    localStorage.removeItem('alex_admin_session_token');
  } catch {
    // Ignore
  }
}

export function clearUserSession(): void {
  try {
    localStorage.removeItem(tenantStorageKey(STORAGE_KEY_USER_SESSION));
    localStorage.removeItem(STORAGE_KEY_ADMIN_SESSION);
    localStorage.removeItem('alex_admin_session_token');
    [
      'alex_beauty_user_session_v1',
      'alex_beauty_user_session_v2',
      'alex_beauty_user_session_v3',
      'alex_beauty_user_session_v4',
      'alex_beauty_user_session_v5',
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {
    // Ignore
  }
}



export function getCurrentSalonInfo(): SalonInfo {
  try {const raw=localStorage.getItem('tenant_profile__'+getStorageTenantId());if(raw)return JSON.parse(raw);}catch{}
  return getStorageTenantId()==='alex_beauty'?SALON_INFO:{name:'',tagline:'',ownerName:'',phone:'',whatsappNumber:'',address:'',city:'',openingHours:[]};
}

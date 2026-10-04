export interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
  category?: 'nails' | 'hair' | 'general';
  description?: string;
}

export interface Appointment {
  id: number | string;
  customer_name: string;
  customer_phone: string;
  service_id: number;
  service_name?: string;
  price?: number;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  status: 'confirmed' | 'cancelled';
  notes?: string;
  created_at?: string;
  reminder_sent_customer?: boolean;
  reminder_sent_alex?: boolean;
}

export interface DayInfo {
  iso: string;
  weekday: string;
  dayOfMonth: string;
  month: string;
  isToday: boolean;
  isClosed?: boolean;
}

export interface SalonInfo {
  name: string;
  tagline: string;
  ownerName: string;
  phone: string;
  whatsappNumber: string;
  address: string;
  city: string;
  openingHours: {
    days: string;
    hours: string;
  }[];
}

export interface WhatsAppReminderSettings {
  enabled: boolean;
  notifyCustomerOnBookingDay: boolean; // Immediate notification on the day of booking
  notifyCustomerToday: boolean; // Morning/same-day of appointment reminder
  notifyCustomer1DayBefore: boolean; // 1 day before
  notifyCustomer2HoursBefore: boolean; // 2 hours before
  notifyAlexOnBooking: boolean;
  notifyAlex1DayBefore: boolean;
  notifyAlex2HoursBefore: boolean;
  hoursBeforeAlert?: number; // Configurable number of hours before appointment for the short-term alert
  autoSendEnabled: boolean; // Automatic background dispatch via API/Webhook
  browserNotificationsEnabled: boolean;
  soundEnabled: boolean;
  provider: 'telnyx' | 'direct' | 'webhook' | 'greenapi' | 'ultramsg' | 'twilio' | 'make';
  webhookUrl?: string;
  apiKey?: string;
  instanceId?: string;
  eveningReminderTime?: string; // e.g. "20:56" (HH:mm)
  morningReminderTime?: string; // e.g. "08:00" (HH:mm)
  customerBookingConfirmationTemplate?: string;
  customerTodayTemplate?: string;
  customer1DayTemplate?: string;
  customerTemplate?: string;
  alexTemplate?: string;
}

export interface UserSession {
  name: string;
  phone: string;
  email?: string;
  username?: string;
  isAdmin: boolean;
  role?: 'super_admin' | 'business_admin';
  tenantId?: string;
  uid?: string;
  loggedInAt: string;
  acceptedTerms?: boolean;
  acceptedTermsAt?: string;
  signatureDataUrl?: string;
}

export interface AdminUser {
  id?: string;
  username: string;
  phone: string;
  email: string;
  password?: string;
  role?: 'admin' | 'owner' | 'staff';
  createdAt?: string;
  lastLoginAt?: string;
}

export interface ScheduleSettings {
  businessOpen: string; // e.g. "09:20"
  businessClose: string; // e.g. "20:30"
  fridayOpen: string; // e.g. "09:20"
  fridayClose: string; // e.g. "15:00"
  durationMinutes: number; // e.g. 90 (1 hour and 30 minutes)
}

export interface Customer {
  id?: string;
  full_name: string;
  phone: string;
  created_at: string;
  last_login_at: string;
  notes?: string;
  totalAppointments?: number;
  lastAppointmentDate?: string;
}

export interface TenantInfo {
  id: string; // e.g. 'alex_beauty'
  tenantSlug?: string; // e.g. 'yossibarber' or 'glam_studio_tlv'
  name: string;
  tagline?: string;
  ownerName: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  primaryColor?: string;
  secondaryColor?: string;
  coverImage?: string; // tenant-specific hero/cover image (URL or compressed data URL)
  status: 'active' | 'trial' | 'suspended';
  plan: 'starter' | 'pro' | 'enterprise';
  createdAt: string;
  totalAppointments?: number;
  totalRevenue?: number;
  activeServicesCount?: number;
  customDomain?: string;
  isPrimary?: boolean;
}



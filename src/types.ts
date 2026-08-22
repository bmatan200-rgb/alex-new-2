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
  provider: 'direct' | 'webhook' | 'greenapi' | 'ultramsg' | 'twilio' | 'make';
  webhookUrl?: string;
  apiKey?: string;
  instanceId?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioType?: 'whatsapp' | 'sms';
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
  isAdmin: boolean;
  loggedInAt: string;
}


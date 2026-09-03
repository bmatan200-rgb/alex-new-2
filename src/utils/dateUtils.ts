import { Appointment, DayInfo } from '../types';

export const BUSINESS_OPEN = '09:20';
export const BUSINESS_CLOSE = '20:30';
export const FRIDAY_OPEN = '09:20';
export const FRIDAY_CLOSE = '15:00';
export const SLOT_INTERVAL = 90; // 1 hour and 30 minutes (90 mins / 1:30)

export const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toIsraeliDateString(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function toShortIsraeliDateString(iso: string): string {
  if (!iso || !iso.includes('-')) return iso;
  const [y, m, d] = iso.split('-');
  const shortYear = y.length === 4 ? y.substring(2) : y;
  return `${d}/${m}/${shortYear}`;
}

export function formatILS(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDurationMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return '0 דקות';
  if (minutes === 60) return 'שעה';
  if (minutes === 90) return 'שעה וחצי (90 דק׳)';
  if (minutes === 110) return 'שעה ו-50 דקות';
  if (minutes === 120) return 'שעתיים';
  if (minutes === 150) return 'שעתיים וחצי';
  
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  
  if (hours === 0) {
    return `${remainingMins} דקות`;
  }
  if (hours === 1) {
    return remainingMins > 0 ? `שעה ו-${remainingMins} דקות` : 'שעה';
  }
  if (hours === 2) {
    return remainingMins > 0 ? `שעתיים ו-${remainingMins} דקות` : 'שעתיים';
  }
  return `${hours} שעות ${remainingMins > 0 ? `ו-${remainingMins} דקות` : ''} (${minutes} דק׳)`;
}

export function buildNextDays(count: number = 21): DayInfo[] {
  const days: DayInfo[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < count; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayOfWeek = d.getDay();
    const isClosed = dayOfWeek === 6; // Closed on Saturday

    days.push({
      iso: toISODateString(d),
      weekday: HEBREW_WEEKDAYS[dayOfWeek],
      dayOfMonth: String(d.getDate()).padStart(2, '0'),
      month: String(d.getMonth() + 1).padStart(2, '0'),
      isToday: i === 0,
      isClosed,
    });
  }
  return days;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const h = String(Math.floor(total / 60)).padStart(2, '0');
  const m = String(total % 60).padStart(2, '0');
  return `${h}:${m}`;
}

// Calculate available slots based on service duration and existing booked slots
export function calculateAvailableSlots({
  durationMinutes,
  existingAppointments,
  dateString,
  businessOpen = BUSINESS_OPEN,
  businessClose = BUSINESS_CLOSE,
  slotInterval = SLOT_INTERVAL,
}: {
  durationMinutes: number;
  existingAppointments: Appointment[];
  dateString?: string;
  businessOpen?: string;
  businessClose?: string;
  slotInterval?: number;
}): string[] {
  let effectiveClose = businessClose;
  if (dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();
    if (dayOfWeek === 5) { // Friday
      effectiveClose = FRIDAY_CLOSE;
    }
  }

  const openMin = timeToMinutes(businessOpen);
  const closeMin = timeToMinutes(effectiveClose);
  const booked = existingAppointments
    .filter((a) => a.status === 'confirmed' && (!dateString || a.appointment_date === dateString))
    .map((a) => ({
      start: timeToMinutes(a.start_time),
      end: timeToMinutes(a.end_time),
    }));

  const slots: string[] = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += slotInterval) {
    const end = start + durationMinutes;
    const overlaps = booked.some((r) => start < r.end && end > r.start);
    if (!overlaps) {
      slots.push(minutesToTime(start));
    }
  }
  return slots;
}

// Returns all standard slot start times for a given day according to business hours & duration intervals
export function getAllStandardSlots(
  dateString: string,
  durationMinutes: number = SLOT_INTERVAL,
  businessOpen: string = BUSINESS_OPEN,
  businessClose: string = BUSINESS_CLOSE,
  fridayClose: string = FRIDAY_CLOSE
): string[] {
  if (!dateString) return [];
  const [y, m, d] = dateString.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  if (dayOfWeek === 6) return []; // Saturday is closed

  const effectiveClose = dayOfWeek === 5 ? fridayClose : businessClose;
  const openMin = timeToMinutes(businessOpen);
  const closeMin = timeToMinutes(effectiveClose);

  const slots: string[] = [];
  for (let start = openMin; start + durationMinutes <= closeMin; start += durationMinutes) {
    slots.push(minutesToTime(start));
  }
  return slots;
}

export interface SlotOccupancy {
  time: string;
  endTime: string;
  isAvailable: boolean;
  status: 'free' | 'client_booked' | 'blocked';
  appointment?: Appointment;
}

export function getDailySlotsOccupancy(
  dateString: string,
  appointments: Appointment[],
  durationMinutes: number = SLOT_INTERVAL,
  businessOpen: string = BUSINESS_OPEN,
  businessClose: string = BUSINESS_CLOSE,
  fridayClose: string = FRIDAY_CLOSE
): SlotOccupancy[] {
  const allSlots = getAllStandardSlots(dateString, durationMinutes, businessOpen, businessClose, fridayClose);
  const dateAppointments = appointments.filter(
    (a) => a.appointment_date === dateString && a.status === 'confirmed'
  );

  return allSlots.map((slotTime) => {
    const startMin = timeToMinutes(slotTime);
    const endMin = startMin + durationMinutes;
    const endTime = minutesToTime(endMin);

    // Find any overlapping confirmed appointment
    const matchingAppt = dateAppointments.find((a) => {
      const aStart = timeToMinutes(a.start_time);
      const aEnd = timeToMinutes(a.end_time);
      return startMin < aEnd && endMin > aStart;
    });

    if (!matchingAppt) {
      return {
        time: slotTime,
        endTime,
        isAvailable: true,
        status: 'free' as const,
      };
    }

    const isBlocked =
      matchingAppt.price === 0 ||
      matchingAppt.customer_name.includes('חופש') ||
      matchingAppt.customer_name.includes('חסימה') ||
      matchingAppt.customer_name.includes('🔒') ||
      matchingAppt.customer_phone === 'שריון יזום' ||
      matchingAppt.customer_phone === 'חסימת יומן';

    return {
      time: slotTime,
      endTime,
      isAvailable: false,
      status: isBlocked ? ('blocked' as const) : ('client_booked' as const),
      appointment: matchingAppt,
    };
  });
}

export function formatHebrewFullDate(dateString: string): string {
  if (!dateString || !dateString.includes('-')) return dateString;
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = HEBREW_WEEKDAYS[date.getDay()];
  const monthName = HEBREW_MONTHS[month - 1];
  return `יום ${dayName}, ${day} ב${monthName} ${year}`;
}

export function isSlotInPast(dateString: string, timeString: string): boolean {
  if (!dateString || !timeString) return false;
  const now = new Date();
  const todayStr = toISODateString(now);
  if (dateString < todayStr) return true;
  if (dateString > todayStr) return false;

  const [hours, minutes] = timeString.split(':').map(Number);
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();

  if (hours < currentHours) return true;
  if (hours === currentHours && minutes <= currentMinutes) return true;
  return false;
}

export function generateGoogleCalendarUrl({
  title,
  description,
  location,
  date,
  startTime,
  endTime,
}: {
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const [year, month, day] = date.split('-');
  const [startH, startM] = startTime.split(':');
  const [endH, endM] = endTime.split(':');

  const startObj = new Date(Number(year), Number(month) - 1, Number(day), Number(startH), Number(startM));
  const endObj = new Date(Number(year), Number(month) - 1, Number(day), Number(endH), Number(endM));

  const formatGoogleTime = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '');
  };

  const datesParam = `${formatGoogleTime(startObj)}/${formatGoogleTime(endObj)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    details: description,
    location: location,
    dates: datesParam,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateIcsFile({
  title,
  description,
  location,
  date,
  startTime,
  endTime,
}: {
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
}): string {
  const [year, month, day] = date.split('-');
  const [startH, startM] = startTime.split(':');
  const [endH, endM] = endTime.split(':');

  const startObj = new Date(Number(year), Number(month) - 1, Number(day), Number(startH), Number(startM));
  const endObj = new Date(Number(year), Number(month) - 1, Number(day), Number(endH), Number(endM));

  const formatIcsTime = (d: Date) => {
    return d.toISOString().replace(/-|:|\.\d+/g, '').substring(0, 15) + 'Z';
  };

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Alex Beauty//Appointment//HE
CALSCALE:GREGORIAN
BEGIN:VEVENT
SUMMARY:${title}
DESCRIPTION:${description.replace(/\n/g, '\\n')}
LOCATION:${location}
DTSTART:${formatIcsTime(startObj)}
DTEND:${formatIcsTime(endObj)}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
}

/**
 * Deduplicates appointments so that:
 * 1. Confirmed appointments always take precedence over cancelled appointments for the same date and slot.
 * 2. If multiple confirmed exist for the same slot, the newest created_at is retained.
 * 3. If multiple cancelled exist for the same slot, only the newest is kept.
 * 4. Deduplicates by unique ID as well.
 */
export function deduplicateAppointments(list: Appointment[]): Appointment[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  // Sort priority:
  // First: confirmed before non-confirmed (cancelled)
  // Second: newest created_at first
  const sorted = [...list].sort((a, b) => {
    if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
    if (a.status !== 'confirmed' && b.status === 'confirmed') return 1;
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();
  const result: Appointment[] = [];

  for (const app of sorted) {
    const idKey = app.id ? String(app.id) : null;
    const slotKey = `${app.appointment_date}_${app.start_time}`;

    if (idKey && seenIds.has(idKey)) {
      continue;
    }
    if (seenSlots.has(slotKey)) {
      continue;
    }

    if (idKey) seenIds.add(idKey);
    seenSlots.add(slotKey);
    result.push(app);
  }

  // Sort chronologically ascending for UI presentation
  return result.sort((a, b) => {
    const dComp = (a.appointment_date || '').localeCompare(b.appointment_date || '');
    if (dComp !== 0) return dComp;
    return (a.start_time || '').localeCompare(b.start_time || '');
  });
}


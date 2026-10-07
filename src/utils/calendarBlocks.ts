import type { Appointment } from '../types';

export const CALENDAR_BLOCK_LABEL = 'חופש / הפסקה';

// Use the explicit calendar marker; a free treatment or a manual client is not a block.
export function isCalendarBlock(appointment: { customer_phone?: string; customer_name?: string }): boolean {
  return appointment.customer_phone === 'חסימת יומן' ||
    (appointment.customer_phone === '' && appointment.customer_name === CALENDAR_BLOCK_LABEL);
}

export function blocksForDay(appointments: Appointment[], date: string): Appointment[] {
  return Array.from(new Map(appointments.filter(a =>
    a.appointment_date === date && a.status === 'confirmed' && a.customer_phone === 'חסימת יומן'
  ).map(a => [String(a.id), a])).values());
}

export async function releaseDayBlocks(appointments: Appointment[], date: string, release: (id: string) => Promise<void> | void) {
  let released = 0;
  let failed = 0;
  for (const appointment of blocksForDay(appointments, date)) {
    try { await release(String(appointment.id)); released++; }
    catch { failed++; }
  }
  return { released, failed };
}

// Public availability exposes only timing and a fixed label, never a private reason or note.
export function publicBusyAppointment(id: string | number, data: {
  appointment_date: string; start_time: string; end_time: string; customer_phone?: string;
}): Appointment {
  return { id, appointment_date: data.appointment_date, start_time: data.start_time,
    end_time: data.end_time, status: 'confirmed',
    customer_name: data.customer_phone === 'חסימת יומן' ? CALENDAR_BLOCK_LABEL : 'תפוס',
    customer_phone: '', service_id: 0, service_name: '', price: 0, notes: '' };
}

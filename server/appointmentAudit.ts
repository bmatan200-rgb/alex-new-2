import { phoneDigits } from './core';
export function normalizeAppointment(a: any): any {
  return {...a, status: a.status === 'confirmed' || !a.status ? 'active' : a.status,
    createdAt: a.createdAt || a.created_at || null, updatedAt: a.updatedAt || a.updated_at || a.createdAt || a.created_at || null};
}
export function validateBookingDetails(a: any) {
  if (typeof a.customer_name !== 'string' || a.customer_name.trim().split(/\s+/).length < 2 || a.customer_name.length > 100)
    throw new Error('חובה להזין שם פרטי ושם משפחה');
  if (!phoneDigits(a.customer_phone)) throw new Error('חובה להזין מספר טלפון תקין');
  if (!a.service_id && !(typeof a.service_name === 'string' && a.service_name.trim())) throw new Error('חובה לבחור טיפול מפורט');
}
export function scheduleSnapshot(a: any) {
  return {appointment_date:a.appointment_date,start_time:a.start_time,end_time:a.end_time,
    service_id:a.service_id ?? 0,service_name:a.service_name || '',customer_name:a.customer_name,customer_phone:a.customer_phone,notes:a.notes||'',price:Number(a.price||0)};
}
export function cancellationPatch(a: any, by: 'admin'|'client', reason: unknown, now=new Date().toISOString()) {
  const text=typeof reason==='string'?reason.trim():'';
  if (by==='admin' && !text) throw new Error('חובה לציין סיבת ביטול');
  if (text.length>2000) throw new Error('סיבת הביטול ארוכה מדי');
  return {status:'cancelled',cancelledAt:now,cancelledBy:by,cancellationReason:text,updatedAt:now,updated_at:now};
}

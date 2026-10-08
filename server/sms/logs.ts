import { hash, phoneDigits, reminderKey, israelClock, validDate, validId } from '../core';
// Old releases retained provider IDs in deduplication locks, not UI logs.
export function legacyLogLockKey(log: any): string | null {
  if (validId(log.reminderLockKey)) return log.reminderLockKey;
  if (!phoneDigits(log.recipientPhone)) return null;
  if (['morning_today','evening_1day'].includes(log.reminderType) && validDate(log.appointmentDate)) {
    return reminderKey(log.reminderType==='morning_today'?'today':'1day',log.recipientPhone,log.appointmentDate);
  }
  if (!['manual','manual_single','test'].includes(log.reminderType) || typeof log.messageText !== 'string') return null;
  const sent = new Date(log.sentAt);
  if (!Number.isFinite(sent.getTime())) return null;
  return 'manual_'+hash(JSON.stringify([phoneDigits(log.recipientPhone),log.messageText,israelClock(sent).dateIso]));
}

// A slower concurrent lookup must not erase a terminal delivery result.
export function mergeDeliveryResult(previous: any, incoming: any) {
  const retain = previous.status === 'delivered' || (previous.status === 'failed' && incoming.status !== 'delivered');
  return retain ? {...incoming,status:previous.status,providerStatus:previous.providerStatus || incoming.providerStatus,errorMessage:previous.errorMessage || null} : incoming;
}

// A deliberate manual send has its own operation ID; retries share one lock.
// Clients without an operation ID retain the legacy daily safeguard.
export function manualSmsLockKey(phone: string, message: string, date: string, requestId?: string): string {
  if (requestId !== undefined) {
    if (!validId(requestId)) throw new Error('Invalid SMS request ID');
    return 'manual_request_' + hash(requestId);
  }
  return 'manual_' + hash(JSON.stringify([phoneDigits(phone), message, date]));
}

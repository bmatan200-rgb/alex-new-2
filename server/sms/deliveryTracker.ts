import { randomUUID } from 'node:crypto';
import { hash, validId, phoneDigits } from '../core';
import { mergeDeliveryResult } from './logs';
import type { DeliveryResult, SmsProvider } from './providers';

export const DELIVERY_JOBS = 'sms_delivery_jobs';
export const DELIVERY_MAX_CHECKS = 8;
const LEASE_MS = 60_000;
const MAX_AGE_MS = 24 * 60 * 60_000;
const delays = [60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 21_600_000];
const terminal = (status: string) => status === 'delivered' || status === 'failed';

export class DeliveryTracker {
  private running = false;
  private pausedUntil = 0;
  private nextRunAt = 0;
  constructor(private db: any, private provider: (tenantId: string, providerId: string) => Promise<SmsProvider>, private now = () => Date.now()) {}
  jobRef(tenantId: string, lockKey: string, messageId: string) {
    if (!validId(tenantId) || !validId(lockKey) || !validId(messageId)) throw new Error('Invalid delivery job identity');
    return this.db.doc(`${DELIVERY_JOBS}/${hash(JSON.stringify([tenantId,lockKey,messageId]))}`);
  }
  // Written in the SAME transaction as the accepted lock. Restarts cannot lose tracking.
  acceptedJob(tenantId: string, lockKey: string, data: any) {
    const final = terminal(data.status);
    return { tenantId, lockKey, messageId: data.id, provider: data.provider, expectedPhone: data.to,
      createdAt: this.now(), checks: 0, nextCheckAt: final ? null : this.now() + delays[0],
      token: null, attention: data.status === 'failed', attentionReason: data.status === 'failed' ? (data.errorMessage || 'הספק דיווח על כישלון מסירה') : null,
      delivery: {status:data.status,providerStatus:data.providerStatus || 'unknown',errorMessage:data.errorMessage || null},
      lastCheckedAt: null, lookupError: null };
  }
  async attachLog(tenantId: string, lockKey: string, messageId: string, logId: string) {
    if (!validId(logId)) throw new Error('Invalid SMS log ID');
    const ref = this.jobRef(tenantId,lockKey,messageId);
    const logRef = this.db.doc(`tenants/${tenantId}/sms_logs/${logId}`);
    await this.db.runTransaction(async (tx: any) => {
      const [job,log] = await Promise.all([tx.get(ref),tx.get(logRef)]);
      if (!job.exists || !log.exists) return;
      const j = job.data();
      tx.update(ref,{logId});
      tx.update(logRef,{...mergeDeliveryResult(log.data(),j.delivery),deliveryCheckedAt:j.lastCheckedAt,
        deliveryAttention:j.attention,deliveryAttentionReason:j.attentionReason,deliveryLookupError:j.lookupError});
    });
  }
  async recordResult(tenantId: string, lockKey: string, messageId: string, providerId: string, delivery: DeliveryResult, logId?: string, token?: string) {
    const ref = this.jobRef(tenantId,lockKey,messageId);
    return this.db.runTransaction(async (tx: any) => {
      const job = await tx.get(ref);
      const j = job.exists ? job.data() : {};
      if (token && j.token !== token) return null;
      const targetId = logId || j.logId;
      const logRef = validId(targetId) ? this.db.doc(`tenants/${tenantId}/sms_logs/${targetId}`) : null;
      const lockRef = this.db.doc(`tenants/${tenantId}/reminder_locks/${lockKey}`);
      const [log,lock] = await Promise.all([logRef ? tx.get(logRef) : null,tx.get(lockRef)]);
      const merged = mergeDeliveryResult(log?.data() || {},mergeDeliveryResult(j.delivery || {},delivery));
      const checkedAt = new Date(this.now()).toISOString();
      const createdAt = j.createdAt || Date.parse(log?.data()?.sentAt) || this.now();
      const exhausted = (j.checks || 0) >= DELIVERY_MAX_CHECKS || this.now()-createdAt >= MAX_AGE_MS;
      const attention = merged.status === 'failed' || (!terminal(merged.status) && exhausted);
      const reason = merged.status === 'failed' ? merged.errorMessage || 'הספק דיווח על כישלון מסירה; נדרש טיפול'
        : attention ? 'לא התקבל אישור מסירה לאחר בדיקות מוגבלות; יש לבדוק לפני שליחה נוספת' : null;
      const update = {...merged,provider:providerId,providerMessageId:messageId,deliveryCheckedAt:checkedAt,
        deliveryAttention:attention,deliveryAttentionReason:reason,deliveryLookupError:null};
      if (log?.exists) tx.update(logRef,mergeDeliveryResult(log.data(),update));
      // Preserve the send lock even on delivery failure. This worker NEVER sends SMS.
      if (lock.exists && lock.data()?.providerMessageId === messageId) tx.update(lockRef,{deliveryStatus:merged.status,deliveryCheckedAt:checkedAt,deliveryAttention:attention,deliveryAttentionReason:reason});
      tx.set(ref,{tenantId,lockKey,messageId,provider:providerId,logId:targetId || null,
        expectedPhone:j.expectedPhone || log?.data()?.recipientPhone || '',createdAt,checks:j.checks || 0,
        delivery:merged,lastCheckedAt:checkedAt,lookupError:null,token:null,attention,attentionReason:reason,
        nextCheckAt:terminal(merged.status) || exhausted ? null : this.now()+delays[Math.min(j.checks || 0,delays.length-1)]},{merge:true});
      return log?.exists ? {...log.data(),...mergeDeliveryResult(log.data(),update),id:targetId} : null;
    });
  }
  private async claim(ref: any) {
    return this.db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref); const j = snap.data();
      if (!j || typeof j.nextCheckAt !== 'number' || j.nextCheckAt > this.now()) return null;
      if (!validId(j.tenantId) || !validId(j.lockKey) || !validId(j.messageId) || !phoneDigits(j.expectedPhone) || typeof j.provider !== 'string') {
        tx.update(ref,{nextCheckAt:null,attention:true,attentionReason:'פרטי מעקב חסרים; נדרשת בדיקה ידנית'});return null;
      }
      if ((j.checks || 0) >= DELIVERY_MAX_CHECKS || this.now()-j.createdAt >= MAX_AGE_MS) {
        const reason='חלון בדיקת המסירה הסתיים; אין לשלוח שוב ללא בדיקה';
        const logRef=validId(j.logId) ? this.db.doc(`tenants/${j.tenantId}/sms_logs/${j.logId}`) : null;
        const lockRef=this.db.doc(`tenants/${j.tenantId}/reminder_locks/${j.lockKey}`);
        const [log,lock]=await Promise.all([logRef ? tx.get(logRef) : null,tx.get(lockRef)]);
        tx.update(ref,{nextCheckAt:null,token:null,attention:true,attentionReason:reason});
        if(log?.exists) tx.update(logRef,{deliveryAttention:true,deliveryAttentionReason:reason});
        if(lock.exists && lock.data()?.providerMessageId===j.messageId) tx.update(lockRef,{deliveryAttention:true,deliveryAttentionReason:reason});
        return null;
      }
      const token = randomUUID();
      tx.update(ref,{token,nextCheckAt:this.now()+LEASE_MS,checks:(j.checks || 0)+1});
      return {...j,token,checks:(j.checks || 0)+1};
    });
  }
  private async failedLookup(ref: any, job: any, error: any) {
    const message = String(error?.message || 'בדיקת הספק נכשלה').slice(0,1000);
    if (error?.statusCode === 429) this.pausedUntil = this.now()+60_000;
    await this.db.runTransaction(async (tx: any) => {
      const current = await tx.get(ref);
      if (current.data()?.token !== job.token) return;
      const logRef = validId(job.logId) ? this.db.doc(`tenants/${job.tenantId}/sms_logs/${job.logId}`) : null;
      const lockRef = this.db.doc(`tenants/${job.tenantId}/reminder_locks/${job.lockKey}`);
      const [log,lock] = await Promise.all([logRef ? tx.get(logRef) : null,tx.get(lockRef)]);
      const attention = job.checks >= DELIVERY_MAX_CHECKS || this.now()-job.createdAt >= MAX_AGE_MS;
      const reason = attention ? 'לא ניתן לאמת מסירה אצל הספק; נדרשת בדיקה ידנית' : null;
      tx.update(ref,{token:null,lookupError:message,attention,attentionReason:reason,
        nextCheckAt:attention ? null : this.now()+delays[Math.min(job.checks,delays.length-1)]});
      if (log?.exists) tx.update(logRef,{deliveryLookupError:message,deliveryAttention:attention,deliveryAttentionReason:reason});
      if (attention && lock.exists && lock.data()?.providerMessageId===job.messageId) tx.update(lockRef,{deliveryAttention:true,deliveryAttentionReason:reason});
    });
  }
  async run(limit = 20, budgetMs = 30_000) {
    if (this.running || this.now() < this.pausedUntil || this.now() < this.nextRunAt) return {checked:0,skipped:true};
    this.running = true;
    this.nextRunAt = this.now()+60_000;
    let checked = 0; let failures = 0;
    const deadline = this.now()+budgetMs;
    try {
      const due = await this.db.collection(DELIVERY_JOBS).where('nextCheckAt','<=',this.now()).orderBy('nextCheckAt').limit(limit).get();
      for (const snap of due.docs) {
        if (this.now() >= deadline || this.now() < this.pausedUntil) break;
        const job = await this.claim(snap.ref);
        if (!job) continue;
        try {
          const adapter = await this.provider(job.tenantId,job.provider);
          const result = await adapter.lookup(job.messageId,job.expectedPhone);
          await this.recordResult(job.tenantId,job.lockKey,job.messageId,job.provider,result,job.logId,job.token);
        } catch (error) { failures++; await this.failedLookup(snap.ref,job,error); }
        checked++;
      }
      return {checked,failures};
    } finally { this.running = false; }
  }
}

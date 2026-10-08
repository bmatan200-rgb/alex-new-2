import { randomUUID } from 'node:crypto';
import { israelClock, validTime } from './core';

export type ReminderType = 'today' | '1day';
export const SCHEDULE_COLLECTION = 'sms_schedules';
export const MAX_RUN_ATTEMPTS = 5;
export const MAX_MESSAGE_ATTEMPTS = 3;
export const RUN_LEASE_MS = 120_000;
export const MESSAGE_LEASE_MS = 120_000;

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Convert a business's local wall clock to UTC, including Jerusalem DST.
// At a DST gap choose the first real local minute after the requested time.
export function localReminderTime(date: string, time: string): number {
  const desired = `${date} ${time}`;
  const base = Date.parse(`${date}T${time}:00Z`);
  for (let offset = 180; offset >= 120; offset -= 60) {
    const candidate = base - offset * 60_000;
    const local = israelClock(new Date(candidate));
    if (`${local.dateIso} ${local.timeStr}` === desired) return candidate;
  }
  for (let candidate = base - 180 * 60_000; candidate <= base; candidate += 60_000) {
    const local = israelClock(new Date(candidate));
    if (`${local.dateIso} ${local.timeStr}` >= desired) return candidate;
  }
  throw new Error('Cannot resolve local reminder time');
}

export function scheduleId(tenantId: string, type: ReminderType) { return `${tenantId}_${type}`; }
export function reminderTime(settings: any, type: ReminderType): string {
  const time = type === 'today' ? settings.morningReminderTime : settings.eveningReminderTime;
  return validTime(time) ? time : type === 'today' ? '08:00' : '20:00';
}

export function schedulePatch(tenantId: string, type: ReminderType, settings: any, active: boolean, old: any, now: number) {
  const enabled = active && settings.enabled !== false && settings.autoSendEnabled !== false
    && (type === 'today' ? settings.notifyCustomerToday !== false : settings.notifyCustomer1DayBefore !== false);
  const time = reminderTime(settings, type);
  const fingerprint = JSON.stringify([enabled, time, type === 'today'
    ? settings.morningTemplate || settings.customerTodayTemplate || ''
    : settings.eveningTemplate || settings.customer1DayTemplate || '']);
  if (old?.fingerprint === fingerprint) return null;
  const today = israelClock(new Date(now)).dateIso;
  const runDate = old?.lastCompletedRunDate >= today ? addDays(old.lastCompletedRunDate, 1) : today;
  return { tenantId, type, fingerprint, time, settings, enabled, runDate,
    targetDate: type === 'today' ? runDate : addDays(runDate, 1),
    nextRunAt: enabled ? localReminderTime(runDate, time) : null,
    attempts: 0, processingToken: null, revision: randomUUID(), updatedAt: now,
    lastCompletedRunDate: old?.lastCompletedRunDate || null,
    attention: old?.attention || false, lastRun: old?.lastRun || null };
}

export interface DispatchResult {
  success?: boolean; retryable?: boolean; quotaExceeded?: boolean; pending?: boolean;
  retryAt?: number; attention?: boolean; error?: string; sentCount?: number; failedCount?: number;
}

export class DurableReminderScheduler {
  constructor(private db: any,
    private loadSettings: (tenantId: string, tx?: any) => Promise<any>,
    private dispatch: (date: string, type: ReminderType, tenantId: string, settings: any, deadline: number, guard: {ref:any;revision:string;token:string}) => Promise<DispatchResult>,
    private clock = () => Date.now()) {}

  private reconciledUntil = 0;
  async syncTenant(tenantId: string, settings?: any, active?: boolean) {
    const refs = (['today', '1day'] as const).map(type => this.db.collection(SCHEDULE_COLLECTION).doc(scheduleId(tenantId, type)));
    await this.db.runTransaction(async (tx: any) => {
      const config = settings || await this.loadSettings(tenantId, tx);
      const tenant = active === undefined ? await tx.get(this.db.doc(`tenants/${tenantId}`)) : null;
      const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
      const isActive = active ?? (tenant?.exists && ['active','trial'].includes(tenant.data()?.status));
      refs.forEach((ref, index) => {
        const patch = schedulePatch(tenantId, index === 0 ? 'today' : '1day', config, isActive, snapshots[index].data(), this.clock());
        if (patch) tx.set(ref, patch, { merge: true });
      });
    });
  }

  // One durable discovery pass per day, rather than rereading all businesses
  // every 15 minutes. All app settings/status mutations update schedules directly.
  async reconcile() {
    const now = this.clock();
    if (this.reconciledUntil > now) return;
    const ref = this.db.doc('sms_scheduler_control/discovery');
    const token = randomUUID();
    const claimed = await this.db.runTransaction(async (tx: any) => {
      const snap = await tx.get(ref); const value = snap.data() || {};
      if (value.nextReconcileAt > now) { this.reconciledUntil = value.nextReconcileAt; return false; }
      if (value.leaseUntil > now) return false;
      tx.set(ref, { token, leaseUntil: now + 10 * 60_000 }, { merge: true }); return true;
    });
    if (!claimed) return;
    try {
      let cursor: any;
      for (;;) {
        let query = this.db.collection('tenants').orderBy('__name__').limit(100);
        if (cursor) query = query.startAfter(cursor);
        const snap = await query.get();
        for (const tenant of snap.docs) await this.syncTenant(tenant.id);
        if (snap.size < 100) break;
        cursor = snap.docs[snap.docs.length - 1];
        await this.db.runTransaction(async (tx:any)=>{
          const current=await tx.get(ref);
          if(current.data()?.token!==token) throw new Error('Discovery lease changed');
          tx.update(ref,{leaseUntil:this.clock()+10*60_000});
        });
      }
      const next = this.clock() + 24 * 60 * 60_000;
      await this.db.runTransaction(async (tx:any)=>{
        const current=await tx.get(ref);
        if(current.data()?.token!==token) throw new Error('Discovery lease changed');
        tx.update(ref,{token:null,leaseUntil:0,nextReconcileAt:next,completedAt:this.clock()});
      });
      this.reconciledUntil = next;
    } catch (error) {
      await this.db.runTransaction(async (tx:any)=>{
        const current=await tx.get(ref);
        if(current.data()?.token===token) tx.update(ref,{token:null,leaseUntil:0});
      }).catch(()=>{});
      throw error;
    }
  }

  async run(options: { limit?: number; budgetMs?: number } = {}) {
    const limit = Math.max(1, Math.min(options.limit || 20, 100));
    const deadline = this.clock() + (options.budgetMs || 45_000);
    await this.reconcile();
    const now = this.clock();
    const snap = await this.db.collection(SCHEDULE_COLLECTION).where('nextRunAt','<=',now).orderBy('nextRunAt').limit(limit).get();
    const results: any[] = []; let pending = snap.size === limit;
    for (const candidate of snap.docs) {
      if (this.clock() >= deadline) { pending = true; break; }
      const token = randomUUID();
      const schedule = await this.db.runTransaction(async (tx: any) => {
        const current = await tx.get(candidate.ref); const value = current.data();
        if (!value?.enabled || typeof value.nextRunAt !== 'number' || value.nextRunAt > this.clock()) return null;
        tx.update(candidate.ref, { processingToken: token, nextRunAt: this.clock() + RUN_LEASE_MS });
        return value;
      });
      if (!schedule) continue;
      const today = israelClock(new Date(this.clock())).dateIso;
      let result: DispatchResult;
      if (schedule.runDate < today) {
        result = { success: false, attention: true, error: 'Reminder window expired during downtime' };
      } else {
        try { result = await this.dispatch(schedule.targetDate, schedule.type, schedule.tenantId, schedule.settings, deadline, {ref:candidate.ref,revision:schedule.revision,token}); }
        catch (err: any) { result = { success: false, retryable: true, error: err?.message || 'Dispatch failed' }; }
      }
      await this.db.runTransaction(async (tx: any) => {
        const current = await tx.get(candidate.ref); const value = current.data();
        // A settings change invalidates the old worker's completion token.
        if (value?.processingToken !== token || value.revision !== schedule.revision) return;
        const attempts = (schedule.attempts || 0) + (result.retryable ? 1 : 0);
        const retry = (result.pending || result.retryable) && attempts < MAX_RUN_ATTEMPTS;
        const runDate = retry ? schedule.runDate : addDays(schedule.runDate, 1) < today ? today : addDays(schedule.runDate, 1);
        const nextRunAt = retry ? Math.max(this.clock() + (result.retryable ? Math.min(15 * 60_000, 60_000 * 2 ** (attempts - 1)) : 1000), result.retryAt || 0)
          : localReminderTime(runDate, schedule.time);
        const prior=schedule.lastRun?.runDate===schedule.runDate?schedule.lastRun:null;
        const needsAttention=Boolean(result.attention || (result.failedCount && !result.pending) || (result.retryable && !retry));
        tx.update(candidate.ref, { processingToken: null, nextRunAt, runDate,
          targetDate: schedule.type === 'today' ? runDate : addDays(runDate, 1),
          attempts: retry ? attempts : 0,
          lastCompletedRunDate: retry ? schedule.lastCompletedRunDate || null : schedule.runDate,
          attention: Boolean(schedule.attention || needsAttention),
          lastAttention: needsAttention ? {at:this.clock(),runDate:schedule.runDate,error:result.error || 'Reminder outcomes need manual review'} : schedule.lastAttention || null,
          lastRun: { at: this.clock(), runDate: schedule.runDate, success: result.success === true,
            sentCount: (prior?.sentCount || 0) + (result.sentCount || 0), failedCount: (prior?.failedCount || 0) + (result.failedCount || 0), error: result.error || null } });
        if (retry && !result.retryable && !result.retryAt) pending = true;
      });
      results.push({ tenantId: schedule.tenantId, type: schedule.type, ...result });
    }
    return { success: !results.some(x => x.quotaExceeded), pending, processed: results.length, results, checkedAt: new Date(this.clock()).toISOString() };
  }
}

export type ClaimDecision = 'claim' | 'wait' | 'accepted' | 'attention';
export function scheduledClaimDecision(lock: any, now: number): ClaimDecision {
  if (!lock) return 'claim';
  if (lock.status === 'sent' || lock.status === 'queued') return 'accepted';
  // Preserve every historical/manual lock; their outcome may be ambiguous.
  if (lock.schedulerVersion !== 39) return 'attention';
  if (lock.status === 'prepared') return lock.leaseUntil > now ? 'wait' : 'claim';
  if (lock.status === 'retry_pending' && (lock.attempts || 0) < MAX_MESSAGE_ATTEMPTS) return lock.retryAt > now ? 'wait' : 'claim';
  return lock.status === 'sending' && lock.leaseUntil > now ? 'wait' : 'attention';
}

export async function claimScheduledMessage(db: any, ref: any, legacyRefs: any[] = [], now = Date.now()) {
  const token = randomUUID();
  return db.runTransaction(async (tx: any) => {
    const current = await tx.get(ref); const lock = current.data();
    let decision = scheduledClaimDecision(lock, now);
    if (!lock) {
      const old = await Promise.all(legacyRefs.map(r => tx.get(r)));
      const existing=old.filter(s=>s.exists);
      if(existing.length) decision=existing.every(s=>['sent','queued'].includes(s.data()?.status))?'accepted':'attention';
    }
    if (decision !== 'claim') return { decision, retryAt: lock?.retryAt || lock?.leaseUntil || 0 };
    tx.set(ref, { schedulerVersion: 39, status: 'prepared', token, attempts: lock?.attempts || 0,
      leaseUntil: now + MESSAGE_LEASE_MS, claimedAt: new Date(now).toISOString() }, { merge: true });
    return { decision, token, attempts: lock?.attempts || 0, retryAt: 0 };
  });
}

export async function beginScheduledSend(db: any, ref: any, token: string, now = Date.now(), guard?: {ref:any;revision:string;token:string}) {
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref); const lock = snap.data();
    if(guard){
      const schedule=(await tx.get(guard.ref)).data();
      if(!schedule?.enabled || schedule.revision!==guard.revision || schedule.processingToken!==guard.token) return false;
    }
    if (lock?.status !== 'prepared' || lock.token !== token) return false;
    tx.update(ref, { status: 'sending', attempts: (lock.attempts || 0) + 1, leaseUntil: now + MESSAGE_LEASE_MS });
    return true;
  });
}

// A paced gateway limits provider bursts. Failed operations cannot poison the tail.
export class SmsPacer {
  private tail: Promise<void> = Promise.resolve(); private nextAt = 0;
  constructor(private intervalMs: number, private clock = () => Date.now(), private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {}
  async wait() {
    const slot = this.tail.then(async () => {
      const delay = Math.max(0, this.nextAt - this.clock());
      if (delay) await this.sleep(delay);
      this.nextAt = this.clock() + this.intervalMs;
    });
    this.tail = slot.catch(() => {}); await slot;
  }
}

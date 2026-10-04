import { createHash } from 'node:crypto';
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
export const validTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
export function phoneDigits(p: unknown) {
  let s = typeof p === 'string' ? p.replace(/\D/g, '') : '';
  if(s.startsWith('00972')) s = s.slice(2);
  if(s.startsWith('9720')) s = '972' + s.slice(4);
  if(s.startsWith('0')) s = '972' + s.slice(1);
  if(/^[2-9]\d{7,8}$/.test(s)) s = '972' + s;
  return /^972[2-9]\d{7,8}$/.test(s) ? s : '';
}
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
export const reminderKey = (kind: string, phone: string, date: string) => `${kind === 'today' ? 'morning' : 'evening'}_${phoneDigits(phone)}_${date}`;
export const overlaps = (a: any, b: any) => a.status !== 'cancelled' && a.appointment_date === b.appointment_date && a.start_time < b.end_time && a.end_time > b.start_time;
export function israelClock(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jerusalem', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  const dateIso = `${p.year}-${p.month}-${p.day}`;
  const tomorrow = new Date(dateIso + 'T12:00:00Z'); tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  return {dateIso, tomorrowIso:tomorrow.toISOString().slice(0,10),hour:Number(p.hour),minute:Number(p.minute),timeStr:`${p.hour}:${p.minute}`};
}
export function parseFirebaseServiceAccount(rawValue?: string) {
  if (!rawValue?.trim()) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
  let parsed: any;
  for(const raw of [rawValue.trim(), Buffer.from(rawValue.trim(),'base64').toString('utf8')]) {
    try { parsed=JSON.parse(raw); if(typeof parsed==='string') parsed=JSON.parse(parsed); } catch {continue;}
    if(parsed && typeof parsed==='object' && !Array.isArray(parsed)) break;
  }
  if(!parsed || !['project_id','client_email','private_key'].every(k=>typeof parsed[k]==='string' && parsed[k].trim())) throw new Error('Invalid service account: project_id/client_email/private_key required');
  return {...parsed,private_key:parsed.private_key.replace(/\\n/g,'\n')};
}
export function authorizeTenant(admin: {role:string;tenantId?:string}, selectors: unknown[], fallback: string) {
  const supplied=selectors.filter(v=>v!==undefined && v!==null && v!=='');
  if(supplied.some(v=>!validId(v))) throw new Error('Invalid tenant ID');
  if(new Set(supplied).size>1) throw new Error('Conflicting tenant selectors');
  if(admin.role==='business_admin') {
    if(!validId(admin.tenantId) || supplied.some(v=>v!==admin.tenantId)) throw new Error('אין הרשאה לעסק אחר');
    return admin.tenantId;
  }
  return String(supplied[0] || fallback);
}
export const publicSettings = (data: any) => Object.fromEntries(Object.entries(data || {}).filter(([k])=>!/(key|token|secret|password|webhook|instanceId)/i.test(k)));
export async function claimOnce(db: any, ref: any, legacyRefs: any[] = []) {
  return db.runTransaction(async (tx: any) => {
    const snapshots = await Promise.all([ref,...legacyRefs].map(r=>tx.get(r)));
    if(snapshots.some(s=>s.exists)) return false;
    tx.create(ref,{status:'in_progress',claimedAt:new Date().toISOString()});
    return true;
  });
}
export async function copyOnce(db:any, source:any, target:any, marker:any, transform=(x:any)=>x) {
  return db.runTransaction(async(tx:any)=>{
    const [done,existing]=await Promise.all([tx.get(marker),tx.get(target)]);
    if(done.exists) return false;
    if(!existing.exists) tx.create(target,transform(source));
    tx.create(marker,{completedAt:new Date().toISOString()});
    return !existing.exists;
  });
}

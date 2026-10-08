import { classifySmsFailure } from '../smsDeliveryPolicy';
import { phoneDigits } from '../core';

// Scheduler/locks depend on this contract, never on a vendor HTTP payload.
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'unconfirmed' | 'unknown';
export interface DeliveryResult { status: DeliveryStatus; providerStatus: string; errorMessage: string | null; }
export interface SmsSendResult {
  success: boolean; error?: string; uncertain?: boolean; retryable?: boolean; retryAfterMs?: number;
  deferred?: boolean; lostClaim?: boolean; rateLimited?: boolean;
  data?: { id: string; provider: string; to: string; from: string; status: DeliveryStatus; providerStatus: string; errorMessage: string | null };
}
export interface SmsProvider {
  readonly id: string;
  send(to: string, text: string): Promise<SmsSendResult>;
  lookup(id: string, expectedPhone: string): Promise<DeliveryResult>;
}
export class SmsProviderError extends Error {
  constructor(message: string, readonly statusCode = 502) { super(message); }
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const statuses: Record<string, DeliveryStatus> = {
  queued: 'queued', sending: 'sending', sent: 'sent', delivered: 'delivered',
  sending_failed: 'failed', delivery_failed: 'failed', expired: 'failed', delivery_unconfirmed: 'unconfirmed',
};
function errorDetails(errors: any): string | null {
  if (!Array.isArray(errors)) return null;
  return errors.slice(0,3).map(e => [text(String(e?.code || '')), text(e?.detail) || text(e?.title)].filter(Boolean).join(': ').slice(0,500)).filter(Boolean).join('; ') || null;
}
export function normalizeTelnyxDelivery(data: any, expectedPhone: string, strict = false): DeliveryResult {
  const recipients = Array.isArray(data?.to) ? data.to : [];
  const recipient = recipients.find((r: any) => phoneDigits(r?.phone_number) === phoneDigits(expectedPhone));
  if (strict && (!phoneDigits(expectedPhone) || !recipient || data?.direction !== 'outbound')) {
    throw new SmsProviderError('תשובת הספק אינה תואמת להודעה ולנמען המבוקשים');
  }
  // Sending responses occasionally omit phone_number. Never treat missing status as delivered.
  const raw = text((recipient || (!strict && recipients.length === 1 ? recipients[0] : null))?.status);
  return { status: statuses[raw] || 'unknown', providerStatus: raw || 'unknown', errorMessage: errorDetails(data?.errors) };
}

export class TelnyxProvider implements SmsProvider {
  readonly id = 'telnyx';
  constructor(private config: {apiKey: string; from: string; profileId: string}, private http: typeof fetch = (input,init) => fetch(input,init)) {}
  async send(to: string, message: string): Promise<SmsSendResult> {
    const {apiKey, from, profileId} = this.config;
    if (!apiKey || !from || !profileId) return {success:false,error:'חסרות הגדרות ספק SMS בשרת'};
    try {
      const response = await this.http('https://api.telnyx.com/v2/messages', {
        method:'POST', headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({to,text:message,from,messaging_profile_id:profileId}), signal:AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(()=>({}));
      const id = text(body?.data?.id);
      // An ID in an error response must not be discarded: the provider may have accepted it.
      if (!response.ok && id) {
        const delivery=normalizeTelnyxDelivery(body.data,to);
        return {success:true,uncertain:true,data:{id,provider:this.id,to,from,...delivery}};
      }
      if (!response.ok) return {success:false,rateLimited:response.status===429,...classifySmsFailure(response.status,body,response.headers.get('retry-after')),
        error:`Telnyx: ${errorDetails(body?.errors) || `HTTP ${response.status}`}`};
      if (!id) return {success:false,uncertain:true,error:'הספק החזיר תשובה ללא מזהה הודעה; נדרשת בדיקה לפני שליחה חוזרת'};
      const delivery = normalizeTelnyxDelivery(body.data,to);
      // success means accepted by the provider, even when a terminal delivery failure is already returned.
      // Keep the accepted ID and do not let a delivery failure reopen deduplication locks.
      return {success:true,data:{id,provider:this.id,to,from,...delivery}};
    } catch {
      return {success:false,uncertain:true,error:'תשובת הספק לא התקבלה בוודאות. ההודעה עשויה להישלח; אין לשלוח שוב ללא בדיקה'};
    }
  }
  async lookup(id: string, expectedPhone: string): Promise<DeliveryResult> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new SmsProviderError('מזהה הודעה לא תקין',400);
    if (!this.config.apiKey) throw new SmsProviderError('חסר מפתח לספק המקורי של ההודעה',400);
    let response: Response;
    try { response = await this.http(`https://api.telnyx.com/v2/messages/${encodeURIComponent(id)}`,{
      method:'GET',headers:{Authorization:`Bearer ${this.config.apiKey}`},signal:AbortSignal.timeout(10000),
    }); } catch { throw new SmsProviderError('לא ניתן לבדוק כרגע את הספק. סטטוס המסירה הקודם נשמר'); }
    if (!response.ok) {
      const errors: Record<number,string> = {
        404:'ההודעה לא נמצאה אצל הספק. ייתכן שחלפו יותר מעשרה ימים או שפרטי החשבון השתנו',
        401:'הספק דחה את ההרשאה לבדיקת ההודעה',403:'אין הרשאה אצל הספק לבדיקת ההודעה',429:'הספק מגביל בדיקות כרגע. נסה שוב מאוחר יותר',
      };
      throw new SmsProviderError(errors[response.status] || 'בדיקת המסירה נכשלה אצל הספק; הסטטוס הקודם נשמר',response.status===429?429:502);
    }
    const body = await response.json().catch(()=>null);
    if (body?.data?.id !== id) throw new SmsProviderError('הספק החזיר מזהה הודעה שונה');
    return normalizeTelnyxDelivery(body.data,expectedPhone,true);
  }
}

// Add a future Inforu adapter here after verifying its acceptance, lookup and retry semantics.
// Unsupported providers fail closed; never silently send through a different account/provider.
export function createSmsProvider(id: string, privateSettings: any, shared: boolean, env: NodeJS.ProcessEnv = process.env, http?: typeof fetch): SmsProvider {
  if (id !== 'telnyx') throw new SmsProviderError('ספק SMS זה עדיין אינו מחובר למערכת',400);
  const config = privateSettings.providers?.telnyx || privateSettings;
  return new TelnyxProvider({
    apiKey:text(config.telnyxApiKey) || (shared?text(env.TELNYX_API_KEY):''),
    from:text(config.telnyxFromNumber) || text(config.telnyxFrom) || (shared?text(env.TELNYX_FROM_NUMBER) || text(env.TELNYX_FROM):''),
    profileId:text(config.telnyxProfileId) || (shared?text(env.TELNYX_PROFILE_ID):''),
  },http);
}

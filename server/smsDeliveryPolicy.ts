// A provider request can be retried automatically only when it was explicitly
// rejected for rate limiting without returning an accepted message ID.
export function classifySmsFailure(status:number,data:any,retryAfter:string|null){
  const acceptedId=Boolean(data?.data?.id);
  const seconds=Number(retryAfter);
  return {uncertain:status>=500 || acceptedId,retryable:status===429 && !acceptedId,
    retryAfterMs:Number.isFinite(seconds)?Math.min(3_600_000,Math.max(60_000,seconds*1000)):60_000};
}
export function scheduledRetryAt(result:{uncertain?:boolean;retryable?:boolean;retryAfterMs?:number},attempts:number,maxAttempts:number,now:number){
  return !result.uncertain && result.retryable && attempts>0 && attempts<maxAttempts
    ? now+Math.max(result.retryAfterMs || 60_000,60_000*2**(attempts-1)):0;
}

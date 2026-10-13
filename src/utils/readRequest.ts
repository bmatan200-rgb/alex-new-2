export class HttpFailure extends Error {
  constructor(message:string,public status:number){super(message);}
}
export const isAccessDenied=(error:unknown)=>error instanceof HttpFailure && [401,403].includes(error.status);
// Only use for read requests: never replay a booking, deletion or other mutation.
export async function readJson(url:string,init:RequestInit={},attempts=3):Promise<any>{
  for(let attempt=0;;attempt++){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(url,{...init,signal:controller.signal,cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok || !data?.success)throw new HttpFailure(data?.error||'החיבור לשרת אינו זמין כרגע',response.status);
      return data;
    }catch(error){
      const retryable=!(error instanceof HttpFailure)||error.status>=500||error.status===429;
      if(!retryable||attempt+1>=attempts)throw error;
    }finally{clearTimeout(timer);}
    await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auth,tenantApi,addAppointmentToFirestore,cancelAppointmentInFirestore} from '../src/lib/firebase';

test('real client booking/list/cancel stay customer operations with an admin session in the same browser',async()=>{
  const values=new Map<string,string>();
  const originalFetch=globalThis.fetch;
  const originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const originalUser=Object.getOwnPropertyDescriptor(auth,'currentUser');
  const originalReady=auth.authStateReady;
  let tokenReads=0;
  const requests:any[]=[];
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
  Object.defineProperty(auth,'currentUser',{configurable:true,value:{getIdToken:async()=>{tokenReads++;return 'owner-A-token';}}});
  auth.authStateReady=async()=>{};
  globalThis.fetch=async(path:any,options:any)=>{
    requests.push({path,headers:options.headers,body:JSON.parse(options.body || '{}')});
    const tenant=options.headers['x-tenant-id'];
    return new Response(JSON.stringify({success:true,id:'booking-'+tenant,accessToken:'capability-'+tenant}),{status:200});
  };
  try {
    for(const tenant of ['business_a','business_b','future_tenant']) {
      await tenantApi('/api/appointments/list',{},tenant);
      const id=await addAppointmentToFirestore({customer_name:'Customer'} as any,tenant);
      await cancelAppointmentInFirestore(id,undefined,undefined,undefined,tenant);
      const cancel=requests.at(-1);
      assert.equal(cancel.body.accessToken,'capability-'+tenant);
      assert.equal(cancel.body.tenantId,tenant);
    }
    assert.equal(tokenReads,0);
    for(const r of requests){assert.equal(r.headers.Authorization,undefined);assert.equal(r.headers['x-operation-context'],'customer');}
    await tenantApi('/api/appointments/list',{},'business_a',{auth:'required'});
    assert.equal(requests.at(-1).headers.Authorization,'Bearer owner-A-token');
    assert.equal(requests.at(-1).headers['x-operation-context'],'admin');
    await cancelAppointmentInFirestore('admin-booking',undefined,undefined,undefined,'business_a','required');
    assert.equal(requests.at(-1).headers['x-operation-context'],'admin');
    Object.defineProperty(auth,'currentUser',{configurable:true,value:null});
    await assert.rejects(tenantApi('/api/appointments/list',{},'business_a',{auth:'required'}),/נדרשת התחברות/);
  } finally {
    globalThis.fetch=originalFetch;auth.authStateReady=originalReady;
    if(originalUser)Object.defineProperty(auth,'currentUser',originalUser);
    if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete (globalThis as any).localStorage;
  }
});

test('customer header and route cannot receive admin links or reuse management appointment state',()=>{
  const header=readFileSync('src/components/Header.tsx','utf8');
  assert.doesNotMatch(header,/adminSession|onGoToAdmin|חזרה לניהול|מעבר לניהול/);
  const app=readFileSync('src/App.tsx','utf8');
  assert.match(app,/key=\{`\$\{tenantId\}:\$\{mode\}`\}/);
  assert.doesNotMatch(app,/setAppointments\(getStoredAppointments\(\)\)/);
  assert.match(app,/adminAuthReady && adminSession\?\.isAdmin/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { TelnyxProvider, createSmsProvider, normalizeTelnyxDelivery } from '../server/sms/providers';
import { legacyLogLockKey, mergeDeliveryResult } from '../server/sms/logs';
import { smsDeliveryView } from '../src/utils/smsDeliveryView';
import { hash, reminderKey } from '../server/core';
const to='+972543111409';
const config={apiKey:'test-secret',from:'TEST',profileId:'profile'};
const payload=(status:string)=>({data:{id:'msg_1',direction:'outbound',to:[{phone_number:to,status}],errors:[]}});
const reply=(body:any,status=200)=>new Response(JSON.stringify(body),{status});

test('acceptance is queued, provider metadata survives, payload stays compatible',async()=>{
 let calls=0;
 const p=new TelnyxProvider(config,async(input,init)=>{
  calls++;assert.equal(input,'https://api.telnyx.com/v2/messages');assert.equal(init?.method,'POST');
  assert.deepEqual(JSON.parse(String(init?.body)),{to,text:'שלום',from:'TEST',messaging_profile_id:'profile'});
  return reply(payload('queued'));
 });
 const r=await p.send(to,'שלום');assert.equal(calls,1);assert.equal(r.success,true);
 assert.equal(r.data?.provider,'telnyx');assert.equal(r.data?.status,'queued');assert.equal(r.data?.id,'msg_1');
 assert.equal(smsDeliveryView(r.data!.status).tone,'pending');
});
test('delivery states stay distinct; only confirmed delivery is green',()=>{
 for(const status of ['queued','sending','sent','delivery_unconfirmed','new_status']){
  const d=normalizeTelnyxDelivery(payload(status).data,to,true);
  assert.notEqual(d.status,'delivered');assert.equal(smsDeliveryView(d.status).tone,'pending');
 }
 assert.equal(normalizeTelnyxDelivery(payload('delivered').data,to,true).status,'delivered');
 for(const status of ['delivery_failed','sending_failed','expired']) assert.equal(normalizeTelnyxDelivery(payload(status).data,to,true).status,'failed');
});
test('lookup is GET-only, validates recipient and ID, surfaces error code',async()=>{
 const p=new TelnyxProvider(config,async(input,init)=>{
  assert.equal(String(input),'https://api.telnyx.com/v2/messages/msg_1');assert.equal(init?.method,'GET');assert.equal(init?.body,undefined);
  return reply({...payload('delivery_failed'),data:{...payload('delivery_failed').data,errors:[{code:'40002',detail:'Carrier rejected'}]}});
 });
 const r=await p.lookup('msg_1',to);assert.equal(r.status,'failed');assert.match(r.errorMessage!,/40002.*Carrier rejected/);
 await assert.rejects(p.lookup('msg_1','0501234567'),/תואמת/);
 const mismatch=new TelnyxProvider(config,async()=>reply(payload('delivered')));
 await assert.rejects(mismatch.lookup('different',to),/מזהה/);
});
test('lookup transport, authentication, malformed and 404 errors never become delivery failures',async()=>{
 for(const status of [401,403,404,429,500]) {
  const p=new TelnyxProvider(config,async()=>reply({},status));await assert.rejects(p.lookup('msg_1',to));
 }
 const p=new TelnyxProvider(config,async()=>{throw new Error('network');});await assert.rejects(p.lookup('msg_1',to));
 await assert.rejects(new TelnyxProvider(config,async()=>reply({})).lookup('msg_1',to));
});
test('explicit 429 rejection retries safely; timeout/5xx/missing ID remain uncertain',async()=>{
 const limited=await new TelnyxProvider(config,async()=>reply({},429)).send(to,'test');assert.equal(limited.retryable,true);assert.equal(limited.rateLimited,true);
 for(const http of [async()=>reply({},500),async()=>reply({}),async()=>{throw new Error('lost');}]) {
  const r=await new TelnyxProvider(config,http).send(to,'test');assert.equal(r.success,false);assert.equal(r.uncertain,true);
 }
 const acceptedFailure=await new TelnyxProvider(config,async()=>reply(payload('delivery_failed'))).send(to,'test');
 assert.equal(acceptedFailure.success,true);assert.equal(acceptedFailure.data?.status,'failed');assert.equal(acceptedFailure.retryable,undefined);
});
test('legacy exact locks recover test and batch messages without provider-wide search',()=>{
 const log={recipientPhone:to,messageText:'בדיקה',reminderType:'test',sentAt:'2026-10-08T13:45:10Z'};
 assert.equal(legacyLogLockKey(log),'manual_'+hash(JSON.stringify(['972543111409','בדיקה','2026-10-08'])));
 assert.equal(legacyLogLockKey({...log,reminderType:'morning_today',appointmentDate:'2026-10-08'}),reminderKey('today',to,'2026-10-08'));
 assert.equal(legacyLogLockKey({...log,sentAt:'invalid'}),null);
 assert.equal(legacyLogLockKey({...log,reminderType:'booking'}),null);
});
test('provider changes do not reroute historical lookups, private credentials stay scoped',async()=>{
 const env={SMS_PROVIDER:'inforu',TELNYX_API_KEY:'old-telnyx',TELNYX_FROM:'TEST',TELNYX_PROFILE_ID:'old-profile'};
 let key='';const http:typeof fetch=async(_input,init)=>{key=(init?.headers as any).Authorization;return reply(payload('delivered'));};
 await createSmsProvider('telnyx',{provider:'inforu'},true,env,http).lookup('msg_1',to);assert.equal(key,'Bearer old-telnyx');
 await assert.rejects(createSmsProvider('telnyx',{},false,env,http).lookup('msg_1',to),/חסר מפתח/);
 assert.throws(()=>createSmsProvider('inforu',{},true,env,http),/עדיין אינו מחובר/);
 await createSmsProvider('telnyx',{providers:{telnyx:{telnyxApiKey:'private'}}},false,env,http).lookup('msg_1',to);assert.equal(key,'Bearer private');
});

test('late pending lookup cannot overwrite terminal status',()=>{
 assert.equal(mergeDeliveryResult({status:'delivered'},{status:'queued'}).status,'delivered');
 assert.equal(mergeDeliveryResult({status:'failed',errorMessage:'rejected'},{status:'sent'}).errorMessage,'rejected');
 assert.equal(mergeDeliveryResult({status:'failed'},{status:'delivered'}).status,'delivered');
});

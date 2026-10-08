import test from 'node:test';
import assert from 'node:assert/strict';
import { DeliveryTracker, DELIVERY_JOBS, DELIVERY_MAX_CHECKS } from '../server/sms/deliveryTracker';
import { MemoryFirestore } from './helpers/memoryFirestore';
import { SmsProviderError } from '../server/sms/providers';

function fixture() {
 let now=Date.parse('2026-10-08T12:00:00Z');
 const db=new MemoryFirestore();let calls=0;
 let lookup:any=async()=>({status:'queued',providerStatus:'queued',errorMessage:null});
 const requested:Array<string[]>=[];
 const adapter:any={send:()=>{throw new Error('Delivery tracker must NEVER send SMS');},lookup:async(id:string,phone:string)=>{calls++;return lookup(id,phone);}};
 const resolve=async(tenant:string,provider:string)=>{requested.push([tenant,provider]);return adapter;};
 const worker=()=>new DeliveryTracker(db,resolve,()=>now);
 const tracker=worker();
 function add(tenant='a',id='message_1',status='queued') {
  const lockKey='lock_'+id;const data={id,provider:'telnyx',to:'+972543111409',status,providerStatus:status,errorMessage:status==='failed'?'carrier rejected':null};
  const ref=tracker.jobRef(tenant,lockKey,id);
  db.put(ref,tracker.acceptedJob(tenant,lockKey,data));
  db.put(db.doc(`tenants/${tenant}/reminder_locks/${lockKey}`),{status:'sent',providerMessageId:id});
  db.put(db.doc(`tenants/${tenant}/sms_logs/${id}`),{id,recipientPhone:data.to,status,sentAt:new Date(now).toISOString()});
  return {tenant,id,lockKey,ref};
 }
 return {db,tracker,worker,add,requested,advance:(ms:number)=>now+=ms,setLookup:(fn:any)=>lookup=fn,get calls(){return calls;},get now(){return now;}};
}
const result=(status:string)=>({status,providerStatus:status,errorMessage:status==='failed'?'40002: rejected':null});

test('restart recovers due jobs, records delivery in tenant log and preserves send lock',async()=>{
 const h=fixture(),j=h.add();await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);
 h.advance(60_000);h.setLookup(async()=>result('delivered'));
 assert.equal((await h.worker().run()).checked,1);
 assert.equal(h.db.values.get('tenants/a/sms_logs/message_1').status,'delivered');
 assert.equal(h.db.values.get('tenants/a/reminder_locks/lock_message_1').status,'sent');
 assert.equal(h.db.values.get(j.ref.path).nextCheckAt,null);
 h.advance(60_000);await h.worker().run();assert.equal(h.calls,1);
 assert.deepEqual(h.requested,[['a','telnyx']]);
});

test('competing worker leases prevent duplicate lookups across server instances',async()=>{
 const h=fixture();h.add();h.advance(60_000);
 await Promise.all([h.worker().run(),h.worker().run()]);assert.equal(h.calls,1);
});

test('failed delivery is visible for review and never reopens the send lock',async()=>{
 const h=fixture(),j=h.add();await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);
 h.advance(60_000);h.setLookup(async()=>result('failed'));await h.tracker.run();
 const log=h.db.values.get('tenants/a/sms_logs/message_1');
 assert.equal(log.status,'failed');assert.equal(log.deliveryAttention,true);assert.match(log.deliveryAttentionReason,/40002/);
 assert.equal(h.db.values.get('tenants/a/reminder_locks/lock_message_1').status,'sent');
 assert.equal(h.db.values.get(j.ref.path).nextCheckAt,null);
});

test('provider errors preserve delivery status and stop with attention after bounded attempts',async()=>{
 const h=fixture(),j=h.add();await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);
 h.setLookup(async()=>{throw new SmsProviderError('credentials rejected');});
 for(let i=0;i<DELIVERY_MAX_CHECKS;i++){h.advance(h.db.values.get(j.ref.path).nextCheckAt-h.now);await h.worker().run();}
 assert.equal(h.calls,DELIVERY_MAX_CHECKS);
 const log=h.db.values.get('tenants/a/sms_logs/message_1');assert.equal(log.status,'queued');assert.equal(log.deliveryAttention,true);
 assert.equal(log.deliveryLookupError,'credentials rejected');assert.equal(h.db.values.get(j.ref.path).nextCheckAt,null);
});

test('manual terminal result wins against an older in-flight automatic result',async()=>{
 const h=fixture(),j=h.add();await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);
 let release:any;let started:any;const began=new Promise(r=>started=r);
 h.setLookup(async()=>{started();return new Promise(r=>release=r);});h.advance(60_000);
 const running=h.tracker.run();await began;
 await h.tracker.recordResult(j.tenant,j.lockKey,j.id,'telnyx',result('delivered') as any,j.id);
 release(result('queued'));await running;
 assert.equal(h.db.values.get('tenants/a/sms_logs/message_1').status,'delivered');
 assert.equal(h.db.values.get(j.ref.path).nextCheckAt,null);
});

test('lease expiry recovers after process crash and late log creation gets last result',async()=>{
 const h=fixture(),j=h.add();
 h.db.put(j.ref,{token:'crashed_worker',nextCheckAt:Date.parse('2026-10-08T12:01:00Z'),checks:1},true);
 h.advance(60_000);h.setLookup(async()=>result('delivered'));await h.worker().run();
 await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);
 assert.equal(h.db.values.get('tenants/a/sms_logs/message_1').status,'delivered');
});

test('batch is bounded and no tenant or appointment collection is scanned',async()=>{
 const h=fixture();for(let i=0;i<50;i++)h.add('a','message_'+i);h.advance(60_000);
 assert.equal((await h.tracker.run()).checked,20);assert.equal(h.calls,20);assert.equal(h.db.tenantQueries,0);
 const active=[...h.db.values.keys()].filter(p=>p.startsWith(DELIVERY_JOBS+'/'));assert.equal(active.length,50);
 const reads=h.db.reads;await h.tracker.run();assert.equal(h.db.reads,reads);
});

test('429 pauses further lookups in the batch; no delivery state is changed to failed',async()=>{
 const h=fixture();h.add('a','one');h.add('b','two');h.advance(60_000);
 h.setLookup(async()=>{throw new SmsProviderError('rate limited',429);});
 assert.equal((await h.tracker.run()).checked,1);assert.equal(h.calls,1);
 assert.equal(h.db.values.get('tenants/a/sms_logs/one').status,'queued');
});

test('expired jobs after downtime surface attention in the journal without a provider call',async()=>{
 const h=fixture(),j=h.add();await h.tracker.attachLog(j.tenant,j.lockKey,j.id,j.id);h.advance(25*3_600_000);
 await h.tracker.run();assert.equal(h.calls,0);assert.equal(h.db.values.get(j.ref.path).nextCheckAt,null);
 assert.equal(h.db.values.get('tenants/a/sms_logs/message_1').deliveryAttention,true);
});

test('same provider ID in two businesses updates only each tenant journal',async()=>{
 const h=fixture(),a=h.add('a'),b=h.add('b');
 await h.tracker.attachLog(a.tenant,a.lockKey,a.id,a.id);await h.tracker.attachLog(b.tenant,b.lockKey,b.id,b.id);
 await h.tracker.recordResult(a.tenant,a.lockKey,a.id,'telnyx',result('delivered') as any,a.id);
 assert.equal(h.db.values.get('tenants/a/sms_logs/message_1').status,'delivered');
 assert.equal(h.db.values.get('tenants/b/sms_logs/message_1').status,'queued');
});

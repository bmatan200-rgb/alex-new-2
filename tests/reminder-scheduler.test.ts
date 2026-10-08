import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryFirestore} from './helpers/memoryFirestore';
import {DurableReminderScheduler,localReminderTime,schedulePatch,scheduleId,scheduledClaimDecision,claimScheduledMessage,beginScheduledSend,SmsPacer,MAX_RUN_ATTEMPTS} from '../server/reminderScheduler';
const settings={enabled:true,autoSendEnabled:true,notifyCustomerToday:true,notifyCustomer1DayBefore:true,morningReminderTime:'08:00',eveningReminderTime:'20:00'};
const date='2026-10-08';
function harness(initial=localReminderTime(date,'07:00'),dispatch:any=async()=>({success:true,sentCount:1})){
  let now=initial;const db=new MemoryFirestore();
  const load=async(id:string,tx?:any)=>((await (tx?tx.get(db.doc(`tenants/${id}/settings/sms_reminders`)):db.doc(`tenants/${id}/settings/sms_reminders`).get())).data() || settings);
  const worker=()=>new DurableReminderScheduler(db,load,dispatch,()=>now);
  const seed=async(id='business_a',config=settings)=>{await db.doc(`tenants/${id}`).set({status:'active'});await db.doc(`tenants/${id}/settings/sms_reminders`).set(config);};
  return {db,worker,seed,clock:()=>now,set:(n:number)=>{now=n;},advance:(n:number)=>{now+=n;}};
}
test('local times honor summer/winter offsets, 11:00 setting and DST transitions',()=>{
  assert.equal(new Date(localReminderTime(date,'08:00')).toISOString(),'2026-10-08T05:00:00.000Z');
  assert.equal(new Date(localReminderTime('2026-12-01','20:00')).toISOString(),'2026-12-01T18:00:00.000Z');
  assert.equal(new Date(localReminderTime(date,'11:00')).toISOString(),'2026-10-08T08:00:00.000Z');
  assert.equal(new Date(localReminderTime('2026-03-27','02:30')).toISOString(),'2026-03-27T00:00:00.000Z');
  assert.equal(new Date(localReminderTime('2026-10-25','01:30')).toISOString(),'2026-10-24T22:30:00.000Z');
});
test('changing 08 to 11 reschedules today; completed reminders do not send again',()=>{
  const old=schedulePatch('a','today',settings,true,null,localReminderTime(date,'07:00'));
  const moved=schedulePatch('a','today',{...settings,morningReminderTime:'11:00'},true,old,localReminderTime(date,'09:00'));
  assert.equal(moved!.nextRunAt,localReminderTime(date,'11:00'));
  const completed=schedulePatch('a','today',{...settings,morningReminderTime:'11:00'},true,{...old,lastCompletedRunDate:date},localReminderTime(date,'09:00'));
  assert.equal(completed!.runDate,'2026-10-09');
  assert.equal(schedulePatch('a','today',settings,false,old,Date.now())!.nextRunAt,null);
});
test('idle ticks do not rescan tenants or settings, including after restart',async()=>{
  const h=harness();await h.seed();await h.worker().run();const reads=h.db.reads,queries=h.db.tenantQueries;
  const w=h.worker();await w.run();await w.run();assert.equal(h.db.tenantQueries,queries);assert.equal(h.db.reads-reads,3); // one discovery check, two empty due queries
});
test('restart catches up due reminders and concurrent workers send once per tenant/type/day',async()=>{
  const calls:string[]=[];const h=harness(undefined,async(d:string,t:string,id:string)=>{calls.push(`${id}:${t}:${d}`);return {success:true,sentCount:1};});
  await h.seed();await h.worker().run();h.set(localReminderTime(date,'08:10'));
  await Promise.all([h.worker().run(),h.worker().run()]);assert.equal(calls.length,1);
  await h.worker().run();assert.equal(calls.length,1);
  h.set(localReminderTime(date,'20:00'));await h.worker().run();assert.equal(calls[1],'business_a:1day:2026-10-09');
});
test('infrastructure retries are backed off, capped and surfaced for review',async()=>{
  let calls=0;const h=harness(localReminderTime(date,'08:00'),async()=>{calls++;throw new Error('temporary database outage');});await h.seed();
  const w=h.worker();for(let i=0;i<MAX_RUN_ATTEMPTS;i++){
    await w.run();const queue=h.db.values.get(`sms_schedules/${scheduleId('business_a','today')}`);
    if(i<MAX_RUN_ATTEMPTS-1){const count=calls;await w.run();assert.equal(calls,count);h.set(queue.nextRunAt);}else{assert.equal(queue.attention,true);assert.equal(queue.runDate,'2026-10-09');}
  }
  assert.equal(calls,5);
});
test('overnight downtime never sends expired tomorrow text; current day still catches up',async()=>{
  const dates:string[]=[];const h=harness(undefined,async(d:string)=>{dates.push(d);return {success:true};});await h.seed();await h.worker().run();h.set(localReminderTime('2026-10-09','08:10'));
  const result=await h.worker().run();assert.ok(result.results.every(x=>x.attention));assert.equal(dates.length,0);
  await h.worker().run();assert.deepEqual(dates,['2026-10-09']);
});
test('a settings update while dispatch runs cannot be overwritten by stale completion',async()=>{
  const h=harness(localReminderTime(date,'08:00'));await h.seed();let w:any;
  w=new DurableReminderScheduler(h.db,async()=>settings,async()=>{await w.syncTenant('business_a',{...settings,morningReminderTime:'11:00'},true);return {success:true};},h.clock);
  await w.run();const s=h.db.values.get('sms_schedules/business_a_today');assert.equal(s.time,'11:00');assert.equal(s.nextRunAt,localReminderTime(date,'11:00'));
});
test('message leases recover pre-send crashes; sent, ambiguous and exhausted outcomes never resend',async()=>{
  const db=new MemoryFirestore(),ref=db.doc('tenants/a/reminder_locks/test'),now=1000000;
  const first=await claimScheduledMessage(db,ref,[],now);assert.equal(first.decision,'claim');
  assert.equal((await claimScheduledMessage(db,ref,[],now+1)).decision,'wait');
  const recovered=await claimScheduledMessage(db,ref,[],now+120001);assert.equal(recovered.decision,'claim');
  assert.equal(await beginScheduledSend(db,ref,first.token!,now+120002),false);
  assert.equal(await beginScheduledSend(db,ref,recovered.token!,now+120002),true);
  assert.equal((await claimScheduledMessage(db,ref,[],now+240003)).decision,'attention');
  for(const status of ['unknown','failed','sent','queued'])assert.notEqual(scheduledClaimDecision({schedulerVersion:39,status},now),'claim');
  assert.equal(scheduledClaimDecision({status:'in_progress'},now),'attention');
  assert.equal(scheduledClaimDecision({schedulerVersion:39,status:'retry_pending',attempts:3,retryAt:0},now),'attention');
});
test('safe retry states allow only three POST attempts; legacy uncertain locks stay blocked',async()=>{
  const db=new MemoryFirestore(),ref=db.doc('tenants/a/reminder_locks/test');let now=1000000;
  for(let i=0;i<3;i++){
    const c=await claimScheduledMessage(db,ref,[],now);assert.equal(c.decision,'claim');await beginScheduledSend(db,ref,c.token!,now);
    await ref.update({status:'retry_pending',retryAt:now+60000});assert.equal((await claimScheduledMessage(db,ref,[],now+1)).decision,i===2?'attention':'wait');now+=60001;
  }
  assert.equal((await claimScheduledMessage(db,ref,[],now)).decision,'attention');
  const old=db.doc('reminder_locks/legacy');await old.set({status:'unknown'});
  assert.equal((await claimScheduledMessage(db,db.doc('tenants/a/reminder_locks/new'),[old],now)).decision,'attention');
});
test('pacer serializes bursts and preserves spacing',async()=>{
  let now=0;const slots:number[]=[];const p=new SmsPacer(1000,()=>now,async(ms)=>{now+=ms;});
  await Promise.all(Array.from({length:100},async()=>{await p.wait();slots.push(now);}));
  assert.equal(now,99000);assert.equal(slots.length,100);
});
test('300 tenant simulation drains 7,200 reminders with bounded queries, restart and no duplicates',async()=>{
  const accepted=new Set<string>();let posts=0;let h:any;
  const dispatch=async(d:string,t:string,id:string,_:any,deadline:number)=>{
    let sent=0,pending=false;
    for(let customer=0;customer<12;customer++){
      const key=`${id}:${t}:${d}:${customer}`;if(accepted.has(key))continue;
      if(h.clock()>=deadline){pending=true;break;}
      const ref=h.db.doc(`tenants/${id}/reminder_locks/${t}_${d}_${customer}`);
      const c=await claimScheduledMessage(h.db,ref,[],h.clock());
      if(c.decision==='accepted')continue;assert.equal(c.decision,'claim');
      assert.equal(await beginScheduledSend(h.db,ref,c.token!,h.clock()),true);
      posts++;assert.ok(!accepted.has(key));accepted.add(key);await ref.update({status:'sent',providerMessageId:`fake_${posts}`});h.advance(1000);sent++;
    }
    return {success:true,sentCount:sent,pending};
  };
  h=harness(localReminderTime(date,'08:00'),dispatch);for(let i=0;i<300;i++)await h.seed(`business_${String(i).padStart(3,'0')}`);
  let ticks=0;let w=h.worker();const start=h.clock();
  while(accepted.size<3600&&ticks<200){await w.run({limit:20,budgetMs:45000});h.advance(1000);if(++ticks===10)w=h.worker();}
  assert.equal(accepted.size,3600);const morningElapsed=(h.clock()-start)/1000;
  h.set(localReminderTime(date,'20:00'));while(accepted.size<7200&&ticks<400){await w.run({limit:20,budgetMs:45000});h.advance(1000);ticks++;}
  assert.equal(posts,7200);assert.ok(h.db.maxDueResults<=20);assert.equal(h.db.tenantQueries,4); // 100+100+100+empty page; one daily discovery
  const reads=h.db.reads;await w.run();assert.equal(h.db.reads-reads,1);
  console.log(JSON.stringify({simulation:'300 tenants × 12 customers × 2 reminders',providerPosts:posts,uniqueMessages:accepted.size,schedulerTicks:ticks,maxDueQueryResults:h.db.maxDueResults,tenantDiscoveryQueries:h.db.tenantQueries,morningSimulatedSeconds:morningElapsed,firestoreShapedReads:h.db.reads,firestoreShapedWrites:h.db.writes,realSmsSent:0}));
});
test('a disabled or rescheduled queue prevents a claimed message from reaching the provider',async()=>{
  const db=new MemoryFirestore(),ref=db.doc('tenants/a/reminder_locks/test'),queue=db.doc('sms_schedules/a_today');
  await queue.set({enabled:true,revision:'new',processingToken:'worker'});
  const c=await claimScheduledMessage(db,ref,[],1000);
  assert.equal(await beginScheduledSend(db,ref,c.token!,1001,{ref:queue,revision:'old',token:'worker'}),false);
  assert.equal(db.values.get(ref.path).attempts,0);
  await queue.update({enabled:false});assert.equal(await beginScheduledSend(db,ref,c.token!,1001,{ref:queue,revision:'new',token:'worker'}),false);
});
test('safe retries restore only the rejected customer and preserve accepted messages',async()=>{
  let h:any;const posts=new Map<string,number>();let calls=0;
  const dispatch=async(d:string,t:string,id:string)=>{
    let pending=false,retryAt=Infinity,sentCount=0;
    for(const customer of ['accepted','rejected','uncertain']){
      const ref=h.db.doc(`tenants/${id}/reminder_locks/${t}_${d}_${customer}`);
      const c=await claimScheduledMessage(h.db,ref,[],h.clock());
      if(c.decision==='wait'){pending=true;retryAt=Math.min(retryAt,c.retryAt);continue;}
      if(c.decision!=='claim')continue;
      await beginScheduledSend(h.db,ref,c.token!,h.clock());posts.set(customer,(posts.get(customer)||0)+1);
      if(customer==='rejected'&&posts.get(customer)===1){await ref.update({status:'retry_pending',retryAt:h.clock()+60000});pending=true;retryAt=h.clock()+60000;}
      else if(customer==='uncertain')await ref.update({status:'unknown'});
      else {await ref.update({status:'sent'});sentCount++;}
    }
    calls++;return {success:true,pending,retryAt:Number.isFinite(retryAt)?retryAt:undefined,sentCount};
  };
  h=harness(localReminderTime(date,'08:00'),dispatch);await h.seed();const w=h.worker();await w.run();await w.run();assert.equal(calls,1);
  h.advance(60000);await h.worker().run();assert.deepEqual([...posts.entries()],[['accepted',1],['rejected',2],['uncertain',1]]);
});
test('manual-review attention remains visible after a later successful day',async()=>{
  let fail=true;const h=harness(localReminderTime(date,'08:00'),async()=>fail?{success:false,attention:true,error:'unknown provider response'}:{success:true});await h.seed();const w=h.worker();await w.run();
  fail=false;h.set(localReminderTime('2026-10-09','08:00'));await w.run();
  const s=h.db.values.get('sms_schedules/business_a_today');assert.equal(s.attention,true);assert.equal(s.lastAttention.runDate,date);assert.equal(s.lastAttention.error,'unknown provider response');
});

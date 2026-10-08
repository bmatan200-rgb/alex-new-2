import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {getAuth} from 'firebase-admin/auth';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {claimOnce,copyOnce,israelClock,reminderKey} from '../server/core';
if(!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Emulators required: tests never access production');
process.env.NODE_ENV='test';
process.env.SUPER_ADMIN_EMAILS='verified@example.com,unverified@example.com';
const projectId='gen-lang-client-0382531831';
const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify({project_id:projectId,client_email:'test@example.com',private_key:privateKey});
const {app,db,ensurePrimaryTenant,sendRemindersForDate}=await import('../server');
const nativeFetch=globalThis.fetch;
let server:any, base:string, rules:any, superToken:string, ownerToken:string, userToken:string;
let providerCalls=0, providerFailure=false;
globalThis.fetch=async(input:any,init?:any)=>{
  if(String(input).startsWith('https://api.telnyx.com/')){
    providerCalls++;
    if(providerFailure) throw new Error('Simulated response lost after acceptance');
    return new Response(JSON.stringify({data:{id:'provider_'+providerCalls,to:[{status:'queued'}]}}),{status:200});
  }
  const u=String(input);
  if(!u.startsWith('http://127.0.0.1:') && !u.startsWith('http://localhost:'))throw new Error('Unexpected external network in test: '+u);
  return nativeFetch(input,init);
};
async function account(uid:string,email:string,claims:any={},verified=true){
  await getAuth().createUser({uid,email,password:'Test12345!',emailVerified:verified});
  await getAuth().setCustomUserClaims(uid,claims);
  const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Test12345!',returnSecureToken:true})});
  const json=await r.json();if(!json.idToken)throw new Error(JSON.stringify(json));return json.idToken;
}
async function api(path:string,body?:any,token?:string,tenant='alex_beauty',method?:string,context='admin'){
  const r=await fetch(base+path,{method:method || (body===undefined?'GET':'POST'),headers:{'Content-Type':'application/json','x-tenant-id':tenant,'x-operation-context':token?context:'customer',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,...await r.json()};
}
before(async()=>{
  await db.recursiveDelete(db.collection('tenants'));
  server=await new Promise<any>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
  superToken=await account('super','bmatan200@gmail.com',{role:'super_admin'});
  ownerToken=await account('owner','owner@example.com',{role:'business_admin',tenantId:'alex_beauty'});
  userToken=await account('regular','regular@example.com');
  await db.doc('tenants/alex_beauty').set({status:'active',name:'Alex',phone:'0546307114',ownerAuthUid:'owner'});
  await db.doc('tenants/other').set({status:'active',name:'Other'});
  await db.doc('adminUsers/owner').set({disabled:false});
  await db.doc('tenants/alex_beauty/settings/config').set({services:[{id:1,name:'nails',price:150,duration_minutes:60}],scheduleSettings:{businessOpen:'08:00',businessClose:'22:00',fridayOpen:'08:00',fridayClose:'22:00',durationMinutes:60}});
  rules=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync('firestore.rules','utf8')}});
  await rules.withSecurityRulesDisabled(async(c:any)=>{
    const f=c.firestore();await setDoc(doc(f,'tenants/alex_beauty'),{status:'active',ownerAuthUid:'owner'});await setDoc(doc(f,'adminUsers/owner'),{disabled:false});
    await setDoc(doc(f,'tenants/alex_beauty/appointments/a'),{customer_phone:'private'});
    await setDoc(doc(f,'tenants/alex_beauty/settings/config'),{services:[]});
    await setDoc(doc(f,'tenants/alex_beauty/settings/sms_reminders'),{enabled:true});
    await setDoc(doc(f,'tenants/alex_beauty/private_settings/sms_provider'),{telnyxApiKey:'secret'});
  });
});
after(async()=>{globalThis.fetch=nativeFetch;await rules?.cleanup();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();});
test('public registration stores tenant-scoped consent and both current/legacy routes use the same persistence',async()=>{
  const result=await api('/api/customer/register',{full_name:'New Customer',phone:'0546307114',acceptedTerms:true,signatureDataUrl:'data:image/png;base64,AA=='},undefined,'alex_beauty');
  assert.equal(result.success,true);
  const customer=(await db.doc('tenants/alex_beauty/customers/cust_972546307114').get()).data();
  assert.equal(customer?.termsConsent?.accepted,true);assert.equal(customer?.termsConsent?.version,'2026-10-01');
  assert.ok(customer?.signatureDataUrl?.startsWith('data:image/png;base64,'));
  const legacy=await api('/api/register-webhook',{name:'Legacy Cached Client',phone:'0522222222',acceptedTerms:true,signatureDataUrl:'data:image/png;base64,AA=='},undefined,'alex_beauty');
  assert.equal(legacy.success,true);
  assert.equal((await db.doc('tenants/alex_beauty/customers/cust_972522222222').get()).data()?.full_name,'Legacy Cached Client');
  assert.equal((await api('/api/customer/register',{full_name:'x',phone:'bad',acceptedTerms:false})).success,false);
});
test('global SMS maintenance switch blocks scheduled and manual sends',async()=>{
  const before=providerCalls;const prior=process.env.SMS_SENDING_ENABLED;process.env.SMS_SENDING_ENABLED='false';
  try {
    const result=await sendRemindersForDate(israelClock().tomorrowIso,'1day','alex_beauty',{enabled:true,autoSendEnabled:true});
    assert.equal(result.skipped,true);assert.equal(result.reason,'sending_disabled');
    assert.equal((await api('/api/sms/send-single',{phone:'0546307114',message:'test'},superToken)).status,503);
    assert.equal((await api('/api/sms/send-batch',{type:'today'},superToken)).status,503);
    assert.equal(providerCalls,before);
  } finally {if(prior===undefined)delete process.env.SMS_SENDING_ENABLED;else process.env.SMS_SENDING_ENABLED=prior;}
});
test('tenant-configured Friday hours are used for public and admin slot calculations',async()=>{
  const {calculateAvailableSlots,getDailySlotsOccupancy}=await import('../src/utils/dateUtils');
  const options={durationMinutes:60,existingAppointments:[],dateString:'2030-06-07',businessOpen:'08:00',businessClose:'22:00',fridayOpen:'10:00',fridayClose:'13:00',slotInterval:60};
  const publicSlots=calculateAvailableSlots(options);assert.deepEqual(publicSlots,['10:00','11:00','12:00']);
  const adminSlots=getDailySlotsOccupancy(options.dateString,[],60,options.businessOpen,options.businessClose,options.fridayClose,options.fridayOpen);
  assert.deepEqual(adminSlots.map(x=>x.time),['10:00','11:00','12:00']);
});
test('named database is explicitly selected',()=>{assert.equal(db.databaseId,'ai-studio-alex-0ace37ff-f441-4c64-bdb6-3ba856e2147c');});
test('anonymous/ordinary Firebase users cannot administer or run scheduler',async()=>{assert.equal((await api('/api/tenants')).status,403);assert.equal((await api('/api/admin/customers',undefined,userToken)).status,403);assert.equal((await api('/api/sms/check-due')).status,403);});
test('tenant role cannot cross tenant boundary via query/header/body',async()=>{assert.notEqual((await api('/api/admin/customers',undefined,ownerToken,'other')).status,200);assert.equal((await api('/api/admin/customers?tenant=other',undefined,ownerToken)).status,400);assert.equal((await api('/api/admin/settings/services',{tenantId:'other',services:[]},ownerToken)).status,400);assert.equal((await api('/api/admin/migrate-legacy-alex',{},ownerToken)).status,403);});
test('canonical super admin works even when Firebase emailVerified is false; every other account stays scoped',async()=>{
  await getAuth().updateUser('super',{emailVerified:false});
  const login=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bmatan200@gmail.com',password:'Test12345!',returnSecureToken:true})});
  const token=(await login.json()).idToken;
  assert.equal((await api('/api/auth/me',undefined,token)).user.role,'super_admin');
  assert.equal((await api('/api/tenants',undefined,token)).status,200);
  const unrelated=await account('unrelated','unrelated@example.com',{role:'super_admin'},true);
  assert.equal((await api('/api/tenants',undefined,unrelated)).status,403);
});
test('Firestore rules deny public PII, writes, lock edits and provider secrets',async()=>{
  const anon=rules.unauthenticatedContext().firestore();
  const owner=rules.authenticatedContext('owner',{role:'business_admin',tenantId:'alex_beauty'}).firestore();
  const other=rules.authenticatedContext('other-owner',{role:'business_admin',tenantId:'other'}).firestore();
  const staleSuper=rules.authenticatedContext('stale-super',{role:'super_admin',email:'other@example.com',email_verified:true}).firestore();
  const canonicalSuper=rules.authenticatedContext('matan',{role:'super_admin',email:'bmatan200@gmail.com',email_verified:false}).firestore();
  await assertFails(getDoc(doc(anon,'tenants/alex_beauty/appointments/a')));
  await assertFails(getDoc(doc(other,'tenants/alex_beauty/appointments/a')));
  await assertFails(getDoc(doc(staleSuper,'tenants/alex_beauty/appointments/a')));
  await assertSucceeds(getDoc(doc(canonicalSuper,'tenants/alex_beauty/appointments/a')));
  await assertSucceeds(getDoc(doc(owner,'tenants/alex_beauty/appointments/a')));
  await assertSucceeds(getDoc(doc(anon,'tenants/alex_beauty/settings/config')));
  await assertFails(getDoc(doc(anon,'tenants/alex_beauty/settings/sms_reminders')));
  await assertFails(getDoc(doc(owner,'tenants/alex_beauty/private_settings/sms_provider')));
  await assertFails(getDoc(doc(canonicalSuper,'tenantAdminIcons/flower_purple')));
  await assertFails(setDoc(doc(owner,'tenants/alex_beauty/reminder_locks/a'),{status:'sent'}));
  await assertFails(setDoc(doc(anon,'tenants/alex_beauty/appointments/new'),{status:'confirmed'}));
});
test('Firestore binding conflicts and disabled owners reject stale claims without limiting Super Admin',async()=>{
  const owner=rules.authenticatedContext('owner',{role:'business_admin',tenantId:'alex_beauty'}).firestore();
  const superDb=rules.authenticatedContext('matan',{role:'super_admin',email:'bmatan200@gmail.com'}).firestore();
  for(const binding of [{disabled:true},{disabled:false,tenantId:'other'},{disabled:false,role:'customer'}]) {
    await rules.withSecurityRulesDisabled(async(c:any)=>{await setDoc(doc(c.firestore(),'adminUsers/owner'),binding);});
    await assertFails(getDoc(doc(owner,'tenants/alex_beauty/appointments/a')));
    await assertSucceeds(getDoc(doc(superDb,'tenants/alex_beauty/appointments/a')));
  }
  await rules.withSecurityRulesDisabled(async(c:any)=>{await setDoc(doc(c.firestore(),'adminUsers/owner'),{disabled:false});});
});
test('atomic booking rejects overlap, redacts public data, and cancels with capability only',async()=>{
  let day=new Date();day.setUTCDate(day.getUTCDate()+7);while(day.getUTCDay()===6)day.setUTCDate(day.getUTCDate()+1);
  const appointment={customer_name:'Private Name',customer_phone:'0546307114',service_id:1,appointment_date:day.toISOString().slice(0,10),start_time:'10:00',end_time:'11:00',status:'confirmed'};
  const results=await Promise.all([api('/api/appointments/book',{appointment}),api('/api/appointments/book',{appointment:{...appointment,start_time:'10:30',end_time:'11:30'}})]);
  assert.equal(results.filter(x=>x.success).length,1);const saved=results.find(x=>x.success)!;
  let list=await api('/api/appointments/list',{});assert.equal(list.appointments.find((x:any)=>x.id===saved.id).customer_phone,'');
  list=await api('/api/appointments/list',{capabilities:{[saved.id]:saved.accessToken}});assert.equal(list.appointments.find((x:any)=>x.id===saved.id).customer_name,'Private Name');
  assert.equal((await api('/api/appointments/cancel',{appointmentId:saved.id,customerPhone:'0546307114'},userToken)).status,403);
  assert.equal((await api('/api/appointments/cancel',{appointmentId:saved.id,accessToken:'wrong'})).status,403);
  assert.equal((await api('/api/appointments/cancel',{appointmentId:saved.id,accessToken:saved.accessToken})).success,true);
  assert.equal((await db.doc(`tenants/alex_beauty/appointments/${saved.id}`).get()).data()?.status,'cancelled');
});
test('customer operations ignore same-business, other-business and stale admin sessions',async()=>{
  const config={services:[{id:1,name:'service',price:150,duration_minutes:60}],scheduleSettings:{businessOpen:'08:00',businessClose:'22:00',fridayOpen:'08:00',fridayClose:'22:00',durationMinutes:60}};
  await db.doc('tenants/other/settings/config').set(config);
  for(const tenant of ['alex_beauty','other']) {
    const appointment={customer_name:'Customer only',customer_phone:'0541111111',service_id:1,appointment_date:'2030-06-02',start_time:'12:00',end_time:'13:00'};
    const booked=await api('/api/appointments/book',{appointment},ownerToken,tenant,undefined,'customer');
    assert.equal(booked.success,true);
    for(const token of [ownerToken,'stale-invalid-token']) {
      const list=await api('/api/appointments/list',{},token,tenant,undefined,'customer');
      assert.equal(list.status,200);
      assert.equal(list.appointments.find((a:any)=>a.id===booked.id).customer_phone,'');
    }
    assert.equal((await api('/api/appointments/cancel',{appointmentId:booked.id},ownerToken,tenant,undefined,'customer')).status,403);
    assert.equal((await api('/api/appointments/cancel',{appointmentId:booked.id,accessToken:booked.accessToken},'stale-invalid-token',tenant,undefined,'customer')).success,true);
  }
  assert.equal((await api('/api/appointments/list',{},ownerToken,'other')).status,403);
  assert.equal((await api('/api/appointments/list',{},superToken,'other')).status,200);
  assert.equal((await api('/api/admin/settings/services',{services:config.services},superToken,'other')).success,true);
});
test('concurrent lock claims allow exactly one winner; crash/unknown states never expire into resends',async()=>{
  const ref=db.doc('tenants/alex_beauty/reminder_locks/concurrency');
  const claims=await Promise.all(Array.from({length:8},()=>claimOnce(db,ref)));assert.equal(claims.filter(Boolean).length,1);
  await ref.set({status:'unknown',claimedAt:'2020-01-01T00:00:00Z'});assert.equal(await claimOnce(db,ref),false);
});
test('copy receipts preserve newer target data and prevent resurrection after deletion',async()=>{
  const target=db.doc('tenants/alex_beauty/appointments/migrate'),marker=db.doc('migration_receipts/test');
  await target.set({value:'new'});await copyOnce(db,{value:'old'},target,marker);assert.equal((await target.get()).data()?.value,'new');await target.delete();await copyOnce(db,{value:'old'},target,marker);assert.equal((await target.get()).exists,false);
});
test('Alex migration imports settings, locks and customers without overwriting tenant data',async()=>{
  await db.doc('appointments/legacy').set({status:'confirmed',appointment_date:'2026-01-01'});
  await db.doc('customers/legacy').set({full_name:'Legacy'});
  await db.doc('settings/sms_reminders').set({enabled:false,telnyxApiKey:'secret',morningReminderTime:'09:00'});
  await db.doc('reminder_locks/legacy').set({status:'sent'});
  await ensurePrimaryTenant();
  assert.equal((await db.doc('tenants/alex_beauty/appointments/legacy').get()).exists,true);
  assert.equal((await db.doc('tenants/alex_beauty/reminder_locks/legacy').get()).data()?.status,'sent');
  assert.equal((await db.doc('tenants/alex_beauty/settings/sms_reminders').get()).data()?.telnyxApiKey,undefined);
  assert.equal((await db.doc('tenants/alex_beauty/private_settings/sms_provider').get()).data()?.telnyxApiKey,'secret');
  await db.doc('tenants/alex_beauty/appointments/legacy').delete();await ensurePrimaryTenant();assert.equal((await db.doc('tenants/alex_beauty/appointments/legacy').get()).exists,false);
});
test('SMS uses per-tenant settings; overlapping batch runs and lost responses do not send twice',async()=>{
  const tomorrow=israelClock().tomorrowIso;
  const settings={enabled:true,autoSendEnabled:true,notifyCustomer1DayBefore:true,eveningReminderTime:'20:00'};
  await db.doc('tenants/other').set({status:'active',name:'Other',phone:'0522222222'});
  await db.doc('tenants/other/settings/sms_reminders').set(settings);
  await db.doc('tenants/other/private_settings/sms_provider').set({telnyxApiKey:'test',telnyxFrom:'OTHER',telnyxProfileId:'profile'});
  await db.doc('tenants/other/appointments/one').set({status:'confirmed',customer_name:'Other customer',customer_phone:'0522222222',appointment_date:tomorrow,start_time:'10:00',end_time:'11:00',created_at:'2020-01-01T00:00:00Z'});
  const count=providerCalls;await Promise.all([sendRemindersForDate(tomorrow,'1day','other'),sendRemindersForDate(tomorrow,'1day','other')]);assert.equal(providerCalls-count,1);
  await db.doc('tenants/other/appointments/two').set({status:'confirmed',customer_name:'Next',customer_phone:'0533333333',appointment_date:tomorrow,start_time:'12:00',end_time:'13:00',created_at:'2020-01-01T00:00:00Z'});
  providerFailure=true;await sendRemindersForDate(tomorrow,'1day','other');const afterFailure=providerCalls;await sendRemindersForDate(tomorrow,'1day','other');assert.equal(providerCalls,afterFailure);providerFailure=false;
  assert.equal((await db.doc('tenants/other/reminder_locks/'+reminderKey('1day','0533333333',tomorrow)).get()).data()?.status,'unknown');
  assert.equal((await api('/api/sms/logs',undefined,ownerToken)).logs.some((l:any)=>l.tenantId==='other'),false);
});
test('tenant create/domain collision and durable delete cannot silently overwrite another business',async()=>{
  const domainCreate=await api('/api/super-admin/tenants',{tenantId:'domain_links',name:'Domain Links',phone:'0501111112',customDomain:'links.example.com'},superToken,'domain_links');
  assert.equal(domainCreate.testUrl,'https://links.example.com/');assert.equal(domainCreate.adminUrl,'https://links.example.com/admin');
  const t={tenantId:'new_tenant',name:'New',phone:'0501111111',customDomain:'new.example.com'};
  assert.equal((await api('/api/super-admin/tenants',t,superToken,'new_tenant')).success,true);
  assert.equal((await api('/api/super-admin/tenants',t,superToken,'new_tenant')).success,false);
  assert.equal((await api('/api/super-admin/tenants',{...t,tenantId:'collision'},superToken,'collision')).success,false);
  assert.equal((await db.doc('domains/new.example.com').get()).data()?.tenantId,'new_tenant');
  assert.equal((await api('/api/super-admin/tenants/domain_links',undefined,superToken,'domain_links','DELETE')).success,true);
  assert.equal((await api('/api/super-admin/tenants/new_tenant',undefined,superToken,'new_tenant','DELETE')).success,true);
  assert.equal((await db.doc('tenants/new_tenant').get()).data()?.status,'deleted');
  assert.equal((await api('/api/tenant/current',undefined,undefined,'new_tenant')).success,false);
  assert.equal((await db.doc('domains/new.example.com').get()).exists,false);
});

test('business admin icon assignments are unique, transactional, visible in PWA manifests and reusable after deletion',async()=>{
  const first={tenantId:'icon_business_a',name:'Icon A',phone:'0501111113',adminIcon:'flower_purple'};
  const second={tenantId:'icon_business_b',name:'Icon B',phone:'0501111114',adminIcon:'diamond_teal'};
  assert.equal((await api('/api/super-admin/tenants',first,superToken,'icon_business_a')).success,true);
  assert.equal((await api('/api/super-admin/tenants',second,superToken,'icon_business_b')).success,true);
  const collision=await api('/api/super-admin/tenants',{tenantId:'icon_collision',name:'Collision',phone:'0501111115',adminIcon:'flower_purple'},superToken,'icon_collision');
  assert.equal(collision.status,409);
  const updateCollision=await api('/api/super-admin/tenants/icon_business_b',{...second,adminIcon:'flower_purple'},superToken,'icon_business_b','PUT');
  assert.equal(updateCollision.status,409);
  assert.equal((await db.doc('tenants/icon_business_b').get()).data()?.adminIcon,'diamond_teal');
  assert.equal((await db.doc('tenantAdminIcons/flower_purple').get()).data()?.tenantId,'icon_business_a');
  assert.equal((await api('/api/super-admin/tenants/icon_business_a',{...first,adminIcon:'heart_gold'},superToken,'icon_business_a','PUT')).success,true);
  assert.equal((await db.doc('tenantAdminIcons/flower_purple').get()).exists,false);
  assert.equal((await api('/api/super-admin/tenants/icon_business_b',{...second,adminIcon:'flower_purple'},superToken,'icon_business_b','PUT')).success,true);
  const manifest=await nativeFetch(`${base}/manifest.json?app=admin&tenant=icon_business_b`);
  const manifestJson=await manifest.json();
  assert.equal(manifestJson.icons[0].src,'/tenant-admin-icons/flower_purple.svg?v=39&name=Icon%20B');
  assert.equal(manifestJson.id,'/admin?tenant=icon_business_b');
  const customerManifest=await nativeFetch(`${base}/manifest.json?tenant=icon_business_b`);
  const customerManifestJson=await customerManifest.json();
  assert.equal(customerManifestJson.icons[0].src,manifestJson.icons[0].src);
  assert.equal(customerManifestJson.id,'/?tenant=icon_business_b');
  const icon=await nativeFetch(`${base}/tenant-admin-icons/flower_purple.svg?v=39&name=Icon%20B`);
  assert.equal(icon.status,200);assert.match(icon.headers.get('content-type')||'',/image\/svg\+xml/);const iconSvg=await icon.text();assert.match(iconSvg,/<path/);assert.match(iconSvg,/Icon B/);
  assert.equal((await nativeFetch(`${base}/tenant-admin-icons/unknown.svg`)).status,404);
  const raced=await Promise.all(['race_icon_a','race_icon_b'].map((tenantId,index)=>api('/api/super-admin/tenants',{tenantId,name:`Race ${index}`,phone:`050111112${index}`,adminIcon:'star_fuchsia'},superToken,tenantId)));
  assert.equal(raced.filter((result:any)=>result.success).length,1);
  assert.equal(raced.filter((result:any)=>result.status===409).length,1);
  const raceOwner=(await db.doc('tenantAdminIcons/star_fuchsia').get()).data()?.tenantId;
  assert.ok(['race_icon_a','race_icon_b'].includes(raceOwner));
  await api(`/api/super-admin/tenants/${raceOwner}`,undefined,superToken,raceOwner,'DELETE');
  await api('/api/super-admin/tenants/icon_business_b',undefined,superToken,'icon_business_b','DELETE');
  assert.equal((await db.doc('tenantAdminIcons/flower_purple').get()).exists,false);
  assert.equal((await api('/api/super-admin/tenants',{tenantId:'icon_business_c',name:'Icon C',phone:'0501111116',adminIcon:'flower_purple'},superToken,'icon_business_c')).success,true);
});
test('disabled owner rejected with previously issued token',async()=>{await getAuth().updateUser('owner',{disabled:true});assert.equal((await api('/api/admin/customers',undefined,ownerToken)).status,401);});
test('disabled reminder switches and suspended tenants prevent dispatch',async()=>{
  const date=israelClock().tomorrowIso;
  await db.doc('tenants/off').set({status:'active'});
  await db.doc('tenants/off/settings/sms_reminders').set({enabled:false,autoSendEnabled:true});
  const before=providerCalls;assert.equal((await sendRemindersForDate(date,'1day','off')).skipped,true);
  await db.doc('tenants/off/settings/sms_reminders').set({enabled:true,autoSendEnabled:false});assert.equal((await sendRemindersForDate(date,'1day','off')).skipped,true);
  await db.doc('tenants/off').update({status:'suspended'});assert.equal((await sendRemindersForDate(date,'1day','off',{enabled:true,autoSendEnabled:true})).skipped,true);assert.equal(providerCalls,before);
});
test('past morning appointments and appointments created seconds after cutoff are skipped',async()=>{
  await db.doc('tenants/cutoff').set({status:'active'});
  await db.doc('tenants/cutoff/private_settings/sms_provider').set({telnyxApiKey:'test',telnyxFrom:'TEST',telnyxProfileId:'test'});
  const date='2030-06-02';
  await db.doc('tenants/cutoff/appointments/late').set({status:'confirmed',customer_name:'Late',customer_phone:'0549999999',appointment_date:date,start_time:'10:00',end_time:'11:00',created_at:'2030-06-01T20:00:30+03:00'});
  const count=providerCalls;await sendRemindersForDate(date,'1day','cutoff',{enabled:true,autoSendEnabled:true,eveningReminderTime:'20:00'});assert.equal(providerCalls,count);
  await db.doc('tenants/cutoff/appointments/old').set({status:'confirmed',customer_name:'Past',customer_phone:'0549999998',appointment_date:'2020-01-01',start_time:'10:00',end_time:'11:00'});
  await sendRemindersForDate('2020-01-01','today','cutoff',{enabled:true,autoSendEnabled:true});assert.equal(providerCalls,count);
});
test('v16 migration marker prevents restoring absent previously imported appointments',async()=>{
  await db.doc('tenants/alex_beauty').update({migratedAt:'2026-01-01'});
  await db.doc('appointments/deleted_in_v16').set({status:'confirmed'});
  await ensurePrimaryTenant();assert.equal((await db.doc('tenants/alex_beauty/appointments/deleted_in_v16').get()).exists,false);
});
test('owner account cannot demote super admin or assign another tenant owner',async()=>{
  assert.equal((await api('/api/super-admin/tenants/other/owner-account',{email:'bmatan200@gmail.com',password:'Test12345!'},superToken,'other')).status,409);
  assert.equal((await api('/api/super-admin/tenants/other/owner-account',{email:'owner@example.com',password:'Test12345!'},superToken,'other')).status,409);
  assert.equal((await getAuth().getUser('super')).customClaims?.role,'super_admin');
});
test('settings reject invalid times and never return provider secrets',async()=>{
  assert.equal((await api('/api/sms/settings',{settings:{morningReminderTime:'25:00'}},superToken)).status,400);
  const result=await api('/api/sms/settings',{settings:{telnyxApiKey:'new-secret',telnyxFrom:'ALEX',telnyxProfileId:'profile',enabled:false}},superToken);
  assert.equal(result.success,true);assert.equal(result.settings.telnyxApiKey,undefined);
  assert.equal((await api('/api/sms/settings',undefined,superToken)).settings.telnyxApiKey,undefined);
  assert.equal((await db.doc('tenants/alex_beauty/private_settings/sms_provider').get()).data()?.telnyxApiKey,'new-secret');
});

test('deleting a customer preserves appointments and listing does not recreate the customer',async()=>{
  await db.doc('tenants/alex_beauty/customers/separate').set({full_name:'Separate',phone:'0548888888'});
  await db.doc('tenants/alex_beauty/appointments/separate').set({customer_name:'Separate',customer_phone:'0548888888',status:'confirmed',appointment_date:'2030-06-02',start_time:'15:00',end_time:'16:00'});
  assert.equal((await api('/api/admin/customers/separate',undefined,superToken,'alex_beauty','DELETE')).success,true);
  assert.equal((await api('/api/admin/customers',undefined,superToken)).customers.some((c:any)=>c.full_name==='Separate'),false);
  assert.equal((await db.doc('tenants/alex_beauty/appointments/separate').get()).exists,true);
});
test('built production server boots with named database and serves API plus SPA',async()=>{
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,['dist/server.cjs'],{env:{...process.env,NODE_ENV:'production',PORT:'43187',SMS_SCHEDULER_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  try {
    let ready=false;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null) throw new Error(output);
      try {const r=await nativeFetch('http://127.0.0.1:43187/api/health');if(r.ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,output);
    const html=await nativeFetch('http://127.0.0.1:43187/');assert.equal(html.status,200);assert.match(await html.text(),/<div id="root">/);
  const health=await nativeFetch('http://127.0.0.1:43187/api/health');const healthJson=await health.json();assert.equal(healthJson.version,'39.0.0');
    const registerRoute=await nativeFetch('http://127.0.0.1:43187/api/customer/register',{method:'POST',headers:{'Content-Type':'application/json','x-tenant-id':'alex_beauty'},body:JSON.stringify({full_name:'x',phone:'bad',acceptedTerms:false})});
    assert.equal(registerRoute.status,400);assert.doesNotMatch(await registerRoute.text(),/API route not found/);
    const missing=await nativeFetch('http://127.0.0.1:43187/api/unknown');assert.equal(missing.status,404);assert.match(missing.headers.get('content-type')||'',/json/);
  } finally {child.kill('SIGTERM');await new Promise<void>(r=>child.once('exit',()=>r()));}
});

// V39: these tests require the Firestore/Auth emulators, never production.
test('saving SMS settings commits both schedules atomically and scopes changes to the selected tenant',async()=>{
  const untouched=await db.doc('sms_schedules/other_today').get();
  const result=await api('/api/sms/settings',{settings:{enabled:true,autoSendEnabled:true,morningReminderTime:'11:00',eveningReminderTime:'20:00',notifyCustomerToday:true,notifyCustomer1DayBefore:true}},superToken);
  assert.equal(result.status,200);
  const [morning,evening]=await Promise.all([db.doc('sms_schedules/alex_beauty_today').get(),db.doc('sms_schedules/alex_beauty_1day').get()]);
  assert.equal(morning.data()?.time,'11:00');assert.equal(evening.data()?.time,'20:00');
  assert.equal(morning.data()?.tenantId,'alex_beauty');assert.equal(morning.data()?.settings.telnyxApiKey,undefined);
  assert.deepEqual((await db.doc('sms_schedules/other_today').get()).data(),untouched.data());
  assert.ok([401,403].includes((await api('/api/super-admin/sms-scheduler',undefined,ownerToken)).status));
  assert.equal((await api('/api/super-admin/sms-scheduler',undefined,superToken)).status,200);
});
test('scheduler documents are server-only for customers, owners and Super Admin',async()=>{
  for(const context of [rules.unauthenticatedContext(),rules.authenticatedContext('owner',{email:'owner@example.com',role:'business_admin',tenantId:'alex_beauty'}),rules.authenticatedContext('super',{email:'bmatan200@gmail.com',role:'super_admin'})]){
    const client=context.firestore();
    for(const path of ['sms_schedules/alex_beauty_today','sms_scheduler_control/discovery']){
      await assertFails(getDoc(doc(client,path)));
      await assertFails(setDoc(doc(client,path),{nextRunAt:0}));
    }
  }
});
test('scheduled dispatch rechecks cancelled records and retains accepted locks across retries',async()=>{
  const {tomorrowIso}=israelClock();const tenant='scheduler_integration';
  await db.doc(`tenants/${tenant}`).set({status:'active',name:'Scheduler Test'});
  await db.doc(`tenants/${tenant}/private_settings/sms_provider`).set({telnyxApiKey:'fake',telnyxFrom:'TEST',telnyxProfileId:'fake'});
  const config={enabled:true,autoSendEnabled:true,notifyCustomer1DayBefore:true,eveningReminderTime:'20:00'};
  await db.doc(`tenants/${tenant}/appointments/confirmed`).set({status:'confirmed',appointment_date:tomorrowIso,start_time:'14:00',customer_name:'Fake',customer_phone:'0521112222',service_name:'Fake Service',created_at:'2020-01-01T00:00:00Z'});
  await db.doc(`tenants/${tenant}/appointments/cancelled`).set({status:'cancelled',appointment_date:tomorrowIso,start_time:'15:00',customer_name:'Cancelled',customer_phone:'0521113333'});
  const before=providerCalls;
  const result=await sendRemindersForDate(tomorrowIso,'1day',tenant,config,{scheduled:true,deadline:Date.now()+30000});
  assert.equal(result.sentCount,1);assert.equal(providerCalls-before,1);
  await sendRemindersForDate(tomorrowIso,'1day',tenant,config,{scheduled:true,deadline:Date.now()+30000});assert.equal(providerCalls-before,1);
  const lock=(await db.doc(`tenants/${tenant}/reminder_locks/${reminderKey('1day','0521112222',tomorrowIso)}`).get()).data();
  assert.equal(lock?.schedulerVersion,39);assert.equal(lock?.status,'sent');assert.equal(lock?.attempts,1);
});

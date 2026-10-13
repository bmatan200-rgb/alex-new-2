import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {getAuth} from 'firebase-admin/auth';
import {AppointmentMemory} from './helpers/appointmentMemory';
import {canonicalPhone} from '../src/utils/phone';
import {deduplicateAppointments,getDailySlotsOccupancy} from '../src/utils/dateUtils';
import {normalizeAppointment} from '../server/appointmentAudit';
process.env.NODE_ENV='test';
process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify({project_id:'gen-lang-client-0382531831',client_email:'test@example.com',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
const {app,db}=await import('../server');
const memory=new AppointmentMemory();
(db as any).doc=memory.doc;(db as any).collection=memory.collection;(db as any).runTransaction=memory.runTransaction;(db as any).getAll=memory.getAll;(db as any).batch=memory.batch.bind(memory);
const auth=getAuth();
(auth as any).verifyIdToken=async(token:string)=>{if(!['owner','stale','super','stale-super'].includes(token))throw Error('bad token');const isSuper=token.includes('super');return {uid:isSuper?'super':'owner',email:isSuper?'bmatan200@gmail.com':'owner@example.com',auth_time:Math.floor(Date.now()/1000)-(token.startsWith('stale')?300:0),firebase:{sign_in_provider:'password'}};};
(auth as any).getUser=async(uid:string)=>uid==='super'?{uid,email:'bmatan200@gmail.com',disabled:false,customClaims:{role:'super_admin'}}:{uid:'owner',email:'owner@example.com',disabled:false,customClaims:{role:'business_admin',tenantId:'audit_test'}};
const nativeFetch=globalThis.fetch;let smsText='';
globalThis.fetch=async(input:any,init?:any)=>{if(String(input).startsWith('https://api.telnyx.com/')){smsText=JSON.parse(init.body).text;return new Response(JSON.stringify({data:{id:'fake_otp',to:[{status:'queued'}]}}),{status:200});}if(!String(input).startsWith('http://127.0.0.1:'))throw Error('network blocked in route tests');return nativeFetch(input,init);};
let server:any,base:string,saved:any,moved:any;
const appointment={customer_name:'מיכל ישראלי',customer_phone:'0541234567',service_id:1,service_name:'לק ג׳ל כולל מניקור',appointment_date:'2030-06-02',start_time:'10:00',end_time:'11:00',createdAt:'1999-01-01',status:'cancelled'};
async function api(path:string,body:any={},token?:string,tenant='audit_test'){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-tenant-id':tenant,'x-operation-context':token?'admin':'customer',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {http:r.status,...await r.json()};}
before(async()=>{memory.put('tenants/audit_test',{status:'active',name:'Test',ownerAuthUid:'owner'});memory.put('adminUsers/owner',{disabled:false,role:'business_admin',tenantId:'audit_test'});memory.put('tenants/audit_test/settings/config',{services:[{id:1,name:appointment.service_name,duration_minutes:60,price:100}],scheduleSettings:{businessOpen:'08:00',businessClose:'22:00',fridayOpen:'08:00',fridayClose:'22:00'}});memory.put('tenants/audit_test/private_settings/sms_provider',{provider:'telnyx',telnyxApiKey:'fake',telnyxFrom:'Test',telnyxProfileId:'fake'});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{globalThis.fetch=nativeFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();});
test('phone formatting and legacy statuses remain compatible; same-slot audit records survive',()=>{assert.equal(canonicalPhone('054-1234567'),canonicalPhone('+972541234567'));assert.equal(normalizeAppointment({status:'confirmed'}).status,'active');const rows=[{...appointment,id:'one',status:'cancelled'},{...appointment,id:'two',status:'active'}] as any;assert.equal(deduplicateAppointments(rows).length,2);assert.equal(getDailySlotsOccupancy(appointment.appointment_date,[{...rows[1],archivedAt:'now'}],60,'10:00','11:00').every(s=>s.status==='free'),true);});
test('server rejects missing full name, phone and treatment for client and admin',async()=>{for(const token of [undefined,'owner'])for(const invalid of [{customer_name:'מיכל'},{customer_phone:''},{service_id:0,service_name:''}]){const result=await api('/api/appointments/book',{appointment:{...appointment,...invalid}},token);assert.equal(result.success,false);}});
test('booking ignores caller status/creation timestamp; creation audit and canonical fields are saved',async()=>{saved=await api('/api/appointments/book',{appointment,requestId:'book_one'});assert.equal(saved.success,true);const a=memory.values.get('tenants/audit_test/appointments/book_one');assert.equal(a.status,'active');assert.notEqual(a.createdAt,appointment.createdAt);assert.equal(a.createdAt,a.created_at);assert.equal(a.createdAt,a.updatedAt);assert.equal(a.customer_phone_normalized,'972541234567');assert.equal([...memory.values.keys()].filter(k=>k.startsWith('tenants/audit_test/appointments/book_one/audit/')).length,1);const publicList=await api('/api/appointments/list');assert.equal(publicList.appointments[0].customer_name,'תפוס');const own=await api('/api/appointments/list',{capabilities:{[saved.id]:saved.accessToken}});assert.equal(own.appointments[0].customer_name,appointment.customer_name);});
test('unauthorized cancellation and empty admin reason fail; client cancellation retains original createdAt',async()=>{const original=memory.values.get('tenants/audit_test/appointments/book_one').createdAt;assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one'})).success,false);assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one'},'owner')).success,false);assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one',accessToken:saved.accessToken,cancellationReason:'לא יכולה להגיע'})).success,true);const a=memory.values.get('tenants/audit_test/appointments/book_one');assert.equal(a.createdAt,original);assert.equal(a.cancelledBy,'client');assert.ok(a.cancelledAt);assert.equal(a.cancellationReason,'לא יכולה להגיע');assert.equal((await api('/api/appointments/list')).appointments.length,0);assert.equal((await api('/api/appointments/list',{},'owner')).appointments[0].status,'cancelled');});
test('rebooking cancelled slot succeeds, reschedule keeps original and customer capability follows new ID',async()=>{const second=await api('/api/appointments/book',{appointment,requestId:'book_two'});assert.equal(second.success,true);const original=memory.values.get('tenants/audit_test/appointments/book_two');moved=await api('/api/admin/appointments/update',{appointmentId:'book_two',appointment:{start_time:'12:00',end_time:'13:00',createdAt:'tamper'}},'owner');assert.equal(moved.success,true);const old=memory.values.get('tenants/audit_test/appointments/book_two');assert.equal(old.status,'rescheduled');assert.equal(old.createdAt,original.createdAt);assert.equal(old.rescheduledTo,moved.id);assert.equal(memory.values.get('tenants/audit_test/appointments/'+moved.id).rescheduledFrom,'book_two');const list=await api('/api/appointments/list',{capabilities:{book_two:second.accessToken}});assert.equal(list.appointments[0].customer_name,appointment.customer_name);assert.equal(list.appointments[0].id,moved.id);const rows=(await api('/api/appointments/list',{},'owner')).appointments;assert.equal(rows.length,3);});
test('ordinary edits preserve createdAt and add before/after history; conflicts roll back',async()=>{const before=memory.values.get('tenants/audit_test/appointments/'+moved.id);assert.equal((await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{notes:'edited',createdAt:'tamper'}},'owner')).success,true);const after=memory.values.get('tenants/audit_test/appointments/'+moved.id);assert.equal(after.createdAt,before.createdAt);assert.equal(after.notes,'edited');const book=await api('/api/appointments/book',{appointment,requestId:'conflict'});assert.equal(book.success,true);const conflict=await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{start_time:'10:00',end_time:'11:00'}},'owner');assert.equal(conflict.success,false);assert.equal(memory.values.get('tenants/audit_test/appointments/'+moved.id).start_time,'12:00');});
test('SMS verification restores cross-browser appointments and remains persistent',async()=>{const start=await api('/api/customer/recovery/start',{phone:'+972541234567'});assert.equal(start.success,true);const code=smsText.match(/\d{6}/)![0];assert.equal((await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code:'000000'})).success,false);const recovery=await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code});assert.equal(recovery.success,true);assert.equal((await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code})).success,false);const accessKey=[...memory.values.keys()].find(k=>k.startsWith('tenants/audit_test/customer_access/'))!;const accessRecord=memory.values.get(accessKey);assert.equal(accessRecord.persistent,true);accessRecord.expiresAt=Date.now()-1;const accessCheck=await api('/api/customer/access/check',{phone:appointment.customer_phone,customerAccess:recovery.customerAccess});assert.equal(accessCheck.verified,true);const list=await api('/api/appointments/list',{customerAccess:recovery.customerAccess});assert.ok(list.appointments.some((a:any)=>a.customer_name===appointment.customer_name));assert.ok(list.appointments.every((a:any)=>a.customer_name===appointment.customer_name));});
test('owner exports own calendar without reset authorization; reports respect inclusive date ranges and tenant isolation',async()=>{
 const before=JSON.stringify([...memory.values]);
 const backup=await api('/api/admin/calendar/export',{},'owner');
 assert.equal(backup.success,true);assert.ok(backup.backup.appointments.length>0);assert.equal(backup.exportId,undefined);
 assert.ok(backup.backup.appointments.every((a:any)=>Array.isArray(a.audit)&&!('accessTokenHash'in a)));
 const range=await api('/api/admin/tenant-activity/export',{period:'range',startDate:'2030-06-02',endDate:'2030-06-02'},'owner');
 assert.equal(range.success,true);assert.equal(range.appointments.length,4);
 assert.equal((await api('/api/admin/tenant-activity/export',{period:'range',startDate:'2030-06-03',endDate:'2030-06-03'},'owner')).appointments.length,0);
 assert.equal((await api('/api/admin/tenant-activity/export',{period:'range',startDate:'2030-06-03',endDate:'2030-06-02'},'owner')).success,false);
 assert.equal((await api('/api/admin/tenant-activity/export',{period:'year',year:2030},'owner','other')).success,false);
 assert.equal((await api('/api/admin/tenant-activity/export',{period:'month',year:2030,month:6})).success,false);
 assert.equal((await api('/api/super-admin/calendar/reset',{tenantId:'audit_test',exportId:'fake',downloadConfirmed:true},'owner')).http,403);
 assert.equal(JSON.stringify([...memory.values]),before);
});
test('super admin export/reset enforce recent auth and refuse stale snapshots',async()=>{
 assert.equal((await api('/api/super-admin/calendar/export',{tenantId:'audit_test'},'stale-super')).success,false);
 const exported=await api('/api/super-admin/calendar/export',{tenantId:'audit_test'},'super');assert.equal(exported.success,true);
 await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{notes:'changed after export'}},'owner');
 assert.equal((await api('/api/super-admin/calendar/reset',{tenantId:'audit_test',exportId:exported.exportId,digest:exported.digest,downloadConfirmed:true},'super')).success,false);
});
test('super admin reset archives rows, retains audit, frees slots, and cannot reuse export',async()=>{
 const exported=await api('/api/super-admin/calendar/export',{tenantId:'audit_test'},'super'),body={tenantId:'audit_test',exportId:exported.exportId,digest:exported.digest,downloadConfirmed:true};
 assert.equal((await api('/api/super-admin/calendar/reset',{...body,downloadConfirmed:false},'super')).success,false);
 assert.equal((await api('/api/super-admin/calendar/reset',body,'super')).success,true);
 assert.equal((await api('/api/appointments/list')).appointments.length,0);
 const all=await api('/api/appointments/list',{},'owner');assert.equal(all.appointments.length,4);assert.ok(all.appointments.every((a:any)=>a.archivedAt));
 assert.equal((await api('/api/super-admin/calendar/reset',body,'super')).success,false);
 assert.equal((await api('/api/appointments/book',{appointment,requestId:'after_reset'})).success,true);
 assert.equal((await api('/api/appointments/list')).appointments.length,1);
});
test('business owner cannot read audit or reset another tenant',async()=>{assert.equal((await api('/api/admin/appointments/audit',{appointmentId:moved.id},'owner','other')).success,false);assert.equal((await api('/api/admin/calendar/export',{},'owner','other')).success,false);});
test('business PNG icons render at both installable dimensions, including embedded raster artwork',async()=>{
 const {default:sharp}=await import('sharp');
 for(const icon of ['flower_purple','hairScissorsGem_purple']) for(const size of [192,512]){
  const r=await fetch(base+`/tenant-admin-icons/${icon}.png?size=${size}&v=43`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const metadata=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(metadata.width,size);assert.equal(metadata.height,size);
 }
});
test('admin cancellation records mandatory reason and immutable creation time',async()=>{
 const original=structuredClone(memory.values.get('tenants/audit_test/appointments/after_reset'));
 const cancelled=await api('/api/admin/appointments/delete',{appointmentId:'after_reset',cancellationReason:'הלקוחה ביקשה ביטול'},'owner');assert.equal(cancelled.success,true);
 const row=memory.values.get('tenants/audit_test/appointments/after_reset');assert.equal(row.cancelledBy,'admin');assert.equal(row.cancellationReason,'הלקוחה ביקשה ביטול');assert.equal(row.createdAt,original.createdAt);assert.equal(row.updatedAt,row.cancelledAt);
 const audit=await api('/api/admin/appointments/audit',{appointmentId:'after_reset'},'owner');assert.ok(audit.events.some((e:any)=>e.type==='cancelled'&&e.reason==='הלקוחה ביקשה ביטול'));
});

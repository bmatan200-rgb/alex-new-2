import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:net';
import {getAuth} from 'firebase-admin/auth';
import {AppointmentMemory} from './helpers/appointmentMemory';
import {canonicalPhone} from '../src/utils/phone';
import {deduplicateAppointments,getDailySlotsOccupancy} from '../src/utils/dateUtils';
import {normalizeAppointment} from '../server/appointmentAudit';
process.env.NODE_ENV='test';
process.env.FIREBASE_SERVICE_ACCOUNT=JSON.stringify({project_id:'gen-lang-client-0382531831',client_email:'test@example.com',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
const canBindLocalServer=await new Promise<boolean>(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(0,'127.0.0.1',()=>probe.close(()=>resolve(true)));});
const routeTest=canBindLocalServer?test:test.skip;
const {app,db}=await import('../server');
const memory=new AppointmentMemory();
(db as any).doc=memory.doc;(db as any).collection=memory.collection;(db as any).runTransaction=memory.runTransaction;(db as any).getAll=memory.getAll;(db as any).batch=memory.batch.bind(memory);(db as any).recursiveDelete=memory.recursiveDelete;
const auth=getAuth();
(auth as any).verifyIdToken=async(token:string)=>{if(!['owner','stale','super','stale-super'].includes(token))throw Error('bad token');const isSuper=token.includes('super');return {uid:isSuper?'super':'owner',email:isSuper?'bmatan200@gmail.com':'owner@example.com',auth_time:Math.floor(Date.now()/1000)-(token.startsWith('stale')?300:0),firebase:{sign_in_provider:'password'}};};
(auth as any).getUser=async(uid:string)=>uid==='super'?{uid,email:'bmatan200@gmail.com',disabled:false,customClaims:{role:'super_admin'}}:{uid:'owner',email:'owner@example.com',disabled:false,customClaims:{role:'business_admin',tenantId:'audit_test'}};
const nativeFetch=globalThis.fetch;let smsText='';
globalThis.fetch=async(input:any,init?:any)=>{if(String(input).startsWith('https://api.telnyx.com/')){smsText=JSON.parse(init.body).text;return new Response(JSON.stringify({data:{id:'fake_otp',to:[{status:'queued'}]}}),{status:200});}if(!String(input).startsWith('http://127.0.0.1:'))throw Error('network blocked in route tests');return nativeFetch(input,init);};
let server:any,base:string,saved:any,moved:any;
const appointment={customer_name:'מיכל ישראלי',customer_phone:'0541234567',service_id:1,service_name:'לק ג׳ל כולל מניקור',appointment_date:'2030-06-02',start_time:'10:00',end_time:'11:00',createdAt:'1999-01-01',status:'cancelled'};
async function api(path:string,body:any={},token?:string,tenant='audit_test'){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-tenant-id':tenant,'x-operation-context':token?'admin':'customer',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {http:r.status,...await r.json()};}
before(async()=>{if(!canBindLocalServer)return;memory.put('tenants/audit_test',{status:'active',name:'Test',ownerAuthUid:'owner'});memory.put('adminUsers/owner',{disabled:false,role:'business_admin',tenantId:'audit_test'});memory.put('tenants/audit_test/settings/config',{services:[{id:1,name:appointment.service_name,duration_minutes:60,price:100}],scheduleSettings:{businessOpen:'08:00',businessClose:'22:00',fridayOpen:'08:00',fridayClose:'22:00'}});memory.put('tenants/audit_test/private_settings/sms_provider',{provider:'telnyx',telnyxApiKey:'fake',telnyxFrom:'Test',telnyxProfileId:'fake'});server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base='http://127.0.0.1:'+server.address().port;});
after(async()=>{globalThis.fetch=nativeFetch;if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();});
routeTest('phone formatting and legacy statuses remain compatible; same-slot audit records survive',()=>{assert.equal(canonicalPhone('054-1234567'),canonicalPhone('+972541234567'));assert.equal(normalizeAppointment({status:'confirmed'}).status,'active');const rows=[{...appointment,id:'one',status:'cancelled'},{...appointment,id:'two',status:'active'}] as any;assert.equal(deduplicateAppointments(rows).length,2);assert.equal(getDailySlotsOccupancy(appointment.appointment_date,[{...rows[1],archivedAt:'now'}],60,'10:00','11:00').every(s=>s.status==='free'),true);});
routeTest('server rejects missing full name, phone and treatment for client and admin',async()=>{for(const token of [undefined,'owner'])for(const invalid of [{customer_name:'מיכל'},{customer_phone:''},{service_id:0,service_name:''}]){const result=await api('/api/appointments/book',{appointment:{...appointment,...invalid}},token);assert.equal(result.success,false);}});
routeTest('booking ignores caller status/creation timestamp; creation audit and canonical fields are saved',async()=>{saved=await api('/api/appointments/book',{appointment,requestId:'book_one'});assert.equal(saved.success,true);const a=memory.values.get('tenants/audit_test/appointments/book_one');assert.equal(a.status,'active');assert.notEqual(a.createdAt,appointment.createdAt);assert.equal(a.createdAt,a.created_at);assert.equal(a.createdAt,a.updatedAt);assert.equal(a.customer_phone_normalized,'972541234567');assert.equal([...memory.values.keys()].filter(k=>k.startsWith('tenants/audit_test/appointments/book_one/audit/')).length,1);const publicList=await api('/api/appointments/list');assert.equal(publicList.appointments[0].customer_name,'תפוס');const own=await api('/api/appointments/list',{capabilities:{[saved.id]:saved.accessToken}});assert.equal(own.appointments[0].customer_name,appointment.customer_name);});
routeTest('unauthorized cancellation and empty admin reason fail; client cancellation retains original createdAt',async()=>{const original=memory.values.get('tenants/audit_test/appointments/book_one').createdAt;assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one'})).success,false);assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one'},'owner')).success,false);assert.equal((await api('/api/appointments/cancel',{appointmentId:'book_one',accessToken:saved.accessToken,cancellationReason:'לא יכולה להגיע'})).success,true);const a=memory.values.get('tenants/audit_test/appointments/book_one');assert.equal(a.createdAt,original);assert.equal(a.cancelledBy,'client');assert.ok(a.cancelledAt);assert.equal(a.cancellationReason,'לא יכולה להגיע');assert.equal((await api('/api/appointments/list')).appointments.length,0);assert.equal((await api('/api/appointments/list',{},'owner')).appointments[0].status,'cancelled');});
routeTest('rebooking cancelled slot succeeds, reschedule keeps original and customer capability follows new ID',async()=>{const second=await api('/api/appointments/book',{appointment,requestId:'book_two'});assert.equal(second.success,true);const original=memory.values.get('tenants/audit_test/appointments/book_two');moved=await api('/api/admin/appointments/update',{appointmentId:'book_two',appointment:{start_time:'12:00',end_time:'13:00',createdAt:'tamper'}},'owner');assert.equal(moved.success,true);const old=memory.values.get('tenants/audit_test/appointments/book_two');assert.equal(old.status,'rescheduled');assert.equal(old.createdAt,original.createdAt);assert.equal(old.rescheduledTo,moved.id);assert.equal(memory.values.get('tenants/audit_test/appointments/'+moved.id).rescheduledFrom,'book_two');const list=await api('/api/appointments/list',{capabilities:{book_two:second.accessToken}});assert.equal(list.appointments[0].customer_name,appointment.customer_name);assert.equal(list.appointments[0].id,moved.id);const rows=(await api('/api/appointments/list',{},'owner')).appointments;assert.equal(rows.length,3);});
routeTest('ordinary edits preserve createdAt and add before/after history; conflicts roll back',async()=>{const before=memory.values.get('tenants/audit_test/appointments/'+moved.id);assert.equal((await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{notes:'edited',createdAt:'tamper'}},'owner')).success,true);const after=memory.values.get('tenants/audit_test/appointments/'+moved.id);assert.equal(after.createdAt,before.createdAt);assert.equal(after.notes,'edited');const book=await api('/api/appointments/book',{appointment,requestId:'conflict'});assert.equal(book.success,true);const conflict=await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{start_time:'10:00',end_time:'11:00'}},'owner');assert.equal(conflict.success,false);assert.equal(memory.values.get('tenants/audit_test/appointments/'+moved.id).start_time,'12:00');});
routeTest('SMS verification restores cross-browser appointments and remains persistent',async()=>{const start=await api('/api/customer/recovery/start',{phone:'+972541234567'});assert.equal(start.success,true);const code=smsText.match(/\d{6}/)![0];assert.equal((await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code:'000000'})).success,false);const recovery=await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code});assert.equal(recovery.success,true);assert.equal((await api('/api/customer/recovery/verify',{phone:appointment.customer_phone,challenge:start.challenge,code})).success,false);const accessKey=[...memory.values.keys()].find(k=>k.startsWith('tenants/audit_test/customer_access/'))!;const accessRecord=memory.values.get(accessKey);assert.equal(accessRecord.persistent,true);accessRecord.expiresAt=Date.now()-1;const accessCheck=await api('/api/customer/access/check',{phone:appointment.customer_phone,customerAccess:recovery.customerAccess});assert.equal(accessCheck.verified,true);const list=await api('/api/appointments/list',{customerAccess:recovery.customerAccess});assert.ok(list.appointments.some((a:any)=>a.customer_name===appointment.customer_name));assert.ok(list.appointments.every((a:any)=>a.customer_name===appointment.customer_name));});
routeTest('owner exports own calendar without reset authorization; reports respect inclusive date ranges and tenant isolation',async()=>{
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
 assert.equal((await api('/api/super-admin/calendar/reset',{tenantId:'audit_test',exportId:'fake',downloadConfirmed:true},'owner')).http,404);
 assert.equal(JSON.stringify([...memory.values]),before);
});
routeTest('super admin export/reset enforce recent auth and refuse stale snapshots',async()=>{
 assert.equal((await api('/api/super-admin/calendar/export',{tenantId:'audit_test'},'stale-super')).success,false);
 const exported=await api('/api/super-admin/calendar/export',{tenantId:'audit_test'},'super');assert.equal(exported.success,true);
 await api('/api/admin/appointments/update',{appointmentId:moved.id,appointment:{notes:'changed after export'}},'owner');
 assert.equal((await api('/api/super-admin/calendar/reset',{tenantId:'audit_test',exportId:exported.exportId,digest:exported.digest,downloadConfirmed:true},'super')).success,false);
});
routeTest('removed reset and test wipe endpoints return 404 without modifying records',async()=>{
 const before=JSON.stringify([...memory.values]);
 for(const route of ['/api/super-admin/calendar/reset','/api/super-admin/tenant-data-wipe/execute'])assert.equal((await api(route,{tenantId:'audit_test'},'super')).http,404);
 assert.equal(JSON.stringify([...memory.values]),before);
 assert.equal((await api('/api/appointments/book',{appointment:{...appointment,start_time:'14:00',end_time:'15:00'},requestId:'after_reset'})).success,true);
});
routeTest('business owner cannot read audit or reset another tenant',async()=>{assert.equal((await api('/api/admin/appointments/audit',{appointmentId:moved.id},'owner','other')).success,false);assert.equal((await api('/api/admin/calendar/export',{},'owner','other')).success,false);});
routeTest('business PNG icons render at both installable dimensions, including embedded raster artwork',async()=>{
 const {default:sharp}=await import('sharp');
 for(const icon of ['flower_purple','hairScissorsGem_purple']) for(const size of [192,512]){
  const r=await fetch(base+`/tenant-admin-icons/${icon}.png?size=${size}&v=43`);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');const metadata=await sharp(Buffer.from(await r.arrayBuffer())).metadata();assert.equal(metadata.width,size);assert.equal(metadata.height,size);
 }
});
routeTest('admin cancellation records mandatory reason and immutable creation time',async()=>{
 const original=structuredClone(memory.values.get('tenants/audit_test/appointments/after_reset'));
 const cancelled=await api('/api/admin/appointments/delete',{appointmentId:'after_reset',cancellationReason:'הלקוחה ביקשה ביטול'},'owner');assert.equal(cancelled.success,true);
 const row=memory.values.get('tenants/audit_test/appointments/after_reset');assert.equal(row.cancelledBy,'admin');assert.equal(row.cancellationReason,'הלקוחה ביקשה ביטול');assert.equal(row.createdAt,original.createdAt);assert.equal(row.updatedAt,row.cancelledAt);
 const audit=await api('/api/admin/appointments/audit',{appointmentId:'after_reset'},'owner');assert.ok(audit.events.some((e:any)=>e.type==='cancelled'&&e.reason==='הלקוחה ביקשה ביטול'));
});

routeTest('business suspension is reversible, blocks owner and booking, and disables durable SMS schedules',async()=>{
 const before=structuredClone(memory.values.get('tenants/audit_test/appointments/after_reset'));
 const route='/api/super-admin/tenants/audit_test/status';
 assert.equal((await api(route,{suspended:true},'owner')).http,403);
 assert.equal((await api(route,{suspended:true},'super')).success,true);
 assert.equal(memory.values.get('tenants/audit_test').status,'suspended');
 assert.equal(memory.values.get('sms_schedules/audit_test_today').enabled,false);
 assert.equal((await api('/api/appointments/book',{appointment,requestId:'blocked'})).success,false);
 assert.equal((await api('/api/admin/settings/services',{services:[]},'owner')).success,false);
 assert.equal((await api(route,{suspended:false},'super')).success,true);
 assert.equal(memory.values.get('sms_schedules/audit_test_today').enabled,true);
 assert.deepEqual(memory.values.get('tenants/audit_test/appointments/after_reset'),before);
});
routeTest('full export and permanent deletion include nested audit, protect other businesses, and reject missing backup/auth',async()=>{
 memory.put('tenants/keep',{status:'active',name:'Keep'});
 memory.put('tenants/keep/appointments/one',{customer_name:'Keep'});
 memory.put('tenants/audit_test/orphans/missing/events/one',{message:'orphan audit'});
 memory.put('sms_delivery_jobs/remove',{tenantId:'audit_test',messageId:'one'});
 memory.put('sms_delivery_jobs/keep',{tenantId:'keep',messageId:'two'});
 memory.put('domains/test.example.com',{tenantId:'audit_test'});
 memory.put('tenantAdminIcons/flower_purple',{tenantId:'audit_test'});
 await api('/api/super-admin/tenants/audit_test/status',{suspended:true},'super');
 assert.equal((await api('/api/super-admin/tenants/audit_test/export',{},'owner')).http,403);
 const exported=await api('/api/super-admin/tenants/audit_test/export',{},'super');assert.equal(exported.success,true);
 assert.ok(JSON.stringify(exported.backup).includes('orphan audit'));
 assert.ok(exported.backup.activityCsv.includes('מיכל'));
 assert.ok(!JSON.stringify(exported.backup).includes('accessTokenHash'));
 assert.ok(!JSON.stringify(exported.backup).includes('telnyxApiKey'));
 assert.equal(exported.backup.tenant.collections.appointments.find((a:any)=>a.id==='after_reset').collections.audit.length>0,true);
 const deleteApi=async(token:string,body:any)=>{const r=await fetch(base+'/api/super-admin/tenants/audit_test',{method:'DELETE',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});return {http:r.status,...await r.json()};};
 const body={confirmation:'audit_test',downloadConfirmed:true,exportId:exported.exportId};
 assert.equal((await deleteApi('owner',body)).http,403);
 assert.equal((await deleteApi('stale-super',body)).success,false);
 assert.equal((await deleteApi('super',{...body,downloadConfirmed:false})).success,false);
 assert.equal((await deleteApi('super',{...body,exportId:'missing'})).success,false);
 (auth as any).deleteUser=async(uid:string)=>{assert.equal(uid,'owner');};
 assert.equal((await deleteApi('super',body)).success,true);
 assert.ok(![...memory.values.keys()].some(k=>k==='tenants/audit_test'||k.startsWith('tenants/audit_test/')));
 assert.ok(![...memory.values.values()].some(d=>d.tenantId==='audit_test'));
 assert.ok(memory.values.has('tenants/keep/appointments/one'));
 assert.ok(memory.values.has('sms_delivery_jobs/keep'));
});

routeTest('owner full export is tenant-scoped, honors date range, includes all customers and excludes capability/provider secrets',async()=>{
 memory.put('tenants/audit_test',{status:'active',name:'Test',ownerAuthUid:'owner'});
 memory.put('adminUsers/owner',{disabled:false,role:'business_admin',tenantId:'audit_test'});
 memory.put('tenants/audit_test/settings/config',{services:[{id:1,name:'לק ג׳ל',duration_minutes:60,price:100}],scheduleSettings:{businessOpen:'08:00',businessClose:'22:00'}});
 memory.put('tenants/audit_test/customers/cust_0541234567',{full_name:'מיכל ישראלי',phone:'0541234567',notes:'regular',created_at:'2029-01-01'});
 memory.put('tenants/audit_test/appointments/export_example',{...appointment,status:'active'});
 memory.put('tenants/audit_test/appointments/export_example/audit/created',{type:'created',at:'2030-06-01',after:appointment});
 memory.put('tenants/other/customers/cust_1',{full_name:'Other',phone:'1'});
 memory.put('tenants/audit_test/sms_logs/log1',{tenantId:'audit_test',appointmentDate:'2030-06-02',recipientPhone:'0541234567',status:'sent',message:'reminder'});
 memory.put('tenants/audit_test/sms_logs/log2',{tenantId:'audit_test',appointmentDate:'2030-05-02',recipientPhone:'0541234567',status:'sent'});
 memory.put('tenants/audit_test/private_settings/sms_provider',{telnyxApiKey:'secret-key'});
  const data=await api('/api/admin/business-export',{period:'range',startDate:'2030-06-01',endDate:'2030-06-30'},'owner');
  assert.equal(data.success,true);assert.equal(data.customers.length,1);assert.equal(data.appointments.every((a:any)=>a.appointment_date>='2030-06-01'&&a.appointment_date<='2030-06-30'),true);
 assert.equal(data.smsLogs.length,1);assert.ok(data.appointments.some((a:any)=>a.id==='export_example'&&a.audit.length));
 assert.ok(!JSON.stringify(data).includes('accessTokenHash'));assert.ok(!JSON.stringify(data).includes('secret-key'));
 assert.equal((await api('/api/admin/business-export',{period:'range',startDate:'2030-06-01',endDate:'2030-06-30'},'owner','other')).success,false);
});

routeTest('Super Admin all-customer CSV includes tenant labels, skips deleted tenants and is permission-gated',async()=>{
 memory.put('tenants/csv_one',{name:'עסק בדיקה',status:'active'});
 memory.put('tenants/csv_one/customers/c1',{full_name:'לקוחה',phone:'0501234567',notes:'=test'});
 memory.put('tenants/csv_gone',{name:'נמחק',status:'deleted'});
 memory.put('tenants/csv_gone/customers/c2',{full_name:'לא לייצא',phone:'0509999999'});
  const denied=await fetch(base+'/api/super-admin/customers/export.csv',{headers:{authorization:'Bearer owner'}});assert.equal(denied.status,403);
  const response=await fetch(base+'/api/super-admin/customers/export.csv',{headers:{authorization:'Bearer super'}});assert.equal(response.status,200);
 const csv=await response.text();assert.ok(csv.includes('עסק בדיקה'));assert.ok(csv.includes("'=test"));assert.ok(!csv.includes('לא לייצא'));
});

routeTest('interrupted deletion stays blocked and can be retried without a new export',async()=>{
 memory.put('tenants/retry_test',{status:'trial',name:'Retry'});
 memory.put('tenants/retry_test/customers/one',{full_name:'Retry'});
 await api('/api/super-admin/tenants/retry_test/status',{suspended:true},'super');
 const exported=await api('/api/super-admin/tenants/retry_test/export',{},'super');assert.equal(exported.success,true);
 const remove=async()=>{const r=await fetch(base+'/api/super-admin/tenants/retry_test',{method:'DELETE',headers:{'Content-Type':'application/json',authorization:'Bearer super'},body:JSON.stringify({confirmation:'retry_test',downloadConfirmed:true,exportId:exported.exportId})});return r.json();};
 (db as any).recursiveDelete=async()=>{throw Error('interrupted storage request');};
 assert.equal((await remove()).success,false);
 assert.equal(memory.values.get('tenants/retry_test').status,'deleting');
 assert.equal((await api('/api/super-admin/tenants/retry_test/status',{suspended:false},'super')).success,false);
 (db as any).recursiveDelete=memory.recursiveDelete;
 assert.equal((await remove()).success,true);
 assert.ok(![...memory.values.keys()].some(k=>k.startsWith('tenants/retry_test')));
});

routeTest('activity cleanup requires fresh auth and a current backup; removes full history and customers while preserving business configuration and other tenants',async()=>{
 const id='cleanup_test',root='tenants/'+id,path=`/api/super-admin/tenants/${id}`;
 memory.put(root,{status:'active',name:'Cleanup',ownerAuthUid:'cleanup_owner',calendarRevision:7,totalRevenue:100});
 const config={services:[{id:1,name:'Service',price:100}],scheduleSettings:{businessOpen:'08:00',businessClose:'20:00'}};
 memory.put(root+'/settings/config',config);memory.put(root+'/private_settings/sms_provider',{key:'preserve'});
 memory.put('adminUsers/cleanup_owner',{tenantId:id,role:'business_admin'});memory.put('domains/cleanup.example.com',{tenantId:id});
 for(const name of ['appointments','customers','sms_logs','whatsapp_logs','customer_access','customer_recovery','booking_days','reminder_locks','calendar_resets','calendar_exports'])memory.put(`${root}/${name}/one`,{tenantId:id,value:'test'});
 memory.put(root+'/appointments/one/audit/cancelled',{type:'cancelled'});
 memory.put(root+'/appointments/missing/audit/orphan',{type:'edited'});
 memory.put('appointments/old_cleanup',{tenantId:id,customer_name:'Legacy'});
 memory.put('customers/old_cleanup',{tenantId:id,full_name:'Legacy'});
 memory.put('sms_delivery_jobs/cleanup',{tenantId:id});memory.put('sms_delivery_jobs/other_cleanup',{tenantId:'keep'});
 memory.put('tenants/keep/appointments/keep_cleanup',{value:'keep'});
 const body={confirmation:id,downloadConfirmed:true,exportId:'missing'};
 assert.equal((await api(path+'/activity/clear',body,'owner')).http,403);
 assert.equal((await api(path+'/activity/clear',body,'stale-super')).success,false);
 assert.equal((await api(path+'/activity/clear',body,'super')).success,false);
 await api(path+'/status',{suspended:true},'super');
 const ordinary=await api(path+'/export',{},'super');assert.equal((await api(path+'/activity/clear',{...body,exportId:ordinary.exportId},'super')).success,false);
 const exported=await api(path+'/export',{purpose:'cleanup'},'super');assert.equal(exported.success,true);
 body.exportId=exported.exportId;
 assert.equal((await api(path+'/activity/clear',{...body,confirmation:'keep'},'super')).success,false);
 assert.equal((await api(path+'/activity/clear',{...body,downloadConfirmed:false},'super')).success,false);
 memory.put(root,{calendarRevision:8},true);
 assert.equal((await api(path+'/activity/clear',body,'super')).success,false);
 body.exportId=(await api(path+'/export',{purpose:'cleanup'},'super')).exportId;
 assert.equal((await api(path+'/activity/clear',body,'super')).success,true);
 for(const name of ['appointments','customers','sms_logs','whatsapp_logs','customer_access','customer_recovery','booking_days','reminder_locks','calendar_resets','calendar_exports','lifecycle_exports'])assert.ok(![...memory.values.keys()].some(p=>p.startsWith(`${root}/${name}/`)),name);
 assert.deepEqual(memory.values.get(root+'/settings/config'),config);
 assert.ok(memory.values.has(root+'/private_settings/sms_provider'));assert.ok(memory.values.has('adminUsers/cleanup_owner'));assert.ok(memory.values.has('domains/cleanup.example.com'));
 assert.ok(memory.values.has('tenants/keep/appointments/keep_cleanup'));assert.ok(memory.values.has('sms_delivery_jobs/other_cleanup'));
 assert.ok(!memory.values.has('sms_delivery_jobs/cleanup'));assert.ok(!memory.values.has('appointments/old_cleanup'));assert.ok(!memory.values.has('customers/old_cleanup'));
 assert.equal(memory.values.get(root).status,'suspended');assert.equal(memory.values.get(root).dataCleanupPending,false);assert.equal(memory.values.get(root).totalRevenue,0);
 assert.equal((await api(path+'/status',{suspended:false},'super')).success,true);
});

routeTest('interrupted activity cleanup stays suspended, blocks reactivation and deletion, and resumes using the original backup',async()=>{
 const id='cleanup_retry',root='tenants/'+id,path=`/api/super-admin/tenants/${id}`;
 memory.put(root,{status:'active',name:'Retry'});memory.put(root+'/appointments/one',{value:'trial'});memory.put(root+'/customers/one',{value:'trial'});
 await api(path+'/status',{suspended:true},'super');
 const exported=await api(path+'/export',{purpose:'cleanup'},'super');
 const body={confirmation:id,downloadConfirmed:true,exportId:exported.exportId};
 const remove=(db as any).recursiveDelete;
 try{(db as any).recursiveDelete=async(ref:any)=>{if(ref.path.endsWith('/customers'))throw Error('storage interrupted');return remove(ref);};
  const result=await api(path+'/activity/clear',body,'super');assert.equal(result.success,false);assert.equal(result.cleanupPending,true);
 }finally{(db as any).recursiveDelete=remove;}
 assert.equal(memory.values.get(root).dataCleanupPending,true);
 assert.equal((await api(path+'/status',{suspended:false},'super')).success,false);
 assert.equal((await api(path+'/export',{},'super')).success,false);
 const response=await fetch(base+path,{method:'DELETE',headers:{'Content-Type':'application/json',authorization:'Bearer super'},body:JSON.stringify(body)});assert.equal((await response.json()).success,false);
 assert.equal((await api(path+'/activity/clear',body,'super')).success,true);
 assert.ok(!memory.values.has(root+'/customers/one'));assert.equal(memory.values.get(root).dataCleanupPending,false);
});

routeTest('Alex cleanup includes untagged legacy activity, preserves settings and waits for in-flight SMS',async()=>{
 const id='alex_beauty',root='tenants/'+id,path=`/api/super-admin/tenants/${id}`;
 memory.put(root,{status:'active',name:'Alex'});memory.put(root+'/appointments/trial',{status:'cancelled'});
 memory.put(root+'/settings/config',{services:[{id:1,name:'Keep'}]});
 memory.put('settings/services_config',{services:[{id:1,name:'Keep legacy'}]});
 memory.put('appointments/untagged_trial',{customer_name:'Trial'});memory.put('customers/untagged_trial',{full_name:'Trial'});
 memory.put('sms_logs/sms_alex_beauty_old',{message:'Trial'});memory.put('appointments/other_tenant_trial',{tenantId:'keep'});
 await api(path+'/status',{suspended:true},'super');
 const exported=await api(path+'/export',{purpose:'cleanup'},'super');assert.equal(exported.success,true);
 memory.put(root+'/reminder_locks/sending',{status:'sending',leaseUntil:Date.now()+120_000});
 const body={confirmation:id,downloadConfirmed:true,exportId:exported.exportId};
 assert.equal((await api(path+'/activity/clear',body,'super')).success,false);
 assert.ok(memory.values.has(root+'/appointments/trial'));assert.ok(memory.values.has('appointments/untagged_trial'));
 memory.put(root+'/reminder_locks/sending',{status:'sent'});
 assert.equal((await api(path+'/activity/clear',body,'super')).success,true);
 assert.ok(!memory.values.has('appointments/untagged_trial'));assert.ok(!memory.values.has('customers/untagged_trial'));assert.ok(!memory.values.has('sms_logs/sms_alex_beauty_old'));
 assert.ok(memory.values.has('appointments/other_tenant_trial'));assert.ok(memory.values.has('settings/services_config'));assert.ok(memory.values.has(root+'/settings/config'));
});

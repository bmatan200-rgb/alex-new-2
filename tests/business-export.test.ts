import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessTreeExporter} from '../server/businessExport';
import {AppointmentMemory} from './helpers/appointmentMemory';

function delayedDatabase(memory:AppointmentMemory,delay=2) {
  let active=0,maxActive=0,documentGets=0,batchGets=0;
  const batchSizes:number[]=[];
  async function request<T>(operation:()=>Promise<T>):Promise<T>{
    active++;maxActive=Math.max(maxActive,active);
    try{await new Promise(resolve=>setTimeout(resolve,delay));return await operation();}
    finally{active--;}
  }
  const snapshot=(s:any)=>({...s,ref:reference(s.ref)});
  const collection=(c:any):any=>({...c,listDocuments:()=>request(async()=>(await c.listDocuments()).map(reference))});
  const reference=(r:any):any=>r.__delayed?r:({...r,__delayed:true,
    get:()=>{documentGets++;return request(async()=>snapshot(await r.get()));},
    listCollections:()=>request(async()=>(await r.listCollections()).map(collection)),
  });
  return {
    doc:(path:string)=>reference(memory.doc(path)),
    getAll:(...refs:any[])=>{batchGets++;batchSizes.push(refs.length);return request(async()=>(await memory.getAll(...refs)).reverse().map(snapshot));},
    stats:()=>({active,maxActive,documentGets,batchGets,batchSizes}),
  };
}

async function serialTree(ref:any):Promise<any>{
  const snapshot=await ref.get(),children=await ref.listCollections(),collections:any={};
  for(const child of children){const docs:any[]=[];for(const ref of await child.listDocuments())docs.push({id:ref.id,...await serialTree(ref)});collections[child.id]=docs;}
  return {data:snapshot.data()||{},collections};
}

test('parallel export matches the serial backup, preserves missing parents and stays inside its shared read limit',async()=>{
  const memory=new AppointmentMemory();memory.put('tenants/one',{name:'עסק'});
  for(let i=0;i<25;i++){
    memory.put(`tenants/one/appointments/a${i}`,{customer_name:`לקוחה ${i}`});
    memory.put(`tenants/one/appointments/a${i}/audit/created`,{type:'created',at:'2030-01-01'});
    memory.put(`tenants/one/appointments/a${i}/audit/cancelled`,{type:'cancelled',at:'2030-01-02'});
  }
  memory.put('tenants/one/orphans/missing/events/event',{type:'kept'});
  memory.put('tenants/two/appointments/unrelated',{customer_name:'Other tenant'});
  const database=delayedDatabase(memory),root=database.doc('tenants/one');
  const expected=await serialTree(memory.doc('tenants/one'));
  const actual=await createBusinessTreeExporter(database,4).tree(root);
  assert.deepEqual(actual,expected);
  const stats=database.stats();assert.ok(stats.maxActive>1);assert.ok(stats.maxActive<=4);
  assert.equal(stats.documentGets,1,'only the root should use an individual document read');
  assert.equal(stats.active,0);assert.ok(!JSON.stringify(actual).includes('Other tenant'));
});

test('large collections use batches of at most 100 and reuse a previously fetched root snapshot',async()=>{
  const memory=new AppointmentMemory();memory.put('tenants/one',{name:'One'});
  for(let i=0;i<205;i++)memory.put(`tenants/one/customers/c${String(i).padStart(3,'0')}`,{full_name:`Name ${i}`});
  const database=delayedDatabase(memory,0),root=database.doc('tenants/one');
  const backup=await createBusinessTreeExporter(database,8).tree(root,memory.snapshot(root));
  assert.equal(backup.collections.customers.length,205);
  assert.equal(backup.collections.customers[0].data.full_name,'Name 0');
  assert.equal(backup.collections.customers[204].data.full_name,'Name 204');
  assert.deepEqual(database.stats().batchSizes,[100,100,5]);
  assert.equal(database.stats().documentGets,0);
});

test('a failed batch rejects the export instead of returning a partial backup',async()=>{
  const memory=new AppointmentMemory();memory.put('tenants/one',{name:'One'});memory.put('tenants/one/customers/c1',{name:'Customer'});
  const database=delayedDatabase(memory);
  database.getAll=async()=>{throw new Error('Firestore unavailable');};
  await assert.rejects(createBusinessTreeExporter(database,2).tree(database.doc('tenants/one')),/Firestore unavailable/);
});

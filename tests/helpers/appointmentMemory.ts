import {randomUUID} from 'node:crypto';
// Route-level fake: serializes transactions, stages writes and rejects reads after writes.
// It does not replace the real emulator's rules/index/conflict checks.
export class AppointmentMemory {
 values=new Map<string,any>();tail=Promise.resolve();
 doc=(path:string):any=>({path,id:path.split('/').at(-1),get:async()=>this.snapshot(this.doc(path)),collection:(name:string)=>this.collection(path+'/'+name),set:async(v:any,o:any={})=>this.put(path,v,o.merge),create:async(v:any)=>{if(this.values.has(path))throw Error('exists');this.put(path,v);},update:async(v:any)=>this.put(path,v,true)});
 snapshot=(ref:any):any=>({ref,id:ref.id,exists:this.values.has(ref.path),data:()=>structuredClone(this.values.get(ref.path))});
 put(path:string,v:any,merge=false){this.values.set(path,structuredClone(merge?{...this.values.get(path),...v}:v));}
 collection=(path:string):any=>this.query(path,[]);
 query(path:string,filters:any[],order?:string):any {return {doc:(id=randomUUID())=>this.doc(path+'/'+id),where:(k:string,op:string,v:any)=>this.query(path,[...filters,[k,op,v]],order),orderBy:(k:string)=>this.query(path,filters,k),get:async()=>{const docs=[...this.values.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(k=>this.snapshot(this.doc(k))).filter(d=>filters.every(([k,op,v])=>op==='=='?d.data()[k]===v:op==='>='?d.data()[k]>=v:op==='<'?d.data()[k]<v:op==='>'?d.data()[k]>v:d.data()[k]<=v));if(order)docs.sort((a,b)=>String(a.data()[order]).localeCompare(String(b.data()[order])));return {docs,empty:!docs.length,size:docs.length};}};}
 getAll=async(...refs:any[])=>refs.map(r=>this.snapshot(r));
 runTransaction=async(fn:any)=>{const work=this.tail.then(async()=>{const pending:any[]=[];let writing=false;const read=async(r:any)=>{if(writing)throw Error('transaction read after write');return r.path?this.snapshot(r):r.get();};const tx={get:read,getAll:async(...r:any[])=>Promise.all(r.map(read)),create:(r:any,v:any)=>{writing=true;if(this.values.has(r.path))throw Error('exists');pending.push(()=>this.put(r.path,v));},update:(r:any,v:any)=>{writing=true;pending.push(()=>this.put(r.path,v,true));},set:(r:any,v:any,o:any={})=>{writing=true;pending.push(()=>this.put(r.path,v,o.merge));}};const result=await fn(tx);pending.forEach(f=>f());return result;});this.tail=work.then(()=>{},()=>{});return work;};
 batch(){const pending:any[]=[];return {update:(r:any,v:any)=>pending.push(()=>this.put(r.path,v,true)),commit:async()=>pending.forEach(f=>f())};}
}

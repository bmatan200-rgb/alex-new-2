// Deterministic Firestore-shaped test double. Transactions are serialized;
// it exercises scheduler decisions, not Firestore's emulator/rules/indexes.
export class MemoryFirestore {
  values=new Map<string,any>(); reads=0; writes=0; dueQueries=0; tenantQueries=0; maxDueResults=0;
  private tail:Promise<any>=Promise.resolve();
  doc(path:string):any {
    const db=this;
    const ref:any={path,id:path.split('/').at(-1),get:async()=>db.read(ref),
      set:async(value:any,options:any={})=>db.put(ref,value,options.merge),
      update:async(value:any)=>db.put(ref,value,true)};
    return ref;
  }
  read(ref:any):any {this.reads++;const value=this.values.get(ref.path);return {ref,id:ref.id,exists:value!==undefined,data:()=>value===undefined?undefined:structuredClone(value)};}
  put(ref:any,value:any,merge=false){this.writes++;this.values.set(ref.path,merge?{...this.values.get(ref.path),...structuredClone(value)}:structuredClone(value));}
  async runTransaction(fn:any){
    const work=this.tail.then(async()=>{
      const pending:Array<()=>void>=[];
      const result=await fn({get:async(ref:any)=>this.read(ref),set:(ref:any,value:any,opts:any={})=>pending.push(()=>this.put(ref,value,opts.merge)),update:(ref:any,value:any)=>pending.push(()=>this.put(ref,value,true))});
      pending.forEach(write=>write());return result;
    });
    this.tail=work.catch(()=>{});return work;
  }
  collection(path:string):any {
    const db=this;
    function query(filters:any[]=[],order='__name__',limit=Infinity,after=''):any {
      return {doc:(id:string)=>db.doc(`${path}/${id}`),where:(key:string,op:string,value:any)=>query([...filters,[key,op,value]],order,limit,after),
        orderBy:(key:string)=>query(filters,key,limit,after),limit:(n:number)=>query(filters,order,n,after),startAfter:(snap:any)=>query(filters,order,limit,snap.id),
        get:async()=>{
          let entries=[...db.values.entries()].filter(([key])=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1);
          entries=entries.filter(([key,value])=>key.split('/').at(-1)!>after&&filters.every(([field,op,target])=>op==='=='?value[field]===target:typeof value[field]==='number'&&value[field]<=target));
          entries.sort(([a,av],[b,bv])=>order==='__name__'?a.localeCompare(b):av[order]-bv[order]||a.localeCompare(b));
          const docs=entries.slice(0,limit).map(([key])=>db.read(db.doc(key)));
          if(!docs.length)db.reads++; // Firestore minimum for an empty query.
          if(path==='sms_schedules'){db.dueQueries++;db.maxDueResults=Math.max(db.maxDueResults,docs.length);}
          if(path==='tenants')db.tenantQueries++;
          return {docs,size:docs.length,empty:!docs.length};
        }};
    }
    return query();
  }
}

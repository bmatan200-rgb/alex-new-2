import {runBounded} from './reminderScheduler';

// One shared limit per export, including recursive reads. Never hold a slot
// while descending into a document, otherwise a deep tree could deadlock.
export function createBusinessTreeExporter(db:any, concurrency=20) {
  if(!Number.isInteger(concurrency)||concurrency<1)throw new Error('Invalid export concurrency');
  let active=0;
  const waiting:Array<()=>void>=[];
  async function read<T>(operation:()=>Promise<T>):Promise<T> {
    await new Promise<void>(resolve=>{if(active<concurrency){active++;resolve();}else waiting.push(resolve);});
    try{return await operation();}
    finally{const next=waiting.shift();if(next)next();else active--;}
  }
  async function tree(ref:any, knownSnapshot?:any):Promise<any> {
    const [snapshot,children]=await Promise.all([
      knownSnapshot?Promise.resolve(knownSnapshot):read(()=>ref.get()),
      read<any[]>(()=>ref.listCollections()),
    ]);
    const entries=await Promise.all(children.map(async child=>{
      // Keep missing parent documents: their subcollections may still contain
      // appointment history or other business records.
      const refs=await read<any[]>(()=>child.listDocuments());
      const documents:any[]=new Array(refs.length);
      const batches=Array.from({length:Math.ceil(refs.length/100)},(_,i)=>({offset:i*100,refs:refs.slice(i*100,(i+1)*100)}));
      await runBounded(batches,concurrency,async batch=>{
        const snapshots=await read<any[]>(()=>db.getAll(...batch.refs));
        await runBounded(snapshots,concurrency,async snapshot=>{
          const index=batch.refs.findIndex((r:any)=>r.path===snapshot.ref.path);
          documents[batch.offset+index]={id:snapshot.id,...await tree(snapshot.ref,snapshot)};
        });
      });
      return [child.id,documents] as const;
    }));
    return {data:snapshot.data()||{},collections:Object.fromEntries(entries)};
  }
  return {tree,read};
}

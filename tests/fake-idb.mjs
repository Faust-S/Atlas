// Minimal asynchronous IndexedDB test double, for Node smoke tests only.
// Browser qualification uses the real implementation, never this mock.
export function fakeIndexedDB(){
 const databases=new Map();
 return {
  open(name,version){
   const request={result:null,error:null,onupgradeneeded:null,onsuccess:null,onerror:null};
   queueMicrotask(()=>{
    try{
     let record=databases.get(name),upgraded=false;
     if(!record){record={version,stores:new Map()};databases.set(name,record);upgraded=true}
     if(record.version>version)throw Error("VersionError");
     if(record.version<version){record.version=version;upgraded=true}
     const db={
      objectStoreNames:{contains:key=>record.stores.has(key)},
      createObjectStore(key){if(record.stores.has(key))throw Error("ConstraintError");record.stores.set(key,new Map())},
      close(){},
      transaction(key,mode){
       const source=record.stores.get(key);
       if(!source)throw Error("NotFoundError");
       const copy=new Map([...source].map(([k,v])=>[k,structuredClone(v)]));
       let pending=0,completed=false,aborted=false;
       const tx={error:null,oncomplete:null,onabort:null,onerror:null,
        abort(){if(completed||aborted)return;aborted=true;queueMicrotask(()=>tx.onabort?.())},
        objectStore(requested){
         if(requested!==key)throw Error("NotFoundError");
         function schedule(fn){
          if(completed||aborted)throw Error("TransactionInactiveError");
          pending++;
          const req={result:null,error:null,onsuccess:null,onerror:null};
          queueMicrotask(()=>{
           if(aborted)return;
           try{req.result=fn();req.onsuccess?.({target:req})}
           catch(e){req.error=e;tx.error=e;req.onerror?.({target:req});tx.onerror?.({target:tx});tx.abort()}
           finally{pending--;queueMicrotask(finish)}
          });
          return req;
         }
         return {
          get:id=>schedule(()=>structuredClone(copy.get(id))),
          put:value=>schedule(()=>{copy.set(value.id,structuredClone(value));return value.id}),
          delete:id=>schedule(()=>{copy.delete(id)})
         };
        }
       };
       function finish(){
        if(completed||aborted||pending!==0)return;
        completed=true;
        if(mode==="readwrite")record.stores.set(key,copy);
        tx.oncomplete?.();
       }
       return tx;
      }
     };
     request.result=db;
     if(upgraded)request.onupgradeneeded?.();
     request.onsuccess?.();
    }catch(e){request.error=e;request.onerror?.()}
   });
   return request;
  }
 };
}

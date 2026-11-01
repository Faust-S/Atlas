import test from "node:test";
import assert from "node:assert/strict";
import {fakeIndexedDB} from "./fake-idb.mjs";
import {createStandaloneStore,LEGACY_KEY} from "../src/storage.mjs";
import {empty,createProject,serialize} from "../src/core.mjs";

const make=(name,db=fakeIndexedDB(),legacy=new Map())=>({
 db,legacy,
 options:{factory:db,dbName:"atlas-test-"+name,legacy:{getItem:key=>legacy.get(key)??null}}
});
const makeStore=fixture=>createStandaloneStore(fixture.options);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function replaceHead(factory,name,mutate){
 const request=factory.open("atlas-test-"+name,1);
 const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 await new Promise((resolve,reject)=>{
  const tx=db.transaction("snapshots","readwrite"),store=tx.objectStore("snapshots"),get=store.get("head");
  get.onsuccess=()=>store.put(mutate(get.result));
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 await tick();
}
test("legacy Atlas JSON migrates without removing the original",async()=>{
 const fixture=make("migration"),original=createProject(empty(),{name:"Preserved project",type:"research"}).state;
 fixture.legacy.set(LEGACY_KEY,serialize(original));
 const store=makeStore(fixture),initial=await store.load();
 assert.equal(initial.status,"migrated");
 assert.deepEqual(initial.state,original);
 assert.equal(fixture.legacy.get(LEGACY_KEY),serialize(original));
 assert.deepEqual((await makeStore(fixture).load()).state,original);
});
test("stale tab rejected, corrupted head recovered only on explicit approval",async()=>{
 const fixture=make("rollback"),a=makeStore(fixture),b=makeStore(fixture);
 await a.load();await b.load();
 const first=createProject(empty(),{name:"A"}).state;
 await a.save(first);
 await assert.rejects(b.save(createProject(empty(),{name:"Stale"}).state),/другой вкладке/);
 const second=createProject(first,{name:"B"}).state;
 await a.save(second);
 await replaceHead(fixture.db,"rollback",rec=>({...rec,json:"broken"}));
 const recovery=makeStore(fixture),result=await recovery.load();
 assert.equal(result.status,"recovery");
 assert.equal(result.state.projects.length,1);
 await assert.rejects(recovery.save(second),/восстановление/);
 await recovery.restorePrevious();
 const reopened=await makeStore(fixture).load();
 assert.equal(reopened.status,"ready");
 assert.equal(reopened.state.projects.length,1);
});
test("invalid legacy JSON is not silently replaced, valid imported snapshot can recover",async()=>{
 const fixture=make("corrupt");
 fixture.legacy.set(LEGACY_KEY,"{invalid}");
 const store=makeStore(fixture);
 await assert.rejects(store.load(),/Прежние данные Atlas повреждены/);
 assert.equal(fixture.legacy.get(LEGACY_KEY),"{invalid}");
 const repaired=createProject(empty(),{name:"Restored"}).state;
 await store.replace(repaired);
 const read=await makeStore(fixture).load();
 assert.equal(read.state.projects[0].name,"Restored");
});

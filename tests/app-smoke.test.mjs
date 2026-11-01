import test from "node:test";
import assert from "node:assert/strict";
import {fakeIndexedDB} from "./fake-idb.mjs";
import {createStandaloneStore} from "../src/storage.mjs";

test("UI survives IndexedDB persistence and completes project → evidence → approved change without prompts",async()=>{
 const names=["document","localStorage","indexedDB","FormData","prompt","confirm"];
 const previous=Object.fromEntries(names.map(name=>[name,globalThis[name]]));
 const controls={},storage=new Map();
 const root={innerHTML:"",handlers:{},addEventListener(type,callback){this.handlers[type]=callback}};
 const mounts={"#atlas-editor-slot":{innerHTML:""},"#atlas-schedule":{innerHTML:""},"#atlas-relations":{innerHTML:""},"#atlas-trace":{innerHTML:""}};
 globalThis.indexedDB=fakeIndexedDB();
 globalThis.document={querySelector(selector){return selector==="#app"?root:mounts[selector]||(controls[selector]??={onclick:null,onchange:null,click(){}})}};
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
 globalThis.FormData=class{constructor(form){this.form=form}get(key){return this.form.values[key]??""}};
 globalThis.prompt=()=>{throw Error("Unexpected native prompt")};
 globalThis.confirm=()=>true;
 const click=action=>root.handlers.click({target:{closest:()=>({dataset:{action}})}});
 const submit=values=>root.handlers.submit({target:{id:"atlas-editor-form",values},preventDefault(){}});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const assertNoError=()=>assert.equal(controls["#message"]?.textContent||"","","UI reported a failure");
 const persisted=async()=>{const s=createStandaloneStore({factory:globalThis.indexedDB,legacy:globalThis.localStorage});return(await s.load()).state};
 try{
  await import("../src/app.mjs?indexeddb-ui-smoke");
  await settle();
  assert.match(root.innerHTML,/Что требует внимания/);
  assert.match(controls["#storage-status"].innerHTML,/IndexedDB/);
  await click("new");assertNoError();
  assert.match(mounts["#atlas-editor-slot"].innerHTML,/Новый проект/);
  await submit({name:"Home renovation",type:"personal",goal:"Finish renovation"});assertNoError();
  assert.match(root.innerHTML,/Home renovation/);
  await click("target");assertNoError();
  await submit({title:"Working budget",desired:"Approved budget",intent:"committed"});assertNoError();
  assert.match(mounts["#atlas-trace"].innerHTML,/Working budget/);
  let snapshot=await persisted(),targetId=snapshot.projects[0].targets[0].id;
  await click("finding");assertNoError();
  await submit({targetId,result:"partial",level:"implementation",note:"Estimate pending"});assertNoError();
  assert.match(mounts["#atlas-trace"].innerHTML,/Реализовано частично/);
  await click("proposal");assertNoError();
  await submit({title:"Budget change",targetId,description:"Update materials price"});assertNoError();
  snapshot=await persisted();
  const changeId=snapshot.projects[0].changes[0].id;
  await click("change:"+changeId);assertNoError();
  await submit({status:"approved",rationale:"Plan reviewed and approved by owner"});assertNoError();
  snapshot=await persisted();
  assert.equal(snapshot.projects[0].changes[0].status,"approved");
  await click("back");assertNoError();
  assert.match(root.innerHTML,/Что требует внимания/);
  assert.match(root.innerHTML,/Решения ожидают|решений ожидается|требований к проверке|Home renovation/);
  assert.match(root.innerHTML,/Home renovation/);
  assert.doesNotMatch(root.innerHTML,/Релиз подтверждён/);
  root.handlers.change({target:{id:"atlas-command-filter",value:"evidence"}});
  assert.match(controls["#atlas-command-rows"].innerHTML,/Working budget/);
  await click("inspect:"+encodeURIComponent(snapshot.projects[0].id)+":evidence:"+encodeURIComponent(targetId));assertNoError();
  assert.match(mounts["#atlas-trace"].innerHTML,/Working budget/);
 }finally{
  for(const name of names)if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];
 }
});

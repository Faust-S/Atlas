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
 const persisted=async()=>{const s=createStandaloneStore({factory:globalThis.indexedDB,legacy:globalThis.localStorage});return(await s.load()).state};
 try{
  await import("../src/app.mjs?indexeddb-ui-smoke");
  await settle();
  assert.match(root.innerHTML,/Общая картина портфеля/);
  assert.match(controls["#storage-status"].innerHTML,/IndexedDB/);
  click("new");await settle();
  assert.match(mounts["#atlas-editor-slot"].innerHTML,/Новый проект/);
  submit({name:"Home renovation",type:"personal",goal:"Finish renovation"});await settle();
  assert.match(root.innerHTML,/Home renovation/);
  click("target");await settle();
  submit({title:"Working budget",desired:"Approved budget",intent:"committed"});await settle();
  assert.match(mounts["#atlas-trace"].innerHTML,/Working budget/);
  let snapshot=await persisted(),targetId=snapshot.projects[0].targets[0].id;
  click("finding");await settle();
  submit({targetId,result:"partial",level:"implementation",note:"Estimate pending"});await settle();
  assert.match(mounts["#atlas-trace"].innerHTML,/Реализовано частично/);
  click("proposal");await settle();
  submit({title:"Budget change",targetId,description:"Update materials price"});await settle();
  snapshot=await persisted();
  const changeId=snapshot.projects[0].changes[0].id;
  click("change:"+changeId);await settle();
  submit({status:"approved"});await settle();
  snapshot=await persisted();
  assert.equal(snapshot.projects[0].changes[0].status,"approved");
  click("back");await settle();
  assert.match(root.innerHTML,/Неясно \/ есть разрывы/);
  assert.match(root.innerHTML,/Home renovation/);
  assert.doesNotMatch(root.innerHTML,/Релиз подтверждён/);
 }finally{
  for(const name of names)if(previous[name]===undefined)delete globalThis[name];else globalThis[name]=previous[name];
 }
});

import test from "node:test";
import assert from "node:assert/strict";

test("standalone UI completes project → target → claim → approved change → saved overview without prompts",async()=>{
 const names=["document","localStorage","FormData","prompt","confirm"];
 const old=Object.fromEntries(names.map(x=>[x,globalThis[x]]));
 const storage=new Map(),controls={};
 const root={innerHTML:"",handlers:{},addEventListener(type,callback){this.handlers[type]=callback}};
 const mounts={"#atlas-editor-slot":{innerHTML:""},"#atlas-schedule":{innerHTML:""},"#atlas-relations":{innerHTML:""},"#atlas-trace":{innerHTML:""}};
 globalThis.document={querySelector(selector){return selector==="#app"?root:mounts[selector]||(controls[selector]??={onclick:null,onchange:null,click(){}})}};
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))};
 globalThis.FormData=class{constructor(form){this.form=form}get(key){return this.form.values[key]??""}};
 globalThis.prompt=()=>{throw Error("Native prompt() must not be called")};
 globalThis.confirm=()=>true;
 const click=action=>root.handlers.click({target:{closest:()=>({dataset:{action}})}});
 const submit=values=>root.handlers.submit({target:{id:"atlas-editor-form",values},preventDefault(){}});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 try{
  await import("../src/app.mjs?form-smoke");
  assert.match(root.innerHTML,/Общая картина портфеля/);
  click("new");await settle();
  assert.match(mounts["#atlas-editor-slot"].innerHTML,/Новый проект/);
  submit({name:"Home renovation",type:"personal",goal:"Finish renovation"});await settle();
  assert.match(root.innerHTML,/Home renovation/);
  click("target");await settle();
  submit({title:"Working budget",desired:"Approved budget",intent:"committed"});await settle();
  assert.match(mounts["#atlas-trace"].innerHTML,/Working budget/);
  let snapshot=JSON.parse([...storage.values()][0]);
  const targetId=snapshot.projects[0].targets[0].id;
  click("finding");await settle();
  submit({targetId,result:"partial",level:"implementation",note:"Estimate pending"});await settle();
  assert.match(mounts["#atlas-trace"].innerHTML,/Реализовано частично/);
  click("proposal");await settle();
  submit({title:"Budget change",targetId,description:"Update materials price"});await settle();
  snapshot=JSON.parse([...storage.values()][0]);
  const changeId=snapshot.projects[0].changes[0].id;
  click("change:"+changeId);await settle();
  submit({status:"approved"});await settle();
  assert.equal(JSON.parse([...storage.values()][0]).projects[0].changes[0].status,"approved");
  click("back");await settle();
  assert.match(root.innerHTML,/Неясно \/ есть разрывы/);
  assert.match(root.innerHTML,/Home renovation/);
  assert.doesNotMatch(root.innerHTML,/Релиз подтверждён/);
 }finally{
  for(const name of names)if(old[name]===undefined)delete globalThis[name];else globalThis[name]=old[name];
 }
});

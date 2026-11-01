import test from "node:test";
import assert from "node:assert/strict";

test("standalone Atlas UI creates project, links target, records claim, and restores a local snapshot",async()=>{
 const previous={document:globalThis.document,localStorage:globalThis.localStorage,prompt:globalThis.prompt,confirm:globalThis.confirm};
 const storage=new Map();
 const root={innerHTML:"",handlers:{},addEventListener(event,callback){this.handlers[event]=callback}};
 const schedule={innerHTML:""},trace={innerHTML:""};
 const controls={};
 globalThis.document={
  querySelector(selector){
   if(selector==="#app")return root;
   if(selector==="#atlas-schedule")return schedule;
   if(selector==="#atlas-trace")return trace;
   if(!controls[selector])controls[selector]={onclick:null,onchange:null,click(){}};
   return controls[selector];
  }
 };
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))};
 let answers=[];
 globalThis.prompt=()=>answers.shift()??null;
 globalThis.confirm=()=>true;
 function click(action){root.handlers.click({target:{closest:()=>({dataset:{action}})}});}
 async function settle(){await new Promise(resolve=>setImmediate(resolve))}
 try{
  await import("../src/app.mjs?ui-smoke");
  assert.match(root.innerHTML,/Портфель проектов/);
  assert.match(root.innerHTML,/Общая картина портфеля/);
  answers=["Home renovation","personal","Finish the renovation"];
  click("new");await settle();
  assert.match(root.innerHTML,/Home renovation/);
  answers=["Working budget","Approved budget","committed"];
  click("target");await settle();
  assert.match(trace.innerHTML,/Working budget/);
  answers=["1","partial","implementation","","Estimate pending"];
  click("finding");await settle();
  assert.match(trace.innerHTML,/Реализовано частично/);
  answers=["Budget change","1","Update materials price"];
  click("proposal");await settle();
  assert.match(trace.innerHTML,/Budget change/);
  const snapshot=JSON.parse([...storage.values()][0]);
  assert.equal(snapshot.projects.length,1);
  assert.equal(snapshot.projects[0].targets.length,1);
  assert.equal(snapshot.projects[0].findings.length,1);
  assert.equal(snapshot.projects[0].changes.length,1);
  click("back");await settle();
  assert.match(root.innerHTML,/Неясно \/ есть разрывы/);
  assert.match(root.innerHTML,/Home renovation/);
  assert.doesNotMatch(root.innerHTML,/Релиз подтверждён/);
 }finally{
  for(const [k,v] of Object.entries(previous)){
   if(v===undefined)delete globalThis[k];else globalThis[k]=v;
  }
 }
});

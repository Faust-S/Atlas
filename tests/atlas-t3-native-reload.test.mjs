import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,createDecision,serialize,deserialize}
 from "../src/core.mjs";
import {readExternalAtlasUpdate} from "../desktop/src/native-save.mjs";

const signature=serialize,readValidated=state=>deserialize(JSON.stringify(state));
const setup=()=>{
 let snapshot=empty();
 const p=createProject(snapshot,{name:"Atlas 0.8 T3 real native project"});snapshot=p.state;
 const w=createItem(snapshot,p.id,{title:"Project WorkRef owned by Atlas"});snapshot=w.state;
 return {snapshot,pid:p.id,wid:w.id};
};
test("Reread native Atlas head after T3 Result preserves owner model and never writes",async()=>{
 const f=setup(),before=structuredClone(f.snapshot);
 const after=createDecision(before,f.pid,"T3_RESULT_LINK/1 confirmed original Result");
 let writes=0;
 const result=await readExternalAtlasUpdate({
  invoke:async op=>{
   assert.equal(op,"atlas_open");return {generation:"gen:2",snapshot:after,needsConfirmation:false};
  },
  expectedGeneration:"gen:1",snapshot:before,signature,readValidated,
  assertUnchanged:()=>{}
 });
 assert.equal(result.status,"UPDATED");
 assert.equal(result.snapshot.revision,before.revision+1);
 assert.equal(result.snapshot.projects[0].decisions.length,1);
 assert.deepEqual(result.snapshot.projects[0].items,before.projects[0].items);
 assert.deepEqual(result.snapshot.projects[0].dependencies,before.projects[0].dependencies);
 assert.equal(writes,0);
 assert.equal(before.projects[0].decisions.length,0);
});
test("Native reread refuses changed local draft, corrupted head and recovery state",async()=>{
 const f=setup(),snapshot=f.snapshot,changed=createDecision(snapshot,f.pid,"Result");
 let dirty=false,reads=0;
 const invoke=async()=>{
  reads++;dirty=true;
  return {generation:"gen:other",snapshot:changed,needsConfirmation:false};
 };
 await assert.rejects(readExternalAtlasUpdate({
  invoke,expectedGeneration:"gen:1",snapshot,signature,readValidated,
  assertUnchanged:()=>{if(dirty)throw Error("ATLAS_LOCAL_DRAFT_CHANGED");}
 }),/ATLAS_LOCAL_DRAFT_CHANGED/);
 assert.equal(reads,1);
 for(const native of [
  {generation:"gen:1",snapshot:changed,needsConfirmation:false},
  {generation:"gen:2",snapshot,needsConfirmation:false},
  {generation:"gen:2",snapshot:changed,needsConfirmation:true}
 ]){
  const error=native.generation==="gen:1"?"ATLAS_T3_NATIVE_HEAD_INCONSISTENT":
   native.needsConfirmation?"ATLAS_T3_NATIVE_RECOVERY_REQUIRED":
   "ATLAS_T3_NATIVE_REVISION_NOT_ADVANCED";
  await assert.rejects(readExternalAtlasUpdate({
   invoke:async()=>native,expectedGeneration:"gen:1",
   snapshot,signature,readValidated,assertUnchanged:()=>{}
  }),new RegExp(error));
 }
});
test("Native reread of same generation is a no-op",async()=>{
 const f=setup(),r=await readExternalAtlasUpdate({
  invoke:async()=>({generation:"gen:1",snapshot:structuredClone(f.snapshot),
   needsConfirmation:false}),
  expectedGeneration:"gen:1",snapshot:f.snapshot,signature,readValidated,
  assertUnchanged:()=>{}
 });
 assert.equal(r.status,"UNCHANGED");
 assert.equal(r.generation,"gen:1");
});

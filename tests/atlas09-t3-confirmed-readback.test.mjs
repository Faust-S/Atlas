import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createItem,createDecision,serialize,deserialize}
 from "../src/core.mjs";
import {findConfirmedAtlasT3Decision}
 from "../src/atlas-t3-confirmed-projection.mjs";
import {atlasT3ProjectResultLinks} from "../src/atlas-t3-native-recipient.mjs";
import {addTarget,compareProject} from "../src/trace.mjs";
import {editItem} from "../src/core.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {organizationPlanProjection} from "../src/organization-plan-projection.mjs";
import {readExternalAtlasUpdate} from "../desktop/src/native-save.mjs";

const OP="atlas:t3:"+"d".repeat(64);
const SRC={workspace_id:"ws:agent",object_id:"result:accepted",
 schema_id:"iwxa.result",revision:2};
function fixture(){
 let state=empty();
 const p=createProject(state,{name:"Signed original D6 portfolio"});state=p.state;
 const w=createItem(state,p.id,{title:"Obtain accepted external Result"});state=w.state;
 const other=createItem(state,p.id,{title:"Not the selected work"});state=other.state;
 const original=structuredClone(state);
 const record={
  schema:"T3_RESULT_LINK/1",operationId:OP,
  projectId:p.id,workId:w.id,sourceRevision:String(original.revision),
  sourceObjectRef:SRC,taskId:"TASK:accepted-9",resultId:"RESULT:accepted-9",
  acceptedDigest:"a".repeat(64),archiveSha256:"b".repeat(64)
 };
 state=createDecision(state,p.id,"T3_RESULT_LINK/1 "+JSON.stringify(record));
 const decision=state.projects.find(x=>x.id===p.id).decisions.at(-1);
 return {snapshot:state,original,p,w,other,record,
  receipt:{projectId:p.id,workId:w.id,operationId:OP,
   resultRef:"atlas:decision:"+decision.id},decision};
}
test("One exact original D6 receipt becomes a visible link only at its saved work",()=>{
 const f=fixture();
 const row=findConfirmedAtlasT3Decision(f.snapshot,f.receipt);
 assert.deepEqual(row,{
  ...f.receipt,decisionId:f.decision.id,
  taskId:f.record.taskId,resultId:f.record.resultId
 });
 assert.ok(Object.isFrozen(row));
 assert.deepEqual(f.snapshot.projects[0].items,f.original.projects[0].items,
  "Original Decision must not mark the Work complete");
});
test("Native UI refuses a fabricated, unrelated, duplicate or malformed Decision projection",()=>{
 const f=fixture(),params=f.receipt;
 for(const invalid of [
  {...params,workId:f.other.id},
  {...params,projectId:"another:project"},
  {...params,operationId:"atlas:t3:"+"f".repeat(64)},
  {...params,resultRef:"atlas:decision:other"},
  {...params,resultRef:"atlas:decision:invalid value"},
  {...params,operationId:"invalid"},
  {...params,workId:undefined},
 ]){
  assert.throws(()=>findConfirmedAtlasT3Decision(f.snapshot,invalid),
   {code:"ATLAS_T3_CONFIRMED_LINK_NOT_IN_NATIVE_HEAD"});
 }
 const duplicated=structuredClone(f.snapshot);
 duplicated.projects[0].decisions.push(structuredClone(f.decision));
 assert.throws(()=>findConfirmedAtlasT3Decision(duplicated,params),
  {code:"ATLAS_T3_CONFIRMED_LINK_NOT_IN_NATIVE_HEAD"});
 const altered=structuredClone(f.snapshot);
 altered.projects[0].decisions.at(-1).text="T3_RESULT_LINK/1 {\"broken\":true}";
 assert.throws(()=>findConfirmedAtlasT3Decision(altered,params),
  {code:"ATLAS_T3_CONFIRMED_LINK_NOT_IN_NATIVE_HEAD"});
});
test("Confirmed Result rereads original native head exactly once without another Apply",async()=>{
 const f=fixture(),calls=[],signature=serialize;
 const reply=await readExternalAtlasUpdate({
  invoke:async command=>{
   calls.push(command);
   assert.equal(command,"atlas_open");
   return {generation:"g:new",snapshot:f.snapshot,needsConfirmation:false};
  },
  expectedGeneration:"g:old",snapshot:f.original,signature,
  readValidated:raw=>deserialize(JSON.stringify(raw)),
  assertUnchanged:()=>{}
 });
 assert.equal(reply.status,"UPDATED");
 assert.deepEqual(findConfirmedAtlasT3Decision(reply.snapshot,f.receipt),
  {...f.receipt,decisionId:f.decision.id,
   taskId:f.record.taskId,resultId:f.record.resultId});
 assert.deepEqual(calls,["atlas_open"]);
 assert.equal(f.original.projects[0].decisions.length,0);
});
test("Confirmed Result reread cannot overwrite a draft that changed while D6 was applying",async()=>{
 const f=fixture();let draftDirty=false,opens=0;
 await assert.rejects(readExternalAtlasUpdate({
  invoke:async command=>{
   assert.equal(command,"atlas_open");opens++;
   draftDirty=true;return {generation:"g:new",snapshot:f.snapshot,needsConfirmation:false};
  },
  expectedGeneration:"g:old",snapshot:f.original,signature:serialize,
  readValidated:raw=>deserialize(JSON.stringify(raw)),
  assertUnchanged:()=>{if(draftDirty)throw Error("ATLAS_T3_LOCAL_DRAFT_CHANGED");}
 }),/ATLAS_T3_LOCAL_DRAFT_CHANGED/);
 assert.equal(opens,1);
 assert.deepEqual(f.original.projects[0].decisions,[]);
});
test("Both original D6 routes update clean native UI only after matching exact Decision",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/const displayConfirmedAtlasResult=async\(/);
 assert.match(ui,/findConfirmedAtlasT3Decision\(reread\.snapshot/);
 assert.match(ui,/readExternalAtlasUpdate\(\{/);
 assert.match(ui,/if\(reread\.status==="UPDATED"\)/);
 assert.equal(ui.split("const observed=await displayConfirmedAtlasResult(").length-1,2);
 assert.ok(ui.includes("Не повторяйте применение"));
 assert.ok(ui.includes("setError(\"Обновление Atlas: \""));
 assert.ok(ui.includes("setError(\"Восстановление отображения: \""));
});

test("Saved Result is available in plan/fact, and a separate human observation keeps the exact Decision",()=>{
 const f=fixture();
 const t=addTarget(f.snapshot,f.p.id,{title:"Delivery",desired:"Audited output"});
 const unrelated=addTarget(t.state,f.p.id,{title:"Unrelated",desired:"Different outcome"});
 let state=editItem(unrelated.state,f.p.id,f.w.id,{targetIds:[t.id]});
 const before=serialize(state);
 const rows=atlasT3ProjectResultLinks(state.projects[0]);
 assert.equal(rows.length,1);
 const row=rows[0];
 assert.equal(row.workId,f.w.id);
 assert.equal(row.reference,f.receipt.resultRef);
 assert.deepEqual(row.targetLinks,[{id:t.id,title:"Delivery",observationCount:0}]);
 assert.equal(compareProject(state.projects[0]).rows.find(x=>x.id===t.id).assessment,"unknown");
 const action="finding-result:"+[f.w.id,t.id,row.decisionId].map(encodeURIComponent).join(":");
 const spec=editorSpec(state.projects[0],action,state);
 assert.equal(spec.fields.find(x=>x.name==="result").value,"");
 assert.equal(spec.fields.find(x=>x.name==="note").required,true);
 assert.equal(serialize(state),before);
 const form=new FormData();
 form.set("targetId",t.id);form.set("result","partial");form.set("level","implementation");
 form.set("note","Delivery report covers the first phase only");
 const after=applyEditor(state,f.p.id,action,form).state;
 const project=after.projects[0],finding=project.findings.at(-1);
 assert.equal(finding.reference,row.reference);
 assert.equal(finding.workId,f.w.id);
 assert.equal(finding.targetId,t.id);
 assert.equal(finding.origin,"manual");
 assert.deepEqual(project.items,state.projects[0].items);
 assert.deepEqual(project.decisions,state.projects[0].decisions);
 assert.equal(atlasT3ProjectResultLinks(project)[0].targetLinks[0].observationCount,1);
 const plan=organizationPlanProjection(after,f.p.id);
 assert.equal(plan.works.find(w=>w.id===f.w.id).resultLinks[0].targetLinks[0].observationCount,1);
 assert.equal(Object.hasOwn(plan.works.find(w=>w.id===f.w.id).resultLinks[0],"selectedText"),false);
 assert.deepEqual(plan.works.find(w=>w.id===f.other.id).resultLinks,[]);
 form.set("targetId",unrelated.id);
 assert.throws(()=>applyEditor(state,f.p.id,action,form),/Нельзя изменить требование/);
 form.set("targetId",t.id);form.set("reference","atlas:decision:foreign");
 assert.throws(()=>applyEditor(state,f.p.id,action,form),/без подмены источника/);
 assert.throws(()=>editorSpec(state.projects[0],"finding-result:"+[f.other.id,t.id,row.decisionId].map(encodeURIComponent).join(":"),state),/Работа не связана/);
 const forged=structuredClone(state);
 forged.projects[0].decisions.push({...f.decision,id:"duplicate-decision"});
 assert.deepEqual(atlasT3ProjectResultLinks(forged.projects[0]),[]);
});

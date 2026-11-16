import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createItem} from "../src/core.mjs";
import {createAtlasT3OriginalPublicationPort}
 from "../desktop/src/atlas-t3-original-publication.mjs";

const OP="agent:t3:atlas:"+"d".repeat(64);
const SOURCE={workspace_id:"ws:original",object_id:"result:accepted",
 schema_id:"iwxa.result",revision:2};
function fixture({permission=true,invalidResult=false,ownerDenied=false,
 originalAbsent=false}={}){
 let saved=empty();
 const p=createProject(saved,{name:"Atlas D6 publication project"});saved=p.state;
 const w=createItem(saved,p.id,{title:"Obtain signed original Result"});saved=w.state;
 const workRef={projectId:p.id,workId:w.id,revision:String(saved.revision)};
 const accepted={acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
  workRef,sourceObjectRef:SOURCE,taskId:"TASK:original",
  resultId:"RESULT:human-accepted",acceptedDigest:"a".repeat(64),
  archiveSha256:"b".repeat(64)};
 let version="native:1",published=0,recovered=0,agentReads=0,exchangeReads=0;
 let lastInput,active=true,writePermission=permission;
 const ownerError=Object.assign(Error("Signed employee grant denied"),
  {code:"ORIGINAL_SIGNED_EMPLOYEE_DENIED",outcome:"DENIED"});
 const agent={
  async publishAcceptedForWork(request){
   published++;lastInput=request;
   if(ownerDenied)throw ownerError;
   return {status:"OWNER_READBACK_CONFIRMED",operationId:OP,
    recipientId:"iwxa.atlas",retrySafe:false,
    accepted:invalidResult?{...accepted,workRef:{...workRef,workId:"foreign"}}:accepted};
  },
  async recoverPublicationForWork(request){
   recovered++;lastInput=request;
   return {status:"OUTCOME_UNKNOWN",operationId:OP,recipientId:"iwxa.atlas",
    retrySafe:false};
  },
  async readAccepted(ref){
   agentReads++;assert.deepEqual(ref,SOURCE);
   return accepted;
  }
 };
 const exchange={async readReceipt(request){
  exchangeReads++;
  assert.equal(request.recipientId,"iwxa.atlas");
  assert.equal(request.taskId,accepted.taskId);
  assert.equal(request.resultId,accepted.resultId);
  assert.equal(request.archiveSha256,accepted.archiveSha256);
  return {status:"VERIFIED",recipientId:"iwxa.atlas",
   taskId:accepted.taskId,resultId:accepted.resultId,
   archiveSha256:accepted.archiveSha256};
 }};
 const options={
  readSaved:async()=>({generation:version,snapshot:structuredClone(saved),
   needs_confirmation:false}),
  currentAgentContext:async()=>({schema:"ORIGINAL_EMPLOYEE_CONTEXT/1",
   actor:"employee:signed",contextDigest:"f".repeat(64)}),
  authorizeAtlasProjectRead:async()=>writePermission,
  originalAgent:originalAbsent?{}:agent,originalExchange:exchange,
  isHostActive:()=>active
 };
 return {options,agent,exchange,workRef,selection:{projectId:p.id,workId:w.id},
  ownerError,stats:()=>({published,recovered,agentReads,exchangeReads,lastInput}),
  changeGeneration:()=>{version="native:2";},
  setRight:x=>{writePermission=x;},stop:()=>{active=false;}};
}
test("Original Agent publication is explicit, signed-owner-only, before D6 apply",async()=>{
 const f=fixture(),port=createAtlasT3OriginalPublicationPort(f.options);
 const before=f.stats();
 assert.equal(before.published,0);
 assert.ok(Object.isFrozen(port));
 const result=await port.publishSelected(f.selection);
 assert.deepEqual(result,{status:"OWNER_READBACK_CONFIRMED",
  operationId:OP,workRef:f.workRef});
 const stats=f.stats();
 assert.equal(stats.published,1);
 assert.equal(stats.recovered,0,"No implicit replay or extra recovery call");
 assert.equal(stats.agentReads,1);
 assert.equal(stats.exchangeReads,1);
 assert.deepEqual(stats.lastInput,{workRef:f.workRef,
  context:await f.options.currentAgentContext(),recipientId:"iwxa.atlas",
  purpose:"atlas.result.publish"});
});
test("Lost original publication ACK recovers read-only and never dispatches again",async()=>{
 const f=fixture(),port=createAtlasT3OriginalPublicationPort(f.options);
 f.agent.publishAcceptedForWork=async()=>{throw Error("ORIGINAL_T3_WRITE_ACK_LOST");};
 const unknown=await port.publishSelected(f.selection);
 assert.equal(unknown.status,"OUTCOME_UNKNOWN");
 assert.deepEqual(unknown.workRef,f.workRef);
 assert.equal(f.stats().recovered,0);
 const recovered=await port.recoverSelected(f.selection);
 assert.deepEqual(recovered,{status:"OUTCOME_UNKNOWN",
  operationId:OP,workRef:f.workRef});
 assert.equal(f.stats().recovered,1);
 assert.equal(f.stats().agentReads,0);
 assert.equal(f.stats().exchangeReads,0);
});
test("Original explicit DENIED is preserved with original exception instance",async()=>{
 const f=fixture({ownerDenied:true});
 const port=createAtlasT3OriginalPublicationPort(f.options);
 await assert.rejects(()=>port.publishSelected(f.selection),
  error=>error===f.ownerError&&error.outcome==="DENIED");
 assert.equal(f.stats().agentReads,0);
});
test("Foreign work, unverified source, missing grant and missing owner cannot publish",async()=>{
 const foreign=fixture({invalidResult:true});
 await assert.rejects(
  ()=>createAtlasT3OriginalPublicationPort(foreign.options)
    .publishSelected(foreign.selection),
  {code:"ATLAS_T3_ORIGINAL_PUBLICATION_SOURCE_INVALID"});
 const missing=fixture({originalAbsent:true});
 assert.throws(()=>createAtlasT3OriginalPublicationPort(missing.options),
  {code:"ATLAS_T3_INSTALLED_PUBLICATION_OWNER_REQUIRED"});
 const denied=fixture({permission:false});
 await assert.rejects(()=>createAtlasT3OriginalPublicationPort(denied.options)
   .publishSelected(denied.selection),
  {code:"ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED",outcome:"DENIED"});
 assert.equal(denied.stats().published,0);
 const unknown=fixture({permission:undefined});
 try{
  await createAtlasT3OriginalPublicationPort(unknown.options)
   .publishSelected(unknown.selection);
  assert.fail("Undefined permission must fail closed");
 }catch(error){
  assert.equal(error.code,"ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  assert.equal(error.outcome,undefined);
 }
 assert.equal(unknown.stats().published,0);
});
test("A competing original Atlas revision is rejected before publisher dispatch",async()=>{
 const f=fixture();let reads=0;
 f.options.readSaved=async()=>{
  reads++;
  return {generation:reads===1?"native:one":"native:two",
   snapshot:(await fixture().options.readSaved()).snapshot,
   needs_confirmation:false};
 };
 const port=createAtlasT3OriginalPublicationPort(f.options);
 await assert.rejects(()=>port.publishSelected(f.selection),
  {code:"ATLAS_T3_WORK_CHANGED_BEFORE_PUBLICATION"});
 assert.equal(f.stats().published,0);
});
test("The Atlas UI uses separate original publish, read-only recover, and D6 apply",()=>{
 const host=readFileSync(new URL("../desktop/src/atlas-t3-installed-host.mjs",
  import.meta.url),"utf8");
 const ports=readFileSync(new URL("../desktop/src/atlas-t3-original-host-ports.mjs",
  import.meta.url),"utf8");
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(host,/publishSelectedResult:selection=>selectedPublication\(/);
 assert.match(host,/recoverSelectedPublication:selection=>selectedPublication\(/);
 assert.match(ports,/createAtlasT3OriginalPublicationPort/);
 assert.match(ui,/runAgentResultPublication\(project\.id,w\.id,"publish"\)/);
 assert.match(ui,/runAgentResultPublication\(project\.id,w\.id,"recover"\)/);
 assert.match(ui,/receiveAtlasAgentResult\(project\.id,w\.id\)/);
 assert.ok(!ui.includes("publishAcceptedForWork("),
  "Atlas frontend must not select/issue original T3 publication itself");
});

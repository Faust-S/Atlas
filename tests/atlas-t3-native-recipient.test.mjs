import test from "node:test";
import assert from "node:assert/strict";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {editItem,validate,serialize} from "../src/core.mjs";
import {createAtlasT3NativeRecipient,createAtlasT3AgentTaskSelection}
 from "../src/atlas-t3-native-recipient.mjs";

const SOURCE=Object.freeze({workspace_id:"ws:agent-personal",object_id:"result:accepted-1",
 schema_id:"iwxa.result",revision:2});
const DIGEST="a".repeat(64),ARCHIVE="b".repeat(64);
function fixture({badExchange=false,denied=false,unaccepted=false,lostAck=false}={}){
 let snapshot=atlas06VisualPortfolio(),generation="atlas-generation-0",saves=0,opens=0,active=true;
 const original=serialize(snapshot),project=snapshot.projects[0],work=project.items[0];
 const workRef={projectId:project.id,workId:work.id,revision:String(snapshot.revision)};
 const accept=()=>({sourceObjectRef:SOURCE,workRef,taskId:"TASK:001",resultId:"RESULT:001",
  acceptanceKind:unaccepted?"DRAFT_UNTRUSTED":"HUMAN_ACCEPTED_DRAFT",
  acceptedDigest:DIGEST,archiveSha256:ARCHIVE,readOnly:true});
 const readSaved=async()=>{
  opens++;return {generation,snapshot:structuredClone(snapshot),needs_confirmation:false};
 };
 const commitSaved=async(expected,next)=>{
  if(expected!==generation)throw Error("ATLAS_NATIVE_GENERATION_STALE");
  validate(next);snapshot=structuredClone(next);
  generation="atlas-generation-"+(++saves);
  if(lostAck)throw Error("ACK_LOST");
  return {generation,revision:next.revision};
 };
 const writePermit=async({operationId,recipientId,workRef:w,action})=>
  ({allowed:!denied,operationId,recipientId,
   projectId:w.projectId,workId:w.workId,revision:w.revision});
 const make=()=>createAtlasT3NativeRecipient({
  readSaved,commitSaved,isHostActive:()=>active,
  readOriginalAgentAccepted:async ref=>{
   assert.deepEqual(ref,SOURCE);return accept();
  },
  readOriginalExchangeReceipt:async args=>({
   status:badExchange?"UNVERIFIED":"VERIFIED",recipientId:args.recipientId,
   taskId:args.taskId,resultId:args.resultId,archiveSha256:args.archiveSha256
  }),
  verifyAtlasWrite:writePermit
 });
 return {make,readSaved,commitSaved,accept,workRef,original,
  get:()=>snapshot,work,project,saves:()=>saves,opens:()=>opens,
  editUnrelated:()=>{
   snapshot=editItem(snapshot,project.id,project.items[1].id,{state:"in_progress"});
   generation="atlas-generation-external";
  },setActive:v=>active=v};
}

test("A human-accepted Agent Result updates only the original Atlas decision and revision",async()=>{
 const f=fixture(),port=f.make();
 const preview=await port.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 assert.equal(preview.status,"READY");
 assert.match(preview.operationId,/^atlas:t3:[0-9a-f]{64}$/);
 const before=f.get().revision;
 await port.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:{...SOURCE,deleted:false}});
 assert.equal(f.saves(),1);
 const changed=f.get(),p=changed.projects.find(x=>x.id===f.workRef.projectId);
 assert.equal(changed.revision,before+1);
 assert.equal(p.decisions.length,f.project.decisions.length+1);
 assert.deepEqual(p.items,f.project.items); // an accepted DRAFT is not completion
 assert.deepEqual(p.dependencies,f.project.dependencies);
 assert.deepEqual(p.sources,f.project.sources);
 assert.equal((await port.receipt(preview.operationId)).state,"COMMITTED");
 assert.equal((await port.readback(preview.operationId)).state,"PERSISTED");
 const again=f.make(); // a cold native open has no volatile idempotency state
 assert.equal((await again.inspect({reference:SOURCE,recipientId:"iwxa.atlas"})).status,"RECOVER_ONLY");
 await again.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE});
 assert.equal(f.saves(),1);
 assert.equal(serialize(fixture().get()),f.original);
});
test("Unknown native acknowledgment is recovered by original Atlas Store, never repeated",async()=>{
 const f=fixture({lostAck:true}),p=f.make();
 const plan=await p.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 await assert.rejects(p.receive({operationId:plan.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE}),/ACK_LOST/);
 assert.equal(f.saves(),1);
 const cold=f.make();
 assert.equal((await cold.inspect({reference:SOURCE,recipientId:"iwxa.atlas"})).status,"RECOVER_ONLY");
 assert.equal((await cold.readback(plan.operationId)).resultRef,
  (await cold.receipt(plan.operationId)).resultRef);
 await cold.receive({operationId:plan.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE});
 assert.equal(f.saves(),1);
});
test("Stale WorkRef, missing grants, unaccepted Result, unsigned Exchange and changed T3 object deny writes",async()=>{
 for(const options of [{badExchange:true},{denied:true},{unaccepted:true}]){
  const f=fixture(options),owner=f.make();
  await assert.rejects(owner.inspect({reference:SOURCE,recipientId:"iwxa.atlas"}),
   {code:options.badExchange?"ATLAS_T3_ORIGINAL_EXCHANGE_UNVERIFIED":
    options.denied?"ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED":
    "ATLAS_T3_ORIGINAL_AGENT_ACCEPTANCE_REQUIRED"});
  assert.equal(f.saves(),0);
 }
 const f=fixture();const owner=f.make();const preview=await owner.inspect({
  reference:SOURCE,recipientId:"iwxa.atlas"});
 f.editUnrelated();
 await assert.rejects(owner.receive({operationId:preview.operationId,
  recipientId:"iwxa.atlas",reference:SOURCE,object:SOURCE}),
  {code:"ATLAS_T3_SOURCE_REVISION_CHANGED"});
 await assert.rejects(owner.inspect({reference:SOURCE,recipientId:"iwxa.atlas"}),
  {code:"ATLAS_T3_SOURCE_REVISION_CHANGED"});
 assert.equal(f.saves(),0);
 const other=fixture().make();
 await assert.rejects(other.receive({operationId:preview.operationId,
  recipientId:"iwxa.atlas",reference:SOURCE,object:{...SOURCE,revision:3}}),
  {code:"ATLAS_T3_ORIGINAL_OBJECT_CHANGED"});
});
test("Publisher PERSON licence cannot bypass a denied Atlas project write",async()=>{
 const f=fixture({denied:true});
 const unusedPublisherFeature={subjectType:"PERSON",status:"ACTIVE",featureId:"atlas.t3"};
 assert.equal(unusedPublisherFeature.status,"ACTIVE");
 await assert.rejects(f.make().inspect({reference:SOURCE,recipientId:"iwxa.atlas"}),
  {code:"ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED"});
 assert.equal(f.saves(),0);
});
test("Atlas WorkRef handoff requires saved source, independent read permission and genuine Agent Task receipt",async()=>{
 const f=fixture();
 let issued=0;
 const port=createAtlasT3AgentTaskSelection({
  readSaved:f.readSaved,isHostActive:()=>true,
  authorizeProjectRead:async()=>true,
  issueOriginalAgentTask:async({workRef})=>{
   issued++;return {taskId:"TASK:001",projectId:workRef.projectId,
    workId:workRef.workId,sourceRevision:workRef.revision};
  }
 });
 const task=await port.issue(f.workRef.projectId,f.workRef.workId,{workspaceId:"agent:ws"});
 assert.deepEqual(task.workRef,f.workRef);
 assert.equal(task.taskId,"TASK:001");
 assert.equal(issued,1);
 const denied=createAtlasT3AgentTaskSelection({
  readSaved:f.readSaved,isHostActive:()=>true,
  authorizeProjectRead:async()=>false,
  issueOriginalAgentTask:async()=>{throw Error("Must not issue");}
 });
 await assert.rejects(denied.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"other"}),{code:"ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED"});
});

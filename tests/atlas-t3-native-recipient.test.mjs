import test from "node:test";
import assert from "node:assert/strict";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {editItem,createDecision,validate,serialize} from "../src/core.mjs";
import {createAtlasT3NativeRecipient,createAtlasT3AgentTaskSelection,
 atlasT3DecisionSummary,atlasT3RecordedWorkLinks} from "../src/atlas-t3-native-recipient.mjs";
import {readFileSync} from "node:fs";

const SOURCE=Object.freeze({workspace_id:"ws:agent-personal",object_id:"result:accepted-1",
 schema_id:"iwxa.result",revision:2});
const DIGEST="a".repeat(64),ARCHIVE="b".repeat(64);
function fixture({badExchange=false,denied=false,unaccepted=false,lostAck=false,
 exchangeDenied=false,grantOutage=false,malformedGrant=false,
 mismatchedDenial=false,ownerThrownDenial=false,
 commitOutageBeforeWrite=false}={}){
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
  if(commitOutageBeforeWrite)throw Error("ATLAS_COMMIT_TRANSPORT_UNAVAILABLE");
  validate(next);snapshot=structuredClone(next);
  generation="atlas-generation-"+(++saves);
  if(lostAck)throw Error("ACK_LOST");
  return {generation,revision:next.revision};
 };
 const writePermit=async({operationId,recipientId,workRef:w,action})=>{
  if(grantOutage)throw Error("OWNER_GRANT_TRANSPORT_UNAVAILABLE");
  if(ownerThrownDenial)throw Object.assign(Error("ORIGINAL_ATLAS_OWNER_DENIAL"),
   {code:"ORIGINAL_ATLAS_OWNER_DENIAL",outcome:"DENIED"});
  return {allowed:malformedGrant?"false":mismatchedDenial?false:!denied,
   operationId:mismatchedDenial?"wrong:operation":operationId,recipientId,
   projectId:w.projectId,workId:w.workId,revision:w.revision};
 };
 const make=()=>createAtlasT3NativeRecipient({
  readSaved,commitSaved,isHostActive:()=>active,
  readOriginalAgentAccepted:async ref=>{
   assert.deepEqual(ref,SOURCE);return accept();
  },
  readOriginalExchangeReceipt:async args=>({
   status:exchangeDenied?"DENIED":badExchange?"UNVERIFIED":"VERIFIED",
   recipientId:args.recipientId,
   taskId:args.taskId,resultId:args.resultId,archiveSha256:args.archiveSha256
  }),
  verifyAtlasWrite:writePermit
 });
 return {make,readSaved,commitSaved,accept,workRef,original,
  get:()=>snapshot,work,project,saves:()=>saves,opens:()=>opens,
  editUnrelated:()=>{
   snapshot=editItem(snapshot,project.id,project.items[1].id,{state:"in_progress"});
   generation="atlas-generation-external";
  },
  addUntrustedDecision:text=>{
   snapshot=createDecision(snapshot,project.id,text);
   generation="atlas-generation-user-edit";
  },setActive:v=>active=v,setDenied:v=>denied=v};
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
 assert.equal((await again.inspect({reference:SOURCE,recipientId:"iwxa.atlas"})).status,"READY");
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
 assert.equal((await cold.inspect({reference:SOURCE,recipientId:"iwxa.atlas"})).status,"READY");
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
  findOriginalAgentTask:async({workRef})=>({status:"NOT_FOUND_CONFIRMED",
   projectId:workRef.projectId,workId:workRef.workId,sourceRevision:workRef.revision}),
  issueOriginalAgentTask:async({workRef})=>{
   issued++;return {taskId:"TASK:001",projectId:workRef.projectId,
    workId:workRef.workId,sourceRevision:workRef.revision};
  },
  readOriginalAgentTask:async taskId=>({status:"PERSISTED",taskId,
   projectId:f.workRef.projectId,workId:f.workRef.workId,
   sourceRevision:f.workRef.revision})
 });
 const task=await port.issue(f.workRef.projectId,f.workRef.workId,{workspaceId:"agent:ws"});
 assert.deepEqual(task.workRef,f.workRef);
 assert.equal(task.taskId,"TASK:001");
 assert.equal(issued,1);
 const denied=createAtlasT3AgentTaskSelection({
  readSaved:f.readSaved,isHostActive:()=>true,
  authorizeProjectRead:async()=>false,
  findOriginalAgentTask:async()=>{throw Error("Must not look up");},
  issueOriginalAgentTask:async()=>{throw Error("Must not issue");},
  readOriginalAgentTask:async()=>{throw Error("Must not read");}
 });
 await assert.rejects(denied.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"other"}),{code:"ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED"});
});

test("A user-authored fake decision cannot become a durable T3 D6 acceptance receipt",async()=>{
 const f=fixture(),p=f.make();
 const original=await p.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 const fake={
  schema:"T3_RESULT_LINK/1",operationId:original.operationId,
  projectId:f.workRef.projectId,workId:f.workRef.workId,
  sourceRevision:f.workRef.revision,sourceObjectRef:SOURCE,
  taskId:"TASK:001",resultId:"RESULT:unrelated",
  acceptedDigest:DIGEST,archiveSha256:ARCHIVE
 };
 f.addUntrustedDecision("T3_RESULT_LINK/1 "+JSON.stringify(fake));
 await assert.rejects(p.receipt(original.operationId),
  {code:"ATLAS_T3_STORED_LINK_SOURCE_MISMATCH"});
 await assert.rejects(p.readback(original.operationId),
  {code:"ATLAS_T3_STORED_LINK_SOURCE_MISMATCH"});
 await assert.rejects(p.inspect({reference:SOURCE,recipientId:"iwxa.atlas"}),
  {code:"ATLAS_T3_STORED_LINK_SOURCE_MISMATCH"});
 await assert.rejects(p.receive({operationId:original.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE}),
  {code:"ATLAS_T3_STORED_LINK_SOURCE_MISMATCH"});
 assert.equal(f.saves(),0,"Untrusted decision must not cause an authorized native write");
});
test("Malformed T3 link and revoked source access hold recovery rather than returning a fake receipt",async()=>{
 const f=fixture(),port=f.make();
 const plan=await port.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 f.addUntrustedDecision("T3_RESULT_LINK/1 INVALID");
 await assert.rejects(port.inspect({reference:SOURCE,recipientId:"iwxa.atlas"}),
  {code:"ATLAS_T3_MALFORMED_LINK_HOLD"});
 await assert.rejects(port.receipt(plan.operationId),
  {code:"ATLAS_T3_MALFORMED_LINK_HOLD"});
 assert.equal(f.saves(),0);
 const g=fixture(),native=g.make();
 const proposed=await native.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 await native.receive({operationId:proposed.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE});
 assert.equal(g.saves(),1);
 g.setDenied(true);
 await assert.rejects(native.receipt(proposed.operationId),
  {code:"ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED"});
 assert.equal(g.saves(),1);
});

test("Existing Atlas history presents Agent/T3 links readably but does not claim a current grant",async()=>{
 const f=fixture(),owner=f.make(),preview=await owner.inspect({
  reference:SOURCE,recipientId:"iwxa.atlas"});
 await owner.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE});
 const text=f.get().projects[0].decisions.at(-1).text;
 const summary=atlasT3DecisionSummary(text);
 assert.match(summary,/Связь с результатом Agent/);
 assert.match(summary,/Task TASK:001, Result RESULT:001/);
 assert.match(summary,/Источник и полномочия проверяются заново/);
 assert.doesNotMatch(summary,/T3_RESULT_LINK\/1|archiveSha256/);
 assert.equal(atlasT3DecisionSummary("Обычное решение Atlas"),null);
 assert.match(atlasT3DecisionSummary("T3_RESULT_LINK/1 invalid"),/Повреждена/);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/atlasT3DecisionSummary\(decision\.text\)\|\|decision\.text/);
 assert.match(ui,/atlasT3DecisionSummary\(entry\.text\)\|\|entry\.text/);
 assert.match(ui,/Актуальность источника и подписанные полномочия проверяются оригинальным T3/);
});

test("Original accepted Result appears on its exact WorkRef, not on unrelated Atlas works",async()=>{
 const f=fixture(),native=f.make();
 const ready=await native.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
 await native.receive({operationId:ready.operationId,recipientId:"iwxa.atlas",
  reference:SOURCE,object:SOURCE});
 const project=f.get().projects[0],index=atlasT3RecordedWorkLinks(project);
 const links=index.get(f.work.id)||[];
 assert.equal(links.length,1);
 assert.equal(links[0].taskId,"TASK:001");
 assert.equal(links[0].resultId,"RESULT:001");
 assert.deepEqual(links[0].sourceObjectRef,SOURCE);
 assert.equal(index.size,1);
 assert.equal(index.has(project.items[1].id),false);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/const t3WorkLinks=useMemo\(\(\)=>atlasT3RecordedWorkLinks\(project\)/);
 assert.match(ui,/Agent Result \{link\.resultId\}\. Сохранена ссылка; доступ проверяется в T3/);
 assert.match(ui,/Ещё \{\(t3WorkLinks\.get\(w\.id\)\|\|\[\]\)\.length-2\} ссылок в истории/);
});

test("Lost Agent Task ACK is recovered from original durable Task, never blindly issued again",async()=>{
 const f=fixture();let writes=0,found=false;
 const opts={
  readSaved:f.readSaved,isHostActive:()=>true,
  authorizeProjectRead:async()=>true,
  findOriginalAgentTask:async({workRef})=>({
   status:found?"PERSISTED":"NOT_FOUND_CONFIRMED",
   ...(found?{taskId:"TASK:durable-001"}:{}),
   projectId:workRef.projectId,workId:workRef.workId,
   sourceRevision:workRef.revision
  }),
  issueOriginalAgentTask:async()=>{
   writes++;found=true;throw Error("Native Agent reply lost after its commit");
  },
  readOriginalAgentTask:async taskId=>({
   status:"PERSISTED",taskId,projectId:f.workRef.projectId,
   workId:f.workRef.workId,sourceRevision:f.workRef.revision
  })
 };
 const old=createAtlasT3AgentTaskSelection(opts);
 await assert.rejects(old.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"signed:agent"}),{code:"ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN"});
 assert.equal(writes,1);
 const recovered=await old.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"signed:agent"});
 assert.equal(recovered.taskId,"TASK:durable-001");
 const cold=createAtlasT3AgentTaskSelection(opts);
 assert.equal((await cold.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"signed:agent"})).taskId,"TASK:durable-001");
 assert.equal(writes,1);
});
test("After unknown Agent issuance, a stale NOT_FOUND owner reply cannot dispatch a second Task",async()=>{
 const f=fixture();let writes=0;
 const port=createAtlasT3AgentTaskSelection({
  readSaved:f.readSaved,isHostActive:()=>true,
  authorizeProjectRead:async()=>true,
  findOriginalAgentTask:async({workRef})=>({
   status:"NOT_FOUND_CONFIRMED",projectId:workRef.projectId,
   workId:workRef.workId,sourceRevision:workRef.revision
  }),
  issueOriginalAgentTask:async()=>{
   writes++;throw Error("ACK_LOST");
  },
  readOriginalAgentTask:async()=>null
 });
 await assert.rejects(port.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"agent"}),{code:"ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN"});
 await assert.rejects(port.issue(f.workRef.projectId,f.workRef.workId,
  {workspaceId:"agent"}),{code:"ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN"});
 assert.equal(writes,1);
});

test("The Atlas work UI offers signed D6 Result continuation only via installed Host",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const host=readFileSync(new URL("../desktop/src/embedded-host.ts",import.meta.url),"utf8");
 assert.ok(ui.includes("host?.t3?.continueSelectedResult&&<Action"));
 assert.ok(ui.includes("const receiveAtlasAgentResult=async(projectId:string,workId:string)"));
 assert.ok(ui.includes('result.status==="OWNER_READBACK_CONFIRMED"'));
 assert.ok(ui.includes("Не повторяйте применение"));
 assert.ok(ui.includes("Получить Result</Action>"));
 assert.ok(ui.includes("const recoverAtlasAgentResult=async(projectId:string,workId:string)"));
 assert.ok(ui.includes("host?.t3?.recoverSelectedResult&&<Action"));
 assert.ok(ui.includes("Проверить Result</Action>"));
 assert.ok(host.includes("continueSelectedResult:"));
 assert.ok(host.includes("recoverSelectedResult:"));
 assert.ok(ui.includes("readSavedSnapshotForReference({invoke,"));
});

test("Original Atlas authority DENIED remains explicit; missing grants never invent a denial",async()=>{
 for(const [opts,expectedOutcome] of [
  [{denied:true},"DENIED"],
  [{ownerThrownDenial:true},"DENIED"],
  [{grantOutage:true},undefined],
  [{malformedGrant:true},undefined],
  [{mismatchedDenial:true},undefined],
  [{badExchange:true},undefined],
  [{exchangeDenied:true},"DENIED"],
  [{unaccepted:true},undefined]
 ]){
  const f=fixture(opts);
  try{
   await f.make().inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
   assert.fail("Expected original owner to refuse preview");
  }catch(error){
   assert.equal(error.outcome,expectedOutcome,JSON.stringify(opts));
   assert.match(error.code||error.message,/ATLAS_T3_|ORIGINAL_ATLAS_OWNER_DENIAL|OWNER_GRANT_TRANSPORT_UNAVAILABLE/);
  }
  assert.equal(f.saves(),0,"A refusal cannot write Atlas");
 }
});
test("Native IPC loss and lost commit ACK never gain an invented DENIED marker",async()=>{
 for(const opts of [{commitOutageBeforeWrite:true},{lostAck:true}]){
  const f=fixture(opts),owner=f.make();
  const preview=await owner.inspect({reference:SOURCE,recipientId:"iwxa.atlas"});
  let error;
  try{
   await owner.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
    reference:SOURCE,object:SOURCE});
  }catch(e){error=e;}
  assert.ok(error,"A missing commit acknowledgement must remain explicit");
  assert.equal(error.outcome,undefined,"IPC failure cannot become DENIED");
  assert.equal(f.saves(),opts.lostAck?1:0);
  const cold=f.make();
  const receipt=await cold.receipt(preview.operationId);
  if(opts.lostAck){
   assert.equal(receipt?.state,"COMMITTED");
   assert.equal((await cold.readback(preview.operationId))?.state,"PERSISTED");
   await cold.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
    reference:SOURCE,object:SOURCE});
   assert.equal(f.saves(),1,"A cold receive after lost ACK is idempotent");
  }else{
   assert.equal(receipt,null,"An uncommitted write must not invent a receipt");
  }
 }
});
test("Original native recipient mismatch is a definitive pre-write refusal",async()=>{
 const f=fixture(),owner=f.make();
 await assert.rejects(owner.inspect({reference:SOURCE,recipientId:"other.product"}),
  {code:"ATLAS_T3_RECIPIENT_MISMATCH",outcome:"DENIED"});
 assert.equal(f.saves(),0);
});

test("Atlas 0.9 UI distinguishes original D6 DENIED from unknown and stored Result",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const ports=readFileSync(new URL("../desktop/src/atlas-t3-original-host-ports.mjs",import.meta.url),"utf8");
 assert.ok(ui.includes("const showOriginalT3Denial="));
 assert.ok(ui.includes('verdict?.outcome!=="DENIED"'));
 assert.ok(ui.includes("Подтверждения Result нет."));
 assert.equal(ui.split("if(!showOriginalT3Denial(e))issue(e)").length-1,2,
  "Both original D6 routes preserve the exact owner refusal");
 assert.match(ui,/if\(!showOriginalT3Denial\(e\)\)\{/);
 assert.match(ui,/Публикация Agent Result не подтверждена/);
 assert.ok(ports.includes('if(error?.outcome==="DENIED")throw error'));
 assert.ok(ui.includes('result.status==="OUTCOME_UNKNOWN"'));
 assert.ok(ui.includes('result.status==="OWNER_READBACK_CONFIRMED"'));
});

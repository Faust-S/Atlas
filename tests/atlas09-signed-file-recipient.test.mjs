// SOURCE-ONLY recipient contract. The test witness does not sign an .iwxa
// or impersonate the ORIGINAL recipient trust/authority/Kernel.
import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {empty,createProject,createItem,validate} from "../src/core.mjs";
import {createAtlasT3SignedFileRecipient,createAtlasT3NativeRecipient,
 atlasT3DecisionSummary,atlasT3PortableResultText,verifiedAtlasSignedFilePreview}
 from "../src/atlas-t3-native-recipient.mjs";

const sha=text=>createHash("sha256").update(text,"utf8").digest("hex");
const text="Original Human-accepted selected Result, portable in one signed file.";
const ref=Object.freeze({workspace_id:"ws:original",object_id:"result:original",
 schema_id:"iwxa.agent.accepted-result",revision:1});
function fixture({weakSignature=false,badDigest=false,missingStoredArchive=false,
 lostAck=false,rejectBeforeWrite=false,revokeAfterWrite=false}={}){
 let snapshot=empty(),generation="u05:initial",writes=0,attempts=0,authorized=true;
 const project=createProject(snapshot,{name:"Independent Atlas signed-file receipt"});
 snapshot=project.state;
 const item=createItem(snapshot,project.id,{title:"Receive original result"});
 snapshot=item.state;
 const workRef={projectId:project.id,workId:item.id,revision:String(snapshot.revision)};
 const original={
  status:"ORIGINAL_SIGNED_SELECTED_RESULT_VERIFIED",
  recipientId:"iwxa.atlas",operationId:"agent:t3:atlas:"+sha("source operation"),
  sourceObjectRef:ref,workRef,taskId:"TASK:original",
  resultId:"RESULT:human-reviewed",
  acceptedDigest:sha("accepted"),archiveSha256:sha("actual .iwxa"),
  proofKeyId:"key:original:employee",
  signatureVerified:!weakSignature,archiveBytesVerified:true,
  originalManifestVerified:true,recipientGrantVerified:true,
  originalKernelEventVerified:false,disclosureScope:"ORIGINAL_RESULT_ONLY",
  portableSelectedSummary:true,selectedAcceptedSummary:text,
  selectedSummarySha256:badDigest?"0".repeat(64):sha(text)
 };
 const actual=Buffer.from("opaque ORIGINAL signed .iwxa read by original T3");
 const make=()=>createAtlasT3SignedFileRecipient({
  isHostActive:()=>true,
  readSaved:async()=>({generation,snapshot:structuredClone(snapshot),
   needs_confirmation:false}),
  commitSaved:async(expected,next)=>{
   attempts++;
   assert.equal(expected,generation,"Only original Atlas generation CAS");
   if(rejectBeforeWrite)throw Error("NATIVE_COMMIT_ACK_LOST_BEFORE_WRITE");
   validate(next);snapshot=structuredClone(next);generation="u05:"+(++writes);
   if(revokeAfterWrite)authorized=false;
   if(lostAck)throw Error("NATIVE_COMMIT_ACK_LOST");
   return {generation,revision:next.revision};
  },
  inspectOriginalSignedFile:async archive=>{
   assert.deepEqual(archive,actual);return {...original};
  },
  readVerifiedSignedArchive:async hash=>{
   assert.equal(hash,original.archiveSha256);
   if(missingStoredArchive)throw Error("ORIGINAL_RECONCILIATION_BYTES_NOT_STORED");
   if(!authorized)throw Error("ORIGINAL_RECIPIENT_GRANT_REVOKED");
   return {...original};
  },
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:true,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  })
 });
 return {make,actual,original,read:()=>snapshot,
  writes:()=>writes,attempts:()=>attempts,revoke:()=>{authorized=false;}};
}

const reviewed=(plan,archive)=>({
 archive,recipientId:"iwxa.atlas",operationId:plan.operationId,
 confirmed:true,archiveSha256:plan.archiveSha256,
 selectedSummarySha256:plan.selectedSummarySha256,
});

test("one native U05 CAS survives two cold independent signed-file readbacks",async()=>{
 const f=fixture(),native=f.make();
 const plan=await native.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 assert.equal(plan.status,"SIGNED_FILE_READY");
 assert.equal(plan.originalKernelEventVerified,false);
 assert.equal(plan.alreadyReceived,false);
 assert.equal(plan.selectedAcceptedSummary,text,
  "Human Review must show exact signed text, not just digest");
 assert.equal(plan.archiveSha256,f.original.archiveSha256);
 assert.equal(plan.selectedSummarySha256,sha(text));
 await assert.rejects(native.receiveArchive({archive:f.actual,
  recipientId:"iwxa.atlas",operationId:plan.operationId}),
  {code:"ATLAS_T3_SIGNED_FILE_HUMAN_REVIEW_REQUIRED"});
 await native.receiveArchive(reviewed(plan,f.actual));
 assert.equal(f.writes(),1);
 const row=f.read().projects[0].decisions.at(-1);
 assert.equal(atlasT3PortableResultText(row.text),text);
 assert.match(atlasT3DecisionSummary(row.text),/событие Kernel отправителя/);
 const cold1=f.make(),cold2=f.make();
 assert.equal((await cold1.receipt(plan.operationId)).state,"SIGNED_FILE_COMMITTED");
 const seen=await cold2.readback(plan.operationId);
 assert.equal(seen.state,"SIGNED_FILE_PERSISTED");
 assert.equal(seen.originalKernelEventVerified,false);
 assert.equal(f.writes(),1);
 await cold2.receiveArchive(reviewed(plan,f.actual));
 assert.equal(f.writes(),1,"No second native U05 write after cold process");
 const tainted=JSON.parse(row.text.slice("T3_RESULT_LINK/1 ".length));
 tainted.selectedAcceptedSummary="Local corruption after initial U05 commit";
 row.text="T3_RESULT_LINK/1 "+JSON.stringify(tainted);
 await assert.rejects(cold1.readback(plan.operationId),
  {code:"ATLAS_T3_SIGNED_FILE_PERSISTED_PROOF_CHANGED"});
 assert.equal(f.writes(),1);
});

test("Atlas UI preview matches ORIGINAL signed text, bytes and old cold receipt",async()=>{
 const f=fixture(),recipient=f.make();
 const preview=await recipient.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 const rendered=await verifiedAtlasSignedFilePreview(preview);
 assert.equal(rendered.selectedAcceptedSummary,text);
 assert.equal(rendered.archiveSha256,sha("actual .iwxa"));
 assert.equal(rendered.selectedSummarySha256,sha(text));
 assert.equal(rendered.alreadyReceived,false);
 assert.equal(rendered.originalKernelEventVerified,false);
 for(const field of [
  {recipientId:"foreign"}, {operationId:"agent:t3:atlas:"+sha("wrong")},
  {originalKernelEventVerified:true}, {selectedAcceptedSummary:text+"!"},
  {archiveSha256:"not a SHA"}, {alreadyReceived:"yes"}
 ]){
  await assert.rejects(verifiedAtlasSignedFilePreview({...preview,...field}),
   /ATLAS_T3_SIGNED_PREVIEW_INVALID|ATLAS_T3_SIGNED_SELECTED_SUMMARY_HASH_MISMATCH/);
 }
 await recipient.receiveArchive(reviewed(preview,f.actual));
 const cold=await f.make().inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 assert.equal(cold.alreadyReceived,true);
 assert.equal(cold.workRef.revision,preview.workRef.revision,
  "A durable U05 Decision advances Atlas, but the original signed WorkRef does not");
 const restored=await verifiedAtlasSignedFilePreview(cold);
 assert.equal(restored.alreadyReceived,true);
 assert.equal(restored.selectedAcceptedSummary,text);
 assert.equal(f.writes(),1);
});

test("true original recipient grant recheck required on every cold read",async()=>{
 const f=fixture(),p=f.make();
 const ready=await p.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 await p.receiveArchive(reviewed(ready,f.actual));
 f.revoke();
 await assert.rejects(f.make().readback(ready.operationId),
  /ORIGINAL_RECIPIENT_GRANT_REVOKED/);
 assert.equal(f.writes(),1);
});

test("unknown native write ACK is recovered by independent readback, without a second commit",async()=>{
 const f=fixture({lostAck:true}),owner=f.make();
 const ready=await owner.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 // The original U05 Store committed, then lost its response. The owner
 // may read that head, but must NEVER dispatch a second atlas_commit.
 await owner.receiveArchive(reviewed(ready,f.actual));
 assert.equal(f.writes(),1);
 assert.equal(f.attempts(),1);
 assert.equal((await f.make().readback(ready.operationId)).state,
  "SIGNED_FILE_PERSISTED");
 await f.make().receiveArchive(reviewed(ready,f.actual));
 assert.equal(f.attempts(),1,"Cold second receive is an existing receipt read");
 assert.equal(f.writes(),1);
});

test("native commit failure before any write stays unknown and is never retried",async()=>{
 const f=fixture({rejectBeforeWrite:true}),owner=f.make();
 const ready=await owner.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 await assert.rejects(owner.receiveArchive(reviewed(ready,f.actual)),
  /NATIVE_COMMIT_ACK_LOST_BEFORE_WRITE/);
 assert.equal(f.attempts(),1,"Only one original U05 dispatch");
 assert.equal(f.writes(),0);
 assert.equal(await f.make().readback(ready.operationId),null);
});

test("revoked original grant after lost write ACK cannot become a verified success",async()=>{
 const f=fixture({lostAck:true,revokeAfterWrite:true}),owner=f.make();
 const ready=await owner.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 await assert.rejects(owner.receiveArchive(reviewed(ready,f.actual)),
  /ORIGINAL_RECIPIENT_GRANT_REVOKED/);
 assert.equal(f.attempts(),1);
 assert.equal(f.writes(),1,"Native CAS happened, but no current grant for readback");
});

test("Human recipient consent binds original archive and exact selected text",async()=>{
 const f=fixture(),p=f.make();
 const preview=await p.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 for(const changed of [
  {archiveSha256:"0".repeat(64)},
  {selectedSummarySha256:"0".repeat(64)},
  {operationId:"atlas:t3:"+sha("unrelated")},
 ]){
  await assert.rejects(p.receiveArchive({
   ...reviewed(preview,f.actual),...changed,
  }),{code:"ATLAS_T3_SIGNED_FILE_PREVIEW_CHANGED"});
 }
 assert.equal(f.writes(),0,"Unreviewed content must never be committed");
 await p.receiveArchive(reviewed(preview,f.actual));
 assert.equal(f.writes(),1);
});

test("invalid original T3 signature, missing stored carrier and digest cannot write U05",async()=>{
 for(const variant of [{weakSignature:true},{badDigest:true},
   {missingStoredArchive:true}]){
  const f=fixture(variant),owner=f.make();
  await assert.rejects(owner.inspectArchive({
   archive:f.actual,recipientId:"iwxa.atlas"}));
  assert.equal(f.writes(),0);
 }
});

test("a signed file cannot be promoted to original Kernel native receipt",async()=>{
 const f=fixture(),owner=f.make();
 const ready=await owner.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 await owner.receiveArchive(reviewed(ready,f.actual));
 const fakeOriginalConnectedOwner=createAtlasT3NativeRecipient({
  isHostActive:()=>true,
  readSaved:async()=>({generation:"read-only",
    snapshot:structuredClone(f.read()),needs_confirmation:false}),
  commitSaved:async()=>{throw Error("NO SECOND STORE");},
  readOriginalAgentAccepted:async()=>({
   acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
   sourceObjectRef:ref,workRef:f.original.workRef,
   taskId:f.original.taskId,resultId:f.original.resultId,
   acceptedDigest:f.original.acceptedDigest,
   archiveSha256:f.original.archiveSha256
  }),
  readOriginalExchangeReceipt:async()=>({
   status:"VERIFIED",recipientId:"iwxa.atlas",
   taskId:f.original.taskId,resultId:f.original.resultId,
   archiveSha256:f.original.archiveSha256,
   originalSignatureVerified:true,archiveBytesVerified:true,
   originalManifestVerified:true,disclosureScope:"ORIGINAL_RESULT_ONLY",
   selectedSourceObjectRef:ref,
   portableSelectedSummary:true,selectedAcceptedSummary:text,
   selectedSummarySha256:sha(text)
  }),
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:true,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  })
 });
 await assert.rejects(fakeOriginalConnectedOwner.receipt(ready.operationId),
  {code:"ATLAS_T3_SIGNED_FILE_NOT_KERNEL_RECEIPT"});
 assert.equal(f.writes(),1);
});

function corporateFixture(options={}){
 const f=fixture(options);
 const effect=sha("original D3 effect");
 Object.assign(f.original,{
  sourceKind:"ADMIN_APPLIED_RESULT",
  operationId:"admin:t3:atlas:"+sha("corporate publication"),
  organizationId:"org:original",workspaceId:"ws:original",
  executorId:"person:worker",managerId:"person:manager",
  acceptanceId:sha("D3 acceptance"),applicationEffectKey:effect,
  appliedEventId:"event:original",atlasGrantId:"grant:atlas-data",
  signedTaskRevisionId:sha("Task revision"),
  signedTaskPackageSha256:sha("Task carrier"),
  resultId:sha("Result revision"),acceptedDigest:sha(text),
  sourceObjectRef:{workspace_id:"ws:private-receipts",
   object_id:"result:applied:"+effect,schema_id:"iwxa.admin.applied-results",revision:1}
 });
 return f;
}
test("corporate D3 signed Result uses the existing U05 Decision and cold readback",async()=>{
 const f=corporateFixture({lostAck:true}),owner=f.make();
 const preview=await owner.inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"});
 assert.equal(preview.sourceKind,"ADMIN_APPLIED_RESULT");
 assert.equal((await verifiedAtlasSignedFilePreview(preview)).sourceKind,"ADMIN_APPLIED_RESULT");
 await owner.receiveArchive(reviewed(preview,f.actual));
 const row=f.read().projects[0].decisions.at(-1);
 assert.match(atlasT3DecisionSummary(row.text),/Admin Center/);
 assert.equal(atlasT3PortableResultText(row.text),text);
 const data=JSON.parse(row.text.slice("T3_RESULT_LINK/1 ".length));
 assert.equal(data.acceptanceId,f.original.acceptanceId);
 assert.equal(data.appliedEventId,f.original.appliedEventId);
 assert.equal(data.sourceOperationId,f.original.operationId);
 assert.equal(data.originalKernelEventVerified,false);
 assert.equal((await f.make().readback(preview.operationId)).state,"SIGNED_FILE_PERSISTED");
 await f.make().receiveArchive(reviewed(preview,f.actual));
 assert.equal(f.writes(),1);
 f.original.appliedEventId="event:changed";
 await assert.rejects(f.make().readback(preview.operationId),
  {code:"ATLAS_T3_SIGNED_FILE_PERSISTED_PROOF_CHANGED"});
});
test("corporate profile cannot substitute another content hash or applied reference",async()=>{
 for(const change of [
  {sourceKind:"AGENT_ACCEPTED_RESULT"},
  {acceptedDigest:sha("different content")},
  {applicationEffectKey:sha("unrelated effect")},
  {acceptanceId:"not-a-signed-revision"},
 ]){
  const f=corporateFixture();Object.assign(f.original,change);
  await assert.rejects(f.make().inspectArchive({archive:f.actual,recipientId:"iwxa.atlas"}),
   {code:"ATLAS_T3_SIGNED_CORPORATE_PROVENANCE_INVALID"});
  assert.equal(f.writes(),0);
 }
});

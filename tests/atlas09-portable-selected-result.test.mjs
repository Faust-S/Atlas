import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {empty,createProject,createItem,validate} from "../src/core.mjs";
import {createAtlasT3NativeRecipient,atlasT3DecisionSummary,
 atlasT3PortableResultText} from "../src/atlas-t3-native-recipient.mjs";

const ref=Object.freeze({workspace_id:"ws:signed",object_id:"accepted:result",
 schema_id:"iwxa.agent.accepted-result",revision:1});
const summary="Human-accepted selected Result summary. No Agent memory or workspace.";
const summarySha=createHash("sha256").update(summary,"utf8").digest("hex");
const archived="c".repeat(64),acceptedDigest="d".repeat(64);

function originalNativeFixture({badSummaryHash=false}={}){
 let saved=empty(),generation="native:0",writes=0;
 const project=createProject(saved,{name:"Original signed portable Result"});
 saved=project.state;
 const item=createItem(saved,project.id,{title:"Receive accepted summary"});
 saved=item.state;
 const work={projectId:project.id,workId:item.id,revision:String(saved.revision)};
 const accepted={acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
  sourceObjectRef:ref,workRef:work,taskId:"TASK:original",
  resultId:"RESULT:accepted",acceptedDigest,archiveSha256:archived};
 const make=()=>createAtlasT3NativeRecipient({
  isHostActive:()=>true,
  readSaved:async()=>({generation,snapshot:structuredClone(saved),
   needs_confirmation:false}),
  commitSaved:async(expected,next)=>{
   assert.equal(expected,generation);
   validate(next);saved=structuredClone(next);generation="native:"+(++writes);
   return {generation,revision:next.revision};
  },
  readOriginalAgentAccepted:async received=>{
   assert.deepEqual(received,ref);return accepted;
  },
  readOriginalExchangeReceipt:async args=>({
   status:"VERIFIED",recipientId:args.recipientId,taskId:args.taskId,
   resultId:args.resultId,archiveSha256:args.archiveSha256,
   originalSignatureVerified:true,archiveBytesVerified:true,
   originalManifestVerified:true,disclosureScope:"ORIGINAL_RESULT_ONLY",
   selectedSourceObjectRef:ref,
   portableSelectedSummary:true,selectedAcceptedSummary:summary,
   selectedSummarySha256:badSummaryHash?"0".repeat(64):summarySha
  }),
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:true,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  })
 });
 return {make,get:()=>saved,writes:()=>writes};
}

test("Original Exchange-selected text is kept by Atlas U05 across two cold readbacks",async()=>{
 const f=originalNativeFixture();
 const native=f.make();
 const plan=await native.inspect({reference:ref,recipientId:"iwxa.atlas"});
 assert.equal(plan.status,"READY");
 await native.receive({operationId:plan.operationId,recipientId:"iwxa.atlas",
  reference:ref,object:ref});
 assert.equal(f.writes(),1);
 const saved=f.get().projects[0].decisions.at(-1);
 assert.equal(atlasT3PortableResultText(saved.text),summary);
 assert.match(atlasT3DecisionSummary(saved.text),/текст Result сохранён/);
 const cold1=f.make(),cold2=f.make();
 assert.equal((await cold1.receipt(plan.operationId)).state,"COMMITTED");
 assert.equal((await cold2.readback(plan.operationId)).state,"PERSISTED");
 assert.equal(f.writes(),1);
 await cold2.receive({operationId:plan.operationId,recipientId:"iwxa.atlas",
  reference:ref,object:ref});
 assert.equal(f.writes(),1);
 const tampered=JSON.parse(saved.text.slice("T3_RESULT_LINK/1 ".length));
 tampered.selectedAcceptedSummary="Substituted offline text";
 saved.text="T3_RESULT_LINK/1 "+JSON.stringify(tampered);
 await assert.rejects(cold1.readback(plan.operationId),
  {code:"ATLAS_T3_STORED_SELECTED_SUMMARY_MISMATCH"});
 assert.equal(f.writes(),1);
});

test("Invalid original Exchange content digest cannot trigger Atlas native write",async()=>{
 const f=originalNativeFixture({badSummaryHash:true});
 await assert.rejects(f.make().inspect({reference:ref,recipientId:"iwxa.atlas"}),
  {code:"ATLAS_T3_SIGNED_SELECTED_SUMMARY_HASH_MISMATCH"});
 assert.equal(f.writes(),0);
});

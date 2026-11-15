import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,validate} from "../src/core.mjs";
import {createAtlasT3OriginalHostPorts}
 from "../desktop/src/atlas-t3-original-host-ports.mjs";

test("Embedded original owners use only Atlas native commands for Agent Task and accepted T3 Result",async()=>{
 let snapshot=empty(),generation="gen:initial",commits=0,agentWrites=0;
 const p=createProject(snapshot,{name:"One genuine Atlas project"});snapshot=p.state;
 const w=createItem(snapshot,p.id,{title:"Return original external Result"});snapshot=w.state;
 const ref={projectId:p.id,workId:w.id,revision:String(snapshot.revision)};
 const source={workspace_id:"ws:agent",object_id:"result:accepted",
  schema_id:"iwxa.result",revision:1};
 const commands=[];
 const native={
  invoke:async(cmd,arg)=>{
   commands.push(cmd);
   if(cmd==="atlas_open")return {snapshot:structuredClone(snapshot),
    generation,needsConfirmation:false};
   if(cmd==="atlas_commit"){
    if(arg.expectedGeneration!==generation)throw Error("STALE_NATIVE_GENERATION");
    validate(arg.snapshot);snapshot=structuredClone(arg.snapshot);
    generation="gen:"+(++commits);
    return {generation,revision:snapshot.revision};
   }
   throw Error("No other native command");
  },
  authorizeCommand:async c=>["atlas_open","atlas_commit"].includes(c)
 };
 const owners={
  ...native,
  isHostActive:()=>true,
  authorizeAtlasProjectRead:async()=>true,
  findOriginalAgentTask:async({workRef})=>({status:"NOT_FOUND_CONFIRMED",
   projectId:workRef.projectId,workId:workRef.workId,sourceRevision:workRef.revision}),
  issueOriginalAgentTask:async({workRef})=>{
   agentWrites++;return {taskId:"TASK:external-1",projectId:workRef.projectId,
    workId:workRef.workId,sourceRevision:workRef.revision};
  },
  readOriginalAgentTask:async id=>({status:"PERSISTED",taskId:id,
   projectId:ref.projectId,workId:ref.workId,sourceRevision:ref.revision}),
  readOriginalAgentAccepted:async()=>({
   sourceObjectRef:source,workRef:ref,acceptanceKind:"HUMAN_ACCEPTED_DRAFT",
   readOnly:true,taskId:"TASK:external-1",resultId:"RES:external-1",
   acceptedDigest:"a".repeat(64),archiveSha256:"b".repeat(64)
  }),
  readOriginalExchangeReceipt:async ({archiveSha256,recipientId,taskId,resultId})=>
   ({status:"VERIFIED",archiveSha256,recipientId,taskId,resultId}),
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:true,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  })
 };
 const host=createAtlasT3OriginalHostPorts(owners);
 const issued=await host.issueTask(p.id,w.id,{workspaceId:"real-agent-workspace"});
 assert.deepEqual(issued.workRef,ref);
 assert.equal(issued.taskId,"TASK:external-1");
 assert.equal(agentWrites,1);
 const preview=await host.recipient.inspect({reference:source,recipientId:"iwxa.atlas"});
 assert.equal(preview.status,"READY");
 await host.recipient.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
  reference:source,object:source});
 assert.equal(commits,1);
 assert.equal(snapshot.projects[0].decisions.length,1);
 assert.equal(snapshot.projects[0].items[0].state,"todo");
 assert.equal((await host.recipient.readback(preview.operationId)).state,"PERSISTED");
 const cold=createAtlasT3OriginalHostPorts(owners);
 assert.equal((await cold.recipient.receipt(preview.operationId)).state,"COMMITTED");
 await cold.recipient.receive({operationId:preview.operationId,recipientId:"iwxa.atlas",
  reference:source,object:source});
 assert.equal(commits,1);
 assert.equal(commands.filter(c=>c==="atlas_commit").length,1);
 assert.ok(commands.filter(c=>c==="atlas_open").length>=4);
});
test("Embedded T3 route never falls back when native Store, Agent or project authorization is absent",async()=>{
 assert.throws(()=>createAtlasT3OriginalHostPorts(),{code:"ATLAS_T3_U05_TRUSTED_HOST_REQUIRED"});
 const refusal=createAtlasT3OriginalHostPorts({
  invoke:async()=>({generation:"gen:1",snapshot:empty(),needsConfirmation:false}),
  authorizeCommand:()=>false,isHostActive:()=>true,
  authorizeAtlasProjectRead:async()=>true,
  findOriginalAgentTask:async()=>{throw Error("No source");},
  issueOriginalAgentTask:async()=>{throw Error("No source");},
  readOriginalAgentTask:async()=>{throw Error("No source");},
  readOriginalAgentAccepted:async()=>{throw Error("No source");},
  readOriginalExchangeReceipt:async()=>{throw Error("No source");},
  verifyAtlasWrite:async()=>({allowed:false})
 });
 await assert.rejects(refusal.issueTask("some:project","some:work",{}),
  {code:"ATLAS_T3_U05_READ_DENIED"});
});

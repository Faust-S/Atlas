// Run against an EXACT checkout of the original public T3 D6, not a
// copied/forked continuation. The Agent/Kernel/Exchange and Atlas native Store
// owners below are explicit test doubles. This is SOURCE interoperability,
// not proof of two installed applications or of a signed Agent .iwxa export.
import test from "node:test";
import assert from "node:assert/strict";
import {pathToFileURL} from "node:url";
import {empty,createProject,createItem,validate} from "../src/core.mjs";
import {createAtlasT3NativeRecipient,createAtlasT3AgentTaskSelection}
 from "../src/atlas-t3-native-recipient.mjs";

const source=process.env.ATLAS_T3_ORIGINAL_D6_MODULE;
if(!source)throw new Error("Original T3 D6 source path is required");
const {createTrustedNativeContinuation} = await import(pathToFileURL(source).href);

test("Original T3 signed Result -> native Atlas decision -> cold double readback, with no repeat",async()=>{
 let snapshot=empty(),generation="native:0",nativeWrites=0,denied=false,sourceRev=2;
 const p=createProject(snapshot,{name:"Real enterprise workspace",type:"engineering"});
 snapshot=p.state;
 const w=createItem(snapshot,p.id,{title:"Documented equipment installation"});
 snapshot=w.state;
 const ref={projectId:p.id,workId:w.id,revision:String(snapshot.revision)};
 const selection=createAtlasT3AgentTaskSelection({
  readSaved:async()=>({snapshot,generation}),
  isHostActive:()=>true,
  authorizeProjectRead:async()=>true,
  issueOriginalAgentTask:async({workRef})=>({taskId:"TASK:original-1",
   projectId:workRef.projectId,workId:workRef.workId,sourceRevision:workRef.revision}),
  readOriginalAgentTask:async taskId=>({status:"PERSISTED",taskId,
   projectId:ref.projectId,workId:ref.workId,sourceRevision:ref.revision})
 });
 const issued=await selection.issue(p.id,w.id,{workspaceId:"agent:personal"});
 assert.equal(issued.workRef.revision,ref.revision);
 const originalRef={workspace_id:"ws:personal",object_id:"result:accepted-1",
  schema_id:"iwxa.result",revision:2};
 const nativeOpts={
  recipientId:"iwxa.atlas",
  isHostActive:()=>true,
  readSaved:async()=>({snapshot:structuredClone(snapshot),generation}),
  commitSaved:async(expected,next)=>{
   if(expected!==generation)throw Error("ORIGINAL_NATIVE_CAS_STALE");
   validate(next);snapshot=structuredClone(next);
   generation="native:"+(++nativeWrites);
   return {generation,revision:next.revision};
  },
  readOriginalAgentAccepted:async()=>({
   acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
   taskId:issued.taskId,resultId:"RESULT:original-1",
   acceptedDigest:"a".repeat(64),archiveSha256:"b".repeat(64),
   workRef:issued.workRef,sourceObjectRef:originalRef
  }),
  readOriginalExchangeReceipt:async({taskId,resultId,archiveSha256,recipientId})=>({
   status:"VERIFIED",taskId,resultId,archiveSha256,recipientId
  }),
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:!denied,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  })
 };
 const workspace={workspace_id:originalRef.workspace_id,deleted_at:null};
 const currentWorkspace={get:()=>workspace,subscribe:()=>()=>{}};
 const context={kind:"PERSONAL",context_id:"ctx:personal",actor_id:"actor:owner",
   principal_id:"actor:owner",role_id:"role:owner",grant_id:"grant:owner",
   realm_id:"realm:local",audience:"service:atlas",resource:"ws:personal",
   purpose:"read",workspace_id:"ws:personal",organization_id:null,scope_revision:1};
 const now=()=>new Date().toISOString(),later=()=>new Date(Date.now()+60000).toISOString();
 const access={
  currentContext:()=>context,actionFor:()=> "workspace.read",
  operationDigest:()=> "a".repeat(64),
  authorize:()=>({schema:"IWXA_T3_AUTHORIZATION_DECISION/1",
   allowed:!denied,outcome:denied?"DENIED":"PERMITTED",evidenceOnly:true,
   requestDigest:"b".repeat(64),policyDigest:"c".repeat(64),statusSequence:1,
   validUntil:later(),statusObservedAt:now(),evaluatedAt:now(),
   authorityPath:[{grantId:context.grant_id}]}),
  verifyDecisionBinding:()=>true
 };
 const kernel={sessionInfo:{contract_version:"1.3.0"},
  hasOperation:o=>o==="t1.getObject",
  async getObject(ws,id){return {object:{...originalRef,workspace_id:ws,
   object_id:id,revision:sourceRev,data:{result_id:"RESULT:original-1"},
   deleted:false},relations:{incoming:[],outgoing:[]}};}
 };
 let reviews=0;
 const make=()=>createTrustedNativeContinuation({
  kernel,accessForRead:async()=>access,currentWorkspace,
  nativeOwner:createAtlasT3NativeRecipient(nativeOpts),
  confirmHuman:async()=>{reviews++;return true;},isHostActive:()=>true
 });
 const originalD6=make();
 const preview=await originalD6.preview(originalRef);
 assert.equal(preview.status,"AVAILABLE");
 const result=await originalD6.continueSelected(originalRef);
 assert.equal(result.status,"OWNER_READBACK_CONFIRMED");
 assert.equal(nativeWrites,1);
 assert.equal(reviews,1);
 const pSaved=snapshot.projects.find(row=>row.id===p.id);
 assert.equal(pSaved.decisions.length,1);
 assert.equal(pSaved.items.find(row=>row.id===w.id).state,"todo");
 const firstCold=make();
 assert.equal((await firstCold.preview(originalRef)).status,"RECOVER_ONLY");
 assert.equal((await firstCold.continueSelected(originalRef)).status,"OWNER_READBACK_CONFIRMED");
 const secondCold=make();
 assert.equal((await secondCold.recover(originalRef)).status,"OWNER_READBACK_CONFIRMED");
 assert.equal(nativeWrites,1);
 assert.equal(reviews,1);
 // Original T3 D1 authority revocation blocks subsequent signed read.
 denied=true;
 await assert.rejects(secondCold.continueSelected(originalRef),
  {code:"T3_ACCESS_NOT_PERMITTED"});
 denied=false;
 sourceRev=3;
 await assert.rejects(secondCold.continueSelected(originalRef),
  {code:"T3_D6_STALE_OR_MISSING_REFERENCE"});
 assert.equal(nativeWrites,1);
});

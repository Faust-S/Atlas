// Atlas is the RECIPIENT of an original T3 D6 native continuation, not a
// T3 Kernel, Exchange, entitlement evaluator or Agent Task Engine.
// The trusted installed Host supplies the original Agent acceptance readback,
// original Exchange verification, current Atlas authorization and U05 Atlas
// native Store ports. This file never parses or signs an .iwxa archive.
import {validate,createDecision} from "./core.mjs";
import {createAtlasSavedRef} from "./project-host-port.mjs";

const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const SHA=/^[0-9a-f]{64}$/;
const PREFIX="T3_RESULT_LINK/1 ";
const fail=code=>{throw Object.assign(new Error(code),{code});};
const id=(value,code)=>typeof value==="string"&&ID.test(value)?value:fail(code);
const sha=(value,code)=>typeof value==="string"&&SHA.test(value)?value:fail(code);
const sameRef=(a,b)=>a?.workspace_id===b?.workspace_id&&
 a?.object_id===b?.object_id&&a?.schema_id===b?.schema_id&&a?.revision===b?.revision;
const workRef=(r)=>{
 if(!r||typeof r!=="object")fail("ATLAS_T3_WORKREF_REQUIRED");
 id(r.projectId,"ATLAS_T3_PROJECT_ID_INVALID");
 id(r.workId,"ATLAS_T3_WORK_ID_INVALID");
 const revision=String(r.revision);
 if(!/^(0|[1-9]\d*)$/.test(revision)||!Number.isSafeInteger(Number(revision)))
  fail("ATLAS_T3_WORK_REVISION_INVALID");
 return Object.freeze({projectId:r.projectId,workId:r.workId,revision});
};
const objectRef=(r)=>{
 if(!r||typeof r!=="object"||!Number.isSafeInteger(r.revision)||r.revision<=0)
  fail("ATLAS_T3_ORIGINAL_RESULT_REF_INVALID");
 return Object.freeze({workspace_id:id(r.workspace_id,"ATLAS_T3_SOURCE_WS_INVALID"),
  object_id:id(r.object_id,"ATLAS_T3_SOURCE_ID_INVALID"),
  schema_id:id(r.schema_id,"ATLAS_T3_SOURCE_SCHEMA_INVALID"),revision:r.revision});
};
const originalAccepted=(row,ref)=>{
 // This is a verified response from the ORIGINAL Agent's installed Result
 // owner, never data supplied by an Atlas textbox or the Publisher licence.
 if(!row||row.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
    row.readOnly!==true||!sameRef(row.sourceObjectRef,ref))
  fail("ATLAS_T3_ORIGINAL_AGENT_ACCEPTANCE_REQUIRED");
 const work=workRef(row.workRef);
 const taskId=id(row.taskId,"ATLAS_T3_ORIGINAL_TASK_REQUIRED");
 const resultId=id(row.resultId,"ATLAS_T3_ORIGINAL_RESULT_REQUIRED");
 const acceptedDigest=sha(row.acceptedDigest,"ATLAS_T3_RESULT_DIGEST_REQUIRED");
 const archiveSha256=sha(row.archiveSha256,"ATLAS_T3_ARCHIVE_DIGEST_REQUIRED");
 return {work,taskId,resultId,acceptedDigest,archiveSha256};
};
const decisionRecord=(d)=>{
 if(typeof d?.text!=="string"||!d.text.startsWith(PREFIX))return null;
 try{
  const row=JSON.parse(d.text.slice(PREFIX.length));
  if(row?.schema!=="T3_RESULT_LINK/1"||!ID.test(row.operationId)||
     !ID.test(row.taskId)||!ID.test(row.resultId)||
     !ID.test(row.projectId)||!ID.test(row.workId)||
     !/^(0|[1-9]\d*)$/.test(String(row.sourceRevision))||
     !SHA.test(row.archiveSha256)||!SHA.test(row.acceptedDigest))return null;
  const ref=objectRef(row.sourceObjectRef);
  return {...row,sourceObjectRef:ref};
 }catch{return null;}
};
async function hashOperation(ref,accepted){
 const input=JSON.stringify([ref.workspace_id,ref.object_id,ref.schema_id,
  ref.revision,accepted.work.projectId,accepted.work.workId,
  accepted.work.revision,accepted.taskId,accepted.resultId,
  accepted.acceptedDigest,accepted.archiveSha256]);
 if(typeof globalThis.crypto?.subtle?.digest!=="function")
  fail("ATLAS_T3_SHA256_UNAVAILABLE");
 const raw=new TextEncoder().encode(input);
 const result=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",raw));
 return "atlas:t3:"+[...result].map(b=>b.toString(16).padStart(2,"0")).join("");
}

/** Existing Atlas native store only: read -> revision check -> createDecision
 * -> native generation-CAS commit -> independent native cold readback.
 * Receipt and readback recover from the SAME existing Atlas project decisions,
 * not a new journal/Store. The Result remains with the original Agent. */
export function createAtlasT3NativeRecipient({
 readSaved,commitSaved,readOriginalAgentAccepted,
 readOriginalExchangeReceipt,verifyAtlasWrite,isHostActive,
 recipientId="iwxa.atlas"
}={}){
 id(recipientId,"ATLAS_T3_RECIPIENT_INVALID");
 if([readSaved,commitSaved,readOriginalAgentAccepted,
     readOriginalExchangeReceipt,verifyAtlasWrite,isHostActive]
   .some(fn=>typeof fn!=="function"))
  fail("ATLAS_T3_TRUSTED_INSTALLED_HOST_REQUIRED");
 const active=()=>{if(isHostActive()!==true)fail("ATLAS_T3_HOST_DISPOSED");};
 async function load(){
  active();const saved=await readSaved();active();
  if(!saved||typeof saved.generation!=="string"||!saved.generation||
     saved.needs_confirmation===true)fail("ATLAS_T3_NATIVE_STORE_UNAVAILABLE");
  validate(saved.snapshot);
  return saved;
 }
 function findReceipt(snapshot,op){
  const found=[];
  for(const project of snapshot.projects)for(const d of project.decisions){
   const record=decisionRecord(d);
   if(record?.operationId===op){
    if(project.id!==record.projectId)fail("ATLAS_T3_RECEIPT_CROSS_PROJECT");
    const work=project.items.find(w=>w.id===record.workId);
    if(!work)fail("ATLAS_T3_RECEIPT_WORK_MISSING");
    found.push({record,decisionId:d.id,projectId:project.id});
   }
  }
  if(found.length>1)fail("ATLAS_T3_DUPLICATE_PERSISTED_RECEIPT");
  return found[0]??null;
 }
 async function receiptFor(op,state){
  id(op,"ATLAS_T3_OPERATION_ID_INVALID");
  const saved=await load();
  const entry=findReceipt(saved.snapshot,op);
  if(!entry)return null;
  return {state,operationId:op,recipientId,
   reference:entry.record.sourceObjectRef,
   resultRef:"atlas:decision:"+entry.decisionId};
 }
 async function checked(ref){
  active();
  const received=await readOriginalAgentAccepted(ref);
  active();
  const accepted=originalAccepted(received,ref);
  // Original Exchange verifies its own .iwxa, recipient and archive SHA-256.
  // A Publisher PERSON feature entitlement is NOT project data authority.
  const exchange=await readOriginalExchangeReceipt({
   sourceObjectRef:ref,taskId:accepted.taskId,resultId:accepted.resultId,
   archiveSha256:accepted.archiveSha256,recipientId});
  active();
  if(exchange?.status!=="VERIFIED"||
     exchange.archiveSha256!==accepted.archiveSha256||
     exchange.recipientId!==recipientId||
     exchange.taskId!==accepted.taskId||
     exchange.resultId!==accepted.resultId)
    fail("ATLAS_T3_ORIGINAL_EXCHANGE_UNVERIFIED");
  const op=await hashOperation(ref,accepted);active();
  return {ref,accepted,op};
 }
 async function permitted(state,action){
  const verdict=await verifyAtlasWrite({
   operationId:state.op,action,recipientId,
   workRef:state.accepted.work,
   sourceObjectRef:state.ref,
   taskId:state.accepted.taskId,
   resultId:state.accepted.resultId,
   archiveSha256:state.accepted.archiveSha256});
  active();
  if(verdict?.allowed!==true||verdict.operationId!==state.op||
     verdict.recipientId!==recipientId||
     verdict.projectId!==state.accepted.work.projectId||
     verdict.workId!==state.accepted.work.workId||
     verdict.revision!==state.accepted.work.revision)
    fail("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
 }
 async function inspect({reference,recipientId:to}={}){
  active();if(to!==recipientId)fail("ATLAS_T3_RECIPIENT_MISMATCH");
  const state=await checked(objectRef(reference));
  const saved=await load();
  const existing=findReceipt(saved.snapshot,state.op);
  if(existing)return {status:"RECOVER_ONLY",operationId:state.op,
   recipientId,reference:state.ref};
  const r=state.accepted.work;
  if(String(saved.snapshot.revision)!==r.revision)
   fail("ATLAS_T3_SOURCE_REVISION_CHANGED");
  const project=saved.snapshot.projects.find(p=>p.id===r.projectId);
  if(!project?.items.some(item=>item.id===r.workId))
   fail("ATLAS_T3_WORK_NOT_FOUND");
  await permitted(state,"atlas.work.result.preview");
  return {status:"READY",operationId:state.op,recipientId,reference:state.ref};
 }
 async function receive({operationId,recipientId:to,reference,object}={}){
  active();if(to!==recipientId)fail("ATLAS_T3_RECIPIENT_MISMATCH");
  const ref=objectRef(reference);
  if(!sameRef(object,ref)||object.deleted===true)
   fail("ATLAS_T3_ORIGINAL_OBJECT_CHANGED");
  const state=await checked(ref);
  if(operationId!==state.op)fail("ATLAS_T3_OPERATION_MISMATCH");
  // Original D6 Host has just performed a fresh signed t1.getObject read.
  // Atlas separately verifies its own native write permission JIT.
  await permitted(state,"atlas.work.result.apply");
  const before=await load(),existing=findReceipt(before.snapshot,state.op);
  if(existing)return; // Original decision already committed. No second write.
  const r=state.accepted.work;
  if(String(before.snapshot.revision)!==r.revision)
   fail("ATLAS_T3_SOURCE_REVISION_CHANGED");
  const project=before.snapshot.projects.find(p=>p.id===r.projectId);
  if(!project?.items.some(item=>item.id===r.workId))
   fail("ATLAS_T3_WORK_NOT_FOUND");
  const record={
   schema:"T3_RESULT_LINK/1",operationId:state.op,
   projectId:r.projectId,workId:r.workId,sourceRevision:r.revision,
   sourceObjectRef:state.ref,taskId:state.accepted.taskId,
   resultId:state.accepted.resultId,
   acceptedDigest:state.accepted.acceptedDigest,
   archiveSha256:state.accepted.archiveSha256
  };
  // Existing Atlas decision is an owner's record of receiving the verified
  // Result reference; accepted DRAFT alone never marks Work as "done".
  const next=createDecision(before.snapshot,r.projectId,
   PREFIX+JSON.stringify(record));
  await commitSaved(before.generation,next);
  active();
  const observed=await load();
  if(!findReceipt(observed.snapshot,state.op))
   fail("ATLAS_T3_NATIVE_READBACK_UNCONFIRMED");
 }
 return Object.freeze({
  recipientId,
  inspect,receive,
  receipt:op=>receiptFor(op,"COMMITTED"),
  readback:op=>receiptFor(op,"PERSISTED")
 });
}

// A selected Atlas WorkRef may be handed to the ORIGINAL installed Agent Task
// owner. Atlas does not create or sign a Task. The original Agent owner issues
// the actual Task only after independently checking its own rights/Workspace.
export function createAtlasT3AgentTaskSelection({
 readSaved,authorizeProjectRead,issueOriginalAgentTask,
 readOriginalAgentTask,isHostActive
}={}){
 if([readSaved,authorizeProjectRead,issueOriginalAgentTask,
     readOriginalAgentTask,isHostActive]
   .some(fn=>typeof fn!=="function"))fail("ATLAS_T3_AGENT_HOST_REQUIRED");
 const issuing=new Set(); // one native owner dispatch per live host + WorkRef
 return Object.freeze({async issue(projectId,workId,agentContext){
  if(isHostActive()!==true)fail("ATLAS_T3_HOST_DISPOSED");
  const saved=await readSaved();
  if(!saved?.generation||saved.needs_confirmation===true)
   fail("ATLAS_T3_NATIVE_STORE_UNAVAILABLE");
  const ref=createAtlasSavedRef(saved.snapshot,{projectId,workId},
   {persisted:true,dirty:false});
  const permitted=await authorizeProjectRead({workRef:ref,context:agentContext,
   purpose:"atlas.work.task.selection"});
  if(isHostActive()!==true||permitted!==true)
   fail("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  const key=JSON.stringify(ref);
  if(issuing.has(key))fail("ATLAS_T3_AGENT_TASK_ISSUE_IN_PROGRESS");
  issuing.add(key);
  try{
   const issued=await issueOriginalAgentTask({workRef:ref,context:agentContext});
   if(isHostActive()!==true||!issued||!ID.test(issued.taskId??"")||
      issued.projectId!==ref.projectId||
      issued.workId!==ref.workId||
      String(issued.sourceRevision)!==ref.revision)
    fail("ATLAS_T3_AGENT_TASK_ISSUANCE_UNVERIFIED");
   const readback=await readOriginalAgentTask(issued.taskId,agentContext);
   if(isHostActive()!==true||readback?.status!=="PERSISTED"||
      readback.taskId!==issued.taskId||
      readback.projectId!==ref.projectId||readback.workId!==ref.workId||
      String(readback.sourceRevision)!==ref.revision)
    fail("ATLAS_T3_AGENT_TASK_READBACK_UNVERIFIED");
   const after=await readSaved();
   if(isHostActive()!==true||after?.generation!==saved.generation||
      String(after?.snapshot?.revision)!==ref.revision)
    fail("ATLAS_T3_WORK_CHANGED_DURING_TASK_ISSUE");
   // No new Task is created in Atlas; Agent retains its native Task owner.
   return Object.freeze({workRef:ref,taskId:issued.taskId});
  }finally{issuing.delete(key);}
 }});
}

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
// Explicit denials come from the trusted original owner before a native write.
 // Validation errors, missing proofs, IPC failures and lost commit ACKs never
 // acquire this marker merely because they use an Atlas error code.
const fail=code=>{throw Object.assign(new Error(code),{code});};
const deny=code=>{throw Object.assign(new Error(code),{code,outcome:"DENIED"});};
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
// Pure UI projection only: a stored Atlas Decision is not proof that the
// current Agent/Exchange permission remains valid. Verification occurs only
// via the original T3/Atlas Host ports at receipt/readback time.
export function atlasT3DecisionSummary(text){
 if(typeof text!=="string"||!text.startsWith(PREFIX))return null;
 const record=decisionRecord({text});
 if(!record)return "Повреждена запись связи Atlas с T3. Требуется проверка.";
 return "Связь с результатом Agent: работа "+record.workId+
  ", Task "+record.taskId+", Result "+record.resultId+
  ". Источник и полномочия проверяются заново при использовании.";
}
// One read-only index for the EXISTING Atlas work table. Entries are source
// references, never T3 permission decisions or claims that Work is complete.
export function atlasT3RecordedWorkLinks(project){
 const links=new Map();
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.decisions))
  return links;
 const works=new Set(project.items.map(w=>w.id));
 for(const decision of project.decisions){
  const row=decisionRecord(decision);
  if(!row||row.projectId!==project.id||!works.has(row.workId))continue;
  if(!links.has(row.workId))links.set(row.workId,[]);
  links.get(row.workId).push(Object.freeze({
   taskId:row.taskId,resultId:row.resultId,decisionId:decision.id,
   operationId:row.operationId,sourceObjectRef:row.sourceObjectRef,
  }));
 }
 return links;
}
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
   const isLinked=typeof d.text==="string"&&d.text.startsWith(PREFIX);
   const record=decisionRecord(d);
   // An incomplete Atlas T3 marker is not permission to attempt a new
   // delivery: the original native writer may have lost its acknowledgement.
   if(isLinked&&!record)fail("ATLAS_T3_MALFORMED_LINK_HOLD");
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
  await verifyPersisted(entry,saved,op);
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
  // An explicit, correctly bound negative decision from ORIGINAL Exchange
  // is definite. Missing, stale and malformed receipts are NOT DENIED.
  if(exchange?.status==="DENIED"&&
     exchange.archiveSha256===accepted.archiveSha256&&
     exchange.recipientId===recipientId&&
     exchange.taskId===accepted.taskId&&
     exchange.resultId===accepted.resultId)
    deny("ATLAS_T3_ORIGINAL_EXCHANGE_UNVERIFIED");
  if(exchange?.status!=="VERIFIED"||
     exchange.archiveSha256!==accepted.archiveSha256||
     exchange.recipientId!==recipientId||
     exchange.taskId!==accepted.taskId||
     exchange.resultId!==accepted.resultId)
    fail("ATLAS_T3_ORIGINAL_EXCHANGE_UNVERIFIED");
  const op=await hashOperation(ref,accepted);active();
  return {ref,accepted,op};
 }
 async function verifyPersisted(entry,saved,op,state=null){
  // An Atlas decision is source data, not a cryptographic native receipt.
  // Rebind it to ORIGINAL accepted Agent Result and original Exchange
  // evidence every time, including after a cold Atlas/T3 Host restart.
  const verified=state??await checked(entry.record.sourceObjectRef);
  const row=entry.record,ref=verified.accepted.work;
  if(verified.op!==op||row.operationId!==op||
     !sameRef(row.sourceObjectRef,verified.ref)||
     row.projectId!==ref.projectId||row.workId!==ref.workId||
     String(row.sourceRevision)!==ref.revision||
     row.taskId!==verified.accepted.taskId||
     row.resultId!==verified.accepted.resultId||
     row.acceptedDigest!==verified.accepted.acceptedDigest||
     row.archiveSha256!==verified.accepted.archiveSha256||
     !(saved.snapshot.revision>Number(ref.revision)))
    fail("ATLAS_T3_STORED_LINK_SOURCE_MISMATCH");
  await permitted(verified,"atlas.work.result.readback");
  return verified;
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
  // Explicit false from the installed Atlas Authority is a DEFINITE refusal.
  // A malformed / missing verdict is not an authoritative refusal and must
  // not be confused with a definitive pre-write DENIED outcome.
  if(verdict?.allowed===false)
    deny("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
  if(verdict?.allowed!==true||verdict.operationId!==state.op||
     verdict.recipientId!==recipientId||
     verdict.projectId!==state.accepted.work.projectId||
     verdict.workId!==state.accepted.work.workId||
     verdict.revision!==state.accepted.work.revision)
    fail("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
 }
 async function inspect({reference,recipientId:to}={}){
  active();if(to!==recipientId)deny("ATLAS_T3_RECIPIENT_MISMATCH");
  const state=await checked(objectRef(reference));
  const saved=await load();
  const existing=findReceipt(saved.snapshot,state.op);
  if(existing)await verifyPersisted(existing,saved,state.op,state);
  // Original T3 D6 checks the durable receipt before any native dispatch.
  // Keep inspect READY after a cold open so continueSelected can recover the
  // original receipt itself. Its public preview will still say RECOVER_ONLY.
  if(existing)return {status:"READY",operationId:state.op,
   recipientId,reference:state.ref};
  const r=state.accepted.work;
  if(String(saved.snapshot.revision)!==r.revision)
   fail("ATLAS_T3_SOURCE_REVISION_CHANGED");
  const project=saved.snapshot.projects.find(p=>p.id===r.projectId);
  if(!project?.items.some(item=>item.id===r.workId))
   deny("ATLAS_T3_WORK_NOT_FOUND");
  await permitted(state,"atlas.work.result.preview");
  return {status:"READY",operationId:state.op,recipientId,reference:state.ref};
 }
 async function receive({operationId,recipientId:to,reference,object}={}){
  active();if(to!==recipientId)deny("ATLAS_T3_RECIPIENT_MISMATCH");
  const ref=objectRef(reference);
  if(!sameRef(object,ref)||object.deleted===true)
   deny("ATLAS_T3_ORIGINAL_OBJECT_CHANGED");
  const state=await checked(ref);
  if(operationId!==state.op)deny("ATLAS_T3_OPERATION_MISMATCH");
  // Original D6 Host has just performed a fresh signed t1.getObject read.
  // Atlas separately verifies its own native write permission JIT.
  await permitted(state,"atlas.work.result.apply");
  const before=await load(),existing=findReceipt(before.snapshot,state.op);
  if(existing){
   await verifyPersisted(existing,before,state.op,state);
   return; // Original verified decision committed. No second write.
  }
  const r=state.accepted.work;
  if(String(before.snapshot.revision)!==r.revision)
   deny("ATLAS_T3_SOURCE_REVISION_CHANGED");
  const project=before.snapshot.projects.find(p=>p.id===r.projectId);
  if(!project?.items.some(item=>item.id===r.workId))
   deny("ATLAS_T3_WORK_NOT_FOUND");
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
  const observed=await load(),persisted=findReceipt(observed.snapshot,state.op);
  if(!persisted)fail("ATLAS_T3_NATIVE_READBACK_UNCONFIRMED");
  await verifyPersisted(persisted,observed,state.op,state);
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
 readOriginalAgentTask,findOriginalAgentTask,isHostActive
}={}){
 if([readSaved,authorizeProjectRead,issueOriginalAgentTask,
     readOriginalAgentTask,findOriginalAgentTask,isHostActive]
   .some(fn=>typeof fn!=="function"))fail("ATLAS_T3_AGENT_HOST_REQUIRED");
 const issuing=new Set();
 const uncertain=new Set(); // lifetime guard only; original Agent owns durable Task
 const live=()=>{if(isHostActive()!==true)fail("ATLAS_T3_HOST_DISPOSED");};
 const verifyOwnerTask=async(taskId,ref,agentContext)=>{
  id(taskId,"ATLAS_T3_AGENT_TASK_ID_INVALID");
  const task=await readOriginalAgentTask(taskId,agentContext);
  live();
  if(task?.status!=="PERSISTED"||task.taskId!==taskId||
     task.projectId!==ref.projectId||task.workId!==ref.workId||
     String(task.sourceRevision)!==ref.revision)
   fail("ATLAS_T3_AGENT_TASK_READBACK_UNVERIFIED");
  return Object.freeze({workRef:ref,taskId});
 };
 const sameWork=(row,ref)=>row?.projectId===ref.projectId&&
  row?.workId===ref.workId&&String(row?.sourceRevision)===ref.revision;
 return Object.freeze({async issue(projectId,workId,agentContext){
  live();
  const saved=await readSaved();
  if(!saved?.generation||saved.needs_confirmation===true)
   fail("ATLAS_T3_NATIVE_STORE_UNAVAILABLE");
  const ref=createAtlasSavedRef(saved.snapshot,{projectId,workId},
   {persisted:true,dirty:false});
  const grant=await authorizeProjectRead({workRef:ref,context:agentContext,
   purpose:"atlas.work.task.selection"});
  if(grant===false)deny("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  if(grant!==true)fail("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  live();
  const key=JSON.stringify(ref);
  if(issuing.has(key))fail("ATLAS_T3_AGENT_TASK_ISSUE_IN_PROGRESS");
  issuing.add(key);
  try{
   // Original Agent is the ONLY Task source of truth. After a cold restart,
   // query its durable Task index BEFORE dispatching any new Task. A missing
   // or uncertain owner answer never authorizes retry.
   const prior=await findOriginalAgentTask({workRef:ref,context:agentContext});
   live();
   if(!sameWork(prior,ref))
    fail("ATLAS_T3_AGENT_TASK_LOOKUP_UNVERIFIED");
   let result;
   if(prior.status==="PERSISTED"){
    result=await verifyOwnerTask(prior.taskId,ref,agentContext);
   }else if(prior.status==="NOT_FOUND_CONFIRMED"){
    if(uncertain.has(key))fail("ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN");
    const head=await readSaved();
    live();
    if(head?.generation!==saved.generation||
       String(head?.snapshot?.revision)!==ref.revision)
     fail("ATLAS_T3_WORK_CHANGED_DURING_TASK_ISSUE");
    // Dispatch ONCE. A lost reply can mean a committed original Task.
    // The owner must return a persistently deduplicated Task for this ref;
    // no retry here, even if its returned receipt cannot be read back.
    uncertain.add(key);
    let issued;
    try{issued=await issueOriginalAgentTask({workRef:ref,context:agentContext});}
    catch{fail("ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN");}
    live();
    if(!sameWork(issued,ref)||!ID.test(issued?.taskId??""))
     fail("ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN");
    result=await verifyOwnerTask(issued.taskId,ref,agentContext);
    uncertain.delete(key);
   }else{
    // A stale NONE/READY/timeout is not proof that the Agent has not
    // already committed the exact Task on another process or earlier run.
    fail("ATLAS_T3_AGENT_TASK_OUTCOME_UNKNOWN");
   }
   const after=await readSaved();
   live();
   if(after?.generation!==saved.generation||
      String(after?.snapshot?.revision)!==ref.revision)
    fail("ATLAS_T3_WORK_CHANGED_DURING_TASK_ISSUE");
   return result;
  }finally{issuing.delete(key);}
 }});
}

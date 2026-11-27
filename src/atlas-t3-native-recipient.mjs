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
const PORTABLE_CONTENT=["selectedAcceptedSummary","selectedSummarySha256"];
// Only the ORIGINAL Exchange verifies a carrier's signature/recipient.
// This validates the resulting selected-content shape before native CAS.
function portableSummary(row){
 const contentPresent=PORTABLE_CONTENT.some(k=>Object.hasOwn(row??{},k));
 // The updated ORIGINAL Exchange explicitly sets false when verifying a
 // genuine older reference-only carrier. That is readable, not portable.
 if(!contentPresent&&row?.portableSelectedSummary!==true)return null;
 const text=row.selectedAcceptedSummary;
 if(row.portableSelectedSummary!==true||typeof text!=="string"||
    !text.trim()||new TextEncoder().encode(text).byteLength>65536||
    !SHA.test(row.selectedSummarySha256))
  fail("ATLAS_T3_SIGNED_SELECTED_SUMMARY_INVALID");
 return Object.freeze({selectedAcceptedSummary:text,
  selectedSummarySha256:row.selectedSummarySha256});
}
async function verifySummaryDigest(portable){
 if(portable===null)return;
 if(typeof globalThis.crypto?.subtle?.digest!=="function")
  fail("ATLAS_T3_SHA256_UNAVAILABLE");
 const bytes=new TextEncoder().encode(portable.selectedAcceptedSummary);
 const hashed=new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",bytes));
 const observed=[...hashed].map(v=>v.toString(16).padStart(2,"0")).join("");
 if(observed!==portable.selectedSummarySha256)
  fail("ATLAS_T3_SIGNED_SELECTED_SUMMARY_HASH_MISMATCH");
}
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
// All original source profiles use the same signed-file recipient,
// native U05 Decision and readback. Historic Agent decisions have no
// sourceKind; do not migrate them or reject their previously valid shape.
const corporateIdentity=["organizationId","workspaceId","executorId","managerId",
 "atlasGrantId","signedTaskRevisionId","signedTaskPackageSha256"];
const appliedOnly=["acceptanceId","applicationEffectKey","appliedEventId"];
const workspaceOnly=["taskObjectId","taskEventId","resultEventId"];
const appliedFields=[...corporateIdentity,...appliedOnly];
const workspaceFields=[...corporateIdentity,...workspaceOnly];
const corporateFields=[...corporateIdentity,...appliedOnly,...workspaceOnly];
const corporateResult=kind=>["ADMIN_APPLIED_RESULT","ADMIN_WORKSPACE_RESULT"].includes(kind);
function signedSource(row,ref,operationId){
 if(/^agent:t3:atlas:[a-f0-9]{64}$/.test(operationId??"")){
  if(row.sourceKind!==undefined&&row.sourceKind!=="AGENT_ACCEPTED_RESULT")
   fail("ATLAS_T3_SIGNED_SOURCE_KIND_INVALID");
  if(corporateFields.some(k=>Object.hasOwn(row,k)&&
    !["signedTaskRevisionId","signedTaskPackageSha256"].includes(k)))
   fail("ATLAS_T3_SIGNED_SOURCE_KIND_INVALID");
  return {sourceKind:"AGENT_ACCEPTED_RESULT"};
 }
 if(row.sourceKind==="ADMIN_WORKSPACE_RESULT"){
  if(!/^admin:t3:atlas:[a-f0-9]{64}$/.test(operationId??"")||
    !["organizationId","workspaceId","executorId","managerId","atlasGrantId",
      "taskEventId","resultEventId","resultId","taskId"].every(k=>typeof row[k]==="string"&&ID.test(row[k]))||
    !["signedTaskRevisionId","signedTaskPackageSha256"].every(k=>typeof row[k]==="string"&&SHA.test(row[k]))||
    !/^company:work:[a-f0-9]{64}$/.test(row.taskObjectId??"")||
    ref.workspace_id!==row.workspaceId||ref.schema_id!=="iwxa.t3.company-work-record"||
    !/^company:work:[a-f0-9]{64}$/.test(ref.object_id)||ref.revision!==1||
    row.taskObjectId===ref.object_id||row.taskEventId===row.resultEventId||
    appliedOnly.some(k=>Object.hasOwn(row,k))||
    row.acceptedDigest!==row.selectedSummarySha256)
   fail("ATLAS_T3_SIGNED_CORPORATE_PROVENANCE_INVALID");
  return {sourceKind:"ADMIN_WORKSPACE_RESULT",
   ...Object.fromEntries(workspaceFields.map(k=>[k,row[k]]))};
 }
 if(!/^admin:t3:atlas:[a-f0-9]{64}$/.test(operationId??"")||
    row.sourceKind!=="ADMIN_APPLIED_RESULT"||
    workspaceOnly.some(k=>Object.hasOwn(row,k))||
    !["organizationId","workspaceId","executorId","managerId","appliedEventId","atlasGrantId"]
     .every(k=>typeof row[k]==="string"&&ID.test(row[k]))||
    !["acceptanceId","applicationEffectKey","signedTaskRevisionId","signedTaskPackageSha256","resultId"]
     .every(k=>typeof row[k]==="string"&&SHA.test(row[k]))||
    ref.schema_id!=="iwxa.admin.applied-results"||
    ref.object_id!=="result:applied:"+row.applicationEffectKey||ref.revision!==1||
    row.acceptedDigest!==row.selectedSummarySha256)
  fail("ATLAS_T3_SIGNED_CORPORATE_PROVENANCE_INVALID");
 return {sourceKind:"ADMIN_APPLIED_RESULT",
  ...Object.fromEntries(appliedFields.map(k=>[k,row[k]]))};
}
const sameSignedSource=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
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
  portableSummary(row);
  if(row.signedFileMode===true)signedSource(row,ref,row.sourceOperationId);
  return {...row,sourceObjectRef:ref};
 }catch{return null;}
};
// Historical native readback for Center's exact accepted Result. This is
// a saved link, not an original signature, current grant or delivery proof.
// Compare the signed corporate provenance, not titles or adjacent results.
export function recordedCorporateAtlasResult(snapshot,source){
 const work=source?.workRef;
 if(!source||!work||!ID.test(source.organizationId??"")||
    !ID.test(source.workspaceId??"")||!ID.test(source.taskId??"")||
    !SHA.test(source.taskRevisionId??"")||!SHA.test(source.resultRevisionId??"")||
    !SHA.test(source.acceptanceId??"")||!ID.test(work.projectId??"")||
    !ID.test(work.workId??"")||typeof work.revision!=="string"||
    !/^(0|[1-9][0-9]*)$/.test(work.revision)||
    !Number.isSafeInteger(Number(work.revision)))
  fail("ATLAS_T3_CORPORATE_RESULT_REFERENCE_INVALID");
 const revision=String(snapshot.revision);
 const project=snapshot.projects.find(p=>p.id===work.projectId);
 if(!project?.items.some(item=>item.id===work.workId))
  return {status:"WORK_MISSING",revision};
 const matches=[];
 for(const decision of project.decisions){
  const row=decisionRecord(decision);
  if(!row||row.sourceKind!=="ADMIN_APPLIED_RESULT"||row.signedFileMode!==true||
     row.originalKernelEventVerified!==false||
     row.projectId!==work.projectId||row.workId!==work.workId||
     String(row.sourceRevision)!==work.revision||
     row.organizationId!==source.organizationId||row.workspaceId!==source.workspaceId||
     row.taskId!==source.taskId||row.signedTaskRevisionId!==source.taskRevisionId||
     row.resultId!==source.resultRevisionId||row.acceptanceId!==source.acceptanceId)continue;
  if(!/^atlas:t3:[a-f0-9]{64}$/.test(row.operationId)||
     !ID.test(decision.id??"")||!(snapshot.revision>Number(work.revision)))
   return {status:"AMBIGUOUS",revision};
  matches.push({row,decisionId:decision.id});
 }
 if(matches.length>1)return {status:"AMBIGUOUS",revision};
 if(!matches.length)return {status:"NOT_RECORDED",revision};
 const entry=matches[0];
 // Do not present one apparently valid record when another saved Decision
 // carries its operation ID (even in a different project).
 let count=0;
 for(const p of snapshot.projects)for(const d of p.decisions){
  if(decisionRecord(d)?.operationId===entry.row.operationId)count++;
 }
 if(count!==1)return {status:"AMBIGUOUS",revision};
 return {status:"RECORDED",revision,decisionId:entry.decisionId};
}
// Pure UI projection only: a stored Atlas Decision is not proof that the
// current Agent/Exchange permission remains valid. Verification occurs only
// via the original T3/Atlas Host ports at receipt/readback time.
export function atlasT3DecisionSummary(text){
 if(typeof text!=="string"||!text.startsWith(PREFIX))return null;
 const record=decisionRecord({text});
 if(!record)return "Повреждена запись связи Atlas с T3. Требуется проверка.";
 return (corporateResult(record.sourceKind)
  ?"Связь с корпоративным результатом Admin Center: работа "
  :"Связь с результатом Agent: работа ")+record.workId+
  ", Task "+record.taskId+", Result "+record.resultId+
  (record.signedFileMode===true
    ?". В Atlas сохранён текст, помеченный как полученный из подписанного файла. "+
     "Подлинность и полномочия требуют проверки оригинальным T3; "+
     "событие Kernel отправителя не проверено."
    :record.portableSelectedSummary===true
      ?". Выбранный текст Result сохранён в Atlas."
      :". Передана только ссылка, без содержания Result.")+
  " Источник и полномочия проверяются заново при использовании.";
}
// Read the locally saved selected text without manufacturing a current grant.
export function atlasT3PortableResultText(text){
 const record=decisionRecord({text});
 return record?.portableSelectedSummary===true
  ?record.selectedAcceptedSummary:null;
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
   sourceRevision:String(row.sourceRevision),receivedAt:decision.at,
   portableSelectedSummary:row.portableSelectedSummary===true,
   signedFileMode:row.signedFileMode===true,
   sourceKind:corporateResult(row.sourceKind)?row.sourceKind:"AGENT_ACCEPTED_RESULT",
  }));
 }
 return links;
}
// Existing Decision and finding references are the only persisted links.
// These are historical records, not proof of a current T3 grant or completion.
/** @param {any} project
 * @param {{corporateScope?:{organizationId:string,workspaceId:string|null}|null}} [options] */
export function atlasT3ProjectResultLinks(project,{corporateScope=null}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.decisions))return [];
 const byWork=atlasT3RecordedWorkLinks(project);
 const targets=new Map((project.targets??[]).map(target=>[target.id,target]));
 const decisions=new Map(project.decisions.map(d=>[d.id,d]));
 const counts=new Map(),operationCounts=new Map();
 for(const rows of byWork.values())for(const link of rows){
  operationCounts.set(link.operationId,(operationCounts.get(link.operationId)??0)+1);
 }
 for(const finding of project.findings??[]){
  if(typeof finding.reference!=="string"||!finding.reference.startsWith("atlas:decision:"))continue;
  const key=JSON.stringify([finding.workId,finding.targetId,finding.reference]);
  counts.set(key,(counts.get(key)??0)+1);
 }
 const out=[];
 for(const work of project.items)for(const link of byWork.get(work.id)??[]){
  if(!/^atlas:t3:[a-f0-9]{64}$/.test(link.operationId)||
     !ID.test(link.decisionId??"")||operationCounts.get(link.operationId)!==1)continue;
  const reference="atlas:decision:"+link.decisionId;
  const decision=decisions.get(link.decisionId);
  if(corporateResult(link.sourceKind)&&corporateScope!==null){
   const row=decisionRecord(decision);
   if(!row||row.organizationId!==corporateScope.organizationId||
      row.workspaceId!==corporateScope.workspaceId)continue;
  }
  const targetLinks=(work.targetIds??[]).filter(id=>targets.has(id)).map(id=>({
   id,title:targets.get(id).title,
   observationCount:counts.get(JSON.stringify([work.id,id,reference]))??0
  }));
  out.push({...link,workId:work.id,workTitle:work.title,reference,targetLinks,
   selectedText:atlasT3PortableResultText(decision?.text)});
 }
 return out;
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
  // Current original T3 sender publishes exactly ONE human-accepted
  // Result, never the whole organizational Workspace or Agent memory.
  // A generic VERIFIED string/recipient is insufficient evidence of
  // selective disclosure. Only the ORIGINAL signed Exchange owns this
  // byte-level proof; Atlas independently checks its returned bindings.
  if(exchange.originalSignatureVerified!==true||
     exchange.archiveBytesVerified!==true||
     exchange.originalManifestVerified!==true||
     exchange.disclosureScope!=="ORIGINAL_RESULT_ONLY"||
     !sameRef(exchange.selectedSourceObjectRef,ref))
    fail("ATLAS_T3_ORIGINAL_EXCHANGE_DISCLOSURE_UNVERIFIED");
  if(exchange.portableSelectedSummary!==true&&
     PORTABLE_CONTENT.some(k=>Object.hasOwn(exchange,k)))
   fail("ATLAS_T3_SIGNED_SELECTED_SUMMARY_UNVERIFIED");
  const portable=portableSummary(exchange);
  await verifySummaryDigest(portable);
  const op=await hashOperation(ref,accepted);active();
  return {ref,accepted,op,portable};
 }
 async function verifyPersisted(entry,saved,op,state=null){
  if(entry.record.signedFileMode===true)
   fail("ATLAS_T3_SIGNED_FILE_NOT_KERNEL_RECEIPT");
  // An Atlas decision is source data, not a cryptographic native receipt.
  // Rebind it to ORIGINAL accepted Agent Result and original Exchange
  // evidence every time, including after a cold Atlas/T3 Host restart.
  const verified=state??await checked(entry.record.sourceObjectRef);
  const row=entry.record,ref=verified.accepted.work;
  const storedPortable=portableSummary(row);
  const expectedPortable=verified.portable;
  if((storedPortable===null)!==(expectedPortable===null)||
     (storedPortable!==null&&
      (storedPortable.selectedAcceptedSummary!==
       expectedPortable.selectedAcceptedSummary||
       storedPortable.selectedSummarySha256!==
       expectedPortable.selectedSummarySha256)))
   fail("ATLAS_T3_STORED_SELECTED_SUMMARY_MISMATCH");
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
  // Explicit false from the installed Atlas Authority is DEFINITE only
  // when its reply is bound to THIS operation, recipient and original WorkRef.
  // A stale/malformed verdict, missing grant or timeout is never DENIED.
  const bound=verdict?.operationId===state.op&&
   verdict.recipientId===recipientId&&
   verdict.projectId===state.accepted.work.projectId&&
   verdict.workId===state.accepted.work.workId&&
   verdict.revision===state.accepted.work.revision;
  if(verdict?.allowed===false&&bound)
    deny("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
  if(verdict?.allowed!==true||!bound)
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
   archiveSha256:state.accepted.archiveSha256,
   ...(state.portable===null?{}:{
     portableSelectedSummary:true,...state.portable})
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

/** Incoming ORIGINAL signed .iwxa when Agent is NOT installed here.
 * Only the original T3 recipient verifies Ed25519, current grant, and
 * persists original signed bytes in its EXISTING Reconciliation Store.
 * Atlas writes a Decision into its EXISTING U05 native generation-CAS.
 * A signed file NEVER masquerades as a reread of sender Kernel Object/Event.
 */
export function createAtlasT3SignedFileRecipient({
 readSaved,commitSaved,inspectOriginalSignedFile,
 readVerifiedSignedArchive,verifyAtlasWrite,isHostActive,
 readSavedRevision=null,
}={}){
 if([readSaved,commitSaved,inspectOriginalSignedFile,
   readVerifiedSignedArchive,verifyAtlasWrite,isHostActive]
     .some(fn=>typeof fn!=="function"))
  fail("ATLAS_T3_ORIGINAL_SIGNED_FILE_OWNER_REQUIRED");
 if(readSavedRevision!==null&&typeof readSavedRevision!=="function")
  fail("ATLAS_T3_ORIGINAL_HISTORY_PORT_INVALID");
 const recipientId="iwxa.atlas";
 const active=()=>{if(isHostActive()!==true)
  fail("ATLAS_T3_SIGNED_FILE_HOST_DISPOSED");};
 async function load(){
  active();const saved=await readSaved();active();
  if(typeof saved?.generation!=="string"||!saved.generation||
    saved.needs_confirmation===true)
   fail("ATLAS_T3_NATIVE_STORE_UNAVAILABLE");
  validate(saved.snapshot);return saved;
 }
 async function proven(row){
  active();
  if(row?.status!=="ORIGINAL_SIGNED_SELECTED_RESULT_VERIFIED"||
     row.recipientId!==recipientId||
     row.signatureVerified!==true||row.archiveBytesVerified!==true||
     row.originalManifestVerified!==true||row.recipientGrantVerified!==true||
     row.originalKernelEventVerified!==false||
     row.disclosureScope!=="ORIGINAL_RESULT_ONLY"||
     row.portableSelectedSummary!==true)
   fail("ATLAS_T3_ORIGINAL_SIGNED_FILE_VERIFICATION_REQUIRED");
  const ref=objectRef(row.sourceObjectRef),work=workRef(row.workRef);
  const source=signedSource(row,ref,row.operationId);
  const portable=portableSummary(row);
  if(!portable)fail("ATLAS_T3_ORIGINAL_SIGNED_FILE_CONTENT_REQUIRED");
  await verifySummaryDigest(portable);active();
  const accepted={
   work,taskId:id(row.taskId,"ATLAS_T3_ORIGINAL_TASK_REQUIRED"),
   resultId:id(row.resultId,"ATLAS_T3_ORIGINAL_RESULT_REQUIRED"),
   acceptedDigest:sha(row.acceptedDigest,"ATLAS_T3_RESULT_DIGEST_REQUIRED"),
   archiveSha256:sha(row.archiveSha256,"ATLAS_T3_ARCHIVE_DIGEST_REQUIRED")
  };
  const originalProofKeyId=id(row.proofKeyId,"ATLAS_T3_SIGNED_KEY_REQUIRED");
  const op=await hashOperation(ref,accepted);active();
  return {ref,accepted,op,portable,source,
   sourceOperationId:row.operationId,originalProofKeyId};
 }
 const identical=(a,b)=>a.op===b.op&&
  a.sourceOperationId===b.sourceOperationId&&
  a.originalProofKeyId===b.originalProofKeyId&&
  sameSignedSource(a.source,b.source)&&
  a.portable.selectedAcceptedSummary===b.portable.selectedAcceptedSummary&&
  a.portable.selectedSummarySha256===b.portable.selectedSummarySha256;
 async function inspectOriginal(archive){
  active();const original=await inspectOriginalSignedFile(archive);active();
  const state=await proven(original);
  // Native original T3 must have durably quarantined exactly these signed
  // bytes BEFORE Atlas is allowed to write a derived Result Decision.
  const cold=await proven(await readVerifiedSignedArchive(
   state.accepted.archiveSha256));
  if(!identical(state,cold))
   fail("ATLAS_T3_ORIGINAL_SIGNED_FILE_STORAGE_CHANGED");
  return state;
 }
 async function permitted(state,action){
  active();const decision=await verifyAtlasWrite({
   operationId:state.op,action,recipientId,workRef:state.accepted.work,
   sourceObjectRef:state.ref,taskId:state.accepted.taskId,
   resultId:state.accepted.resultId,
   archiveSha256:state.accepted.archiveSha256
  });active();
  const w=state.accepted.work;
  const bound=decision?.operationId===state.op&&
   decision.recipientId===recipientId&&decision.projectId===w.projectId&&
   decision.workId===w.workId&&String(decision.revision)===w.revision;
  if(decision?.allowed===false&&bound)
   deny("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
  if(decision?.allowed!==true||!bound)
   fail("ATLAS_T3_PROJECT_WRITE_NOT_AUTHORIZED");
 }
 function find(snapshot,op){
  const seen=[];
  for(const p of snapshot.projects)for(const decision of p.decisions){
   const tagged=typeof decision.text==="string"&&
    decision.text.startsWith(PREFIX);
   const row=decisionRecord(decision);
   if(tagged&&!row)fail("ATLAS_T3_MALFORMED_LINK_HOLD");
   if(row?.operationId===op){
    if(row.projectId!==p.id)fail("ATLAS_T3_RECEIPT_CROSS_PROJECT");
    seen.push({row,decisionId:decision.id});
   }
  }
  if(seen.length>1)fail("ATLAS_T3_DUPLICATE_PERSISTED_RECEIPT");
  return seen[0]??null;
 }
 async function verifyExisting(entry,saved,state=null){
  const row=entry.row;
  if(row.signedFileMode!==true)
   fail("ATLAS_T3_SIGNED_FILE_NOT_KERNEL_RECEIPT");
  // Do not reuse a grant verified BEFORE native CAS. The original
  // recipient must check its signed archive and CURRENT grant after the
  // write, including recovery from a lost IPC acknowledgement.
  const confirmed=await proven(
   await readVerifiedSignedArchive(row.archiveSha256));
  active();
  if(state!==null&&!identical(state,confirmed))
   fail("ATLAS_T3_ORIGINAL_SIGNED_FILE_STORAGE_CHANGED");
  const w=confirmed.accepted.work;
  if(row.operationId!==confirmed.op||
    row.sourceOperationId!==confirmed.sourceOperationId||
    row.originalProofKeyId!==confirmed.originalProofKeyId||
    !sameSignedSource(signedSource(row,row.sourceObjectRef,row.sourceOperationId),confirmed.source)||
    !sameRef(row.sourceObjectRef,confirmed.ref)||
    row.projectId!==w.projectId||row.workId!==w.workId||
    String(row.sourceRevision)!==w.revision||
    row.taskId!==confirmed.accepted.taskId||
    row.resultId!==confirmed.accepted.resultId||
    row.acceptedDigest!==confirmed.accepted.acceptedDigest||
    row.archiveSha256!==confirmed.accepted.archiveSha256||
    row.portableSelectedSummary!==true||
    row.selectedAcceptedSummary!==confirmed.portable.selectedAcceptedSummary||
    row.selectedSummarySha256!==confirmed.portable.selectedSummarySha256||
    row.originalKernelEventVerified!==false||
    !saved.snapshot.projects.find(p=>p.id===w.projectId)?.items.some(item=>item.id===w.workId)||
    !(saved.snapshot.revision>Number(w.revision)))
   fail("ATLAS_T3_SIGNED_FILE_PERSISTED_PROOF_CHANGED");
  await permitted(confirmed,"atlas.work.result.readback");
  return confirmed;
 }
 async function receiptFor(op,state){
  id(op,"ATLAS_T3_OPERATION_ID_INVALID");
  const saved=await load(),entry=find(saved.snapshot,op);
  if(!entry)return null;
  await verifyExisting(entry,saved);
  return {state,recipientId,operationId:op,
   reference:entry.row.sourceObjectRef,
   resultRef:"atlas:decision:"+entry.decisionId,
   originalKernelEventVerified:false};
 }
 // Accept corporate evidence for a historical issued WorkRef only through
 // the original retained U05 edition, tied to the exact current generation.
 // Older embedded/Agent routes keep their existing exact-edition behavior.
 async function reviewedWorkEdition(saved,state){
  const w=state.accepted.work,current=saved.snapshot;
  const project=current.projects.find(p=>p.id===w.projectId);
  if(!project?.items.some(item=>item.id===w.workId))
   deny("ATLAS_T3_WORK_NOT_FOUND");
  const historyEnabled=corporateResult(state.source.sourceKind)&&
   typeof readSavedRevision==="function";
  if(current.revision<Number(w.revision)||
     (!historyEnabled&&String(current.revision)!==w.revision))
   deny("ATLAS_T3_SOURCE_REVISION_CHANGED");
  if(!historyEnabled)return {};
  let issued=current;
  if(String(current.revision)!==w.revision){
   let original;
   try{
    original=await readSavedRevision({
     expectedGeneration:saved.generation,revision:Number(w.revision)
    });
   }catch(error){
    const code=String(error?.code??error?.message??error);
    if(code.includes("ATLAS_HISTORY_HEAD_CHANGED"))
     deny("ATLAS_T3_REVIEWED_PLAN_CHANGED");
    throw error;
   }
   active();
   if(original===null)deny("ATLAS_T3_SOURCE_EDITION_UNAVAILABLE");
   if(!original||typeof original.generation!=="string"||!original.generation||
      original.generation==="none"||original.generation===saved.generation||
      original.needsConfirmation!==false||original.restoredFromBackup!==false)
    fail("ATLAS_T3_SOURCE_EDITION_INVALID");
   issued=original.snapshot;validate(issued);
   if(String(issued.revision)!==w.revision)
    fail("ATLAS_T3_SOURCE_EDITION_INVALID");
  }
  const issuedProject=issued.projects.find(p=>p.id===w.projectId);
  const issuedWork=issuedProject?.items.find(item=>item.id===w.workId);
  if(!issuedWork||issuedProject.createdAt!==project.createdAt)
   deny("ATLAS_T3_SOURCE_WORK_NOT_FOUND");
  return {reviewedGeneration:saved.generation,
   currentRevision:String(current.revision),
   issuedProjectName:issuedProject.name,issuedWorkTitle:issuedWork.title};
 }
 async function inspectArchive({archive,recipientId:to}={}){
  if(to!==recipientId)deny("ATLAS_T3_RECIPIENT_MISMATCH");
  const state=await inspectOriginal(archive),saved=await load();
  const existing=find(saved.snapshot,state.op);
  let edition={};
  if(existing)await verifyExisting(existing,saved,state);
  else{
   edition=await reviewedWorkEdition(saved,state);
   await permitted(state,"atlas.work.result.preview");
  }
  // Preview MUST expose the exact original signed selected text for human
  // review; a digest alone cannot support meaningful recipient consent.
  return {status:"SIGNED_FILE_READY",recipientId,operationId:state.op,
   sourceKind:state.source.sourceKind,workRef:state.accepted.work,
   archiveSha256:state.accepted.archiveSha256,
   selectedAcceptedSummary:state.portable.selectedAcceptedSummary,
   selectedSummarySha256:state.portable.selectedSummarySha256,
   originalKernelEventVerified:false,alreadyReceived:Boolean(existing),...edition};
 }
 async function receiveArchive({archive,recipientId:to,operationId,
   confirmed=false,archiveSha256,selectedSummarySha256,reviewedGeneration=null}={}){
  active();
  if(to!==recipientId)deny("ATLAS_T3_RECIPIENT_MISMATCH");
  if(confirmed!==true)deny("ATLAS_T3_SIGNED_FILE_HUMAN_REVIEW_REQUIRED");
  const state=await inspectOriginal(archive);
  // User must confirm the SAME original signed archive and selected text
  // inspected immediately before the durable Atlas U05 generation-CAS.
  if(operationId!==state.op||
     archiveSha256!==state.accepted.archiveSha256||
     selectedSummarySha256!==state.portable.selectedSummarySha256)
   deny("ATLAS_T3_SIGNED_FILE_PREVIEW_CHANGED");
  await permitted(state,"atlas.work.result.apply");
  const before=await load(),existing=find(before.snapshot,state.op);
  if(existing){
   await verifyExisting(existing,before,state);
   return; // Exactly one original native CAS; no resend after lost ACK.
  }
  const w=state.accepted.work;
  // Consent must cover the exact head shown in the preview. A later plan
  // save requires fresh review, never automatic replay or a stale write.
  if(corporateResult(state.source.sourceKind)&&
     typeof readSavedRevision==="function"&&reviewedGeneration!==before.generation)
   deny("ATLAS_T3_REVIEWED_PLAN_CHANGED");
  await reviewedWorkEdition(before,state);
  const record={
   schema:"T3_RESULT_LINK/1",operationId:state.op,
   signedFileMode:true,originalKernelEventVerified:false,
   sourceOperationId:state.sourceOperationId,
   originalProofKeyId:state.originalProofKeyId,
   ...state.source,
   projectId:w.projectId,workId:w.workId,sourceRevision:w.revision,
   sourceObjectRef:state.ref,taskId:state.accepted.taskId,
   resultId:state.accepted.resultId,
   acceptedDigest:state.accepted.acceptedDigest,
   archiveSha256:state.accepted.archiveSha256,
   portableSelectedSummary:true,...state.portable
  };
  const next=createDecision(before.snapshot,w.projectId,
   PREFIX+JSON.stringify(record));
  let lostCommitAck=false,commitFailure;
  try{await commitSaved(before.generation,next);}
  catch(error){
   // A known original owner denial cannot be promoted to an uncertain
   // native commit. Only unknown native IPC outcomes permit READBACK.
   if(error?.outcome==="DENIED")throw error;
   lostCommitAck=true;commitFailure=error;
  }
  active();
  // Do not resend atlas_commit after an unknown ACK. The ORIGINAL U05 head
  // is the only authority capable of confirming whether it committed.
  const observed=await load(),entry=find(observed.snapshot,state.op);
  if(!entry){
   if(lostCommitAck)throw commitFailure;
   fail("ATLAS_T3_SIGNED_FILE_READBACK_UNCONFIRMED");
  }
  await verifyExisting(entry,observed,state);
 }
 return Object.freeze({recipientId,inspectArchive,receiveArchive,
  receipt:op=>receiptFor(op,"SIGNED_FILE_COMMITTED"),
  readback:op=>receiptFor(op,"SIGNED_FILE_PERSISTED")
 });
}

/** Validate the shape AND actual UTF-8 content of a native ORIGINAL
 * signed-file preview for Human Review. This is NOT a verifier of the
 * Ed25519 signature: only the installed original T3 recipient can do that.
 * Do not enable the UI without its trusted recipient port.
 */
export async function verifiedAtlasSignedFilePreview(row){
 if(row?.status!=="SIGNED_FILE_READY"||
    row.recipientId!=="iwxa.atlas"||
    !/^atlas:t3:[a-f0-9]{64}$/.test(row.operationId??"")||
    row.originalKernelEventVerified!==false||
    typeof row.alreadyReceived!=="boolean"||
    (row.sourceKind!==undefined&&
      !(row.sourceKind==="AGENT_ACCEPTED_RESULT"||corporateResult(row.sourceKind)))||
    !SHA.test(row.archiveSha256??""))
  fail("ATLAS_T3_SIGNED_PREVIEW_INVALID");
 const work=workRef(row.workRef),selected=portableSummary({
  portableSelectedSummary:true,
  selectedAcceptedSummary:row.selectedAcceptedSummary,
  selectedSummarySha256:row.selectedSummarySha256
 });
 await verifySummaryDigest(selected);
 const editionFields=["reviewedGeneration","currentRevision","issuedProjectName","issuedWorkTitle"];
 let edition={};
 if(editionFields.some(key=>Object.hasOwn(row,key))){
  if(!corporateResult(row.sourceKind)||row.alreadyReceived||
     !ID.test(row.reviewedGeneration??"")||
     typeof row.currentRevision!=="string"||
     !/^(0|[1-9][0-9]*)$/.test(row.currentRevision)||
     !Number.isSafeInteger(Number(row.currentRevision))||
     Number(row.currentRevision)<Number(work.revision)||
     typeof row.issuedProjectName!=="string"||!row.issuedProjectName.trim()||
     typeof row.issuedWorkTitle!=="string"||!row.issuedWorkTitle.trim())
   fail("ATLAS_T3_SIGNED_PREVIEW_INVALID");
  edition=Object.fromEntries(editionFields.map(key=>[key,row[key]]));
 }
 return Object.freeze({
  status:"SIGNED_FILE_READY",recipientId:"iwxa.atlas",
  operationId:row.operationId,workRef:work,
  sourceKind:row.sourceKind??"AGENT_ACCEPTED_RESULT",
  archiveSha256:row.archiveSha256,
  selectedAcceptedSummary:selected.selectedAcceptedSummary,
  selectedSummarySha256:selected.selectedSummarySha256,
  originalKernelEventVerified:false,alreadyReceived:row.alreadyReceived,...edition
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

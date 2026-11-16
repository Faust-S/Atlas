// Atlas 0.9: an opt-in UI adapter to the installed Agent's ORIGINAL
// publishAcceptedForWork/recoverPublicationForWork ports. Those methods use
// the original T3 Kernel/Exchange publisher, signed rights, Human consent
// and durable ledger. This file creates NO publisher, signer, Task or Store.
import {createAtlasSavedRef} from "../../src/project-host-port.mjs";
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const SHA=/^[a-f0-9]{64}$/;
const OP=/^agent:t3:atlas:[a-f0-9]{64}$/;
const keys=["workspace_id","object_id","schema_id","revision"];
const fail=code=>{throw Object.assign(Error(code),{code});};
const deny=code=>{throw Object.assign(Error(code),{code,outcome:"DENIED"});};
const sameRef=(a,b)=>!!a&&!!b&&keys.every(k=>a[k]===b[k]);
const sameWork=(a,b)=>a?.projectId===b?.projectId&&
 a?.workId===b?.workId&&String(a?.revision)===String(b?.revision);
const sourceRef=ref=>!!ref&&keys.slice(0,3).every(k=>
 typeof ref[k]==="string"&&ID.test(ref[k]))&&
 Number.isSafeInteger(ref.revision)&&ref.revision>0;

export function createAtlasT3OriginalPublicationPort({
 readSaved,authorizeAtlasProjectRead,currentAgentContext,
 originalAgent,originalExchange,isHostActive
}={}){
 if([readSaved,authorizeAtlasProjectRead,currentAgentContext,isHostActive]
     .some(v=>typeof v!=="function")||
    !["publishAcceptedForWork","recoverPublicationForWork","readAccepted"]
     .every(k=>typeof originalAgent?.[k]==="function")||
    typeof originalExchange?.readReceipt!=="function")
  fail("ATLAS_T3_INSTALLED_PUBLICATION_OWNER_REQUIRED");
 const inFlight=new Set();
 // Host-lifetime anti-replay guard. Original Agent and T3 ledger remain the
 // durable owners across cold opens. Once a publish was potentially dispatched,
 // the UI can ONLY recover until original ledger proves NON-DISPATCH.
 const publicationAttempts=new Set();
 const active=()=>{if(isHostActive()!==true)
  fail("ATLAS_T3_INSTALLED_HOST_DISPOSED");};
 async function selection({projectId,workId},purpose){
  active();
  const context=await currentAgentContext();active();
  if(!context||typeof context!=="object")
   fail("ATLAS_T3_AGENT_CONTEXT_UNAVAILABLE");
  const saved=await readSaved();active();
  const workRef=createAtlasSavedRef(saved.snapshot,{projectId,workId},
   {persisted:true,dirty:false});
  const right=await authorizeAtlasProjectRead({
   workRef,context,purpose
  });
  active();
  if(right===false)deny("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  if(right!==true)fail("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
  const again=await readSaved();active();
  if(again.generation!==saved.generation||
     String(again.snapshot.revision)!==workRef.revision)
   fail("ATLAS_T3_WORK_CHANGED_BEFORE_PUBLICATION");
  return Object.freeze({
   workRef,context,request:Object.freeze({
    workRef,context,recipientId:"iwxa.atlas",purpose:"atlas.result.publish"
   })
  });
 }
 async function verify(reply,workRef){
  if(!reply||reply.recipientId!=="iwxa.atlas"||
      reply.retrySafe!==false||!OP.test(reply.operationId??""))
   fail("ATLAS_T3_ORIGINAL_PUBLICATION_RECEIPT_INVALID");
  if(reply.status==="OUTCOME_UNKNOWN")
   return Object.freeze({status:"OUTCOME_UNKNOWN",
    operationId:reply.operationId,workRef});
  if(reply.status==="NOT_PUBLISHED_CONFIRMED")
   return Object.freeze({status:"NOT_PUBLISHED_CONFIRMED",
    operationId:reply.operationId,workRef});
  if(reply.status!=="OWNER_READBACK_CONFIRMED")
   fail("ATLAS_T3_ORIGINAL_PUBLICATION_STATUS_INVALID");
  const accepted=reply.accepted;
  if(accepted?.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
     accepted.readOnly!==true||!sameWork(accepted.workRef,workRef)||
     !sourceRef(accepted.sourceObjectRef)||
     typeof accepted.taskId!=="string"||!ID.test(accepted.taskId)||
     typeof accepted.resultId!=="string"||!ID.test(accepted.resultId)||
     !SHA.test(accepted.acceptedDigest??"")||
     !SHA.test(accepted.archiveSha256??""))
   fail("ATLAS_T3_ORIGINAL_PUBLICATION_SOURCE_INVALID");
  // The original Agent/Exchange owners are reread after the publication.
  // An unverified returned JS object is NOT a signed Result or receipt.
  const again=await originalAgent.readAccepted(accepted.sourceObjectRef);
  active();
  if(again?.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
     again.readOnly!==true||!sameWork(again.workRef,workRef)||
     !sameRef(again.sourceObjectRef,accepted.sourceObjectRef)||
     again.taskId!==accepted.taskId||again.resultId!==accepted.resultId||
     again.acceptedDigest!==accepted.acceptedDigest||
     again.archiveSha256!==accepted.archiveSha256)
   fail("ATLAS_T3_ORIGINAL_PUBLICATION_SOURCE_CHANGED");
  const receipt=await originalExchange.readReceipt({
   sourceObjectRef:accepted.sourceObjectRef,
   taskId:accepted.taskId,resultId:accepted.resultId,
   archiveSha256:accepted.archiveSha256,recipientId:"iwxa.atlas"
  });
  active();
  if(receipt?.status!=="VERIFIED"||
     receipt.recipientId!=="iwxa.atlas"||
     receipt.taskId!==accepted.taskId||
     receipt.resultId!==accepted.resultId||
     receipt.archiveSha256!==accepted.archiveSha256)
   fail("ATLAS_T3_ORIGINAL_PUBLICATION_EXCHANGE_UNVERIFIED");
  return Object.freeze({status:"OWNER_READBACK_CONFIRMED",
   operationId:reply.operationId,workRef});
 }
 const dispatch=async(selected,method)=>{
  const {workRef,request}=selected,key=JSON.stringify(workRef);
  if(inFlight.has(key))return Object.freeze({
   status:"OPERATION_IN_PROGRESS",workRef
  });
  const publishing=method==="publishAcceptedForWork";
  if(publishing&&publicationAttempts.has(key))
   return Object.freeze({status:"OUTCOME_UNKNOWN",workRef});
  inFlight.add(key);
  if(publishing)publicationAttempts.add(key);
  try{
   let reply;
   try{reply=await originalAgent[method](request);}
   catch(error){
    // A definite owner refusal occurred before any new dispatch. Ordinary
    // transport errors MAY mean a signed publication was already committed.
    if(error?.outcome==="DENIED"){
     if(publishing)publicationAttempts.delete(key);
     throw error;
    }
    if(publishing)return Object.freeze({status:"OUTCOME_UNKNOWN",workRef});
    throw error;
   }
   if(isHostActive()!==true)return Object.freeze({
    status:"OUTCOME_UNKNOWN",workRef
   });
   try{
    const observed=await verify(reply,workRef);
    // Only the ORIGINAL read-only recovery can prove no prior dispatch.
    // A published Result remains terminal for this WorkRef in this Host.
    if(!publishing&&observed.status==="NOT_PUBLISHED_CONFIRMED")
     publicationAttempts.delete(key);
    return observed;
   }catch(error){
    // The original publication may have committed already, but this Atlas
    // Host could have closed during independent Agent/Exchange readback.
    // No second publication is authorized by a failed observation.
    if(error?.outcome==="DENIED")throw error;
    if(isHostActive()!==true)return Object.freeze({
     status:"OUTCOME_UNKNOWN",workRef
    });
    throw error;
   }
  }finally{inFlight.delete(key);}
 };
 return Object.freeze({
  publishSelected:async selection=>dispatch(
   await selectionFor(selection,"atlas.work.result.publication"),
   "publishAcceptedForWork"),
  recoverSelected:async selection=>dispatch(
   await selectionFor(selection,"atlas.work.result.publication.recovery"),
   "recoverPublicationForWork")
 });
 function selectionFor(selected,purpose){return selection(selected,purpose);}
}

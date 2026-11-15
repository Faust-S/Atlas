// Trusted HOST composition for original Atlas + original Agent + original T3.
// This is an adapter over installed owner ports, never a network gateway,
// second Store, Task Engine, Publisher issuer, Kernel or Exchange.
import {createAtlasT3DesktopStorePort} from "./atlas-t3-store-port.mjs";
import {createAtlasSavedRef} from "../../src/project-host-port.mjs";
import {createAtlasT3NativeRecipient,createAtlasT3AgentTaskSelection}
 from "../../src/atlas-t3-native-recipient.mjs";

export function createAtlasT3OriginalHostPorts({
 invoke,authorizeCommand,
 authorizeAtlasProjectRead,issueOriginalAgentTask,readOriginalAgentTask,
 findOriginalAgentTask,currentAgentContext,continueOriginalAcceptedResult,
 readOriginalAgentAccepted,readOriginalExchangeReceipt,verifyAtlasWrite,
 isHostActive
}={}){
 // Every external owner is mandatory; no fallback to a licence check or
 // direct receipt of unverified Task/Result text from a user interface.
 const store=createAtlasT3DesktopStorePort({invoke,authorizeCommand});
 const agent=createAtlasT3AgentTaskSelection({
  readSaved:store.readSaved,authorizeProjectRead:authorizeAtlasProjectRead,
  issueOriginalAgentTask,readOriginalAgentTask,findOriginalAgentTask,isHostActive
 });
 const atlas=createAtlasT3NativeRecipient({
  readSaved:store.readSaved,commitSaved:store.commitSaved,
  readOriginalAgentAccepted,readOriginalExchangeReceipt,
  verifyAtlasWrite,isHostActive
 });
 // UI never chooses the Agent subject or grant. The trusted installed
 // owner resolves its current context for each explicit user selection.
 const issueSelectedWork=typeof currentAgentContext==="function"
  ? async({projectId,workId}={})=>{
    if(isHostActive()!==true)throw Error("ATLAS_T3_HOST_DISPOSED");
    const context=await currentAgentContext();
    if(isHostActive()!==true||!context||typeof context!=="object")
     throw Error("ATLAS_T3_AGENT_CONTEXT_UNAVAILABLE");
    return agent.issue(projectId,workId,context);
   }
  : null;
 // The optional ORIGINAL T3 D6 Host resolves the human-accepted Result,
 // verifies signed Kernel/Exchange authority and obtains Human consent.
 // Atlas only supplies the exact saved WorkRef, never a grant or Result ID.
 const continueSelectedResult=typeof currentAgentContext==="function"&&
  typeof continueOriginalAcceptedResult==="function"
  ? async({projectId,workId}={})=>{
    if(isHostActive()!==true)throw Error("ATLAS_T3_HOST_DISPOSED");
    const context=await currentAgentContext();
    if(isHostActive()!==true||!context||typeof context!=="object")
     throw Error("ATLAS_T3_AGENT_CONTEXT_UNAVAILABLE");
    const saved=await store.readSaved();
    const selected=createAtlasSavedRef(saved.snapshot,{projectId,workId},
     {persisted:true,dirty:false});
    if(await authorizeAtlasProjectRead({workRef:selected,context,
      purpose:"atlas.work.result.selection"})!==true)
     throw Error("ATLAS_T3_PROJECT_READ_NOT_AUTHORIZED");
    if(isHostActive()!==true)throw Error("ATLAS_T3_HOST_DISPOSED");
    const result=await continueOriginalAcceptedResult({workRef:selected,context});
    if(isHostActive()!==true)throw Error("ATLAS_T3_HOST_DISPOSED");
    if(["USER_CANCELLED","OUTCOME_UNKNOWN","OPERATION_IN_PROGRESS"].includes(result?.status))
     return Object.freeze({status:result.status,workRef:selected});
    if(result?.status!=="OWNER_READBACK_CONFIRMED"||
       result.recipientId!==atlas.recipientId||
       typeof result.operationId!=="string"||
       typeof result.resultRef!=="string"||!result.reference)
     throw Error("ATLAS_T3_ORIGINAL_D6_RESULT_UNVERIFIED");
    // D6 status is not a durable Atlas receipt: reopen the original native
    // Store and recheck original Agent, Exchange and current Atlas grant.
    const receipt=await atlas.receipt(result.operationId);
    const readback=await atlas.readback(result.operationId);
    const sameSource=(a,b)=>!!a&&!!b&&
     ["workspace_id","object_id","schema_id","revision"].every(k=>a[k]===b[k]);
    if(receipt?.state!=="COMMITTED"||readback?.state!=="PERSISTED"||
       receipt.operationId!==result.operationId||
       receipt.resultRef!==result.resultRef||
       readback.resultRef!==receipt.resultRef||
       !sameSource(receipt.reference,result.reference)||
       !sameSource(readback.reference,result.reference))
     throw Error("ATLAS_T3_ORIGINAL_RESULT_READBACK_UNVERIFIED");
    const accepted=await readOriginalAgentAccepted(result.reference);
    if(isHostActive()!==true)throw Error("ATLAS_T3_HOST_DISPOSED");
    if(accepted?.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
       accepted.readOnly!==true||
       accepted.workRef?.projectId!==selected.projectId||
       accepted.workRef?.workId!==selected.workId||
       String(accepted.workRef?.revision)!==selected.revision||
       !sameSource(accepted.sourceObjectRef,result.reference))
     throw Error("ATLAS_T3_SELECTED_WORK_RESULT_MISMATCH");
    return Object.freeze({status:"OWNER_READBACK_CONFIRMED",
     workRef:selected,operationId:result.operationId,resultRef:receipt.resultRef});
   }
  : null;
 return Object.freeze({issueTask:agent.issue,
  ...(issueSelectedWork?{issueSelectedWork}:{}),
  ...(continueSelectedResult?{continueSelectedResult}:{}),recipient:atlas});
}

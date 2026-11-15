// Installed Atlas 0.8 + original T3 D6 composition, for the TRUSTED native
// product host only. No alternative Store, Kernel, signer, Exchange, Task Engine,
// IPC server, local HTTP relay or UI-supplied original Result is created here.
// The installed product must own the SAME Tauri AppHandle that registered
// atlas_open/atlas_commit. An unrelated Agent Tauri process cannot impersonate it.
import {invoke as atlasNativeInvoke,isTauri} from "@tauri-apps/api/core";
import {deserialize} from "../../src/core.mjs";
import {createAtlasT3OriginalHostPorts}
 from "./atlas-t3-original-host-ports.mjs";
import {createAtlasT3DesktopStorePort} from "./atlas-t3-store-port.mjs";
import {createAtlasT3NativeRecipient}
 from "../../src/atlas-t3-native-recipient.mjs";
import {createAtlasT3OriginalSourceSelection}
 from "./atlas-t3-original-source-selection.mjs";

const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const die=code=>{throw Object.assign(new Error(code),{code});};
const fn=(owner,name)=>typeof owner?.[name]==="function"||
 die("ATLAS_T3_INSTALLED_"+name.toUpperCase()+"_OWNER_REQUIRED");
// Must be called from the installed native Host composition, NOT from a
// browser global, file import or a user-supplied owner URL. The original T3
// runtime must already have installed its signed D1 and D6 continuation.
// originalAgent and originalExchange are the CURRENT installed owners.
export async function createInstalledAtlasT3Host({
 originalT3,originalAgent,originalExchange,atlasAuthority,hostLifecycle,
 onStateChange,onSelection,onReadback,assetUrl,
}={}){
 if(!isTauri())die("ATLAS_T3_INSTALLED_ATLAS_TAURI_REQUIRED");
 for(const [owner,methods] of [
  [originalT3,["preview","continueSelected","recover"]],
  [originalAgent,["currentContext","findTask","issueTask","readTask",
   "selectAcceptedForWork","readAccepted"]],
  [originalExchange,["readReceipt"]],
  [atlasAuthority,["authorizeCommand","authorizeProjectRead",
   "verifyWrite"]],
  [hostLifecycle,["isActive"]],
 ]){
  for(const method of methods)fn(owner,method);
 }
 const active=()=>{
  if(!isTauri()||hostLifecycle.isActive()!==true)
   die("ATLAS_T3_INSTALLED_HOST_DISPOSED");
 };
 const authorizeCommand=async(command,args)=>{
  active();
  const result=await atlasAuthority.authorizeCommand(command,args);
  active();
  return result===true;
 };
 const invoke=async(command,args)=>{
  active();
  if(!["atlas_open","atlas_commit","atlas_export_json",
   "atlas_select_import","atlas_list_history","atlas_restore_history",
   "atlas_restore_previous"].includes(command))
   die("ATLAS_T3_INSTALLED_NATIVE_COMMAND_UNSUPPORTED");
  // The existing invokeAtlasHost() UI entry already authorizes exactly
  // once, as do readSaved()/commitSaved() for the original recipient.
  // Reauthorizing here would consume a one-shot owner decision twice.
  // This low-level gateway is kept only inside trusted installed Host code.
  // Lost atlas_commit IPC remains outcome-unknown, never automatically retried.
  const result=await atlasNativeInvoke(command,args);
  active();
  return result;
 };
 // A different application's Tauri window has no Atlas command; refuse
 // before offering any Agent/T3 actions. Validate the original Atlas schema.
 if(await authorizeCommand("atlas_open")!==true)
  die("ATLAS_T3_INSTALLED_NATIVE_COMMAND_DENIED");
 const head=await invoke("atlas_open");
 if(typeof head?.generation!=="string"||!head.generation||
    head.generation==="none"||head.needsConfirmation===true)
  die("ATLAS_T3_INSTALLED_NATIVE_HEAD_UNAVAILABLE");
 try{deserialize(JSON.stringify(head.snapshot));}
 catch{die("ATLAS_T3_INSTALLED_NATIVE_HEAD_INVALID");}
 const {continueOriginalAcceptedResult,recoverOriginalAcceptedResult}=
  createAtlasT3OriginalSourceSelection({
   originalT3,originalAgent,isHostActive:()=>{
    return isTauri()&&hostLifecycle.isActive()===true;
   },
  });
 const ports=createAtlasT3OriginalHostPorts({
  invoke,authorizeCommand,
  isHostActive:()=>isTauri()&&hostLifecycle.isActive()===true,
  authorizeAtlasProjectRead:input=>atlasAuthority.authorizeProjectRead(input),
  verifyAtlasWrite:input=>atlasAuthority.verifyWrite(input),
  currentAgentContext:()=>originalAgent.currentContext(),
  findOriginalAgentTask:input=>originalAgent.findTask(input),
  issueOriginalAgentTask:input=>originalAgent.issueTask(input),
  readOriginalAgentTask:(id,context)=>originalAgent.readTask(id,context),
  readOriginalAgentAccepted:ref=>originalAgent.readAccepted(ref),
  readOriginalExchangeReceipt:input=>originalExchange.readReceipt(input),
  continueOriginalAcceptedResult,recoverOriginalAcceptedResult,
 });
 const issueSelectedWork=ports.issueSelectedWork;
 const continueSelectedResult=ports.continueSelectedResult;
 const recoverSelectedResult=ports.recoverSelectedResult;
 if([issueSelectedWork,continueSelectedResult,recoverSelectedResult]
    .some(value=>typeof value!=="function"))
  die("ATLAS_T3_INSTALLED_ROUTES_UNAVAILABLE");
 const t3=Object.freeze({
  async issueSelectedWork(selection){
   const response=await issueSelectedWork(selection);
   if(!response||!ID.test(response.taskId??"")||
      response.workRef?.projectId!==selection.projectId||
      response.workRef?.workId!==selection.workId||
      !/^(0|[1-9][0-9]*)$/.test(String(response.workRef?.revision)))
    throw new Error("ATLAS_T3_INSTALLED_AGENT_TASK_READBACK_INVALID");
   return {taskId:response.taskId,
    workRef:{projectId:response.workRef.projectId,
      workId:response.workRef.workId,revision:String(response.workRef.revision)}};
  },
  async continueSelectedResult(selection){
   const result=await continueSelectedResult(selection);
   if(!result||!["OWNER_READBACK_CONFIRMED","USER_CANCELLED",
      "OUTCOME_UNKNOWN","OPERATION_IN_PROGRESS"].includes(result.status)||
      result.workRef?.projectId!==selection.projectId||
      result.workRef?.workId!==selection.workId||
      !/^(0|[1-9][0-9]*)$/.test(String(result.workRef?.revision)))
    throw new Error("ATLAS_T3_INSTALLED_D6_READBACK_INVALID");
   return {status:result.status,workRef:{
    projectId:result.workRef.projectId,workId:result.workRef.workId,
    revision:String(result.workRef.revision)},
    ...(typeof result.operationId==="string"?{operationId:result.operationId}:{}),
    ...(typeof result.resultRef==="string"?{resultRef:result.resultRef}:{})};
  },
  async recoverSelectedResult(selection){
   const result=await recoverSelectedResult(selection);
   if(!result||!["OWNER_READBACK_CONFIRMED","OUTCOME_UNKNOWN",
      "OPERATION_IN_PROGRESS"].includes(result.status)||
      result.workRef?.projectId!==selection.projectId||
      result.workRef?.workId!==selection.workId||
      !/^(0|[1-9][0-9]*)$/.test(String(result.workRef?.revision)))
    throw new Error("ATLAS_T3_INSTALLED_D6_RECOVERY_INVALID");
   return {status:result.status,workRef:{
    projectId:result.workRef.projectId,workId:result.workRef.workId,
    revision:String(result.workRef.revision)},
    ...(typeof result.operationId==="string"?{operationId:result.operationId}:{}),
    ...(typeof result.resultRef==="string"?{resultRef:result.resultRef}:{})};
  },
 });
 return Object.freeze({
  invoke,authorizeCommand,t3,
  ...(typeof onStateChange==="function"?{onStateChange}:{}),
  ...(typeof onSelection==="function"?{onSelection}:{}),
  ...(typeof onReadback==="function"?{onReadback}:{}),
  ...(typeof assetUrl==="string"?{assetUrl}:{}),
 });
}


/** FIRST stage, before the original T3 Workspace Host starts.
 * This is the real installed Atlas recipient backed by its Tauri Store.
 * Pass the result to the EXISTING T3 createWorkspaceHostRuntime as
 * nativeContinuationOwner, alongside that runtime's original signed
 * accessForRead and Human consent owner. Do not instantiate another Host.
 *
 * The ORIGINAL Agent and Exchange own acceptance and verified .iwxa receipts.
 * This function supplies none of those proofs itself and never substitutes
 * fabricated readback data if they are absent.
 */
export async function createInstalledAtlasT3NativeRecipient({
 originalAgent,originalExchange,atlasAuthority,hostLifecycle,
}={}){
 if(!isTauri())die("ATLAS_T3_INSTALLED_ATLAS_TAURI_REQUIRED");
 for(const [owner,methods] of [
  [originalAgent,["readAccepted"]],
  [originalExchange,["readReceipt"]],
  [atlasAuthority,["authorizeCommand","verifyWrite"]],
  [hostLifecycle,["isActive"]],
 ])for(const method of methods)fn(owner,method);
 const active=()=>{
  if(!isTauri()||hostLifecycle.isActive()!==true)
   die("ATLAS_T3_INSTALLED_HOST_DISPOSED");
 };
 const authorizeCommand=async(command,args)=>{
  active();const ok=await atlasAuthority.authorizeCommand(command,args);
  active();return ok===true;
 };
 const invoke=async(command,args)=>{
  active();
  if(!["atlas_open","atlas_commit"].includes(command))
   die("ATLAS_T3_INSTALLED_NATIVE_COMMAND_UNSUPPORTED");
  // The original store authorizes this exact command before invoking IPC.
  const result=await atlasNativeInvoke(command,args);
  active();
  return result;
 };
 const store=createAtlasT3DesktopStorePort({invoke,authorizeCommand});
 // Native package identity is confirmed now, not assumed because an
 // unrelated Tauri process answered some arbitrary browser callback.
 await store.readSaved();
 active();
 return createAtlasT3NativeRecipient({
  recipientId:"iwxa.atlas",
  isHostActive:()=>isTauri()&&hostLifecycle.isActive()===true,
  readSaved:store.readSaved,commitSaved:store.commitSaved,
  readOriginalAgentAccepted:ref=>originalAgent.readAccepted(ref),
  readOriginalExchangeReceipt:input=>originalExchange.readReceipt(input),
  verifyAtlasWrite:input=>atlasAuthority.verifyWrite(input),
 });
}

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

const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const SOURCE_KEYS=["workspace_id","object_id","schema_id","revision"];
const die=code=>{throw Object.assign(new Error(code),{code});};
const fn=(owner,name)=>typeof owner?.[name]==="function"||
 die("ATLAS_T3_INSTALLED_"+name.toUpperCase()+"_OWNER_REQUIRED");
function validateOriginalSource(selection,requested,strictRevision){
 if(!selection||selection.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
    selection.readOnly!==true)
  die("ATLAS_T3_INSTALLED_ACCEPTED_SOURCE_REQUIRED");
 const work=selection.workRef,ref=selection.sourceObjectRef;
 if(!work||work.projectId!==requested.projectId||
    work.workId!==requested.workId||
    !/^(0|[1-9][0-9]*)$/.test(String(work.revision))||
    !Number.isSafeInteger(Number(work.revision))||
    (strictRevision&&String(work.revision)!==String(requested.revision)))
  die("ATLAS_T3_INSTALLED_SOURCE_WORK_MISMATCH");
 if(!ref||!SOURCE_KEYS.slice(0,3).every(k=>ID.test(ref[k]))||
    !Number.isSafeInteger(ref.revision)||ref.revision<1)
  die("ATLAS_T3_INSTALLED_SOURCE_REF_INVALID");
 return Object.freeze({workspace_id:ref.workspace_id,
  object_id:ref.object_id,schema_id:ref.schema_id,revision:ref.revision});
}
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
  if(await authorizeCommand(command,args)!==true)
   die("ATLAS_T3_INSTALLED_NATIVE_COMMAND_DENIED");
  // This is the REAL installed Atlas Tauri command, not a callback or
  // simulated Store. Lost IPC after atlas_commit is outcome-unknown.
  const result=await atlasNativeInvoke(command,args);
  active();
  return result;
 };
 // A different application's Tauri window has no Atlas command; refuse
 // before offering any Agent/T3 actions. Validate the original Atlas schema.
 const head=await invoke("atlas_open");
 if(typeof head?.generation!=="string"||!head.generation||
    head.generation==="none"||head.needsConfirmation===true)
  die("ATLAS_T3_INSTALLED_NATIVE_HEAD_UNAVAILABLE");
 try{deserialize(JSON.stringify(head.snapshot));}
 catch{die("ATLAS_T3_INSTALLED_NATIVE_HEAD_INVALID");}
 const select=async(requested,context,strictRevision)=>{
  active();
  // Only the installed Agent selects a HUMAN-ACCEPTED Result. UI never
  // supplies a source Object ID or an owner grant.
  const selection=await originalAgent.selectAcceptedForWork({
   ...requested,context,purpose:strictRevision?"atlas.result.continue":
    "atlas.result.recover"});
  active();
  return validateOriginalSource(selection,requested,strictRevision);
 };
 const continueOriginalAcceptedResult=async({workRef,context})=>{
  const source=await select(workRef,context,true);
  active();
  return originalT3.continueSelected(source);
 };
 const recoverOriginalAcceptedResult=async({projectId,workId,context})=>{
  const source=await select({projectId,workId},context,false);
  active();
  return originalT3.recover(source);
 };
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
 const t3=Object.freeze({
  issueSelectedWork:ports.issueSelectedWork,
  continueSelectedResult:ports.continueSelectedResult,
  recoverSelectedResult:ports.recoverSelectedResult,
 });
 if(Object.values(t3).some(value=>typeof value!=="function"))
  die("ATLAS_T3_INSTALLED_ROUTES_UNAVAILABLE");
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
  if(await authorizeCommand(command,args)!==true)
   die("ATLAS_T3_INSTALLED_NATIVE_COMMAND_DENIED");
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

// Static product wiring guard. Source compatibility is covered separately
// by the ORIGINAL T3 D6 qualification; only the installed Tauri app can
// execute the actual native Store gateway in an installed Windows run.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createAtlasT3OriginalSourceSelection} from "../desktop/src/atlas-t3-original-source-selection.mjs";
import {createAtlasT3DesktopStorePort} from "../desktop/src/atlas-t3-store-port.mjs";
import {empty} from "../src/core.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const binding=read("desktop/src/atlas-t3-installed-host.mjs");
const surface=read("desktop/src/atlas-react-surface.tsx");
const t3=read("desktop/src/atlas-t3-original-host-ports.mjs");
const selector=read("desktop/src/atlas-t3-original-source-selection.mjs");
const native=read("desktop/src-tauri/src/lib.rs");
test("T3 native continuation owner uses actual Atlas Tauri commands, not simulated Store",()=>{
 assert.match(binding,/import \{invoke as atlasNativeInvoke,isTauri\} from "@tauri-apps\/api\/core"/);
 assert.match(binding,/await atlasNativeInvoke\(command,args\)/);
 assert.match(binding,/const store=createAtlasT3DesktopStorePort\(\{invoke,authorizeCommand\}\)/);
 assert.match(binding,/readSaved:store\.readSaved,commitSaved:store\.commitSaved/);
 assert.match(binding,/recipientId:"iwxa\.atlas"/);
 assert.match(binding,/await store\.readSaved\(\)/);
 assert.match(native,/fn atlas_open\(/);
 assert.match(native,/fn atlas_commit\(/);
 assert.doesNotMatch(binding,/localStorage|indexedDB|fetch\(|new WebSocket|spawn\(/);
});
test("Installed signed D6 owner is mandatory; there is no browser-provided authority or fallback",()=>{
 for(const name of ["originalT3","originalAgent","originalExchange",
   "atlasAuthority","hostLifecycle"])
  assert.ok(binding.includes(name),name);
 assert.match(binding,/if\(!isTauri\(\)\)die\("ATLAS_T3_INSTALLED_ATLAS_TAURI_REQUIRED"\)/);
 assert.match(binding,/createAtlasT3OriginalSourceSelection\(/);
 assert.match(selector,/selectAcceptedForWork/);
 assert.match(selector,/originalT3\.preview\(source\)/);
 assert.match(selector,/originalT3\.continueSelected\(source\)/);
 assert.match(selector,/originalT3\.recover\(source\)/);
 assert.ok(binding.includes("ATLAS_T3_INSTALLED_AGENT_TASK_READBACK_INVALID"));
 assert.ok(binding.includes("ATLAS_T3_INSTALLED_D6_READBACK_INVALID"));
 assert.ok(binding.includes("ATLAS_T3_INSTALLED_D6_RECOVERY_INVALID"));
 assert.match(selector,/originalSource\(selection,requested,strictRevision\)/);
 assert.match(binding,/originalExchange\.readReceipt\(input\)/);
 assert.match(binding,/atlasAuthority\.verifyWrite\(input\)/);
 assert.match(binding,/await invoke\("atlas_open"\)/);
 assert.match(t3,/createAtlasT3NativeRecipient/);
 assert.doesNotMatch(binding,/window\.__|globalThis\.__|postMessage\(/);
});
test("Only compiled installed Host mounts the shared Atlas UI; standalone stays autonomous",()=>{
 assert.match(surface,/export async function mountInstalledAtlasT3Surface\(/);
 assert.match(surface,/await createInstalledAtlasT3Host\(installedOwners\)/);
 assert.match(surface,/mountAtlasSurface\(target,host\)/);
 const standalone=read("desktop/src/standalone.tsx");
 assert.doesNotMatch(standalone,/mountInstalledAtlasT3Surface/);
 assert.match(standalone,/<AtlasWorkspace\/>/);
});

test("Original signed D6 source selector refuses foreign WorkRef and recipient before dispatch",async()=>{
 const workRef={projectId:"project:1",workId:"work:1",revision:"3"};
 const source={workspace_id:"ws:original",object_id:"result:1",schema_id:"iwxa.result",revision:1};
 const accepted=({workRef:sourceWork=workRef}={})=>({
  acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,workRef:sourceWork,sourceObjectRef:source,
 });
 let dispatches=0;
 const signedD6={
  preview:async()=>({status:"AVAILABLE",recipientId:"iwxa.atlas",reference:source}),
  continueSelected:async()=>{dispatches++;return {status:"OWNER_READBACK_CONFIRMED"};},
  recover:async()=>({status:"OUTCOME_UNKNOWN"}),
 };
 const wrongSource=createAtlasT3OriginalSourceSelection({
  originalT3:signedD6,isHostActive:()=>true,
  originalAgent:{selectAcceptedForWork:async()=>accepted({
   workRef:{...workRef,workId:"work:other"}})},
 });
 await assert.rejects(wrongSource.continueOriginalAcceptedResult({workRef,context:{}}),
  {code:"ATLAS_T3_INSTALLED_SOURCE_WORK_MISMATCH"});
 assert.equal(dispatches,0);
 const wrongRecipient=createAtlasT3OriginalSourceSelection({
  originalT3:{...signedD6,preview:async()=>({status:"AVAILABLE",
   recipientId:"not-atlas",reference:source})},
  isHostActive:()=>true,
  originalAgent:{selectAcceptedForWork:async()=>accepted()},
 });
 await assert.rejects(wrongRecipient.continueOriginalAcceptedResult({workRef,context:{}}),
  {code:"ATLAS_T3_INSTALLED_ORIGINAL_RECIPIENT_MISMATCH"});
 assert.equal(dispatches,0);
 const recoverOnly=createAtlasT3OriginalSourceSelection({
  originalT3:{...signedD6,preview:async()=>({status:"RECOVER_ONLY",
   recipientId:"iwxa.atlas",reference:source})},
  isHostActive:()=>true,
  originalAgent:{selectAcceptedForWork:async()=>accepted()},
 });
 assert.equal((await recoverOnly.continueOriginalAcceptedResult({workRef,context:{}})).status,
  "OUTCOME_UNKNOWN");
 assert.equal(dispatches,0);
});

test("Original T3 installer read/write consumes exactly one Atlas owner command decision",async()=>{
 const calls=[],grants=[];
 const initial=empty();
 const native=createAtlasT3DesktopStorePort({
  authorizeCommand:async command=>{grants.push(command);return true;},
  invoke:async(command,args)=>{
   calls.push(command);
   if(command==="atlas_open")return {generation:"first",snapshot:initial,
    needsConfirmation:false};
   if(command==="atlas_commit")return {generation:"next",snapshot:args.snapshot};
   throw Error("WRONG_NATIVE_COMMAND");
  },
 });
 const opened=await native.readSaved();
 assert.equal(opened.generation,"first");
 await native.commitSaved("first",opened.snapshot);
 assert.deepEqual(grants,["atlas_open","atlas_commit"]);
 assert.deepEqual(calls,["atlas_open","atlas_commit"]);
});
test("T3 signed source selection refuses detached Host after preview, without native dispatch",async()=>{
 const saved={projectId:"project:1",workId:"work:1",revision:"3"};
 const reference={workspace_id:"ws:personal",object_id:"result:one",
  schema_id:"result.schema",revision:2};
 let active=true,dispatches=0;
 const selector=createAtlasT3OriginalSourceSelection({
  isHostActive:()=>active,
  originalAgent:{selectAcceptedForWork:async()=>({
   acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
   workRef:saved,sourceObjectRef:reference})},
  originalT3:{
   preview:async()=>{active=false;return {
    recipientId:"iwxa.atlas",status:"AVAILABLE",reference};},
   continueSelected:async()=>{dispatches++;return {status:"OUTCOME_UNKNOWN"};},
   recover:async()=>({status:"OUTCOME_UNKNOWN"}),
  },
 });
 await assert.rejects(selector.continueOriginalAcceptedResult({
  workRef:saved,context:{}}),{code:"ATLAS_T3_INSTALLED_HOST_DISPOSED"});
 assert.equal(dispatches,0);
});

test("Original D6 may commit before Host shutdown: report UNKNOWN, not a safe retry",async()=>{
 const workRef={projectId:"p:9",workId:"w:9",revision:"4"};
 const reference={workspace_id:"ws:installed",object_id:"result:committed",
  schema_id:"iwxa.result",revision:1};
 let active=true,dispatches=0;
 const source=createAtlasT3OriginalSourceSelection({
  isHostActive:()=>active,
  originalAgent:{selectAcceptedForWork:async()=>({
   acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
   sourceObjectRef:reference,workRef})},
  originalT3:{
   preview:async()=>({status:"AVAILABLE",recipientId:"iwxa.atlas",reference}),
   continueSelected:async()=>{dispatches++;active=false;
    return {status:"OWNER_READBACK_CONFIRMED"};},
   recover:async()=>({status:"OUTCOME_UNKNOWN"}),
  },
 });
 await assert.rejects(source.continueOriginalAcceptedResult({workRef,context:{}}),
  {code:"ATLAS_T3_INSTALLED_D6_OUTCOME_UNKNOWN"});
 assert.equal(dispatches,1);
});

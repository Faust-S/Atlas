// Static product wiring guard. Source compatibility is covered separately
// by the ORIGINAL T3 D6 qualification; only the installed Tauri app can
// execute the actual native Store gateway in an installed Windows run.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const binding=read("desktop/src/atlas-t3-installed-host.mjs");
const surface=read("desktop/src/atlas-react-surface.tsx");
const t3=read("desktop/src/atlas-t3-original-host-ports.mjs");
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
 assert.match(binding,/selectAcceptedForWork/);
 assert.match(binding,/originalT3\.continueSelected\(source\)/);
 assert.match(binding,/originalT3\.recover\(source\)/);
 assert.match(binding,/validateOriginalSource\(selection,requested,strictRevision\)/);
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

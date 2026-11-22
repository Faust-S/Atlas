import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");

test("Atlas 0.9 ships both entrypoints in one original Tauri dist",()=>{
 const vite=read("desktop/vite.config.ts");
 const ui=read("desktop/index.html");
 const hosted=read("desktop/src/atlas-react-surface.tsx");
 const standalone=read("desktop/src/standalone.tsx");
 const tauri=JSON.parse(read("desktop/src-tauri/tauri.conf.json"));
 assert.match(vite,/manifest:true/);
 assert.match(vite,/preserveEntrySignatures:"strict"/);
 assert.match(vite,/desktop:resolve\(desktopRoot,"index\.html"\)/);
 assert.match(vite,/installedT3Host:resolve\(desktopRoot,"src\/atlas-react-surface\.tsx"\)/);
 assert.match(hosted,/export async function mountInstalledAtlasT3Surface\(/);
 assert.match(hosted,/export async function mountInstalledAtlasSignedFileSurface\(/);
 assert.match(hosted,/export \{createInstalledAtlasT3NativeRecipient,\s*createInstalledAtlasT3SignedFileRecipient\}/);
 assert.match(hosted,/export \{createOriginalAgentExchangeReceiptPort\}/);
 assert.match(hosted,/await createInstalledAtlasT3Host\(installedOwners\)/);
 assert.match(ui,/IWXA Atlas 0\.10\.0/); assert.doesNotMatch(ui,/разработка/);
 assert.doesNotMatch(ui,/0\.5\.0-dev\.1|atlas-react-surface\.tsx/);
 assert.doesNotMatch(standalone,/createInstalledAtlasT3Host|mountInstalledAtlasT3Surface|mountInstalledAtlasSignedFileSurface/);
 const fileUi=read("desktop/src/main.tsx");
 const embedded=read("desktop/src/embedded-host.ts");
 const native=read("desktop/src/atlas-t3-installed-host.mjs");
 assert.match(fileUi,/signedFileOwnerAvailable&&/);
 assert.match(fileUi,/verifiedAtlasSignedFilePreview/);
 assert.match(fileUi,/Принять подписанный Result \.iwxa/);
 assert.match(fileUi,/Подтвердить получение/);
 assert.match(fileUi,/readbackSignedFile/);
 assert.match(fileUi,/!preview\.alreadyReceived&&String\(started\.revision\)/);
 assert.match(embedded,/inspectSignedFile:/);
 assert.match(native,/originalSignedRecipient\.quarantineSignedArchive\(bytes\)/);
 assert.match(native,/export async function createInstalledAtlasSignedFileSurfacePorts\(/);
 assert.equal(tauri.build.frontendDist,"../dist");
 assert.equal(tauri.version,"0.10.0");
});

test("Atlas D6 UI never retries a native signed-file CAS after an uncertain answer",()=>{
 const ui=read("desktop/src/main.tsx");
 const preview=ui.split(" const inspectSignedResultFile=async(file:File|null)=>{")[1]?.split(" const verifyReceivedSignedResult=async(")[0];
 const apply=ui.split(" const acceptSignedResultFile=async()=>{")[1]?.split(" const recoverSignedResultFile=async()=>{")[0];
 const recover=ui.split(" const recoverSignedResultFile=async()=>{")[1]?.split(" const showOriginalT3Denial=")[0];
 assert.ok(preview&&apply&&recover,"Three actual original recipient UI routes must exist");
 assert.match(preview,/signedFileDispatchAttemptedRef\.current=false;\s*setSignedFileDispatchAttempted\(false\);\s*setSignedResultPreview\(/);
 assert.match(apply,/signedFileDispatchAttemptedRef\.current\)return;/);
 assert.match(apply,/signedFileDispatchAttemptedRef\.current=true;\s*setSignedFileDispatchAttempted\(true\);/);
 assert.ok(apply.indexOf("signedFileDispatchAttemptedRef.current=true;") <
   apply.indexOf("await apply({"),"Lock operation BEFORE the first native commit");
 assert.doesNotMatch(apply,/setSignedFileDispatchAttempted\(false\)/);
 assert.doesNotMatch(recover,/receiveSignedFile|await apply\(/,
  "Readback cannot write or retry original T3 publication");
 assert.match(ui,/disabled=\{busy\|\|dirty\|\|!!editor\|\|signedFileDispatchAttempted\}/);
 assert.match(ui,/Повторное применение заблокировано/);
});

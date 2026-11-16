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
 assert.match(hosted,/export \{createInstalledAtlasT3NativeRecipient\}/);
 assert.match(hosted,/export \{createOriginalAgentExchangeReceiptPort\}/);
 assert.match(hosted,/await createInstalledAtlasT3Host\(installedOwners\)/);
 assert.match(ui,/IWXA Atlas 0\.9\.0 \(разработка\)/);
 assert.doesNotMatch(ui,/0\.5\.0-dev\.1|atlas-react-surface\.tsx/);
 assert.doesNotMatch(standalone,/createInstalledAtlasT3Host|mountInstalledAtlasT3Surface/);
 assert.equal(tauri.build.frontendDist,"../dist");
 assert.equal(tauri.version,"0.9.0-dev.1");
});

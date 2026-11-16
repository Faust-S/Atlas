// Run AFTER npm run build. The product must ship the ORIGINAL Atlas U05
// standalone UI and the importable original T3/Agent Host in ONE dist.
import assert from "node:assert/strict";
import {readFileSync,statSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve,join,sep} from "node:path";

const root=fileURLToPath(new URL("../desktop/dist/",import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,".vite","manifest.json"),"utf8"));
const entry=manifest["src/atlas-react-surface.tsx"];
assert.ok(entry&&entry.isEntry===true,
 "ATLAS09_ORIGINAL_T3_HOST_NOT_IN_DIST_MANIFEST");
assert.equal(typeof entry.file,"string");
const file=resolve(root,entry.file);
assert.ok(file.startsWith(root.endsWith(sep)?root:root+sep));
assert.ok(statSync(file).size>0);
const code=readFileSync(file,"utf8");
assert.ok(code.includes("mountInstalledAtlasT3Surface"),
 "ATLAS09_SIGNED_T3_HOST_EXPORT_NOT_SHIPPED");
assert.ok(code.includes("createInstalledAtlasT3NativeRecipient"),
 "ATLAS09_ORIGINAL_D6_NATIVE_RECIPIENT_EXPORT_NOT_SHIPPED");
assert.ok(code.includes("mountAtlasSurface"),
 "ATLAS09_ORIGINAL_ATLAS_SURFACE_NOT_SHIPPED");
const html=readFileSync(join(root,"index.html"),"utf8");
assert.ok(html.includes("IWXA Atlas 0.9.0 (разработка)"),
 "ATLAS09_BOOTSTRAP_VERSION_MISMATCH");
assert.ok(html.includes("atlas-bootstrap"));
assert.ok(!html.includes(entry.file),
 "ATLAS09_SIGNED_HOST_MUST_NOT_AUTO_START_IN_STANDALONE");
const tauri=JSON.parse(readFileSync(
 fileURLToPath(new URL("../desktop/src-tauri/tauri.conf.json",import.meta.url)),"utf8"));
assert.equal(tauri.build.frontendDist,"../dist");
assert.equal(tauri.version,"0.9.0-dev.1");
console.log("ATLAS09_ONE_DIST_SIGNED_HOST_PASS",JSON.stringify({
 installedHost:entry.file,bytes:statSync(file).size,
 standalone:"index.html",version:tauri.version
}));

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
assert.ok(code.includes("createInstalledAtlasT3SignedFileRecipient"),
 "ATLAS09_ORIGINAL_D6_SIGNED_FILE_RECIPIENT_EXPORT_NOT_SHIPPED");
assert.ok(code.includes("createOriginalAgentExchangeReceiptPort"),
 "ATLAS09_ORIGINAL_AGENT_EXCHANGE_ADAPTER_NOT_SHIPPED");
// Vite can split the recipient, publication gate and shared React modules
// into other manifest entries. Qualify the TRANSITIVE chunks imported by the
// actual installed T3 Host, not only the single Rollup entry's text.
const owned=new Set(),imported=[];
const collect=key=>{
 if(owned.has(key))return;
 owned.add(key);
 const item=manifest[key];
 assert.ok(item&&typeof item.file==="string",
  "ATLAS09_HOST_MANIFEST_IMPORT_MISSING:"+key);
 const chunk=resolve(root,item.file);
 assert.ok(chunk.startsWith(root.endsWith(sep)?root:root+sep));
 imported.push(readFileSync(chunk,"utf8"));
 for(const dependency of [...(item.imports??[]),...(item.dynamicImports??[])])
  collect(dependency);
};
collect("src/atlas-react-surface.tsx");
const delivered=imported.join("\n");
assert.ok(delivered.includes("ORIGINAL_RESULT_ONLY")&&
 delivered.includes("ATLAS_T3_ORIGINAL_EXCHANGE_DISCLOSURE_UNVERIFIED")&&
 delivered.includes("ATLAS_T3_ORIGINAL_PUBLICATION_DISCLOSURE_UNVERIFIED"),
 "ATLAS09_ORIGINAL_RESULT_ONLY_RECEIPT_CHECK_NOT_SHIPPED");
// The original Node crypto publisher may run ONLY in the native T3 Host,
// never inside Atlas WebView or its JavaScript dependency graph.
assert.ok(!delivered.includes("createTrustedAgentAtlasSourcePublisher")&&
 !delivered.includes("node:crypto"),
 "ATLAS09_NATIVE_ORIGINAL_SIGNER_MUST_NOT_LOAD_IN_BROWSER");
assert.ok(code.includes("mountAtlasSurface"),
 "ATLAS09_ORIGINAL_ATLAS_SURFACE_NOT_SHIPPED");
const html=readFileSync(join(root,"index.html"),"utf8");
assert.ok(html.includes("<title>IWXA Atlas</title>")&&
 html.includes("<h1 style="),
 "ATLAS11_BOOTSTRAP_IDENTITY_MISMATCH");
assert.ok(html.includes("atlas-bootstrap"));
assert.ok(!html.includes(entry.file),
 "ATLAS09_SIGNED_HOST_MUST_NOT_AUTO_START_IN_STANDALONE");
const tauri=JSON.parse(readFileSync(
 fileURLToPath(new URL("../desktop/src-tauri/tauri.conf.json",import.meta.url)),"utf8"));
assert.equal(tauri.build.frontendDist,"../dist");
const pkg=JSON.parse(readFileSync(
 fileURLToPath(new URL("../desktop/package.json",import.meta.url)),"utf8"));
assert.equal(tauri.version,pkg.version,
 "ATLAS11_TAURI_PACKAGE_VERSION_MISMATCH");
assert.equal(tauri.version,"0.12.0",
 "ATLAS12_RELEASE_VERSION_MISMATCH");
console.log("ATLAS09_ONE_DIST_SIGNED_HOST_PASS",JSON.stringify({
 installedHost:entry.file,bytes:statSync(file).size,
 standalone:"index.html",version:tauri.version
}));

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("Atlas 0.9 development has one version across executable, Setup Core and all dependency locks",()=>{
 const pkg=JSON.parse(read("../desktop/package.json"));
 const lock=JSON.parse(read("../desktop/package-lock.json"));
 const tauri=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 const profile=JSON.parse(read("../desktop/installer/atlas.json"));
 const cargo=read("../desktop/src-tauri/Cargo.toml");
 const rustLock=read("../desktop/src-tauri/Cargo.lock");
 const builder=read("../desktop/installer/build-setup-core.ps1");
 for(const value of [pkg.version,lock.version,lock.packages[""].version,tauri.version,profile.version])
  assert.equal(value,"0.10.0");
 assert.match(cargo,/name = "iwxa-atlas-desktop"\nversion = "0\.10\.0"/);
 assert.match(rustLock,/name = "iwxa-atlas-desktop"\nversion = "0\.10\.0"/);
 assert.match(builder,/IWXA-Atlas-0\.10\.0-Setup\.exe/);
 assert.equal(profile.id,"iwxa.atlas");
 assert.equal(profile.data_namespace,tauri.identifier);
});
test("Atlas 0.7 publication is gated by complete installed Windows qualification and real Setup Core installer",()=>{
 const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
 const gate=workflow.indexOf("      - name: Publish accepted Atlas 0.7.0 stable release");
 const installed=workflow.indexOf("      - name: Qualify Atlas 0.7 critical-link preview and cold restart first");
 const stress=workflow.indexOf("      - name: Qualify large Atlas 0.6 map in installed Windows GUI");
 const search=workflow.indexOf("      - name: Find project by a work or source in installed Atlas 0.7");
 assert.ok(installed>0&&stress>installed&&search>stress&&gate>search);
 assert.match(workflow,/ATLAS07_RELEASE_CHECKSUM_MISMATCH/);
 assert.match(workflow,/ATLAS07_RELEASE_ALREADY_EXISTS/);
 assert.match(workflow,/gh release create v0\.7\.0/);
 assert.match(workflow,/\[publish-release-0\.7\]/);
 assert.match(workflow,/release\/0\.7/);
 assert.match(workflow,/IWXA-Atlas-0\.7\.0-Setup\.exe\.sha256/);
});

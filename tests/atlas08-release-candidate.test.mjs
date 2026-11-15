import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");

test("Atlas 0.8 candidate has stable metadata but no ungated release publication",()=>{
 const pkg=JSON.parse(read("../desktop/package.json"));
 const manifest=JSON.parse(read("../desktop/installer/atlas.json"));
 const tauri=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 assert.equal(pkg.version,"0.8.0");
 assert.equal(manifest.version,pkg.version);
 assert.equal(tauri.version,pkg.version);
 assert.equal(manifest.entrypoint,"iwxa-atlas-desktop.exe");
 const workflow=read("../.github/workflows/atlas-0-8-windows.yml");
 assert.match(workflow,/release\/0\.8/);
 assert.match(workflow,/IWXA-Atlas-0\.8\.0-Setup\.exe/);
 assert.match(workflow,/installed-atlas08-corrections\.py/);
 assert.match(workflow,/ATLAS08_RC_INSTALLER_SHA256_PASS/);
 assert.doesNotMatch(workflow,/gh release (?:create|upload|edit)/);
 assert.match(read("../desktop/tests/installed-atlas08-corrections.py"),/ATLAS08_INSTALLED_LONG_TITLE_WRAP_PASS/);
 assert.match(read("../.github/workflows/manual-check.yml"),/release\/0\.8/);
});

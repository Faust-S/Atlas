import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const version="0.12.0";

test("Atlas 0.12 stable candidate keeps one product version and the original Setup Core",()=>{
 const pkg=JSON.parse(read("desktop/package.json"));
 const lock=JSON.parse(read("desktop/package-lock.json"));
 const tauri=JSON.parse(read("desktop/src-tauri/tauri.conf.json"));
 const product=JSON.parse(read("desktop/installer/atlas.json"));
 assert.equal(pkg.version,version);
 assert.equal(lock.version,version);
 assert.equal(lock.packages[""].version,version);
 assert.equal(tauri.version,version);
 assert.equal(product.version,version);
 assert.equal(product.id,"iwxa.atlas");
 assert.equal(product.data_namespace,tauri.identifier);
 assert.equal(product.entrypoint,"iwxa-atlas-desktop.exe");
 assert.match(read("desktop/src-tauri/Cargo.toml"),/^version = "0\.12\.0"$/m);
 assert.match(read("desktop/src-tauri/Cargo.lock"),/name = "iwxa-atlas-desktop"\nversion = "0\.12\.0"/);
 const setup=read("desktop/installer/build-setup-core.ps1");
 assert.match(setup,/IWXA-Atlas-0\.12\.0-Setup\.exe/);
 assert.doesNotMatch(setup,/0\.12\.0-dev/);
 const workflow=read(".github/workflows/atlas-0-10-calendar-windows.yml");
 assert.match(workflow,/      - release\/0\.10/);
 assert.match(workflow,/github\.ref_name == 'release\/0\.10'/);
 assert.match(workflow,/IWXA-Atlas-0\.10\.0-Setup\.exe/);
 assert.match(workflow,/atlas10-setup-core-release-candidate/);
 assert.doesNotMatch(workflow,/0\.10\.0-dev/);
 const route=read("desktop/tests/installed-atlas10-calendar-scenario.py");
 assert.match(route,/expected_version="0\.10\.0"/);
 assert.match(read(".github/workflows/manual-check.yml"),/      - release\/0\.10/);
});

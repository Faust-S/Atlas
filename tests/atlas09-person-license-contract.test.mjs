import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = p => readFileSync(p,"utf8");
const bridge=read("desktop/src-tauri/src/person_license.rs");
const lib=read("desktop/src-tauri/src/lib.rs");
const cargo=read("desktop/src-tauri/Cargo.toml");
const ui=read("desktop/src/AtlasPersonLicense.tsx");
const main=read("desktop/src/main.tsx");
const setup=read("desktop/installer/build-setup-core.ps1");
const witness=read("desktop/tests/installed-atlas06-connect.py");
const pkg=JSON.parse(read("desktop/package.json"));
const config=JSON.parse(read("desktop/src-tauri/tauri.conf.json"));

test("Atlas 0.9 preserves original T3 PERSON Consumer, without a second signer or keys",()=>{
 assert.equal(pkg.version,"0.9.0-dev.1");
 assert.equal(config.version,pkg.version);
 assert.match(bridge,/iwxa-t3-product-consumer\\.exe/);
 assert.match(bridge,/person-local-authorize/);
 assert.match(bridge,/person-local-receive/);
 assert.match(bridge,/signatureVerified/);
 assert.match(bridge,/statusVerified/);
 assert.doesNotMatch(bridge,/generateKeyPair|ed25519-dalek|sign_record|private_key_pem|createSigner/);
 assert.match(cargo,/person-license-enforced = \[\]/);
 assert.match(lib,/mod person_license;/);
 assert.match(lib,/person_license::atlas_person_license_edition/);
});

test("Atlas 0.9 native WORKSPACE writes remain behind original T3 admission",()=>{
 for(const fn of ["atlas_commit","atlas_restore_history","atlas_restore_previous"]){
  const body=lib.slice(lib.indexOf("fn "+fn+"("));
  assert.ok(body.startsWith("fn "+fn+"("),fn+" not registered");
  assert.match(body.slice(0,350),/person_license::require_atlas_workspace\(&app\)\?/);
 }
 assert.match(bridge,/#\[cfg\(feature="person-license-enforced"\)\]/);
 assert.match(bridge,/PERSON_AUTHORIZE/);
 assert.match(bridge,/ATLAS_PERSON_WORKSPACE_LICENSE_REQUIRED/);
 assert.match(main,/!embedded&&<AtlasPersonLicense enabled=\{native\}\/>/);
 assert.match(main,/explainAtlasPersonNativeError\(deepFreezeError\(e\)\)/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|privateKey|createSigner/);
});

test("Only a separate original Owner's public trust and Consumer may enter Atlas 0.9 setup",()=>{
 assert.match(setup,/\[switch\]\$IncludePersonConsumer/);
 assert.match(setup,/if \(\$IncludePersonConsumer\)/);
 assert.match(setup,/PersonTrustFile/);
 assert.match(setup,/ATLAS_PERSON_PRIVATE_CONSUMER_NOT_STAGED/);
 assert.match(setup,/ATLAS_PERSON_ORIGINAL_T3_COMPONENT_STAGED_SHA256_PASS/);
 assert.match(setup,/ATLAS_PERSON_PUBLIC_TRUST_STAGED_SHA256_PASS/);
 assert.match(setup,/ATLAS_PERSON_TRUST_REQUIRES_ORIGINAL_CONSUMER/);
 assert.match(setup,/\[IO.Path\]::GetTempPath\(\)/);
 assert.ok(!config.bundle.resources || !config.bundle.resources["t3/iwxa-t3-product-consumer.exe"]);
});

test("Real Windows negative witness rejects Save and cold recovery without private Consumer",()=>{
 assert.match(witness,/ATLAS_PERSON_EXPECT_UNBUNDLED_DENIAL/);
 assert.match(witness,/ATLAS09_PERSON_WORKSPACE_NATIVE_DENIAL_PASS/);
 assert.match(witness,/ATLAS09_PERSON_DURABLE_STORE_UNCHANGED_AND_COLD_RESTART_PASS/);
 assert.match(witness,/native_store_snapshot\(\)==previous/);
 assert.match(witness,/click_button\("Закрыть без сохранения"/);
 assert.doesNotMatch(witness,/fake T3|mock signature|test-only IPC/);
});

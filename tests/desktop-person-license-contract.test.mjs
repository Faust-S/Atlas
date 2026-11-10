import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const bridge=read('desktop/src-tauri/src/person_license.rs');
const native=read('desktop/src-tauri/src/lib.rs');
const ui=read('desktop/src/AtlasPersonLicense.tsx');
const main=read('desktop/src/main.tsx');
const config=JSON.parse(read('desktop/src-tauri/tauri.conf.json'));

test('Atlas keeps original T3 consumer as the only signed PERSON verifier',()=>{
 assert.match(bridge,/iwxa-t3-product-consumer\.exe/);
 assert.match(bridge,/person-local-receive/);
 assert.match(bridge,/PERSON_RECEIVE/);
 assert.match(bridge,/signatureVerified/);
 assert.match(bridge,/statusVerified/);
 assert.match(bridge,/productionActivation/);
 assert.doesNotMatch(bridge,/generateKeyPair|ed25519-dalek|verify_signature|PRIVATE KEY/);
 assert.ok(!config.bundle.resources?.['t3/iwxa-t3-product-consumer.exe'],
   'public Atlas must never ship synthetic private credential components');
});
test('native license intake cannot alter project store or receive injected paths',()=>{
 assert.match(native,/person_license::atlas_person_license_import/);
 assert.match(native,/person_license::atlas_person_license_enroll/);
 assert.match(bridge,/blocking_pick_file/);
 assert.match(bridge,/symlink_metadata/);
 assert.match(bridge,/person-local-read/);
 assert.match(bridge,/person-local-enroll/);
 assert.doesNotMatch(bridge,/commit_root\(|atlas_commit\(|head\.json|atlas-store-v1/);
 assert.match(native,/fn atlas_open\(/);
 assert.match(native,/fn atlas_commit\(/);
});
test('PERSON consent and public trust remain distinct from archive import',()=>{
 assert.match(ui,/Моя лицензия/);
 assert.match(ui,/Привязать к этому компьютеру/);
 assert.match(ui,/atlas_person_license_enroll/);
 assert.match(ui,/atlas_person_license_import/);
 assert.match(ui,/Подпись и статус проверены T3/);
 assert.match(ui,/не включает[\s\S]*?дополнительные функции автоматически/);
 assert.match(main,/!embedded&&<AtlasPersonLicense enabled=\{native\}/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|privateKey|createSigner/);
});
test('public Atlas stores no new T3 keys or pinned production issuer trust',()=>{
 assert.equal(config.identifier,'ru.iwxa.atlas');
 assert.equal(config.bundle.active,false);
 assert.doesNotMatch(bridge,/issuerPrivateKey|private_key|keyObjectSigner|trustedIssuerPem/);
 assert.match(bridge,/app_local_data_dir/);
 assert.match(bridge,/t3-consumer-person/);
 assert.match(bridge,/ATLAS_PERSON_T3_COMPONENT_NOT_BUNDLED/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(p,'utf8');
const bridge=read('desktop/src-tauri/src/person_license.rs');
const native=read('desktop/src-tauri/src/lib.rs');
const ui=read('desktop/src/AtlasPersonLicense.tsx');
const main=read('desktop/src/main.tsx');
const config=JSON.parse(read('desktop/src-tauri/tauri.conf.json'));
const setup=read('desktop/installer/build-setup-core.ps1');

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
 assert.match(ui,/Право WORKSPACE/);
 assert.match(ui,/не подтверждено; лицензируемая сборка не разрешит изменения портфеля/);
 assert.match(ui,/atlas_person_license_workspace_access/);
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

test('Setup Core includes original private T3 only by explicit verified local option',()=>{
 assert.match(setup,/\[switch\]\$IncludePersonConsumer/);
 assert.match(setup,/if \(\$IncludePersonConsumer\)/);
 assert.match(setup,/Get-FileHash -LiteralPath \$consumer -Algorithm SHA256/);
 assert.match(setup,/Get-FileHash -LiteralPath \$copy -Algorithm SHA256/);
 assert.match(setup,/ATLAS_PERSON_PRIVATE_CONSUMER_NOT_STAGED/);
 assert.match(setup,/ATLAS_PERSON_ORIGINAL_T3_COMPONENT_STAGED_SHA256_PASS/);
 assert.match(setup,/ATLAS_PERSON_PUBLIC_TRUST_STAGED_SHA256_PASS/);
 assert.match(setup,/PersonTrustFile/);
 assert.match(bridge,/install_original_owner_public_trust\(&app\)/);
 assert.match(bridge,/ATLAS_PERSON_PREINSTALLED_TRUST_MISSING/);
 assert.match(bridge,/ATLAS_PERSON_SETUP_TRUST_CHANGED_REQUIRES_REVIEW/);
 assert.match(bridge,/super::setup_core_data_root\(\)/);
 assert.doesNotMatch(config.identifier,/publisher|admin-center/);
});


test('licensed Atlas native writes require original live T3 feature admission when explicitly compiled',()=>{
 const cargo=read('desktop/src-tauri/Cargo.toml');
 assert.match(cargo,/person-license-enforced = \[\]/);
 assert.match(bridge,/person-local-authorize/);
 assert.match(bridge,/PERSON_AUTHORIZE/);
 assert.match(bridge,/fn verified_workspace_admission\(/);
 assert.match(bridge,/signatureVerified/);
 assert.match(bridge,/statusVerified/);
 assert.match(bridge,/#\[cfg\(feature="person-license-enforced"\)\]/);
 assert.match(bridge,/ATLAS_PERSON_WORKSPACE_LICENSE_REQUIRED/);
 assert.match(native,/fn atlas_commit\([\s\S]*?person_license::require_atlas_workspace\(&app\)/);
 assert.match(native,/fn atlas_restore_history\([\s\S]*?person_license::require_atlas_workspace\(&app\)/);
 assert.match(native,/fn atlas_restore_previous\([\s\S]*?person_license::require_atlas_workspace\(&app\)/);
 assert.match(native,/person_license::atlas_person_license_workspace_access/);
 assert.doesNotMatch(bridge,/verify\(|ed25519_dalek|create_keypair/);
});

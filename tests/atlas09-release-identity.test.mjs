import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Atlas 0.9 is a separate development build with one original data namespace",()=>{
 const pkg=JSON.parse(read("desktop/package.json"));
 const lock=JSON.parse(read("desktop/package-lock.json"));
 const tauri=JSON.parse(read("desktop/src-tauri/tauri.conf.json"));
 const profile=JSON.parse(read("desktop/installer/atlas.json"));
 const cargo=read("desktop/src-tauri/Cargo.toml");
 const rustLock=read("desktop/src-tauri/Cargo.lock");
 const setup=read("desktop/installer/build-setup-core.ps1");
 for(const version of [pkg.version,lock.version,lock.packages[""].version,
  tauri.version,profile.version])assert.equal(version,"0.9.0-dev.1");
 assert.match(cargo,/name = "iwxa-atlas-desktop"\nversion = "0\.9\.0-dev\.1"/);
 assert.match(rustLock,/name = "iwxa-atlas-desktop"\nversion = "0\.9\.0-dev\.1"/);
 assert.match(setup,/IWXA-Atlas-0\.9\.0-dev\.1-Setup\.exe/);
 assert.equal(tauri.identifier,"ru.iwxa.atlas");
 assert.equal(profile.data_namespace,tauri.identifier);
 assert.equal(profile.id,"iwxa.atlas");
 assert.equal(tauri.bundle.active,false);
 const ui=read("desktop/src/main.tsx");
 assert.match(ui,/atlasPackage\.version\.split\("-"\)\[0\]/);
 assert.match(ui,/разработка/);
});
test("Atlas 0.9 has its own installed Windows gate and cannot publish a release",()=>{
 const ci=read(".github/workflows/atlas-0-9-windows.yml");
 assert.match(ci,/work\/2026-11-16-atlas-0-9-t3/);
 assert.match(ci,/IWXA-Atlas-0\.9\.0-dev\.1-Setup\.exe/);
 assert.match(ci,/installed-atlas08-corrections\.py/);
 assert.match(ci,/python desktop\/tests\/installed-atlas09-qualification\.py/);
 const windows=read("desktop/tests/installed-atlas09-qualification.py");
 assert.match(windows,/route\.qualify\(\)/);
 assert.match(windows,/0\.9\.0 \(разработка\)/);
 assert.match(windows,/ATLAS09_INSTALLED_PRODUCT_VERSION_PASS/);
 assert.match(windows,/ATLAS09_STANDALONE_NO_FAKE_T3_OWNER_PASS/);
 assert.match(windows,/ATLAS09_TWO_COLD_INSTALLED_STORE_READBACK_PASS/);
 assert.match(windows,/for cold_open in \(1,2\):/);
 assert.match(ci,/ATLAS09_RC_INSTALLER_SHA256_PASS/);
 assert.match(ci,/atlas09-setup-core-development/);
 assert.doesNotMatch(ci,/gh release (?:create|edit|upload)/);
 assert.doesNotMatch(ci,/ref_name == 'release\/0\.8'/);
 const legacy=read(".github/workflows/atlas-0-8-windows.yml");
 assert.match(legacy,/release\/0\.8/);
 assert.match(legacy,/IWXA-Atlas-0\.8\.0-Setup\.exe/);
 assert.match(read(".github/workflows/manual-check.yml"),/work\/2026-11-16-atlas-0-9-t3/);
});
test("Atlas 0.9 signed D6 native gateway performs one owner gate per operation",()=>{
 const b=read("desktop/src/atlas-t3-installed-host.mjs");
 const matches=[...b.matchAll(/const invoke=async\(command,args\)=>\{([\s\S]*?)\n \};/g)];
 assert.equal(matches.length,2,"Two installed native entry points");
 for(const match of matches){
  assert.doesNotMatch(match[1],/await authorizeCommand\(/,
   "The original Store or authorized Atlas UI already checks the right once");
  assert.match(match[1],/atlasNativeInvoke\(command,args\)/);
 }
 assert.match(b,/const openingRight=await authorizeCommand\("atlas_open"\)/);
 assert.match(b,/if\(openingRight===false\)deny\("ATLAS_T3_INSTALLED_NATIVE_COMMAND_DENIED"\)/);
 assert.match(b,/if\(openingRight!==true\)die\("ATLAS_T3_INSTALLED_NATIVE_COMMAND_DENIED"\)/);
 const host=read("desktop/src/embedded-host.ts");
 assert.match(host,/await host\.authorizeCommand\(selected,args\)/);
 const store=read("desktop/src/atlas-t3-store-port.mjs");
 assert.match(store,/const permission=await authorizeCommand\("atlas_open"\)/);
 assert.match(store,/const permission=await authorizeCommand\("atlas_commit",args\)/);
 assert.match(store,/if\(permission===false\)deny\("ATLAS_T3_U05_WRITE_DENIED"\)/);
 assert.match(store,/if\(permission!==true\)fail\("ATLAS_T3_U05_WRITE_DENIED"\)/);
});

test("Atlas 0.9 installed signed publication is opt-in, standalone has no fake owner, and command denials remain distinct",()=>{
 const ui=read("desktop/src/main.tsx");
 const standalone=read("desktop/src/standalone.tsx");
 const embedded=read("desktop/src/embedded-host.ts");
 const installed=read("desktop/src/atlas-t3-installed-host.mjs");
 const witness=read("desktop/tests/installed-atlas09-qualification.py");
 assert.match(ui,/runAgentResultPublication/);
 assert.match(ui,/Опубликовать Result/);
 assert.match(ui,/Проверить публикацию/);
 assert.match(ui,/Получить Result/);
 assert.doesNotMatch(standalone,/publishSelectedResult|recoverSelectedPublication/);
 assert.match(installed,/publishAcceptedForWork","recoverPublicationForWork/);
 assert.match(embedded,/const permission=await host\.authorizeCommand\(selected,args\)/);
 assert.match(embedded,/if\(permission===false\)/);
 assert.match(embedded,/outcome:"DENIED"/);
 assert.match(embedded,/if\(permission!==true\)/);
 assert.match(witness,/ATLAS09_TWO_COLD_INSTALLED_STORE_READBACK_PASS/);
 assert.match(witness,/Проверить публикацию/);
 assert.match(witness,/Опубликовать Result/);
});

test("Original Agent publication failed readback is never a second signed dispatch",()=>{
 const publication=read("desktop/src/atlas-t3-original-publication.mjs");
 const ui=read("desktop/src/main.tsx");
 assert.match(publication,/if\(error\?\.outcome==="DENIED"\)throw error/);
 assert.match(publication,/if\(isHostActive\(\)!==true\)return Object\.freeze\(\{/);
 assert.match(publication,/status:"OUTCOME_UNKNOWN",workRef/);
 assert.match(ui,/Публикация Agent Result не подтверждена/);
 assert.match(ui,/Не отправляйте повторно/);
 assert.equal(ui.split("runAgentResultPublication(project.id,w.id,").length-1,2);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("native Setup Core witness verifies selected data, GUI readback and preserved uninstall",()=>{
 const script=read("../desktop/installer/qualify-setup-core-lifecycle.ps1");
 const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
 assert.match(script,/--migrate-locations-file/);
 assert.match(script,/STORAGE_COPIED_AND_SWITCHED_ORIGINAL_PRESERVED/);
 assert.match(script,/ATLAS_SETUP_MIGRATED_DATA_ROOT/);
 assert.match(script,/ATLAS_SETUP_SELECTED_DATA_NOT_ACTUALLY_USED/);
 assert.match(script,/--verify-installed-file/);
 assert.match(script,/--uninstall-file/);
 assert.match(script,/UNINSTALLED_USER_DATA_PRESERVED/);
 assert.match(script,/ATLAS05_SETUP_CORE_CUSTOM_DATA_AND_UNINSTALL_PASS/);
 assert.match(workflow,/qualify-setup-core-lifecycle\.ps1/);
});

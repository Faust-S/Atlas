import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
const installed=read("../desktop/tests/installed-atlas06-connect.py");
const ui=read("../desktop/src/ProjectConnect.tsx");
test("Atlas 0.6 installed Windows gate uses original pinned Setup Core and the dev build",()=>{
 assert.match(workflow,/work\/2026-11-10-atlas-0-6/);
 assert.match(workflow,/npm run desktop:build -- --no-bundle/);
 assert.match(workflow,/Checkout original pinned IWXA Setup Core/);
 assert.match(workflow,/ref: 0ef7544e2a6fd5fab5994f7f25abbb960063908c/);
 assert.match(workflow,/desktop\/installer\/build-setup-core\.ps1 -InstallForQualification/);
 assert.match(workflow,/installed-atlas06-connect\.py/);
 assert.match(workflow,/IWXA-Atlas-0\.6\.0-dev\.1-Setup\.exe/);
 assert.doesNotMatch(workflow,/gh release create v0\.6\.0/);
});
test("Native GUI test requires a read-only public discovery and explicit native Save",()=>{
 assert.match(installed,/click_button\("Подключить проект"\)/);
 assert.match(installed,/set_text\("Адрес подключаемого проекта GitHub"/);
 assert.match(installed,/click_button\("Посмотреть структуру"\)/);
 assert.match(installed,/set_text\("Ветка исходников для подключения",BRANCH\)/);
 assert.match(installed,/click_button\("Изучить выбранную ветку"\)/);
 assert.match(installed,/wait_text\("Корневая структура"/);
 assert.match(installed,/not \(STORE\/"head\.json"\)\.exists\(\)/);
 assert.match(installed,/click_button\("Добавить в Atlas"\)/);
 assert.match(installed,/click_button\("Сохранить"\)/);
 assert.match(installed,/observation\["structure"\]\["commitSha"\]==observation\["branchHeads"\]\[BRANCH\]/);
 assert.match(installed,/assert second==first/);
 assert.match(installed,/ATLAS06_CONNECT_BRANCH_TREE_RESTART_PASS/);
 assert.doesNotMatch(installed,/CDP|test-only app API|fake fetch responses/);
});
test("The user can switch development branches without silently accepting stale preview",()=>{
 assert.match(ui,/aria-label="Ветка исходников для подключения"/);
 assert.match(ui,/onClick=\{\(\)=>void inspect\(null,branchChoice\)\}/);
 assert.match(ui,/Изучите выбранную ветку перед подключением/);
 assert.match(ui,/branchChoice\.trim\(\)!==\(preview\.branch\|\|""\)/);
});

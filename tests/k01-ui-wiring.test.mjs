import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../desktop/package.json',import.meta.url),'utf8'));
const lock=JSON.parse(readFileSync(new URL('../desktop/package-lock.json',import.meta.url),'utf8'));
test('K01 user workflow is visible on Atlas Sources tab, not detached from native project',()=>{
 assert.match(ui,/tab==="sources"/);
 assert.match(ui,/K01: найти контекст/);
 assert.match(ui,/K01 искомая фраза/);
 assert.match(ui,/K01 файл GitHub/);
 assert.match(ui,/K01 ветка/);
 assert.match(ui,/readSavedSnapshotForReference\(/);
 assert.match(ui,/createAtlasK01DesktopService/);
 assert.match(ui,/recheckK01/);
 assert.match(ui,/k01Context\.projection\.selected\[0\]\?\.sha256/);
 assert.match(ui,/setK01Context\(null\)/);
});
test('K01 is a pinned Git dependency, not a copied library or mutable branch',()=>{
 const pin='git+https://github.com/Faust-S/knowledge.git#217debaad8a17b19b7ef883eca07dccc045ec9a8';
 assert.equal(manifest.dependencies['@iwxa/k01-context'],pin);
 assert.equal(lock.packages[''].dependencies['@iwxa/k01-context'],pin);
 assert.ok(lock.packages['node_modules/@iwxa/k01-context']);
});

test("K01 invalidation clears outdated evidence from UI",()=>{
 assert.match(ui,/if\(!result\.allCurrent\)setK01Context\(null\)/);
 assert.ok(ui.includes('setK01Context(null);setK01Status("Контекст не подтверждён:'));
 for(const name of ["setK01FilePath","setK01Phrase","setK01Branch"]) {
  assert.ok(ui.includes(name+"(event.target.value);setK01Context(null);"));
 }
 assert.ok(ui.includes('setK01Context(null);setK01Status("");setActive(id);'));
});

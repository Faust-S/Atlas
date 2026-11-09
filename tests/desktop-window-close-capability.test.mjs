import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const capability=JSON.parse(readFileSync(new URL("../desktop/src-tauri/capabilities/main.json",import.meta.url),"utf8"));
const app=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
const windowsTest=readFileSync(new URL("../desktop/tests/installed-windows-keyboard.ps1",import.meta.url),"utf8");

test("Tauri close-requested path can destroy only the authorized main window",()=>{
 assert.equal(capability.identifier,"main");
 assert.deepEqual(capability.windows,["main"]);
 assert.deepEqual(capability.permissions.slice(0,3),[
  "core:window:default","core:window:allow-close","core:window:allow-destroy"
 ]);
 assert.ok(capability.permissions.includes("core:event:default"));
 assert.equal(capability.permissions.length,5);
 assert.ok(capability.permissions.includes("core:window:allow-set-title"));
 assert.equal(new Set(capability.permissions).size,capability.permissions.length);
 assert.ok(!capability.permissions.some(p=>/^(fs|shell|http|process|opener):/.test(p)));
});
test("React guards dirty drafts and forms, explicit close still uses granted Tauri command",()=>{
 assert.match(app,/if\(dirtyRef\.current\|\|busyRef\.current\|\|editorDirtyRef\.current\)/);
 assert.match(app,/event\.preventDefault\(\)/);
 assert.match(app,/setCloseGuard\(true\)/);
 assert.match(app,/aria-modal="true"/);
 assert.match(app,/allowCloseRef\.current=true/);
 assert.match(app,/await getCurrentWindow\(\)\.close\(\)/);
});
test("installed Windows workflow rejects false PASS when close needed a forced kill",()=>{
 assert.match(windowsTest,/\$forcedCloseAttempts \+= \$attempt/);
 assert.match(windowsTest,/if \(\$forcedCloseAttempts\.Count -gt 0\)/);
 assert.match(windowsTest,/throw "Persisted across forced restart but GUI normal close failed/);
 assert.match(windowsTest,/ATLAS_INSTALLED_GUI_GRACEFUL_LIFECYCLE_PASS/);
});

test("native-window keyboard qualification waits for rendered form and applied draft",()=>{
 assert.match(app,/Форма: /);
 assert.match(app,/const startedWith=latestSnapshot\.current/);
 assert.match(windowsTest,/Wait-AtlasTitle \$process 'Портфель — Обзор'/);
 assert.match(windowsTest,/Wait-AtlasTitle \$process 'Форма: Новый проект'/);
 assert.match(windowsTest,/Wait-AtlasTitle \$process \(\$name \+ ' — Обзор · Не сохранено'\)/);
 assert.match(windowsTest,/Wait-AtlasTitle \$process 'Форма: Добавить зависимость'/);
 assert.doesNotMatch(windowsTest,/SendWait\('\{TAB\}\{DOWN\}'\)/);
 assert.match(windowsTest,/Capture-AtlasView 'installed-save-no-expected-projects'/);
});
test("installed startup probe never discards a valid early Rust receipt",()=>{
 const script=windowsTest.slice(windowsTest.indexOf("function Wait-AtlasOpen"),windowsTest.indexOf("function Activate-Atlas"));
 assert.ok(script.startsWith("function Wait-AtlasOpen"));
 assert.doesNotMatch(script,/Remove-Item/);
 assert.match(script,/\$launchTimeUtc = \$process\.StartTime\.ToUniversalTime\(\)/);
 assert.match(script,/\$file\.LastWriteTimeUtc -ge \$launchTimeUtc\.AddSeconds\(-2\)/);
 assert.match(script,/ATLAS_INSTALLED_GUI_NATIVE_OPEN_PASS/);
});
test("Windows qualification uses only installed NSIS GUI, not redundant standalone launches",()=>{
 const pipeline=readFileSync(new URL("../.github/workflows/atlas-desktop-0-2.yml",import.meta.url),"utf8");
 assert.doesNotMatch(pipeline,/name: Launch standalone desktop window without development server/);
 assert.match(pipeline,/name: Install this exact Windows build using NSIS/);
 assert.match(pipeline,/name: Exercise installed React forms save close and reopen/);
});

test("installed Windows project creation uses the visible GUI action, not an intercepted browser accelerator",()=>{
 assert.match(windowsTest,/function Click-AtlasCreateProject\(/);
 assert.match(windowsTest,/GetWindowRect\(\$handle,\[ref\]\$rect\)/);
 assert.match(windowsTest,/GetDpiForWindow\(\$handle\)/);
 assert.match(windowsTest,/mouse_event\(0x0002/);
 assert.match(windowsTest,/Click-AtlasCreateProject \$process\s*Wait-AtlasTitle \$process 'Форма: Новый проект'/);
 assert.doesNotMatch(windowsTest,/SendWait\('\^n'\)/);
});

test("Windows installed GUI saves using the visible control rather than unverified Ctrl+S",()=>{
 assert.match(windowsTest,/function Click-AtlasSave\(/);
 assert.match(windowsTest,/\$x = \$rect\.Right - \[int\]\[Math\]::Round\(282 \* \$scale\)/);
 assert.match(windowsTest,/Click-AtlasSave \$process/);
 assert.doesNotMatch(windowsTest,/SendWait\('\^s'\)/);
 assert.match(windowsTest,/Wait-AtlasState \$attempt/);
});

test("installed qualification navigates real tabs and creates work/dependencies through visible controls",()=>{
 assert.match(windowsTest,/function Click-AtlasAt\(/);
 assert.match(windowsTest,/function Click-AtlasTab\(/);
 assert.match(windowsTest,/function Click-AtlasWorkAction\(/);
 assert.match(windowsTest,/Click-AtlasTab \$process 'work'/);
 assert.match(windowsTest,/Click-AtlasTab \$process 'timeline'/);
 assert.match(windowsTest,/Click-AtlasTab \$process 'graph'/);
 assert.match(windowsTest,/Click-AtlasWorkAction \$process 'work'/);
 assert.match(windowsTest,/Click-AtlasWorkAction \$process 'dependency'/);
 assert.match(windowsTest,/Capture-AtlasView 'installed-work-table'/);
 assert.doesNotMatch(windowsTest,/SendWait\('\^1'\)|SendWait\('\^2'\)|SendWait\('\^3'\)/);
});

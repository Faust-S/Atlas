import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const rust=readFileSync(new URL("../desktop/src-tauri/src/lib.rs",import.meta.url),"utf8");
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");

test("history recovery reuses one native store and checks the live generation",()=>{
 assert.match(rust,/fn atlas_list_history\(app: AppHandle, expected_generation: String\)/);
 assert.match(rust,/fn atlas_restore_history\(/);
 assert.match(rust,/if current\.generation != expected_generation/);
 assert.match(rust,/let receipt = commit_root\(root, expected_generation, selected\.clone\(\)\)\?/);
 assert.match(rust,/let highest = current_revision\.max\(saved_revision\)/);
 assert.match(rust,/if checked\.needs_confirmation \|\| checked\.generation != receipt\.generation/);
 assert.match(rust,/atlas_list_history,atlas_restore_history/);
 assert.match(rust,/item\.generation == current\.generation \|\| decode\(root, &item\)\.is_err\(\)/);
 assert.match(rust,/fn healthy_history_rollback_preserves_both_editions_and_rejects_stale_generation/);
 assert.match(rust,/fn damaged_archive_cannot_replace_healthy_portfolio/);
});
test("user sees explicit native revision selection and must confirm replacement",()=>{
 assert.match(ui,/invoke<HistoryEntry\[\]>\("atlas_list_history",\{expectedGeneration:generation\}\)/);
 assert.match(ui,/invoke<OpenResult>\("atlas_restore_history"/);
 assert.match(ui,/expectedGeneration:generation,historyGeneration:item\.generation/);
 assert.match(ui,/Текущая редакция \{data\.revision\}/);
 assert.match(ui,/\{data\.projects\.length\} проектов\) останется в истории/);
 assert.match(ui,/latestSnapshot\.current=checked/);
 assert.match(ui,/saved\.current=snapshotText\(checked\)/);
 assert.match(ui,/setSavedVersions\(null\)/);
 assert.match(ui,/setData\(checked\);setGeneration\(result\.generation\);setSavedVersions\(null\);\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*selectProject\(null,true\)/);
 assert.match(ui,/if\(savedVersionsOpenRef\.current\)\{[\s\S]*?event\.preventDefault\(\);/);
 assert.match(ui,/savedVersionsOpenRef\.current=savedVersions!==null/);
 assert.match(ui,/disabled=\{busy\|\|dirty\|\|!!editor\|\|!persisted\|\|savedVersions!==null\}>Версии на диске/);
 assert.match(ui,/aria-labelledby="atlas-versions-title"/);
 assert.match(ui,/if\(savedVersions!==null\)/);
 assert.match(ui,/setSavedVersions\(null\);return/);
 assert.match(ui,/if\(savedVersions===null\|\|!savedVersions\.some\(row=>row\.generation===item\.generation\)/);
});

test("history restoration uses an explicit nonblocking in-dialog selection",()=>{
 const source=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const driver=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.match(source,/selectedHistory\?\.generation!==item\.generation/);
 assert.match(source,/Восстановить выбранную редакцию/);
 assert.match(source,/Выбрать редакцию/);
 assert.match(source,/className="atlas-close-dialog atlas-history-dialog"/);
 assert.match(source,/Текущая редакция \{data\.revision\}/);
 assert.doesNotMatch(source,/const approved=confirmAction\("Восстановить архивную редакцию/);
 assert.match(css,/\.atlas-history-body\{[^}]*overflow-y:auto/);
 assert.match(css,/\.atlas-history-actions\{[^}]*flex:0 0 auto/);
 assert.match(driver,/ATLAS_INSTALLED_GUI_BACKUP_EXPORT_PASS/);
 assert.match(driver,/ATLAS_INSTALLED_GUI_HISTORY_RESTORE_READBACK_PASS/);
 assert.match(driver,/ATLAS_INSTALLED_GUI_HISTORY_RESTART_PASS/);
});

test("history remains navigable for many archived versions, backup shows exact destination",()=>{
 const source=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const rustSource=readFileSync(new URL("../desktop/src-tauri/src/lib.rs",import.meta.url),"utf8");
 const driver=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.match(source,/savedVersions\.slice\(0,nativeHistoryLimit\)\.map/);
 assert.match(source,/Показать ещё редакции/);
 assert.match(source,/setNativeHistoryLimit\(40\)/);
 assert.match(rustSource,/Резервная копия Atlas сохранена: \{\}/);
 assert.match(rustSource,/selected\.display\(\)/);
 assert.match(driver,/keyboard\.send_keys\("\^a"\)/);
 assert.match(driver,/ATLAS_BACKUP_PATH_READBACK/);
 assert.match(driver,/ATLAS_BACKUP_VISIBLE_WINDOWS/);
});

test("installed backup chooses a path without short-name SendKeys Enter alias",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.match(script,/exported=Path\(os\.environ\["RUNNER_TEMP"\]\)/);
 assert.match(script,/Unsafe SendKeys path/);
 assert.doesNotMatch(script,/exported=Path\(tempfile\.gettempdir\(\)\)/);
});

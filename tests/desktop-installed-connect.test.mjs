import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
const installed=read("../desktop/tests/installed-atlas06-connect.py");
const ui=read("../desktop/src/ProjectConnect.tsx");
const desktop=read("../desktop/src/main.tsx");
const style=read("../desktop/src/style.css");
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
 assert.match(installed,/click_scrolled_button\("Добавить в Atlas"\)/);
 assert.match(installed,/button_rect\.bottom <= bounds\[3\]-38/);
 assert.match(installed,/window_title_contains\("Atlas — Обзор",35\)/);
 assert.match(installed,/mouse\.scroll\(/);
 assert.match(installed,/click_button\("Сохранить"\)/);
 assert.match(installed,/observation\["structure"\]\["commitSha"\]==observation\["branchHeads"\]\[BRANCH\]/);
 assert.match(installed,/assert second==first/);
 assert.match(installed,/ATLAS06_CONNECT_BRANCH_TREE_RESTART_PASS/);
 assert.match(installed,/ATLAS06_CONNECT_LIVE_ROOT_REFRESH_SAVE_PASS/);
 assert.match(installed,/ATLAS06_CONNECT_LIVE_ROOT_REFRESH_RESTART_PASS/);
 assert.match(installed,/ATLAS06_USER_APPROVED_SOURCE_WORK_NATIVE_SAVE_PASS/);
 assert.match(installed,/ATLAS06_USER_APPROVED_SOURCE_WORK_RESTART_PASS/);
 assert.match(installed,/ATLAS06_WORK_FOLDER_LINK_VISIBLE_PASS/);
 assert.match(installed,/ATLAS06_SOURCE_PLAN_MAP_TO_GANTT_PASS/);
 assert.match(installed,/ATLAS06_SOURCE_PLAN_ABOVE_FOLD_PASS/);
 assert.match(installed,/assert_map_in_initial_view\(\)/);
 assert.match(installed,/element\.rectangle\(\)\.bottom<=bounds\[3\]-38/);
 assert.match(installed,/wait_text\("Схема проекта: каталоги, работы и этапы",35\)/);
 assert.match(installed,/click_scrolled_button\("План-график",main=True\)/);
 assert.match(installed,/assert head\(\)==current,"Opening existing Gantt changed native storage"/);
 assert.match(installed,/def click_editor_submit\(\):/);
 assert.match(installed,/button\.click_input\(\)/);
 assert.match(installed,/Work submission action is not visible within the native window/);
 assert.match(installed,/Source-linked work editor stayed open after submission/);
 assert.match(desktop,/editor\.action\.startsWith\("folder-work:"\)\?"Добавить работу"/);
 assert.match(style,/\.editor-panel \.form-footer\{[^}]*position:sticky;bottom:0;/);
 assert.match(installed,/click_scrolled_button\("Предложить работу по каталогу src",main=True\)/);
 assert.match(installed,/assert task\["sourceId"\]==original_project\["sources"\]\[0\]\["id"\]/);
 assert.match(installed,/wait_text\("Портфель проектов",45\)/);
 assert.match(installed,/Saved Atlas project did not appear in installed sidebar/);
 assert.match(installed,/click_scrolled_button\("Проверить код и сборку"\)/);
 assert.match(installed,/assert head\(\)==previous/);
 assert.match(installed,/inspect_commit_tree\(evidence\["structure"\]\["commitSha"\]/);
 assert.match(installed,/assert head\(\)==current/);
 assert.doesNotMatch(installed,/CDP|test-only app API|fake fetch responses/);
});
test("The user can switch development branches without silently accepting stale preview",()=>{
 assert.match(ui,/aria-label="Ветка исходников для подключения"/);
 assert.match(ui,/onClick=\{\(\)=>void inspect\(null,branchChoice\)\}/);
 assert.match(ui,/Изучите выбранную ветку перед подключением/);
 assert.match(ui,/branchChoice\.trim\(\)!==\(preview\.branch\|\|""\)/);
});

test("Atlas 0.6 visual stress uses real installed .iwxa import and checks source, stage and dependency navigation",()=>{
 const script=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(workflow,/atlas06-visual-portfolio\.mjs/);
 assert.match(workflow,/installed-atlas06-visual-scale\.py/);
 assert.match(script,/choose_archive\(\)/);
 assert.match(script,/Заменить портфель в черновике/);
 assert.match(script,/ATLAS06_VISUAL_IWXA_NATIVE_SAVE_PASS/);
 assert.match(script,/ATLAS06_VISUAL_LINKED_SOURCE_FIRST_PASS/);
 assert.match(script,/ATLAS06_VISUAL_LONG_TITLES_NARROW_PASS/);
 assert.match(script,/ATLAS06_VISUAL_RECORDED_DEPENDENCY_NAVIGATION_PASS/);
 assert.match(script,/assert d\.head\(\)==saved/);
 assert.match(installed,/if __name__=="__main__":/);
 assert.doesNotMatch(script,/invoke\(|execute_script\(|setItem\(|write_bytes\(STORE/);
});


test("Atlas 0.6 qualifies project visualization without GitHub on installed Windows",()=>{
 const universal=read("../desktop/tests/installed-atlas06-universal.py");
 const fixture=read("../tests/fixtures/atlas06-universal-portfolio.mjs");
 const visual=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(workflow,/atlas06-universal-portfolio\.mjs/);
 assert.match(workflow,/installed-atlas06-universal\.py/);
 assert.match(universal,/ATLAS06_UNIVERSAL_NO_GITHUB_MAP_PASS/);
 assert.match(universal,/ATLAS06_UNIVERSAL_IWXA_NATIVE_SAVE_PASS/);
 assert.match(universal,/ATLAS06_UNIVERSAL_DEPENDENCY_DETAILS_PASS/);
 assert.match(universal,/ATLAS06_UNIVERSAL_NATIVE_NO_UNREQUESTED_WRITE_PASS/);
 assert.match(visual,/if __name__=="__main__":/);
 assert.match(fixture,/type:"other"/);
 assert.doesNotMatch(universal,/write_bytes\(STORE|execute_script\(|localStorage|fake GitHub/);
});


test("Installed universal Atlas keeps internal project type codes out of navigation",()=>{
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const main=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_UNIVERSAL_HUMAN_PROJECT_TYPE_PASS/);
 assert.match(driver,/d\.wait_text\("Другое",35\)/);
 assert.match(main,/PROJECT_TYPE_LABELS\[project\.type\]/);
});


test("Installed universal editor uses physical input and explicit native title readback",()=>{
 const script=read("../desktop/tests/installed-atlas06-universal.py");
 const visual=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(script,/def open_editor_by_visible_control\(label\):/);
 assert.match(script,/control\.click_input\(\)/);
 assert.match(script,/control\.set_focus\(\)/);
 assert.match(script,/keyboard\.send_keys\("\{ENTER\}"\)/);
 assert.match(script,/d\.window_title_contains\("Форма:",18\)/);
 assert.match(visual,/A control already on screen must be used in place/);
 assert.doesNotMatch(script,/execute_script\(|invoke\(|write_bytes\(STORE/);
});


test("Native Windows witness covers an existing unused stage in a source-free project",()=>{
 const universal=read("../desktop/tests/installed-atlas06-universal.py");
 assert.match(universal,/ATLAS06_UNIVERSAL_UNUSED_STAGE_VISIBLE_PASS/);
 assert.match(universal,/ATLAS06_UNIVERSAL_UNUSED_STAGE_EDITOR_PASS/);
 assert.match(universal,/open_editor_by_visible_control\("Подвести итоги"\)/);
 assert.match(universal,/assert d\.head\(\)==saved,"Opening an unassigned stage modified native Store"/);
});


test("Installed Windows Atlas searches hidden work and stages with native input",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const universal=read("../desktop/tests/installed-atlas06-universal.py");
 assert.match(stress,/d\.set_text\("Найти работу или этап","Работа 5 \/ 1080"\)/);
 assert.match(stress,/ATLAS06_VISUAL_SEARCH_HIDDEN_WORK_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_SEARCH_STAGE_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_SEARCH_READONLY_PASS/);
 assert.match(stress,/found\.click_input\(\)/);
 assert.match(universal,/ATLAS06_UNIVERSAL_SEARCH_STAGE_PASS/);
 assert.match(universal,/Открыть этап Подвести итоги/);
 assert.match(universal,/assert d\.head\(\)==saved,"Opening a searched unused stage changed native Store"/);
});


test("Native Windows search remains clickable in a narrow viewport",()=>{
 const script=read("../desktop/tests/installed-atlas06-universal.py");
 const css=read("../desktop/src/style.css");
 assert.match(script,/ATLAS06_UNIVERSAL_SEARCH_NARROW_PASS/);
 assert.match(script,/Открыть работу Согласовать программу/);
 assert.match(script,/rectangle_in_workspace\(found\.rectangle\(\),win32gui\.GetWindowRect\(d\.handle\)\)/);
 assert.match(css,/\.atlas-source-plan-find-panel\{position:absolute;right:0;bottom:calc\(100% \+ 7px\);/);
});


test("Installed search inspects recorded sources and dependencies without writing",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const universal=read("../desktop/tests/installed-atlas06-universal.py");
 assert.match(stress,/ATLAS06_VISUAL_SEARCH_SOURCE_CONTEXT_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_SEARCH_DEPENDENCY_CONTEXT_PASS/);
 assert.match(stress,/Открыть каталог GitHub/);
 assert.match(stress,/Все зависимости на схеме/);
 assert.match(universal,/ATLAS06_UNIVERSAL_SEARCH_DEPENDENCY_CONTEXT_PASS/);
 assert.match(universal,/Связи работы Открыть площадку/);
 assert.match(universal,/assert d\.head\(\)==saved,"Inspecting ordinary work links changed native Store"/);
});


test("Installed search requires a physical click on a predecessor of a long-named work",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(driver,/ATLAS06_VISUAL_SEARCH_PREDECESSOR_CLICK_PASS/);
 assert.match(driver,/Открыть предшествующую работу Работа 0 \/ 4/);
 assert.match(driver,/Predecessor is outside Windows viewport/);
 assert.match(driver,/Opening a searched predecessor changed native Store/);
});


test("Installed Windows Atlas opens exact source folder inside source list",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const main=read("../desktop/src/main.tsx");
 assert.match(stress,/ATLAS06_VISUAL_EXACT_SOURCE_FOLDER_JUMP_PASS/);
 assert.match(stress,/find_control\("Показать каталог в Atlas",types=\{"Button"\},scroll=False\)\.click_input\(\)/);
 assert.match(stress,/d\.wait_text\("Связь работы с каталогом",25\)/);
 assert.match(stress,/d\.wait_text\("directory-23",25\)/);
 assert.match(stress,/rectangle_in_workspace\(close\.rectangle\(\),win32gui\.GetWindowRect\(d\.handle\)\)/);
 assert.match(stress,/assert d\.head\(\)==saved,"Jump to exact source folder changed native Store"/);
 assert.match(main,/ref=\{selected\?sourceJumpRef:undefined\}/);
});


test("Installed Windows Atlas returns from source to saved work and diagram",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_VISUAL_SOURCE_TO_WORK_BACKLINK_PASS/);
 assert.match(driver,/ATLAS06_VISUAL_SOURCE_TO_DIAGRAM_BACKLINK_PASS/);
 assert.match(driver,/find_control\("Открыть связанную работу",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/d\.window_title_contains\("Форма:",25\)/);
 assert.match(driver,/assert d\.head\(\)==saved,"Opening linked work from source changed native Store"/);
 assert.match(driver,/find_control\("К схеме",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/assert d\.head\(\)==saved,"Returning to diagram from source changed native Store"/);
 assert.match(ui,/onClick=\{\(\)=>openEditor\("work:"\+sourceJumpContext!\.id\)\}/);
});


test("Installed Atlas restores the work search when returning from source",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const main=read("../desktop/src/main.tsx");
 const map=read("../desktop/src/ProjectVisuals.tsx");
 assert.match(driver,/ATLAS06_VISUAL_SOURCE_SEARCH_RESTORED_PASS/);
 assert.match(driver,/find_control\("Связи работы Работа 5 \/ 1080",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/d\.wait_text\("Показать каталог в Atlas",25\)/);
 assert.match(driver,/Restoring source search changed native Store/);
 assert.match(main,/setMapSearchReturn\(tabId==="overview"&&tab==="sources"/);
 assert.match(map,/priorityWorkId:detailWorkId\|\|""/);
});

test("Installed Atlas focuses a selected work in its graph and returns without data writes",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/find_control\("Все зависимости на схеме",types=\{"Button"\},scroll=False\)\.click_input\(\)/);
 assert.match(driver,/d\.wait_text\("К найденной работе",25\)/);
 assert.match(driver,/ATLAS06_VISUAL_GRAPH_WORK_FOCUS_ROUNDTRIP_PASS/);
 assert.match(driver,/Focused graph navigation changed native Store/);
 assert.match(driver,/Return from focused graph changed native Store/);
 assert.match(ui,/focusWorkId=\{graphFocusWork\?\.id\|\|null\}/);
});

test("Installed ordinary project without GitHub returns from exact work graph to the selected table row",()=>{
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/d\.click_button\("Таблица"\)/);
 assert.match(driver,/d\.set_text\("Найти работу","Открыть площадку"\)/);
 assert.match(driver,/v\.find_control\("Связи работы Открыть площадку",types=\{"Button"\}\)/);
 assert.match(driver,/v\.find_control\("К работе в таблице",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/The original work was not restored inside the Windows viewport/);
 assert.match(driver,/ATLAS06_UNIVERSAL_TABLE_GRAPH_ROUNDTRIP_PASS/);
 assert.match(driver,/v\.find_control\("Обзор",types=\{"Button"\}\)\.click_input\(\)/);
 assert.match(driver,/d\.wait_text\("Схема проекта: работы и этапы",25\)/);
 assert.match(driver,/Opening graph from ordinary work changed native Store/);
 assert.match(driver,/Returning from ordinary work graph changed native Store/);
 assert.match(ui,/ref=\{workReturnId===w\.id\?workReturnRef:undefined\}/);
});

test("Installed ordinary project opens board card dependencies and restores its exact card",()=>{
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const main=read("../desktop/src/main.tsx");
 assert.match(driver,/v\.find_control\("Другие разделы"\)\.click_input\(\)/);
 assert.match(driver,/v\.find_control\("Доска",types=\{"Button"\}\)\.click_input\(\)/);
 assert.match(driver,/board_work=v\.find_control\("Связи работы Открыть площадку",types=\{"Button"\}\)/);
 assert.match(driver,/board_back=v\.find_control\("К работе на доске",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/The selected board card was not restored in the Windows viewport/);
 assert.match(driver,/ATLAS06_UNIVERSAL_BOARD_GRAPH_ROUNDTRIP_PASS/);
 assert.match(driver,/Opening board work graph modified native Store/);
 assert.match(driver,/Returning to board card modified native Store/);
 assert.match(main,/onClick=\{\(\)=>openWorkGraph\(w\.id,"","board"\)\}/);
});

test("Installed Atlas keeps offline Windows qualification independent of public GitHub quota",()=>{
 const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
 const visual=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const style=read("../desktop/src/style.css");
 assert.match(workflow,/id: atlas06_github_first_use[\s\S]*?continue-on-error: true/);
 assert.match(workflow,/steps\.atlas06_github_first_use\.outcome == 'failure'/);
 assert.match(workflow,/ATLAS06_GITHUB_FIRST_USE_NOT_ACCEPTED/);
 assert.match(visual,/def saved_head_or_none\(\):/);
 assert.match(visual,/before=saved_head_or_none\(\)/);
 assert.match(visual,/assert saved_head_or_none\(\)==before,"Opening IWXA preview modified native data"/);
 assert.match(visual,/assert saved_head_or_none\(\)==before,"Approving IWXA preview bypassed native Save"/);
 assert.match(style,/\.board-actions\{display:flex;flex-wrap:wrap;/);
 assert.match(style,/\.board-actions select\{flex:1 1 100%;width:100%;/);
 assert.match(style,/\.board-actions button\{flex:1 1 auto;/);
});


test("Installed source-free project shows recorded predecessor names before opening full graph",()=>{
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const main=read("../desktop/src/main.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(driver,/ATLAS06_UNIVERSAL_TABLE_DEPENDENCY_HINT_PASS/);
 assert.match(driver,/ATLAS06_UNIVERSAL_BOARD_DEPENDENCY_HINT_PASS/);
 assert.match(driver,/d\.wait_text\("Не отмечены выполненными:",25\)/);
 assert.match(driver,/d\.wait_text\("Подготовить помещение",25\)/);
 assert.match(driver,/d\.wait_text\("Согласовать программу",25\)/);
 assert.match(driver,/Reading predecessor hints in table changed native Store/);
 assert.match(driver,/Reading predecessor hints on board changed native Store/);
 assert.match(main,/workDependencyOverview\(project,plan\)/);
 assert.match(main,/WorkDependencyHint info=\{workLinks\.get\(w\.id\)\}/);
 assert.match(main,/role="group"[\s\S]*?aria-label=\{\[first,later\]\.filter\(Boolean\)\.join\("\. "\)\}/);
 assert.match(css,/\.atlas-work-dependency-hint\{display:grid/);
});


test("Installed Atlas opens the exact unfinished predecessor from table and board without writes",()=>{
 const main=read("../desktop/src/main.tsx");
 const model=read("../src/planning.mjs");
 const style=read("../desktop/src/style.css");
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 assert.match(model,/pendingWorks=row\.blockedBy\.slice\(0,maxNames\)/);
 assert.match(model,/\.map\(id=>\(\{id,title:byId\.get\(id\)\.title\}\)\)/);
 assert.match(main,/aria-label=\{"Открыть предшествующую работу "\+work\.title\}/);
 assert.match(main,/onClick=\{\(\)=>onOpenWork\(work\.id\)\}/);
 assert.match(main,/onOpenWork=\{id=>openEditor\("work:"\+id\)\}/);
 assert.match(style,/\.atlas-work-dependency-hint \.atlas-work-predecessor-link:focus-visible/);
 assert.match(driver,/open_editor_by_visible_control\("Открыть предшествующую работу Подготовить помещение"\)/);
 assert.match(driver,/open_editor_by_visible_control\("Открыть предшествующую работу Согласовать программу"\)/);
 assert.match(driver,/ATLAS06_UNIVERSAL_TABLE_PREDECESSOR_OPEN_PASS/);
 assert.match(driver,/ATLAS06_UNIVERSAL_BOARD_PREDECESSOR_OPEN_PASS/);
 assert.match(driver,/Opening a predecessor from table changed native Store/);
 assert.match(driver,/Opening a predecessor from board changed native Store/);
});


test("Installed Atlas filters source-free project work by recorded predecessor state",()=>{
 const ui=read("../desktop/src/main.tsx");
 const model=read("../src/planning.mjs");
 const style=read("../desktop/src/style.css");
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 assert.match(ui,/aria-label="Фильтр работ по зависимостям"/);
 assert.match(ui,/option value="has_pending">Есть незавершённые/);
 assert.match(ui,/option value="no_pending">Нет незавершённых/);
 assert.match(ui,/filterWorkRowsByDependencies\(/);
 assert.match(ui,/workDependencyFilter,workLinks,findingsByWork/);
 assert.match(ui,/setWorkDependencyFilter\("all"\)/);
 assert.match(model,/export function filterWorkRowsByDependencies/);
 assert.match(style,/\.atlas-work-surface \.filter-row\{flex-wrap:wrap\}/);
 assert.match(driver,/filter_control=v\.find_control\("Фильтр работ по зависимостям",types=\{"ComboBox"\}\)/);
 assert.match(driver,/ATLAS06_UNIVERSAL_DEPENDENCY_FILTER_COMBINED_PASS/);
 assert.match(driver,/Filtering by outstanding dependencies changed native Store/);
 assert.match(driver,/Changing dependency filter changed native Store/);
});


test("Installed source-free Atlas opens all waiting work from overview despite stale table search",()=>{
 const ui=read("../desktop/src/main.tsx");
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 assert.match(ui,/pendingWorkCount=\{pendingWorkCount\} onOpenPendingWorks=\{showPendingWorks\}/);
 assert.match(guide,/onClick=\{onOpenPendingWorks\}>Ждут других работ: \{pendingWorkCount\}/);
 assert.match(driver,/d\.set_text\("Найти работу","Подготовить помещение"\)/);
 assert.match(driver,/jump=v\.find_control\("Показать работы с незавершёнными предшественниками",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/Pending-work entry must be visible on the first 820x650 Windows screen/);
 assert.match(driver,/universal-pending-work-first-screen-820/);
 assert.match(driver,/ATLAS06_UNIVERSAL_OVERVIEW_PENDING_JUMP_PASS/);
 assert.match(driver,/The overview did not reveal waiting work inside the Windows viewport/);
 assert.match(driver,/Opening waiting works from overview changed native Store/);
});

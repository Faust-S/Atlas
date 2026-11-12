import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
const installed=read("../desktop/tests/installed-atlas06-connect.py");
const ui=read("../desktop/src/ProjectConnect.tsx");
const desktop=read("../desktop/src/main.tsx");
const style=read("../desktop/src/style.css");
test("Atlas 0.6 installed Windows gate uses the pinned original Setup Core",()=>{
 assert.match(workflow,/work\/2026-11-10-atlas-0-6/);
 assert.match(workflow,/npm run desktop:build -- --no-bundle/);
 assert.match(workflow,/Checkout original pinned IWXA Setup Core/);
 assert.match(workflow,/ref: 0ef7544e2a6fd5fab5994f7f25abbb960063908c/);
 assert.match(workflow,/desktop\/installer\/build-setup-core\.ps1 -InstallForQualification/);
 assert.match(workflow,/installed-atlas06-connect\.py/);
 assert.match(workflow,/IWXA-Atlas-0\.6\.0-Setup\.exe/);
 assert.match(workflow,/github\.ref_name == 'release\/0\.6'/);
 assert.match(workflow,/gh release create v0\.6\.0/);
 assert.match(workflow,/ATLAS06_RELEASE_CHECKSUM_MISMATCH/);
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
 assert.match(installed,/ATLAS06_CONNECT_CONTENT_CATALOG_FIRST_PASS/);
 assert.match(installed,/choices\.index\("Предложить работу по каталогу src"\)/);
 assert.match(installed,/empty_plan_actions/);
 assert.match(installed,/ATLAS06_CONNECT_LIVE_ROOT_REFRESH_SAVE_PASS/);
 assert.match(installed,/ATLAS06_CONNECT_LIVE_ROOT_REFRESH_RESTART_PASS/);
 assert.match(installed,/ATLAS06_USER_APPROVED_SOURCE_WORK_NATIVE_SAVE_PASS/);
 assert.match(installed,/ATLAS06_SOURCE_WORK_STAGE_ONE_FORM_PASS/);
 assert.match(installed,/set_text\("Новый этап \(необязательно\)","Проверка исходников"\)/);
 assert.match(installed,/task\["stageId"\]==project\["stages"\]\[0\]\["id"\]/);
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
 assert.match(driver,/v\.find_control\("Доска",types=\{"Button"\},scroll=False\)\.click_input\(\)/);
 assert.match(driver,/v\.capture\("universal-board-menu-open"\)/);
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
 // Check the existing dependency filter's real call, independently of other
 // filters that may be added to the same memoized work list.
 const start=ui.indexOf("const filteredWork=useMemo(");
 const end=ui.indexOf(" useEffect(()=>{",start);
 assert.ok(start>0&&end>start);
 const workList=ui.slice(start,end);
 assert.match(workList,/workLinks,workDependencyFilter\)/);
 assert.match(workList,/workDependencyFilter/);
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


test("Installed Atlas shows observed root catalogs immediately after adding a repository",()=>{
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const installed=read("../desktop/tests/installed-atlas06-connect.py");
 assert.match(guide,/open=\{projection\.sources\.length>0\|\|projection\.workTotal>0\|\|/);
 assert.match(guide,/onRefreshSource=\{onRefresh\} busy=\{busy\}/);
 assert.match(visual,/onClick=\{\(\)=>onRefreshSource\(source\.sourceId\)\}/);
 assert.match(visual,/aria-label=\{"Проверить каталоги "\+source\.repository\}/);
 assert.match(installed,/wait_text\("Как связаны части проекта",35\)/);
 assert.match(installed,/wait_text\("Работ по этому каталогу ещё нет\.",35\)/);
 assert.match(installed,/ATLAS06_CONNECT_SOURCE_MAP_FIRST_VIEW_PASS/);
 assert.match(installed,/Viewing project parts changed native storage/);
});

test("Installed Windows witnesses immediate work and stage access and the 1212-work jump",()=>{
 const source=read("../desktop/tests/installed-atlas06-connect.py");
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(source,/ATLAS06_CREATED_WORK_TABLE_FOCUS_PASS/);
 assert.match(source,/ATLAS06_CREATED_WORK_STAGE_NAVIGATION_PASS/);
 assert.match(source,/window_title_contains\("Atlas — Таблица",35\)/);
 assert.match(source,/title_button=wait_button\("Открыть работу Проверить исходники сайта",25\)/);
 assert.match(source,/target\.bottom<=bounds\[3\]-35/);
 assert.match(stress,/ATLAS06_VISUAL_CREATED_WORK_LARGE_FOCUS_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_CREATED_WORK_LARGE_SAVE_RESTART_PASS/);
 assert.match(stress,/len\(after\["items"\]\)==1213/);
 assert.match(stress,/d\.head\(\)==saved,"Applying the new-work form silently saved native data"/);
 assert.match(stress,/d\.saved_project\(changed\)==after/);
 assert.doesNotMatch(stress,/execute_script\(|invoke\(|write_bytes\(d\.STORE|localStorage/);
});

test("Windows witness checks calendar feedback and a real selected predecessor",()=>{
 const first=read("../desktop/tests/installed-atlas06-connect.py");
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 for(const marker of ["ATLAS06_CREATED_WORK_CALENDAR_PREVIEW_PASS"])
  assert.ok(first.includes(marker));
 for(const marker of ["ATLAS06_VISUAL_PREDECESSOR_SELECTED_NATIVE_PASS",
  "ATLAS06_VISUAL_PREDECESSOR_EFFECT_VISIBLE_PASS",
  "ATLAS06_VISUAL_PREDECESSOR_SAVED_PASS"])
  assert.ok(stress.includes(marker));
 assert.ok(stress.includes('title="Начать после работы",control_type="ComboBox"'));
 assert.ok(stress.includes('keyboard.send_keys("{HOME}{DOWN}{ENTER}")'));
 assert.ok(stress.includes('{"from":"visual-work-0-0","to":added[0]["id"]}'));
 assert.ok(stress.includes('len(after["dependencies"])==len(expected["dependencies"])+1'));
 assert.ok(stress.includes('d.saved_project(changed)==after'));
});

test("Native predecessor form uses a visible confirmation after selecting an existing work",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const editor=read("../src/editor.mjs");
 assert.ok(stress.includes('title="Применить к черновику",control_type="Button"'));
 assert.ok(stress.includes("rectangle_in_workspace(rect,bounds)"));
 assert.ok(stress.includes("submit.click_input()"));
 const a=editor.indexOf('return {title:target?"Работа по требованию: "+target.title:"Новая работа"');
 const b=editor.indexOf('if(action==="dep")',a);
 const regular=editor.slice(a,b);
 assert.ok(regular.indexOf('field("estimateDays"')<regular.indexOf('field("assignee"'));
 assert.ok(regular.indexOf('choice("predecessorId"')<regular.indexOf('choice("resourceId"'));
});

test("Installed large-project qualification confirms a second predecessor for the existing work",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(stress,/ATLAS06_VISUAL_EXISTING_WORK_PREDECESSOR_FORM_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_EXISTING_WORK_PREDECESSOR_RESTART_PASS/);
 assert.match(stress,/Добавить предшественника для работы/);
 assert.match(stress,/title="Что должно быть выполнено раньше\?",control_type="ComboBox"/);
 assert.match(stress,/added_links==\[\{"from":"visual-work-0-1","to":added\[0\]\["id"\]\}\]/);
 assert.match(stress,/d\.head\(\)==changed,"Choosing a predecessor silently saved native storage"/);
 assert.match(stress,/d\.saved_project\(linked_head\)==linked/);
});

test("Native Windows expects truthful unchanged schedule feedback after a neutral dependency",()=>{
 const script=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(script,/ATLAS06_VISUAL_EXISTING_WORK_DEPENDENCY_EFFECT_PASS/);
 assert.match(script,/d\.wait_text\("Расчётные сроки существующих работ не сдвинулись\.",35\)/);
 assert.match(script,/d\.wait_text\("Продолжительность плана: было",35\)/);
});

test("Installed Windows verifies a delayed existing work and opens its editor directly",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(stress,/ATLAS06_VISUAL_EXISTING_WORK_SHIFT_EXPLAINED_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_AFFECTED_WORK_DIRECT_EDITOR_PASS/);
 assert.match(stress,/ATLAS06_VISUAL_AFFECTED_WORK_ACTION_VISIBLE_PASS/);
 assert.match(stress,/find_control\("Изменить затронутую работу Работа 0 \/ 2",[\s\S]*?scroll=False\)/);
 assert.match(stress,/ATLAS06_VISUAL_AFFECTED_WORK_LINK_RESTART_PASS/);
 assert.match(stress,/find_control\("Изменить затронутую работу Работа 0 \/ 2"/);
 assert.match(stress,/d\.wait_text\("Изменились расчётные сроки\. Затронуто работ: 2\.",35\)/);
 assert.match(stress,/d\.head\(\)==linked_head,"Opening affected work editor modified storage"/);
 assert.match(stress,/new_edges==\[\{"from":"visual-work-0-0","to":"visual-work-0-1"\}\]/);
 assert.match(stress,/d\.saved_project\(final_head\)==final/);
});

test("Installed Windows corrects a shifted work and verifies the new plan after restart",()=>{
 const stress=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(stress,/ATLAS06_VISUAL_AFFECTED_WORK_REPLANNED_PASS/);
 assert.match(stress,/set_editor_text\("Плановая длительность, дней","2"\)/);
 assert.match(stress,/d\.wait_text\("Работа изменена в черновике\.",35\)/);
 assert.match(stress,/d\.wait_text\("Изменились расчётные сроки\. Затронуто работ: 2\.",35\)/);
 assert.match(stress,/changes\[0\]\["estimateDays"\]==2/);
 assert.match(stress,/d\.saved_project\(final_head\)==final/);
});

test("Installed large-project warning reports a real missed control date without inferring one",()=>{
 const fixture=read("../tests/fixtures/atlas06-visual-portfolio.mjs");
 const native=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(fixture,/dueDate:s===0&&i===1\?"2026-11-11":null/);
 assert.match(native,/ATLAS06_VISUAL_AFFECTED_WORK_DEADLINE_PASS/);
 assert.match(native,/Расчётный финиш позже контрольного срока\. Затронуто работ: 1\./);
 assert.match(native,/Контрольный срок 2026-11-11 не выдержан\./);
});

test("Installed Windows Gantt filters dated work deadline violations and opens the saved work without writes",()=>{
 const script=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const component=read("../desktop/src/ProjectVisuals.tsx");
 assert.match(script,/ATLAS06_VISUAL_GANTT_WORK_DEADLINE_FILTER_PASS/);
 assert.match(script,/d\.click_button\("График"\)/);
 assert.match(script,/Только работы позже контрольного срока/);
 assert.match(script,/deadline_filter\.get_toggle_state\(\)==1/);
 assert.match(script,/visible_bars=\[element for element in d\.window\(\)\.descendants/);
 assert.match(script,/Gantt did not filter to the single overdue work/);
 assert.match(script,/Overdue Gantt work is outside the physical Windows viewport/);
 assert.match(script,/Filtering overdue Gantt work changed native Store/);
 assert.match(script,/Opening overdue work from Gantt changed native Store/);
 assert.match(component,/Позже срока \(\{missedDeadlineTotal\}\)/);
});

test("Installed Windows numeric work-duration editor uses WebView2 Spinner input",()=>{
 const driver=read("../desktop/tests/installed-atlas06-connect.py");
 const editor=read("../src/editor.mjs");
 assert.match(driver,/for role in \("Edit","ComboBox","Spinner"\):/);
 assert.match(editor,/field\("estimateDays","Плановая длительность, дней","number"/);
});

test("Installed Atlas table reveals dated control-overrun work without saving or losing other works",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_VISUAL_TABLE_WORK_DEADLINE_FILTER_PASS/);
 assert.match(driver,/Показать работы позже контрольного срока/);
 assert.match(driver,/Показано 1 из 1 работ по фильтру/);
 assert.match(driver,/Table deadline filter changed native Store/);
 assert.match(driver,/Показано 200 из 1213 работ по фильтру/);
 assert.match(ui,/overdueWorkFinishes\.size>0\|\|workDeadlineFilter==="overdue"/);
});

test("Installed Windows opens and corrects an overdue Gantt work without impact-panel state",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_GANTT_EDIT_REPLANNED_PASS/);
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_GANTT_EDIT_SAVED_RESTART_PASS/);
 assert.match(driver,/Recalculating an ordinary Gantt edit silently saved Store/);
 assert.match(driver,/changed\[0\]\["estimateDays"\]==0/);
 assert.match(driver,/corrected\["dependencies"\]==final\["dependencies"\]/);
 assert.match(driver,/d\.saved_project\(corrected_head\)==corrected/);
 assert.match(ui,/if\(scheduleFieldsChanged\|\|fromImpactList\)/);
});

test("Installed Atlas does not announce successful GitHub refresh when the public API rate-limits it",()=>{
 const ui=read("../desktop/src/main.tsx");
 const observer=read("../src/public-refresh.mjs");
 const a=ui.indexOf("const syncPublic=async("),b=ui.indexOf("const applyAmendment=",a);
 assert.ok(a>0&&b>a);
 const handler=ui.slice(a,b);
 assert.match(handler,/if\(result\.state!==data\)mutate\(result\.state,report\.failed>0\?""/);
 assert.match(handler,/if\(report\.failed>0\)/);
 assert.match(handler,/report\.rateLimited/);
 assert.match(handler,/setMessage\(""\)/);
 assert.match(handler,/setError\(/);
 assert.match(handler,/Ранее полученные сведения не заменены/);
 assert.match(observer,/report\.failed\+\+/);
 assert.match(observer,/source\.status="error"/);
});

test("Installed Windows cleanup cannot hide the original failed-save evidence",()=>{
 const driver=read("../desktop/tests/installed-atlas06-connect.py");
 assert.match(driver,/win32gui\.PostMessage\(handle,win32con\.WM_CLOSE,0,0\)/);
 assert.match(driver,/except subprocess\.TimeoutExpired:\s*# The test owns this installed process/);
 assert.match(driver,/process\.kill\(\)/);
});

test("Installed Windows witnesses a newly missed and then resolved deadline without CPM shift",()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const plan=read("../src/planning.mjs");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_DEADLINE_MISSED_PREVIEW_PASS/);
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_DEADLINE_RESOLVED_PREVIEW_PASS/);
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_DEADLINE_SAVE_RESTART_PASS/);
 assert.match(driver,/Deadline-only change unexpectedly saved native Store/);
 assert.match(driver,/Resolved deadline was saved without explicit user approval/);
 assert.match(driver,/set_editor_text\("Срок работы","11\/10\/2026"\)/);
 assert.match(driver,/set_editor_text\("Срок работы","11\/12\/2026"\)/);
 assert.match(driver,/assert resolved_work==\{\*\*missed_work,"dueDate":"2026-11-12"\}/);
 assert.match(driver,/assert d\.saved_project\(resolved_head\)==resolved/);
 assert.match(plan,/deadlineResolvedTotal/);
 assert.match(ui,/Нарушений срока устранено:/);
});

test("Installed first-use Gantt navigation tracks the actual user-facing chart heading",()=>{
 const chart=read("../desktop/src/ProjectVisuals.tsx");
 const expected=chart.match(/<h2>(График работ)<\/h2>/);
 assert.ok(expected,"Expected user-facing graph heading missing");
 assert.ok(installed.includes('wait_text("'+expected[1]+'",35)'),
  "Installed first-use test expects an outdated graph heading");
 assert.doesNotMatch(installed,/wait_text\("План-график CPM"/);
 assert.match(workflow,/ATLAS06_GITHUB_FIRST_USE_NOT_ACCEPTED - inspect preceding installed UI and GitHub API logs/);
 assert.match(workflow,/steps\.atlas06_github_first_use\.outcome == 'failure'/);
});

test("Installed large-project qualification has enough runtime for both deadline edits and readbacks",()=>{
 const step=workflow.match(/- name: Qualify large Atlas 0\.6 map in installed Windows GUI([\s\S]*?)- name: Build Atlas 0\.6 universal project archive/);
 assert.ok(step,"Missing native visual qualification step");
 const minutes=Number(step[1].match(/timeout-minutes:\s*(\d+)/)?.[1]||0);
 assert.ok(minutes>=11&&minutes<=20,"Native portfolio qualification timeout is too short or unbounded");
 assert.match(step[1],/installed-atlas06-visual-scale\.py/);
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_DEADLINE_SAVE_RESTART_PASS/);
 assert.match(driver,/ATLAS06_VISUAL_DIRECT_GANTT_EDIT_SAVED_RESTART_PASS/);
});

test('Installed Atlas opens overdue work from project overview without scrolling or writes',()=>{
 const driver=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const ui=read("../desktop/src/main.tsx");
 assert.match(driver,/ATLAS06_VISUAL_OVERVIEW_OVERDUE_WORK_JUMP_PASS/);
 assert.match(driver,/win32gui\.MoveWindow\(d\.handle,0,0,820,650,True\)/);
 assert.match(driver,/overview_overdue=find_control\("Показать работы позже контрольного срока"/);
 assert.match(driver,/types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/Overdue-work entry is not visible on the initial 820x650 Windows screen/);
 assert.match(driver,/overview-overdue-work-first-screen-820/);
 assert.match(driver,/Overdue-work overview shortcut did not focus the affected work/);
 assert.match(driver,/one=find_control\("Открыть работу Работа 0 \/ 2",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/Overview overdue-work navigation changed the native Store/);
 assert.match(ui,/overdueWorkCount=\{overdueWorkFinishes\.size\} onOpenOverdueWorks=\{showOverdueWorks\}/);
 assert.match(guide,/onClick=\{onOpenOverdueWorks\}>Позже срока: \{overdueWorkCount\}/);
});

test("Atlas 0.7 keeps the accepted 0.6 release gate and checks its own manifests",()=>{
 const product=JSON.parse(read("../desktop/installer/atlas.json"));
 const tauri=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 const manifest=JSON.parse(read("../desktop/package.json"));
 const lock=JSON.parse(read("../desktop/package-lock.json"));
 assert.equal(product.version,"0.7.0-dev.1");
 assert.equal(tauri.version,"0.7.0-dev.1");
 assert.equal(manifest.version,"0.7.0-dev.1");
 assert.equal(lock.version,"0.7.0-dev.1");
 assert.equal(lock.packages[""].version,"0.7.0-dev.1");
 assert.match(workflow,/release\/0\.6/);
 assert.match(workflow,/Require successful live GitHub first-use on Atlas 0\.6/);
 assert.match(workflow,/Qualify large Atlas 0\.6 map in installed Windows GUI/);
 assert.match(workflow,/Qualify ordinary project without GitHub on installed Atlas 0\.6/);
 assert.match(workflow,/Publish accepted Atlas 0\.6\.0 stable release/);
 assert.match(workflow,/gh release create v0\.6\.0/);
 assert.match(workflow,/ATLAS06_STABLE_RELEASE_PUBLISHED/);
});

test("Installed overdue shortcut scrolls back to a physically reachable overview tab",()=>{
 const test=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(test,/overview_tab=find_control\("Обзор",types=\{"Button"\}\)/);
 assert.match(test,/rectangle_in_workspace\(overview_tab\.rectangle\(\),win32gui\.GetWindowRect\(d\.handle\)\)/);
 assert.match(test,/overview_tab\.click_input\(\)/);
 assert.match(test,/ATLAS06_VISUAL_OVERVIEW_OVERDUE_WORK_JUMP_PASS/);
});

test("Installed overdue-work route restores physically reachable timeline navigation",()=>{
 const d=read("../desktop/tests/installed-atlas06-visual-scale.py");
 assert.match(d,/find_control\("График",types=\{"Button"\}\)\.click_input\(\)/);
 assert.match(d,/ATLAS06_VISUAL_DIRECT_GANTT_EDIT_REPLANNED_PASS/);
});

test("Atlas 0.7 development inherits the qualified original Setup Core route",()=>{
 const workflow=read("../.github/workflows/atlas-0-2-1-branding.yml");
 const setup=read("../desktop/installer/build-setup-core.ps1");
 assert.match(workflow,/work\/2026-11-12-atlas-0-7/);
 assert.match(workflow,/Qualify ordinary project without GitHub on installed Atlas 0\.6/);
 assert.match(setup,/IWXA-Atlas-0\.7\.0-dev\.1-Setup\.exe/);
 assert.match(workflow,/gh release create v0\.6\.0/);
});

test("Installed Atlas 0.7 reaches source view from a nonengineering project without writing",()=>{
 const driver=read("../desktop/tests/installed-atlas06-universal.py");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 assert.match(driver,/ATLAS07_UNIVERSAL_SOURCE_ENTRY_PASS/);
 assert.match(driver,/connect=v\.find_control\("Подключить источник",types=\{"Button"\},scroll=False\)/);
 assert.match(driver,/Source-free project does not expose a reachable source connector/);
 assert.match(driver,/Opening source connection for an ordinary project changed native Store/);
 assert.match(driver,/d\.wait_text\("Источники проекта",25\)/);
 assert.match(guide,/!recordedSources&&<button type="button"/);
});

test("Atlas 0.7 installed GUI binds an existing work to an observed source folder with native readback",()=>{
 const driver=read("../desktop/tests/installed-atlas07-existing-work-link.py");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 assert.match(workflow,/Verify link of existing work to observed catalog in installed Atlas 0\.7/);
 assert.match(workflow,/installed-atlas07-existing-work-link\.py/);
 assert.match(workflow,/ATLAS07_INSTALLED_FOLDER_WORK_LINK_FAILED/);
 assert.match(driver,/ATLAS07_INSTALLED_EXISTING_WORK_FOLDER_LINK_PASS/);
 assert.ok(driver.includes('ENTRY="Связать существующую работу с каталогом atlas-visual-fixture/project-0 / "+FOLDER'));
 assert.ok(driver.includes('FOLDER="directory-01"'));
 assert.match(driver,/assert d\.saved_project\(after\)==updated/);
 assert.match(driver,/assert d\.head\(\)==before/);
 assert.match(visual,/source\.repository\+" \/ "\+folder\.name/);
 assert.match(guide,/onEdit\(folderLinkAction\(sourceId,commitSha,folder\)\)/);
});


test("Atlas 0.7 installed work editor can unlink a catalog without rewriting other work fields",()=>{
 const driver=read("../desktop/tests/installed-atlas07-unlink-work.py");
 const editor=read("../src/editor.mjs");
 const core=read("../src/core.mjs");
 assert.match(workflow,/Verify removal of an incorrect source link in installed Atlas 0\.7/);
 assert.match(workflow,/installed-atlas07-unlink-work\.py/);
 assert.match(workflow,/ATLAS07_INSTALLED_WORK_UNLINK_FAILED/);
 assert.match(driver,/ATLAS07_INSTALLED_WORK_SOURCE_UNLINK_PASS/);
 assert.match(driver,/assert d\.head\(\)==before/);
 assert.match(driver,/assert updated==expected/);
 assert.match(driver,/assert d\.saved_project\(after\)==updated/);
 assert.match(editor,/choice\("sourceLink","Связь с источником"/);
 assert.match(core,/delete item\.sourcePath;delete item\.sourceRevision/);
});


test("Installed Atlas 0.7 searches the full work set and binds a distant work in real GUI",()=>{
 const driver=read("../desktop/tests/installed-atlas07-search-work.py");
 assert.match(workflow,/Search and link a distant work in installed Atlas 0\.7/);
 assert.match(workflow,/installed-atlas07-search-work\.py/);
 assert.match(workflow,/ATLAS07_INSTALLED_WORK_SEARCH_FAILED/);
 assert.match(driver,/ATLAS07_INSTALLED_SEARCHED_WORK_LINK_PASS/);
 assert.match(driver,/keyboard\.send_keys\("5 \/ 1080",with_spaces=True\)/);
 assert.match(driver,/project-5 \/ "\+FOLDER/);
 assert.match(driver,/target\["sourceId"\]="visual-source-5"/);
 assert.match(driver,/d\.wait_text\("Найдено: 1",20\)/);
 assert.match(driver,/assert d\.saved_project\(after\)==updated/);
});


test("Compact installed editor scrolls its native field region before physical input",()=>{
 const scale=read("../desktop/tests/installed-atlas06-visual-scale.py");
 const unlink=read("../desktop/tests/installed-atlas07-unlink-work.py");
 const search=read("../desktop/tests/installed-atlas07-search-work.py");
 assert.match(scale,/def editor_field\(name,types=\("Edit","Spinner","ComboBox"\)\):/);
 assert.match(scale,/def set_editor_text\(name,value\):/);
 assert.match(scale,/ATLAS07_EDITOR_FIELD_SCROLL_PASS/);
 assert.match(scale,/mouse\.scroll\(coords=\(x,y\),wheel_dist=-2\)/);
 assert.match(scale,/set_editor_text\("Плановая длительность, дней","2"\)/);
 assert.match(scale,/set_editor_text\("Плановая длительность, дней","0"\)/);
 assert.match(scale,/set_editor_text\("Срок работы","11\/10\/2026"\)/);
 assert.match(unlink,/v\.editor_field\("Связь с источником",types=\("ComboBox",\)\)/);
 assert.match(search,/v\.editor_field\("Найти существующую работу",types=\("Edit",\)\)/);
 assert.match(search,/v\.editor_field\("Существующая работа",types=\("ComboBox",\)\)/);
});

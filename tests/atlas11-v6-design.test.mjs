import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ATLAS_DASHBOARD_WIDGETS,DEFAULT_ATLAS_DASHBOARD,
 normalizeAtlasDashboardLayout,toggleAtlasDashboardWidget,
 shiftAtlasDashboardWidget,moveAtlasDashboardWidget} from "../src/dashboard-layout.mjs";
const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("0.11 dashboard layouts preserve ordering, reject unknown ids and never enter project schema",()=>{
 assert.ok(ATLAS_DASHBOARD_WIDGETS.length>=7);
 assert.deepEqual(normalizeAtlasDashboardLayout(null),[...DEFAULT_ATLAS_DASHBOARD]);
 assert.deepEqual(normalizeAtlasDashboardLayout(["resources","metrics","resources","unexpected",4]),["resources","metrics"]);
 assert.deepEqual(normalizeAtlasDashboardLayout([]),[]);
 assert.deepEqual(moveAtlasDashboardWidget(["metrics","sources","resources"],"resources","metrics"),
  ["resources","metrics","sources"]);
 assert.deepEqual(shiftAtlasDashboardWidget(["metrics","sources","resources"],"sources",1),
  ["metrics","resources","sources"]);
 assert.deepEqual(toggleAtlasDashboardWidget(["metrics"],"calendar",true),["metrics","calendar"]);
 assert.deepEqual(toggleAtlasDashboardWidget(["metrics","calendar"],"calendar",false),["metrics"]);
 assert.deepEqual(toggleAtlasDashboardWidget(["metrics"],"invalid",true),["metrics"]);
 const dashboard=source("../desktop/src/AtlasDashboard.tsx");
 assert.match(dashboard,/KEY="iwxa\.atlas\.dashboard\.layout\.v1"/);
 assert.match(dashboard,/localStorage\.setItem\(KEY,JSON\.stringify\(layout\)\)/);
 assert.match(dashboard,/draggable=\{editing\}/);
 assert.match(dashboard,/onDragStart=\{event=>/);
 assert.match(dashboard,/onDrop=\{event=>/);
 assert.match(dashboard,/onOpenProject\(project\.id,"timeline"\)/);
 assert.match(dashboard,/sourceQueue\.rows\.slice/);
 assert.match(dashboard,/resources\.people/);
 assert.match(dashboard,/data\.calendarLibrary/);
 assert.doesNotMatch(dashboard,/localStorage\.setItem\([^,]+,JSON\.stringify\(data\)/);
});

test("0.11 original Atlas core, canonical CPM and native file operations remain owners",()=>{
 const ui=source("../desktop/src/main.tsx");
 const shell=source("../desktop/src/AtlasChrome.tsx");
 const css=source("../desktop/src/style.css");
 assert.match(ui,/import \{AtlasDashboard\} from "\.\/AtlasDashboard"/);
 assert.match(ui,/import \{AtlasChromeTopbar,AtlasChromeRail,AtlasGlyph\}/);
 assert.match(ui,/\{settingsOpen&&!embedded\?<AtlasSettings/);
 assert.match(ui,/!project\?\(homeOpen&&!embedded\?/);
 assert.match(ui,/onOpenProject=\{\(id,target="overview"\)=>openProjectTab\(id,target\)\}/);
 assert.match(ui,/onSave=\{\(\)=>void save\(\)\}/);
 assert.match(ui,/onExportIwxa=\{\(\)=>void exportIwxa\(\)\}/);
 assert.match(ui,/onImportIwxa=\{\(\)=>void importIwxa\(\)\}/);
 assert.match(ui,/onHistory=\{\(\)=>void showNativeHistory\(\)\}/);
 assert.match(ui,/\{tab==="timeline"&&\(plan\?/);
 assert.match(ui,/const dates=useMemo\(\(\)=>portfolioSchedule\(data\),\[data\]\)/);
 assert.match(ui,/const resources=useMemo\(\(\)=>portfolioResources\(data,/);
 assert.match(shell,/src=\{p\.logoUrl\}/);
 assert.match(css,/\.atlas-embedded \.atlas-v6-layout\{display:contents\}/);
 assert.match(css,/\.atlas-embedded \.atlas-v6-nav-scroll\{display:contents\}/);
 assert.match(css,/\.app-shell\.atlas-v6-shell \.inspector\{[\s\S]*?position:relative/);
 assert.match(css,/\.atlas-v6-shell \.sidebar\.atlas-v6-sidebar-collapsed~\.workspace \.atlas-compact-tabs\{display:flex\}/);
 assert.doesNotMatch(shell,/<svg[^>]*>.*rect width="64" height="64"/);
});

test("0.11 menu and navigation use guarded existing Atlas mutations, version is in settings",()=>{
 const ui=source("../desktop/src/main.tsx"),chrome=source("../desktop/src/AtlasChrome.tsx");
 const settings=source("../desktop/src/AtlasSettings.tsx");
 assert.match(ui,/const goHome=\(\)=>\{\s*if\(!requireClosedForm\(\)\)return/);
 assert.match(ui,/const goProjectTab=\(id:Tab\)=>\{\s*if\(!project\|\|!requireClosedForm\(\)\)return/);
 assert.match(ui,/const goSettings=\(\)=>\{if\(!requireClosedForm\(\)\)return/);
 assert.match(ui,/if\(!embedded&&!navPanelOpen\)setNavPanelOpen\(true\)/);
 assert.match(ui,/if\(!requireClosedForm\(\)\)return;\s*const next=routeCursor\.current\+delta/);
 assert.match(ui,/className=\{"inspector"\+\(editor\?" atlas-inspector-editing":""\)\}/);
 for(const text of ["Файл","Правка","Вид","Справка","Открыть архив .iwxa","История сохранений","Подписанный Result"]){
  if(text==="Подписанный Result")assert.match(chrome,/Принять подписанный Result/);
  else assert.ok(chrome.includes(text),text);
 }
 assert.ok(settings.includes("Установленная версия"));
 assert.ok(settings.includes("p.version"));
 assert.ok(!chrome.includes("p.version"));
});

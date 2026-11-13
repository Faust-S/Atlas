import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serialize,deserialize} from "../src/core.mjs";
import {projectWorkTableSearch} from "../src/project-organization.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";

const getIds=(project,query)=>projectWorkTableSearch(project,query).map(work=>work.id);
test("Large project work table finds distant works by stage without relying on bounded diagram",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0],before=serialize(snapshot);
 const matches=getIds(project,"ЭТАП РАБОТ 48");
 assert.equal(matches.length,22);
 assert.ok(matches.includes("visual-work-5-47"));
 assert.equal(matches.some(id=>id.startsWith("visual-work-0-")),false);
 assert.equal(getIds(project,"Этап работ 48")[0],matches[0]);
 assert.equal(serialize(snapshot),before);
});
test("Search combines observed source repository and stored folder across all 1212 works",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0];
 const matches=getIds(project,"PROJECT-5 directory-23");
 assert.equal(matches.length,45);
 assert.ok(matches.includes("visual-work-5-47"));
 assert.ok(matches.includes("visual-work-5-1079"));
 assert.equal(matches.some(id=>!id.startsWith("visual-work-5-")),false);
 assert.equal(getIds(project,"directory-23").length,6*1+44); // Five short sources and 45 in project-5.
 assert.deepEqual(deserialize(serialize(snapshot)),snapshot);
});
test("Work search handles names, assigned people and unlinked work without mutating source fields",()=>{
 const snapshot=atlas06VisualPortfolio(),project=structuredClone(snapshot.projects[0]);
 const chosen=project.items.find(w=>w.id==="visual-work-5-47");
 chosen.assignee="Инженер Ёж";
 assert.deepEqual(getIds(project,"инженер еж"),[chosen.id]);
 assert.ok(getIds(project,"Работа 5 / 48").includes(chosen.id));
 assert.deepEqual(getIds(project,"без выбранного каталога 11"),["visual-unlinked-11"]);
 assert.equal(getIds(project,"несуществующий")[0],undefined);
 assert.equal(getIds(project,"").length,1212);
 assert.throws(()=>projectWorkTableSearch(null,"Этап"),/Проект не найден/);
 assert.equal(snapshot.projects[0].items.find(w=>w.id===chosen.id).assignee,"");
});
test("Existing Atlas work table applies all structured filters and search on the same rows",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/const textMatches=projectWorkTableSearch\(project,workQuery\);/);
 assert.match(ui,/const matching=textMatches\.filter/);
 assert.match(ui,/filterWorkRowsByDependencies\(/);
 assert.match(ui,/filterWorkRowsByObservation\(/);
 assert.match(ui,/sortWorkRows\(/);
 assert.match(ui,/Название, этап, каталог или ответственный/);
});


test("A single action clears all work filters without disturbing manually selected sorting",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const start=ui.indexOf('const clearWorkFilters=()=>');
 const reset=ui.slice(start,ui.indexOf("const showAffectedWorks=",start));
 for(const setter of ["setWorkFilter","setWorkTargetFilter","setWorkObservationFilter",
  "setWorkDependencyFilter","setWorkDeadlineFilter"])
  assert.ok(reset.includes(setter+'("all")'),"Missing filter reset: "+setter);
 assert.match(reset,/setWorkQuery\(""\);setWorkImpactOnly\(false\)/);
 assert.match(reset,/setWorkReturnId\(null\);setWorkLimit\(200\)/);
 assert.match(reset,/if\(workSort==="impact"\)setWorkSort\("title"\)/);
 assert.doesNotMatch(reset,/setWorkSort\("dueDate"\)|setWorkSort\("state"\)/);
 assert.match(ui,/aria-label="Сбросить фильтры работ" onClick=\{clearWorkFilters\}/);
 assert.match(ui,/workDeadlineFilter!=="all"\|\|!!workQuery\.trim\(\)/);
});


test("Filtered large work lists keep one reset action available while scrolling deep cards",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const open=ui.indexOf('{workFiltersActive&&<div className="atlas-work-filter-shortcut"');
 const count=ui.indexOf('<p className="minor atlas-work-evidence-summary"',open);
 const table=ui.indexOf('<div className="table-scroll atlas-work-table-scroll"',count);
 assert.ok(open>0&&count>open&&table>count);
 assert.equal(ui.match(/aria-label="Сбросить фильтры работ"/g)?.length,1);
 assert.match(ui.slice(open,count),/onClick=\{clearWorkFilters\}/);
 assert.match(ui.slice(open,count),/role="group" aria-label="Быстрые действия с фильтрами работ"/);
 assert.match(css,/\.atlas-work-filter-shortcut\{[\s\S]*?position:sticky;top:75px;z-index:7/);
 assert.match(css,/\.atlas-work-filter-shortcut \.atlas-work-reset-filters/);
 assert.match(ui,/const clearWorkFilters=\(\)=>/);
});

test("Enter reveals the sole searched work using the existing focus and paging route",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/title=\{filteredWork\.length===1&&workQuery\.trim\(\)\?"Enter: перейти к найденной работе":undefined\}/);
 assert.match(ui,/onKeyDown=\{e=>\{\s*if\(e\.key==="Enter"&&workQuery\.trim\(\)&&filteredWork\.length===1\)\{/);
 assert.match(ui,/e\.preventDefault\(\);setWorkReturnId\(filteredWork\[0\]\.id\)/);
 assert.match(ui,/workQuery\.trim\(\)&&filteredWork\.length===1&&<small>Enter: перейти к найденной работе<\/small>/);
 assert.match(ui,/if\(index>=workLimit\)\{setWorkLimit\(index\+1\);return;\}/);
 assert.match(ui,/control\.scrollIntoView\(\{block:"center",behavior:"auto"\}\)/);
 const segment=ui.slice(ui.indexOf('<label>Найти работу <input'),ui.indexOf('<label>Сортировка <select'));
 assert.doesNotMatch(segment,/mutate\(|commitWithReadback\(|nativeInvoke\(|localStorage/);
});

test("Critical-path work shortcut derives from canonical CPM and keeps full pagination",()=>{
 const snapshot=atlas06VisualPortfolio(),before=serialize(snapshot);
 const project=snapshot.projects[0],calculated=scheduleProject(project);
 const expected=new Set(calculated.rows.filter(row=>row.critical).map(row=>row.id));
 assert.deepEqual(new Set(calculated.criticalIds),expected);
 assert.ok(expected.size>200,"The large project must exercise paginated critical results");
 assert.equal(project.items.filter(item=>expected.has(item.id)).length,expected.size);
 assert.equal(calculated.rows.some(row=>row.id==="visual-unlinked-0"&&row.critical),false);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/const criticalWorkIds=useMemo\(\(\)=>new Set<string>\(\(plan\?\.criticalIds\|\|\[\]\)\.map\(String\)\),\[plan\]\)/);
 assert.match(ui,/!workCriticalOnly\|\|criticalWorkIds\.has\(item\.id\)/);
 assert.match(ui,/const showCriticalWorks=\(\)=>\{/);
 assert.ok(ui.includes('setWorkQuery("");setWorkImpactOnly(false);setWorkCriticalOnly(true);'));
 assert.ok(ui.includes('setWorkDeadlineFilter("all");setWorkQuery("");setWorkImpactOnly(false);setWorkCriticalOnly(false)'));
 assert.match(ui,/workImpactActive\|\|workCriticalOnly/);
 assert.match(ui,/Показать работы на критическом пути: "\+criticalWorkIds\.size/);
 assert.match(ui,/aria-label="Расчётные риски работ"/);
 assert.match(ui,/aria-label=\{workCriticalOnly\?"Снять отбор критических работ"/);
 assert.match(ui,/criticalWorkIds\.has\(w\.id\)&&<small className="atlas-work-critical-label">Критический путь<\/small>/);
 assert.match(css,/\.atlas-work-risk-actions\{/);
 const start=ui.indexOf("const showCriticalWorks="),end=ui.indexOf("const openLinkedSource=",start);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(ui.slice(start,end),/mutate\(|commitWithReadback\(|nativeInvoke\(|fetch\(/);
 assert.equal(serialize(snapshot),before);
});

test("Switching between impact, pending, overdue and critical views never intersects stale selections",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const section=(name,next)=>{
  const start=ui.indexOf("const "+name+"=()=>{");
  const end=ui.indexOf("const "+next+"=",start);
  assert.ok(start>=0&&end>start, name+" navigation exists");
  return ui.slice(start,end);
 };
 for(const [name,next] of [
  ["showPendingWorks","showOverdueWorks"],
  ["showOverdueWorks","showCriticalWorks"],
  ["showCriticalWorks","openLinkedSource"]
 ]){
  const body=section(name,next);
  assert.match(body,/setWorkImpactOnly\(false\)/,name+" clears impact selection");
  assert.match(body,/setWorkCriticalOnly\((?:true|false)\)/,name+" applies the intended critical selection");
  assert.match(body,/if\(workSort==="impact"\)setWorkSort\("title"\)/,name+" resets hidden impact ordering");
 }
 const affected=section("showAffectedWorks","filteredWork");
 assert.match(affected,/setWorkImpactOnly\(true\);setWorkCriticalOnly\(false\)/);
 const view=ui.slice(ui.indexOf("const view=(tabId:Tab)=>"),ui.indexOf("const showPendingWorks=()=>"));
 assert.match(view,/if\(tabId!=="work"\)\{setRecentWorkId\(null\);setWorkImpactOnly\(false\);setWorkCriticalOnly\(false\)/);
 assert.doesNotMatch(section("showCriticalWorks","openLinkedSource"),
  /mutate\(|commitWithReadback\(|nativeInvoke\(|fetch\(/);
});

test("Filtered work lists offer an immediate keyboard-accessible jump to the first result",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const action='aria-label="Перейти к первой найденной работе"';
 const jump='onClick={()=>setWorkReturnId(filteredWork[0].id)}>К работам</button>';
 const start=ui.indexOf('className="atlas-work-filter-shortcut"'),end=ui.indexOf('className="minor atlas-work-evidence-summary"',start);
 assert.ok(start>=0&&end>start&&end-start<1500);
 const section=ui.slice(start,end);
 assert.ok(section.includes('filteredWork.length>0&&<button'));
 assert.ok(section.includes('className="text-link atlas-work-jump-results"'));
 assert.ok(section.includes(action));
 assert.ok(section.includes(jump));
 assert.match(css,/\.atlas-work-filter-shortcut \.atlas-work-jump-results\{/);
 assert.match(ui,/control\.scrollIntoView\(\{block:"center",behavior:"auto"\}\)/);
 assert.doesNotMatch(section,/mutate\(|commitWithReadback\(|nativeInvoke\(|fetch\(/);
});

test("Overview opens canonical critical and overdue work without hidden table search or writes",()=>{
 const snapshot=atlas06VisualPortfolio(),original=serialize(snapshot);
 const project=snapshot.projects[0],plan=scheduleProject(project);
 assert.equal(plan.criticalIds.length,plan.rows.filter(row=>row.critical).length);
 assert.ok(plan.criticalIds.length>200,"Critical path remains useful in the large offline project");
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const guide=readFileSync(new URL("../desktop/src/ProjectOrganizationGuide.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.ok(ui.includes("criticalWorkCount={criticalWorkIds.size} onOpenCriticalWorks={showCriticalWorks}"));
 assert.ok(ui.includes("overdueWorkCount={overdueWorkFinishes.size} onOpenOverdueWorks={showOverdueWorks}"));
 assert.ok(guide.includes("onOpenCriticalWorks:()=>void;criticalWorkCount:number;"));
 assert.ok(guide.includes("criticalWorkCount>0&&<button type=\"button\""));
 assert.ok(guide.includes('aria-label={"Показать работы на критическом пути: "+criticalWorkCount}'));
 assert.ok(guide.includes("onClick={onOpenCriticalWorks}>Критические работы: {criticalWorkCount}</button>"));
 assert.match(css,/\.atlas-project-organization h2 \.atlas-critical-work-link:focus-visible/);
 const overdue=ui.slice(ui.indexOf("const showOverdueWorks=()=>"),ui.indexOf("const showCriticalWorks=()=>"));
 const critical=ui.slice(ui.indexOf("const showCriticalWorks=()=>"),ui.indexOf("const openLinkedSource="));
 for(const body of [overdue,critical]){
  assert.match(body,/view\("work"\)/);
  assert.match(body,/setWorkQuery\(""\)/);
  assert.match(body,/setWorkLimit\(200\)/);
  assert.match(body,/setWorkFilter\("all"\)/);
  assert.match(body,/setWorkTargetFilter\("all"\)/);
  assert.doesNotMatch(body,/mutate\(|commitWithReadback\(|nativeInvoke\(|fetch\(/);
 }
 assert.ok(overdue.includes("setWorkReturnId(firstSortedMatchingWorkId(project.items,overdueWorkFinishes,"));
 assert.ok(critical.includes("setWorkReturnId(firstSortedMatchingWorkId(project.items,criticalWorkIds,"));
 assert.match(overdue,/workSort==="impact"\?"title":workSort/);
 assert.match(critical,/workSort==="impact"\?"title":workSort/);
 assert.match(ui,/aria-label="Вернуться к обзору проекта"/);
 assert.match(ui,/onClick=\{\(\)=>view\("overview"\)\}>К обзору<\/button>/);
 assert.match(css,/\.atlas-work-filter-shortcut \.atlas-work-return-overview\{/);
 assert.equal(serialize(snapshot),original);
});

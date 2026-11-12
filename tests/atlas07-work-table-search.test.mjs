import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serialize,deserialize} from "../src/core.mjs";
import {projectWorkTableSearch} from "../src/project-organization.mjs";
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


test("A single action resets all table filters, including hidden overdue filter, without changing work sorting",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const start=ui.indexOf('const clearWorkFilters=()=>');
 const reset=ui.slice(start,start+365);
 for(const setter of ["setWorkFilter","setWorkTargetFilter","setWorkObservationFilter",
  "setWorkDependencyFilter","setWorkDeadlineFilter"])
  assert.ok(reset.includes(setter+'("all")'),"Missing filter reset: "+setter);
 assert.match(reset,/setWorkQuery\(""\)/);
 assert.match(reset,/setWorkReturnId\(null\);setWorkLimit\(200\)/);
 assert.doesNotMatch(reset,/setWorkSort/);
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

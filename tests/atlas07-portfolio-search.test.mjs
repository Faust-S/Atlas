import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serialize} from "../src/core.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {atlas06UniversalPortfolio} from "./fixtures/atlas06-universal-portfolio.mjs";
import {buildPortfolioSearchIndex,filterPortfolioSearch,portfolioSearchReason} from "../src/portfolio-search.mjs";

function fixture(){
 const visual=atlas06VisualPortfolio();
 const universal=atlas06UniversalPortfolio();
 const snapshot=structuredClone(visual);
 snapshot.projects.push(structuredClone(universal.projects[0]));
 return snapshot;
}
const names=index=>index.map(project=>project.name);
const search=(index,query,status="all")=>
 names(filterPortfolioSearch(index,{query,status}));

test("Portfolio finds a project by a distant work, a stage, and its existing source/folder",()=>{
 const state=fixture(),original=serialize(state),index=buildPortfolioSearchIndex(state.projects);
 assert.deepEqual(search(index,"РАБОТА 5 / 1080"),["Контрольный большой проект"]);
 assert.deepEqual(search(index,"Этап работ 48"),["Контрольный большой проект"]);
 assert.deepEqual(search(index,"project-5 directory-23"),["Контрольный большой проект"]);
 assert.deepEqual(search(index,"atlas-visual-fixture/project-5"),["Контрольный большой проект"]);
 assert.deepEqual(search(index,"Открыть площадку"),["Городская встреча без исходников"]);
 assert.deepEqual(search(index,"Подготовка"),["Городская встреча без исходников"]);
 assert.equal(search(index,"неизвестный проект").length,0);
 assert.deepEqual(search(index,""),state.projects.map(p=>p.name));
 assert.equal(serialize(state),original);
});

test("Portfolio search respects active/finished statuses and retains source-less projects",()=>{
 const state=fixture();
 state.projects[0].status="completed";
 const index=buildPortfolioSearchIndex(state.projects);
 assert.deepEqual(search(index,"Контрольный большой проект","finished"),
  ["Контрольный большой проект"]);
 assert.deepEqual(search(index,"Работа 5 / 1080","active"),[]);
 assert.deepEqual(search(index,"Подготовить помещение","active"),
  ["Городская встреча без исходников"]);
 assert.deepEqual(search(index,"","finished"),["Контрольный большой проект"]);
 assert.throws(()=>filterPortfolioSearch(index,{status:"unknown"}),/Неизвестный фильтр/);
 assert.throws(()=>buildPortfolioSearchIndex(null),/Неверный портфель/);
});

test("Name-only, work and source searches stay in their respective fields",()=>{
 const state=fixture(),index=buildPortfolioSearchIndex(state.projects);
 assert.equal(search(index,"Работа 5 / 1080 Этап работ 48").length,0);
 assert.deepEqual(search(index,"директория", "all"),[]);
 const withYo=structuredClone(state);
 withYo.projects[1].owner="Ответственный Ёж";
 assert.deepEqual(search(buildPortfolioSearchIndex(withYo.projects),"еж"),["Городская встреча без исходников"]);
 assert.equal(state.projects[1].owner,"");
});

test("The existing portfolio search field indexes project contents for navigation without writes",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/buildPortfolioSearchIndex\(data\.projects\)/);
 assert.match(ui,/filterPortfolioSearch\(portfolioSearchIndex,\{/);
 assert.match(ui,/query:search,status:portfolioStatus/);
 assert.match(ui,/Найти проект по работе, этапу или источнику/);
 assert.match(ui,/Показано \{Math\.min\(filtered\.length,portfolioLimit\)\} из \{filtered\.length\} проектов/);
});


test("Portfolio search gives immediate, accessible feedback above the long attention queue",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const location=ui.indexOf('className="atlas-portfolio-find-count" role="status" aria-live="polite"');
 const portfolioTitle=ui.indexOf('<h1>Портфель проектов</h1>');
 const queue=ui.indexOf('<section className="surface atlas-portfolio-command"');
 assert.ok(portfolioTitle>0&&location>portfolioTitle&&queue>location);
 assert.match(ui,/const portfolioFindSummary=\(search\.trim\(\)\?"Найдено проектов: ":"В списке проектов: "\)\+filtered\.length;/);
 assert.match(ui.slice(location,location+230),/aria-label=\{portfolioFindSummary\}>\{portfolioFindSummary\}<\/p>/);
 assert.doesNotMatch(ui.slice(location,location+230),/\}\{filtered\.length\}/);
 assert.match(css,/\.atlas-portfolio-find-count\{/);
});


test("Portfolio search provides a direct clear action and restores input focus",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const start=ui.indexOf('className="atlas-portfolio-search-feedback"');
 const code=ui.slice(start,start+650);
 assert.ok(start>0);
 assert.match(code,/search\.trim\(\)&&<button type="button"/);
 assert.match(code,/aria-label="Очистить поиск проектов"/);
 assert.match(code,/setSearch\(""\);setPortfolioLimit\(150\);setSidebarLimit\(120\)/);
 assert.match(code,/document\.getElementById\("atlas-search"\)\?\.focus\(\)/);
 assert.match(css,/\.atlas-portfolio-search-feedback\{/);
 assert.match(css,/\.atlas-portfolio-clear\{/);
});


test("Portfolio search explains whether a result came from work, stage, source or folder",()=>{
 const snapshot=fixture(),original=serialize(snapshot);
 const large=snapshot.projects[0],ordinary=snapshot.projects[1];
 assert.equal(portfolioSearchReason(large,"Работа 5 / 1080"),"Работа: Работа 5 / 1080");
 assert.equal(portfolioSearchReason(large,"Этап работ 48"),"Этап: Этап работ 48");
 assert.equal(portfolioSearchReason(large,"atlas-visual-fixture/project-5"),
  "Источник: atlas-visual-fixture/project-5");
 assert.equal(portfolioSearchReason(large,"project-5 directory-23"),
  "Каталог: atlas-visual-fixture/project-5 / directory-23");
 assert.equal(portfolioSearchReason(ordinary,"Открыть площадку"),
  "Работа: Открыть площадку");
 assert.equal(portfolioSearchReason(large,"несуществующий"),"");
 assert.equal(portfolioSearchReason(large,""),"");
 assert.equal(serialize(snapshot),original);
});

test("The portfolio table identifies why each project matched without a new store",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/portfolioSearchReason\(p,search\)/);
 assert.match(ui,/portfolioReasons\.get\(p\.id\)/);
 assert.match(ui,/className="atlas-portfolio-match-reason"/);
 assert.match(css,/\.atlas-portfolio-match-reason\{/);
 assert.match(css,/text-overflow:ellipsis/);
});


test("One matching project offers an above-fold explanation and a direct opening action",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const where=ui.indexOf('className="atlas-portfolio-quick-hit"');
 const row=ui.indexOf('className="atlas-portfolio-match-reason"');
 const first=ui.slice(where,where+780);
 assert.ok(where>0&&row>where);
 assert.match(ui,/filtered\.map\(\(p:any\):\[string,string\]=>/);
 assert.match(first,/role="group" aria-label="Найденный проект"/);
 assert.match(first,/portfolioReasons\.get\(filtered\[0\]\.id\)/);
 assert.match(first,/aria-label=\{"Открыть найденный проект "\+filtered\[0\]\.name\}/);
 assert.match(first,/onClick=\{\(\)=>selectProject\(filtered\[0\]\.id\)\}/);
 assert.match(css,/\.atlas-portfolio-quick-hit\{/);
 assert.match(css,/max-width:240px;overflow:hidden;text-overflow:ellipsis/);
});

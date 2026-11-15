import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serialize} from "../src/core.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {buildPortfolioSearchIndex,filterPortfolioSearch,portfolioSearchWorkTarget} from "../src/portfolio-search.mjs";
import {projectWorkTableSearch} from "../src/project-organization.mjs";

const ui=()=>readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
const css=()=>readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");

test("Existing work search reaches many works under a saved stage or catalogue",()=>{
 const data=atlas06VisualPortfolio(),before=serialize(data),project=data.projects[0];
 const index=buildPortfolioSearchIndex(data.projects);
 for(const query of ["Этап работ 48","project-5 directory-23"]){
  const results=filterPortfolioSearch(index,{query});
  assert.deepEqual(results.map(row=>row.id),[project.id]);
  assert.ok(projectWorkTableSearch(project,query).length>0);
  assert.equal(portfolioSearchWorkTarget(project,query),null);
 }
 assert.equal(projectWorkTableSearch(project,"1080 работа 5").length,1);
 assert.equal(serialize(data),before);
});

test("A project or source hit without matching works never gets an empty deep link",()=>{
 const data=atlas06VisualPortfolio(),before=serialize(data);
 const project=structuredClone(data.projects[0]);
 project.items=[];
 const query="atlas-visual-fixture/project-5";
 assert.equal(filterPortfolioSearch(buildPortfolioSearchIndex([project]),{query}).length,1);
 assert.equal(projectWorkTableSearch(project,query).length,0);
 const ownerProject=structuredClone(data.projects[0]);
 ownerProject.owner="Исключительно мой портфель";
 assert.equal(filterPortfolioSearch(buildPortfolioSearchIndex([ownerProject]),
  {query:"Исключительно мой портфель"}).length,1);
 assert.equal(projectWorkTableSearch(ownerProject,"Исключительно мой портфель").length,0);
 assert.equal(serialize(data),before);
});

test("Multiple matching projects can each open only their own matching saved works",()=>{
 const data=atlas06VisualPortfolio(),project=data.projects[0];
 const second=structuredClone(project);second.id="second-research-project";
 const index=buildPortfolioSearchIndex([project,second]);
 const hits=filterPortfolioSearch(index,{query:"1080 работа 5"});
 assert.deepEqual(hits.map(p=>p.id),[project.id,second.id]);
 assert.deepEqual(hits.map(p=>projectWorkTableSearch(p,"1080 работа 5").length),[1,1]);
 assert.equal(hits[0].items.find(w=>w.title==="Работа 5 / 1080")?.id,
  "visual-work-5-1079");
});

test("Portfolio search offers read-only direct routes for one or many matching works",()=>{
 const source=ui(),styles=css();
 assert.match(source,/const portfolioWorkMatches=useMemo\(\(\)=>new Map<string,number>\(/);
 assert.match(source,/projectWorkTableSearch\(p,search\)\.length/);
 assert.match(source,/!portfolioQuickWork&&\(portfolioWorkMatches\.get\(filtered\[0\]\.id\)\|\|0\)>0/);
 assert.match(source,/openPortfolioWorkResults\(filtered\[0\]\.id,search\)/);
 assert.match(source,/openPortfolioWorkResults\(p\.id,search\)/);
 assert.match(source,/className="text-link atlas-portfolio-work-results"/);
 assert.match(source,/Работы по запросу: \{portfolioWorkMatches\.get\(p\.id\)\}/);
 const start=source.indexOf("const openPortfolioWorkResults=");
 const end=source.indexOf("const inspectPortfolioSignal=",start);
 const route=source.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(route,/busyRef\.current\|\|!requireClosedForm\(\)/);
 assert.match(route,/selectProject\(id,true\);setTab\("work"\);setWorkQuery\(query\)/);
 assert.match(route,/setWorkReturnId\(focusWorkId\);setMessage\(""\)/);
 assert.doesNotMatch(route,/\b(?:mutate|invoke|save|applyEditor|setData)\s*\(/);
 assert.match(styles,/\.atlas-portfolio-work-results:focus-visible\{/);
});

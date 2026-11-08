import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {desktopLoadPortfolio} from "./fixtures/desktop-portfolio-120.mjs";
import {validate,serialize,deserialize,editItem} from "../src/core.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {portfolioResources} from "../src/portfolio-resources.mjs";
import {planReviewQueue} from "../src/plan-review.mjs";
import {projectImpact,portfolioImpact} from "../src/impact.mjs";
import {buildPortfolioCommand,filterPortfolioCommand} from "../src/portfolio-command.mjs";
test("R5 reproducible portfolio has the required objects and supports 20 edits",()=>{
 const portfolio=desktopLoadPortfolio(),before=serialize(portfolio);
 assert.equal(portfolio.projects.length,120);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.items.length,0),1200);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.dependencies.length,0),300);
 assert.equal(portfolio.portfolioLinks.length,40);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.findings.length,0),200);
 assert.equal(portfolio.projects.reduce((n,p)=>n+p.decisions.length,0),100);
 const forecast=portfolioSchedule(portfolio);
 assert.equal(forecast.totals.dated,120);
 assert.equal(portfolioResources(portfolio,{schedule:forecast}).people.length,0);
 assert.ok(Array.isArray(planReviewQueue(portfolio).rows));
 let edited=portfolio;
 for(let i=0;i<20;i++)edited=editItem(edited,`load-project-${i}`,`load-work-${i}-0`,{estimateDays:2});
 assert.equal(edited.revision,20);
 assert.equal(validate(edited),true);
 assert.equal(deserialize(serialize(edited)).projects[0].items[0].estimateDays,2);
 assert.equal(serialize(portfolio),before);
});

test("cached 120-project impact lookup matches full domain aggregation for 1200 works",()=>{
 const snapshot=desktopLoadPortfolio();
 const summary=portfolioImpact(snapshot.projects);
 const cache=new Map(snapshot.projects.map(p=>[p.id,projectImpact(p)]));
 assert.equal(cache.size,120);
 assert.equal(summary.rows.length,120);
 for(const entry of summary.rows){
  const v=cache.get(entry.id);
  assert.equal(v.attention,entry.attention);
  assert.equal(v.missingWork,entry.missingWork);
  assert.equal(v.evidenceReview,entry.evidenceReview);
  assert.equal(v.sourceIssues.length,entry.sourceIssues);
 }
 const signatures=new Map([...cache].map(([id,projection])=>[id,projection]));
 for(const query of ["Project","Project 1","Project 11","Project 119","not found",""]){
  const visible=snapshot.projects.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
  for(const p of visible)assert.equal(cache.get(p.id),signatures.get(p.id));
 }
 assert.equal(snapshot.projects.reduce((n,p)=>n+p.items.length,0),1200);
});

test("installed 0.4 uses the real R5 archive, native import approval, readback, search and charts",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-atlas04-scale.py",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/atlas-0-2-1-branding.yml",import.meta.url),"utf8");
 for(const marker of [
  "ATLAS04_SCALE_NATIVE_PICKER_PASS","ATLAS04_SCALE_IMPORT_PRE_SAVE_UNCHANGED_PASS",
  "ATLAS04_SCALE_GUI_IMPORT_PASS projects=120 works=1200",
  "ATLAS04_SCALE_GUI_RESTART_READBACK_PASS","ATLAS04_SCALE_GUI_SEARCH_PASS",
  "ATLAS04_SCALE_GUI_GANTT_DAG_PASS","ATLAS04_SCALE_GUI_ACCEPTED_PASS"
 ])assert.ok(script.includes(marker),marker);
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Заменить портфель в черновике/);
 assert.match(ui,/autoFocus disabled=\{busy\} onClick=\{\(\)=>setPendingImport\(null\)\}/);
 assert.match(script,/keyboard\.send_keys\("\{TAB\}"\)/);
 assert.match(script,/keyboard\.send_keys\("\{ENTER\}"\)/);
 assert.match(script,/"ATLAS_R5_PORTFOLIO_JSON"/);
 assert.match(workflow,/python desktop\/tests\/installed-atlas04-scale\.py/);
 assert.match(workflow,/ATLAS_R5_PORTFOLIO_JSON=\$fixture/);
});

test("0.4 priority queue uses the already computed 120-project impact and CPM projections",()=>{
 const portfolio=desktopLoadPortfolio();
 const now="2026-11-08T14:00:00.000Z";
 const forecasts=portfolioSchedule(portfolio);
 const impacts=new Map(portfolio.projects.map(project=>[project.id,projectImpact(project,{now})]));
 const original=buildPortfolioCommand(portfolio,{now});
 const reused=buildPortfolioCommand(portfolio,{now,impacts,schedules:forecasts});
 assert.deepEqual(reused,original,"Cached and uncached priority, evidence and dates must match");
 assert.equal(reused.rows.length,120);
 const evidence=filterPortfolioCommand(reused,{filter:"evidence"});
 assert.equal(evidence.length,120);
 assert.equal(evidence.slice(0,8).length,8,"React must have a small initial window");
 assert.equal(filterPortfolioCommand(reused,{filter:"evidence",search:"Project 119"}).length,1);
 assert.equal(filterPortfolioCommand(reused,{filter:"sources"}).length,0);
 // UI invokes only navigation into the existing domain tabs, never an apply API.
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/buildPortfolioCommand\(data,\{impacts:impactByProject,schedules:dates\}\)/);
 assert.match(ui,/attentionRows\.slice\(0,attentionLimit\)/);
 assert.match(ui,/inspectPortfolioSignal\(row\.id,row\.primary\)/);
 assert.match(ui,/onClick=\{\(\)=>setAttentionLimit\(n=>Math\.min\(attentionRows\.length,n\+8\)\)\}/);
 assert.match(css,/atlas-command-entry/);
});

test("0.4 project chain is bounded in the desktop and uses current portfolio projection",()=>{
 const queue=buildPortfolioCommand(desktopLoadPortfolio());
 const origin=queue.rows.find(row=>row.id==="load-project-0");
 const target=queue.rows.find(row=>row.id==="load-project-40");
 assert.equal(origin.dependencies.downstreamCount,40);
 assert.deepEqual(target.dependencies.predecessors.map(p=>p.id),["load-project-39"]);
 assert.equal(target.dependencies.downstreamCount,0);
 assert.ok(target.dependencies.inherited.some(c=>c.path.some(p=>p.id==="load-project-0")));
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/atlas-project-relations-detail/);
 assert.match(ui,/aria-expanded=\{showProjectRelations\}/);
 assert.match(ui,/if\(signal\.panel==="relations"\)setShowProjectRelations\(true\)/);
 assert.match(ui,/projectCommand\.dependencies\.inherited\.slice\(0,relationLimit\)/);
});

test("0.4 keeps facts ahead of optional chains and focuses inspected causes",()=>{
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.ok(main.indexOf('className="surface atlas-reality-overview"') <
  main.indexOf('aria-label="Зависимости проекта и влияние на другие проекты"'));
 assert.match(main,/projectCommand\.dependencies\.predecessors\.length>0/);
 assert.match(main,/relationSectionRef\.current/);
 assert.match(main,/scrollIntoView\(\{block:"start",behavior:"auto"\}\)/);
 assert.match(main,/element\.focus\(\{preventScroll:true\}\)/);
 assert.match(main,/setRelationJump\(projectId\)/);
 assert.match(main,/Нет утверждённых требований/);
 assert.match(main,/portfolioCommand\.totals\.missingCriteria/);
});

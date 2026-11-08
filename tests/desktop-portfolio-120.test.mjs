import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {desktopLoadPortfolio} from "./fixtures/desktop-portfolio-120.mjs";
import {validate,serialize,deserialize,editItem} from "../src/core.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {portfolioResources} from "../src/portfolio-resources.mjs";
import {planReviewQueue} from "../src/plan-review.mjs";
import {projectImpact,portfolioImpact} from "../src/impact.mjs";
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
 assert.match(script,/"Заменить портфель в черновике"/);
 assert.match(script,/"ATLAS_R5_PORTFOLIO_JSON"/);
 assert.match(workflow,/python desktop\/tests\/installed-atlas04-scale\.py/);
 assert.match(workflow,/ATLAS_R5_PORTFOLIO_JSON=\$fixture/);
});

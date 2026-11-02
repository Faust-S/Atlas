import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editProject,editItem,serialize,deserialize} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {planChange,decideChange} from "../src/trace.mjs";
import {setPlanWork,applyPlanAmendment,previewPlanAmendment} from "../src/plan-amendment.mjs";
import {portfolioResources,renderPortfolioResources,renderProjectResources} from "../src/portfolio-resources.mjs";

function fixture(){
 const p=createProject(empty(),{name:"Source"}),q=createProject(p.state,{name:"Dependent"});
 let s=editProject(q.state,p.id,{startDate:"2026-11-01"});
 const a=createItem(s,p.id,{title:"Primary",assignee:"QA Team"});
 s=editItem(a.state,p.id,a.id,{estimateDays:3});
 const b=createItem(s,p.id,{title:"Secondary",assignee:" qa  team "});
 s=editItem(b.state,p.id,b.id,{estimateDays:4});
 const c=createItem(s,q.id,{title:"Downstream",assignee:"QA Team"});
 s=editItem(c.state,q.id,c.id,{estimateDays:2});
 s=addPortfolioLink(s,{from:p.id,to:q.id});
 return {state:s,source:p.id,dependent:q.id,first:a.id,second:b.id,third:c.id};
}
test("resource view counts overlap only for current, dated open work and reuses CPM forecast",()=>{
 const f=fixture(),before=serialize(f.state);
 const r=portfolioResources(f.state),owner=r.people[0];
 assert.equal(r.totals.assignees,1);
 assert.equal(r.totals.openWork,3);
 assert.equal(owner.itemCount,3);
 assert.equal(owner.projectCount,2);
 assert.equal(owner.overlapDays,3);
 assert.equal(owner.maxConcurrent,2);
 assert.equal(owner.scheduledDays,9);
 assert.equal(r.totals.potentialConflicts,1);
 assert.equal(r.work.find(x=>x.id===f.third).startDate,"2026-11-05");
 assert.match(renderPortfolioResources(f.state),/QA Team/);
 assert.match(renderProjectResources(f.state,f.source),/Потенциальное пересечение/);
 assert.equal(serialize(f.state),before);
});
test("undated, unassigned and done work stay separate; no fabricated capacity",()=>{
 const f=fixture();
 let s=editItem(f.state,f.source,f.first,{state:"done"});
 s=editItem(s,f.source,f.second,{assignee:""});
 const r=portfolioResources(s);
 assert.equal(r.totals.openWork,2);
 assert.equal(r.totals.assignees,1);
 assert.equal(r.totals.unassigned,1);
 assert.equal(r.totals.potentialConflicts,0);
 const p=createProject(empty(),{name:"No schedule"});
 const task=createItem(p.state,p.id,{title:"Unknown",assignee:"Team A"});
 const unknown=portfolioResources(task.state);
 assert.equal(unknown.totals.undated,1);
 assert.equal(unknown.totals.potentialConflicts,0);
 assert.equal(unknown.people[0].maxConcurrent,0);
 assert.match(unknown.warning,/не подтверждают личность/);
});
test("approved correction shifts projected workload without mutating draft baseline",()=>{
 const f=fixture();
 const c=planChange(f.state,f.source,{title:"Longer primary work"});
 let s=setPlanWork(c.state,f.source,c.id,{itemId:f.first,estimateDays:7,assignee:"QA Team"}).state;
 assert.equal(previewPlanAmendment(s,f.source,c.id).changed,2);
 assert.equal(portfolioResources(s).people[0].overlapDays,3);
 s=decideChange(s,f.source,c.id,{status:"approved",rationale:"Reviewed extra work hours"}).state;
 s=applyPlanAmendment(s,f.source,c.id).state;
 assert.equal(portfolioResources(s).people[0].overlapDays,4);
 assert.equal(portfolioResources(s).work.find(w=>w.id===f.third).startDate,"2026-11-08");
 assert.deepEqual(deserialize(serialize(s)),s);
});
test("HTML escapes source-supplied assignee and work strings",()=>{
 const p=createProject(empty(),{name:"<script>"});
 const t=createItem(p.state,p.id,{title:"<img src=x>",assignee:"<svg onload=alert(1)>"});
 const html=renderProjectResources(t.state,p.id);
 assert.match(html,/&lt;img/);
 assert.match(html,/&lt;svg/);
 assert.doesNotMatch(html,/<svg onload/);
});

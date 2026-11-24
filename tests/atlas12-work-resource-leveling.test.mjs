import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,editProject,createItem,editItem,createWorkCalendar,serialize,deserialize} from "../src/core.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {portfolioResources} from "../src/portfolio-resources.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {capturePlanBaseline} from "../src/plan-baseline.mjs";
import {planChange,decideChange} from "../src/trace.mjs";
import {comparePortfolioPlanSets,applyPortfolioPlanSet,applyPlanAmendment,previewPlanAmendment,setPlanWork} from "../src/plan-amendment.mjs";
import {inspectWorkResourceLeveling,compareWorkResourceLeveling,createWorkResourceLevelingProposals} from "../src/work-resource-leveling.mjs";
import {fixture} from "./fixtures/atlas12-work-resource-leveling.mjs";
const rationale="Монтаж допускается перенести в пределах расчётного резерва.";
const refs=(f,ids=[f.a,f.b],maxDelay=3)=>ids.map(workId=>({projectId:f.projectId,workId,maxDelay}));
const compare=(f,ids=[f.a,f.b],maxDelay=3)=>compareWorkResourceLeveling(f.snapshot,f.resourceId,refs(f,ids,maxDelay));
function draft(f){
 const r=compare(f),result=createWorkResourceLevelingProposals(f.snapshot,r,r.options[0].id,{rationale});
 return {...f,state:result.state,refs:result.refs,option:r.options[0]};
}
function approved(f=fixture()){
 const d=draft(f);let state=d.state;
 for(const ref of d.refs)state=decideChange(state,ref.projectId,ref.changeId,{status:"approved",rationale}).state;
 return {...d,state};
}
test("Resource leveling uses Work reserves, not project start or artificial dependencies",()=>{
 const f=fixture(),raw=serialize(f.snapshot),info=inspectWorkResourceLeveling(f.snapshot,f.resourceId);
 assert.equal(info.before.overloadDays,2);assert.equal(info.candidates.length,2);
 assert.ok(info.candidates.every(w=>w.available&&w.reserveDays===3&&w.maxDelay===3));
 const r=compare(f);
 assert.equal(r.search.space,16);assert.equal(r.search.evaluated,16);assert.equal(r.search.exact,true);
 assert.equal(r.options.length,2);
 const [capacity,minimal]=r.options;
 assert.deepEqual(capacity.vector,[0,2]);assert.equal(capacity.target.overloadDays,0);
 assert.deepEqual(minimal.vector,[0,1]);assert.equal(minimal.target.overloadDays,1);
 assert.equal(capacity.shifts[0].workId,f.b);assert.equal(capacity.shifts[0].beforeReserve,3);
 assert.equal(capacity.shifts[0].afterReserve,1);
 assert.equal(capacity.preview.rows[0].beforeFinish,capacity.preview.rows[0].afterFinish);
 assert.equal(capacity.preview.rows[0].beforeStart,capacity.preview.rows[0].afterStart);
 assert.ok(capacity.preview.workRows.some(w=>w.workId===f.c&&w.shiftDays===2));
 assert.equal(capacity.preview.dependencyRows.length,0);
 assert.equal(capacity.preview.applicationBlocker,null);
 assert.equal(serialize(f.snapshot),raw);
 const reverse=compare(f,[f.b,f.a]);assert.equal(reverse.options[0].shifts[0].workId,f.a);
});
test("Only an ordinary unapproved Work amendment is drafted, saved and applied",async()=>{
 const f=fixture(),d=draft(f),p=d.state.projects[0],before=f.snapshot.projects[0];
 assert.equal(d.refs.length,1);assert.deepEqual(p.items,before.items);assert.deepEqual(p.dependencies,before.dependencies);
 assert.deepEqual(p.planBaselines,before.planBaselines);assert.deepEqual(p.decisions,before.decisions);
 const proposal=p.changes.at(-1),a=proposal.planAmendments[0];
 assert.equal(proposal.status,"proposed");assert.equal(a.kind,"work");assert.equal(a.itemId,f.b);
 assert.equal(a.before.notBeforeDate,null);assert.equal(a.after.notBeforeDate,"2026-11-25");
 assert.deepEqual(a.levelingGuard,{resourceId:f.resourceId,sourceStart:"2026-11-23",maxDelay:3,preserveDeadlines:true});
 for(const k of ["estimateDays","assignee","dueDate","resourceId","allocationPct"])assert.equal(a.before[k],a.after[k]);
 assert.throws(()=>applyPlanAmendment(d.state,f.projectId,proposal.id),/утвержд/);
 const approved=decideChange(d.state,f.projectId,proposal.id,{status:"approved",rationale}).state;
 const applied=applyPlanAmendment(approved,f.projectId,proposal.id).state;
 assert.equal(portfolioResources(applied).byId.get(f.resourceId).overloadDays,0);
 const expected=structuredClone(before.items);expected.find(w=>w.id===f.b).notBeforeDate="2026-11-25";
 assert.deepEqual(applied.projects[0].items,expected);assert.deepEqual(applied.projects[0].dependencies,before.dependencies);
 assert.deepEqual(applied.projects[0].planBaselines,before.planBaselines);
 assert.equal(applied.projects[0].startDate,before.startDate);assert.equal(applied.projects[0].dueDate,before.dueDate);
 assert.deepEqual(deserialize(serialize(applied)),applied);
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../desktop/src/iwxa-portfolio.mjs");
 const archive=await buildIwxaPortfolio(applied,{now:"2026-11-24T12:00:00.000Z"});
 assert.deepEqual((await readIwxaPortfolio(archive)).snapshot,applied);
});
test("Unrelated begun Work stays fixed, but an already begun successor blocks a shift",()=>{
 const f=fixture();
 let s=editItem(f.snapshot,f.projectId,f.a,{state:"in_progress",actualStartDate:"2026-11-23"});
 const info=inspectWorkResourceLeveling(s,f.resourceId);
 assert.equal(info.candidates.find(w=>w.workId===f.a).available,false);
 assert.equal(info.candidates.find(w=>w.workId===f.b).available,true);
 const result=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.b]));
 assert.equal(result.options[0].target.overloadDays,0);
 s=editItem(s,f.projectId,f.c,{state:"done",actualStartDate:"2026-11-25",actualFinishDate:"2026-11-26"});
 const blocked=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.b]));
 assert.equal(blocked.options.length,0);
 assert.equal(blocked.search.reasons.fixedWorkMoved,3);
 assert.ok(blocked.search.fixedWorks.some(w=>w.workId===f.c));
});
test("Pinned calendar can make an apparent one-day delay exceed the allowed actual displacement",()=>{
 const f=fixture({start:"2026-11-20",duration:2,criticalDuration:8});
 const cal=createWorkCalendar(f.snapshot,{name:"Пятидневка",weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],source:{kind:"entered_by_user",reference:null}});
 const s=editItem(cal.state,f.projectId,f.b,{durationUnit:"working_days",calendarBasis:{id:cal.id,version:cal.version}});
 const bad=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.b],1));
 assert.equal(bad.options.length,0);assert.equal(bad.search.reasons.reserveExceeded,1);
 const good=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.b],3));
 assert.equal(good.options[0].target.overloadDays,0);assert.equal(good.options[0].shifts[0].days,3);
 assert.equal(good.options[0].shifts[0].afterStart,"2026-11-23");
});
test("Known Work deadlines cannot be worsened even when project finish is unchanged",()=>{
 const f=fixture(),s=editItem(f.snapshot,f.projectId,f.b,{dueDate:"2026-11-25"});
 const r=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.b]));
 assert.equal(r.options.length,0);assert.equal(r.search.reasons.deadlineWorse,3);
});
test("All guarded conditions are rechecked after approval, including changed reserve, actual and source dates",()=>{
 const f=approved(),ref=f.refs[0];
 const started=editItem(f.state,f.projectId,f.b,{state:"in_progress"});
 assert.throws(()=>applyPlanAmendment(started,f.projectId,ref.changeId),/уже начатой/);
 const short=editItem(f.state,f.projectId,f.critical,{estimateDays:4});
 assert.match(previewPlanAmendment(short,f.projectId,ref.changeId).applicationBlocker,/расчётные даты проекта/);
 assert.throws(()=>applyPlanAmendment(short,f.projectId,ref.changeId),/расчётные даты проекта/);
 const changed=editProject(f.state,f.projectId,{startDate:"2026-11-24"});
 assert.match(previewPlanAmendment(changed,f.projectId,ref.changeId).applicationBlocker,/Исходное начало/);
 const fixed=editItem(f.state,f.projectId,f.c,{state:"done"});
 assert.match(previewPlanAmendment(fixed,f.projectId,ref.changeId).applicationBlocker,/начатую или завершённую/);
});
test("Resource interference and stale/tampered previews are not accepted",()=>{
 const f=fixture(),r=compare(f);
 const changed=structuredClone(f.snapshot);changed.projects[0].goal="Новая редакция";
 assert.throws(()=>createWorkResourceLevelingProposals(changed,r,r.options[0].id,{rationale}),/Портфель изменился/);
 const tampered=structuredClone(r);tampered.options[0].shifts[0].afterStart="2026-12-01";
 assert.throws(()=>createWorkResourceLevelingProposals(f.snapshot,tampered,r.options[0].id,{rationale}),/Последствия варианта изменились/);
 const a=approved(f),ref=a.refs[0],p=createProject(a.state,{name:"Новый независимый заказ"});
 let s=editProject(p.state,p.id,{startDate:"2026-11-25",dueDate:"2026-12-15"});
 const w=createItem(s,p.id,{title:"Площадка занята",resourceId:f.resourceId,allocationPct:60});
 s=editItem(w.state,p.id,w.id,{estimateDays:2});
 const preview=previewPlanAmendment(s,f.projectId,ref.changeId);
 assert.match(preview.applicationBlocker,/больше не уменьшает/);
 assert.throws(()=>applyPlanAmendment(s,f.projectId,ref.changeId),/больше не уменьшает/);
});
test("Multiple selected Works of one project form a single ordinary proposal",()=>{
 const f=fixture({criticalDuration:8});
 const w=createItem(f.snapshot,f.projectId,{title:"Монтаж В",resourceId:f.resourceId,allocationPct:60});
 const s=editItem(w.state,f.projectId,w.id,{estimateDays:2});
 const r=compareWorkResourceLeveling(s,f.resourceId,refs(f,[f.a,f.b,w.id],4));
 assert.deepEqual(r.options[0].vector,[0,2,4]);assert.equal(r.options[0].target.overloadDays,0);
 const d=createWorkResourceLevelingProposals(s,r,r.options[0].id,{rationale});
 assert.equal(d.refs.length,1);assert.equal(d.state.projects[0].changes.at(-1).planAmendments.length,2);
});
test("Portfolio Work shifts use normal coordinated approvals and atomic application",()=>{
 const r=addPlanningResource(empty(),{label:"Общая площадка",capacityPct:100});
 let s=r.state;const refs=[];
 for(let i=0;i<3;i++){
  const p=createProject(s,{name:"Заказ "+(i+1),type:"engineering"});
  s=editProject(p.state,p.id,{startDate:"2026-11-23",dueDate:"2026-12-10"});
  const w=createItem(s,p.id,{title:"Монтаж",resourceId:r.id,allocationPct:60});
  s=editItem(w.state,p.id,w.id,{estimateDays:2});
  const q=createItem(s,p.id,{title:"Длительная подготовка"});
  s=editItem(q.state,p.id,q.id,{estimateDays:8});
  s=capturePlanBaseline(s,p.id,{name:"Исходный"}).state;refs.push({projectId:p.id,workId:w.id,maxDelay:4});
 }
 const comparison=compareWorkResourceLeveling(s,r.id,refs);
 assert.equal(comparison.search.exact,true);assert.deepEqual(comparison.options[0].vector,[0,2,4]);
 const d=createWorkResourceLevelingProposals(s,comparison,comparison.options[0].id,{rationale});
 assert.equal(d.refs.length,2);
 let state=d.state;
 for(const ref of d.refs)state=decideChange(state,ref.projectId,ref.changeId,{status:"approved",rationale}).state;
 const joint=comparePortfolioPlanSets(state,d.refs);
 assert.equal(joint.options[0].canApply,true);
 const applied=applyPortfolioPlanSet(state,joint,"A",{rationale}).state;
 assert.equal(portfolioResources(applied).byId.get(r.id).overloadDays,0);
 assert.equal(applied.revision,state.revision+1);
 for(const p of applied.projects){
  const b=s.projects.find(q=>q.id===p.id);
  assert.equal(p.startDate,b.startDate);assert.equal(p.dueDate,b.dueDate);assert.deepEqual(p.planBaselines,b.planBaselines);
 }
});
test("A guarded proposal cannot be silently edited or mixed with other kinds of changes",()=>{
 const f=draft(fixture()),ref=f.refs[0];
 assert.throws(()=>setPlanWork(f.state,f.projectId,ref.changeId,{itemId:f.b,estimateDays:3,notBeforeDate:"2026-11-25"}),/без нового расчёта/);
 const change=planChange(f.state,f.projectId,{title:"Отдельная правка"});
 const state=setPlanWork(change.state,f.projectId,ref.changeId,{itemId:f.a,estimateDays:1}).state;
 assert.match(previewPlanAmendment(state,f.projectId,ref.changeId).applicationBlocker,/отдельного состава/);
});

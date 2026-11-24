import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,editProject,createItem,editItem,serialize,deserialize} from "../src/core.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {portfolioResources,comparePlanningResourceScopes} from "../src/portfolio-resources.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {decideChange} from "../src/trace.mjs";
import {applyPlanAmendment,comparePortfolioPlanSets} from "../src/plan-amendment.mjs";
import {resourceConflictEntry,resourceConflictPage,inspectResourceConflictResolution,compareResourceConflictResolution,createResourceConflictProposals} from "../src/resource-conflict-resolution.mjs";
import {fixture,choice} from "./fixtures/atlas12-resource-conflict-resolution.mjs";
const rationale="Допустимый способ снижения нагрузки выбранного участка.";
const compare=(f,overrides={})=>compareResourceConflictResolution(f.snapshot,f.resourceId,choice(f,overrides));
const selected=(r,id)=>r.options.find(o=>o.id===id);
const create=(f,r,id,extra={})=>createResourceConflictProposals(f.snapshot,r,id,{rationale,...extra});

test("All explicitly enabled methods share one current portfolio and exact selected Works",()=>{
 const f=fixture(),raw=serialize(f.snapshot),model=inspectResourceConflictResolution(f.snapshot,f.resourceId);
 assert.equal(model.participants.length,2);
 assert.ok(model.participants.every(w=>w.overloadDays===2&&w.maxWorkDelay===3));
 assert.equal(model.alternatives.length,2);assert.equal(model.current.overloadDays,2);
 const r=compare(f);
 assert.equal(r.options.length,6);assert.equal(r.options.filter(o=>o.valid).length,5);
 assert.equal(r.options.filter(o=>o.canDraft).length,5);
 const assign=selected(r,"assignment"),shift=selected(r,"work-shift-capacity"),minimal=selected(r,"work-shift-minimal");
 const sequence=selected(r,"sequence-1"),project=selected(r,"project-shift-none");
 assert.equal(assign.kind,"assignment");assert.equal(shift.kind,"work_shift");assert.equal(sequence.kind,"sequence");
 assert.equal(project.valid,false);assert.match(project.reason,/нет допустимого/);
 for(const o of r.options.filter(o=>o.valid)){
  assert.deepEqual(o.source.before,model.current);
  assert.deepEqual(o.preview.resourceBefore,model.portfolio);
  assert.equal(o.focus[0].workId,f.a);assert.equal(o.focus[1].workId,f.b);
  assert.equal(o.focus[0].before.overloadDays,2);
  assert.equal(o.preview.rows.length,2);
  assert.equal(o.preview.fixedWorkDeadlines.changedDeadline,0);
 }
 assert.equal(assign.source.after.overloadDays,0);assert.equal(assign.focus[0].after.resourceId,f.free);
 assert.equal(assign.focus[0].after.overloadDays,0);assert.equal(assign.preview.changed,0);
 assert.equal(shift.source.after.overloadDays,0);assert.equal(shift.focus[0].after.overloadDays,0);
 assert.equal(shift.preview.changed,0);assert.equal(shift.changes.shifts[0].workId,f.b);
 assert.equal(minimal.source.after.overloadDays,1);
 assert.equal(sequence.preview.dependencyRows.length,1);assert.equal(sequence.requiresTechnologyConfirmation,true);
 assert.equal(sequence.source.after.overloadDays,0);assert.equal(sequence.preview.changed,0);
 assert.equal(assign.classification,"FOCUS_CLEARED");assert.equal(shift.classification,"FOCUS_CLEARED");
 assert.equal(minimal.classification,"RELIEVED");assert.equal(serialize(f.snapshot),raw);
});
test("The chosen assignment alone becomes a normal proposal; full plan and baselines are unchanged until approval",async()=>{
 const f=fixture(),r=compare(f),d=create(f,r,"assignment"),old=f.snapshot.projects[0],p=d.state.projects[0];
 assert.equal(d.refs.length,1);assert.deepEqual(p.items,old.items);assert.deepEqual(p.dependencies,old.dependencies);
 assert.deepEqual(p.planBaselines,old.planBaselines);assert.deepEqual(p.decisions,old.decisions);
 assert.deepEqual(d.state.projects[1],f.snapshot.projects[1]);
 const c=p.changes.at(-1),a=c.planAmendments[0];
 assert.equal(c.status,"proposed");assert.equal(c.planAmendments.length,1);
 assert.equal(a.kind,"work");assert.equal(a.itemId,f.a);assert.equal(a.after.resourceId,f.free);
 assert.ok(!a.levelingGuard);assert.match(c.description,/Выбранный конфликт/);
 assert.throws(()=>applyPlanAmendment(d.state,f.projectId,c.id),/утвержд/);
 const approved=decideChange(d.state,f.projectId,c.id,{status:"approved",rationale}).state;
 const applied=applyPlanAmendment(approved,f.projectId,c.id).state;
 assert.equal(portfolioResources(applied).byId.get(f.resourceId).overloadDays,0);
 assert.deepEqual(applied.projects[0].dependencies,old.dependencies);
 assert.deepEqual(applied.projects[0].planBaselines,old.planBaselines);
 assert.equal(portfolioSchedule(applied).byId.get(f.projectId).projectedFinish,portfolioSchedule(f.snapshot).byId.get(f.projectId).projectedFinish);
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../desktop/src/iwxa-portfolio.mjs");
 const archive=await buildIwxaPortfolio(applied,{now:"2026-11-24T13:00:00.000Z"});
 assert.deepEqual((await readIwxaPortfolio(archive)).snapshot,applied);
 assert.deepEqual(deserialize(serialize(applied)),applied);
});
test("A transferred conflict is a compromise even if the source is cleared and the aggregate number of conflict days is unchanged",()=>{
 const f=fixture(),r=compare(f,{targetResourceIds:[f.busy],workDelayDays:0,projectDelayDays:0,allowSequence:false}),o=selected(r,"assignment");
 assert.equal(o.source.after.overloadDays,0);
 assert.equal(o.focus[0].before.overloadDays,2);assert.equal(o.focus[0].after.overloadDays,2);
 assert.equal(o.focus[0].after.resourceId,f.busy);
 assert.equal(o.assessment.warnings.newConflictWork,1);
 assert.equal(o.preview.resourceBefore.overloadDays,o.preview.resourceAfter.overloadDays);
 assert.equal(o.tradeoff,true);assert.equal(o.classification,"TRADEOFF");assert.equal(o.canDraft,true);
 assert.throws(()=>create(f,r,"assignment"),/Подтвердите известные/);
 const d=create(f,r,"assignment",{confirmTradeoff:true});
 assert.match(d.state.projects[0].changes.at(-1).description,/подтвердил известный компромисс/);
});
test("A technology decision requires explicit confirmation; a reserve choice preserves its original guard",()=>{
 const f=fixture(),r=compare(f);
 assert.throws(()=>create(f,r,"sequence-1"),/технологическую допустимость/);
 const s=create(f,r,"sequence-1",{confirmTechnology:true,confirmTradeoff:true});
 const a=s.state.projects[0].changes.at(-1).planAmendments;
 assert.deepEqual(a,[{kind:"dependency",from:f.a,to:f.b,before:false,after:true}]);
 assert.deepEqual(s.state.projects[0].dependencies,f.snapshot.projects[0].dependencies);
 const d=create(f,r,"work-shift-capacity");
 const shift=d.state.projects[0].changes.at(-1).planAmendments[0];
 assert.equal(shift.itemId,f.b);assert.equal(shift.after.notBeforeDate,"2026-11-25");
 assert.equal(shift.levelingGuard.sourceStart,"2026-11-23");
 assert.equal(shift.levelingGuard.preserveDeadlines,true);
 assert.equal(shift.before.resourceId,shift.after.resourceId);
 assert.deepEqual(d.state.projects[0].items,f.snapshot.projects[0].items);
});
test("Only actual conflicting participants are selectable; unstarted eligibility is not inferred",()=>{
 const f=fixture();
 assert.throws(()=>compare(f,{focus:{projectId:f.projectId,workId:f.critical}}),/участвующие в известных/);
 assert.throws(()=>compare(f,{companion:{projectId:f.projectId,workId:f.a}}),/разные работы/);
 assert.throws(()=>compare(f,{targetResourceIds:[f.resourceId]}),/другой существующий/);
 assert.throws(()=>compare(f,{workDelayDays:8}),/от 0 до 7/);
 const started={...f,snapshot:editItem(f.snapshot,f.projectId,f.a,{state:"in_progress",actualStartDate:"2026-11-23"})};
 const r=compare(started);
 assert.equal(selected(r,"assignment").valid,false);
 assert.equal(selected(r,"sequence-none").valid,false);
 assert.equal(selected(r,"work-shift-capacity").canDraft,true);
 assert.equal(selected(r,"work-shift-capacity").changes.shifts[0].workId,f.b);
 const fixed={...f,snapshot:editItem(f.snapshot,f.projectId,f.c,{state:"done",actualStartDate:"2026-11-25",actualFinishDate:"2026-11-26"})};
 const r2=compare(fixed);
 assert.equal(selected(r2,"work-shift-none").valid,false);
 assert.equal(selected(r2,"sequence-1").canDraft,false);
 assert.match(selected(r2,"sequence-1").blocker,/начатых или недоступных/);
 assert.equal(selected(r2,"assignment").canDraft,true);
});
test("Cross-project conflict can use project shifts but cannot invent a Work dependency",()=>{
 const f=fixture(),s=editItem(f.snapshot,f.otherProject,f.otherWork,{resourceId:f.resourceId,allocationPct:60});
 const next={...f,snapshot:s};
 const r=compare(next,{targetResourceIds:[],workDelayDays:0,projectDelayDays:3,
  focus:{projectId:f.otherProject,workId:f.otherWork},companion:{projectId:f.projectId,workId:f.a}});
 assert.equal(selected(r,"sequence-none").valid,false);
 assert.match(selected(r,"sequence-none").reason,/Межпроектная связь/);
 const o=r.options.find(o=>o.kind==="project_shift"&&o.canDraft);
 assert.ok(o);assert.ok(o.source.after.overloadPctDays<o.source.before.overloadPctDays);
 assert.equal(o.preview.dependencyRows.length,0);
 const d=create(next,r,o.id,{confirmTradeoff:true});
 assert.ok(d.refs.every(ref=>d.state.projects.find(p=>p.id===ref.projectId).changes.at(-1).planAmendments.every(a=>a.kind==="dates"&&a.levelingGuard)));
});
test("Stale, substituted and unconfirmed comparisons cannot prepare different proposals",()=>{
 const f=fixture(),r=compare(f);
 const changed=structuredClone(f.snapshot);changed.projects[0].goal="Same revision, different content";
 assert.throws(()=>createResourceConflictProposals(changed,r,"assignment",{rationale}),/Портфель изменился/);
 const tampered=structuredClone(r);selected(tampered,"assignment").focus[0].after.overloadDays=5;
 assert.throws(()=>create(f,tampered,"assignment"),/Последствия варианта изменились/);
 assert.throws(()=>create(f,r,"project-shift-none"),/доступный рассчитанный/);
});
test("Exact focus information survives the eight-example limit and never reports unknown dates as zero conflict",()=>{
 const r=addPlanningResource(empty(),{label:"Мощность 100",capacityPct:100}),
  q=addPlanningResource(r.state,{label:"Мощность 1000",capacityPct:1000});
 const p=createProject(q.state,{name:"Двенадцать операций"});
 let s=editProject(p.state,p.id,{startDate:"2026-11-23"}),ids=[];
 for(let i=0;i<12;i++){
  const w=createItem(s,p.id,{title:"Операция "+String(i).padStart(2,"0"),resourceId:r.id,allocationPct:20});
  s=editItem(w.state,p.id,w.id,{estimateDays:2});ids.push(w.id);
 }
 const before=portfolioResources(s),focusWorks=[{projectId:p.id,workId:ids[11]}];
 let next=s;for(const id of ids)next=editItem(next,p.id,id,{resourceId:q.id});
 const result=comparePlanningResourceScopes(before,portfolioResources(next),[p.id],{focusWorks});
 assert.equal(result.workChanges.examples.length,8);assert.ok(!result.workChanges.examples.some(w=>w.workId===ids[11]));
 const f=result.workChanges.focus[0];assert.equal(f.before.overloadDays,2);assert.equal(f.after.overloadDays,0);
 assert.equal(f.after.resourceId,q.id);assert.equal(f.clearedConflictDays,2);
 const undated=editProject(s,p.id,{startDate:null});
 const unknown=comparePlanningResourceScopes(before,portfolioResources(undated),[p.id],{focusWorks}).workChanges.focus[0];
 assert.equal(unknown.after.known,false);assert.equal(unknown.after.overloadDays,null);
 assert.equal(unknown.after.unavailableDays,null);
});
test("Focused portfolio comparison does not mutate or replace the ordinary amendment projection",()=>{
 const f=fixture(),r=compare(f),d=create(f,r,"assignment");
 const normal=comparePortfolioPlanSets(d.state,d.refs).options[0],focused=comparePortfolioPlanSets(d.state,d.refs,null,{focusWorks:[choice(f).focus]}).options[0];
 assert.ok(!normal.preview.resourceScope.workChanges.focus);
 assert.equal(focused.preview.resourceScope.workChanges.focus.length,1);
 delete focused.preview.resourceScope.workChanges.focus;
 assert.deepEqual(focused.preview,normal.preview);
 assert.deepEqual(focused.assessment,normal.assessment);
});

test("Direct conflict entry uses the exact current project/Work identity and does not silently choose a replacement",()=>{
 const f=fixture(),view=portfolioResources(f.snapshot);
 const entry=resourceConflictEntry(view,f.resourceId,{projectId:f.projectId,workId:f.b});
 assert.deepEqual(entry,{resourceId:f.resourceId,focus:{projectId:f.projectId,workId:f.b}});
 assert.throws(()=>resourceConflictEntry(view,f.resourceId,{projectId:f.otherProject,workId:f.b}),/больше не участвует/);
 assert.throws(()=>resourceConflictEntry(view,f.resourceId,{projectId:f.projectId,workId:f.critical}),/больше не участвует/);
 assert.throws(()=>resourceConflictEntry(view,f.free),/нет известного конфликта/);
 const next=editItem(f.snapshot,f.projectId,f.b,{resourceId:f.free});
 assert.throws(()=>resourceConflictEntry(portfolioResources(next),f.resourceId,entry.focus),/нет известного конфликта/);
});
test("Direct resource navigation preserves bounded paging even for a resource beyond the first page",()=>{
 const rows=Array.from({length:80},(_,i)=>({id:String(i),label:"Участок "+i}));
 const page=resourceConflictPage(rows,40,"71");
 assert.equal(page.length,40);assert.equal(page[0],rows[71]);assert.equal(new Set(page.map(r=>r.id)).size,40);
 assert.deepEqual(resourceConflictPage(rows,80,"71"),rows);
 assert.deepEqual(resourceConflictPage(rows,40,"missing"),rows.slice(0,40));
});

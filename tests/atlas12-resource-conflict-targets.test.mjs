import test from "node:test";
import assert from "node:assert/strict";
import {fixture,choice} from "./fixtures/atlas12-resource-conflict-resolution.mjs";
import {compareResourceConflictResolution,createResourceConflictProposals} from "../src/resource-conflict-resolution.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {editItem,serialize} from "../src/core.mjs";
import {decideChange} from "../src/trace.mjs";
import {applyPlanAmendment} from "../src/plan-amendment.mjs";
import {portfolioResources} from "../src/portfolio-resources.mjs";
const rationale="Допустимость выбранной бригады подтверждена владельцем.";
const onlyAssignments=(f,ids)=>choice(f,{targetResourceIds:ids,workDelayDays:0,projectDelayDays:0,allowSequence:false});
test("Compare three independent candidate resources on the same portfolio without transferring a conflict unnoticed",()=>{
 const f=fixture(),third=addPlanningResource(f.snapshot,{label:"Вторая свободная бригада",capacityPct:100});
 const s=third.state,before=serialize(s);
 const r=compareResourceConflictResolution(s,f.resourceId,onlyAssignments(f,[f.free,f.busy,third.id]));
 assert.equal(r.options.length,3);
 assert.deepEqual(r.options.map(o=>o.id),["assignment","assignment-2","assignment-3"]);
 assert.deepEqual(r.options.map(o=>o.changes.resourceId),[f.free,f.busy,third.id]);
 assert.deepEqual(r.options.map(o=>o.classification),["FOCUS_CLEARED","TRADEOFF","FOCUS_CLEARED"]);
 for(const o of r.options){
  assert.ok(o.valid&&o.canDraft);
  assert.deepEqual(o.source.before,r.baseline.current);
  assert.deepEqual(o.preview.resourceBefore,r.baseline.portfolio);
  assert.equal(o.source.after.overloadDays,0);
 }
 assert.equal(r.options[1].focus[0].after.overloadDays,2);
 assert.throws(()=>createResourceConflictProposals(s,r,"assignment-2",{rationale}),/Подтвердите известные/);
 for(const [id,target] of [["assignment-2",f.busy],["assignment-3",third.id]]){
  const d=createResourceConflictProposals(s,r,id,{rationale,confirmTradeoff:true});
  assert.equal(d.refs.length,1);
  const p=d.state.projects.find(p=>p.id===d.refs[0].projectId);
  const c=p.changes.find(c=>c.id===d.refs[0].changeId);
  assert.equal(c.status,"proposed");assert.equal(c.planAmendments.length,1);
  assert.equal(c.planAmendments[0].after.resourceId,target);
  assert.equal(c.planAmendments[0].itemId,f.a);
  assert.deepEqual(p.items,s.projects.find(x=>x.id===p.id).items);
  assert.equal(d.state.projects.flatMap(p=>p.changes??[]).length,s.projects.flatMap(p=>p.changes??[]).length+1);
 }
 assert.equal(serialize(s),before);
});
test("Reject duplicate, source, unavailable and excess target resources",()=>{
 const f=fixture();
 for(const ids of [[f.free,f.free],[f.free,f.busy,"unknown","another"]])
  assert.throws(()=>compareResourceConflictResolution(f.snapshot,f.resourceId,onlyAssignments(f,ids)),/трёх разных/);
 for(const ids of [[f.resourceId],["unknown"]])
  assert.throws(()=>compareResourceConflictResolution(f.snapshot,f.resourceId,onlyAssignments(f,ids)),/другой существующий/);
 const r=compareResourceConflictResolution(f.snapshot,f.resourceId,onlyAssignments(f,[f.free,f.busy]));
 r.options[1].changes.resourceId=f.free;
 assert.throws(()=>createResourceConflictProposals(f.snapshot,r,"assignment-2",{rationale,confirmTradeoff:true}),/Последствия варианта изменились/);
});

test("Both selected Works can have independent assignment alternatives on the same current portfolio",()=>{
 const f=fixture(),third=addPlanningResource(f.snapshot,{label:"Вторая свободная бригада",capacityPct:100});
 const s=third.state,raw=serialize(s);
 const r=compareResourceConflictResolution(s,f.resourceId,choice(f,{
  targetResourceIds:[f.free,f.busy,third.id],companionTargetResourceIds:[f.free,f.busy,third.id],
  workDelayDays:0,projectDelayDays:0,allowSequence:false
 }));
 assert.equal(r.options.length,6);
 assert.deepEqual(r.options.map(o=>o.id),["assignment","assignment-2","assignment-3",
  "companion-assignment","companion-assignment-2","companion-assignment-3"]);
 assert.deepEqual(r.options.map(o=>o.changes.workId),[f.a,f.a,f.a,f.b,f.b,f.b]);
 assert.deepEqual(r.options.map(o=>o.classification),["FOCUS_CLEARED","TRADEOFF","FOCUS_CLEARED",
  "FOCUS_CLEARED","TRADEOFF","FOCUS_CLEARED"]);
 for(const o of r.options){
  assert.ok(o.canDraft);
  assert.deepEqual(o.source.before,r.baseline.current);
  assert.deepEqual(o.preview.resourceBefore,r.baseline.portfolio);
 }
 const o=r.options[3];
 assert.equal(o.focus[0].after.resourceId,f.resourceId);
 assert.equal(o.focus[1].after.resourceId,f.free);
 assert.equal(o.focus[0].after.overloadDays,0);
 assert.equal(o.focus[1].after.overloadDays,0);
 assert.equal(r.options[4].companionEffect.improved,false);
 assert.equal(r.options[4].tradeoff,true);
 assert.throws(()=>createResourceConflictProposals(s,r,"companion-assignment-2",{rationale}),/Подтвердите известные/);
 const d=createResourceConflictProposals(s,r,"companion-assignment-3",{rationale});
 const p=d.state.projects.find(p=>p.id===f.projectId),a=p.changes.at(-1).planAmendments;
 assert.equal(d.refs.length,1);assert.equal(a.length,1);assert.equal(a[0].itemId,f.b);assert.equal(a[0].after.resourceId,third.id);
 assert.deepEqual(p.items,s.projects.find(x=>x.id===f.projectId).items);
 assert.equal(serialize(s),raw);
});
test("A started focal Work remains fixed while an unstarted competing Work is reassigned, approved and applied",()=>{
 const f=fixture(),s=editItem(f.snapshot,f.projectId,f.a,{state:"in_progress",actualStartDate:"2026-11-23"});
 const raw=serialize(s),p=s.projects.find(p=>p.id===f.projectId);
 const input=choice(f,{targetResourceIds:[f.free],companionTargetResourceIds:[f.free],
  workDelayDays:0,projectDelayDays:0,allowSequence:false});
 const r=compareResourceConflictResolution(s,f.resourceId,input);
 assert.equal(r.options[0].valid,false);
 const o=r.options[1];assert.equal(o.id,"companion-assignment");assert.ok(o.canDraft);
 assert.equal(o.focus[0].before.resourceId,o.focus[0].after.resourceId);
 assert.equal(o.focus[0].after.overloadDays,0);
 const d=createResourceConflictProposals(s,r,o.id,{rationale});
 const draft=d.state.projects.find(x=>x.id===f.projectId);
 assert.deepEqual(draft.items,p.items);assert.deepEqual(draft.planBaselines,p.planBaselines);
 const c=draft.changes.at(-1);assert.equal(c.planAmendments[0].itemId,f.b);
 const approved=decideChange(d.state,f.projectId,c.id,{status:"approved",rationale}).state;
 const applied=applyPlanAmendment(approved,f.projectId,c.id).state;
 const result=applied.projects.find(x=>x.id===f.projectId);
 assert.deepEqual(result.items.find(x=>x.id===f.a),p.items.find(x=>x.id===f.a));
 assert.equal(result.items.find(x=>x.id===f.b).resourceId,f.free);
 assert.equal(portfolioResources(applied).byId.get(f.resourceId).overloadDays,0);
 assert.deepEqual(result.planBaselines,p.planBaselines);
 assert.deepEqual(result.dependencies,p.dependencies);
 assert.equal(serialize(s),raw);
});
test("Companion targets require an exact eligible second Work and do not substitute a different assignment",()=>{
 const f=fixture(),input=choice(f,{targetResourceIds:[],companionTargetResourceIds:[f.free],
  workDelayDays:0,projectDelayDays:0,allowSequence:false});
 assert.throws(()=>compareResourceConflictResolution(f.snapshot,f.resourceId,{...input,companion:null}),/выберите вторую/);
 assert.throws(()=>compareResourceConflictResolution(f.snapshot,f.resourceId,{...input,companionTargetResourceIds:[f.free,f.free]}),/трёх разных/);
 assert.throws(()=>compareResourceConflictResolution(f.snapshot,f.resourceId,{...input,companionTargetResourceIds:[f.resourceId]}),/другой существующий/);
 const started=editItem(f.snapshot,f.projectId,f.b,{state:"in_progress",actualStartDate:"2026-11-23"});
 const unavailable=compareResourceConflictResolution(started,f.resourceId,input).options[0];
 assert.equal(unavailable.valid,false);assert.equal(unavailable.canDraft,false);
 const r=compareResourceConflictResolution(f.snapshot,f.resourceId,input);
 r.options[0].changes.workId=f.a;
 assert.throws(()=>createResourceConflictProposals(f.snapshot,r,"companion-assignment",{rationale}),/Последствия варианта изменились/);
});


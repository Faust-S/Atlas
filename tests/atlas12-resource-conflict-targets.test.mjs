import test from "node:test";
import assert from "node:assert/strict";
import {fixture,choice} from "./fixtures/atlas12-resource-conflict-resolution.mjs";
import {compareResourceConflictResolution,createResourceConflictProposals} from "../src/resource-conflict-resolution.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {serialize} from "../src/core.mjs";
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
  assert.equal(d.state.projects.flatMap(p=>p.changes).length,s.projects.flatMap(p=>p.changes).length+1);
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

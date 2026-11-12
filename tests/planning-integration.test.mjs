import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,createItem,editItem,connect,editProject,serialize,deserialize} from '../src/core.mjs';
import {scheduleProject,scheduleChangeSummary} from '../src/planning.mjs';
test('full Atlas project → scheduled work → saved/reopened plan',()=>{
  const p=createProject(empty(),{name:'Office move',type:'business'}),a=createItem(p.state,p.id,{title:'Design'});
  const b=createItem(a.state,p.id,{title:'Move'}),c=connect(b.state,p.id,a.id,b.id);
  const d=editItem(c,p.id,a.id,{estimateDays:3}),e=editItem(d,p.id,b.id,{estimateDays:4});
  const f=editProject(e,p.id,{startDate:'2026-11-01'});
  const restored=deserialize(serialize(f));
  const result=scheduleProject(restored.projects[0]);
  assert.equal(result.durationDays,7);
  assert.equal(result.estimatedFinish,'2026-11-08');
  assert.equal(result.criticalIds.length,2);
  assert.equal(result.rows.find(x=>x.id===b.id).blockedBy[0],a.id);
});
test('legacy projects without estimateDays retain a one-day scheduling default',()=>{
  const p=createProject(empty(),{name:'Legacy',type:'personal'});
  const a=createItem(p.state,p.id,{title:'Old item'});
  const legacy=deserialize(serialize(a.state));
  delete legacy.projects[0].items[0].estimateDays;
  assert.equal(scheduleProject(legacy.projects[0]).durationDays,1);
});
test('validated duration cannot be negative, fractional or out of bound',()=>{
  const p=createProject(empty(),{name:'Numbers'}),a=createItem(p.state,p.id,{title:'Task'});
  for(const n of [-1,0.25,36501,Number.NaN])assert.throws(()=>editItem(a.state,p.id,a.id,{estimateDays:n}),/estimateDays/);
});
test('schedule does not change project state or status',()=>{
  const p=createProject(empty(),{name:'Authority'}),a=createItem(p.state,p.id,{title:'Build'});
  const before=JSON.stringify(a.state);
  const plan=scheduleProject(a.state.projects[0]);
  assert.equal(JSON.stringify(a.state),before);
  assert.equal(a.state.projects[0].status,'planned');
  assert.match(plan.warning,/not execution authority/);
});

test('editing the deadline of a saved work updates its dated risk without rewriting the source snapshot',()=>{
 const made=createProject(empty(),{name:'Late direct edit'});
 const item=createItem(made.state,made.id,{title:'A task'});
 const started=editProject(item.state,made.id,{startDate:'2026-11-10'});
 const original=editItem(started,made.id,item.id,{estimateDays:3,dueDate:'2026-11-12'});
 const beforeText=serialize(original);
 const before=scheduleProject(original.projects[0]);
 assert.equal(before.rows[0].finishDate,'2026-11-13');
 assert.ok(before.rows[0].finishDate>before.rows[0].dueDate);
 const revised=editItem(original,made.id,item.id,{dueDate:'2026-11-15'});
 const after=scheduleProject(revised.projects[0]);
 assert.equal(after.rows[0].finishDate,'2026-11-13');
 assert.ok(after.rows[0].finishDate<=after.rows[0].dueDate);
 const delta=scheduleChangeSummary(before,after);
 assert.equal(delta.movedTotal,0);
 assert.equal(delta.deadlineChangedTotal,1);
 assert.equal(delta.deadlineResolvedTotal,1);
 assert.equal(delta.examples[0].shiftDays,0);
 assert.equal(delta.examples[0].dueDate,'2026-11-15');
 assert.equal(serialize(original),beforeText,'Direct edit mutated the original project');
 assert.equal(deserialize(serialize(revised)).projects[0].items[0].dueDate,'2026-11-15');
});

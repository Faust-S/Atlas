import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,editProject,createItem,editItem,serialize} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {portfolioResources,planningResourceScope,resourceWorkConflicts} from '../src/portfolio-resources.mjs';
import {compareDeadlineRecovery} from '../src/plan-recovery.mjs';
import {atlas12PlanAlternativesPortfolio} from './fixtures/atlas12-plan-alternatives.mjs';

test('Scoped resource-days count actual participating Works and shared conflicts exactly once',()=>{
 const resource=addPlanningResource(empty(),{label:'Кран',capacityPct:100,availableUntil:'2026-11-24'});
 let s=resource.state;const projects=[],works=[];
 for(const [i,start] of ['2026-11-23','2026-11-23','2026-11-20'].entries()){
  const p=createProject(s,{name:'Проект '+i,type:'engineering'});projects.push(p.id);
  s=editProject(p.state,p.id,{startDate:start});
  const w=createItem(s,p.id,{title:'Работа',resourceId:resource.id,allocationPct:60});works.push(w.id);
  s=editItem(w.state,p.id,w.id,{estimateDays:3});
 }
 // The two distinct projects deliberately reuse a local Work ID.
 s.projects[1].items[0].id=works[0];
 const before=serialize(s),view=portfolioResources(s),group=view.byId.get(resource.id);
 assert.equal(group.overloadDays,2);assert.equal(group.unavailableDays,1);
 const both=planningResourceScope(view,projects.slice(0,2));
 assert.equal(both.totals.conflictedWork,2);assert.equal(both.totals.overloadWork,2);
 assert.equal(both.totals.unavailableWork,2);assert.equal(both.totals.overloadDays,2);
 assert.equal(both.totals.unavailableDays,1);assert.equal(both.totals.conflictResources,1);
 assert.equal(both.examples.length,2);
 assert.deepEqual(new Set(both.examples.map(w=>w.projectId)),new Set(projects.slice(0,2)));
 for(const p of both.projects){
  assert.equal(p.conflictedWork,1);assert.equal(p.overloadDays,2);assert.equal(p.unavailableDays,1);
  assert.deepEqual(resourceWorkConflicts(group,p.id).get(works[0]),{overloadDays:2,unavailableDays:1});
 }
 const unrelated=planningResourceScope(view,[projects[2]]);
 assert.equal(unrelated.totals.conflictedWork,0);assert.equal(unrelated.totals.overloadDays,0);
 assert.equal(unrelated.totals.unavailableDays,0);assert.equal(unrelated.totals.linked,1);
 assert.equal(serialize(s),before);
});
test('Calendar recovery distinguishes residual conflict and coverage from the portfolio-wide total',()=>{
 const f=atlas12PlanAlternativesPortfolio(),p=f.snapshot.projects[0],third=p.items[2].id;
 const input=[{itemId:f.firstId,estimateDays:2},{itemId:f.secondId,estimateDays:2},{itemId:third,estimateDays:2}];
 const withConflict=compareDeadlineRecovery(f.snapshot,f.projectId,input).options.at(-1);
 assert.equal(withConflict.effect.calendarDeadlineMet,true);
 assert.equal(withConflict.effect.resourceAssessment,'CONFLICTS');
 assert.equal(withConflict.effect.projectConflictWorks,2);
 assert.equal(withConflict.effect.affectedConflictWorks,2);
 assert.equal(withConflict.effect.affectedOverloadDays,2);
 const unrelated=createProject(f.snapshot,{name:'Независимый проект',type:'engineering'});
 let s=editProject(unrelated.state,unrelated.id,{startDate:'2026-12-01'});
 for(let i=0;i<2;i++){
  const w=createItem(s,unrelated.id,{title:'Отдельная работа '+i,resourceId:p.items[0].resourceId,allocationPct:70});
  s=editItem(w.state,unrelated.id,w.id,{estimateDays:3});
 }
 const corrected=input.map(w=>w.itemId===f.secondId?{...w,resourceId:f.liftId}:w);
 const without=compareDeadlineRecovery(s,f.projectId,corrected).options.at(-1);
 assert.equal(without.effect.calendarDeadlineMet,true);
 assert.equal(without.effect.projectConflictWorks,0);assert.equal(without.effect.affectedConflictWorks,0);
 assert.equal(without.preview.resourceAfter.overloadDays,3);
 assert.equal(without.effect.resourceAssessment,'INCOMPLETE');
 assert.equal(without.effect.affectedUnlinked,1);
 assert.ok(without.preview.resourceScope.after.projects.every(p=>p.id!==unrelated.id));
});
test('An outside project sharing a resource still counts when an affected Work actually overlaps it',()=>{
 const resource=addPlanningResource(empty(),{label:'Площадка',capacityPct:100});
 let s=resource.state;const projects=[];
 for(let i=0;i<2;i++){
  const p=createProject(s,{name:'Проект '+i,type:'engineering'});projects.push(p.id);
  s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:'2026-11-25'});
  const w=createItem(s,p.id,{title:'Работа',resourceId:resource.id,allocationPct:60});
  s=editItem(w.state,p.id,w.id,{estimateDays:3});
 }
 const w=s.projects[0].items[0];
 const result=compareDeadlineRecovery(s,projects[0],[{itemId:w.id,estimateDays:2}]).options[0];
 assert.equal(result.effect.calendarDeadlineMet,true);
 assert.equal(result.effect.projectConflictWorks,1);assert.equal(result.effect.affectedConflictWorks,1);
 assert.equal(result.effect.affectedOverloadDays,2);
 assert.equal(result.preview.resourceScope.after.examples[0].projectId,projects[0]);
 assert.equal(result.preview.resourceScope.after.projects.length,1);
});

test('Equal resource and date totals cannot hide newly conflicted Work after exchanged assignments',()=>{
 const a=addPlanningResource(empty(),{label:'Кран A',capacityPct:100});
 const b=addPlanningResource(a.state,{label:'Кран B',capacityPct:100});
 const p=createProject(b.state,{name:'Монтаж',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:'2026-11-26'});
 const works=[];
 for(const [title,r] of [['Работа A',a.id],['Работа B',a.id],['Работа C',b.id]]){
  const w=createItem(s,p.id,{title,resourceId:r,allocationPct:60});
  s=editItem(w.state,p.id,w.id,{estimateDays:3});works.push(w.id);
 }
 const before=serialize(s);
 const r=compareDeadlineRecovery(s,p.id,[
  {itemId:works[1],estimateDays:3,resourceId:b.id},
  {itemId:works[2],estimateDays:3,resourceId:a.id}
 ]);
 const joint=r.options.at(-1);assert.equal(joint.valid,true);
 assert.deepEqual(joint.preview.resourceBefore,joint.preview.resourceAfter);
 assert.equal(joint.preview.resourceRows.length,0);
 assert.equal(joint.effect.affectedConflictWorksBefore,2);
 assert.equal(joint.effect.affectedConflictWorks,2);
 assert.equal(joint.effect.worsenedResources,0);
 assert.equal(joint.effect.newlyConflictedWorks,1);
 assert.equal(joint.effect.clearedConflictWorks,1);
 assert.equal(joint.effect.tradeoff,true);
 assert.equal(joint.preview.resourceScope.workChanges.examples[0].workId,works[2]);
 assert.equal(joint.preview.resourceScope.workChanges.examples[1].workId,works[1]);
 assert.equal(serialize(s),before);
});

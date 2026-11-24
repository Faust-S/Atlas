import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,editProject,createItem,editItem,serialize,createWorkCalendar} from '../src/core.mjs';
import {addPlanningResource,editPlanningResource} from '../src/resource-planning.mjs';
import {portfolioResources,planningResourceScope,resourceWorkConflicts,comparePlanningResourceScopes,resourceConflictDifference} from '../src/portfolio-resources.mjs';
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

function sharedIntervals(){
 const r=addPlanningResource(empty(),{label:'Монтажная площадка',capacityPct:100});
 let state=r.state;const ids=[];
 for(const [name,start,duration] of [['Заказ A','2026-11-23',2],['Заказ B','2026-11-25',2],['Непрерывная операция','2026-11-23',4]]){
  const p=createProject(state,{name,type:'engineering'});
  state=editProject(p.state,p.id,{startDate:start,dueDate:'2026-11-29'});
  const w=createItem(state,p.id,{title:'Работа '+name,resourceId:r.id,allocationPct:60});
  state=editItem(w.state,p.id,w.id,{estimateDays:duration});
  ids.push({projectId:p.id,workId:w.id});
 }
 return {state,ids,resourceId:r.id};
}
test('Coordinated date exchange detects new conflict dates even when every resource total and period is identical',async()=>{
 const {planChange}=await import('../src/trace.mjs');
 const {setPlanDates,comparePortfolioPlanSets}=await import('../src/plan-amendment.mjs');
 const f=sharedIntervals();let state=f.state;const refs=[];
 for(const [i,startDate] of ['2026-11-25','2026-11-23'].entries()){
  const projectId=f.ids[i].projectId,q=planChange(state,projectId,{title:'Согласовать начало'});
  state=setPlanDates(q.state,projectId,q.id,{startDate,dueDate:'2026-11-29'}).state;
  refs.push({projectId,changeId:q.id});
 }
 const saved=serialize(state),comparison=comparePortfolioPlanSets(state,refs),option=comparison.options[0];
 assert.equal(option.valid,true);assert.deepEqual(option.preview.resourceBefore,option.preview.resourceAfter);
 assert.equal(option.preview.resourceRows.length,0);
 const c=option.preview.resourceScope.workChanges;
 assert.equal(c.totals.newlyConflicted,0);assert.equal(c.totals.cleared,0);
 assert.equal(c.totals.worsened,0);assert.equal(c.totals.relieved,0);assert.equal(c.totals.resourceChanged,0);
 assert.equal(c.totals.newDateWorks,2);assert.equal(c.totals.changed,2);
 assert.equal(c.totals.newConflictDays,4);assert.equal(c.totals.clearedConflictDays,4);
 assert.equal(c.totals.changedKindDays,0);
 assert.deepEqual(c.examples.find(x=>x.workId===f.ids[0].workId).firstNewPeriod,
  {startDate:'2026-11-25',endDate:'2026-11-26',kind:'overload'});
 assert.deepEqual(c.examples.find(x=>x.workId===f.ids[1].workId).firstNewPeriod,
  {startDate:'2026-11-23',endDate:'2026-11-24',kind:'overload'});
 assert.equal(c.projects.find(x=>x.id===f.ids[2].projectId).changed,0);
 assert.equal(option.assessment.hasTradeoff,true);
 assert.equal(option.assessment.newConflictDateWorks,2);
 assert.equal(option.assessment.warnings.newConflictDates,2);
 assert.equal(comparison.summary.columns[1].newConflictWorkDays,4);
 assert.equal(serialize(state),saved);
});
test('Work conflict date differences exclude nonworking calendar gaps and preserve overlapping days',()=>{
 const r=addPlanningResource(empty(),{label:'Бригада',capacityPct:100});
 const a=createProject(r.state,{name:'Рабочие смены',type:'engineering'});
 const b=createProject(a.state,{name:'Непрерывное производство',type:'engineering'});
 let s=editProject(b.state,a.id,{startDate:'2026-11-20'});
 s=editProject(s,b.id,{startDate:'2026-11-20'});
 const cal=createWorkCalendar(s,{name:'Пятидневка',weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],
  source:{kind:'entered_by_user',reference:null}});
 const w=createItem(cal.state,a.id,{title:'Две смены',resourceId:r.id,allocationPct:60});
 s=editItem(w.state,a.id,w.id,{estimateDays:2,durationUnit:'working_days',calendarBasis:{id:cal.id,version:cal.version}});
 const base=createItem(s,b.id,{title:'Постоянная операция',resourceId:r.id,allocationPct:60});
 s=editItem(base.state,b.id,base.id,{estimateDays:6});
 const before=portfolioResources(s),after=portfolioResources(editProject(s,a.id,{startDate:'2026-11-23'}));
 const c=comparePlanningResourceScopes(before,after,[a.id]);
 assert.equal(c.before.totals.overloadDays,2);assert.equal(c.after.totals.overloadDays,2);
 assert.equal(c.workChanges.totals.newConflictDays,1);assert.equal(c.workChanges.totals.clearedConflictDays,1);
 assert.equal(c.workChanges.totals.newDateWorks,1);
 assert.deepEqual(c.workChanges.examples[0].firstNewPeriod,{startDate:'2026-11-24',endDate:'2026-11-24',kind:'overload'});
 const unchanged=comparePlanningResourceScopes(before,before,[a.id,b.id]);
 assert.equal(unchanged.workChanges.totals.changed,0);assert.equal(unchanged.workChanges.totals.newConflictDays,0);
 assert.deepEqual(unchanged.workChanges.examples,[]);
});
test('Changing a conflict kind on the same day is not double-counted as a new or cleared conflict day',()=>{
 const f=sharedIntervals(),before=portfolioResources(f.state);
 const updated=editPlanningResource(f.state,f.resourceId,{label:'Монтажная площадка',capacityPct:100,availableUntil:'2026-11-23'}).state;
 const after=portfolioResources(updated),ids=f.ids.map(x=>x.projectId),c=comparePlanningResourceScopes(before,after,ids);
 assert.equal(c.workChanges.totals.newConflictDays,0);assert.equal(c.workChanges.totals.clearedConflictDays,0);
 assert.equal(c.workChanges.totals.changedKindWorks,3);assert.equal(c.workChanges.totals.changedKindDays,6);
 assert.equal(c.workChanges.totals.newDateWorks,0);
 assert.ok(c.workChanges.examples.every(x=>x.firstNewPeriod===null));
 const d=resourceConflictDifference(before.byId.get(f.resourceId),after.byId.get(f.resourceId));
 assert.equal(d.totals.CHANGED_KIND,3,'Unique resource-days differ from participating Work-days');
});

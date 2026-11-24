import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editItem,editProject,removeItem,serialize,deserialize} from '../src/core.mjs';
import {capturePlanBaseline,comparePlanBaseline} from '../src/plan-baseline.mjs';
import {editPlanningResource} from '../src/resource-planning.mjs';
import {planChange,decideChange} from '../src/trace.mjs';
import {comparePlanRevisions,setPlanWork,setPlanDates,addPlanWork,setPlanDependency,previewPlanAmendment,applyPlanAmendment} from '../src/plan-amendment.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {atlas12PlanAlternativesPortfolio} from './fixtures/atlas12-plan-alternatives.mjs';

function history(){
 const f=atlas12PlanAlternativesPortfolio();
 let s=editItem(f.snapshot,f.projectId,f.firstId,{estimateDays:4});
 const second=capturePlanBaseline(s,f.projectId,{name:'Промежуточный план',recordedAt:'2026-11-24T08:00:00.000Z'});
 s=editItem(second.state,f.projectId,f.firstId,{estimateDays:5});
 const proposal=planChange(s,f.projectId,{title:'Вернуть длительность'});
 s=setPlanWork(proposal.state,f.projectId,proposal.id,{itemId:f.firstId,estimateDays:3}).state;
 return {...f,snapshot:s,secondBaselineId:second.id,proposalId:proposal.id};
}
test('First, selected, current and proposed revisions separate accumulated and incremental movement',()=>{
 const f=history(),before=serialize(f.snapshot);
 const r=comparePlanRevisions(f.snapshot,f.projectId,{changeId:f.proposalId});
 assert.equal(r.history.length,2);assert.equal(r.reference.id,f.secondBaselineId);
 assert.equal(r.original.finish,'2026-11-26');
 assert.equal(r.reference.finish,'2026-11-27');
 assert.equal(r.current.finish,'2026-11-28');
 assert.equal(r.proposed.finish,'2026-11-26');
 assert.equal(r.accumulatedShift,2);assert.equal(r.referenceShift,1);
 assert.equal(r.proposalShift,-2);assert.equal(r.finalShift,0);assert.equal(r.referenceFinalShift,-1);
 const w=r.rows.find(w=>w.workId===f.firstId);
 assert.deepEqual([w.original.estimateDays,w.reference.estimateDays,w.current.estimateDays,w.proposed.estimateDays],[3,4,5,3]);
 assert.equal(w.proposalShift,-2);assert.equal(w.original.assignment.resourceLabel,'Кран');
 assert.equal(r.downstream.find(p=>p.id===f.dependentId).shiftDays,-2);
 assert.equal(r.resourceChange.after.overloadDays,previewPlanAmendment(f.snapshot,f.projectId,f.proposalId).resourceAfter.overloadDays);
 assert.equal(serialize(f.snapshot),before);
 const selectedFirst=comparePlanRevisions(f.snapshot,f.projectId,{baselineId:r.original.id,changeId:f.proposalId});
 assert.equal(selectedFirst.referenceShift,2);assert.equal(selectedFirst.referenceFinalShift,0);
 assert.deepEqual(comparePlanRevisions(deserialize(before),f.projectId,{changeId:f.proposalId}),r);
});
test('Current historical drift is retained even when a proposal changes different Work',()=>{
 const f=history();
 const p=planChange(f.snapshot,f.projectId,{title:'Только ресурс'});
 const s=setPlanWork(p.state,f.projectId,p.id,{itemId:f.secondId,estimateDays:3,resourceId:f.liftId}).state;
 const r=comparePlanRevisions(s,f.projectId,{changeId:p.id});
 const w=r.rows.find(w=>w.workId===f.firstId),other=r.rows.find(w=>w.workId===f.secondId);
 assert.equal(w.accumulatedChanged,true);assert.equal(w.proposalChanged,false);
 assert.equal(w.accumulatedShift,2);assert.equal(w.proposalShift,0);
 assert.equal(other.proposalChanged,true);
 assert.equal(other.current.assignment.resourceId!==other.proposed.assignment.resourceId,true);
});
test('Stale or closed proposals never erase historical/current comparison or produce fictional dates',()=>{
 const f=history();
 const stale=comparePlanRevisions(f.snapshot,f.projectId,{changeId:f.a});
 assert.equal(stale.proposal.valid,false);assert.match(stale.proposal.reason,/изменилась/);
 assert.equal(stale.proposed,null);assert.equal(stale.proposalShift,null);
 assert.equal(stale.current.finish,'2026-11-28');assert.equal(stale.accumulatedShift,2);
 assert.equal(stale.totals.proposalChanged,null);
 assert.ok(stale.rows.every(r=>r.proposed===null&&r.proposalChanged===false));
 const none=comparePlanRevisions(f.snapshot,f.projectId);
 assert.equal(none.proposal,null);assert.equal(none.current.finish,stale.current.finish);
 assert.throws(()=>comparePlanRevisions(f.snapshot,f.projectId,{baselineId:'missing'}),/не найдена/);
 const rejected=decideChange(f.snapshot,f.projectId,f.proposalId,{status:'rejected',rationale:'Не принимать это изменение'}).state;
 assert.equal(comparePlanRevisions(rejected,f.projectId,{changeId:f.proposalId}).proposal.valid,false);
});
test('Removed and proposed new Work have explicit absence; recorded history is retained',()=>{
 const f=history(),p=f.snapshot.projects.find(p=>p.id===f.projectId),removed=p.items[2].id;
 let s=removeItem(f.snapshot,f.projectId,removed);
 const added=addPlanWork(s,f.projectId,f.proposalId,{title:'Новая проверка',estimateDays:7}).state;
 const r=comparePlanRevisions(added,f.projectId,{changeId:f.proposalId});
 const old=r.rows.find(w=>w.workId===removed),fresh=r.rows.find(w=>w.title==='Новая проверка');
 assert.ok(old.original&&old.reference);assert.equal(old.current,null);assert.equal(old.proposed,null);
 assert.equal(old.accumulatedShift,null);assert.equal(r.totals.removedSinceOriginal,1);
 assert.equal(fresh.original,null);assert.equal(fresh.current,null);assert.ok(fresh.proposed.finish);
 assert.equal(fresh.proposalShift,null);assert.equal(r.totals.proposedAdded,1);
});
test('Changing deadlines and dependencies is visible independently from calendar finish and approval',()=>{
 const f=history();
 let s=setPlanDates(f.snapshot,f.projectId,f.proposalId,{startDate:'2026-11-23',dueDate:'2026-11-30'}).state;
 s=setPlanDependency(s,f.projectId,f.proposalId,{from:f.firstId,to:f.secondId,present:true}).state;
 const r=comparePlanRevisions(s,f.projectId,{changeId:f.proposalId});
 assert.equal(r.proposalDeadlineChanged,true);assert.equal(r.current.deadline,'2026-11-25');
 assert.equal(r.proposed.deadline,'2026-11-30');
 const w=r.rows.find(w=>w.workId===f.secondId);
 assert.deepEqual(w.current.predecessors,[]);assert.deepEqual(w.proposed.predecessors,[f.firstId]);
 assert.equal(w.proposalChanged,true);
 assert.throws(()=>applyPlanAmendment(s,f.projectId,f.proposalId),/утверждение/);
 s=decideChange(s,f.projectId,f.proposalId,{status:'approved',rationale:'Утверждение выбранной редакции'}).state;
 const applied=applyPlanAmendment(s,f.projectId,f.proposalId).state;
 assert.equal(portfolioSchedule(applied).byId.get(f.projectId).projectedFinish,r.proposed.finish);
 assert.deepEqual(applied.projects[0].planBaselines,s.projects[0].planBaselines);
 const after=comparePlanRevisions(applied,f.projectId);
 assert.equal(after.current.finish,r.proposed.finish);
 assert.equal(after.accumulatedShift,r.finalShift);
});
test('Paused forecasts are unknown, not absent Work or a zero deviation',()=>{
 const f=history(),s=editProject(f.snapshot,f.projectId,{status:'paused'});
 const r=comparePlanRevisions(s,f.projectId,{changeId:f.proposalId});
 assert.equal(r.proposal.valid,true);assert.equal(r.current.finish,null);assert.equal(r.proposed.finish,null);
 assert.equal(r.accumulatedShift,null);assert.equal(r.proposalShift,null);
 assert.equal(r.totals.undatedCurrent,4);assert.equal(r.totals.undatedProposed,4);
 assert.ok(r.rows.every(w=>w.current&&w.current.critical===null));
});
test('Desktop uses the same comparison and only an existing proposal navigation action',()=>{
 const ui=readFileSync(new URL('../desktop/src/PlanAlternativesComparison.tsx',import.meta.url),'utf8');
 assert.match(ui,/comparePlanRevisions\(snapshot,projectId,/);
 assert.match(ui,/Сравнить редакции плана/);
 assert.doesNotMatch(ui,/applyPlanAmendment\(|commitWithReadback\(|createTask\(/);
});

test('New control points preserve resource name, assignment, load and reserve at the actual recorded revision',()=>{
 const f=atlas12PlanAlternativesPortfolio(),p=f.snapshot.projects[0],w=p.items[0],b=p.planBaselines[0];
 assert.equal(b.work.find(x=>x.id===f.firstId).assignment.resourceLabel,'Кран');
 assert.equal(b.work.find(x=>x.id===f.firstId).assignment.allocationPct,70);
 assert.equal(b.work.find(x=>x.id===f.looseId).floatDays,1);
 let s=editPlanningResource(f.snapshot,w.resourceId,{label:'Основной кран',capacityPct:100}).state;
 s=editItem(s,f.projectId,f.firstId,{assignee:'Бригада B',resourceId:f.liftId,allocationPct:60,estimateDays:4});
 const r=comparePlanRevisions(s,f.projectId),changed=r.rows.find(x=>x.workId===f.firstId),
  parallel=r.rows.find(x=>x.workId===f.looseId);
 assert.equal(changed.original.assignment.resourceLabel,'Кран');
 assert.equal(changed.current.assignment.resourceLabel,'Подъёмник');
 assert.equal(changed.original.assignment.allocationPct,70);assert.equal(changed.current.assignment.allocationPct,60);
 assert.ok(changed.accumulatedReasons.includes('Изменён ответственный'));
 assert.ok(changed.accumulatedReasons.includes('Изменено назначение планового ресурса'));
 assert.ok(changed.accumulatedReasons.includes('Изменена плановая загрузка'));
 assert.equal(parallel.original.floatDays,1);assert.equal(parallel.current.floatDays,2);
 assert.ok(parallel.accumulatedReasons.includes('Изменён расчётный резерв'));
 assert.deepEqual(s.projects[0].planBaselines,p.planBaselines);
 const comparison=comparePlanBaseline(s,f.projectId).rows.find(x=>x.id===f.firstId);
 assert.equal(comparison.referenceAssignment.resourceLabel,'Кран');assert.equal(comparison.currentAssignment.resourceLabel,'Подъёмник');
 assert.ok(comparison.reasons.includes('Изменено назначение планового ресурса'));
 const renamed=r.rows.find(x=>x.workId===f.secondId);
 assert.equal(renamed.original.assignment.resourceLabel,'Кран');
 assert.equal(renamed.current.assignment.resourceLabel,'Основной кран');
 assert.ok(renamed.accumulatedReasons.includes('Изменено наименование планового ресурса'));
 assert.equal(r.history[0].recordedAssignments,4);assert.equal(r.history[0].recordedReserves,4);
 assert.deepEqual(deserialize(serialize(s)),s);
});
test('Legacy control points never borrow a current resource assignment or reserve',()=>{
 const f=atlas12PlanAlternativesPortfolio(),legacy=structuredClone(f.snapshot);
 for(const project of legacy.projects)for(const b of project.planBaselines??[])
  for(const w of b.work){delete w.assignment;delete w.floatDays}
 const s=editItem(legacy,f.projectId,f.firstId,{resourceId:f.liftId,assignee:'Новая бригада'});
 const r=comparePlanRevisions(s,f.projectId),w=r.rows.find(x=>x.workId===f.firstId);
 assert.equal(w.original.assignment,null);assert.equal(w.original.floatDays,null);
 assert.equal(w.current.assignment.resourceLabel,'Подъёмник');
 assert.equal(w.accumulatedChanged,false);assert.deepEqual(w.accumulatedReasons,[]);
 assert.equal(r.history[0].recordedAssignments,0);assert.equal(r.history[0].recordedReserves,0);
 assert.equal(comparePlanBaseline(s,f.projectId).rows.find(x=>x.id===f.firstId).referenceAssignment,null);
 const again=capturePlanBaseline(s,f.projectId,{name:'Новый полный контрольный план'});
 assert.equal(again.baseline.work.find(x=>x.id===f.firstId).assignment.resourceLabel,'Подъёмник');
 assert.equal(again.state.projects[0].planBaselines[0].work.find(x=>x.id===f.firstId).assignment,undefined);
});
test('Malformed historical reserves or assignments are not accepted as recorded control facts',()=>{
 const f=atlas12PlanAlternativesPortfolio();
 for(const change of [
  w=>{w.floatDays=-1},w=>{w.floatDays=w.critical?1:0},
  w=>{w.assignment.allocationPct=0},w=>{w.assignment.resourceLabel=null},
  w=>{w.assignment.resourceId=null},w=>{w.assignment.assignee=12}
 ]){
  const s=structuredClone(f.snapshot);change(s.projects[0].planBaselines[0].work.find(x=>x.id===f.firstId));
  assert.throws(()=>serialize(s),/Invalid plan baseline/);
 }
});

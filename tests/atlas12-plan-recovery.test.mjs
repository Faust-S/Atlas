import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createProject,empty,editProject,editItem,createItem,createWorkCalendar,connect,serialize,deserialize} from '../src/core.mjs';
import {inspectDeadlineRecovery,compareDeadlineRecovery,createDeadlineRecoveryProposal} from '../src/plan-recovery.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {portfolioResources,planningResourceTotals} from '../src/portfolio-resources.mjs';
import {previewPlanAmendment,applyPlanAmendment} from '../src/plan-amendment.mjs';
import {decideChange} from '../src/trace.mjs';
import {atlas12PlanAlternativesPortfolio} from './fixtures/atlas12-plan-alternatives.mjs';
import {desktopLoadPortfolio} from './fixtures/desktop-portfolio-120.mjs';

const reason={rationale:'Проверить сокращение длительности при подтверждении производителем'};
function fixture(){
 const f=atlas12PlanAlternativesPortfolio(),project=f.snapshot.projects.find(p=>p.id===f.projectId);
 return {...f,thirdId:project.items[2].id,tradeoffId:project.items[2].resourceId};
}
const inputs=f=>[{itemId:f.firstId,estimateDays:2},
 {itemId:f.secondId,estimateDays:2,resourceId:f.liftId},{itemId:f.thirdId,estimateDays:2}];
test('Three parallel critical chains need their joint reduction, not the sum of independent gains',()=>{
 const f=fixture(),saved=serialize(f.snapshot),view=inspectDeadlineRecovery(f.snapshot,f.projectId);
 assert.equal(view.available,true);assert.equal(view.criticalCount,3);
 assert.equal(view.deadline,'2026-11-25');assert.equal(view.finish,'2026-11-26');
 assert.equal(view.slipDays,1);assert.equal(view.candidates.length,4);
 assert.equal(view.candidates[0].critical,true);
 const r=compareDeadlineRecovery(f.snapshot,f.projectId,inputs(f));
 assert.equal(r.options.length,4);assert.ok(r.options.every(o=>o.valid));
 for(const o of r.options.slice(0,3)){
  assert.equal(o.effect.advanceDays,0);assert.equal(o.effect.remainingSlip,1);
  assert.equal(o.effect.dateEffect,'UNCHANGED');
 }
 const combined=r.options.at(-1);
 assert.equal(combined.id,'combined');assert.equal(combined.effect.dateEffect,'RECOVERED');
 assert.equal(combined.effect.advanceDays,1);assert.equal(combined.effect.remainingSlip,0);
 assert.equal(combined.effect.afterFinish,'2026-11-25');
 assert.equal(combined.preview.resourceAfter.overloadDays,0);
 assert.equal(combined.preview.rows.find(p=>p.id===f.dependentId).afterFinish,'2026-11-27');
 assert.equal(serialize(f.snapshot),saved);
});
test('Transfer is an ordinary unapproved proposal; only explicit decision and application alter plan',()=>{
 const f=fixture(),saved=serialize(f.snapshot),r=compareDeadlineRecovery(f.snapshot,f.projectId,inputs(f));
 const d=createDeadlineRecoveryProposal(f.snapshot,r,'combined',reason);
 const original=f.snapshot.projects[0],draft=d.state.projects[0];
 assert.deepEqual(draft.items,original.items);assert.deepEqual(draft.planBaselines,original.planBaselines);
 assert.deepEqual(draft.decisions,original.decisions);assert.deepEqual(d.state.projects[1],f.snapshot.projects[1]);
 const change=draft.changes.at(-1);
 assert.equal(change.id,d.changeId);assert.equal(change.status,'proposed');assert.equal(change.planAmendments.length,3);
 assert.equal(change.planAppliedAt,undefined);assert.match(change.description,/контрольный срок остаётся 2026-11-25/);
 assert.deepEqual(previewPlanAmendment(d.state,f.projectId,d.changeId),r.options.at(-1).preview);
 assert.throws(()=>applyPlanAmendment(d.state,f.projectId,d.changeId),/утверждение/);
 const approved=decideChange(d.state,f.projectId,d.changeId,{status:'approved',rationale:'Допустимые технологические условия подтверждены'}).state;
 const applied=applyPlanAmendment(approved,f.projectId,d.changeId).state;
 assert.equal(portfolioSchedule(applied).byId.get(f.projectId).projectedFinish,'2026-11-25');
 assert.deepEqual(planningResourceTotals(portfolioResources(applied)),r.options.at(-1).preview.resourceAfter);
 assert.equal(applied.projects[0].dueDate,original.dueDate);
 assert.deepEqual(applied.projects[0].planBaselines,original.planBaselines);
 assert.deepEqual(deserialize(serialize(applied)),applied);assert.equal(serialize(f.snapshot),saved);
});
test('A new resource conflict is visible despite an equal portfolio total',()=>{
 const f=fixture(),r=compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.secondId,estimateDays:3,resourceId:f.tradeoffId}]);
 const o=r.options[0];assert.equal(o.valid,true);
 assert.equal(o.effect.dateEffect,'UNCHANGED');assert.equal(o.effect.advanceDays,0);
 assert.equal(o.preview.resourceBefore.overloadDays,o.preview.resourceAfter.overloadDays);
 assert.equal(o.effect.worsenedResources,1);assert.equal(o.effect.tradeoff,true);
});
test('A changed or independently imported plan cannot silently reuse a calculated proposal',()=>{
 const f=fixture(),r=compareDeadlineRecovery(f.snapshot,f.projectId,inputs(f));
 const changed=editItem(f.snapshot,f.projectId,f.firstId,{assignee:'Другая бригада'});
 assert.throws(()=>createDeadlineRecoveryProposal(changed,r,'combined',reason),/План изменился/);
 const sameRevision=structuredClone(f.snapshot);sameRevision.projects[0].dueDate='2026-11-26';
 assert.throws(()=>createDeadlineRecoveryProposal(sameRevision,r,'combined',reason),/План изменился/);
 assert.throws(()=>createDeadlineRecoveryProposal(f.snapshot,r,'missing',reason),/Выберите рассчитанный/);
 assert.throws(()=>createDeadlineRecoveryProposal(f.snapshot,r,'combined',{rationale:''}),/обоснование/);
 const tampered=structuredClone(r);tampered.options.at(-1).effect.advanceDays=5;
 assert.throws(()=>createDeadlineRecoveryProposal(f.snapshot,tampered,'combined',reason),/Расчёт варианта изменился/);
});
test('Started, done, zero duration, duplicate, unchanged and resource-dropping inputs are excluded',()=>{
 const f=fixture(),s=editItem(f.snapshot,f.projectId,f.firstId,{state:'in_progress'});
 assert.equal(inspectDeadlineRecovery(s,f.projectId).fixedCriticalCount,1);
 assert.throws(()=>compareDeadlineRecovery(s,f.projectId,inputs(f)),/ещё не начатую/);
 const actual=editItem(f.snapshot,f.projectId,f.firstId,{actualStartDate:'2026-11-23'});
 assert.throws(()=>compareDeadlineRecovery(actual,f.projectId,inputs(f)),/ещё не начатую/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.firstId,estimateDays:0}]),/от 1 до 36500/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[inputs(f)[0],inputs(f)[0]]),/повторяться/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.firstId,estimateDays:3}]),/хотя бы одно/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.firstId,estimateDays:2,resourceId:null}]),/снятие назначения/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.firstId,estimateDays:2,allocationPct:101}]),/от 1 до 100/);
});
test('Unknown dates and absent target are separate from a successful deadline calculation',()=>{
 const f=fixture(),paused=editProject(f.snapshot,f.projectId,{status:'paused'});
 assert.equal(inspectDeadlineRecovery(paused,f.projectId).available,false);
 assert.throws(()=>compareDeadlineRecovery(paused,f.projectId,inputs(f)),/действующий план/);
 const missing=editProject(f.snapshot,f.projectId,{dueDate:null});
 assert.match(inspectDeadlineRecovery(missing,f.projectId).reason,/контрольный срок/);
 const downstream=inspectDeadlineRecovery(f.snapshot,f.dependentId);
 assert.equal(downstream.limitingProjects[0].id,f.projectId);
 assert.equal(downstream.startShiftDays,3);
 const emptyProject=createProject(empty(),{name:'Без работ',type:'engineering'});
 assert.equal(inspectDeadlineRecovery(emptyProject.state,emptyProject.id).available,false);
});
test('A slower alternative is calculated rather than artificially discarded as impossible',()=>{
 const f=fixture(),r=compareDeadlineRecovery(f.snapshot,f.projectId,[{itemId:f.firstId,estimateDays:5}]);
 assert.equal(r.options[0].effect.dateEffect,'LATER');assert.equal(r.options[0].effect.advanceDays,-2);
 assert.equal(r.options[0].effect.remainingSlip,3);assert.equal(r.options[0].effect.tradeoff,true);
});
test('Desktop transfers the chosen result only through existing Atlas draft and proposal navigation',()=>{
 const ui=readFileSync(new URL('../desktop/src/PlanRecoveryComparison.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 assert.match(ui,/compareDeadlineRecovery\(snapshot,projectId,/);
 assert.match(main,/createDeadlineRecoveryProposal\(latestSnapshot.current,comparison,optionId,\{rationale\}\)/);
 assert.doesNotMatch(ui,/applyPlanAmendment\(|commitWithReadback\(|createTask\(/);
});

test('Calendar-aware recovery measures elapsed date gains, not the numeric duration difference',()=>{
 const p=createProject(empty(),{name:'Монтаж по рабочим дням',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-20',dueDate:'2026-11-24'});
 const c=createWorkCalendar(s,{name:'Рабочая неделя',weekdays:[1,2,3,4,5],
  excludedDates:['2026-11-23'],additionalWorkingDates:[],source:{kind:'entered_by_user',reference:null}});
 const w=createItem(c.state,p.id,{title:'Монтаж'});
 s=editItem(w.state,p.id,w.id,{estimateDays:2,durationUnit:'working_days',calendarBasis:{id:c.id,version:c.version}});
 const r=compareDeadlineRecovery(s,p.id,[{itemId:w.id,estimateDays:1}]),o=r.options[0];
 assert.equal(o.valid,true);assert.equal(o.effect.beforeFinish,'2026-11-25');assert.equal(o.effect.afterFinish,'2026-11-21');
 assert.equal(o.effect.advanceDays,4);assert.equal(o.effect.recoveredDays,1);assert.equal(o.effect.remainingSlip,0);
 const d=createDeadlineRecoveryProposal(s,r,o.id,reason),a=d.state.projects[0].changes[0].planAmendments[0];
 assert.equal(a.before.durationUnit,'working_days');assert.deepEqual(a.before.calendarBasis,{id:c.id,version:c.version});
 assert.equal(a.after.estimateDays,1);assert.equal('calendarBasis' in a.after,false);
});

test('Explicit sequence and duration alternatives can recover the deadline only in combination',()=>{
 const f=fixture();
 let s=editItem(f.snapshot,f.projectId,f.thirdId,{estimateDays:5});
 s=connect(s,f.projectId,f.firstId,f.secondId);
 s=editProject(s,f.projectId,{dueDate:'2026-11-27'});
 const saved=serialize(s),edges=[{from:f.firstId,to:f.secondId,present:false}];
 const r=compareDeadlineRecovery(s,f.projectId,[{itemId:f.thirdId,estimateDays:4}],{dependencyChanges:edges});
 assert.equal(r.options.length,3);assert.ok(r.options.every(o=>o.valid));
 assert.equal(r.context.finish,'2026-11-29');
 assert.equal(r.options[0].effect.afterFinish,'2026-11-29');
 assert.equal(r.options[1].effect.afterFinish,'2026-11-28');
 const combined=r.options.at(-1);
 assert.equal(combined.effect.afterFinish,'2026-11-27');assert.equal(combined.effect.dateEffect,'RECOVERED');
 assert.equal(combined.effect.tradeoff,true,'Removing the sequence introduces a real resource trade-off');
 const draft=createDeadlineRecoveryProposal(s,r,'combined',reason),p=draft.state.projects[0],c=p.changes.at(-1);
 assert.deepEqual(p.dependencies,s.projects[0].dependencies);
 assert.deepEqual(p.items,s.projects[0].items);
 assert.equal(c.planAmendments.length,2);assert.match(c.description,/Исключить зависимость/);
 const approved=decideChange(draft.state,f.projectId,draft.changeId,{status:'approved',rationale:'Допустим новый порядок работ'}).state;
 const applied=applyPlanAmendment(approved,f.projectId,draft.changeId).state;
 assert.deepEqual(applied.projects[0].dependencies,[]);
 assert.equal(portfolioSchedule(applied).byId.get(f.projectId).projectedFinish,combined.effect.afterFinish);
 assert.equal(serialize(s),saved);
});
test('An invalid isolated edge does not hide a valid combined reversal',()=>{
 const f=fixture(),s=connect(f.snapshot,f.projectId,f.firstId,f.secondId);
 const edges=[{from:f.secondId,to:f.firstId,present:true},{from:f.firstId,to:f.secondId,present:false}];
 const r=compareDeadlineRecovery(s,f.projectId,[],{dependencyChanges:edges});
 assert.equal(r.options[0].valid,false);assert.equal(r.options[1].valid,true);
 assert.equal(r.options[2].valid,true);
 const draft=createDeadlineRecoveryProposal(s,r,'combined',reason),c=draft.state.projects[0].changes.at(-1);
 assert.deepEqual(c.planAmendments.map(a=>a.after),[false,true]);
 const approved=decideChange(draft.state,f.projectId,draft.changeId,{status:'approved',rationale:'Утверждён обратный порядок'}).state;
 const applied=applyPlanAmendment(approved,f.projectId,draft.changeId).state;
 assert.deepEqual(applied.projects[0].dependencies,[{from:f.secondId,to:f.firstId}]);
});
test('Sequence assumptions require a real change, distinct pending endpoints and no duplicate operations',()=>{
 const f=fixture(),edge={from:f.firstId,to:f.secondId,present:true};
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[],{dependencyChanges:[]}),/хотя бы одну/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[],{dependencyChanges:[edge,edge]}),/повторяться/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[],{dependencyChanges:[{...edge,present:false}]}),/уже соответствует/);
 const started=editItem(f.snapshot,f.projectId,f.firstId,{state:'in_progress'});
 assert.throws(()=>compareDeadlineRecovery(started,f.projectId,[],{dependencyChanges:[edge]}),/ещё не начатые/);
 assert.throws(()=>compareDeadlineRecovery(f.snapshot,f.projectId,[],{dependencyChanges:[{...edge,to:f.dependentWorkId}]}),/одного проекта/);
});
test('Bounded four-Work recovery retains exact preview/application parity on 120 projects and 1200 Works',()=>{
 const s=desktopLoadPortfolio(),pid=s.projects[0].id,p=s.projects[0];
 for(const w of p.items.slice(0,4))w.estimateDays=3;
 p.dueDate='2026-11-12';
 const inputs=p.items.slice(0,4).map(w=>({itemId:w.id,estimateDays:2})),original=serialize(s);
 const begin=performance.now(),r=compareDeadlineRecovery(s,pid,inputs),ms=performance.now()-begin;
 assert.equal(r.options.length,5);assert.ok(r.options.every(o=>o.valid));
 assert.equal(r.options.at(-1).effect.afterFinish,'2026-11-11');
 assert.equal(r.options.at(-1).effect.dateEffect,'RECOVERED');
 assert.equal(r.options.at(-1).preview.rows.length,41);
 const draft=createDeadlineRecoveryProposal(s,r,'combined',reason);
 const approved=decideChange(draft.state,pid,draft.changeId,{status:'approved',rationale:'Проверенные плановые длительности'}).state;
 const applied=applyPlanAmendment(approved,pid,draft.changeId).state,actual=portfolioSchedule(applied);
 for(const row of r.options.at(-1).preview.rows)assert.equal(actual.byId.get(row.id).projectedFinish,row.afterFinish);
 assert.equal(serialize(s),original);
 console.log('ATLAS12_RECOVERY_SCALE projects=120 works=1200 options=5 ms='+ms.toFixed(2));
});

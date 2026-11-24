import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync} from 'node:fs';
import {editItem,removeProject,serialize,deserialize,createItem} from '../src/core.mjs';
import {decideChange,planChange} from '../src/trace.mjs';
import {listPortfolioPlanProposals,comparePortfolioPlanSets,applyPortfolioPlanSet,
 listPortfolioPlanApplications,previewPlanAmendment,setPlanWork,setPlanDates,addPlanWork,setPlanDependency} from '../src/plan-amendment.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {portfolioResources,planningResourceTotals,planningResourceScope} from '../src/portfolio-resources.mjs';
import {coordinatedPortfolio} from './fixtures/atlas12-portfolio-plan-sets.mjs';
import {desktopLoadPortfolio} from './fixtures/desktop-portfolio-120.mjs';

const reason={rationale:'Согласованы режимы работы и использование выделенной монтажной площадки.'};
const project=(s,id)=>s.projects.find(p=>p.id===id);
const change=(s,ref)=>project(s,ref.projectId).changes.find(c=>c.id===ref.changeId);
const row=(o,ref)=>o.preview.rows.find(r=>r.id===ref.projectId);

test('A joint plan recovers two orders and downstream dates but can transfer a conflict outside their dependency chain',()=>{
 const f=coordinatedPortfolio(),saved=serialize(f.snapshot),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 assert.equal(r.options.length,2);const [a,b]=r.options;
 assert.ok(a.valid&&b.valid&&a.canApply&&b.canApply);
 assert.equal(a.preview.rows.length,4);
 assert.equal(a.assessment.deadlines.lateBefore,3);assert.equal(a.assessment.deadlines.lateAfter,0);
 assert.equal(a.assessment.deadlines.comparableSlipBefore,3);assert.equal(a.assessment.deadlines.comparableSlipAfter,0);
 assert.equal(row(a,f.a).afterFinish,'2026-11-26');assert.equal(row(a,f.b).afterFinish,'2026-11-26');
 assert.equal(row(a,f.d).afterFinish,'2026-11-28');assert.equal(row(a,f.c).changed,false);
 assert.equal(a.preview.resourceBefore.overloadDays,4);assert.equal(a.preview.resourceAfter.overloadDays,3);
 assert.equal(a.assessment.conflictedWorkAfter,2);assert.equal(a.assessment.resourceState,'CONFLICTS');
 assert.equal(a.assessment.newlyConflicted,1);assert.equal(a.assessment.clearedConflict,1);
 assert.deepEqual(a.assessment.outsideChain,[f.c.projectId]);assert.equal(a.assessment.hasTradeoff,true);
 assert.equal(b.preview.resourceAfter.overloadDays,0);assert.equal(b.assessment.conflictedWorkAfter,0);
 assert.equal(b.assessment.resourceState,'NO_KNOWN_CONFLICTS');assert.equal(b.assessment.hasTradeoff,false);
 assert.equal(b.assessment.deadlines.lateAfter,0);assert.equal(b.assessment.selectedProjects,3);
 assert.equal(serialize(f.snapshot),saved);
});
test('Comparison ignores click order and retains the ordinary single-proposal calculation',()=>{
 const f=coordinatedPortfolio(),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 assert.deepEqual(comparePortfolioPlanSets(f.snapshot,[...f.first].reverse(),[...f.second].reverse()),r);
 assert.throws(()=>comparePortfolioPlanSets(f.snapshot,f.first,[...f.first].reverse()),/различающиеся/);
 const single=comparePortfolioPlanSets(f.snapshot,[f.pa]).options[0];
 const ordinary=previewPlanAmendment(f.snapshot,f.pa.projectId,f.pa.changeId);
 assert.equal(single.canApply,false);
 assert.deepEqual(single.preview.resourceAfter,ordinary.resourceAfter);
 for(const p of ordinary.rows){const q=single.preview.rows.find(x=>x.id===p.id);
  assert.equal(q.afterFinish,p.afterFinish);assert.equal(q.afterSlip,p.afterSlip)}
 assert.deepEqual(single.preview.workRows,ordinary.workRows);
 assert.equal(listPortfolioPlanProposals(f.snapshot).length,4);
});
test('The entire coordinated set must be approved; no partial application or approval is produced',()=>{
 const f=coordinatedPortfolio({approveThird:false}),s=f.snapshot,saved=serialize(s);
 const r=comparePortfolioPlanSets(s,f.first,f.second);
 assert.equal(r.options[1].valid,true);assert.equal(r.options[1].canApply,false);
 assert.throws(()=>applyPortfolioPlanSet(s,r,'B',reason),/отдельно утвердите/);
 assert.equal(serialize(s),saved);
 const approved=decideChange(s,f.pc.projectId,f.pc.changeId,{status:'approved',rationale:'Выделена отдельная монтажная площадка.'}).state;
 assert.throws(()=>applyPortfolioPlanSet(approved,r,'B',reason),/Портфель изменился/);
 assert.equal(comparePortfolioPlanSets(approved,f.first,f.second).options[1].canApply,true);
});
test('One atomic draft revision records each ordinary application, coordination, rationale, and leaves other projects untouched',()=>{
 const f=coordinatedPortfolio(),s=f.snapshot,before=serialize(s),r=comparePortfolioPlanSets(s,f.first,f.second);
 const {state:next,coordinationId}=applyPortfolioPlanSet(s,r,'B',reason);
 assert.equal(next.revision,s.revision+1);
 const times=new Set();
 for(const ref of f.second){
  const old=project(s,ref.projectId),p=project(next,ref.projectId),c=change(next,ref),d=p.decisions.at(-1);
  assert.deepEqual(p.planBaselines,old.planBaselines);assert.deepEqual(p.dependencies,old.dependencies);
  assert.deepEqual(p.decisions.slice(0,-1),old.decisions);
  assert.deepEqual(c.planAmendments,change(s,ref).planAmendments);
  assert.equal(c.status,'approved');assert.ok(c.planAppliedAt);times.add(c.planAppliedAt);
  assert.equal(d.kind,'plan_application');assert.equal(d.changeId,c.id);assert.equal(d.at,c.planAppliedAt);
  assert.equal(d.coordination.id,coordinationId);assert.equal(d.coordination.sourceRevision,s.revision);
  assert.deepEqual(d.coordination.members.map(({projectId,changeId})=>({projectId,changeId})),f.second);
  assert.ok(d.text.includes(reason.rationale));
 }
 assert.equal(times.size,1);assert.deepEqual(project(next,f.d.projectId),project(s,f.d.projectId));
 assert.deepEqual(next.resources,s.resources);assert.deepEqual(next.portfolioLinks,s.portfolioLinks);
 assert.deepEqual(change(next,f.deadline),change(s,f.deadline));
 const actual=portfolioSchedule(next);
 for(const p of r.options[1].preview.rows)assert.equal(actual.byId.get(p.id).projectedFinish,p.afterFinish);
 assert.deepEqual(planningResourceTotals(portfolioResources(next)),r.options[1].preview.resourceAfter);
 assert.deepEqual(planningResourceScope(portfolioResources(next),next.projects.map(p=>p.id)),r.options[1].preview.resourceScope.after);
 assert.deepEqual(deserialize(serialize(next)),next);assert.equal(serialize(s),before);
 const history=listPortfolioPlanApplications(next);
 assert.equal(history.length,1);assert.equal(history[0].recordedCount,3);assert.equal(history[0].id,coordinationId);
 const deleted=removeProject(next,f.c.projectId),historical=listPortfolioPlanApplications(deleted)[0];
 assert.equal(historical.members.length,3);assert.equal(historical.recordedCount,2);
 assert.equal(historical.members.find(x=>x.projectId===f.c.projectId).available,false);
 assert.throws(()=>applyPortfolioPlanSet(next,r,'B',reason),/Портфель изменился/);
});
test('Stale or unavailable proposals do not erase a separate valid option',()=>{
 const f=coordinatedPortfolio(),s=editItem(f.snapshot,f.a.projectId,f.a.workId,{estimateDays:5});
 const r=comparePortfolioPlanSets(s,f.second,[f.pb,f.pc]);
 assert.equal(r.options[0].valid,false);assert.match(r.options[0].reason,/изменилась/);
 assert.equal(r.options[1].valid,true);assert.equal(r.options[1].canApply,true);
 assert.throws(()=>applyPortfolioPlanSet(s,r,'A',reason),/Выберите рассчитанный/);
 const missing=comparePortfolioPlanSets(s,[{projectId:f.a.projectId,changeId:'missing'}],[f.pb]);
 assert.equal(missing.options[0].valid,false);assert.equal(missing.options[1].valid,true);
 assert.throws(()=>comparePortfolioPlanSets(s,[f.pa,f.deadline]),/одна заявка/);
 assert.throws(()=>comparePortfolioPlanSets(s,[]),/от одной до четырёх/);
 assert.throws(()=>comparePortfolioPlanSets(s,[f.pa,f.pb,f.pc,f.deadline,f.pb]),/от одной до четырёх/);
});
test('Moving a control deadline does not remove its original lateness in the comparison',()=>{
 const f=coordinatedPortfolio(),o=comparePortfolioPlanSets(f.snapshot,[f.deadline]).options[0],p=row(o,f.a);
 assert.equal(o.valid,true);assert.equal(p.beforeSlip,1);assert.equal(p.afterSlip,0);
 assert.equal(o.assessment.deadlines.changedDeadline,1);
 assert.equal(o.assessment.deadlines.lateBefore,3);assert.equal(o.assessment.deadlines.lateAfter,3);
 assert.equal(o.assessment.deadlines.comparableSlipAfter,3);
 assert.equal(o.assessment.hasTradeoff,true);
});
test('Recalculation rejects modified receipts and same-revision snapshots with different contents',()=>{
 const f=coordinatedPortfolio(),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 const bad=structuredClone(r);bad.options[1].assessment.hasTradeoff=true;
 assert.throws(()=>applyPortfolioPlanSet(f.snapshot,bad,'B',reason),/Последствия варианта изменились/);
 const changed=structuredClone(f.snapshot);changed.projects[0].goal='Изменённая цель';
 assert.throws(()=>applyPortfolioPlanSet(changed,r,'B',reason),/Портфель изменился/);
 assert.throws(()=>applyPortfolioPlanSet(f.snapshot,r,'B',{rationale:'нет'}),/обоснование/);
 const single=comparePortfolioPlanSets(f.snapshot,[f.pa]);
 assert.throws(()=>applyPortfolioPlanSet(f.snapshot,single,'A',reason),/минимум два проекта/);
});
test('An approved set can add ordinary Work and dependencies without mutating control history',()=>{
 const f=coordinatedPortfolio(),p=f.b;
 const w=createItem(f.snapshot,p.projectId,{title:'Подготовка площадки',resourceId:f.padId,allocationPct:30});
 let s=editItem(w.state,p.projectId,w.id,{estimateDays:1});
 const q=planChange(s,p.projectId,{title:'Уточнить состав монтажа'});
 s=setPlanDependency(q.state,p.projectId,q.id,{from:w.id,to:p.workId,present:true}).state;
 s=addPlanWork(s,p.projectId,q.id,{title:'Контроль креплений',estimateDays:1,resourceId:f.padId,allocationPct:30}).state;
 s=decideChange(s,p.projectId,q.id,{status:'approved',rationale:'Уточнён технический состав работ.'}).state;
 const r=comparePortfolioPlanSets(s,[f.pa,{projectId:p.projectId,changeId:q.id}]),o=r.options[0];
 assert.equal(o.valid,true);assert.equal(o.preview.dependencyRows[0].projectId,p.projectId);assert.equal(o.preview.workSummary.added,1);
 const next=applyPortfolioPlanSet(s,r,'A',reason).state;
 assert.equal(project(next,p.projectId).items.length,3);
 assert.deepEqual(project(next,p.projectId).dependencies,[{from:w.id,to:p.workId}]);
 assert.deepEqual(project(next,p.projectId).planBaselines,project(s,p.projectId).planBaselines);
});
test('Historical coordination records must agree, but missing members are not reconstructed',()=>{
 const f=coordinatedPortfolio(),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 const next=applyPortfolioPlanSet(f.snapshot,r,'B',reason).state;
 for(const damage of [
  q=>{q.members.pop()},q=>{q.sourceRevision=-1},q=>{q.members[0].projectName='Переписанное прошлое'}
 ]){
  const copy=structuredClone(next);damage(project(copy,f.a.projectId).decisions.at(-1).coordination);
  assert.throws(()=>serialize(copy),/coordinated plan application/i);
 }
});
test('The coordinated history survives the existing IWXA carrier and independent import',async()=>{
 const f=coordinatedPortfolio(),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 const next=applyPortfolioPlanSet(f.snapshot,r,'B',reason).state;
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import('../desktop/src/iwxa-portfolio.mjs');
 const bytes=await buildIwxaPortfolio(next,{now:'2026-11-24T12:00:00.000Z'});
 const imported=await readIwxaPortfolio(bytes);
 assert.deepEqual(imported.snapshot,next);
 assert.deepEqual(listPortfolioPlanApplications(imported.snapshot),listPortfolioPlanApplications(next));
});
test('Scale: coordinated portfolio uses exact results on 120 projects and 1200 Works',()=>{
 let s=desktopLoadPortfolio();const refs=[];
 for(const p of s.projects.slice(0,4)){
  const q=planChange(s,p.id,{title:'Уточнить длительность '+p.name});
  s=setPlanWork(q.state,p.id,q.id,{itemId:p.items[0].id,estimateDays:2}).state;
  s=decideChange(s,p.id,q.id,{status:'approved',rationale:'Уточнён производственный график.'}).state;
  refs.push({projectId:p.id,changeId:q.id});
 }
 const raw=serialize(s),start=performance.now(),r=comparePortfolioPlanSets(s,refs.slice(0,2),refs),ms=performance.now()-start;
 assert.ok(r.options.every(o=>o.valid&&o.canApply&&o.preview.rows.length===120));
 const next=applyPortfolioPlanSet(s,r,'B',reason).state,after=portfolioSchedule(next);
 for(const row of r.options[1].preview.rows)assert.equal(after.byId.get(row.id).projectedFinish,row.afterFinish);
 assert.equal(serialize(s),raw);
 console.log('ATLAS12_PORTFOLIO_SET_SCALE projects=120 works=1200 options=2 ms='+ms.toFixed(2));
});
test('Desktop uses the original draft route and retains selection through project navigation',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const ui=read('desktop/src/PortfolioPlanSets.tsx'),main=read('desktop/src/main.tsx');
 assert.match(ui,/comparePortfolioPlanSets\(snapshot,first,second.length\?second:null\)/);
 assert.match(main,/applyPortfolioPlanSet\(latestSnapshot.current,comparison,optionId,\{rationale\}\)/);
 assert.match(main,/selection=\{portfolioPlanSelection\} onSelection=\{setPortfolioPlanSelection\}/);
 assert.match(main,/onOpen=\{\(pid,cid\)=>openProjectTab\(pid,"changes",cid\)\}/);
 assert.doesNotMatch(ui,/commitWithReadback\(|createTask\(|decideChange\(/);
});

test('Comparison uses an identical calendar cohort and flags lost forecasts and changed Work deadlines',()=>{
 const f=coordinatedPortfolio(),q=planChange(f.snapshot,f.c.projectId,{title:'Убрать дату начала из расчёта'});
 let s=setPlanDates(q.state,f.c.projectId,q.id,{startDate:null,dueDate:'2026-11-27'}).state;
 const r=comparePortfolioPlanSets(s,f.first,[...f.first,{projectId:f.c.projectId,changeId:q.id}]);
 assert.ok(r.options.every(o=>o.valid));
 assert.equal(r.summary.projectCount,4);assert.equal(r.summary.comparableProjects,3);
 assert.deepEqual(r.summary.columns.map(c=>c.late),[3,0,0]);
 assert.deepEqual(r.summary.columns.map(c=>c.slip),[3,0,0]);
 assert.deepEqual(r.summary.columns.map(c=>c.unknownProjects),[0,0,1]);
 assert.equal(r.options[1].assessment.deadlines.newlyUnknown,1);
 assert.equal(r.options[1].assessment.hasTradeoff,true);
 const work=planChange(f.snapshot,f.a.projectId,{title:'Перенести контроль работы'});
 s=setPlanWork(work.state,f.a.projectId,work.id,{itemId:f.a.workId,estimateDays:5,dueDate:'2026-11-29'}).state;
 const o=comparePortfolioPlanSets(s,[{projectId:f.a.projectId,changeId:work.id}]).options[0];
 assert.equal(o.valid,true);
 assert.equal(o.preview.workSummary.worsenedLate,1,'The ordinary comparison excludes the changed Work deadline');
 assert.equal(o.assessment.workDeadlines.worsenedLate,2,'Original Work due date and dependent commissioning both worsen');
 assert.equal(o.assessment.workDeadlines.changedDeadline,1);
});

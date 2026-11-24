import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {empty,createProject,createItem,editItem,editProject,serialize,createWorkCalendar} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {portfolioResources,projectResourceReassignment,resourceConflictPeriods} from '../src/portfolio-resources.mjs';
import {desktopLoadPortfolio} from './fixtures/desktop-portfolio-120.mjs';
import {previewWorkResourceReassignment,compareWorkResourceAlternatives,prepareResourceEditorChoice,assertResourceEditorChoiceCurrent} from '../src/resource-alternatives.mjs';

function fixture(){
 const a=createProject(empty(),{name:'Монтаж оборудования',type:'engineering'});
 let snapshot=editProject(a.state,a.id,{startDate:'2026-11-23'});
 const crane=addPlanningResource(snapshot,{label:'Кран',capacityPct:100});
 const lift=addPlanningResource(crane.state,{label:'Подъёмник',capacityPct:100});
 snapshot=lift.state;
 const first=createItem(snapshot,a.id,{title:'Разгрузка',resourceId:crane.id,allocationPct:70});
 snapshot=editItem(first.state,a.id,first.id,{estimateDays:3});
 const second=createItem(snapshot,a.id,{title:'Монтаж',resourceId:crane.id,allocationPct:60});
 snapshot=editItem(second.state,a.id,second.id,{estimateDays:3});
 return {snapshot,pid:a.id,first:first.id,second:second.id,crane:crane.id,lift:lift.id};
}
const run=(f,options={})=>previewWorkResourceReassignment(f.snapshot,{
 projectId:f.pid,workId:f.second,targetResourceId:f.lift
 },options);

test('Explicit reassignment preview compares current and alternative total overload without edits',()=>{
 const f=fixture(),raw=serialize(f.snapshot);
 const preview=run(f);
 assert.equal(preview.kind,'RESOURCE_ASSIGNMENT_COMPARISON');
 assert.equal(preview.original.overloadResourceDays,3);
 assert.equal(preview.alternative.overloadResourceDays,0);
 assert.equal(preview.overloadDaysDelta,-3);
 assert.equal(preview.unavailableDaysDelta,0);
 assert.equal(preview.source.overloadDays,3);
 assert.equal(preview.proposedSource.overloadDays,0);
 assert.equal(preview.target.overloadDays,0);
 assert.equal(preview.proposedTarget.overloadDays,0);
 assert.equal(preview.datesUnchanged,true);
 assert.equal(preview.unverified,false);
 assert.equal(preview.revision,f.snapshot.revision);
 assert.equal(preview.startDate,'2026-11-23');
 assert.equal(preview.finishDate,'2026-11-26');
 assert.equal(serialize(f.snapshot),raw,'Preview must not edit a draft or Store');
});

test('Reassignment does not conceal a newly overloaded alternative resource',()=>{
 const f=fixture();
 const onLift=createItem(f.snapshot,f.pid,{title:'Параллельный подъём',resourceId:f.lift,allocationPct:70});
 f.snapshot=editItem(onLift.state,f.pid,onLift.id,{estimateDays:3});
 const preview=run(f);
 assert.equal(preview.source.overloadDays,3);
 assert.equal(preview.proposedSource.overloadDays,0);
 assert.equal(preview.target.overloadDays,0);
 assert.equal(preview.proposedTarget.overloadDays,3);
 assert.equal(preview.overloadDaysDelta,0);
 assert.equal(preview.alternative.overloadedResources,1);
});

test('Availability outside declared window is measured, not called resolved by a transfer',()=>{
 const f=fixture();
 f.snapshot.resources.find(r=>r.id===f.lift).availableUntil='2026-11-24';
 const preview=run(f);
 assert.equal(preview.source.unavailableDays,0);
 assert.ok(preview.proposedTarget.unavailableDays>0);
 assert.ok(preview.unavailableDaysDelta>0);
 assert.equal(preview.original.unavailableResourceDays,0);
});

test('Unknown dates remain unknown; no invented improvement or personnel identity',()=>{
 const f=fixture();
 f.snapshot.projects[0].startDate=null;
 const preview=run(f);
 assert.equal(preview.unverified,true);
 assert.equal(preview.startDate,null);
 assert.equal(preview.finishDate,null);
 assert.equal(preview.original.overloadResourceDays,0);
 assert.equal(preview.alternative.overloadResourceDays,0);
 assert.match(preview.note,/реальной доступности/);
});

test('Invalid, identical or completed resource options cannot be compared',()=>{
 const f=fixture();
 assert.throws(()=>previewWorkResourceReassignment(f.snapshot,{projectId:f.pid,workId:f.second,targetResourceId:f.crane}),/другое/);
 assert.throws(()=>previewWorkResourceReassignment(f.snapshot,{projectId:f.pid,workId:f.second,targetResourceId:'missing'}),/не найден/);
 assert.throws(()=>previewWorkResourceReassignment(f.snapshot,{projectId:f.pid,workId:'missing',targetResourceId:f.lift}),/не найдена/);
 const done=editItem(f.snapshot,f.pid,f.second,{state:'done'});
 assert.throws(()=>previewWorkResourceReassignment(done,f.pid?{projectId:f.pid,workId:f.second,targetResourceId:f.lift}:{}),/Завершённую/);
});

test('Reuse the original schedule and capacity projection without changing its forecast',()=>{
 const f=fixture();
 const schedule=portfolioSchedule(f.snapshot),resources=portfolioResources(f.snapshot,{schedule});
 const initial=JSON.stringify(schedule.rows);
 const preview=run(f,{schedule,resources});
 assert.equal(preview.overloadDaysDelta,-3);
 assert.equal(JSON.stringify(schedule.rows),initial);
 assert.equal(resources.byId.get(f.crane).overloadDays,3);
 assert.equal(preview.source.itemCount,2);
 assert.equal(preview.proposedSource.itemCount,1);
});

test('UI presents both baselines and an explicit ordinary Work editor action',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 assert.match(main,/resourceComparisonId===r.id/);
 assert.match(main,/Сравнить варианты ресурса/);
 assert.match(main,/onOpenWork=\{\(pid,wid,comparison\)=>openEditorFor\(pid,"work:"\+wid,comparison\)\}/);
 assert.match(ui,/Плановая загрузка до и после изменения назначения/);
 assert.match(ui,/aria-label=\{'Варианты ресурсного назначения: '/);
 assert.match(ui,/role="status" aria-label=\{summary\}/);
 assert.match(ui,/Изменение дней перегрузки:/);
 assert.match(ui,/Сравните назначение Work/);
 assert.doesNotMatch(ui,/applyEditor\(|commitWithReadback\(|save\(\)/);
 assert.doesNotMatch(ui,/[—–]/);
});

test('Installed Windows resource comparison follows native Work editing without test-only labels',()=>{
 const native=readFileSync(new URL('../desktop/tests/installed-atlas12-resource-alternatives.py',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/atlas-0-11-v6-windows.yml',import.meta.url),'utf8');
 assert.match(native,/first_work=original\['projects'\]\[0\]\['items'\]\[0\]\['title'\]/);
 assert.match(native,/click_scrollable_button\(work_action\)/);
 assert.match(native,/ATLAS12_NATIVE_RESOURCE_TO_WORK_EDITOR_PASS/);
 assert.doesNotMatch(native,/\+FIRST\b/,'No undefined Python Work label may enter the installed scenario');
 assert.match(workflow,/desktop\/tests\/installed-atlas12-\*\.py/);
});

test('Fast transient Work projection agrees with the authoritative editItem and capacity engine',()=>{
 const f=fixture(),before=serialize(f.snapshot);
 const forecast=portfolioSchedule(f.snapshot);
 const resources=portfolioResources(f.snapshot,{schedule:forecast});
 const expectedState=editItem(f.snapshot,f.pid,f.second,{resourceId:f.lift});
 const expected=portfolioResources(expectedState,{schedule:forecast});
 const preview=run(f,{schedule:forecast,resources});
 assert.equal(preview.proposedSource.overloadDays,expected.byId.get(f.crane).overloadDays);
 assert.equal(preview.proposedSource.maxLoadPct,expected.byId.get(f.crane).maxLoadPct);
 assert.equal(preview.proposedTarget.overloadDays,expected.byId.get(f.lift).overloadDays);
 assert.equal(preview.proposedTarget.maxLoadPct,expected.byId.get(f.lift).maxLoadPct);
 assert.equal(preview.alternative.unavailableResourceDays,
  expected.people.reduce((n,r)=>n+r.unavailableDays,0));
 assert.equal(serialize(f.snapshot),before);
});


test('A compared target is carried into Work editor as a reversible form-only choice',()=>{
 const f=fixture(),saved=serialize(f.snapshot);
 const comparison=run(f);
 const proposed=prepareResourceEditorChoice(f.snapshot,comparison);
 assert.deepEqual(proposed,{
  projectId:f.pid,workId:f.second,revision:f.snapshot.revision,
  sourceResourceId:f.crane,targetResourceId:f.lift,
  sourceLabel:'Кран',targetLabel:'Подъёмник'
 });
 assert.deepEqual(assertResourceEditorChoiceCurrent(f.snapshot,proposed),proposed);
 assert.equal(serialize(f.snapshot),saved,'Preparing editor choice must not mutate Work');
 assert.equal(f.snapshot.projects[0].items.find(w=>w.id===f.second).resourceId,f.crane,
  'The original resource is unchanged until a user applies an edit');
});

test('A changed revision, Work, or resource invalidates an earlier comparison',()=>{
 const f=fixture(),proposal=prepareResourceEditorChoice(f.snapshot,run(f));
 assert.throws(()=>assertResourceEditorChoiceCurrent(
  editItem(f.snapshot,f.pid,f.second,{estimateDays:5}),proposal),/устарел/);
 const changed={...f.snapshot,projects:f.snapshot.projects.map(p=>({...p,
  items:p.items.map(w=>w.id===f.second?{...w,resourceId:f.lift}:w)}))};
 assert.throws(()=>assertResourceEditorChoiceCurrent(changed,proposal),/Назначение Work изменилось/);
 const unlinked={...f.snapshot,resources:f.snapshot.resources.filter(r=>r.id!==f.lift)};
 assert.throws(()=>assertResourceEditorChoiceCurrent(unlinked,proposal),/ресурс изменился/);
 assert.throws(()=>prepareResourceEditorChoice(f.snapshot,{kind:'UNTRUSTED'}),/Нет рассчитанного/);
 assert.throws(()=>assertResourceEditorChoiceCurrent(f.snapshot,{...proposal,
  targetResourceId:f.crane}),/устарел/);
});

test('The ordinary Work editor preselects the suggestion but never applies it automatically',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../desktop/src/style.css',import.meta.url),'utf8');
 assert.match(ui,/onOpenWork\(preview\.projectId,preview\.workId,preview\)/);
 assert.match(main,/prepareResourceEditorChoice\(data,comparison\)/);
 assert.match(main,/assertResourceEditorChoiceCurrent\(data,editor\.resourceProposal\)/);
 assert.match(main,/resourceId:editor\.resourceProposal\.targetResourceId/);
 assert.match(main,/if\(editor\.resourceProposal\)onDirtyChange\(true\)/);
 assert.match(main,/else onDirtyChange\(false\)/);
 assert.match(main,/Ресурс выбран в форме, но ещё не применён к черновику/);
 assert.match(main,/resourceProposal,sequenceProposal\}\);setInspector\(true\)/);
 assert.match(css,/\.atlas-resource-editor-proposal\{/);
 assert.doesNotMatch(ui,/applyEditor\(|commitWithReadback\(|save\(\)/);
});

test('Several resource options share authoritative calendar baseline without mutations',()=>{
 const f=fixture(),saved=serialize(f.snapshot);
 const third=addPlanningResource(f.snapshot,{label:'Автокран',capacityPct:100});
 f.snapshot=third.state;
 const forecast=portfolioSchedule(f.snapshot);
 const resources=portfolioResources(f.snapshot,{schedule:forecast});
 const before=serialize(f.snapshot);
 const page=compareWorkResourceAlternatives(f.snapshot,{projectId:f.pid,workId:f.second,
  offset:0,limit:1},{schedule:forecast,resources});
 const next=compareWorkResourceAlternatives(f.snapshot,{projectId:f.pid,workId:f.second,
  offset:1,limit:1},{schedule:forecast,resources});
 assert.equal(page.kind,'RESOURCE_ASSIGNMENT_OPTIONS');
 assert.equal(page.candidateCount,2);
 assert.equal(page.options.length,1);
 assert.equal(next.options.length,1);
 assert.notEqual(page.options[0].target.id,next.options[0].target.id);
 assert.equal(page.options[0].original.overloadResourceDays,3);
 assert.equal(next.options[0].original.overloadResourceDays,3);
 assert.equal(serialize(f.snapshot),before);
 assert.equal(resources.byId.get(f.crane).overloadDays,3);
 assert.notEqual(saved,before,'Adding a candidate is a normal portfolio change');
});

test('A shifted overload is a tradeoff even when portfolio conflict totals stay unchanged',()=>{
 const f=fixture();
 const parallel=createItem(f.snapshot,f.pid,{title:'Подъём груза',resourceId:f.lift,allocationPct:70});
 f.snapshot=editItem(parallel.state,f.pid,parallel.id,{estimateDays:3});
 const result=run(f);
 assert.equal(result.overloadDaysDelta,0);
 assert.equal(result.constraints.classification,'TRADEOFF');
 assert.equal(result.constraints.relieved[0].resourceId,f.crane);
 assert.equal(result.constraints.relieved[0].fullyCleared,true);
 assert.equal(result.constraints.introduced[0].resourceId,f.lift);
 assert.equal(result.constraints.introduced[0].days,3);
 assert.equal(result.constraints.outlook,'KNOWN_RESOURCE_CONFLICTS');
});

test('An improved alternative distinguishes no known overload from true feasibility',()=>{
 const f=fixture(),result=run(f);
 assert.equal(result.constraints.classification,'IMPROVED');
 assert.equal(result.constraints.relieved[0].days,3);
 assert.equal(result.constraints.introduced.length,0);
 assert.equal(result.constraints.outlook,'NO_KNOWN_RESOURCE_CONFLICTS');
 assert.equal(result.datesUnchanged,true);
});

test('Unknown dates do not turn a clean resource projection into verified readiness',()=>{
 const f=fixture();f.snapshot.projects[0].startDate=null;
 const result=run(f);
 assert.equal(result.constraints.outlook,'DATES_INCOMPLETE');
 assert.equal(result.unverified,true);
});

test('Candidate pages reject invalid selection without changing the source portfolio',()=>{
 const f=fixture(),saved=serialize(f.snapshot);
 for(const options of [{offset:-1},{limit:0},{limit:13},{offset:1.5}]){
  assert.throws(()=>compareWorkResourceAlternatives(f.snapshot,{
   projectId:f.pid,workId:f.second,...options}),/страница/);
 }
 assert.equal(serialize(f.snapshot),saved);
});

test('Comparison UI displays all options, their tradeoffs and a review-only choice',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const style=readFileSync(new URL('../desktop/src/style.css',import.meta.url),'utf8');
 assert.match(ui,/compareWorkResourceAlternatives\(snapshot/);
 assert.match(ui,/Сравнение нескольких ресурсных альтернатив/);
 assert.match(ui,/Новый конфликт:/);
 assert.match(ui,/Компромисс/);
 assert.match(ui,/setChosenTarget\(option\.target\.id\)/);
 assert.match(ui,/setPage\(p=>p\+1\)/);
 assert.match(style,/\.atlas-resource-options-list/);
 assert.doesNotMatch(ui,/commitWithReadback\(|applyEditor\(|save\(\)/);
});

test('Resource choice reports original Work and project deadlines without fabricated schedule gains',()=>{
 const f=fixture();
 const edited=editProject(f.snapshot,f.pid,{dueDate:'2026-11-25'});
 f.snapshot=editItem(edited,f.pid,f.second,{dueDate:'2026-11-24'});
 const before=serialize(f.snapshot);
 const result=run(f);
 assert.equal(result.controlDates.work.forecastFinish,'2026-11-26');
 assert.equal(result.controlDates.work.controlDate,'2026-11-24');
 assert.equal(result.controlDates.work.slipDays,2);
 assert.equal(result.controlDates.work.status,'CALENDAR_LATE');
 assert.equal(result.controlDates.project.forecastFinish,'2026-11-26');
 assert.equal(result.controlDates.project.controlDate,'2026-11-25');
 assert.equal(result.controlDates.project.slipDays,1);
 assert.equal(result.controlDates.calendarForecastUnchanged,true);
 assert.match(result.controlDates.note,/не изменяет даты CPM/);
 assert.equal(serialize(f.snapshot),before);
});

test('An absent project control date is unknown, not a delivered on-time plan',()=>{
 const f=fixture(),result=run(f);
 assert.equal(result.controlDates.project.controlDate,null);
 assert.equal(result.controlDates.project.status,'CONTROL_DATE_UNKNOWN');
 assert.equal(result.controlDates.project.slipDays,null);
 assert.equal(result.controlDates.work.controlDate,null);
});

test('Undated Work and project forecasts preserve explicit unknown statuses',()=>{
 const f=fixture();
 f.snapshot.projects[0].startDate=null;
 const result=run(f);
 assert.equal(result.controlDates.project.forecastFinish,null);
 assert.equal(result.controlDates.project.status,'FORECAST_UNKNOWN');
 assert.equal(result.controlDates.work.status,'FORECAST_UNKNOWN');
 assert.equal(result.controlDates.calendarForecastUnchanged,true);
});

test('The multiple-choice view is on-demand and keeps the Work editor action first',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const style=readFileSync(new URL('../desktop/src/style.css',import.meta.url),'utf8');
 const native=readFileSync(new URL('../desktop/tests/installed-atlas12-resource-alternatives.py',import.meta.url),'utf8');
 assert.match(ui,/\[showAll,setShowAll\]=useState\(false\)/);
 assert.match(ui,/if\(!showAll\|\|!work\|\|!alternatives\.length\)return null/);
 assert.match(ui,/Контрольные сроки и ресурсные ограничения/);
 assert.match(ui,/Показать все варианты/);
 assert.ok(ui.indexOf('Открыть Work с выбранным ресурсом')<
  ui.indexOf('Сравнение нескольких ресурсных альтернатив'),
  'The ordinary Work action must precede the optional full list');
 assert.match(ui,/aria-expanded=\{showAll\}/);
 assert.match(style,/\.atlas-resource-deadlines\{/);
 assert.match(native,/ATLAS12_NATIVE_MULTIPLE_OPTIONS_TRADEOFF_PASS/);
 assert.match(native,/820,650,True/);
});

test('First resource assignment decreases the number of unlinked works without editing the snapshot',()=>{
 const f=fixture();
 const loose=createItem(f.snapshot,f.pid,{title:'Не назначено',assignee:'Сотрудник',allocationPct:30});
 f.snapshot=editItem(loose.state,f.pid,loose.id,{estimateDays:3});
 const saved=serialize(f.snapshot);
 const selection={projectId:f.pid,workId:loose.id,targetResourceId:f.lift};
 const result=previewWorkResourceReassignment(f.snapshot,selection);
 assert.equal(result.source.id,null);
 assert.equal(result.original.unlinkedWork,1);
 assert.equal(result.alternative.unlinkedWork,0);
 assert.equal(result.constraints.assignmentAdded,true);
 assert.equal(result.proposedTarget.itemCount,1);
 assert.equal(result.proposedTarget.maxLoadPct,30);
 const choice=prepareResourceEditorChoice(f.snapshot,result);
 assert.equal(choice.sourceResourceId,null);
 assert.equal(choice.sourceLabel,'Без привязки к ресурсу');
 assert.deepEqual(assertResourceEditorChoiceCurrent(f.snapshot,choice),choice);
 assert.equal(serialize(f.snapshot),saved);
 assert.equal(compareWorkResourceAlternatives(f.snapshot,{projectId:f.pid,workId:loose.id}).candidateCount,2);
 const applied=editItem(f.snapshot,f.pid,loose.id,{resourceId:f.lift});
 assert.throws(()=>assertResourceEditorChoiceCurrent(applied,choice),/устарел/);
 assert.equal(portfolioResources(applied).byId.get(f.lift).maxLoadPct,result.proposedTarget.maxLoadPct);
});

test('An otherwise clean resource plan with remaining unlinked Work must not claim full coverage',()=>{
 const f=fixture(),loose=createItem(f.snapshot,f.pid,{title:'Без ресурса'});
 f.snapshot=loose.state;
 const result=run(f);
 assert.equal(result.alternative.overloadResourceDays,0);
 assert.equal(result.alternative.unlinkedWork,1);
 assert.equal(result.constraints.outlook,'ASSIGNMENTS_INCOMPLETE');
});

test('Fast resource projection matches canonical portfolio calculations for 120 projects, 1200 Work and 12 alternatives',()=>{
 const snapshot=desktopLoadPortfolio();
 snapshot.resources=Array.from({length:16},(_,i)=>({
  id:'res-'+i,label:'Ресурс '+String(i).padStart(2,'0'),capacityPct:80+(i%4)*20,
  availableFrom:i%3===0?'2026-11-04':null,availableUntil:i%5===0?'2026-11-14':null
 }));
 for(const [i,p] of snapshot.projects.entries()){
  for(const [j,w] of p.items.entries()){
   w.resourceId='res-'+((i+j)%16);
   w.allocationPct=20+((i+j)%5)*15;
  }
 }
 const projectId=snapshot.projects[0].id,workId=snapshot.projects[0].items[0].id;
 const schedule=portfolioSchedule(snapshot),resources=portfolioResources(snapshot,{schedule});
 const saved=serialize(snapshot),before=JSON.stringify(resources.work);
 const start=performance.now();
 const page=compareWorkResourceAlternatives(snapshot,{projectId,workId,limit:12},{schedule,resources});
 const optimizedMs=performance.now()-start;
 assert.equal(page.options.length,12);
 const keys=['itemCount','projectCount','scheduledDays','occupiedCalendarDays','datedWork','undatedWork',
  'maxLoadPct','maxConcurrent','overlapDays','overloadDays','unavailableDays'];
 let canonicalMs=0;
 for(const option of page.options){
  const projected=projectResourceReassignment(resources,{projectId,workId,targetResourceId:option.target.id});
  const candidate=editItem(snapshot,projectId,workId,{resourceId:option.target.id});
  const canonicalStart=performance.now();
  const expected=portfolioResources(candidate,{schedule});
  canonicalMs+=performance.now()-canonicalStart;
  for(const [observed,id] of [[projected.sourceAfter,option.source.id],[projected.targetAfter,option.target.id]]){
   const group=expected.byId.get(id);
   for(const k of keys)assert.equal(observed[k],group[k],id+' '+k);
  }
  assert.equal(option.alternative.overloadResourceDays,expected.people.reduce((n,r)=>n+r.overloadDays,0));
  assert.equal(option.alternative.unavailableResourceDays,expected.people.reduce((n,r)=>n+r.unavailableDays,0));
  assert.equal(option.alternative.overloadedResources,expected.totals.potentialConflicts);
  assert.equal(option.alternative.unavailableResources,expected.totals.outsideAvailability);
  assert.equal(option.alternative.unlinkedWork,expected.totals.unlinked);
  assert.equal(option.datesUnchanged,true);
 }

 console.log('ATLAS12_RESOURCE_SCALE_PARITY options=12 projects=120 works=1200 fast_ms='+optimizedMs.toFixed(2)+
  ' canonical_ms='+canonicalMs.toFixed(2));
 assert.equal(serialize(snapshot),saved);
 assert.equal(JSON.stringify(resources.work),before);
});

test('Unlinked resource coverage has its own accessible entry in the existing resource view',()=>{
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 assert.match(main,/Работы без планового ресурса:/);
 assert.match(main,/resourceId=\{null\}/);
 assert.match(main,/Рассмотреть назначение работ без ресурса/);
 assert.match(ui,/ASSIGNMENTS_INCOMPLETE/);
 assert.match(ui,/Первое назначение/);
 assert.match(ui,/role="region" aria-label="Контрольные сроки и ресурсные ограничения"/);
 assert.doesNotMatch(ui,/commitWithReadback\(|applyEditor\(|save\(\)/);
});

test('First assignment preserves exact working-day occupancy including weekends and excluded dates',()=>{
 const f=fixture();
 f.snapshot=editProject(f.snapshot,f.pid,{startDate:'2026-11-20'});
 const cal=createWorkCalendar(f.snapshot,{name:'График работы',weekdays:[1,2,3,4,5],
  excludedDates:['2026-11-23'],additionalWorkingDates:[],source:{kind:'entered_by_user',reference:null}});
 const loose=createItem(cal.state,f.pid,{title:'Работа по графику',allocationPct:60});
 f.snapshot=editItem(loose.state,f.pid,loose.id,{estimateDays:2,durationUnit:'working_days',
  calendarBasis:{id:cal.id,version:cal.version}});
 const schedule=portfolioSchedule(f.snapshot),resources=portfolioResources(f.snapshot,{schedule});
 const original=resources.work.find(w=>w.id===loose.id);
 assert.equal(original.resourceId,null);
 assert.equal(original.startDate,'2026-11-20');
 assert.equal(original.finishDate,'2026-11-25');
 assert.equal(original.activeRanges.length,2);
 const selection={projectId:f.pid,workId:loose.id,targetResourceId:f.lift};
 const preview=previewWorkResourceReassignment(f.snapshot,selection,{schedule,resources});
 const candidate=editItem(f.snapshot,f.pid,loose.id,{resourceId:f.lift});
 const expected=portfolioResources(candidate,{schedule}).byId.get(f.lift);
 assert.equal(preview.proposedTarget.maxLoadPct,60);
 assert.equal(preview.proposedTarget.overloadDays,0);
 assert.equal(preview.proposedTarget.maxLoadPct,expected.maxLoadPct);
 assert.equal(preview.finishDate,original.finishDate);
 assert.equal(resources.byId.get(f.lift).itemCount,0);
});

test('Conflict explanation identifies the exact overlapping Work and dates before and after a transfer',()=>{
 const f=fixture();
 const parallel=createItem(f.snapshot,f.pid,{title:'Подача оборудования',resourceId:f.lift,allocationPct:70});
 f.snapshot=editItem(parallel.state,f.pid,parallel.id,{estimateDays:3});
 const saved=serialize(f.snapshot),view=portfolioResources(f.snapshot);
 const group=view.byId.get(f.crane),before=resourceConflictPeriods(group);
 assert.equal(before.periodCount,1);
 assert.equal(before.overloadDays,3);
 assert.equal(before.period.startDate,'2026-11-23');
 assert.equal(before.period.endDate,'2026-11-25');
 assert.equal(before.period.loadPct,130);
 assert.equal(before.period.capacityPct,100);
 assert.deepEqual(new Set(before.period.works.map(w=>w.workId)),new Set([f.first,f.second]));
 assert.equal(before.period.projectCount,1);
 const projected=projectResourceReassignment(view,{projectId:f.pid,workId:f.second,targetResourceId:f.lift});
 assert.equal(resourceConflictPeriods(projected.sourceAfter).periodCount,0);
 const after=resourceConflictPeriods(projected.targetAfter);
 assert.equal(after.period.loadPct,130);
 assert.deepEqual(new Set(after.period.works.map(w=>w.workId)),new Set([f.second,parallel.id]));
 assert.equal(after.overloadDays,3);
 assert.equal(serialize(f.snapshot),saved);
});

test('Exact conflict segments respect availability boundaries, calendar gaps and zero-day work',()=>{
 const f=fixture();
 f.snapshot=editProject(f.snapshot,f.pid,{startDate:'2026-11-20'});
 const cal=createWorkCalendar(f.snapshot,{name:'График',weekdays:[1,2,3,4,5],
  excludedDates:['2026-11-23'],additionalWorkingDates:[],source:{kind:'entered_by_user',reference:null}});
 f.snapshot=editItem(cal.state,f.pid,f.first,{estimateDays:2,durationUnit:'working_days',
  calendarBasis:{id:cal.id,version:cal.version}});
 f.snapshot=editItem(f.snapshot,f.pid,f.second,{estimateDays:5});
 const marker=createItem(f.snapshot,f.pid,{title:'Веха',resourceId:f.crane,allocationPct:100});
 f.snapshot=editItem(marker.state,f.pid,marker.id,{estimateDays:0});
 f.snapshot.resources.find(r=>r.id===f.crane).availableFrom='2026-11-21';
 const g=portfolioResources(f.snapshot).byId.get(f.crane);
 const first=resourceConflictPeriods(g),second=resourceConflictPeriods(g,{offset:1});
 assert.equal(first.periodCount,2);
 assert.equal(first.period.kind,'availability');
 assert.equal(first.period.startDate,'2026-11-20');
 assert.equal(first.period.endDate,'2026-11-20');
 assert.equal(second.period.kind,'overload');
 assert.equal(second.period.startDate,'2026-11-24');
 assert.equal(second.period.endDate,'2026-11-24');
 assert.equal(first.period.days+second.period.days,g.overloadDays+g.unavailableDays);
 assert.equal(first.period.works.some(w=>w.workId===marker.id),false);
 assert.equal(resourceConflictPeriods(g,{offset:2}).period,null);
});

test('Conflict contributors retain project identity and have bounded pages even for duplicate names',()=>{
 const f=fixture();
 const newProject=createProject(f.snapshot,{name:'Второй проект',type:'engineering'});
 f.snapshot=editProject(newProject.state,newProject.id,{startDate:'2026-11-23'});
 for(let i=0;i<9;i++){
  const w=createItem(f.snapshot,newProject.id,{title:'Разгрузка',resourceId:f.crane,allocationPct:10});
  f.snapshot=editItem(w.state,newProject.id,w.id,{estimateDays:3});
 }
 const group=portfolioResources(f.snapshot).byId.get(f.crane);
 const a=resourceConflictPeriods(group,{workLimit:6}),b=resourceConflictPeriods(group,{workLimit:6,workOffset:6});
 assert.equal(a.period.projectCount,2);
 assert.equal(a.period.workCount,11);
 assert.equal(a.period.works.length,6);
 assert.equal(b.period.works.length,5);
 const all=[...a.period.works,...b.period.works];
 assert.equal(new Set(all.map(w=>JSON.stringify([w.projectId,w.workId]))).size,11);
 assert.equal(all.reduce((n,w)=>n+w.allocationPct,0),a.period.loadPct);
 assert.equal(resourceConflictPeriods(group,{workOffset:100,workLimit:6}).period.workOffset,6);
 assert.throws(()=>resourceConflictPeriods(group,{workLimit:31}),/запрос/);
});

test('Undated projects never produce invented conflict dates',()=>{
 const f=fixture();f.snapshot.projects[0].startDate=null;
 const result=resourceConflictPeriods(portfolioResources(f.snapshot).byId.get(f.crane));
 assert.equal(result.periodCount,0);
 assert.equal(result.undatedWork,2);
 assert.equal(result.period,null);
});

test('Desktop conflict periods use the canonical projection and normal Work editor',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const native=readFileSync(new URL('../desktop/tests/installed-atlas12-resource-alternatives.py',import.meta.url),'utf8');
 assert.match(ui,/resourceConflictPeriods\(group/);
 assert.match(ui,/if\(!show\)return \[\]/);
 assert.match(ui,/onOpenWork\(w\.projectId,w\.workId,null\)/);
 assert.match(native,/GetClientRect/);
 assert.match(native,/ATLAS12_NATIVE_RESOURCE_CONFLICT_PERIOD_PASS/);
 assert.match(native,/ATLAS12_NATIVE_TRANSFERRED_CONFLICT_PERIOD_PASS/);
 assert.doesNotMatch(ui,/applyEditor\(|commitWithReadback\(/);
});

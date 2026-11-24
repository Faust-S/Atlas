import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {empty,createProject,editProject,createItem,editItem,connect,serialize,createWorkCalendar} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {addPortfolioLink} from '../src/portfolio.mjs';
import {portfolioResources} from '../src/portfolio-resources.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {editorSpec,applyEditor} from '../src/editor.mjs';
import {compareResourceSequenceAlternatives,prepareResourceSequenceChoice,assertResourceSequenceChoiceCurrent} from '../src/resource-sequence-alternatives.mjs';

function fixture(){
 const p=createProject(empty(),{name:'Монтаж',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:'2026-11-26'});
 const crane=addPlanningResource(s,{label:'Кран',capacityPct:100});
 const a=createItem(crane.state,p.id,{title:'Разгрузка',resourceId:crane.id,allocationPct:70});
 s=editItem(a.state,p.id,a.id,{estimateDays:3,dueDate:'2026-11-26'});
 const b=createItem(s,p.id,{title:'Монтаж',resourceId:crane.id,allocationPct:60});
 s=editItem(b.state,p.id,b.id,{estimateDays:3,dueDate:'2026-11-26'});
 return {s,pid:p.id,a:a.id,b:b.id,rid:crane.id};
}
const compare=f=>compareResourceSequenceAlternatives(f.s,{projectId:f.pid,firstWorkId:f.a,secondWorkId:f.b});
test('Two explicit sequence alternatives clear the original overload but expose the schedule cost',()=>{
 const f=fixture(),before=serialize(f.s),result=compare(f);
 assert.equal(result.alternatives.length,2);
 for(const o of result.alternatives){
  assert.equal(o.valid,true);
  assert.equal(o.before.overloadDays,3);
  assert.equal(o.after.overloadDays,0);
  assert.equal(o.source.overloadAfter,0);
  assert.equal(o.project.beforeFinish,'2026-11-26');
  assert.equal(o.project.afterFinish,'2026-11-29');
  assert.equal(o.project.afterSlip,3);
  assert.equal(o.affected.deadlineNewMissedTotal,1);
  assert.equal(o.fromBefore.finish,o.fromAfter.finish);
  assert.equal(o.toAfter.start,'2026-11-26');
  assert.equal(o.toAfter.finish,'2026-11-29');
 }
 assert.equal(result.alternatives[0].from,f.a);
 assert.equal(result.alternatives[1].from,f.b);
 assert.equal(serialize(f.s),before);
});

test('A sequence shift propagates through the original portfolio DAG and exposes another resource conflict',()=>{
 const f=fixture();
 const team=addPlanningResource(f.s,{label:'Бригада',capacityPct:100});
 const next=createProject(team.state,{name:'Подключение',type:'engineering'});
 let s=editProject(next.state,next.id,{startDate:'2026-11-23',dueDate:'2026-11-28'});
 const downstream=createItem(s,next.id,{title:'Подключить',resourceId:team.id,allocationPct:100});
 s=editItem(downstream.state,next.id,downstream.id,{estimateDays:2});
 s=addPortfolioLink(s,{from:f.pid,to:next.id});
 const other=createProject(s,{name:'Независимый проект',type:'engineering'});
 s=editProject(other.state,other.id,{startDate:'2026-11-29'});
 const another=createItem(s,other.id,{title:'Пуск',resourceId:team.id,allocationPct:100});
 s=editItem(another.state,other.id,another.id,{estimateDays:2});
 f.s=s;
 const before=serialize(s),result=compare(f);
 for(const o of result.alternatives){
  assert.equal(o.valid,true);
  assert.equal(o.portfolio.affectedTotal,1);
  assert.equal(o.portfolio.newDeadlineRisks,1);
  assert.equal(o.portfolio.rows[0].projectedFinish,'2026-12-01');
  assert.equal(o.source.overloadAfter,0);
  assert.equal(o.after.overloadDays,2);
  assert.equal(o.worsenedResources,1);
  assert.equal(o.resourceExamples.find(r=>r.id===team.id).overloadDelta,2);
 }
 assert.equal(serialize(s),before);
});

test('Working-day sequence respects pinned calendars and weekends without changing duration or dates entered by user',()=>{
 const f=fixture();
 f.s=editProject(f.s,f.pid,{startDate:'2026-11-20'});
 const cal=createWorkCalendar(f.s,{name:'Рабочая неделя',weekdays:[1,2,3,4,5],
  excludedDates:['2026-11-23'],additionalWorkingDates:[],source:{kind:'entered_by_user',reference:null}});
 f.s=editItem(cal.state,f.pid,f.a,{estimateDays:2,durationUnit:'working_days',calendarBasis:{id:cal.id,version:cal.version}});
 f.s=editItem(f.s,f.pid,f.b,{estimateDays:2,durationUnit:'working_days',calendarBasis:{id:cal.id,version:cal.version}});
 const o=compare(f).alternatives[0];
 assert.equal(o.valid,true);
 assert.equal(o.before.overloadDays,2);
 assert.equal(o.after.overloadDays,0);
 assert.equal(o.fromAfter.finish,'2026-11-25');
 assert.equal(o.toAfter.start,'2026-11-25');
 assert.equal(o.toAfter.finish,'2026-11-27');
 assert.equal(o.project.afterFinish,'2026-11-27');
});

test('Ordinary dependency editor receives a checked proposed edge; only applying it changes the draft',()=>{
 const f=fixture(),before=serialize(f.s),option=compare(f).alternatives[0];
 const choice=prepareResourceSequenceChoice(f.s,option);
 assert.equal(choice.from,f.a);
 assert.equal(choice.to,f.b);
 const project=f.s.projects[0];
 const action='dep-to:'+encodeURIComponent(choice.to);
 assert.ok(editorSpec(project,action,f.s).fields[0].options.some(x=>x.value===choice.from));
 assert.equal(assertResourceSequenceChoiceCurrent(f.s,choice).from,f.a);
 assert.equal(serialize(f.s),before);
 const changed=applyEditor(f.s,f.pid,action,{get:name=>name==='from'?choice.from:''}).state;
 assert.deepEqual(changed.projects[0].dependencies,[{from:f.a,to:f.b}]);
 assert.deepEqual(changed.projects[0].items,f.s.projects[0].items);
 assert.equal(portfolioResources(changed).byId.get(f.rid).overloadDays,0);
 assert.equal(portfolioSchedule(changed).byId.get(f.pid).projectedFinish,'2026-11-29');
 assert.throws(()=>assertResourceSequenceChoiceCurrent(changed,choice),/устарел/);
 assert.equal(serialize(f.s),before);
});

test('Reject nonconflicting, started, foreign and stale sequence proposals',()=>{
 const f=fixture();
 const choice=compare(f).alternatives[0];
 assert.throws(()=>compareResourceSequenceAlternatives(f.s,{projectId:f.pid,firstWorkId:f.a,secondWorkId:f.a}),/две разные/);
 assert.throws(()=>compareResourceSequenceAlternatives(f.s,{projectId:f.pid,firstWorkId:f.a,secondWorkId:'other'}),/не найдены/);
 assert.throws(()=>compare({...f,s:editItem(f.s,f.pid,f.b,{state:'in_progress'})}),/не начатых/);
 assert.throws(()=>compare({...f,s:editItem(f.s,f.pid,f.b,{actualStartDate:'2026-11-23'})}),/не начатых/);
 assert.throws(()=>compare({...f,s:connect(f.s,f.pid,f.a,f.b)}),/не пересекаются/);
 assert.throws(()=>compare({...f,s:editItem(f.s,f.pid,f.b,{allocationPct:20})}),/не пересекаются/);
 assert.throws(()=>compare({...f,s:editItem(f.s,f.pid,f.b,{resourceId:null})}),/общего/);
 assert.throws(()=>prepareResourceSequenceChoice({...f.s,revision:f.s.revision+1},choice),/устарел/);
 const sameRevision=structuredClone(f.s);
 sameRevision.projects[0].items[1].allocationPct=20;
 assert.throws(()=>prepareResourceSequenceChoice(sameRevision,choice),/не пересекаются/);
});

test('Availability-only conflicts do not invent a sequence solution',()=>{
 const f=fixture();
 f.s.resources[0].availableFrom='2026-11-27';
 assert.throws(()=>compare(f),/не пересекаются/);
});

test('Sequence desktop uses the ordinary dependency form and real Save qualification, not a hidden apply path',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const native=readFileSync(new URL('../desktop/tests/installed-atlas12-resource-alternatives.py',import.meta.url),'utf8');
 assert.match(ui,/compareResourceSequenceAlternatives\(snapshot/);
 assert.match(ui,/allowSequence=\{choice.key==='source-now'\|\|choice.key==='target-now'\}/);
 assert.match(ui,/onOpenSequence\(option.projectId,option\)/);
 assert.match(main,/prepareResourceSequenceChoice\(data,comparison\)/);
 assert.match(main,/assertResourceSequenceChoiceCurrent\(data,editor.sequenceProposal\)/);
 assert.match(main,/form.get\("from"\)!==editor.sequenceProposal.from/);
 assert.match(main,/openEditorFor\(pid,"dep-to:"\+encodeURIComponent\(option.to\),option\)/);
 assert.match(native,/ATLAS12_NATIVE_SEQUENCE_ALTERNATIVES_PASS/);
 assert.match(native,/ATLAS12_NATIVE_SEQUENCE_SAVE_COLD_RESTORE_PASS/);
 assert.doesNotMatch(ui,/applyEditor\(|commitWithReadback\(/);
});

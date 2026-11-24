import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {empty,createProject,createItem,editProject,editItem,createWorkCalendar,connect,serialize,deserialize} from '../src/core.mjs';
import {planChange,decideChange} from '../src/trace.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {editorSpec,applyEditor} from '../src/editor.mjs';
import {setPlanWork,setPlanDates,setPlanDependency,inspectPlanAmendment,planAmendmentReviewAction,
 parsePlanAmendmentReviewAction,reviewPlanAmendmentAction,previewPlanAmendment,applyPlanAmendment,
 renderProjectPlanAmendments} from '../src/plan-amendment.mjs';
const values=o=>({get:k=>o[k]??''});
const getChange=(s,f)=>s.projects[0].changes.find(c=>c.id===f.cid);
const getWork=(s,f)=>s.projects[0].items.find(w=>w.id===f.wid);
const inspect=(s,f)=>inspectPlanAmendment(s,f.pid,f.cid);
const reviewAction=(s,f,k='work:'+f.wid)=>planAmendmentReviewAction(f.cid,k,s.revision);
const request=(s,f,k)=>parsePlanAmendmentReviewAction(reviewAction(s,f,k));
const applyReview=(s,f,fields={},k)=>{
 const action=reviewAction(s,f,k),spec=editorSpec(s.projects[0],action,s);
 const defaults=Object.fromEntries(spec.fields.map(x=>[x.name,x.value]));
 return applyEditor(s,f.pid,action,values({...defaults,...fields,confirmReview:'review'}));
};
function fixture(){
 const p=createProject(empty(),{name:'Монтаж',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:'2026-12-05'});
 const a=addPlanningResource(s,{label:'Кран',capacityPct:100});
 const b=addPlanningResource(a.state,{label:'Подъёмник',capacityPct:100});
 const w=createItem(b.state,p.id,{title:'Установка',assignee:'Бригада A',resourceId:a.id,allocationPct:70,dueDate:'2026-11-30'});
 s=editItem(w.state,p.id,w.id,{estimateDays:3});
 const second=createItem(s,p.id,{title:'Проверка'});
 const c=planChange(second.state,p.id,{title:'Изменение монтажного плана'});
 return {s:c.state,pid:p.id,wid:w.id,second:second.id,cid:c.id,a:a.id,b:b.id};
}
const propose=(f,extra={})=>setPlanWork(f.s,f.pid,f.cid,{itemId:f.wid,estimateDays:5,...extra}).state;
const approve=(s,f)=>decideChange(s,f.pid,f.cid,{status:'approved',rationale:'Reviewed current forecast'}).state;

test('Independent current assignment and dates survive a duration proposal review through the ordinary editor',()=>{
 const f=fixture(),draft=propose(f);
 const changed=editItem(draft,f.pid,f.wid,{assignee:'Бригада B',resourceId:f.b,allocationPct:60,dueDate:'2026-12-02'}),saved=serialize(changed);
 assert.throws(()=>previewPlanAmendment(changed,f.pid,f.cid),/изменилась/);
 const view=inspect(changed,f);assert.equal(view.editable,true);assert.equal(view.rows.length,1);
 const row=view.rows[0];assert.equal(row.title,'Установка');assert.equal(row.canReview,true);
 const byName=new Map(row.fields.map(x=>[x.name,x]));
 assert.equal(byName.get('estimateDays').state,'PROPOSED_ONLY');
 for(const field of ['assignee','resourceId','allocationPct','dueDate'])assert.equal(byName.get(field).state,'CURRENT_ONLY');
 assert.equal(byName.get('resourceId').beforeLabel,'Кран');assert.equal(byName.get('resourceId').currentLabel,'Подъёмник');
 assert.equal(serialize(changed),saved);
 const spec=editorSpec(changed.projects[0],reviewAction(changed,f),changed);
 assert.deepEqual(spec.fields.map(x=>[x.name,x.value]),[['review_estimateDays','proposed'],['confirmReview','']]);
 assert.match(spec.hint,/Бригада B/);
 assert.throws(()=>applyEditor(changed,f.pid,reviewAction(changed,f),values({review_estimateDays:'proposed'})),/Подтвердите/);
 assert.throws(()=>setPlanWork(changed,f.pid,f.cid,{itemId:f.wid,estimateDays:5,assignee:'Бригада A'}),/изменилась/);
 const result=applyReview(changed,f);assert.equal(result.removed,false);
 assert.deepEqual(result.state.projects[0].items,changed.projects[0].items);
 assert.deepEqual(getChange(result.state,f).planAmendments[0].after,{estimateDays:5,assignee:'Бригада B',dueDate:'2026-12-02',resourceId:f.b,allocationPct:60});
 assert.equal(inspect(result.state,f).rows.length,0);
 assert.equal(previewPlanAmendment(result.state,f.pid,f.cid).rows[0].afterFinish,'2026-11-28');
 const applied=applyPlanAmendment(approve(result.state,f),f.pid,f.cid).state;
 assert.equal(getWork(applied,f).estimateDays,5);assert.equal(getWork(applied,f).assignee,'Бригада B');
 assert.equal(getWork(applied,f).resourceId,f.b);assert.equal(getWork(applied,f).dueDate,'2026-12-02');
 assert.equal(serialize(changed),saved);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
});

test('Concurrent changes to the same duration require explicit choice and stale review forms cannot silently repin',()=>{
 const f=fixture(),changed=editItem(propose(f),f.pid,f.wid,{estimateDays:7}),saved=serialize(changed);
 const field=inspect(changed,f).rows[0].fields.find(x=>x.name==='estimateDays');
 assert.equal(field.state,'CONFLICT');assert.equal(field.required,true);assert.deepEqual([field.before,field.current,field.proposed],[3,7,5]);
 const spec=editorSpec(changed.projects[0],reviewAction(changed,f),changed);
 assert.equal(spec.fields[0].value,'');
 assert.throws(()=>applyReview(changed,f),/Выберите значение/);
 assert.throws(()=>reviewPlanAmendmentAction(changed,f.pid,request(changed,f),{estimateDays:'unknown'}),/Выберите значение/);
 assert.throws(()=>reviewPlanAmendmentAction(changed,f.pid,request(changed,f),{estimateDays:'proposed',actualFinishDate:'proposed'}),/Недопустимые/);
 const later=editItem(changed,f.pid,f.wid,{assignee:'Another'});
 assert.throws(()=>applyEditor(later,f.pid,reviewAction(changed,f),values({review_estimateDays:'proposed',confirmReview:'review'})),/План изменился/);
 const keep=applyReview(changed,f,{review_estimateDays:'current'});assert.equal(keep.removed,true);
 assert.deepEqual(getChange(keep.state,f).planAmendments,[]);assert.equal(getWork(keep.state,f).estimateDays,7);
 const preserve=applyReview(changed,f,{review_estimateDays:'proposed'});assert.equal(preserve.removed,false);
 assert.equal(getChange(preserve.state,f).planAmendments[0].before.estimateDays,7);
 assert.equal(getChange(preserve.state,f).planAmendments[0].after.estimateDays,5);
 assert.equal(getWork(preserve.state,f).estimateDays,7);assert.equal(serialize(changed),saved);
});

test('Calendar semantics are displayed and proposed duration in new units needs explicit interpretation',()=>{
 const f=fixture();const calendar=createWorkCalendar(f.s,{name:'Календарь цеха',weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],source:{kind:'entered_by_user',reference:null}});
 const typed=editItem(calendar.state,f.pid,f.wid,{durationUnit:'working_days',calendarBasis:{id:calendar.id,version:calendar.version}});
 const draft=propose({...f,s:typed});
 const changed=editItem(draft,f.pid,f.wid,{durationUnit:'elapsed_days',calendarBasis:null});
 const row=inspect(changed,f).rows[0],d=row.fields.find(x=>x.name==='estimateDays');
 assert.equal(d.interpretation,true);assert.equal(d.state,'CONFLICT');
 assert.equal(d.proposedLabel,'5 раб. дн.');assert.equal(d.proposedInCurrentLabel,'5 кал. дн.');
 assert.equal(row.fields.find(x=>x.name==='calendarBasis').beforeLabel,'Календарь цеха · редакция 1');
 assert.throws(()=>applyReview(changed,f),/Выберите значение/);
 const spec=editorSpec(changed.projects[0],reviewAction(changed,f),changed);
 assert.match(spec.fields[0].label,/текущей единице/);
 assert.equal(spec.fields[0].options.find(o=>o.value==='proposed').label,'Предложить: 5 кал. дн.');
 const reviewed=applyReview(changed,f,{review_estimateDays:'proposed'}).state;
 const a=getChange(reviewed,f).planAmendments[0];assert.equal(a.before.durationUnit,'elapsed_days');assert.equal(a.before.calendarBasis,null);
 assert.equal('durationUnit' in a.after,false);assert.equal('calendarBasis' in a.after,false);
 const applied=applyPlanAmendment(approve(reviewed,f),f.pid,f.cid).state;
 assert.equal(getWork(applied,f).durationUnit,'elapsed_days');assert.equal(getWork(applied,f).estimateDays,5);
});

test('Independent project date revisions cannot create an impossible merged interval',()=>{
 const f=fixture(),draft=setPlanDates(f.s,f.pid,f.cid,{startDate:'2026-12-01',dueDate:'2026-12-05'}).state;
 const changed=editProject(draft,f.pid,{dueDate:'2026-11-29'}),saved=serialize(changed);
 const row=inspect(changed,f).rows[0];assert.equal(row.key,'dates');
 assert.deepEqual(row.fields.map(x=>[x.name,x.state]),[['startDate','PROPOSED_ONLY'],['dueDate','CURRENT_ONLY']]);
 assert.throws(()=>applyReview(changed,f,{},'dates'),/Invalid amendment dates/);
 assert.throws(()=>setPlanDates(changed,f.pid,f.cid,{startDate:'2026-12-01',dueDate:'2026-12-05'}),/изменились/);
 const keep=applyReview(changed,f,{review_startDate:'current'},'dates');assert.equal(keep.removed,true);
 assert.equal(keep.state.projects[0].dueDate,'2026-11-29');assert.equal(serialize(changed),saved);
});

test('An already satisfied dependency can be removed from an unapplied proposal, not recreated',()=>{
 const f=fixture(),draft=setPlanDependency(f.s,f.pid,f.cid,{from:f.wid,to:f.second,present:true}).state;
 const connected=connect(draft,f.pid,f.wid,f.second),saved=serialize(connected);
 const row=inspect(connected,f).rows[0];assert.equal(row.kind,'dependency');assert.equal(row.alreadySatisfied,true);assert.equal(row.canReview,true);
 const r=applyReview(connected,f,{},row.key);assert.equal(r.removed,true);
 assert.deepEqual(r.state.projects[0].dependencies,connected.projects[0].dependencies);
 assert.deepEqual(getChange(r.state,f).planAmendments,[]);assert.equal(serialize(connected),saved);
 const started=editItem(draft,f.pid,f.second,{state:'in_progress'});
 const blocked=inspect(started,f).rows[0];assert.equal(blocked.canReview,false);assert.equal(blocked.fields[0].state,'BLOCKED');
 assert.throws(()=>editorSpec(started.projects[0],reviewAction(started,f,blocked.key),started),/исключена вручную/);
});

test('Approved stale proposal requires deferral and a new approval; other pending actions are not silently rebased',()=>{
 const f=fixture();let s=propose(f,{resourceId:f.b});
 s=setPlanDates(s,f.pid,f.cid,{startDate:'2026-11-24',dueDate:'2026-12-05'}).state;
 s=approve(s,f);
 const changed=editProject(editItem(s,f.pid,f.wid,{estimateDays:6,assignee:'Бригада B'}),f.pid,{dueDate:'2026-12-06'});
 const history=structuredClone(changed.projects[0].decisions),view=inspect(changed,f);
 assert.equal(view.needsDeferral,true);assert.equal(view.editable,false);assert.equal(view.rows.length,2);
 assert.throws(()=>reviewPlanAmendmentAction(changed,f.pid,request(changed,f),{estimateDays:'proposed'}),/до утверждения/);
 assert.throws(()=>applyPlanAmendment(changed,f.pid,f.cid),/изменилась|изменились/);
 const deferred=decideChange(changed,f.pid,f.cid,{status:'deferred',rationale:'Review changed source plan'}).state;
 const first=applyReview(deferred,f,{review_estimateDays:'proposed'}).state;
 assert.equal(inspect(first,f).rows.length,1);assert.equal(inspect(first,f).rows[0].key,'dates');
 assert.throws(()=>previewPlanAmendment(first,f.pid,f.cid),/Даты проекта изменились/);
 const reviewed=applyReview(first,f,{},'dates').state;
 assert.equal(inspect(reviewed,f).rows.length,0);assert.deepEqual(reviewed.projects[0].decisions.slice(0,history.length),history);
 assert.equal(reviewed.projects[0].decisions.at(-1).status,'deferred');
 const ready=applyEditor(reviewed,f.pid,'change:'+f.cid,values({status:'approved',rationale:'Reviewed revised proposal'})).state;
 const applied=applyPlanAmendment(ready,f.pid,f.cid).state;
 assert.equal(applied.projects[0].dueDate,'2026-12-06');assert.equal(applied.projects[0].startDate,'2026-11-24');
 assert.equal(getWork(applied,f).assignee,'Бригада B');assert.equal(getWork(applied,f).resourceId,f.b);
 assert.equal(applied.projects[0].decisions.filter(d=>d.kind==='plan_application').length,1);
 assert.deepEqual(inspect(applied,f).rows,[]);
});

test('Converged duration is removed without overwriting other current edits; legacy and desktop share one review route',()=>{
 const f=fixture(),changed=editItem(propose(f),f.pid,f.wid,{estimateDays:5,assignee:'<Crew>'});
 const view=inspect(changed,f);assert.equal(view.rows[0].fields.find(x=>x.name==='estimateDays').state,'CONVERGED');
 const html=renderProjectPlanAmendments(changed,f.pid,{previewId:f.cid});assert.match(html,/Исходные данные заявки изменились/);assert.match(html,/&lt;Crew&gt;/);assert.doesNotMatch(html,/<Crew>/);
 assert.ok(html.includes('data-action="'+reviewAction(changed,f)+'"'));
 const reviewed=applyReview(changed,f);assert.equal(reviewed.removed,true);assert.equal(getWork(reviewed.state,f).assignee,'<Crew>');
 const desktop=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const component=readFileSync(new URL('../desktop/src/PlanAlternativesComparison.tsx',import.meta.url),'utf8');
 assert.match(desktop,/inspectPlanAmendment\(state,projectId,changeId\)/);
 assert.match(desktop,/editor.action.startsWith\("amend-review:"\)/);
 assert.match(component,/onOpenEditor\(planAmendmentReviewAction\(view.changeId,r.key,view.revision\)\)/);
 assert.doesNotMatch(component,/reviewPlanAmendmentAction\(|applyEditor\(|commitWithReadback\(/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {empty,createProject,createItem,editItem,editProject,connect,serialize} from '../src/core.mjs';
import {addPortfolioLink} from '../src/portfolio.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {projectWorkPlanReadiness} from '../src/work-plan-readiness.mjs';

function project(name='Разработка'){const a=createProject(empty(),{name,type:'engineering'});
 return editProject(a.state,a.id,{startDate:'2026-11-23',status:'active'});}
function projectId(snapshot,name='Разработка'){
 return snapshot.projects.find(p=>p.name===name)?.id;
}
function chain(){
 const first=project(),pid=projectId(first);
 const a=createItem(first,pid,{title:'Подготовить комплект'});
 const b=createItem(a.state,pid,{title:'Монтаж оборудования'});
 const connected=connect(b.state,pid,a.id,b.id);
 return {...connected,pid,a:a.id,b:b.id};
}

test('Atlas plan readiness follows only recorded Work predecessors, no execution or approval',()=>{
 const {pid,a,b,...s}=chain(),original=serialize(s);
 const before=projectWorkPlanReadiness(s,pid);
 assert.equal(before.totals.waiting,1);
 assert.equal(before.totals.ready,1);
 assert.equal(before.rows.find(w=>w.id===b).status,'waiting');
 assert.deepEqual(before.rows.find(w=>w.id===b).predecessorWorks.map(w=>w.id),[a]);
 assert.equal(serialize(s),original,'Readiness is strictly read-only');
 const marked=editItem(s,pid,a,{state:'done'});
 const after=projectWorkPlanReadiness(marked,pid);
 assert.equal(after.rows.find(w=>w.id===b).status,'ready');
 assert.equal(after.rows.find(w=>w.id===a).status,'reported_done');
 assert.match(after.note,/принятие результата/);
 assert.equal(after.rows.find(w=>w.id===b).startDate,'2026-11-24');
});

test('Blocked Work and paused projects do not look startable; working state stays descriptive',()=>{
 const {pid,a,b,...s}=chain();
 const blocked=editItem(s,pid,a,{state:'blocked'});
 assert.equal(projectWorkPlanReadiness(blocked,pid).rows.find(w=>w.id===a).status,'blocked');
 const paused=editProject(blocked,pid,{status:'paused'});
 assert.equal(projectWorkPlanReadiness(paused,pid).rows.find(w=>w.id===b).status,'blocked');
 const started=editItem(s,pid,a,{state:'in_progress'});
 assert.equal(projectWorkPlanReadiness(started,pid).rows.find(w=>w.id===a).status,'started');
});

test('Linked project status remains a planning condition, never trusted acceptance',()=>{
 const a=project('Поставка'),source=projectId(a,'Поставка');
 const b=createProject(a,{name:'Монтаж',type:'engineering'});
 const withDate=editProject(b.state,b.id,{startDate:'2026-11-23',status:'active'});
 const sourceWork=createItem(withDate,source,{title:'Доставка'});
 const target=createItem(sourceWork.state,b.id,{title:'Сборка'});
 const linked=addPortfolioLink(target.state,{from:source,to:b.id});
 const waiting=projectWorkPlanReadiness(linked,b.id);
 assert.equal(waiting.rows[0].status,'waiting');
 assert.equal(waiting.rows[0].waitingProjects[0].name,'Поставка');
 const finished=editProject(linked,source,{status:'completed'});
 assert.equal(projectWorkPlanReadiness(finished,b.id).rows[0].status,'ready');
 const cancelled=editProject(linked,source,{status:'cancelled'});
 assert.equal(projectWorkPlanReadiness(cancelled,b.id).rows[0].status,'waiting');
 assert.equal(projectWorkPlanReadiness(cancelled,b.id).rows[0].startDate,null);
});

test('Missing calendar dates are not represented as permission to start',()=>{
 const a=createProject(empty(),{name:'Исследование',type:'research'});
 const b=createItem(a.state,a.id,{title:'Сверить материалы'});
 const result=projectWorkPlanReadiness(b.state,a.id);
 assert.equal(result.rows[0].status,'no_dates');
 assert.equal(result.rows[0].startDate,null);
 assert.equal(result.totals.ready,0);
});

test('Existing portfolio resource overload is a review, not resource-leveling',()=>{
 const a=project(),pid=projectId(a);
 const resource=addPlanningResource(a,{label:'Кран',capacityPct:100});
 const one=createItem(resource.state,pid,{title:'Работа 1',resourceId:resource.id,allocationPct:100});
 const two=createItem(one.state,pid,{title:'Работа 2',resourceId:resource.id,allocationPct:100});
 const view=projectWorkPlanReadiness(two.state,pid);
 assert.equal(view.totals.review,2);
 assert.equal(view.totals.ready,0);
 assert.equal(view.rows[0].resourceReview,true);
 assert.match(view.rows[0].reasons.join('; '),/загрузку планового ресурса/);
 const noResource=editItem(two.state,pid,two.id,{resourceId:null});
 const after=projectWorkPlanReadiness(noResource,pid);
 assert.equal(after.totals.ready,2);
 assert.equal(after.totals.review,0);
});

test('Bounded priorities select work needing attention before optional ready rows',()=>{
 const p=project(),pid=projectId(p);
 let s=p;
 for(let i=0;i<12;i++)s=createItem(s,pid,{title:'Работа '+i}).state;
 const view=projectWorkPlanReadiness(s,pid,{maxRows:3});
 assert.equal(view.totals.all,12);
 assert.equal(view.attention.length,3);
 assert.equal(view.hiddenAttention,9);
 assert.throws(()=>projectWorkPlanReadiness(s,pid,{maxRows:21}),/Некорректный запрос/);
 assert.throws(()=>projectWorkPlanReadiness(s,'missing'),/не найден/);
});

test('UI and source enforce planning-only responsibility, no additional Task or Store',()=>{
 const source=readFileSync(new URL('../src/work-plan-readiness.mjs',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../desktop/src/ProjectOrganizationGuide.tsx',import.meta.url),'utf8');
 assert.match(ui,/projectWorkPlanReadiness\(snapshot,projectId/);
 assert.match(ui,/portfolio:portfolioForecast,resources:resourceForecast,maxRows:3/);
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 assert.match(main,/portfolioForecast=\{dates\} resourceForecast=\{resources\}/);
 assert.match(ui,/Готовность работ по плану/);
 assert.match(ui,/Проверить работу/);
 assert.match(source,/Оценка по датам, состояниям и связям Atlas/);
 assert.doesNotMatch(ui,/[—–]/);
 assert.doesNotMatch(source,/createTask\(|acceptResult\(|createNewStore\(|executeTask\(/);
 assert.match(source,/portfolioSchedule\(snapshot\)/);
 assert.match(source,/portfolioResources\(snapshot,\{schedule:forecast\}\)/);
});

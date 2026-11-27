import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,editProject,createItem,connect,editItem,serialize} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {organizationPlanProjection} from '../src/organization-plan-projection.mjs';

test('Organization receives exact Atlas planning facts and unchanged Work references',()=>{
 const project=createProject(empty(),{name:'Монтаж',type:'engineering'});
 const dated=editProject(project.state,project.id,{startDate:'2026-11-23',status:'active'});
 const a=createItem(dated,project.id,{title:'Подготовка'});
 const b=createItem(a.state,project.id,{title:'Монтаж'});
 const state=connect(b.state,project.id,a.id,b.id);
 const before=serialize(state);
 const view=organizationPlanProjection(state,project.id);
 const forecast=portfolioSchedule(state).byId.get(project.id);
 assert.equal(view.projectId,project.id);
 assert.equal(view.revision,String(state.revision));
 assert.equal(view.projectedFinish,forecast.projectedFinish);
 assert.equal(view.works.find(w=>w.id===a.id).status,'ready');
 assert.equal(view.works.find(w=>w.id===b.id).status,'waiting');
 assert.deepEqual(view.works.find(w=>w.id===b.id).predecessorWorks.map(w=>w.id),[a.id]);
 assert.equal(view.totals.waiting,1);
 assert.equal(serialize(state),before);
 const updated=editItem(state,project.id,a.id,{state:'done'});
 assert.equal(organizationPlanProjection(updated,project.id).works.find(w=>w.id===b.id).status,'ready');
 assert.equal(view.works.find(w=>w.id===b.id).status,'waiting');
 assert.throws(()=>organizationPlanProjection(state,'missing'),/ATLAS_PROJECT_NOT_FOUND/);
});

test('Planning resource conflict is visible without claiming personnel or execution authority',()=>{
 const p=createProject(empty(),{name:'Монтаж',type:'engineering'});
 const dated=editProject(p.state,p.id,{startDate:'2026-11-23',status:'active'});
 const resource=addPlanningResource(dated,{label:'Кран',capacityPct:100});
 const one=createItem(resource.state,p.id,{title:'Первая',resourceId:resource.id,allocationPct:100});
 const two=createItem(one.state,p.id,{title:'Вторая',resourceId:resource.id,allocationPct:100});
 const view=organizationPlanProjection(two.state,p.id);
 assert.equal(view.totals.review,2);
 assert.equal(view.works[0].resource.id,resource.id);
 assert.equal(view.works[0].resource.label,'Кран');
 assert.equal(view.works[0].resourceConflict.overloadDays,1);
 assert.match(view.note,/принятие результата/);
 assert.equal('authorization' in view,false);
 assert.equal('task' in view,false);
});

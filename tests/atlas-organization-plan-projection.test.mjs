import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,editProject,createItem,connect,editItem,serialize} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {organizationPlanProjection,organizationWorkEditionComparison} from '../src/organization-plan-projection.mjs';

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

test('original issued work edition versus current plan, dependencies and recorded actuals',()=>{
 const p=createProject(empty(),{name:'Монтаж',type:'engineering'});
 const dated=editProject(p.state,p.id,{startDate:'2026-11-23',status:'active'});
 const a=createItem(dated,p.id,{title:'Подготовка'});
 const b=createItem(a.state,p.id,{title:'Монтаж'});
 const original=editItem(connect(b.state,p.id,a.id,b.id),p.id,b.id,
  {estimateDays:2,dueDate:'2026-11-27'});
 const current=editItem(editItem(original,p.id,a.id,{estimateDays:4}),p.id,b.id,
  {estimateDays:3,state:'in_progress',actualStartDate:'2026-11-26'});
 const ref={projectId:p.id,workId:b.id,revision:String(original.revision)};
 const prior=serialize(original),now=serialize(current);
 const compared=organizationWorkEditionComparison(current,original,ref);
 assert.equal(compared.original.work.estimateDays,2);
 assert.equal(compared.current.work.estimateDays,3);
 assert.equal(compared.original.work.actualStart,null);
 assert.equal(compared.current.work.actualStart,'2026-11-26');
 assert.equal(compared.current.work.actualFinish,null);
 assert.equal(compared.original.work.plannedFinish,
  organizationPlanProjection(original,p.id).works.find(w=>w.id===b.id).finishDate);
 assert.equal(compared.current.work.plannedFinish,
  organizationPlanProjection(current,p.id).works.find(w=>w.id===b.id).finishDate);
 assert.deepEqual(compared.current.work.predecessors,[a.id]);
 assert.ok(compared.changedFields.includes('estimateDays'));
 assert.ok(compared.changedFields.includes('plannedFinish'));
 assert.ok(compared.changedFields.includes('actualStart'));
 assert.equal(compared.sourceRevision,String(original.revision));
 assert.equal(serialize(original),prior);assert.equal(serialize(current),now);
 const missing=organizationWorkEditionComparison(current,null,ref);
 assert.equal(missing.originalStatus,'NOT_RETAINED');
 assert.equal(missing.original,null);
 assert.deepEqual(missing.changedFields,[]);
 assert.throws(()=>organizationWorkEditionComparison(current,current,ref),/ATLAS_HISTORY_EDITION_MISMATCH/);
 const same=organizationWorkEditionComparison(original,original,ref);
 assert.deepEqual(same.changedFields,[]);
 const absent=organizationWorkEditionComparison(empty(),original,ref);
 assert.equal(absent.current.status,'PROJECT_MISSING');
 assert.equal(absent.current.work,null);
});

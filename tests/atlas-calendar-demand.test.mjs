import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleProject} from '../src/planning.mjs';
import {desktopLoadPortfolio} from './fixtures/desktop-portfolio-120.mjs';
import {validate,serialize,createWorkCalendar} from '../src/core.mjs';
import {planChange,decideChange} from '../src/trace.mjs';
import {setPlanWork,setPlanDependency,comparePlanAmendments,applyPlanAmendment} from '../src/plan-amendment.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';
import {portfolioResources,planningResourceTotals} from '../src/portfolio-resources.mjs';

const work=(id,estimateDays,basis=null)=>({id,title:id,state:'todo',estimateDays,
 durationUnit:basis?'working_days':'elapsed_days',calendarBasis:basis?{id:basis,version:1}:null});
const day=x=>x?Date.parse(x+'T00:00:00Z')/86400000:null;

test('Calendar extends through the late boundary of an unrelated longer branch',()=>{
 const calendarLibrary=[{id:'week',version:1,weekdays:[1,2,3,4,5],excludedDates:['2026-11-30'],additionalWorkingDates:['2026-11-28','2026-11-30']},
  {id:'sat',version:1,weekdays:[6],excludedDates:[],additionalWorkingDates:[]}];
 const p={startDate:'2026-11-20',items:[work('short',1,'week'),work('sat',1,'sat'),work('long',11),work('zero',0,'week')],dependencies:[{from:'short',to:'zero'}]};
 const saved=JSON.stringify([p,calendarLibrary]);
 const plan=scheduleProject(p,{calendarLibrary,includeResourceOccupancy:true});
 assert.equal(plan.estimatedFinish,'2026-12-01');
 assert.deepEqual(plan.rows.map(w=>[w.id,w.earlyStart,w.earlyFinish,w.lateStart,w.lateFinish,w.floatDays,w.activeRanges]),[
  ['short',0,1,8,11,8,[[0,1]]],['sat',1,2,8,11,7,[[1,2]]],['long',0,11,0,11,0,[[0,11]]],['zero',1,1,11,11,10,[]]]);
 assert.equal(JSON.stringify([p,calendarLibrary]),saved);
 const shifted=scheduleProject(p,{calendarLibrary,startDate:'2026-11-21'});
 assert.equal(shifted.rows.find(w=>w.id==='short').startDate,'2026-11-23');
 assert.deepEqual(scheduleProject(p,{calendarLibrary,includeResourceOccupancy:true}),plan);
});

test('Lazy working-day expansion keeps the complete horizon and year-9999 behavior',()=>{
 const calendarLibrary=[{id:'all',version:1,weekdays:[0,1,2,3,4,5,6],excludedDates:[],additionalWorkingDates:[]}];
 const p={startDate:'2026-01-01',items:[work('all',36500,'all')],dependencies:[]};
 assert.deepEqual(scheduleProject(p,{calendarLibrary,includeResourceOccupancy:true}).rows[0].activeRanges,[[0,36500]]);
 assert.throws(()=>scheduleProject({...p,items:[work('first',1),work('all',36500,'all')],dependencies:[{from:'first',to:'all'}]},{calendarLibrary}),/horizon/);
 const last={...p,startDate:'9999-12-31',items:[work('all',1,'all')]};
 const plan=scheduleProject(last,{calendarLibrary,includeResourceOccupancy:true});
 assert.equal(plan.rows[0].startDate,'9999-12-31');assert.equal(plan.rows[0].finishDate,null);
 assert.deepEqual(plan.rows[0].activeRanges,[[0,1]]);
 assert.throws(()=>scheduleProject({...last,items:[work('all',2,'all')]},{calendarLibrary}),/horizon/);
 assert.throws(()=>scheduleProject({...p,items:[work('zero',0,'missing')]},{calendarLibrary}),/редакция рабочего календаря недоступна/);
 assert.throws(()=>scheduleProject({...p,startDate:null,items:[work('zero',0,'all')]},{calendarLibrary}),/дату начала проекта/);
});

test('1200 mixed-calendar Work: two compound options match applied plans and independent daily resource totals',()=>{
 const calendar=createWorkCalendar(desktopLoadPortfolio(),{name:'Production week',weekdays:[1,2,3,4,5],excludedDates:['2026-11-05','2026-11-06','2026-12-25'],additionalWorkingDates:['2026-11-07'],source:{kind:'entered_by_user',reference:null}});
 let s=calendar.state;
 s.resources=Array.from({length:16},(_,i)=>({id:'res-'+i,label:'Resource '+i,capacityPct:100+(i%4)*25,availableFrom:i%3===0?'2026-11-05':null,availableUntil:i%5===0?'2027-03-01':null}));
 for(const [i,p] of s.projects.entries())for(const [j,w] of p.items.entries()){
  w.resourceId='res-'+((i*3+j)%16);w.allocationPct=30+((i+j)%5)*15;w.estimateDays=1+(i+j)%4;w.dueDate='2027-01-15';
  if(j%2===0){w.durationUnit='working_days';w.calendarBasis={id:calendar.id,version:calendar.version};}
 }
 validate(s);
 const p=s.projects[0],pid=p.id;
 const a=planChange(s,pid,{title:'Option A'});s=a.state;
 s=setPlanWork(s,pid,a.id,{itemId:p.items[0].id,estimateDays:5,resourceId:'res-14',allocationPct:50}).state;
 s=setPlanWork(s,pid,a.id,{itemId:p.items[1].id,estimateDays:3,resourceId:'res-15',allocationPct:40}).state;
 s=setPlanDependency(s,pid,a.id,{from:p.items[3].id,to:p.items[4].id,present:true}).state;
 const b=planChange(s,pid,{title:'Option B'});s=b.state;
 s=setPlanWork(s,pid,b.id,{itemId:p.items[0].id,estimateDays:2,allocationPct:25}).state;
 s=setPlanWork(s,pid,b.id,{itemId:p.items[1].id,estimateDays:4,allocationPct:35}).state;
 s=setPlanDependency(s,pid,b.id,{from:p.items[5].id,to:p.items[6].id,present:true}).state;
 const saved=serialize(s),start=performance.now();
 const result=comparePlanAmendments(s,pid,a.id,b.id),ms=performance.now()-start;
 assert.deepEqual(result.options.map(o=>[o.valid,o.preview?.affected,o.preview?.workRows.length,o.preview?.rows.find(r=>r.id===pid)?.afterFinish]),
  [[true,41,410,'2026-11-24'],[true,41,11,'2026-11-16']]);
 let checkedDays=0,checkedWork=0,checkedProjects=0;
 for(const o of result.options){
  const approved=decideChange(s,pid,o.id,{status:'approved',rationale:'Independent comparison of forecast and actual application'}).state;
  const applied=applyPlanAmendment(approved,pid,o.id).state;
  const schedule=portfolioSchedule(applied),view=portfolioResources(applied,{schedule});
  assert.deepEqual(o.preview.resourceAfter,planningResourceTotals(view));
  const plans=new Map();
  for(const r of o.preview.rows){
   const actual=schedule.byId.get(r.id);
   assert.deepEqual([r.afterFinish,r.afterStart,r.afterSlip],[actual.projectedFinish,actual.projectedStart,actual.deadlineSlipDays]);
   const project=applied.projects.find(p=>p.id===r.id);
   plans.set(r.id,new Map(scheduleProject(project,{calendarLibrary:applied.calendarLibrary,startDate:actual.projectedStart}).rows.map(w=>[w.id,w])));checkedProjects++;
  }
  for(const r of o.preview.workRows){const w=plans.get(r.projectId).get(r.workId);assert.deepEqual([r.after.finish,r.after.start,r.after.floatDays,r.after.critical],[w.finishDate,w.startDate,w.floatDays,w.critical]);checkedWork++;}
  for(const g of view.people){
   const daily=new Map();
   for(const w of g.work)for(const [from,until] of w.activeRanges)for(let d=from;d<until;d++)daily.set(d,(daily.get(d)||0)+w.allocationPct);
   let overload=0,unavailable=0,overloadPct=0,unavailablePct=0;
   for(const [d,load] of daily){checkedDays++;if((g.availableFrom&&d<day(g.availableFrom))||(g.availableUntil&&d>day(g.availableUntil))){unavailable++;unavailablePct+=load;}else if(load>g.capacityPct){overload++;overloadPct+=load-g.capacityPct;}}
   assert.deepEqual([g.overloadDays,g.unavailableDays,g.overloadPctDays,g.unavailablePctDays],[overload,unavailable,overloadPct,unavailablePct]);
  }
  assert.equal(serialize(s),saved);
 }
 assert.deepEqual([checkedProjects,checkedWork,checkedDays],[82,421,2300]);
 console.log('ATLAS_CALENDAR_COMPOUND_SCALE_PASS projects=120 works=1200 resources=16 alternatives=2 comparison_ms='+ms.toFixed(2)+' rows='+checkedWork+' resource_days='+checkedDays);
});

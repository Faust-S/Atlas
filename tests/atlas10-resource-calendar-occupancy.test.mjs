import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editProject,editItem,createWorkCalendar,
 serialize} from "../src/core.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {portfolioResources,renderProjectResources} from "../src/portfolio-resources.mjs";
import {scheduleProject} from "../src/planning.mjs";

const source={kind:"entered_by_user",reference:null};
function fixture({extra=[],holidays=[]}={}){
 const a=createProject(empty(),{name:"Installation project",type:"engineering"});
 const b=createProject(a.state,{name:"Weekend process",type:"engineering"});
 let state=editProject(b.state,a.id,{startDate:"2026-11-20"});
 state=editProject(state,b.id,{startDate:"2026-11-21"});
 const crew=addPlanningResource(state,{label:"One shared crew",capacityPct:100});
 const calendar=createWorkCalendar(crew.state,{
  name:"Actual staff calendar",weekdays:[1,2,3,4,5],
  excludedDates:holidays,additionalWorkingDates:extra,source
 });
 const work=createItem(calendar.state,a.id,{
  title:"Two staffed shifts",resourceId:crew.id,allocationPct:100
 });
 state=editItem(work.state,a.id,work.id,{estimateDays:2,
  durationUnit:"working_days",
  calendarBasis:{id:calendar.id,version:calendar.version}});
 const continuous=createItem(state,b.id,{
  title:"Weekend continuous process",resourceId:crew.id,allocationPct:100
 });
 state=editItem(continuous.state,b.id,continuous.id,{estimateDays:2});
 return {state,a:a.id,b:b.id,crew:crew.id,work:work.id,continuous:continuous.id};
}

test("calendar CPM excludes weekend inactivity from resource overload without changing Work finish",()=>{
 const f=fixture(),before=serialize(f.state);
 const plan=scheduleProject(f.state.projects[0],{calendarLibrary:f.state.calendarLibrary});
 const row=plan.rows.find(r=>r.id===f.work);
 assert.equal(row.durationDays,2);
 assert.equal(row.elapsedDays,4);
 assert.equal(row.startDate,"2026-11-20");
 assert.equal(row.finishDate,"2026-11-24");
 const resources=portfolioResources(f.state),group=resources.byId.get(f.crew);
 assert.equal(group.maxLoadPct,100,"Working-day task must not occupy Saturday/Sunday");
 assert.equal(group.overloadDays,0);
 assert.equal(group.overlapDays,0);
 assert.equal(group.scheduledDays,4,"Existing entered-duration total is unchanged");
 assert.equal(resources.work.find(w=>w.id===f.work).finishDate,row.finishDate);
 assert.equal(serialize(f.state),before,"Projection cannot write original Atlas Store");
});

test("declared extra working Saturday creates a single real overload day",()=>{
 const f=fixture({extra:["2026-11-21"]});
 const plan=scheduleProject(f.state.projects[0],{calendarLibrary:f.state.calendarLibrary});
 const row=plan.rows.find(r=>r.id===f.work);
 assert.equal(row.finishDate,"2026-11-22");
 const resources=portfolioResources(f.state),group=resources.byId.get(f.crew);
 assert.equal(group.maxLoadPct,200);
 assert.equal(group.overloadDays,1);
 assert.equal(group.overlapDays,1);
 assert.match(renderProjectResources(f.state,f.a),/перегрузка/);
});

test("holiday exclusions and resource availability use actual staffed dates, not elapsed span",()=>{
 const f=fixture({holidays:["2026-11-23"]});
 const plan=scheduleProject(f.state.projects[0],{calendarLibrary:f.state.calendarLibrary});
 assert.equal(plan.rows.find(r=>r.id===f.work).finishDate,"2026-11-25");
 const model=structuredClone(f.state);
 model.resources[0].availableFrom="2026-11-21";
 model.resources[0].availableUntil="2026-11-23";
 const group=portfolioResources(model).byId.get(f.crew);
 assert.equal(group.overlapDays,0);
 assert.equal(group.overloadDays,0);
 // 20 Nov (Friday) and 24 Nov (Tuesday) require staff; there is
 // no staffing on the excluded Monday or the weekend.
 assert.equal(group.unavailableDays,2);
});

test("zero-day milestones do not reserve capacity on a holiday or weekend",()=>{
 const f=fixture(),s=structuredClone(f.state),continuous=s.projects.find(p=>p.id===f.b);
 const work=continuous.items.find(w=>w.id===f.continuous);
 work.estimateDays=0;
 const resource=portfolioResources(s).byId.get(f.crew);
 assert.equal(resource.maxLoadPct,100);
 assert.equal(resource.overlapDays,0);
 assert.equal(resource.overloadDays,0);
});

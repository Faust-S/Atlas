import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,editProject,createItem,editItem,createWorkCalendar} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {renderDependencyGraph,renderTimeline} from "../src/graph.mjs";

test("browser graph and lanes honor pinned Work calendar and actual civil-day CPM spans",()=>{
 const project=createProject(empty(),{name:"Factory",type:"engineering"});
 let snapshot=editProject(project.state,project.id,{startDate:"2026-11-20"});
 const cal=createWorkCalendar(snapshot,{name:"Five-day calendar",
  weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],
  source:{kind:"entered_by_user",reference:null}});
 const work=createItem(cal.state,project.id,{title:"Friday to Monday"});
 snapshot=editItem(work.state,project.id,work.id,{
  estimateDays:2,durationUnit:"working_days",
  calendarBasis:{id:cal.id,version:cal.version}});
 const p=snapshot.projects[0],library=snapshot.calendarLibrary;
 const before=JSON.stringify(snapshot);
 const plan=scheduleProject(p,{calendarLibrary:library});
 assert.equal(plan.rows[0].durationDays,2);
 assert.equal(plan.rows[0].elapsedDays,4);
 assert.equal(plan.rows[0].earlyFinish-plan.rows[0].earlyStart,4);
 assert.equal(plan.estimatedFinish,"2026-11-24");
 assert.throws(()=>renderTimeline(p),/редакция рабочего календаря недоступна/);
 assert.throws(()=>renderDependencyGraph(p),/редакция рабочего календаря недоступна/);
 const timeline=renderTimeline(p,{calendarLibrary:library});
 assert.match(timeline,/Friday to Monday/);
 assert.match(timeline,/2026-11-20|0–4 день/);
 assert.match(timeline,/width:100\.00%/);
 assert.match(renderDependencyGraph(p,{calendarLibrary:library,mode:"critical"}),/Критический путь/);
 assert.equal(JSON.stringify(snapshot),before,"read-only views must never alter Store");
});

test("browser Atlas entry passes the shared calendar library to both graph views",()=>{
 const app=readFileSync(new URL("../src/app.mjs",import.meta.url),"utf8");
 assert.match(app,/renderDependencyGraph\(p,\{mode:graphMode,calendarLibrary:data\.calendarLibrary\?\?\[\]\}\)/);
 assert.match(app,/renderTimeline\(p,\{calendarLibrary:data\.calendarLibrary\?\?\[\]\}\)/);
 assert.match(app,/x\.durationUnit==='working_days'\?'раб\. дн\.'\:'кал\. дн\.'/);
});

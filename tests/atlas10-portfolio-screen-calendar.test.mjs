import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,editProject,createItem,editItem,createWorkCalendar,serialize} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {projectScreenSchedule} from "../src/project-schedule-view.mjs";

function fixture(){
 const upstream=createProject(empty(),{name:"Components",type:"engineering"});
 const downstream=createProject(upstream.state,{name:"Installation",type:"engineering"});
 let state=editProject(downstream.state,upstream.id,{startDate:"2026-11-18"});
 state=editProject(state,downstream.id,{startDate:"2026-11-18"});
 const supply=createItem(state,upstream.id,{title:"Two calendar days"});
 state=editItem(supply.state,upstream.id,supply.id,{estimateDays:2});
 const calendar=createWorkCalendar(state,{name:"Five-day calendar",
  weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],
  source:{kind:"entered_by_user",reference:null}});
 const installed=createItem(calendar.state,downstream.id,{title:"Two working days"});
 state=editItem(installed.state,downstream.id,installed.id,{
  estimateDays:2,durationUnit:"working_days",
  calendarBasis:{id:calendar.id,version:calendar.version}});
 state=addPortfolioLink(state,{from:upstream.id,to:downstream.id});
 return {state,upstream:upstream.id,downstream:downstream.id,workId:installed.id};
}

test("dependent project screen and portfolio show the same shifted Work finish, preserving the original baseline",()=>{
 const f=fixture(),old=serialize(f.state),projection=portfolioSchedule(f.state);
 const row=projection.byId.get(f.downstream),project=f.state.projects.find(p=>p.id===f.downstream);
 const baseline=scheduleProject(project,{calendarLibrary:f.state.calendarLibrary});
 assert.equal(row.projectedStart,"2026-11-20");
 assert.equal(row.plannedFinish,"2026-11-20");
 assert.equal(row.projectedFinish,"2026-11-24");
 assert.equal(baseline.rows[0].finishDate,"2026-11-20");
 const view=projectScreenSchedule(project,row,{calendarLibrary:f.state.calendarLibrary,plannedPlan:baseline});
 assert.equal(view.mode,"portfolio_forecast");
 assert.equal(view.baseline,baseline);
 assert.equal(view.displayStart,"2026-11-20");
 assert.equal(view.display.estimatedFinish,row.projectedFinish);
 assert.equal(view.display.rows.find(w=>w.id===f.workId).finishDate,row.projectedFinish);
 assert.equal(view.display.rows[0].durationDays,2);
 assert.equal(view.display.rows[0].elapsedDays,4);
 assert.equal(serialize(f.state),old,"The portfolio forecast never moves native Work source dates");
});

test("project without a portfolio shift uses the same original CPM object",()=>{
 const f=fixture(),p=f.state.projects.find(x=>x.id===f.upstream),
  projection=portfolioSchedule(f.state),baseline=scheduleProject(p,{calendarLibrary:f.state.calendarLibrary});
 const view=projectScreenSchedule(p,projection.byId.get(f.upstream),{
  plannedPlan:baseline,calendarLibrary:f.state.calendarLibrary});
 assert.equal(view.mode,"planned");
 assert.equal(view.display,baseline);
 assert.equal(view.displayStart,"2026-11-18");
});

test("paused and blocked projects remain an explicitly local plan, never fictional scheduled delivery",()=>{
 const f=fixture(),state=structuredClone(f.state);
 state.projects.find(p=>p.id===f.upstream).status="paused";
 const projection=portfolioSchedule(state),p=state.projects.find(p=>p.id===f.downstream);
 const row=projection.byId.get(f.downstream);
 assert.equal(row.projectedFinish,null);
 assert.ok(row.unavailableOrigins.length);
 const view=projectScreenSchedule(p,row,{calendarLibrary:state.calendarLibrary});
 assert.equal(view.mode,"planned");
 assert.equal(view.display.estimatedFinish,"2026-11-20");
 assert.equal(view.displayStart,p.startDate);
});

test("project screen refuses disagreements with authoritative portfolio dates",()=>{
 const f=fixture(),p=f.state.projects.find(x=>x.id===f.downstream);
 const row={...portfolioSchedule(f.state).byId.get(f.downstream),projectedFinish:"2026-11-25"};
 assert.throws(()=>projectScreenSchedule(p,row,{calendarLibrary:f.state.calendarLibrary}),/разным датам/);
});

test("desktop uses the same screen calendar for both Gantt and Work list, but edits use original baseline",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/projectScreenSchedule\(project,projected,\{/);
 assert.match(ui,/const plan=scheduleView\?\.display\?\?null/);
 assert.match(ui,/<ProjectGantt[^>]*schedule=\{plan\}/);
 assert.match(ui,/busy=\{busy\} project=\{project\} plan=\{plannedPlan\}/);
 assert.match(ui,/const updatedPlan=updatedProject\?scheduleProject\(updatedProject/);
});

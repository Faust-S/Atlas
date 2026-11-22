import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editProject,editItem,createWorkCalendar,
 serialize} from "../src/core.mjs";
import {scheduleProject,criticalPathFocus,scheduleDeadlineExplanations}
 from "../src/planning.mjs";
const source={kind:"entered_by_user",reference:null};
function fixture(extraPredecessor=false){
 const made=createProject(empty(),{name:"Calendar dependency analysis"});
 let s=editProject(made.state,made.id,{startDate:"2026-11-20"});
 const calendar=createWorkCalendar(s,{
  name:"Five-day operations",weekdays:[1,2,3,4,5],excludedDates:[],
  additionalWorkingDates:[],source});
 const first=createItem(calendar.state,made.id,{title:"Friday staffed predecessor"});
 s=editItem(first.state,made.id,first.id,{
  estimateDays:1,durationUnit:"working_days",
  calendarBasis:{id:calendar.id,version:calendar.version}});
 let other=null;
 if(extraPredecessor){
  const second=createItem(s,made.id,{title:"Sunday finishing process"});
  s=editItem(second.state,made.id,second.id,{estimateDays:2});
  other=second.id;
 }
 const next=createItem(s,made.id,{title:"Monday staffed successor"});
 s=editItem(next.state,made.id,next.id,{
  estimateDays:1,durationUnit:"working_days",dueDate:"2026-11-23",
  calendarBasis:{id:calendar.id,version:calendar.version}});
 const snapshot=structuredClone(s);
 snapshot.projects[0].dependencies=[
  {from:first.id,to:next.id},...(other?[{from:other,to:next.id}]:[])
 ];
 return {snapshot,first:first.id,next:next.id,other};
}

test("Friday to Monday pinned calendar dependency keeps its actual critical predecessor visible",()=>{
 const f=fixture(),before=serialize(f.snapshot);
 const plan=scheduleProject(f.snapshot.projects[0],{
  calendarLibrary:f.snapshot.calendarLibrary});
 const a=plan.rows.find(r=>r.id===f.first),b=plan.rows.find(r=>r.id===f.next);
 assert.equal(a.startDate,"2026-11-20");
 assert.equal(a.finishDate,"2026-11-21");
 assert.equal(b.startDate,"2026-11-23");
 assert.equal(b.finishDate,"2026-11-24");
 assert.equal(b.earlyStart-a.earlyFinish,2);
 assert.equal(a.critical,true);
 assert.equal(b.critical,true);
 const focus=criticalPathFocus(plan);
 assert.ok(focus,"A real calendar-critical edge must be visible despite weekend gap");
 assert.equal(focus.predecessorId,f.first);
 assert.equal(focus.workId,f.next);
 const explanation=scheduleDeadlineExplanations(plan).get(f.next);
 assert.equal(explanation.daysLate,1);
 assert.equal(explanation.durationUnit,"working_days");
 assert.equal(explanation.calendarWaitDays,2);
 assert.deepEqual(explanation.drivers.map(d=>d.id),[f.first]);
 assert.equal(serialize(f.snapshot),before,"Reporting must not mutate the saved Work");
});

test("a calendar-critical predecessor remains visible when a later, noncritical predecessor ends on Sunday",()=>{
 const f=fixture(true);
 const plan=scheduleProject(f.snapshot.projects[0],{calendarLibrary:f.snapshot.calendarLibrary});
 const a=plan.rows.find(r=>r.id===f.first),middle=plan.rows.find(r=>r.id===f.other);
 assert.equal(a.critical,true);
 assert.equal(middle.critical,false);
 const focus=criticalPathFocus(plan);
 assert.equal(focus?.predecessorId,f.first);
 const explanation=scheduleDeadlineExplanations(plan).get(f.next);
 assert.equal(explanation.calendarWaitDays,1);
 assert.deepEqual(new Set(explanation.drivers.map(d=>d.id)),new Set([f.first,f.other]));
 assert.equal(explanation.drivers[0].id,f.first,
  "The actual calendar-critical blocker is presented before a noncritical predecessor");
});

import test from "node:test";
import assert from "node:assert/strict";
import {scheduleProject} from "../src/planning.mjs";
import {previewOperationCalendars} from "../src/working-week-scenario.mjs";

const project=(startDate,items,edges=[])=>({
 startDate,
 items:items.map(([id,days,dueDate])=>({
  id,title:id,estimateDays:days,dueDate:dueDate??null,state:"todo"
 })),
 dependencies:edges.map(([from,to])=>({from,to}))
});
const mixed=(p,options={})=>previewOperationCalendars(scheduleProject(p),{
 startDate:p.startDate,...options
});

test("mixed industrial route: mounting pauses on weekends, curing does not",()=>{
 const p=project("2026-11-20",[
  ["mount",2],["cure",3],["accept",1]
 ],[["mount","cure"],["cure","accept"]]);
 const original=JSON.stringify(p),canonical=scheduleProject(p);
 const before=JSON.stringify(canonical);
 const v=previewOperationCalendars(canonical,{startDate:p.startDate,
  modeByWork:{"cure":"elapsed_days"}});
 assert.equal(v.kind,"MIXED_CALENDAR_HYPOTHESIS");
 assert.equal(v.calendar.kind,"PLANNING_CALENDAR_DRAFT");
 assert.equal(v.calendar.version,1);
 assert.equal(v.inputDurationMeaning,"HYPOTHETICAL_MIXED_DURATIONS_NOT_PERSISTED");
 assert.deepEqual(v.rows.map(r=>[r.id,r.durationMode,r.startDate,r.completionDate]),[
  ["mount","working_days","2026-11-20","2026-11-23"],
  ["cure","elapsed_days","2026-11-24","2026-11-26"],
  ["accept","working_days","2026-11-27","2026-11-27"]
 ]);
 assert.equal(v.rows.find(r=>r.id==="mount").finishBoundaryDate,"2026-11-24");
 assert.equal(v.rows.find(r=>r.id==="cure").finishBoundaryDate,"2026-11-27");
 assert.equal(v.rows.find(r=>r.id==="accept").finishBoundaryDate,"2026-11-28");
 assert.equal(v.projectBaselineLastDate,"2026-11-25");
 assert.equal(v.projectScenarioLastDate,"2026-11-27");
 assert.equal(v.shiftDays,2);
 assert.equal(v.workdayTotal,2);
 assert.equal(v.continuousTotal,1);
 assert.equal(canonical.estimatedFinish,"2026-11-26");
 assert.equal(JSON.stringify(p),original);
 assert.equal(JSON.stringify(canonical),before);
});

test("parallel merging respects both actual calendar release dates",()=>{
 const p=project("2026-11-20",[["cure",3],["supply",2],["assemble",1]],
  [["cure","assemble"],["supply","assemble"]]);
 const v=mixed(p,{modeByWork:{cure:"elapsed_days"}});
 assert.equal(v.rows.find(r=>r.id==="cure").completionDate,"2026-11-22");
 assert.equal(v.rows.find(r=>r.id==="supply").completionDate,"2026-11-23");
 assert.equal(v.rows.find(r=>r.id==="assemble").startDate,"2026-11-24");
 assert.equal(v.projectScenarioLastDate,"2026-11-24");
 assert.equal(v.projectBaselineLastDate,"2026-11-23");
});

test("missing date is not silently estimated and calendar inputs still validate",()=>{
 const p=project(null,[["work",4]]);
 const v=mixed(p,{modeByWork:{work:"elapsed_days"}});
 assert.equal(v.available,false);
 assert.equal(v.reason,"NO_PROJECT_START");
 assert.equal(v.projectScenarioLastDate,null);
 assert.deepEqual(v.rows,[]);
 assert.throws(()=>mixed(p,{modeByWork:{unknown:"elapsed_days"}}),/Invalid work calendar mode/);
 assert.throws(()=>mixed(p,{modeByWork:{work:"month"}}),/Invalid work calendar mode/);
 assert.throws(()=>mixed(p,{defaultMode:"unbounded"}),/Invalid duration mode/);
 assert.throws(()=>mixed(p,{modeByWork:["elapsed_days"]}),/Invalid duration mode/);
});

test("elapsed-only route is identical to legacy CPM inclusive occupied dates",()=>{
 const p=project("2026-11-20",[["a",2],["b",1],["gate",0]],
  [["a","b"],["b","gate"]]);
 const c=scheduleProject(p);
 const v=previewOperationCalendars(c,{startDate:p.startDate,
  defaultMode:"elapsed_days",holidays:["2026-11-20","2026-11-23"]});
 for(const row of v.rows){
  const base=c.rows.find(r=>r.id===row.id);
  assert.equal(row.shiftDays,0);
  assert.equal(row.baselineLastDate,row.completionDate);
  assert.equal(row.startDate,base.startDate);
 }
 assert.equal(v.projectBaselineLastDate,v.projectScenarioLastDate);
 assert.equal(v.continuousTotal,3);
});

test("custom working Saturday overrides weekend; conflicting exclusions fail",()=>{
 const p=project("2026-11-20",[["a",2]]);
 const v=mixed(p,{additionalWorkingDates:["2026-11-21"]});
 assert.equal(v.projectScenarioLastDate,"2026-11-21");
 assert.equal(v.projectBaselineLastDate,"2026-11-21");
 assert.equal(v.shiftDays,0);
 assert.deepEqual(v.calendar.additionalWorkingDates,["2026-11-21"]);
 assert.throws(()=>mixed(p,{holidays:["2026-11-21"],
  additionalWorkingDates:["2026-11-21"]}),/Conflicting calendar date/);
 assert.throws(()=>mixed(p,{additionalWorkingDates:["2026-02-30"]}),/Invalid/);
 assert.throws(()=>mixed(p,{additionalWorkingDates:Array(1001).fill("2026-11-21")}),/Invalid/);
});

test("holiday delays only staffed operations; continuous predecessors keep running",()=>{
 const p=project("2026-11-20",[["cure",3],["pack",1]],[["cure","pack"]]);
 const v=mixed(p,{modeByWork:{cure:"elapsed_days"},holidays:["2026-11-23"]});
 assert.equal(v.rows.find(r=>r.id==="cure").completionDate,"2026-11-22");
 assert.equal(v.rows.find(r=>r.id==="pack").startDate,"2026-11-24");
 assert.equal(v.projectScenarioLastDate,"2026-11-24");
 assert.equal(v.skippedHolidays,1);
});

test("zero-day milestone occurs at release boundary, does not invent a staffed review",()=>{
 const p=project("2026-11-20",[["work",1],["gate",0],["next",1]],
  [["work","gate"],["gate","next"]]);
 const v=mixed(p);
 const gate=v.rows.find(r=>r.id==="gate");
 assert.equal(gate.startDate,"2026-11-21");
 assert.equal(gate.completionDate,"2026-11-21");
 assert.equal(gate.finishBoundaryDate,"2026-11-21");
 assert.equal(v.rows.find(r=>r.id==="next").startDate,"2026-11-23");
 assert.equal(v.projectScenarioLastDate,"2026-11-23");
});

test("working and elapsed deadlines compare inclusive last day and do not infer acceptance",()=>{
 const p=project("2026-11-20",[
  ["cure",3,"2026-11-22"],["installation",1,"2026-11-22"]
 ],[["cure","installation"]]);
 const v=mixed(p,{modeByWork:{cure:"elapsed_days"}});
 assert.equal(v.rows.find(r=>r.id==="cure").wouldMissDueDate,false);
 assert.equal(v.rows.find(r=>r.id==="installation").wouldMissDueDate,true);
 assert.equal(v.rows.find(r=>r.id==="installation").completionDate,"2026-11-23");
 assert.equal("acceptedResult" in v,false);
});

test("leap year and UTC date arithmetic, with explicit personal calendar draft",()=>{
 const p=project("2028-02-25",[["cure",4],["install",1]],[["cure","install"]]);
 const v=mixed(p,{modeByWork:{cure:"elapsed_days"}});
 assert.equal(v.rows.find(r=>r.id==="cure").completionDate,"2028-02-28");
 assert.equal(v.rows.find(r=>r.id==="install").completionDate,"2028-02-29");
 assert.deepEqual(v.calendar.weekdays,[1,2,3,4,5]);
 assert.equal(v.calendar.excludedDates.length,0);
});

test("invalid/inconsistent dependency data cannot quietly become independent work",()=>{
 const p=project("2026-11-20",[["a",1],["b",1]],[["a","b"]]);
 const c=scheduleProject(p);
 const base={...c,rows:c.rows.map(r=>({...r}))};
 const b=base.rows.find(r=>r.id==="b");
 b.predecessors=["missing"];
 assert.throws(()=>previewOperationCalendars(base,{startDate:p.startDate}),/Invalid canonical predecessor order/);
 assert.throws(()=>previewOperationCalendars({...c,
  rows:c.rows.map(r=>({...r,durationDays:5}))},{startDate:p.startDate}),/Invalid calendar scenario work/);
});

test("5000 independent works calculate without a second graph or mutating the plan",()=>{
 const p=project("2026-11-20",
  Array.from({length:5000},(_,i)=>["w"+i,1]));
 const c=scheduleProject(p);
 const before=JSON.stringify(c);
 const v=previewOperationCalendars(c,{startDate:p.startDate,
  modeByWork:{"w0":"elapsed_days","w4999":"elapsed_days"}});
 assert.equal(v.rows.length,5000);
 assert.equal(v.continuousTotal,2);
 assert.equal(v.projectScenarioLastDate,"2026-11-20");
 assert.equal(JSON.stringify(c),before);
});

test("year 9999 overflow reports unknown dates rather than fabricated years",()=>{
 const p=project("9999-12-31",[["cure",3],["install",1]],[["cure","install"]]);
 const v=mixed(p,{modeByWork:{cure:"elapsed_days"}});
 assert.equal(v.projectScenarioLastDate,null);
 assert.equal(v.rows.find(r=>r.id==="install").completionDate,null);
 assert.equal(v.shiftDays,null);
});

test("empty project has neither fabricated completion nor resource forecast",()=>{
 const v=mixed(project("2026-11-20",[]));
 assert.deepEqual(v.rows,[]);
 assert.equal(v.projectScenarioLastDate,null);
 assert.equal(v.projectBaselineLastDate,null);
 assert.equal(v.continuousTotal,0);
});

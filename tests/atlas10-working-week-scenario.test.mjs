import test from "node:test";
import assert from "node:assert/strict";
import {scheduleProject} from "../src/planning.mjs";
import {previewWorkingWeek} from "../src/working-week-scenario.mjs";

const project=(startDate,works,links=[])=>({
 startDate,
 items:works.map(([id,estimateDays,dueDate])=>({
  id,title:id,state:"todo",estimateDays,dueDate:dueDate??null
 })),
 dependencies:links.map(([from,to])=>({from,to}))
});

test("working-week scenario keeps canonical calendar-day CPM unchanged",()=>{
 const p=project("2026-11-20",[["a",2],["b",1]],[["a","b"]]);
 const plan=scheduleProject(p);
 const originalProject=JSON.stringify(p),originalPlan=JSON.stringify(plan);
 const preview=previewWorkingWeek(plan,{startDate:p.startDate});
 assert.equal(plan.durationDays,3);
 assert.equal(plan.estimatedFinish,"2026-11-23");
 assert.equal(preview.kind,"WORKDAY_HYPOTHESIS");
 assert.equal(preview.inputDurationMeaning,"HYPOTHETIC_WORKDAYS_NOT_PERSISTED");
 assert.deepEqual(preview.weekdays,[1,2,3,4,5]);
 assert.equal(preview.firstEligibleDate,"2026-11-20");
 assert.equal(preview.projectBaselineLastDate,"2026-11-22");
 assert.equal(preview.projectScenarioLastDate,"2026-11-24");
 assert.equal(preview.projectedBoundaryDate,"2026-11-25");
 assert.equal(preview.shiftDays,2);
 assert.deepEqual(preview.rows.map(x=>[x.id,x.startDate,x.completionDate,x.baselineLastDate,x.shiftDays]),[
  ["a","2026-11-20","2026-11-23","2026-11-21",2],
  ["b","2026-11-24","2026-11-24","2026-11-22",2]
 ]);
 assert.equal(JSON.stringify(p),originalProject);
 assert.equal(JSON.stringify(plan),originalPlan);
});

test("explicit holidays change work dates but never modify project",()=>{
 const p=project("2026-11-20",[["a",2],["b",1]],[["a","b"]]);
 const s=scheduleProject(p);
 const preview=previewWorkingWeek(s,{startDate:p.startDate,holidays:["2026-11-23"]});
 assert.equal(preview.skippedHolidays,1);
 assert.equal(preview.projectScenarioLastDate,"2026-11-25");
 assert.equal(preview.projectedBoundaryDate,"2026-11-26");
 assert.equal(preview.shiftDays,3);
 assert.deepEqual(preview.rows.map(x=>x.completionDate),["2026-11-24","2026-11-25"]);
 assert.equal(s.estimatedFinish,"2026-11-23");
});

test("Sunday project start explicitly moves to next eligible work date",()=>{
 const p=project("2026-11-22",[["a",1]]);
 const s=scheduleProject(p);
 const result=previewWorkingWeek(s,{startDate:p.startDate});
 assert.equal(result.startAdjusted,true);
 assert.equal(result.firstEligibleDate,"2026-11-23");
 assert.equal(result.projectBaselineLastDate,"2026-11-22");
 assert.equal(result.projectScenarioLastDate,"2026-11-23");
 assert.equal(result.shiftDays,1);
});

test("six-day working week, including Saturday, excludes Sunday",()=>{
 const p=project("2026-11-20",[["a",3]]);
 const s=scheduleProject(p);
 const result=previewWorkingWeek(s,{startDate:p.startDate,weekdays:[1,2,3,4,5,6]});
 assert.equal(result.projectScenarioLastDate,"2026-11-23");
 assert.equal(result.shiftDays,1);
 assert.equal(result.startAdjusted,false);
});

test("zero-day milestones follow the preceding work, without inventing occupied days",()=>{
 const p=project("2026-11-20",[["a",1],["gate",0]],[["a","gate"]]);
 const s=scheduleProject(p);
 const result=previewWorkingWeek(s,{startDate:p.startDate});
 const gate=result.rows.find(x=>x.id==="gate");
 assert.equal(gate.startDate,"2026-11-23");
 assert.equal(gate.completionDate,"2026-11-23");
 assert.equal(gate.durationWorkdays,0);
 assert.equal(result.projectScenarioLastDate,"2026-11-23");
});

test("inclusive due dates use last occupied workday, not exclusive boundary",()=>{
 const p=project("2026-11-20",[["a",1,"2026-11-20"],["b",1,"2026-11-22"]],[["a","b"]]);
 const result=previewWorkingWeek(scheduleProject(p),{startDate:p.startDate});
 assert.equal(result.rows[0].wouldMissDueDate,false);
 assert.equal(result.rows[0].completionDate,"2026-11-20");
 assert.equal(result.rows[1].wouldMissDueDate,true);
 assert.equal(result.rows[1].completionDate,"2026-11-23");
});

test("leap day and daylight-saving boundaries use UTC civil dates",()=>{
 const leap=project("2028-02-25",[["a",3]]);
 const march=project("2026-03-06",[["a",2]]);
 assert.equal(previewWorkingWeek(scheduleProject(leap),{startDate:leap.startDate}).projectScenarioLastDate,"2028-02-29");
 assert.equal(previewWorkingWeek(scheduleProject(march),{startDate:march.startDate}).projectScenarioLastDate,"2026-03-09");
});

test("unknown start remains unknown instead of fabricating absolute dates",()=>{
 const p=project(null,[["a",2]]);
 const s=scheduleProject(p);
 const result=previewWorkingWeek(s,{startDate:p.startDate});
 assert.equal(result.available,false);
 assert.equal(result.reason,"NO_PROJECT_START");
 assert.equal(result.projectScenarioLastDate,null);
 assert.deepEqual(result.rows,[]);
});

test("invalid calendar inputs, offsets, impossible and duplicate weekdays are rejected",()=>{
 const s=scheduleProject(project("2026-11-20",[["a",2]]));
 for(const options of [
  {startDate:"2026-02-31"}, {startDate:"not-a-date"},
  {startDate:"2026-11-20",weekdays:[]},
  {startDate:"2026-11-20",weekdays:[0,0]},
  {startDate:"2026-11-20",weekdays:[7]},
  {startDate:"2026-11-20",holidays:["2026-02-30"]},
  {startDate:"2026-11-20",holidays:["invalid"]},
  {startDate:"2026-11-20",holidays:Array(1001).fill("2026-11-23")}
 ])assert.throws(()=>previewWorkingWeek(s,options),/Invalid/);
 for(const invalid of [
  {...s,durationDays:-1},
  {...s,rows:[{id:"a",earlyStart:2,earlyFinish:1}]},
  {...s,rows:[{id:"a",earlyStart:0,earlyFinish:40000}]}
 ])assert.throws(()=>previewWorkingWeek(invalid,{startDate:"2026-11-20"}),/Invalid/);
});

test("year 9999 overflow never fabricates a truncated calendar year",()=>{
 const p=project("9999-12-31",[["a",3]]);
 const s=scheduleProject(p);
 const preview=previewWorkingWeek(s,{startDate:p.startDate});
 assert.equal(s.estimatedFinish,null);
 assert.equal(preview.projectScenarioLastDate,null);
 assert.equal(preview.projectedBoundaryDate,null);
 assert.equal(preview.rows[0].completionDate,null);
 assert.equal(preview.shiftDays,null);
});

test("empty plan is not reported as completed work",()=>{
 const p=project("2026-11-20",[]);
 const s=scheduleProject(p);
 const preview=previewWorkingWeek(s,{startDate:p.startDate});
 assert.equal(preview.projectScenarioLastDate,null);
 assert.deepEqual(preview.rows,[]);
});

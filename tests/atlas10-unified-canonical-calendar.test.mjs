import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editProject,editItem,createWorkCalendar,
 validate,serialize,deserialize} from "../src/core.mjs";
import {scheduleProject,scheduleChangeSummary,scheduleDeadlineExplanations} from "../src/planning.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {buildIwxaPortfolio,readIwxaPortfolio} from "../desktop/src/iwxa-portfolio.mjs";
import {readFileSync} from "node:fs";
const weekdays=[1,2,3,4,5];
const source={kind:"entered_by_user",reference:null};
function initial(name="Factory",date="2026-11-20"){
 const p=createProject(empty(),{name,type:"engineering"});
 return {pid:p.id,s:editProject(p.state,p.id,{startDate:date})};
}
function calendar(s,dates=[],extra=[]){
 return createWorkCalendar(s,{name:"Factory working calendar",weekdays,
  excludedDates:dates,additionalWorkingDates:extra,source});
}
function addWork(s,pid,title,duration,unit="elapsed_days",basis=null){
 const r=createItem(s,pid,{title});
 const edited=editItem(r.state,pid,r.id,{estimateDays:duration,durationUnit:unit,
  calendarBasis:basis});
 return {id:r.id,state:edited};
}
function connectedScenario(holidays=[]){
 const p=initial(),c=calendar(p.s,holidays);
 const a=addWork(c.state,p.pid,"Installation",2,"working_days",
  {id:c.id,version:c.version});
 const b=addWork(a.state,p.pid,"Curing",2);
 const work=addWork(b.state,p.pid,"Independent elapsed",4);
 let s=structuredClone(work.state);
 s.projects[0].dependencies=[{from:a.id,to:b.id}];
 validate(s);
 return {s,pid:p.pid,a:a.id,b:b.id,c:work.id,basis:{id:c.id,version:1}};
}
test("two working days Friday and Monday, followed by 2 elapsed days, share one canonical CPM",()=>{
 const {s,a,b,c}=connectedScenario();
 const plan=scheduleProject(s.projects[0],{calendarLibrary:s.calendarLibrary});
 const one=plan.rows.find(r=>r.id===a),two=plan.rows.find(r=>r.id===b),
  side=plan.rows.find(r=>r.id===c);
 assert.equal(one.startDate,"2026-11-20");
 assert.equal(one.finishDate,"2026-11-24");
 assert.equal(one.durationUnit,"working_days");
 assert.equal(one.durationDays,2);
 assert.equal(one.elapsedDays,4);
 assert.deepEqual(one.calendarBasis,s.projects[0].items.find(w=>w.id===a).calendarBasis);
 assert.equal(two.startDate,"2026-11-24");
 assert.equal(two.finishDate,"2026-11-26");
 assert.equal(side.finishDate,"2026-11-24");
 assert.equal(plan.durationDays,6);
 assert.equal(plan.estimatedFinish,"2026-11-26");
 assert.deepEqual(new Set(plan.criticalIds),new Set([a,b]));
 assert.equal(side.floatDays,2);
 assert.equal(one.floatDays,0);
 assert.equal(two.floatDays,0);
 assert.equal(plan.warning.includes("Calendar-aware"),true);
 assert.equal(scheduleDeadlineExplanations(plan).size,0);
});
test("holiday exclusion changes early/late dates consistently and preserves stored durations",()=>{
 const {s,a,b}=connectedScenario(["2026-11-23"]);
 const before=serialize(s);
 const plan=scheduleProject(s.projects[0],{calendarLibrary:s.calendarLibrary});
 assert.equal(plan.rows.find(r=>r.id===a).finishDate,"2026-11-25");
 assert.equal(plan.rows.find(r=>r.id===b).finishDate,"2026-11-27");
 assert.equal(plan.durationDays,7);
 assert.equal(plan.rows.find(r=>r.id===a).floatDays,0);
 assert.equal(plan.rows.find(r=>r.id===b).floatDays,0);
 assert.equal(serialize(s),before,"CPM cannot alter Atlas Store");
});
test("extra working Saturday is counted by original canonical CPM, not an alternate scheduler",()=>{
 const {s,a}=connectedScenario(["2026-11-23"]);
 const revised=structuredClone(s);
 revised.calendarLibrary[0].additionalWorkingDates=["2026-11-21"];
 const plan=scheduleProject(revised.projects[0],{calendarLibrary:revised.calendarLibrary});
 assert.equal(plan.rows.find(r=>r.id===a).startDate,"2026-11-20");
 assert.equal(plan.rows.find(r=>r.id===a).finishDate,"2026-11-22");
 assert.equal(plan.durationDays,4);
});
test("canonical CPM reevaluates a weekend start and zero-day milestones",()=>{
 const p=initial("Milestones","2026-11-21"),c=calendar(p.s);
 const start=addWork(c.state,p.pid,"Working operation",2,"working_days",
  {id:c.id,version:1});
 const milestone=addWork(start.state,p.pid,"Zero-day handoff",0);
 const s=structuredClone(milestone.state);
 s.projects[0].dependencies=[{from:start.id,to:milestone.id}];
 const plan=scheduleProject(s.projects[0],{calendarLibrary:s.calendarLibrary});
 assert.equal(plan.rows.find(r=>r.id===start.id).startDate,"2026-11-23");
 assert.equal(plan.rows.find(r=>r.id===start.id).finishDate,"2026-11-25");
 const zero=plan.rows.find(r=>r.id===milestone.id);
 assert.equal(zero.startDate,"2026-11-25");
 assert.equal(zero.finishDate,"2026-11-25");
 assert.equal(zero.durationDays,0);
 assert.deepEqual(new Set(plan.criticalIds),new Set([start.id,milestone.id]));
});
test("calendar source is explicit; missing start/version and mismatched unit fail before native Save",()=>{
 const p=initial(),c=calendar(p.s);
 const added=createItem(c.state,p.pid,{title:"Staffed"});
 const baseline=serialize(added.state);
 const cases=[
  {durationUnit:"working_days",calendarBasis:null},
  {durationUnit:"working_days",calendarBasis:{id:c.id,version:99}},
  {durationUnit:"elapsed_days",calendarBasis:{id:c.id,version:1}},
  {durationUnit:"hours",calendarBasis:null}
 ];
 for(const patch of cases){
  assert.throws(()=>editItem(added.state,p.pid,added.id,patch),
   /Invalid|редакция|требуется|allowed/);
 }
 const noStart=editProject(added.state,p.pid,{startDate:null});
 assert.throws(()=>editItem(noStart,p.pid,added.id,{
  durationUnit:"working_days",calendarBasis:{id:c.id,version:1}
 }),/дату начала проекта/);
 assert.equal(serialize(added.state),baseline);
});
test("portfolio must recompute working-day finish at dependency-shifted start",()=>{
 const a=initial("Upstream","2026-11-20");
 const b=createProject(a.s,{name:"Downstream",type:"engineering"});
 let s=editProject(b.state,b.id,{startDate:"2026-11-20"});
 const upstream=addWork(s,a.pid,"Supply",1);
 s=upstream.state;
 const c=calendar(s);
 const downstream=addWork(c.state,b.id,"Staffed",2,"working_days",{id:c.id,version:1});
 s=addPortfolioLink(downstream.state,{from:a.pid,to:b.id});
 const forecast=portfolioSchedule(s);
 assert.equal(forecast.byId.get(a.pid).projectedFinish,"2026-11-21");
 assert.equal(forecast.byId.get(b.id).plannedFinish,"2026-11-24");
 assert.equal(forecast.byId.get(b.id).projectedStart,"2026-11-21");
 assert.equal(forecast.byId.get(b.id).projectedFinish,"2026-11-25");
 assert.equal(forecast.byId.get(b.id).durationDays,4);
 const shifted=scheduleProject(s.projects.find(p=>p.id===b.id),{
  startDate:"2026-11-21",calendarLibrary:s.calendarLibrary});
 assert.equal(shifted.estimatedFinish,forecast.byId.get(b.id).projectedFinish);
 const base=scheduleProject(s.projects.find(p=>p.id===b.id),{
  calendarLibrary:s.calendarLibrary});
 assert.equal(base.estimatedFinish,forecast.byId.get(b.id).plannedFinish);
});
test("native Work editor saves explicit duration unit and basis into existing project",()=>{
 const p=initial(),c=calendar(p.s);
 const r=createItem(c.state,p.pid,{title:"Install"});
 const spec=editorSpec(r.state.projects[0],"work:"+r.id,r.state);
 assert.ok(spec.fields.some(f=>f.name==="durationUnit"));
 assert.ok(spec.fields.some(f=>f.name==="calendarBasis"));
 const selected=c.id+"@1";
 const form=new Map(spec.fields.map(f=>[f.name,String(f.value??"")]));
 form.set("estimateDays","3");
 form.set("durationUnit","working_days");
 form.set("calendarBasis",selected);
 const changed=applyEditor(r.state,p.pid,"work:"+r.id,form);
 const work=changed.state.projects[0].items.find(item=>item.id===r.id);
 assert.equal(work.durationUnit,"working_days");
 assert.deepEqual(work.calendarBasis,{id:c.id,version:1});
 assert.equal(scheduleProject(changed.state.projects[0],{
  calendarLibrary:changed.state.calendarLibrary}).rows.find(row=>row.id===r.id).finishDate,
 "2026-11-25");
 const reopen=editorSpec(changed.state.projects[0],"work:"+r.id,changed.state);
 assert.equal(reopen.fields.find(f=>f.name==="durationUnit").value,"working_days");
 assert.equal(reopen.fields.find(f=>f.name==="calendarBasis").value,selected);
 const undo=new Map(reopen.fields.map(f=>[f.name,String(f.value??"")]));
 undo.set("durationUnit","elapsed_days");
 undo.set("calendarBasis","");
 const elapsed=applyEditor(changed.state,p.pid,"work:"+r.id,undo);
 const reverted=elapsed.state.projects[0].items.find(item=>item.id===r.id);
 assert.equal(reverted.durationUnit,"elapsed_days");
 assert.equal("calendarBasis" in reverted,false);
});
test("native project and .iwxa carrier persist typed Work without a second store",async()=>{
 const {s,a}=connectedScenario();
 const reopened=deserialize(serialize(s));
 assert.equal(reopened.projects[0].items.find(w=>w.id===a).durationUnit,"working_days");
 const bytes=await buildIwxaPortfolio(s,{now:"2026-11-22T14:30:00.000Z"});
 const archive=await readIwxaPortfolio(bytes);
 assert.deepEqual(archive.snapshot,s);
 assert.deepEqual(scheduleProject(archive.snapshot.projects[0],{
  calendarLibrary:archive.snapshot.calendarLibrary}),
  scheduleProject(s.projects[0],{calendarLibrary:s.calendarLibrary}));
});
test("one calendar calculation drives Gantt, work table and portfolio; older 0.8 gate removed",()=>{
 const core=readFileSync(new URL("../src/planning.mjs",import.meta.url),"utf8");
 const desktop=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const portfolio=readFileSync(new URL("../src/portfolio-schedule.mjs",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/manual-check.yml",import.meta.url),"utf8");
 assert.match(core,/export function scheduleProject\(/);
 assert.match(desktop,/const plan=useMemo\(\(\)=>project\?scheduleProject\(project,\{/);
 assert.match(desktop,/calendarLibrary:data.calendarLibrary\?\?\[\]/);
 assert.match(portfolio,/scheduleProject\(p,\{calendarLibrary:snapshot.calendarLibrary\?\?\[\]/);
 assert.match(portfolio,/startDate:dateOf\(projectedStartDay\)/);
 assert.doesNotMatch(workflow,/Checkout released Atlas 0\.8 unchanged for backwards-compatibility test/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createItem,editItem,editProject,createWorkCalendar,
 connect,validate,serialize,deserialize,removeItem} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {capturePlanBaseline,comparePlanBaseline} from "../src/plan-baseline.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";

function fixture(){
 const a=createProject(empty(),{name:"Supply",type:"engineering"});
 const b=createProject(a.state,{name:"Assembly",type:"engineering"});
 let s=editProject(b.state,a.id,{startDate:"2026-11-20"});
 s=editProject(s,b.id,{startDate:"2026-11-20"});
 const supply=createItem(s,a.id,{title:"Shipment"});
 s=editItem(supply.state,a.id,supply.id,{estimateDays:1});
 const cal=createWorkCalendar(s,{name:"Mon-Fri",weekdays:[1,2,3,4,5],
  excludedDates:[],additionalWorkingDates:[],source:{kind:"entered_by_user",reference:null}});
 const work=createItem(cal.state,b.id,{title:"Assembly operation"});
 s=editItem(work.state,b.id,work.id,{estimateDays:2,durationUnit:"working_days",
  calendarBasis:{id:cal.id,version:1}});
 s=addPortfolioLink(s,{from:a.id,to:b.id});
 return {s,up:a.id,pid:b.id,workId:work.id,cal};
}

test("0.11 baseline captures shifted portfolio dates and survives the original native snapshot roundtrip",()=>{
 const f=fixture(),before=serialize(f.s),initial=portfolioSchedule(f.s).byId.get(f.pid);
 assert.equal(initial.projectedFinish,"2026-11-25");
 const result=capturePlanBaseline(f.s,f.pid,{recordedAt:"2026-11-22T00:00:00.000Z"});
 assert.equal(serialize(f.s),before);
 assert.equal(result.baseline.forecastFinish,initial.projectedFinish);
 assert.equal(result.baseline.forecastStart,initial.projectedStart);
 assert.equal(result.baseline.work[0].calendarBasis.version,1);
 assert.equal(result.baseline.sourceRevision,f.s.revision);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 const projection=comparePlanBaseline(result.state,f.pid);
 assert.equal(projection.finishShiftDays,0);
 assert.equal(projection.totals.changed,0);
});

test("0.11 baseline stays fixed across calendar edits, dependency changes, and actual dates",()=>{
 const f=fixture();
 const captured=capturePlanBaseline(f.s,f.pid,{name:"Contract dates"});
 let s=captured.state;
 const baseline=serialize(s.projects.find(p=>p.id===f.pid).planBaselines[0]);
 s=editItem(s,f.pid,f.workId,{estimateDays:3});
 let diff=comparePlanBaseline(s,f.pid,captured.id);
 assert.equal(diff.rows[0].shiftDays,1);
 assert.ok(diff.rows[0].reasons.includes("Изменена длительность"));
 s=editItem(s,f.pid,f.workId,{actualStartDate:"2026-11-23",actualFinishDate:"2026-11-29",state:"done"});
 diff=comparePlanBaseline(s,f.pid,captured.id);
 assert.equal(diff.rows[0].actualFinish,"2026-11-29");
 assert.equal(diff.rows[0].actualShiftDays,4);
 assert.equal(diff.rows[0].actualSource,"entered_by_user");
 assert.equal(diff.totals.reportedFinish,1);
 assert.equal(serialize(s.projects.find(p=>p.id===f.pid).planBaselines[0]),baseline);
 assert.equal(diff.baseline.id,captured.id);
});

test("0.11 does not invent a finish date when upstream project is paused",()=>{
 const f=fixture();
 const captured=capturePlanBaseline(f.s,f.pid);
 const paused=editProject(captured.state,f.up,{status:"paused"});
 const diff=comparePlanBaseline(paused,f.pid);
 assert.equal(diff.forecastFinish,null);
 assert.equal(diff.finishShiftDays,null);
 assert.equal(diff.rows[0].forecastFinish,null);
 assert.equal(diff.rows[0].shiftDays,null);
 assert.equal(diff.baseline.forecastFinish,"2026-11-25");
});

test("0.11 fixes Work identities even after removal; new Work is not invented in historical plan",()=>{
 const f=fixture();
 const captured=capturePlanBaseline(f.s,f.pid);
 const removed=removeItem(captured.state,f.pid,f.workId);
 const comparison=comparePlanBaseline(removed,f.pid);
 assert.equal(comparison.rows[0].removed,true);
 assert.equal(comparison.rows[0].referenceFinish,"2026-11-25");
 assert.equal(comparison.rows[0].forecastFinish,null);
 const newWork=createItem(removed,f.pid,{title:"Replacement"});
 const next=comparePlanBaseline(newWork.state,f.pid);
 assert.equal(next.rows.length,2);
 assert.equal(next.totals.added,1);
 assert.equal(next.totals.removed,1);
});

test("0.11 rejects invalid baseline archives, cannot modify an existing control plan",()=>{
 const f=fixture(),captured=capturePlanBaseline(f.s,f.pid);
 const source=serialize(captured.state);
 for(const damage of [
  b=>{b.version=17;}, b=>{b.forecastFinish="2026-02-31";},
  b=>{b.work[0].predecessors=["unknown"];},b=>{b.work[0].finishDate="bad";},
  b=>{b.work[0].calendarBasis={id:"none",version:0};}
 ]){
  const broken=structuredClone(captured.state);
  damage(broken.projects.find(p=>p.id===f.pid).planBaselines[0]);
  assert.throws(()=>validate(broken),/baseline|calendar source revision/i);
 }
 assert.throws(()=>capturePlanBaseline(captured.state,f.pid,{name:"Исходный план"}),/уже существует/);
 assert.equal(serialize(captured.state),source);
});

test("0.11 actual dates are explicitly entered, ordered and available through the Work editor",()=>{
 const f=fixture(),project=f.s.projects.find(p=>p.id===f.pid);
 const spec=editorSpec(project,"work:"+f.workId,f.s);
 assert.ok(spec.fields.some(field=>field.name==="actualStartDate"&&field.type==="date"));
 assert.ok(spec.fields.some(field=>field.name==="actualFinishDate"&&field.type==="date"));
 const fields=new Map(spec.fields.map(field=>[field.name,String(field.value??"")]));
 fields.set("actualStartDate","2026-11-25");
 fields.set("actualFinishDate","2026-11-26");
 const saved=applyEditor(f.s,f.pid,"work:"+f.workId,fields);
 assert.equal(saved.state.projects.find(p=>p.id===f.pid).items[0].actualStartDate,"2026-11-25");
 assert.equal(saved.state.projects.find(p=>p.id===f.pid).items[0].actualFinishDate,"2026-11-26");
 assert.throws(()=>editItem(f.s,f.pid,f.workId,{
  actualStartDate:"2026-11-26",actualFinishDate:"2026-11-25"
 }),/actual dates/);
 assert.throws(()=>editItem(f.s,f.pid,f.workId,{actualStartDate:"2026-02-31"}),/actual dates/);
});

test("0.11 keeps the accepted CPM and distinct source-evidence page",()=>{
 const src=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(src,/capturePlanBaseline\(latestSnapshot\.current,project\.id/);
 assert.match(src,/comparePlanBaseline\(data,project\.id/);
 assert.match(src,/Контрольный план и исполнение/);
 assert.match(src,/Зафиксировать план/);
 assert.match(src,/const plan=scheduleView\?\.display\?\?null/);
 assert.match(src,/Что известно о результате/);
});

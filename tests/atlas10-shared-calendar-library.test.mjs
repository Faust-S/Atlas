import test from "node:test";
import assert from "node:assert/strict";
import {
 empty,createProject,createItem,createWorkCalendar,reviseWorkCalendar,
 latestWorkCalendars,workCalendarRevision,upsertCalendarDraft,
 validate,serialize,deserialize
} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {previewOperationCalendars} from "../src/working-week-scenario.mjs";
import {buildIwxaPortfolio,readIwxaPortfolio} from "../desktop/src/iwxa-portfolio.mjs";
const rules={
 weekdays:[1,2,3,4,5],excludedDates:["2026-11-23"],
 additionalWorkingDates:["2026-11-28"]
};
const source={kind:"document_reference",reference:"Production shift agreement 2026, annex 3"};
const calendar=(name="Организационный график")=>({name,...rules,source});
const setup=()=>{
 const p=createProject(empty(),{name:"Construction",type:"engineering"});
 const a=createItem(p.state,p.id,{title:"Installation"});
 const b=createItem(a.state,p.id,{title:"Curing"});
 return {projectId:p.id,workA:a.id,workB:b.id,s:b.state};
};
test("optional calendar library leaves every legacy atlas.project/1 unchanged",()=>{
 const {s}=setup();
 const old=serialize(s);
 assert.equal("calendarLibrary" in s,false);
 assert.equal(latestWorkCalendars(s).length,0);
 assert.equal(deserialize(old).schema,"atlas.project/1");
 assert.equal(serialize(s),old);
});
test("create immutable sourced portfolio-wide work calendar without altering canonical CPM",()=>{
 const {s,projectId}=setup(),before=serialize(s),cp=scheduleProject(s.projects[0]);
 const created=createWorkCalendar(s,calendar());
 assert.equal(created.state.revision,s.revision+1);
 assert.equal(created.state.schema,"atlas.project/1");
 assert.equal(created.version,1);
 assert.equal(created.state.calendarLibrary.length,1);
 const first=workCalendarRevision(created.state,created.id,1);
 assert.deepEqual(first.weekdays,[1,2,3,4,5]);
 assert.equal(first.source.kind,"document_reference");
 assert.equal(first.source.reference,source.reference);
 assert.equal(Number.isFinite(Date.parse(first.recordedAt)),true);
 assert.deepEqual(latestWorkCalendars(created.state),[first]);
 assert.equal(serialize(s),before);
 assert.deepEqual(scheduleProject(created.state.projects[0]),cp);
 assert.deepEqual(deserialize(serialize(created.state)),created.state);
 assert.equal("durationUnit" in created.state.projects[0].items[0],false);
 assert.equal(projectId,s.projects[0].id);
});
test("revising calendar appends immutable versions; stale edits are rejected",()=>{
 const {s}=setup();
 const created=createWorkCalendar(s,calendar());
 const saved=serialize(created.state);
 const next=reviseWorkCalendar(created.state,created.id,1,{
  name:"Шестидневная неделя",...rules,weekdays:[1,2,3,4,5,6],
  additionalWorkingDates:["2026-11-28","2026-12-05"],
  source:{kind:"entered_by_user",reference:null}
 });
 assert.equal(next.version,2);
 assert.equal(next.state.calendarLibrary.length,2);
 assert.deepEqual(workCalendarRevision(next.state,created.id,1),
  workCalendarRevision(created.state,created.id,1));
 assert.deepEqual(latestWorkCalendars(next.state),[workCalendarRevision(next.state,created.id,2)]);
 assert.equal(next.state.calendarLibrary[1].source.reference,null);
 assert.equal(serialize(created.state),saved);
 assert.throws(()=>reviseWorkCalendar(next.state,created.id,1,calendar()),/Stale calendar version/);
 assert.equal(next.state.revision,created.state.revision+1);
});
test("multiple projects may use one shared exact revision without changing plans",()=>{
 const base=setup();
 const second=createProject(base.s,{name:"Other",type:"research"});
 const lib=createWorkCalendar(second.state,calendar());
 const linked=upsertCalendarDraft(lib.state,base.projectId,{
  ...rules,name:"Сценарий по документу",
  modeByWork:{[base.workB]:"elapsed_days"},
  calendarBasis:{id:lib.id,version:lib.version}
 });
 const other=upsertCalendarDraft(linked.state,second.id,{
  ...rules,name:"Сценарий другого проекта",modeByWork:{},
  calendarBasis:{id:lib.id,version:1}
 });
 assert.equal(other.state.projects[0].calendarDrafts[0].calendarBasis.version,1);
 assert.deepEqual(other.state.projects[1].calendarDrafts[0].calendarBasis,
  {id:lib.id,version:1});
 const before=scheduleProject(other.state.projects[0]);
 const scenario=previewOperationCalendars(before,{
  startDate:"2026-11-20",...{
   weekdays:other.state.calendarLibrary[0].weekdays,
   holidays:other.state.calendarLibrary[0].excludedDates,
   additionalWorkingDates:other.state.calendarLibrary[0].additionalWorkingDates
  },modeByWork:other.state.projects[0].calendarDrafts[0].modeByWork
 });
 assert.equal(scenario.kind,"MIXED_CALENDAR_HYPOTHESIS");
 assert.deepEqual(scheduleProject(other.state.projects[0]),before);
 assert.equal(serialize(deserialize(serialize(other.state))),serialize(other.state));
});
test("calendar revision pinning: a new version never silently changes old scenario",()=>{
 const {s,projectId}=setup();
 const created=createWorkCalendar(s,calendar());
 const attached=upsertCalendarDraft(created.state,projectId,{
  ...rules,name:"Версия 1",modeByWork:{},
  calendarBasis:{id:created.id,version:1}
 });
 const update=reviseWorkCalendar(attached.state,created.id,1,{
  ...calendar(),weekdays:[1,2,3,4,5,6]
 });
 assert.deepEqual(update.state.projects[0].calendarDrafts[0].calendarBasis,
  {id:created.id,version:1});
 assert.deepEqual(update.state.projects[0].calendarDrafts[0].weekdays,[1,2,3,4,5]);
 assert.deepEqual(workCalendarRevision(update.state,created.id,2).weekdays,[1,2,3,4,5,6]);
 assert.throws(()=>upsertCalendarDraft(update.state,projectId,{
  ...rules,name:"Нельзя выдать за источник",
  weekdays:[1,2,3,4,5,6],calendarBasis:{id:created.id,version:1}
 }),/Calendar source rules have changed/);
 assert.throws(()=>upsertCalendarDraft(update.state,projectId,{
  ...rules,name:"Несуществующая редакция",
  calendarBasis:{id:created.id,version:99}
 }),/Calendar source revision unavailable/);
});
test("no fabricated legal approval: local sources must be explicitly supplied",()=>{
 const {s}=setup();
 const invalid=[
  {...calendar(),source:undefined},
  {...calendar(),source:{kind:"official_approved",reference:""}},
  {...calendar(),source:{kind:"document_reference",reference:""}},
  {...calendar(),source:{kind:"entered_by_user",reference:"A"}},
  {...calendar(),source:{kind:"document_reference",reference:" ".repeat(3)}},
  {...calendar(),source:{kind:"document_reference",reference:"x".repeat(321)}},
  {...calendar(),weekdays:[]},
  {...calendar(),weekdays:[1,1]},
  {...calendar(),weekdays:[1,9]},
  {...calendar(),excludedDates:["2026-02-30"]},
  {...calendar(),additionalWorkingDates:["2026-11-23"]},
  {...calendar(),name:"  "}
 ];
 for(const bad of invalid)assert.throws(()=>createWorkCalendar(s,bad),
  /Invalid|Conflicting|required/);
 assert.equal("calendarLibrary" in s,false);
});
test("renaming different calendars to same name is rejected",()=>{
 let s=setup().s;
 const a=createWorkCalendar(s,calendar("First"));s=a.state;
 const b=createWorkCalendar(s,calendar("Second"));s=b.state;
 assert.throws(()=>createWorkCalendar(s,calendar(" first ")),/Duplicate calendar library name/);
 assert.throws(()=>reviseWorkCalendar(s,b.id,1,calendar("First")),/Duplicate calendar library name/);
 assert.equal(latestWorkCalendars(s).length,2);
});
test("invalid imported versions are rejected; old unknown fields remain untouched",()=>{
 const created=createWorkCalendar(setup().s,calendar());
 const invalid=[
  d=>{d.version=2;},
  d=>{d.name="";},
  d=>{d.weekdays=[1,1];},
  d=>{d.additionalWorkingDates=["2026-11-23"];},
  d=>{d.source={kind:"document_reference",reference:null};},
  d=>{d.recordedAt="wrong";}
 ];
 for(const damage of invalid){
  const clone=structuredClone(created.state);
  damage(clone.calendarLibrary[0]);
  assert.throws(()=>deserialize(JSON.stringify(clone)),/Invalid|Non-canonical|Conflicting/);
 }
 const legacy={...created.state,revision:created.state.revision+1,
  projects:structuredClone(created.state.projects)};
 legacy.projects[0].calendarDrafts=[{
  id:"pre-existing-external-link",version:1,baseRevision:1,
  name:"External legacy scenario",createdAt:"2026-11-22T10:00:00.000Z",
  updatedAt:"2026-11-22T10:00:00.000Z",
  ...rules,modeByWork:{},
  calendarBasis:{id:"missing-old-calendar",version:2}
 }];
 // Preserve historical source labels for inspection; do not assert that the
 // missing definition is approved, and forbid new writes claiming this ID.
 assert.deepEqual(deserialize(JSON.stringify(legacy)),legacy);
 assert.throws(()=>upsertCalendarDraft(legacy,legacy.projects[0].id,{
  ...rules,name:"False provenance",modeByWork:{},
  calendarBasis:{id:"missing-old-calendar",version:2}
 }),/Calendar source revision unavailable/);
});
test("real .iwxa ZIP preserves immutable source, snapshots and linked project without schema change",async()=>{
 const {s,projectId,workB}=setup();
 const lib=createWorkCalendar(s,calendar());
 const linked=upsertCalendarDraft(lib.state,projectId,{
  ...rules,name:"Сценарий поставки",
  modeByWork:{[workB]:"elapsed_days"},
  calendarBasis:{id:lib.id,version:1}
 });
 const zip=await buildIwxaPortfolio(linked.state,{
  now:"2026-11-22T11:45:00.000Z"
 });
 const restored=await readIwxaPortfolio(zip);
 assert.equal(serialize(restored.snapshot),serialize(linked.state));
 assert.equal(restored.snapshot.calendarLibrary[0].source.reference,source.reference);
 assert.deepEqual(restored.snapshot.projects[0].calendarDrafts[0].calendarBasis,
  {id:lib.id,version:1});
 assert.equal(restored.snapshot.schema,"atlas.project/1");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
 empty,createProject,createItem,editItem,removeItem,
 upsertCalendarDraft,removeCalendarDraft,validate,serialize,deserialize
} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {previewOperationCalendars} from "../src/working-week-scenario.mjs";
const setup=()=>{
 let p=createProject(empty(),{name:"Manufacturing",type:"engineering"});
 const a=createItem(p.state,p.id,{title:"Install"});
 const b=createItem(a.state,p.id,{title:"Continuous curing"});
 return {pid:p.id,a:a.id,b:b.id,s:b.state};
};
const example=({id,modeByWork,extra=[]}={})=>({
 ...(id?{id}:{}),name:"Рабочие и непрерывные",
 weekdays:[1,2,3,4,5],excludedDates:["2026-11-23"],
 additionalWorkingDates:extra,modeByWork:modeByWork||{}
});

test("legacy atlas.project/1 serializes unchanged without draft calendars",()=>{
 const {s}=setup();
 assert.equal("calendarDrafts" in s.projects[0],false);
 const roundtrip=deserialize(serialize(s));
 assert.deepEqual(roundtrip,s);
 assert.equal(roundtrip.schema,"atlas.project/1");
});

test("create a versioned named draft with explicit continuous work, without changing CPM",()=>{
 const {s,pid,b}=setup();
 const old=serialize(s),before=scheduleProject(s.projects[0]);
 const r=upsertCalendarDraft(s,pid,example({modeByWork:{[b]:"elapsed_days"}}));
 assert.equal(r.state.schema,"atlas.project/1");
 assert.equal(r.state.revision,s.revision+1);
 assert.equal(serialize(s),old,"calendar draft creation must not mutate old snapshot");
 const draft=r.state.projects[0].calendarDrafts[0];
 assert.equal(draft.id,r.id);
 assert.equal(draft.version,1);
 assert.equal(draft.baseRevision,s.revision);
 assert.equal(draft.modeByWork[b],"elapsed_days");
 assert.equal(draft.name,"Рабочие и непрерывные");
 assert.deepEqual(scheduleProject(r.state.projects[0]),before);
 assert.deepEqual(deserialize(serialize(r.state)),r.state);
});

test("saved draft is executable only as an explicit hypothesis, not canonical schedule",()=>{
 const {s,pid,b}=setup();
 s.projects[0].startDate="2026-11-20";
 s.projects[0].dependencies=[{from:s.projects[0].items[0].id,to:b}];
 const r=upsertCalendarDraft(s,pid,example({modeByWork:{[b]:"elapsed_days"}}));
 const {id,modeByWork,weekdays,excludedDates,additionalWorkingDates}=r.state.projects[0].calendarDrafts[0];
 assert.ok(id);
 const old=scheduleProject(r.state.projects[0]);
 const scenario=previewOperationCalendars(old,{
  startDate:"2026-11-20",weekdays,holidays:excludedDates,additionalWorkingDates,modeByWork
 });
 assert.equal(scenario.kind,"MIXED_CALENDAR_HYPOTHESIS");
 assert.equal(scenario.rows.find(x=>x.id===b).durationMode,"elapsed_days");
 assert.equal(old.warning.includes("Calendar-day CPM"),true);
 assert.equal("durationUnit" in r.state.projects[0].items[1],false);
});

test("editing calendar draft increments its own version and keeps stable ID",()=>{
 const {s,pid,b}=setup();
 const r=upsertCalendarDraft(s,pid,example());
 const prior=r.state.projects[0].calendarDrafts[0];
 const updated=upsertCalendarDraft(r.state,pid,{
  ...example({id:r.id,modeByWork:{[b]:"elapsed_days"}}),
  name:"Другая рабочая неделя",weekdays:[1,2,3,4,5,6],
  additionalWorkingDates:["2026-12-19"]
 });
 const next=updated.state.projects[0].calendarDrafts[0];
 assert.equal(updated.id,r.id);
 assert.equal(next.version,prior.version+1);
 assert.equal(next.createdAt,prior.createdAt);
 assert.equal(next.baseRevision,r.state.revision);
 assert.deepEqual(next.weekdays,[1,2,3,4,5,6]);
 assert.deepEqual(next.additionalWorkingDates,["2026-12-19"]);
 assert.equal(next.modeByWork[b],"elapsed_days");
 assert.equal(r.state.projects[0].calendarDrafts[0].version,1);
});

test("calendar drafts are project-local; never leak across unrelated projects",()=>{
 const {s,pid}=setup(),nextProject=createProject(s,{name:"Another project"});
 const r=upsertCalendarDraft(nextProject.state,pid,example());
 assert.equal(r.state.projects[0].calendarDrafts.length,1);
 assert.equal("calendarDrafts" in r.state.projects[1],false);
 assert.deepEqual(deserialize(serialize(r.state)),r.state);
});

test("duplicate names and unknown edits are rejected without changing the snapshot",()=>{
 const {s,pid}=setup();
 let r=upsertCalendarDraft(s,pid,example());
 const old=serialize(r.state);
 assert.throws(()=>upsertCalendarDraft(r.state,pid,{...example(),name:"рабочие И НЕПРЕРЫВНЫЕ"}),/Duplicate calendar draft name/);
 assert.throws(()=>upsertCalendarDraft(r.state,pid,example({id:"missing"})),/Unknown project calendar draft/);
 assert.throws(()=>removeCalendarDraft(r.state,pid,"missing"),/Unknown project calendar draft/);
 assert.equal(serialize(r.state),old);
 r=upsertCalendarDraft(r.state,pid,{...example(),name:"Other",weekdays:[1,2,3,4,5,6]});
 assert.equal(r.state.projects[0].calendarDrafts.length,2);
});

test("date rules, weekday duplicates, modes and work links are validated",()=>{
 const {s,pid}=setup();
 const invalid=[
  {...example(),weekdays:[]},
  {...example(),weekdays:[1,1]},
  {...example(),weekdays:[0,7]},
  {...example(),excludedDates:["2026-02-30"]},
  {...example(),excludedDates:["2026-11-23","2026-11-23"]},
  {...example(),additionalWorkingDates:["2026-11-23"]},
  {...example(),additionalWorkingDates:["2026-02-29"]},
  {...example(),modeByWork:{missing:"elapsed_days"}},
  {...example(),modeByWork:{[s.projects[0].items[0].id]:"hours"}},
  {...example(),modeByWork:[]},
  {...example(),name:"  "},
  {...example(),name:"a".repeat(121)}
 ];
 for(const item of invalid)assert.throws(()=>upsertCalendarDraft(s,pid,item),/Invalid|Conflicting/);
 assert.equal("calendarDrafts" in s.projects[0],false);
});

test("invalid imported scenario draft never reaches Store",()=>{
 const {s,pid}=setup();
 const r=upsertCalendarDraft(s,pid,example());
 for(const breakIt of [
  d=>{d.weekdays=[0,0];},d=>{d.excludedDates=["tomorrow"];},
  d=>{d.modeByWork={missing:"invalid_mode"};},
  d=>{d.version=-1;},d=>{d.id="";},d=>{d.name="   ";}
 ]){
  const clone=structuredClone(r.state);breakIt(clone.projects[0].calendarDrafts[0]);
  assert.throws(()=>deserialize(JSON.stringify(clone)),/Invalid/);
 }
});

test("old Atlas 0.8 may leave orphan references: import preserves evidence and requires explicit repair",async()=>{
 const {s,pid,a,b}=setup();
 const stored=upsertCalendarDraft(s,pid,example({modeByWork:{
  [a]:"working_days",[b]:"elapsed_days"
 }}));
 const legacy=structuredClone(stored.state);
 legacy.projects[0].items=legacy.projects[0].items.filter(w=>w.id!==b);
 legacy.revision++; // historical Atlas 0.8 work deletion preserved unknown fields
 const before=JSON.stringify(legacy);
 const imported=deserialize(JSON.stringify(legacy));
 const {missingCalendarDraftWorkIds,resolveCalendarDraftMissingWorkRefs}=
  await import("../src/core.mjs");
 assert.equal(serialize(imported),serialize(legacy));
 assert.equal(JSON.stringify(legacy),before);
 assert.deepEqual(missingCalendarDraftWorkIds(imported.projects[0],stored.id),[b]);
 assert.throws(()=>upsertCalendarDraft(imported,pid,{...example({id:stored.id})}),
  /Сначала подтвердите очистку ссылок/);
 const fixed=resolveCalendarDraftMissingWorkRefs(imported,pid,stored.id);
 assert.deepEqual(fixed.removed,[b]);
 assert.equal(fixed.state.revision,imported.revision+1);
 assert.equal(fixed.state.projects[0].calendarDrafts[0].version,2);
 assert.deepEqual(fixed.state.projects[0].calendarDrafts[0].modeByWork,{[a]:"working_days"});
 assert.deepEqual(missingCalendarDraftWorkIds(fixed.state.projects[0],stored.id),[]);
 assert.equal(serialize(imported),serialize(legacy));
 assert.deepEqual(deserialize(serialize(fixed.state)),fixed.state);
 const repeat=resolveCalendarDraftMissingWorkRefs(fixed.state,pid,stored.id);
 assert.equal(repeat.state,fixed.state);
 assert.deepEqual(repeat.removed,[]);
});

test("remove work also retires its named calendar override, not the unrelated entries",()=>{
 const {s,pid,a,b}=setup();
 const saved=upsertCalendarDraft(s,pid,example({modeByWork:{
  [a]:"working_days",[b]:"elapsed_days"
 }}));
 const removed=removeItem(saved.state,pid,b);
 assert.deepEqual(Object.keys(removed.projects[0].calendarDrafts[0].modeByWork),[a]);
 assert.equal(removed.projects[0].items.some(item=>item.id===b),false);
 assert.equal(validate(removed),true);
 assert.equal(saved.state.projects[0].items.length,2);
});

test("deleting a named draft preserves works, revisions and former snapshots",()=>{
 const {s,pid}=setup();
 const stored=upsertCalendarDraft(s,pid,example());
 const old=serialize(stored.state);
 const removed=removeCalendarDraft(stored.state,pid,stored.id);
 assert.deepEqual(removed.projects[0].calendarDrafts,[]);
 assert.equal(removed.projects[0].items.length,2);
 assert.equal(serialize(stored.state),old);
 assert.deepEqual(deserialize(serialize(removed)),removed);
});

test("cap at 12 named project scenarios; preserve large 5000-work project",()=>{
 const {s,pid}=setup();
 let t=s;
 for(let i=0;i<12;i++){
  t=upsertCalendarDraft(t,pid,{...example(),name:"Scenario "+i}).state;
 }
 assert.equal(t.projects[0].calendarDrafts.length,12);
 assert.throws(()=>upsertCalendarDraft(t,pid,{...example(),name:"Over cap"}),/limit/);
 let many=createProject(empty(),{name:"Large portfolio"});
 const p=many.state.projects[0];
 p.items=Array.from({length:5000},(_,i)=>({
  id:"work-"+i,title:"Work "+i,state:"todo",priority:"normal",
  estimateDays:1
 }));
 const full=upsertCalendarDraft(many.state,many.id,{
  ...example(),modeByWork:{["work-4999"]:"elapsed_days"}
 });
 assert.equal(validate(full.state),true);
 assert.equal(deserialize(serialize(full.state)).projects[0].calendarDrafts[0]
  .modeByWork["work-4999"],"elapsed_days");
});

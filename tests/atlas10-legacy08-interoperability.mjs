// Intentionally NOT *.test.mjs: run only after checkout of the pinned,
// independently published Atlas 0.8.0 code in manual-check.yml.
import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import * as current from "../src/core.mjs";
import * as legacy from "../legacy-atlas08/src/core.mjs";
import {buildIwxaPortfolio,readIwxaPortfolio} from "../desktop/src/iwxa-portfolio.mjs";
const {unzipSync,strFromU8}=createRequire(new URL("../desktop/package.json",import.meta.url))("fflate");

function scenario(){
 const p=current.createProject(current.empty(),{name:"Historical 0.8 read/write",type:"engineering"});
 const first=current.createItem(p.state,p.id,{title:"Assembly"});
 const second=current.createItem(first.state,p.id,{title:"Curing"});
 const saved=current.upsertCalendarDraft(second.state,p.id,{
  name:"Working days and continuous operations",
  weekdays:[1,2,3,4,5],excludedDates:["2026-11-23"],
  additionalWorkingDates:["2026-11-28"],
  modeByWork:{[first.id]:"working_days",[second.id]:"elapsed_days"}
 });
 return {id:p.id,first:first.id,second:second.id,saved};
}

test("actual release/0.8 imports an Atlas10 optional calendar and preserves it across a normal work edit",()=>{
 const x=scenario();
 const old=legacy.deserialize(current.serialize(x.saved.state));
 assert.equal(old.schema,"atlas.project/1");
 assert.deepEqual(old.projects[0].calendarDrafts,x.saved.state.projects[0].calendarDrafts);
 const edited=legacy.editItem(old,x.id,x.first,{title:"Assembly edited by 0.8",estimateDays:2});
 assert.deepEqual(edited.projects[0].calendarDrafts,old.projects[0].calendarDrafts);
 const newReader=current.deserialize(legacy.serialize(edited));
 assert.equal(newReader.projects[0].items[0].estimateDays,2);
 assert.equal(newReader.projects[0].calendarDrafts[0].version,1);
 assert.deepEqual(current.missingCalendarDraftWorkIds(newReader.projects[0],x.saved.id),[]);
});

test("actual 0.8 Work removal retains opaque calendar history; newest Atlas opens instead of blocking entire portfolio",()=>{
 const x=scenario();
 const old=legacy.deserialize(current.serialize(x.saved.state));
 const deleted=legacy.removeItem(old,x.id,x.second);
 const again=current.deserialize(legacy.serialize(deleted));
 assert.equal(again.projects[0].items.length,1);
 assert.equal(again.projects[0].calendarDrafts[0].modeByWork[x.second],"elapsed_days",
  "Historic link must not be silently dropped");
 assert.deepEqual(current.missingCalendarDraftWorkIds(again.projects[0],x.saved.id),[x.second]);
 assert.throws(()=>current.upsertCalendarDraft(again,x.id,{
  ...again.projects[0].calendarDrafts[0]
 }),/Сначала подтвердите очистку ссылок/);
 const repaired=current.resolveCalendarDraftMissingWorkRefs(again,x.id,x.saved.id);
 assert.deepEqual(repaired.removed,[x.second]);
 assert.equal(repaired.state.projects[0].calendarDrafts[0].version,2);
 assert.equal(repaired.state.projects[0].items[0].id,x.first);
 assert.deepEqual(current.deserialize(current.serialize(repaired.state)),repaired.state);
 assert.equal(again.projects[0].calendarDrafts[0].modeByWork[x.second],"elapsed_days");
});

test("0.8 independently reads original Atlas 1.0 ZIP payload with calendar, and Atlas10 roundtrips it again",async()=>{
 const x=scenario();
 const zip=await buildIwxaPortfolio(x.saved.state,{now:"2026-11-22T11:00:00.000Z"});
 const files=unzipSync(zip);
 const obj=JSON.parse(strFromU8(files["content/objects.ndjson"]).trim());
 const legacyRead=legacy.deserialize(JSON.stringify(obj.data.snapshot));
 assert.equal(legacyRead.projects[0].calendarDrafts[0].id,x.saved.id);
 const edited=legacy.editItem(legacyRead,x.id,x.first,{title:"Still safe"});
 const exported=await buildIwxaPortfolio(current.deserialize(legacy.serialize(edited)),{
  now:"2026-11-22T11:01:00.000Z"
 });
 const imported=await readIwxaPortfolio(exported);
 assert.equal(imported.snapshot.projects[0].items[0].title,"Still safe");
 assert.equal(imported.snapshot.projects[0].calendarDrafts[0].modeByWork[x.second],
  "elapsed_days");
 assert.equal(imported.manifest.format,"iwxa.package");
});

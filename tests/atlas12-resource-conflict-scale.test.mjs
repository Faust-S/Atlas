import test from "node:test";
import assert from "node:assert/strict";
import {editItem,serialize} from "../src/core.mjs";
import {addPlanningResource} from "../src/resource-planning.mjs";
import {compareResourceConflictResolution,createResourceConflictProposals} from "../src/resource-conflict-resolution.mjs";
import {desktopLoadPortfolio} from "./fixtures/desktop-portfolio-120.mjs";
test("Unified decision route on the 120-project portfolio preserves one full base for all methods",()=>{
 const original=desktopLoadPortfolio(),r=addPlanningResource(original,{label:"Общий участок",capacityPct:100}),
  free=addPlanningResource(r.state,{label:"Резервный участок",capacityPct:100});
 let s=free.state,refs=[];
 for(const p of s.projects.slice(50,52)){
  const w=p.items[5],long=p.items[9];
  s=editItem(s,p.id,long.id,{estimateDays:10});
  s=editItem(s,p.id,w.id,{estimateDays:2,resourceId:r.id,allocationPct:60});
  refs.push({projectId:p.id,workId:w.id});
 }
 const raw=serialize(s),clock=performance.now();
 const comparison=compareResourceConflictResolution(s,r.id,{focus:refs[0],companion:refs[1],
  targetResourceIds:[free.id],workDelayDays:3,projectDelayDays:3,allowSequence:true});
 const ms=performance.now()-clock;
 const options=comparison.options.filter(o=>o.valid);
 assert.ok(options.some(o=>o.kind==="assignment"&&o.source.after.overloadDays===0));
 assert.ok(options.some(o=>o.kind==="work_shift"&&o.source.after.overloadDays===0));
 assert.ok(options.some(o=>o.kind==="project_shift"&&o.source.after.overloadDays===0));
 assert.ok(options.every(o=>o.preview.rows.length===120&&o.focus.length===2));
 assert.ok(options.every(o=>JSON.stringify(o.preview.resourceBefore)===JSON.stringify(comparison.baseline.portfolio)));
 assert.equal(serialize(s),raw);
 const beforeDraft=performance.now();
 const draft=createResourceConflictProposals(s,comparison,"assignment",{rationale:"Подтверждено допустимое назначение участка."});
 assert.equal(draft.refs.length,1);assert.equal(serialize(s),raw);
 console.log("ATLAS12_CONFLICT_RESOLUTION_SCALE projects=120 works=1200 options="+options.length+
  " compare_ms="+ms.toFixed(2)+" selected_draft_ms="+(performance.now()-beforeDraft).toFixed(2));
});

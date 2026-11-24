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
  targetResourceIds:[free.id],companionTargetResourceIds:[free.id],workDelayDays:3,projectDelayDays:3,allowSequence:true});
 const ms=performance.now()-clock;
 const options=comparison.options.filter(o=>o.valid);
 assert.ok(options.some(o=>o.kind==="assignment"&&o.source.after.overloadDays===0));
 assert.ok(options.some(o=>o.id==="companion-assignment"&&o.changes.projectId===refs[1].projectId&&o.changes.workId===refs[1].workId&&o.source.after.overloadDays===0));
 assert.ok(options.some(o=>o.kind==="work_shift"&&o.source.after.overloadDays===0));
 assert.ok(options.some(o=>o.kind==="project_shift"&&o.source.after.overloadDays===0));
 assert.ok(options.every(o=>o.preview.rows.length===120&&o.focus.length===2));
 assert.ok(options.every(o=>JSON.stringify(o.preview.resourceBefore)===JSON.stringify(comparison.baseline.portfolio)));
 assert.equal(serialize(s),raw);
 const beforeDraft=performance.now();
 const draft=createResourceConflictProposals(s,comparison,"companion-assignment",{rationale:"Подтверждено допустимое назначение участка."});
 assert.equal(draft.refs.length,1);assert.equal(draft.refs[0].projectId,refs[1].projectId);assert.equal(serialize(s),raw);
 console.log("ATLAS12_CONFLICT_RESOLUTION_SCALE projects=120 works=1200 options="+options.length+
  " compare_ms="+ms.toFixed(2)+" selected_draft_ms="+(performance.now()-beforeDraft).toFixed(2));
});

test("Unified four-Work route retains cross-project focus and bounded search on the whole portfolio",()=>{
 const original=desktopLoadPortfolio(),r=addPlanningResource(original,{label:"Четыре монтажных заказа",capacityPct:100});
 let s=r.state,refs=[];
 for(const p of s.projects.slice(50,54)){
  const w=p.items[5],long=p.items[9];
  s=editItem(s,p.id,long.id,{estimateDays:10});
  s=editItem(s,p.id,w.id,{estimateDays:2,resourceId:r.id,allocationPct:60});
  refs.push({projectId:p.id,workId:w.id});
 }
 const raw=serialize(s),clock=performance.now();
 const c=compareResourceConflictResolution(s,r.id,{focus:refs[0],companion:refs[1],additionalWorks:refs.slice(2),
  targetResourceIds:[],workDelayDays:7,projectDelayDays:0,allowSequence:false});
 const best=c.options.find(o=>o.id==="work-shift-capacity");
 assert.ok(best?.canDraft);assert.equal(best.source.after.overloadDays,0);
 assert.equal(best.preview.rows.length,120);assert.equal(best.preview.changed,0);
 assert.deepEqual(best.focus.map(w=>({projectId:w.projectId,workId:w.workId})),refs);
 assert.ok(best.focus.every(w=>w.after.known&&w.after.overloadDays===0));
 assert.equal(best.changes.search.exact,false);assert.ok(best.changes.search.evaluated<256);
 const ms=performance.now()-clock;
 const d=createResourceConflictProposals(s,c,best.id,{rationale:"Подтверждены допустимые переносы четырёх заказов."});
 assert.equal(d.refs.length,3);assert.ok(d.refs.every(r=>refs.slice(1).some(w=>w.projectId===r.projectId)));
 assert.equal(serialize(s),raw);
 console.log("ATLAS12_CONFLICT_FOUR_SCALE projects=120 works=1200 participants=4 combinations="+best.changes.search.evaluated+" compare_ms="+ms.toFixed(2));
});


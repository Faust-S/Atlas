import test from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./fixtures/atlas12-resource-conflict-resolution.mjs";
import {portfolioResources,resourceConflictPeriods,resourceWorkConflicts} from "../src/portfolio-resources.mjs";
import {serialize} from "../src/core.mjs";
test("Exact focal Work intervals retain all competing Works, load and whole-resource totals",()=>{
 const f=fixture(),raw=serialize(f.snapshot),group=portfolioResources(f.snapshot).byId.get(f.resourceId);
 const focus={projectId:f.projectId,workId:f.b};
 const unfiltered=resourceConflictPeriods(group),view=resourceConflictPeriods(group,{focus,workLimit:1});
 assert.equal(view.periodCount,1);
 assert.equal(view.overloadDays,unfiltered.overloadDays);
 assert.equal(view.unavailableDays,unfiltered.unavailableDays);
 assert.deepEqual(view.focusConflict,{known:true,...resourceWorkConflicts(group,f.projectId).get(f.b)});
 assert.equal(view.period.loadPct,120);assert.equal(view.period.capacityPct,100);
 assert.equal(view.period.startDate,"2026-11-23");assert.equal(view.period.endDate,"2026-11-24");
 assert.equal(view.period.workCount,2);assert.equal(view.period.works.length,1);
 const next=resourceConflictPeriods(group,{focus,workLimit:1,workOffset:1});
 assert.deepEqual(new Set([...view.period.works,...next.period.works].map(w=>w.workId)),new Set([f.a,f.b]));
 assert.throws(()=>resourceConflictPeriods(group,{focus:{projectId:f.otherProject,workId:f.b}}),/не относится к ресурсу/);
 assert.equal(serialize(f.snapshot),raw);
});
const work=(projectId,id,startDay,activeRanges,allocationPct=60)=>({projectId,id,projectName:projectId,title:id,startDay,activeRanges,allocationPct});
test("Filtered intervals use project-scoped identity, omit gaps and preserve availability precedence",()=>{
 const group={id:"r",label:"Unit",capacityPct:100,availableFrom:"2026-11-25",availableUntil:null,
  work:[work("P1","same",20780,[[20780,20781],[20784,20785]]),
   work("P2","same",20780,[[20780,20785]]),work("P3","extra",20781,[[20781,20784]])]};
 // Use known civil dates to make interval assertions independent of hardcoded epoch guesses.
 const d=Date.parse("2026-11-23")/86400000;
 group.work[0].startDay=d;group.work[0].activeRanges=[[d,d+1],[d+4,d+5]];
 group.work[1].startDay=d;group.work[1].activeRanges=[[d,d+5]];
 group.work[2].startDay=d+1;group.work[2].activeRanges=[[d+1,d+4]];
 const focus={projectId:"P1",workId:"same"},first=resourceConflictPeriods(group,{focus});
 const second=resourceConflictPeriods(group,{focus,offset:1});
 assert.equal(first.periodCount,2);
 assert.deepEqual(first.focusConflict,{known:true,overloadDays:1,unavailableDays:1});
 assert.equal(first.period.kind,"availability");
 assert.equal(first.period.startDate,"2026-11-23");
 assert.equal(second.period.kind,"overload");
 assert.equal(second.period.startDate,"2026-11-27");
 assert.equal(second.period.endDate,"2026-11-27");
 assert.equal(resourceConflictPeriods(group,{focus,offset:2}).period,null);
 assert.equal(resourceConflictPeriods(group,{focus:{projectId:"P2",workId:"same"}}).periodCount,4);
});
test("No known dates are not reported as a zero-conflict assignment",()=>{
 const group={id:"r",label:"Unit",capacityPct:100,availableFrom:null,availableUntil:null,
  work:[work("P","unknown",null,[]),work("P","zero",10,[])]};
 assert.deepEqual(resourceConflictPeriods(group,{focus:{projectId:"P",workId:"unknown"}}).focusConflict,
  {known:false,overloadDays:null,unavailableDays:null});
 assert.deepEqual(resourceConflictPeriods(group,{focus:{projectId:"P",workId:"zero"}}).focusConflict,
  {known:true,overloadDays:0,unavailableDays:0});
});

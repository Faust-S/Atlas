import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editItem,serialize} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {portfolioSchedule,portfolioScheduleChangeSummary} from "../src/portfolio-schedule.mjs";
import {startWorkCorrection,beginCrossProjectWorkReturn,advanceCrossProjectWorkReturn} from "../src/work-correction-flow.mjs";
import {atlas10ShiftedPortfolio} from "./fixtures/atlas10-portfolio-forecast.mjs";
import {inspectorRecentCorrection} from "../desktop/src/inspector-work-context.mjs";

function caseWithChangedSource(){
 const f=atlas10ShiftedPortfolio(),snapshot=f.snapshot;
 const upstream=snapshot.projects.find(p=>p.id!==f.projectId);
 const sourceId=upstream.items[0].id;
 const before=portfolioSchedule(snapshot);
 const changed=editItem(snapshot,upstream.id,sourceId,{estimateDays:3});
 const source=changed.projects.find(p=>p.id===upstream.id);
 const correction=startWorkCorrection({projectId:upstream.id,workId:sourceId,
  revision:changed.revision,
  beforePlan:scheduleProject(upstream,{calendarLibrary:snapshot.calendarLibrary??[]}),
  afterPlan:scheduleProject(source,{calendarLibrary:changed.calendarLibrary??[]}),
  beforePortfolio:before,afterPortfolio:portfolioSchedule(changed)});
 return {snapshot,changed,upstream,source,sourceId,downstreamId:f.projectId,correction,before};
}

test("linked project opens a route back to exact source Work and original plan",()=>{
 const c=caseWithChangedSource(),original=serialize(c.changed);
 const route=beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,sourceTab:"timeline",linkedProjectId:c.downstreamId});
 assert.ok(route);
 assert.equal(route.sourceProjectId,c.upstream.id);
 assert.equal(route.sourceWorkId,c.sourceId);
 assert.equal(route.revision,c.changed.revision);
 assert.equal(route.sourceTab,"timeline");
 const another=beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,sourceTab:"overview",linkedProjectId:c.downstreamId});
 assert.equal(another.sourceTab,"overview","Return restores the source screen");
 assert.equal(route.correction,c.correction);
 assert.equal(serialize(c.changed),original);
});

test("linked Work correction accumulates portfolio effects from first source baseline",()=>{
 const c=caseWithChangedSource();
 const origin=serialize(c.changed);
 const route=beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,linkedProjectId:c.downstreamId,sourceTab:"work"});
 const downstream=c.changed.projects.find(p=>p.id===c.downstreamId);
 const linkedWorkId=downstream.items[0].id;
 const amended=editItem(c.changed,c.downstreamId,linkedWorkId,{estimateDays:3});
 const advanced=advanceCrossProjectWorkReturn(route,{
  beforeSnapshot:c.changed,afterSnapshot:amended,editedProjectId:c.downstreamId,
  editedWorkId:linkedWorkId});
 assert.equal(advanced.sourceTab,"work");
 assert.equal(advanced.revision,amended.revision);
 assert.equal(advanced.sourceWorkId,c.sourceId);
 assert.equal(advanced.correction.linkedFollowups.length,1);
 assert.equal(advanced.correction.linkedFollowups[0].workId,linkedWorkId);
 assert.deepEqual(advanced.correction.portfolioChange,
  portfolioScheduleChangeSummary(c.before,portfolioSchedule(amended),c.upstream.id));
 const viewed=inspectorRecentCorrection(c.source,amended.revision,c.sourceId,
  advanced.correction,scheduleProject(c.source,{calendarLibrary:amended.calendarLibrary??[]}));
 assert.ok(viewed);
 assert.equal(viewed.portfolioChange.source.previousFinish,c.before.byId.get(c.upstream.id).projectedFinish);
 assert.equal(inspectorRecentCorrection(c.source,c.changed.revision,c.sourceId,
  advanced.correction,scheduleProject(c.source,{calendarLibrary:amended.calendarLibrary??[]})),null);
 assert.equal(serialize(c.changed),origin,"Navigation must not edit original data");
 assert.deepEqual(c.correction.linkedFollowups,undefined,"Initial correction stays unchanged");
});

test("unrelated or stale revisions never revive the old portfolio forecast",()=>{
 const c=caseWithChangedSource();
 const route=beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,linkedProjectId:c.downstreamId});
 assert.equal(beginCrossProjectWorkReturn(c.changed,{...c.correction,revision:-1},{
  sourceWorkId:c.sourceId,linkedProjectId:c.downstreamId}),null);
 assert.equal(beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:"unknown",linkedProjectId:c.downstreamId}),null);
 assert.equal(beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,linkedProjectId:c.upstream.id}),null);
 const different=editItem(c.changed,c.upstream.id,c.sourceId,{estimateDays:5});
 assert.equal(advanceCrossProjectWorkReturn(route,{
  beforeSnapshot:c.changed,afterSnapshot:different,
  editedProjectId:c.upstream.id,editedWorkId:c.sourceId}),route);
 assert.equal(advanceCrossProjectWorkReturn(route,{
  beforeSnapshot:different,afterSnapshot:different,
  editedProjectId:c.downstreamId,editedWorkId:"missing"}),route);
});

test("state-only downstream Work edits advance the revision without a fake correction",()=>{
 const c=caseWithChangedSource(),route=beginCrossProjectWorkReturn(c.changed,c.correction,{
  sourceWorkId:c.sourceId,linkedProjectId:c.downstreamId});
 const item=c.changed.projects.find(p=>p.id===c.downstreamId).items[0];
 const updated=editItem(c.changed,c.downstreamId,item.id,{assignee:"Production team"});
 const next=advanceCrossProjectWorkReturn(route,{
  beforeSnapshot:c.changed,afterSnapshot:updated,editedProjectId:c.downstreamId,
  editedWorkId:item.id,recordCorrection:false});
 assert.equal(next.revision,updated.revision);
 assert.deepEqual(next.correction.linkedFollowups,[]);
 assert.equal(next.correction.portfolioChange.affectedTotal,route.correction.portfolioChange.affectedTotal);
});

test("compact dock provides a return route after visiting the downstream Gantt",()=>{
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const preview=readFileSync(new URL("../desktop/src/AtlasInspectorPreview.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(main,/const openInspectorLinkedProject=\(linkedProjectId:string,sourceWorkId:string\)/);
 assert.match(main,/setCrossProjectReturn\(route\)/);
 assert.match(main,/setRecentPlanBefore\(current\?route\.correction:null\)/);
 assert.match(main,/setPreviewWorkRequest\(previous=>\(\{id:route\.sourceWorkId/);
 assert.match(main,/advanceCrossProjectWorkReturn\(crossProjectReturn/);
 assert.match(main,/onOpenLinkedProject=\{openInspectorLinkedProject\}/);
 assert.match(main,/onReturnToSource=\{returnToCrossProjectWork\}/);
 assert.match(preview,/aria-label=\{"Вернуться к исходной работе "\+returnContext\.workTitle\}/);
 assert.match(preview,/onClick=\{onReturnToSource\}/);
 assert.match(preview,/onOpenLinkedProject\(linked\.id,shown\.id\)/);
 assert.match(css,/\.atlas-v6-cross-project-return-action:focus-visible/);
});

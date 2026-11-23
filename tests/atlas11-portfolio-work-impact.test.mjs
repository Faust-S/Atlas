import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editItem,editProject,createProject,createItem,serialize} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {scheduleProject} from "../src/planning.mjs";
import {portfolioSchedule,portfolioScheduleChangeSummary} from "../src/portfolio-schedule.mjs";
import {startWorkCorrection,continueWorkCorrection} from "../src/work-correction-flow.mjs";
import {atlas10ShiftedPortfolio} from "./fixtures/atlas10-portfolio-forecast.mjs";
import {inspectorRecentCorrection} from "../desktop/src/inspector-work-context.mjs";

const fixture=()=>{
 const f=atlas10ShiftedPortfolio();
 const upstream=f.snapshot.projects.find(p=>p.id!==f.projectId);
 const item=upstream.items[0];
 return {...f,upstream,upstreamWorkId:item.id};
};
const revise=(state,projectId,workId,days)=>
 editItem(state,projectId,workId,{estimateDays:days});

test("Atlas Work correction shifts an actual dependent working-calendar project",()=>{
 const f=fixture(),original=serialize(f.snapshot);
 const before=portfolioSchedule(f.snapshot);
 const afterSnapshot=revise(f.snapshot,f.upstream.id,f.upstreamWorkId,3);
 const after=portfolioSchedule(afterSnapshot);
 const diff=portfolioScheduleChangeSummary(before,after,f.upstream.id);
 const shifted=diff.rows.find(row=>row.id===f.projectId);
 assert.equal(diff.linkedTotal,1);
 assert.equal(diff.affectedTotal,1);
 assert.ok(shifted,"The downstream project must be visible");
 assert.equal(shifted.previousStart,"2026-11-20");
 assert.equal(shifted.projectedStart,"2026-11-21");
 assert.equal(shifted.previousFinish,"2026-11-24");
 assert.equal(shifted.projectedFinish,"2026-11-25");
 assert.equal(shifted.startShiftDays,1);
 assert.equal(shifted.finishShiftDays,1);
 assert.equal(diff.laterTotal,1);
 assert.equal(diff.earlierTotal,0);
 assert.equal(diff.source.finishShiftDays,1);
 assert.equal(serialize(f.snapshot),original,"Pure projections cannot change original data");
});

test("Late planned start can absorb an upstream Work delay without claiming a downstream slip",()=>{
 const f=fixture();
 const delayed=editProject(f.snapshot,f.projectId,{startDate:"2026-12-15"});
 const before=portfolioSchedule(delayed);
 const next=revise(delayed,f.upstream.id,f.upstreamWorkId,3);
 const diff=portfolioScheduleChangeSummary(before,portfolioSchedule(next),f.upstream.id);
 assert.equal(diff.linkedTotal,1);
 assert.equal(diff.affectedTotal,0);
 assert.deepEqual(diff.rows,[]);
 assert.equal(diff.source.finishShiftDays,1);
});

test("Diamond portfolio graphs count each changed project only once and exclude unrelated work",()=>{
 const f=fixture();
 let state=f.snapshot;
 const branch=createProject(state,{name:"Параллельная линия",type:"engineering"});
 state=editProject(branch.state,branch.id,{startDate:"2026-11-18"});
 const bWork=createItem(state,branch.id,{title:"Параллельная поставка"});
 state=editItem(bWork.state,branch.id,bWork.id,{estimateDays:1});
 const sink=createProject(state,{name:"Общая приёмка",type:"engineering"});
 state=editProject(sink.state,sink.id,{startDate:"2026-11-18"});
 const sinkWork=createItem(state,sink.id,{title:"Контроль монтажа"});
 state=editItem(sinkWork.state,sink.id,sinkWork.id,{estimateDays:1});
 state=addPortfolioLink(state,{from:f.upstream.id,to:branch.id});
 state=addPortfolioLink(state,{from:f.projectId,to:sink.id});
 state=addPortfolioLink(state,{from:branch.id,to:sink.id});
 const independent=createProject(state,{name:"Независимый проект",type:"engineering"});
 state=editProject(independent.state,independent.id,{startDate:"2026-11-18"});
 const independentWork=createItem(state,independent.id,{title:"Собственный цикл"});
 state=editItem(independentWork.state,independent.id,independentWork.id,{estimateDays:1});
 const before=portfolioSchedule(state);
 const after=portfolioSchedule(revise(state,f.upstream.id,f.upstreamWorkId,3));
 const diff=portfolioScheduleChangeSummary(before,after,f.upstream.id);
 assert.equal(diff.linkedTotal,3);
 assert.equal(new Set(diff.rows.map(r=>r.id)).size,diff.rows.length);
 assert.ok(diff.rows.some(r=>r.id===sink.id));
 assert.ok(diff.rows.some(r=>r.id===f.projectId));
 assert.equal(diff.rows.some(r=>r.id===independent.id),false);
});

test("Loss of an authoritative date is recorded as unknown, never as an early finish",()=>{
 const f=fixture(),before=portfolioSchedule(f.snapshot);
 const paused=editProject(f.snapshot,f.upstream.id,{status:"paused"});
 const after=portfolioSchedule(paused);
 const diff=portfolioScheduleChangeSummary(before,after,f.upstream.id);
 const row=diff.rows.find(r=>r.id===f.projectId);
 assert.ok(row);
 assert.equal(row.previousFinish,"2026-11-24");
 assert.equal(row.projectedFinish,null);
 assert.equal(row.finishShiftDays,null);
 assert.equal(row.newlyUndated,true);
 assert.equal(diff.undatedTotal,1);
 assert.equal(diff.earlierTotal,0);
 assert.equal(diff.resolvedDeadlineRisks,0);
});

test("Multiple Work edits retain the original portfolio baseline across revisions",()=>{
 const f=fixture(),before=portfolioSchedule(f.snapshot),
  local=scheduleProject(f.upstream,{calendarLibrary:f.snapshot.calendarLibrary??[]});
 const firstState=revise(f.snapshot,f.upstream.id,f.upstreamWorkId,3);
 const firstProject=firstState.projects.find(p=>p.id===f.upstream.id);
 const first=startWorkCorrection({
  projectId:f.upstream.id,workId:f.upstreamWorkId,revision:firstState.revision,
  beforePlan:local,afterPlan:scheduleProject(firstProject,{
   calendarLibrary:firstState.calendarLibrary??[]}),
  beforePortfolio:before,afterPortfolio:portfolioSchedule(firstState)
 });
 assert.equal(first.portfolioChange.affectedTotal,1);
 const secondState=revise(firstState,f.upstream.id,f.upstreamWorkId,4);
 const second=continueWorkCorrection(first,{
  projectId:f.upstream.id,workId:f.upstreamWorkId,
  revision:firstState.revision,nextRevision:secondState.revision,
  afterPlan:scheduleProject(secondState.projects.find(p=>p.id===f.upstream.id),{
   calendarLibrary:secondState.calendarLibrary??[]}),
  afterPortfolio:portfolioSchedule(secondState)
 });
 assert.ok(second);
 assert.equal(second.portfolioBaseline,before);
 assert.equal(second.followups.length,1);
 assert.deepEqual(second.portfolioChange,
  portfolioScheduleChangeSummary(before,portfolioSchedule(secondState),f.upstream.id));
 const view=inspectorRecentCorrection(secondState.projects.find(p=>p.id===f.upstream.id),
  secondState.revision,f.upstreamWorkId,second,second.baseline);
 assert.deepEqual(view.portfolioChange,second.portfolioChange);
 assert.equal(inspectorRecentCorrection(secondState.projects.find(p=>p.id===f.upstream.id),
  firstState.revision,f.upstreamWorkId,second,second.baseline),null,
  "A changed revision must never display a stale comparison");
});

test("Inspector provides compact, keyboard-addressable cross-project routes",()=>{
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const preview=readFileSync(new URL("../desktop/src/AtlasInspectorPreview.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(main,/beforePortfolio:dates,afterPortfolio:updatedPortfolio/);
 assert.match(main,/beforePortfolio:dates,afterPortfolio:portfolioSchedule\(next\)/);
 assert.match(main,/onOpenLinkedProject=\{id=>openProjectTab\(id,"timeline"\)\}/);
 assert.match(preview,/aria-label="Последствия изменения работы для портфеля"/);
 assert.match(preview,/role="status">\{"Зависимых проектов: "\+portfolio\.linkedTotal/);
 assert.ok(preview.indexOf("Влияние на связанные проекты")<
  preview.indexOf("Последовательных правок:"),
  "Portfolio impact and its project link must precede the local correction details");
 assert.match(preview,/aria-label=\{"Открыть зависимый проект "\+linked\.name\}/);
 assert.match(preview,/onClick=\{\(\)=>onOpenLinkedProject\(linked\.id\)\}/);
 assert.match(preview,/inspectorPagedRows\(portfolio\?\.rows\?\?\[\],portfolioPage,2\)/);
 assert.match(css,/\.atlas-v6-portfolio-impact\{/);
 assert.doesNotMatch(preview,/portfolioSchedule\(|scheduleProject\(|editItem\(/);
});

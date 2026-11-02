import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,editProject,serialize,deserialize} from "../src/core.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {planChange,decideChange} from "../src/trace.mjs";
import {applyEditor} from "../src/editor.mjs";
import {portfolioSchedule,projectedFinishLabel,renderPortfolioSchedule,renderProjectSchedule} from "../src/portfolio-schedule.mjs";
const values=o=>({get:k=>o[k]??""});
test("approved scoped work changes upstream CPM and downstream due risk without changing declared plan",()=>{
 const a=createProject(empty(),{name:"API",type:"engineering"}),b=createProject(a.state,{name:"UI",type:"engineering"});
 let state=editProject(b.state,a.id,{startDate:"2026-11-01"});
 state=editProject(state,b.id,{startDate:"2026-11-02",dueDate:"2026-11-07"});
 const first=createItem(state,a.id,{title:"Core"});state=editItem(first.state,a.id,first.id,{estimateDays:2});
 const second=createItem(state,b.id,{title:"UI"});state=editItem(second.state,b.id,second.id,{estimateDays:3});
 state=addPortfolioLink(state,{from:a.id,to:b.id});
 let before=portfolioSchedule(state);
 assert.equal(before.byId.get(b.id).projectedFinish,"2026-11-06");
 const proposed=planChange(state,a.id,{title:"Extension",description:"New work"});
 const approved=decideChange(proposed.state,a.id,proposed.id,{status:"approved",rationale:"Owner approval"});
 state=applyEditor(approved.state,a.id,"work-change:"+proposed.id,values({title:"Deliver extension",estimateDays:"4"})).state;
 const after=portfolioSchedule(state);
 assert.equal(after.byId.get(a.id).projectedFinish,"2026-11-05");
 assert.equal(after.byId.get(b.id).projectedStart,"2026-11-05");
 assert.equal(after.byId.get(b.id).projectedFinish,"2026-11-08");
 assert.equal(after.byId.get(b.id).deadlineSlipDays,1);
 assert.equal(after.byId.get(b.id).shiftDays,3);
 assert.equal(state.projects.find(p=>p.id===b.id).startDate,"2026-11-02");
 assert.equal(after.byId.get(a.id).changedWork.length,1);
 assert.match(renderPortfolioSchedule(state),/Сроки и последствия изменений плана/);
 assert.match(renderProjectSchedule(state,b.id),/2026-11-08/);
 assert.deepEqual(deserialize(serialize(state)),state);
});
test("missing dates and unplanned approved changes remain explicitly unknown",()=>{
 const a=createProject(empty(),{name:"Unknown"}),b=createProject(a.state,{name:"Downstream"});
 let state=addPortfolioLink(b.state,{from:a.id,to:b.id});
 const value=portfolioSchedule(state);
 assert.equal(value.byId.get(a.id).projectedFinish,null);
 assert.equal(value.byId.get(b.id).projectedFinish,null);
 assert.equal(value.totals.unknown,2);
 assert.equal(value.totals.needsReview,2);
 const proposed=planChange(state,a.id,{title:"Change"});
 state=decideChange(proposed.state,a.id,proposed.id,{status:"approved",rationale:"Approved"}).state;
 assert.equal(portfolioSchedule(state).byId.get(a.id).unplannedChanges.length,1);
});
test("project planning dates edit together without silently overwriting due date",()=>{
 const a=createProject(empty(),{name:"Dates"});
 let state=applyEditor(a.state,a.id,"dates",values({startDate:"2026-11-03",dueDate:"2026-11-17"})).state;
 assert.equal(state.projects[0].startDate,"2026-11-03");
 assert.equal(state.projects[0].dueDate,"2026-11-17");
 assert.throws(()=>applyEditor(state,a.id,"dates",values({startDate:"2026-11-20",dueDate:"2026-11-17"})),/Invalid project dates/);
});

test("pause/cancellation removes projected deliveries and propagates blockers through three projects",()=>{
 const a=createProject(empty(),{name:"Core"}),b=createProject(a.state,{name:"Integration"}),c=createProject(b.state,{name:"Rollout"});
 let state=editProject(c.state,a.id,{startDate:"2026-11-01"});
 state=editProject(state,b.id,{startDate:"2026-11-02"});
 state=editProject(state,c.id,{startDate:"2026-11-03"});
 for(const id of [a.id,b.id,c.id]){
  const item=createItem(state,id,{title:"Deliver"});
  state=editItem(item.state,id,item.id,{estimateDays:2});
 }
 state=addPortfolioLink(state,{from:a.id,to:b.id});
 state=addPortfolioLink(state,{from:b.id,to:c.id});
 const baseline=serialize(state);
 assert.equal(portfolioSchedule(state).byId.get(c.id).projectedFinish,"2026-11-07");
 const paused=editProject(state,a.id,{status:"paused"});
 const suspended=portfolioSchedule(paused);
 for(const id of [a.id,b.id,c.id]){
  const row=suspended.byId.get(id);
  assert.equal(row.projectedStart,null);
  assert.equal(row.projectedFinish,null);
  assert.equal(row.needsReview,true);
  assert.deepEqual(row.unavailableOrigins.map(x=>x.id),[a.id]);
 }
 assert.equal(suspended.byId.get(a.id).plannedFinish,"2026-11-03");
 assert.match(projectedFinishLabel(suspended.byId.get(c.id)),/приостановлен/);
 assert.match(renderPortfolioSchedule(paused),/Поставка заблокирована состоянием предшественников/);
 assert.deepEqual(deserialize(serialize(paused)),paused);
 const cancelled=editProject(paused,a.id,{status:"cancelled"});
 const stopped=portfolioSchedule(cancelled);
 assert.match(projectedFinishLabel(stopped.byId.get(a.id)),/отменён/);
 assert.match(projectedFinishLabel(stopped.byId.get(c.id)),/отменённым/);
 assert.equal(stopped.totals.dated,0);
 assert.equal(stopped.totals.needsReview,3);
 const resumed=editProject(cancelled,a.id,{status:"active"});
 const restored=portfolioSchedule(resumed);
 assert.equal(restored.byId.get(c.id).projectedFinish,"2026-11-07");
 assert.deepEqual(restored.byId.get(c.id).unavailableOrigins,[]);
 assert.equal(serialize(state),baseline);
});
test("convergent dependencies preserve all paused and cancelled origins",()=>{
 const a=createProject(empty(),{name:"Paused root"}),b=createProject(a.state,{name:"Cancelled root"}),c=createProject(b.state,{name:"Dependent"});
 let s=editProject(c.state,a.id,{status:"paused",startDate:"2026-11-01"});
 s=editProject(s,b.id,{status:"cancelled",startDate:"2026-11-01"});
 s=editProject(s,c.id,{startDate:"2026-11-01"});
 for(const id of [a.id,b.id,c.id])s=createItem(s,id,{title:"Work"}).state;
 s=addPortfolioLink(s,{from:a.id,to:c.id});
 s=addPortfolioLink(s,{from:b.id,to:c.id});
 const row=portfolioSchedule(s).byId.get(c.id);
 assert.deepEqual(new Set(row.unavailableOrigins.map(x=>x.id)),new Set([a.id,b.id]));
 assert.equal(row.projectedFinish,null);
 assert.match(row.notes.join(" "),/отменён/);
 assert.match(row.notes.join(" "),/приостановлен/);
});

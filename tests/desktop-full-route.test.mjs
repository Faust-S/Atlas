import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,editProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding,decideChange} from "../src/trace.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {revisionReview,recheckAction} from "../src/revision-review.mjs";
import {planReviewQueue,planReviewAction,planProposalAction} from "../src/plan-review.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {setPlanWork,previewPlanAmendment,applyPlanAmendment} from "../src/plan-amendment.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";

const SHA_A="a".repeat(40),SHA_B="b".repeat(40);
const fields=values=>({get:key=>values[key]??""});

test("SHA recheck -> downstream decision -> proposal -> approval -> CPM -> persisted reopen",()=>{
 const first=createProject(empty(),{name:"Upstream delivery"});
 const second=createProject(first.state,{name:"Downstream launch"});
 let state=editProject(second.state,first.id,{startDate:"2026-11-01",dueDate:"2026-11-09"});
 state=editProject(state,second.id,{startDate:"2026-11-02",dueDate:"2026-11-15"});
 const rootWork=createItem(state,first.id,{title:"Build release"});
 state=editItem(rootWork.state,first.id,rootWork.id,{estimateDays:2});
 const childWork=createItem(state,second.id,{title:"Validate delivery"});
 state=editItem(childWork.state,second.id,childWork.id,{estimateDays:3});
 state=addPortfolioLink(state,{from:first.id,to:second.id});
 const target=addTarget(state,first.id,{title:"Readback",desired:"Stable restart result"});
 const source=attach(target.state,first.id,"github","example/upstream");
 state=observe(source.state,first.id,source.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_A},readiness:"not_assessed"
 });
 const prior=recordFinding(state,first.id,{targetId:target.id,result:"present",level:"test",
  sourceId:source.id,ref:"main",revision:SHA_A,note:"Earlier acceptance claim"});
 state=observe(prior.state,first.id,source.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_B},readiness:"not_assessed"
 });
 const baseline=portfolioSchedule(state);
 const beforeFinish=baseline.byId.get(second.id).projectedFinish;
 assert.equal(revisionReview(state).totals.changed,1);
 const recheck=recheckAction(first.id,prior.id,SHA_B);
 assert.match(editorSpec(state.projects[0],recheck).title,/Повторная проверка/);
 state=applyEditor(state,first.id,recheck,fields({
  result:"partial",level:"test",note:"Independently repeated restart and observed partial result"
 })).state;
 assert.equal(revisionReview(state).totals.reviews,0);
 const queue=planReviewQueue(state);
 assert.equal(queue.totals.affected,2);
 assert.equal(queue.totals.needsDecision,2);
 const event=queue.rows.find(row=>row.projectId===first.id);
 const review=planReviewAction(first.id,event.findingId,first.id,SHA_B);
 state=applyEditor(state,first.id,review,fields({
  outcome:"revise",rationale:"Revalidation requires additional release work"
 })).state;
 const decision=state.projects[0].decisions.at(-1);
 assert.equal(decision.kind,"plan_review");
 assert.equal(planReviewQueue(state).totals.needsProposal,1);
 state=applyEditor(state,first.id,planProposalAction(first.id,decision.id),fields({
  title:"Extend release validation",description:"Add time to evaluate fresh SHA evidence"
 })).state;
 const proposed=state.projects[0].changes.at(-1);
 assert.equal(proposed.status,"proposed");
 state=setPlanWork(state,first.id,proposed.id,{itemId:rootWork.id,estimateDays:6}).state;
 const beforeApproval=previewPlanAmendment(state,first.id,proposed.id);
 assert.equal(beforeApproval.affected,2);
 assert.equal(state.projects[0].items[0].estimateDays,2);
 assert.equal(portfolioSchedule(state).byId.get(second.id).projectedFinish,beforeFinish);
 state=decideChange(state,first.id,proposed.id,{
  status:"approved",rationale:"Human reviewed the revised release schedule"
 }).state;
 assert.equal(planReviewQueue(state).totals.planPending,1);
 assert.equal(state.projects[0].items[0].estimateDays,2);
 state=applyPlanAmendment(state,first.id,proposed.id).state;
 assert.equal(state.projects[0].items[0].estimateDays,6);
 assert.notEqual(portfolioSchedule(state).byId.get(second.id).projectedFinish,beforeFinish);
 assert.equal(planReviewQueue(state).totals.planApplied,1);
 assert.ok(state.projects[0].changes.at(-1).planAppliedAt);
 const reopened=deserialize(serialize(state));
 assert.deepEqual(reopened,state);
 assert.equal(portfolioSchedule(reopened).byId.get(second.id).projectedFinish,
  portfolioSchedule(state).byId.get(second.id).projectedFinish);
 assert.equal(reopened.projects[0].findings.at(-1).revision,SHA_B);
 assert.equal(reopened.projects[0].decisions.at(-1).kind,"plan_application");
 assert.throws(()=>applyPlanAmendment(reopened,first.id,proposed.id),/применена/);
});

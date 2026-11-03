import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding,planChange,decideChange} from "../src/trace.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {addPlanWork,applyPlanAmendment} from "../src/plan-amendment.mjs";
import {planReviewQueue,planReviewAction,planProposalAction,decidePlanReview,renderPortfolioPlanReviews} from "../src/plan-review.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";

const SHA_A="a".repeat(40),SHA_B="b".repeat(40),SHA_C="c".repeat(40);
const input=values=>({get:key=>values[key]??""});
function fixture(){
 const root=createProject(empty(),{name:"Library"}),child=createProject(root.state,{name:"Application"});
 const target=addTarget(child.state,root.id,{title:"Offline readback",desired:"Return same result"});
 const source=attach(target.state,root.id,"github","example/library");
 let state=observe(source.state,root.id,source.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_A},readiness:"not_assessed"
 });
 const claim=recordFinding(state,root.id,{targetId:target.id,result:"present",level:"test",
  sourceId:source.id,ref:"main",revision:SHA_A,note:"Initial claimed test"});
 state=claim.state;
 state=observe(state,root.id,source.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_B},readiness:"not_assessed"
 });
 const rechecked=recordFinding(state,root.id,{targetId:target.id,result:"partial",level:"test",
  sourceId:source.id,ref:"main",revision:SHA_B,reviewOfFindingId:claim.id,note:"Retested readback on main"});
 state=addPortfolioLink(rechecked.state,{from:root.id,to:child.id});
 return {state,root:root.id,child:child.id,sourceId:source.id,targetId:target.id,claimId:rechecked.id};
}
test("new pinned finding exposes root and downstream plan decisions without changing baseline",()=>{
 const f=fixture(),original=serialize(f.state),q=planReviewQueue(f.state);
 assert.equal(q.totals.events,1);
 assert.equal(q.totals.affected,2);
 assert.equal(q.totals.needsDecision,2);
 assert.equal(q.rows.find(x=>x.projectId===f.child).downstream,true);
 assert.deepEqual(q.rows.find(x=>x.projectId===f.child).path,[f.root,f.child]);
 assert.equal(serialize(f.state),original);
 assert.match(renderPortfolioPlanReviews(f.state),/Рассмотреть план/);
});
test("each project decides separately; keep does not alter plan, revise proposes but does not approve",()=>{
 const f=fixture();
 const request={rootProjectId:f.root,findingId:f.claimId,projectId:f.child,revision:SHA_B};
 const action=planReviewAction(f.root,f.claimId,f.child,SHA_B);
 assert.match(editorSpec(f.state.projects[1],action,f.state).title,/Решение по плану/);
 assert.throws(()=>applyEditor(f.state,f.child,action,input({outcome:"keep",rationale:"short"})),/обоснование/);
 let state=applyEditor(f.state,f.child,action,input({outcome:"revise",rationale:"Impact must be assessed"})).state;
 assert.equal(state.projects[1].decisions.at(-1).kind,"plan_review");
 assert.equal(state.projects[1].items.length,0);
 assert.equal(planReviewQueue(state).totals.needsDecision,1);
 assert.equal(planReviewQueue(state).totals.needsProposal,1);
 const decisionId=state.projects[1].decisions.at(-1).id;
 const proposalAction=planProposalAction(f.child,decisionId);
 assert.match(editorSpec(state.projects[1],proposalAction,state).title,/Изменение плана/);
 state=applyEditor(state,f.child,proposalAction,input({
  title:"Recheck dependent launch",
  description:"Revalidate the launch plan after upstream evidence changed"
 })).state;
 const change=state.projects[1].changes.at(-1);
 assert.equal(change.status,"proposed");
 assert.equal(change.planReviewDecisionId,decisionId);
 assert.deepEqual(change.targetIds,[]);
 assert.equal(planReviewQueue(state).totals.proposalOpen,1);
 assert.throws(()=>applyEditor(state,f.child,proposalAction,input({
  title:"Duplicate",description:"Unexpected second active proposal"
 })),/уже существует/);
 assert.deepEqual(deserialize(serialize(state)),state);
 const rootAction=planReviewAction(f.root,f.claimId,f.root,SHA_B);
 state=applyEditor(state,f.root,rootAction,input({outcome:"keep",rationale:"Existing plan still applies"})).state;
 assert.equal(planReviewQueue(state).totals.kept,1);
 assert.equal(state.projects[0].changes.length,0);
 assert.equal(state.projects[1].items.length,0);
});
test("a deferred decision can be revisited, and changing upstream SHA places decisions on hold",()=>{
 const f=fixture(),action=planReviewAction(f.root,f.claimId,f.child,SHA_B);
 let state=applyEditor(f.state,f.child,action,input({outcome:"defer",rationale:"Await next public build"})).state;
 assert.equal(planReviewQueue(state).totals.deferred,1);
 state=applyEditor(state,f.child,action,input({outcome:"keep",rationale:"No schedule amendment required"})).state;
 assert.equal(planReviewQueue(state).totals.kept,1);
 assert.equal(state.projects[1].decisions.filter(d=>d.kind==="plan_review").length,2);
 const changed=structuredClone(state);
 changed.projects[0].sources[0].summary.branchHeads.main=SHA_C;
 assert.ok(planReviewQueue(changed).rows.every(x=>x.state==="source_hold"));
 assert.throws(()=>decidePlanReview(changed,{
  rootProjectId:f.root,findingId:f.claimId,projectId:f.root,revision:SHA_B
 },{outcome:"keep",rationale:"Premature plan decision"}),/сверк/);
});
test("approved existing changes are surfaced as plans requiring human consideration",()=>{
 const f=fixture();
 let state=planChange(f.state,f.child,{title:"Approved migration",targetIds:[]}).state;
 const changeId=state.projects[1].changes[0].id;
 state=decideChange(state,f.child,changeId,{status:"approved",rationale:"Original acceptance decision"}).state;
 const q=planReviewQueue(state),dependent=q.rows.find(x=>x.projectId===f.child);
 assert.equal(dependent.approvedChanges.length,1);
 assert.equal(q.totals.approvedPlansAffected,1);
 assert.match(renderPortfolioPlanReviews(state),/Действующих утверждённых изменений/);
 assert.equal(state.projects[1].changes[0].status,"approved");
});

test("forged plan-review references are rejected on JSON import and UI escapes project names",()=>{
 const f=fixture(),request=planReviewAction(f.root,f.claimId,f.child,SHA_B);
 let state=applyEditor(f.state,f.child,request,input({
  outcome:"revise",rationale:"Review required before launch"
 })).state;
 const decision=state.projects[1].decisions.at(-1);
 state=applyEditor(state,f.child,planProposalAction(f.child,decision.id),input({
  title:"Review plan",description:"Evaluate changes to release milestones"
 })).state;
 const forged=structuredClone(state);
 forged.projects[1].changes.at(-1).planReviewDecisionId="unknown-decision";
 assert.throws(()=>deserialize(serialize(forged)),/Invalid plan review proposal/);
 const tampered=structuredClone(state);
 tampered.projects[1].decisions.at(-1).reviewRevision=SHA_C;
 assert.throws(()=>deserialize(serialize(tampered)),/Invalid plan review decision/);
 const escaped=structuredClone(state);
 escaped.projects[1].name="<img src=x onerror=alert(1)>";
 const html=renderPortfolioPlanReviews(escaped);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img/);
});

test("rejected proposal becomes actionable again instead of a dead-end",()=>{
 const f=fixture(),request=planReviewAction(f.root,f.claimId,f.child,SHA_B);
 let s=applyEditor(f.state,f.child,request,input({
  outcome:"revise",rationale:"Review must be extended after SHA update"
 })).state;
 const decision=s.projects[1].decisions.at(-1);
 const propose=planProposalAction(f.child,decision.id);
 s=applyEditor(s,f.child,propose,input({title:"Rework test plan",description:"Need new verification"})).state;
 const oldId=s.projects[1].changes.at(-1).id;
 s=decideChange(s,f.child,oldId,{status:"rejected",rationale:"Scope was not acceptable"}).state;
 const current=planReviewQueue(s),row=current.rows.find(r=>r.projectId===f.child);
 assert.equal(row.state,"needs_proposal");
 assert.equal(current.totals.needsProposal,1);
 assert.match(editorSpec(s.projects[1],propose,s).title,/Изменение плана/);
 s=applyEditor(s,f.child,propose,input({title:"Replacement",description:"Revised scope proposal"})).state;
 assert.equal(s.projects[1].changes.length,2);
 assert.equal(planReviewQueue(s).rows.find(r=>r.projectId===f.child).state,"proposal_open");
});

test("approved concrete amendments stay visible until separate human application",()=>{
 const f=fixture(),request=planReviewAction(f.root,f.claimId,f.child,SHA_B);
 let s=applyEditor(f.state,f.child,request,input({
  outcome:"revise",rationale:"Need a new independent verification milestone"
 })).state;
 const decision=s.projects[1].decisions.at(-1);
 s=applyEditor(s,f.child,planProposalAction(f.child,decision.id),input({
  title:"Add validation",description:"Introduce downstream validation work"
 })).state;
 const id=s.projects[1].changes.at(-1).id;
 s=addPlanWork(s,f.child,id,{title:"Validate rollout",estimateDays:2}).state;
 s=decideChange(s,f.child,id,{status:"approved",rationale:"Approved the concrete validation addition"}).state;
 const before=planReviewQueue(s);
 assert.equal(before.rows.find(r=>r.projectId===f.child).state,"plan_pending");
 assert.equal(before.totals.planPending,1);
 assert.equal(s.projects[1].items.length,0);
 assert.match(renderPortfolioPlanReviews(s),/Утверждённые корректировки ожидают применения/);
 assert.throws(()=>decidePlanReview(s,{rootProjectId:f.root,findingId:f.claimId,projectId:f.child,revision:SHA_B},
  {outcome:"keep",rationale:"Do not override approval"}),/уже принято/);
 s=applyPlanAmendment(s,f.child,id).state;
 const after=planReviewQueue(s);
 assert.equal(after.rows.find(r=>r.projectId===f.child).state,"plan_applied");
 assert.equal(after.totals.planApplied,1);
 assert.equal(after.totals.planPending,0);
 assert.equal(s.projects[1].items.length,1);
 assert.ok(s.projects[1].changes[0].planAppliedAt);
});

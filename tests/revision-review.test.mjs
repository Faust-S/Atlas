import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding} from "../src/trace.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {revisionReview,renderRevisionReview} from "../src/revision-review.mjs";
const at="2026-11-02T07:00:00.000Z";
function fixture(){
 const a=createProject(empty(),{name:"Upstream"});
 const b=createProject(a.state,{name:"Consumer"});
 const goal=addTarget(b.state,a.id,{title:"Offline recovery",desired:"Restore on restart"});
 const linked=attach(goal.state,a.id,"github","example/repository");
 const baseline=observe(linked.state,a.id,linked.id,"ok",{
  scope:"repository",complete:true,branches:["main"],
  branchHeads:{main:"a".repeat(40)},observedAt:at,readiness:"not_assessed"
 });
 baseline.projects[0].sources[0].observedAt=at;
 const finding=recordFinding(baseline,a.id,{targetId:goal.id,result:"present",level:"test",
  sourceId:linked.id,ref:"main",revision:"a".repeat(40),observedAt:at});
 const state=addPortfolioLink(finding.state,{from:a.id,to:b.id});
 return {state,projectId:a.id,consumerId:b.id,targetId:goal.id,sourceId:linked.id};
}
test("same branch SHA does not create a revision review; changed SHA exposes impacted dependent project",()=>{
 const f=fixture();
 assert.equal(revisionReview(f.state,{now:at}).totals.reviews,0);
 const updated=structuredClone(f.state);
 updated.projects[0].sources[0].summary.branchHeads.main="b".repeat(40);
 const model=revisionReview(updated,{now:at});
 assert.equal(model.totals.changed,1);
 assert.equal(model.totals.projects,1);
 assert.equal(model.totals.downstream,1);
 assert.equal(model.rows[0].claimedSha,"a".repeat(40));
 assert.equal(model.rows[0].observedSha,"b".repeat(40));
 assert.deepEqual(model.rows[0].downstream,[f.consumerId]);
 assert.match(renderRevisionReview(updated,{now:at}),/Повторно проверить/);
 assert.match(renderRevisionReview(updated,{now:at}),/История факта/);
 assert.deepEqual(deserialize(serialize(updated)),updated);
});
test("incomplete, unavailable and outdated source are uncertainty, not asserted SHA conflict",()=>{
 const f=fixture();
 for(const [mutate,expected] of [
  [s=>{s.summary.complete=false;s.summary.branchHeads.main="b".repeat(40)},"source_incomplete"],
  [s=>{s.status="error";s.error="API unavailable"},"source_unavailable"],
  [s=>{s.observedAt="2026-01-01T00:00:00Z"},"source_outdated"]
 ]){
  const data=structuredClone(f.state),source=data.projects[0].sources[0];
  mutate(source);
  const model=revisionReview(data,{now:at});
  assert.equal(model.rows[0].reason,expected);
  assert.equal(model.totals.changed,0);
  assert.equal(model.totals.uncertain,1);
 }
});
test("historical claims remain unchanged and no result is auto-accepted",()=>{
 const f=fixture(),original=serialize(f.state),updated=structuredClone(f.state);
 updated.projects[0].sources[0].summary.branchHeads.main="b".repeat(40);
 const html=renderRevisionReview(updated,{now:at});
 assert.match(html,/СSHA|SHA факта/);
 assert.doesNotMatch(html,/Релиз подтверждён/);
 assert.equal(serialize(f.state),original);
 assert.equal(updated.projects[0].findings[0].revision,"a".repeat(40));
});
test("untrusted Git names are escaped, not executable HTML",()=>{
 const f=fixture(),data=structuredClone(f.state);
 data.projects[0].name="<img src=x onerror=alert(1)>";
 data.projects[0].sources[0].summary.branchHeads.main="b".repeat(40);
 const html=renderRevisionReview(data,{now:at});
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img/);
});

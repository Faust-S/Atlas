import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding,compareProject} from "../src/trace.mjs";
import {recheckAction,revisionReview} from "../src/revision-review.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {projectImpact} from "../src/impact.mjs";
const values=o=>({get:k=>o[k]??""});
function setup(){
 const p=createProject(empty(),{name:"Product"});
 const t=addTarget(p.state,p.id,{title:"Offline result",desired:"Persist across restart"});
 const attached=attach(t.state,p.id,"github","example/product");
 let state=observe(attached.state,p.id,attached.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:"a".repeat(40)},readiness:"not_assessed"
 });
 const found=recordFinding(state,p.id,{targetId:t.id,result:"present",level:"test",
  sourceId:attached.id,ref:"main",revision:"a".repeat(40)});
 state=found.state;
 state=observe(state,p.id,attached.id,"ok",{
  scope:"repository",complete:true,branches:["main"],branchHeads:{main:"b".repeat(40)},readiness:"not_assessed"
 });
 return {state,pid:p.id,tid:t.id,sourceId:attached.id,oldId:found.id};
}
test("real review form appends pinned finding and clears only the current revision-review queue",()=>{
 const x=setup(),original=serialize(x.state),sha="b".repeat(40);
 const action=recheckAction(x.pid,x.oldId,sha);
 assert.equal(revisionReview(x.state).totals.changed,1);
 const spec=editorSpec(x.state.projects[0],action);
 assert.match(spec.title,/Повторная проверка/);
 assert.match(spec.hint,/Было:/);
 const result=applyEditor(x.state,x.pid,action,values({
  result:"partial",level:"test",reference:"https://example.org/public-test",
  note:"Executed the offline restore scenario on current branch"
 }));
 const project=result.state.projects[0];
 assert.equal(project.findings.length,2);
 assert.equal(project.findings[1].reviewOfFindingId,x.oldId);
 assert.equal(project.findings[1].revision,sha);
 assert.equal(project.findings[0].revision,"a".repeat(40));
 assert.equal(compareProject(project).rows[0].assessment,"partial_reported");
 assert.equal(projectImpact(project).rows[0].action,"plan_work");
 assert.equal(revisionReview(result.state).totals.reviews,0);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 assert.equal(serialize(x.state),original);
 assert.throws(()=>editorSpec(project,action),/ревизия|факт/);
});
test("concurrent SHA movement and missing rationale reject stale review form without mutation",()=>{
 const x=setup(),action=recheckAction(x.pid,x.oldId,"b".repeat(40));
 assert.throws(()=>applyEditor(x.state,x.pid,action,values({result:"present",level:"test",note:""})),/note required/);
 const changed=structuredClone(x.state);
 changed.projects[0].sources[0].summary.branchHeads.main="c".repeat(40);
 assert.throws(()=>applyEditor(changed,x.pid,action,values({
  result:"present",level:"test",note:"Validated older revision"
 })),/ревизия|факт/);
 assert.equal(changed.projects[0].findings.length,1);
});
test("same-millisecond entries prefer latest appended, not random UUID lexical order",()=>{
 const x=setup(),data=structuredClone(x.state);
 const original=data.projects[0].findings[0];
 data.projects[0].findings.push({...original,id:"000-new",revision:"b".repeat(40),
  result:"partial",reviewOfFindingId:original.id,note:"Checked now",observedAt:original.observedAt});
 assert.equal(compareProject(data.projects[0]).rows[0].latest.id,"000-new");
 assert.equal(revisionReview(data).totals.reviews,0);
 assert.deepEqual(deserialize(serialize(data)),data);
});

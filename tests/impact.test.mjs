import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding} from "../src/trace.mjs";
import {projectImpact,portfolioImpact,projectNextStep} from "../src/impact.mjs";
import {applyEditor} from "../src/editor.mjs";
const date="2026-11-01T19:00:00.000Z";
const args=o=>({get:k=>o[k]??""});

test("one linked target survives the full project → evidence → branch change → remediation route",()=>{
 const project=createProject(empty(),{name:"Public system",type:"engineering"});
 const req=addTarget(project.state,project.id,{title:"Offline restore",desired:"Snapshot survives reload"});
 const origin=attach(req.state,project.id,"github","example/project");
 const snapshot=observe(origin.state,project.id,origin.id,"ok",{
  scope:"repository",branches:["main"],branchHeads:{main:"old"},complete:true,
  provenance:{provider:"github",access:"public"}
 });
 snapshot.projects[0].sources[0].observedAt=date;
 const claim=recordFinding(snapshot,project.id,{
  targetId:req.id,result:"present",level:"test",sourceId:origin.id,
  ref:"main",revision:"old",observedAt:date,reference:"https://example.org/report"
 });
 const before=projectImpact(claim.state.projects[0],{now:date});
 assert.equal(before.rows[0].assessment,"test_claim");
 assert.equal(before.rows[0].action,"verify_acceptance");
 let current=observe(claim.state,project.id,origin.id,"ok",{
  scope:"repository",branches:["main"],branchHeads:{main:"new"},complete:true,
  changes:{comparable:true,changed:["main"],removed:[]}
 });
 current.projects[0].sources[0].observedAt=date;
 const changed=projectImpact(current.projects[0],{now:date});
 assert.equal(changed.rows[0].assessment,"stale");
 assert.equal(changed.rows[0].changed,true);
 assert.equal(changed.rows[0].action,"review_evidence");
 const remediation=applyEditor(current,project.id,"item-target:"+req.id,args({
  title:"Re-test offline restore",targetId:req.id,stageId:"",assignee:"QA",estimateDays:"2"
 }));
 const linked=remediation.state.projects[0].items[0];
 assert.deepEqual(linked.targetIds,[req.id]);
 assert.equal(linked.state,"todo");
 assert.equal(projectImpact(remediation.state.projects[0],{now:date}).rows[0].openWork,1);
 assert.deepEqual(deserialize(serialize(remediation.state)),remediation.state);
});

test("unconfirmed and manually accepted claims do not become verified release readiness",()=>{
 const base=createProject(empty(),{name:"Study",type:"research"});
 const goal=addTarget(base.state,base.id,{title:"Study completed",desired:"Independent review"});
 let impact=projectImpact(goal.state.projects[0],{now:date});
 assert.equal(impact.attention,1);
 assert.equal(impact.rows[0].action,"plan_work");
 const manual=recordFinding(goal.state,base.id,{targetId:goal.id,result:"present",level:"acceptance",observedAt:date});
 impact=projectImpact(manual.state.projects[0],{now:date});
 assert.equal(impact.rows[0].action,"verify_acceptance");
 assert.match(impact.warning,/not a verified product readiness score/);
});

test("old snapshots without targetIds remain valid; new links reject invalid target IDs",()=>{
 const base=createProject(empty(),{name:"Personal",type:"personal"});
 const task=createItem(base.state,base.id,{title:"Task"});
 assert.equal(task.state.projects[0].items[0].targetIds.length,0);
 const legacy=structuredClone(task.state);delete legacy.projects[0].items[0].targetIds;
 assert.deepEqual(deserialize(serialize(legacy)),legacy);
 assert.throws(()=>editItem(task.state,base.id,task.id,{targetIds:["not-existing"]}),/Invalid work targetIds/);
 const bad=structuredClone(task.state);bad.projects[0].items[0].targetIds=["invalid"];
 assert.throws(()=>serialize(bad),/Invalid work targetIds/);
});
test("portfolio aggregation reports attention without a fabricated percentage",()=>{
 const project=createProject(empty(),{name:"P",type:"engineering"});
 const target=addTarget(project.state,project.id,{title:"Capability",desired:"Works"});
 const totals=portfolioImpact(target.state.projects,{now:date});
 assert.equal(totals.attention,1);
 assert.equal(totals.missingWork,1);
 assert.equal(totals.rows[0].name,"P");
 assert.equal("readiness" in totals,false);
});

test("next step follows actual project gaps without granting authority or writing state",()=>{
 const created=createProject(empty(),{name:"Project first",type:"engineering"});
 const id=created.id;
 assert.equal(projectNextStep(created.state.projects[0]).id,"define_target");
 const target=addTarget(created.state,id,{title:"Deliver",desired:"Verified result"});
 const first=projectNextStep(target.state.projects[0]);
 assert.equal(first.id,"plan_work");
 assert.equal(first.action,"item-target:"+target.id);
 const produced=applyEditor(target.state,id,first.action,args({
  title:"Verify expected result",targetId:target.id,stageId:"",assignee:"QA",estimateDays:"1"
 }));
 assert.deepEqual(produced.state.projects[0].items[0].targetIds,[target.id]);
 const unrelated=createItem(target.state,id,{title:"Produce evidence"});
 assert.deepEqual(unrelated.state.projects[0].items[0].targetIds,[]);
 const unlinked=projectNextStep(unrelated.state.projects[0]);
 assert.equal(unlinked.id,"link_work");
 assert.equal(unlinked.action,"item-target:"+target.id);
 const linked=editItem(unrelated.state,id,unrelated.id,{targetIds:[target.id]});
 const before=JSON.stringify(linked.state);
 assert.equal(projectNextStep(linked.state.projects[0]).id,"review_reality");
 const incomplete=structuredClone(linked.state.projects[0]);
 incomplete.sources.push({id:"source:unavailable",locator:"example/repo",status:"error",
  summary:{complete:false}});
 assert.equal(projectNextStep(incomplete).id,"check_sources");
 const projection=projectImpact(linked.state.projects[0]);
 assert.equal(projectNextStep(linked.state.projects[0],projection).id,"review_reality");
 assert.equal(JSON.stringify(linked.state),before);
 assert.equal("automaticApply" in projectNextStep(linked.state.projects[0]),false);
});

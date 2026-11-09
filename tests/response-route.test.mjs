import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,serialize,deserialize,attach,observe} from "../src/core.mjs";
import {addTarget} from "../src/trace.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {projectImpact} from "../src/impact.mjs";
import {responseState,renderProjectResponses,renderPortfolioResponses} from "../src/response.mjs";
const input=o=>({get:k=>o[k]??""});
test("cause -> proposal -> human decision -> linked work -> restart",()=>{
 const p=createProject(empty(),{name:"Engineering",type:"engineering"});
 const g=addTarget(p.state,p.id,{title:"Offline restore",desired:"Readback reliable"});
 const w=createItem(g.state,p.id,{title:"Writer blocked",targetIds:[g.id]});
 let state=editItem(w.state,p.id,w.id,{state:"blocked"});
 const cause="work-blocked:"+w.id,action="respond:"+encodeURIComponent(cause);
 assert.match(editorSpec(state.projects[0],action).title,/Заблокирована работа/);
 state=applyEditor(state,p.id,action,input({title:"Fix writer",description:"Restore persistence"})).state;
 const c=state.projects[0].changes[0];
 assert.equal(c.causeKey,cause);
 assert.deepEqual(c.targetIds,[g.id]);
 assert.throws(()=>applyEditor(state,p.id,action,input({title:"Duplicate",description:"No"})),/уже существует/);
 assert.throws(()=>applyEditor(state,p.id,"work-change:"+c.id,input({title:"Early",estimateDays:"1"})),/не утверждено/);
 assert.throws(()=>applyEditor(state,p.id,"change:"+c.id,input({status:"approved",rationale:""})),/required/);
 state=applyEditor(state,p.id,"change:"+c.id,input({status:"approved",rationale:"Owner reviewed scope"})).state;
 assert.equal(state.projects[0].decisions[0].changeId,c.id);
 assert.equal(state.projects[0].decisions[0].previousStatus,"proposed");
 assert.equal(responseState(state.projects[0],projectImpact(state.projects[0])).approvedWithoutWork,1);
 state=applyEditor(state,p.id,"work-change:"+c.id,input({title:"Repair",estimateDays:"2"})).state;
 const work=state.projects[0].items.find(x=>x.changeId===c.id);
 assert.deepEqual(work.targetIds,[g.id]);
 assert.equal(responseState(state.projects[0],projectImpact(state.projects[0])).approvedWithoutWork,0);
 assert.deepEqual(deserialize(serialize(state)),state);
 assert.match(renderProjectResponses(state.projects[0],projectImpact(state.projects[0])),/Owner reviewed scope/);
 assert.match(renderPortfolioResponses(state,projectImpact),/Решения и устранение проблем/);
});
test("invalid change transitions and forged links cannot pass validation",()=>{
 const p=createProject(empty(),{name:"Review"}),w=createItem(p.state,p.id,{title:"Blocked"});
 let state=editItem(w.state,p.id,w.id,{state:"blocked"});
 state=applyEditor(state,p.id,"respond:"+encodeURIComponent("work-blocked:"+w.id),input({title:"Remedy",description:"Why"})).state;
 const id=state.projects[0].changes[0].id;
 assert.throws(()=>applyEditor(state,p.id,"change:"+id,input({status:"implemented",rationale:"Bypass approval"})),/Invalid change status transition/);
 assert.throws(()=>editItem(state,p.id,w.id,{changeId:"fake"}),/Invalid work changeId/);
 const corrupted=structuredClone(state);
 corrupted.projects[0].changes[0].causeKey="source-issue:unknown";
 assert.throws(()=>serialize(corrupted),/Invalid change record/);
 const damaged=structuredClone(state);
 damaged.projects[0].decisions.push({id:"bad",changeId:"fake",text:"Unlinked"});
 assert.throws(()=>serialize(damaged),/Invalid decision changeId/);
});

test("GitHub Actions discrepancy follows existing proposal, human decision and work chain",()=>{
 const made=createProject(empty(),{name:"Release planning",type:"engineering"});
 const attached=attach(made.state,made.id,"github","example/release");
 let state=attached.state;
 const sourceId=attached.id;
 state=observe(state,made.id,sourceId,"ok",{
  scope:"repository",complete:true,observedAt:"2026-11-09T15:00:00.000Z",
  defaultBranch:"main",branches:["main"],branchHeads:{main:"b".repeat(40)},
  ci:{state:"observed",branch:"main",headCurrent:"previous",
   headSha:"a".repeat(40),status:"completed",conclusion:"success",runId:10}
 });
 const p=state.projects[0],issue=responseState(p,projectImpact(p)).rows
  .find(r=>r.key==="source-issue:"+sourceId);
 assert.ok(issue,"Mismatched CI SHA should become an existing source-issue signal");
 assert.match(issue.detail,/другой редакции/);
 assert.equal(issue.needsProposal,true);
 const initial=JSON.stringify(state);
 const action="respond:"+encodeURIComponent(issue.key);
 assert.match(editorSpec(p,action).title,/Источник требует сверки/);
 state=applyEditor(state,made.id,action,input({
  title:"Check workflow and compare evidence",
  description:"Review build result before deciding whether to update requirements"
 })).state;
 const proposal=state.projects[0].changes[0];
 assert.equal(proposal.causeKey,issue.key);
 assert.equal(proposal.status,"proposed");
 assert.equal(state.projects[0].items.length,0);
 assert.equal(state.projects[0].decisions.length,0);
 assert.notEqual(JSON.stringify(state),initial);
 assert.throws(()=>applyEditor(state,made.id,action,input({title:"Duplicate"})),/уже существует/);
 state=applyEditor(state,made.id,"change:"+proposal.id,input({
  status:"approved",rationale:"Checked both revisions and approved investigation"
 })).state;
 assert.equal(state.projects[0].decisions.length,1);
 assert.equal(state.projects[0].items.length,0,"Approval is not automatic work");
 const restored=deserialize(serialize(state));
 assert.equal(restored.projects[0].changes[0].causeKey,issue.key);
 assert.equal(restored.projects[0].decisions[0].status,"approved");
 assert.equal(responseState(restored.projects[0],projectImpact(restored.projects[0]))
  .rows.find(r=>r.key===issue.key).needsProposal,false);
 const newer=observe(restored,made.id,sourceId,"ok",{
  scope:"repository",complete:true,observedAt:"2026-11-09T16:00:00.000Z",
  defaultBranch:"main",branches:["main"],branchHeads:{main:"b".repeat(40)},
  ci:{state:"observed",branch:"main",headCurrent:"current",
   headSha:"b".repeat(40),status:"completed",conclusion:"success",runId:11}
 });
 const resolved=responseState(newer.projects[0],projectImpact(newer.projects[0]));
 assert.equal(resolved.rows.find(row=>row.key===issue.key),undefined);
 assert.equal(resolved.resolved,1,"Previously investigated cause remains in decision history");
 assert.equal(newer.projects[0].changes[0].id,proposal.id);
 assert.equal(newer.projects[0].decisions.length,1);
 assert.equal(newer.projects[0].items.length,0,"A refreshed green CI does not create work");

});
test("successful aligned CI is not a cause; failed or unavailable check is review-only",()=>{
 const made=createProject(empty(),{name:"CI states"}),attached=attach(made.state,made.id,"github","example/ci");
 const sid=attached.id;
 const base={scope:"repository",complete:true,branches:["main"],branchHeads:{main:"a".repeat(40)},
  observedAt:"2026-11-09T14:00:00.000Z"};
 function issue(ci){
  const state=observe(attached.state,made.id,sid,"ok",{...base,ci});
  return responseState(state.projects[0],projectImpact(state.projects[0])).rows
   .find(x=>x.key==="source-issue:"+sid);
 }
 assert.equal(issue({state:"observed",branch:"main",headCurrent:"current",
  status:"completed",conclusion:"success"}),undefined);
 assert.equal(issue({state:"observed",branch:"main",headCurrent:"current",
  status:"in_progress",conclusion:null}),undefined);
 assert.match(issue({state:"observed",branch:"main",headCurrent:"current",
  status:"completed",conclusion:"failure"}).detail,/ошибкой/);
 assert.match(issue({state:"observed",branch:"main",headCurrent:"current",
  status:"completed",conclusion:"skipped"}).detail,/не подтвердила/);
 assert.match(issue({state:"unavailable",reason:"RATE_LIMITED"}).detail,/Не удалось подтвердить/);
 assert.equal(attached.state.projects[0].items.length,0);
});

import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,serialize,observe} from "../src/core.mjs";
import {inspectU02ProjectSource} from "../src/u02-source-bridge.mjs";

const shaA="a".repeat(40),shaB="b".repeat(40);
const fixture=()=>{
 const p=createProject(empty(),{name:"Source review",type:"engineering"});
 const a=attach(p.state,p.id,"github","Faust-S/Atlas");
 const snapshot=observe(a.state,p.id,a.id,"ok",{
  scope:"repository",complete:true,branchHeads:{main:shaA},branches:["main"]
 });
 return {snapshot,projectId:p.id,sourceId:a.id};
};
const observation=(sha=shaB,status="OK")=>({
 schema:"IWXA_SOURCE_CONNECTOR/1.0.0",providerId:"github.public",
 sourceRef:"github://Faust-S/Atlas/src%2Fcore.mjs?ref=main",
 observationType:"file",authority:"OBSERVATION_ONLY",status,revision:sha,
 observedAt:"2026-11-04T00:00:00Z",provenance:{provider:"github",access:"public"}
});
test("U02 source change is read-only and not approval",()=>{
 const f=fixture(),before=serialize(f.snapshot);
 const view=inspectU02ProjectSource(f.snapshot,f.projectId,f.sourceId,observation());
 assert.equal(view.status,"OBSERVED");
 assert.equal(view.revisionChange,"CHANGED");
 assert.equal(view.requiresHumanReview,true);
 assert.equal(view.authority,"OBSERVATION_ONLY");
 assert.equal(view.previousRevision,shaA);
 assert.equal(view.observedRevision,shaB);
 assert.equal(serialize(f.snapshot),before);
});
test("identical SHA is unchanged; source failure never becomes success",()=>{
 const f=fixture(),base=[f.snapshot,f.projectId,f.sourceId];
 const unchanged=inspectU02ProjectSource(...base,observation(shaA));
 assert.equal(unchanged.revisionChange,"UNCHANGED");
 assert.equal(unchanged.requiresHumanReview,false);
 const failed=inspectU02ProjectSource(...base,observation(null,"ACCESS_DENIED"));
 assert.equal(failed.status,"ACCESS_DENIED");
 assert.equal(failed.revisionChange,"NOT_COMPARABLE");
 assert.equal(failed.observedRevision,null);
});
test("U02 mismatch / forged authority / bad revision rejected or labelled invalid",()=>{
 const f=fixture(),base=[f.snapshot,f.projectId,f.sourceId];
 assert.throws(()=>inspectU02ProjectSource(...base,{...observation(),authority:"CAN_APPLY"}),/ATLAS_U02_OBSERVATION_INVALID/);
 assert.throws(()=>inspectU02ProjectSource(...base,{...observation(),sourceRef:"github:\/\/Other\/Secret\/a?ref=main"}),/ATLAS_U02_SOURCE_MISMATCH/);
 assert.equal(inspectU02ProjectSource(...base,observation("wrong")).status,"SOURCE_INVALID");
 const bad=observation();bad.provenance.access="authorized";
 assert.equal(inspectU02ProjectSource(...base,bad).status,"SOURCE_INVALID");
});

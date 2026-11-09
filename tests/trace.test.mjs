import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,removeItem,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding,planChange,updateChange,compareProject} from "../src/trace.mjs";
const asOf="2026-11-01T12:00:00.000Z";
function make(){const p=createProject(empty(),{name:"Example product",type:"engineering"});const t=addTarget(p.state,p.id,{title:"Offline support",desired:"State restores after restart"});return {pid:p.id,tid:t.id,state:t.state}}
test("committed desired capability initially unknown, not failed",()=>{const x=make();const r=compareProject(x.state.projects[0],{now:asOf});assert.equal(r.counts.unknown,1);assert.equal(r.committed,1);assert.equal(r.rows[0].assessment,"unknown")});
test("candidate plans do not inflate committed readiness",()=>{const x=make();const t=addTarget(x.state,x.pid,{title:"Potential",desired:"Optional feature",intent:"candidate"});const r=compareProject(t.state.projects[0],{now:asOf});assert.equal(r.committed,1);assert.equal(r.candidates,1);assert.equal(r.counts.unknown,1)});
test("manual implementation does not establish acceptance",()=>{const x=make();const y=recordFinding(x.state,x.pid,{targetId:x.tid,result:"present",level:"implementation",observedAt:asOf});assert.equal(compareProject(y.state.projects[0],{now:asOf}).rows[0].assessment,"implemented_claim")});
test("test finding and acceptance finding are distinct",()=>{let x=make();x.state=recordFinding(x.state,x.pid,{targetId:x.tid,result:"present",level:"test",observedAt:asOf}).state;assert.equal(compareProject(x.state.projects[0],{now:asOf}).rows[0].assessment,"test_claim");const y=recordFinding(x.state,x.pid,{targetId:x.tid,result:"present",level:"acceptance",observedAt:"2026-11-01T12:01:00Z"});assert.equal(compareProject(y.state.projects[0],{now:"2026-11-01T12:02:00Z"}).rows[0].assessment,"acceptance_claim")});
test("partial and absent results not misreported as complete",()=>{const x=make();for(const [value,expected] of [["partial","partial_reported"],["absent","gap_reported"]]){const y=recordFinding(x.state,x.pid,{targetId:x.tid,result:value,observedAt:asOf});assert.equal(compareProject(y.state.projects[0],{now:asOf}).rows[0].assessment,expected)}});
test("source observation older than freshness window becomes stale",()=>{const x=make(),a=attach(x.state,x.pid,"github","example/product");const b=observe(a.state,x.pid,a.id,"ok",{branches:["main"],branchHeads:{"main":"SHA1"},complete:true});b.projects[0].sources[0].observedAt="2026-10-01T00:00:00Z";const c=recordFinding(b,x.pid,{targetId:x.tid,result:"present",level:"test",sourceId:a.id,ref:"main",revision:"SHA1",observedAt:asOf});const r=compareProject(c.state.projects[0],{now:asOf,maxAgeMs:86400000});assert.equal(r.rows[0].assessment,"stale")});
test("source version change invalidates old evidence claim",()=>{const x=make(),a=attach(x.state,x.pid,"github","example/product");const b=observe(a.state,x.pid,a.id,"ok",{branchHeads:{"main":"new"},complete:true});b.projects[0].sources[0].observedAt=asOf;const c=recordFinding(b,x.pid,{targetId:x.tid,result:"present",level:"test",sourceId:a.id,ref:"main",revision:"old",observedAt:asOf});const r=compareProject(c.state.projects[0],{now:asOf});assert.equal(r.rows[0].freshness.state,"revision_changed");assert.equal(r.rows[0].assessment,"stale")});
test("unavailable source with cached evidence is not current",()=>{const x=make(),a=attach(x.state,x.pid,"github","example/product");const b=recordFinding(a.state,x.pid,{targetId:x.tid,result:"present",level:"test",sourceId:a.id,ref:"main",revision:"sha",observedAt:asOf});assert.equal(compareProject(b.state.projects[0],{now:asOf}).rows[0].assessment,"stale")});
test("incomplete source enumeration cannot justify current revision",()=>{const x=make(),a=attach(x.state,x.pid,"github","example/product");const b=observe(a.state,x.pid,a.id,"ok",{complete:false,branchHeads:{"main":"SHA1"}});b.projects[0].sources[0].observedAt=asOf;const c=recordFinding(b,x.pid,{targetId:x.tid,result:"present",level:"test",sourceId:a.id,ref:"main",revision:"SHA1",observedAt:asOf});assert.equal(compareProject(c.state.projects[0],{now:asOf}).rows[0].assessment,"stale")});
test("conflicting claims about same source revision are surfaced",()=>{const x=make(),a=attach(x.state,x.pid,"github","example/product");const b=observe(a.state,x.pid,a.id,"ok",{complete:true,branchHeads:{main:"SHA1"}});b.projects[0].sources[0].observedAt=asOf;const c=recordFinding(b,x.pid,{targetId:x.tid,result:"present",level:"test",sourceId:a.id,ref:"main",revision:"SHA1",observedAt:asOf});const d=recordFinding(c.state,x.pid,{targetId:x.tid,result:"absent",level:"test",sourceId:a.id,ref:"main",revision:"SHA1",observedAt:asOf});assert.equal(compareProject(d.state.projects[0],{now:asOf}).rows[0].assessment,"conflict")});
test("change requests are proposals until explicitly approved",()=>{const x=make(),a=planChange(x.state,x.pid,{title:"New retry policy",targetIds:[x.tid]});let r=compareProject(a.state.projects[0],{now:asOf});assert.equal(r.proposedChanges,1);assert.equal(r.approvedChanges,0);const b=updateChange(a.state,x.pid,a.id,"approved");r=compareProject(b.state.projects[0],{now:asOf});assert.equal(r.proposedChanges,0);assert.equal(r.approvedChanges,1);assert.equal(r.counts.unknown,1)});
test("roundtrip preserves sources, findings, target/plan state",()=>{const x=make(),a=planChange(x.state,x.pid,{title:"Fix",targetIds:[x.tid]}),b=recordFinding(a.state,x.pid,{targetId:x.tid,result:"partial",observedAt:asOf});assert.deepEqual(deserialize(serialize(b.state)),b.state)});
test("old projects without trace arrays remain valid",()=>{const x=createProject(empty(),{name:"Legacy"});assert.equal(compareProject(x.state.projects[0],{now:asOf}).rows.length,0)});
test("invalid references do not mutate original snapshot",()=>{const x=make();assert.throws(()=>recordFinding(x.state,x.pid,{targetId:"bad",result:"present"}),/Unknown target/);assert.equal(x.state.projects[0].findings.length,0)});

test("work-linked observation retains its historical source and legacy imports still load",()=>{
 const x=make(),work=createItem(x.state,x.pid,{title:"Implement outcome",targetIds:[x.tid]});
 const finding=recordFinding(work.state,x.pid,{targetId:x.tid,workId:work.id,result:"partial",note:"Manual observation"});
 assert.equal(finding.state.projects[0].findings[0].workId,work.id);
 assert.equal(compareProject(finding.state.projects[0]).rows[0].latest.workId,work.id);
 assert.equal(deserialize(serialize(finding.state)).projects[0].findings[0].workId,work.id);
 assert.equal(finding.state.projects[0].items[0].state,"todo");
 assert.throws(()=>removeItem(finding.state,x.pid,work.id),/Работа связана с сохранённым наблюдением/);
 const reassigned=editItem(finding.state,x.pid,work.id,{targetIds:[]});
 assert.equal(deserialize(serialize(reassigned)).projects[0].findings[0].workId,work.id);
 const legacy=recordFinding(work.state,x.pid,{targetId:x.tid,result:"partial"});
 assert.equal(Object.hasOwn(legacy.state.projects[0].findings[0],"workId"),false);
 assert.deepEqual(deserialize(serialize(legacy.state)),legacy.state);
});
test("observations cannot forge a work link or change to a requirement outside its work",()=>{
 const x=make(),other=addTarget(x.state,x.pid,{title:"Unrelated",desired:"Separate"});
 const work=createItem(other.state,x.pid,{title:"Deliver first target",targetIds:[x.tid]});
 const before=serialize(work.state);
 assert.throws(()=>recordFinding(work.state,x.pid,{targetId:other.id,workId:work.id,result:"present"}),/Работа не связана/);
 assert.throws(()=>recordFinding(work.state,x.pid,{targetId:x.tid,workId:"unknown",result:"present"}),/Работа не связана/);
 assert.equal(serialize(work.state),before);
 const valid=recordFinding(work.state,x.pid,{targetId:x.tid,workId:work.id,result:"partial"});
 const forged=structuredClone(valid.state);
 forged.projects[0].findings[0].workId="unknown";
 assert.throws(()=>deserialize(JSON.stringify(forged)),/Invalid finding workId/);
});

test("verified selected GitHub branch stays comparable when other branches are paginated",()=>{
 const x=make(),ref="work/2026-11-09-atlas-0-5",sha="a".repeat(40);
 const linked=attach(x.state,x.pid,"github","example/product",{branch:ref});
 const observed=observe(linked.state,x.pid,linked.id,"ok",{
  scope:"repository",complete:false,defaultBranch:"main",
  branches:["main",ref],branchHeads:{main:"b".repeat(40),[ref]:sha},
  ci:{state:"observed",branch:ref,runId:99,headSha:sha,headCurrent:"current",
   status:"completed",conclusion:"success"},observedAt:asOf
 });
 observed.projects[0].sources[0].observedAt=asOf;
 const finding=recordFinding(observed,x.pid,{targetId:x.tid,result:"present",
  level:"test",sourceId:linked.id,ref,revision:sha,observedAt:asOf});
 const current=compareProject(finding.state.projects[0],{now:asOf}).rows[0];
 assert.equal(current.freshness.state,"current_revision");
 assert.equal(current.assessment,"test_claim","Source agreement is not acceptance");
 const revisionChanged=structuredClone(finding.state);
 revisionChanged.projects[0].sources[0].summary.branchHeads[ref]="c".repeat(40);
 assert.equal(compareProject(revisionChanged.projects[0],{now:asOf}).rows[0].freshness.state,
  "revision_changed");
 const missing=structuredClone(finding.state);
 missing.projects[0].sources[0].summary.branches=["main"];
 assert.equal(compareProject(missing.projects[0],{now:asOf}).rows[0].freshness.state,
  "incomplete","A SHA alone is not proof that the selected branch was observed");
 const unselected=recordFinding(observed,x.pid,{targetId:x.tid,result:"partial",
  level:"test",sourceId:linked.id,ref:"main",revision:"b".repeat(40),observedAt:asOf});
 assert.equal(compareProject(unselected.state.projects[0],{now:asOf}).rows[0].freshness.state,
  "incomplete","Unrelated branches stay unverified while enumeration is partial");
 assert.deepEqual(deserialize(serialize(finding.state)),finding.state);
});

import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,serialize,deserialize} from "../src/core.mjs";
import {readFileSync} from "node:fs";
import {planPublicRefresh,reconcilePublicSources,publicSourceQueue,renderPublicSourceQueue} from "../src/public-refresh.mjs";
function sample(){
 const a=createProject(empty(),{name:"A"}),b=createProject(a.state,{name:"B"});
 let state=b.state;const bindings=[];
 for(const [pid,locator] of [[a.id,"example/shared"],[b.id,"Example/Shared"],[b.id,"example/other"]]){
  const attached=attach(state,pid,"github",locator);
  state=attached.state;bindings.push({projectId:pid,sourceId:attached.id});
 }
 const other=attach(state,a.id,"file","/public/readme.txt");
 return {state:other.state,bindings,other:other.id};
}
const observed=(name,sha="a".repeat(40))=>({
 scope:"repository",repository:name,repositoryId:42,defaultBranch:"main",branches:["main"],
 branchHeads:{main:sha},complete:true,observedAt:new Date().toISOString(),
 provenance:{provider:"github",access:"public",endpoint:"https://api.github.com/repos/"+name},
 readiness:"not_assessed"
});
test("deduplicates repeated GitHub bindings and preserves one authoritative snapshot",async()=>{
 const {state,bindings,other}=sample();
 const plan=planPublicRefresh(state);
 assert.equal(plan.due,3);assert.equal(plan.unique,2);assert.equal(plan.selected,3);
 let calls=0;
 const result=await reconcilePublicSources(state,{plan,repoObserver:async name=>{calls++;return observed(name)}});
 assert.equal(calls,2);assert.equal(result.report.updated,3);assert.equal(result.report.failed,0);
 assert.equal(result.state.revision,state.revision+1);
 assert.ok(result.state.projects.every(p=>p.sources.filter(s=>s.kind==="github").every(s=>s.status==="ok")));
 assert.equal(result.state.projects[0].sources.find(s=>s.id===other).status,"never");
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 assert.equal(planPublicRefresh(result.state).unique,0);
 assert.equal(planPublicRefresh(result.state,{only:[bindings[0]]}).unique,1);
});
test("errors keep previous evidence and public fetches respect request limit",async()=>{
 const f=sample(),first=await reconcilePublicSources(f.state,{repoObserver:async name=>observed(name)});
 const next=await reconcilePublicSources(first.state,{
  plan:planPublicRefresh(first.state,{maxAgeMs:0,maxRequests:1}),
  repoObserver:async()=>{throw Error("GitHub public API 503")}
 });
 assert.equal(next.report.requests,1);assert.equal(next.report.failed,2);assert.equal(next.report.remaining,1);
 const original=first.state.projects[0].sources[0].summary,after=next.state.projects[0].sources[0];
 assert.equal(after.status,"error");assert.deepEqual(after.summary,original);
 assert.equal(first.state.projects[0].sources[0].status,"ok");
});
test("rate limit stops remaining API calls without changing untouched sources",async()=>{
 const f=sample();let calls=0;
 const next=await reconcilePublicSources(f.state,{repoObserver:async()=>{
  calls++;throw Error("GitHub public API 429 · rate-limit reset");
 }});
 assert.equal(calls,1);assert.equal(next.report.rateLimited,true);
 assert.equal(next.report.failed,2);assert.equal(next.report.remaining,1);
 assert.equal(next.state.projects[1].sources.find(s=>s.locator==="example/other").status,"never");
});
test("partial observations do not invent deleted branches or release qualification",async()=>{
 const f=sample(),first=await reconcilePublicSources(f.state,{repoObserver:async name=>observed(name)});
 const next=await reconcilePublicSources(first.state,{
  plan:planPublicRefresh(first.state,{maxAgeMs:0}),
  repoObserver:async name=>({...observed(name,"b".repeat(40)),complete:false,branches:[]})
 });
 const source=next.state.projects[0].sources[0];
 assert.equal(source.summary.changes.comparable,false);
 assert.deepEqual(source.summary.changes.removed,[]);
 assert.equal(source.summary.readiness,"not_assessed");
});

test("manual refresh progresses fairly through an oversized public-source queue",async()=>{
 const initial=createProject(empty(),{name:"Portfolio"});
 let state=initial.state;
 for(let i=0;i<10;i++)state=attach(state,initial.id,"github","example/repo"+i).state;
 const observedRepos=[];
 const observer=async name=>{observedRepos.push(name);return observed(name)};
 const first=await reconcilePublicSources(state,{plan:planPublicRefresh(state,{maxAgeMs:0}),repoObserver:observer});
 assert.equal(first.report.requests,4);
 assert.equal(first.report.updated,4);
 assert.equal(first.report.remaining,6);
 assert.equal(first.state.revision,state.revision+1);
 const second=await reconcilePublicSources(first.state,{plan:planPublicRefresh(first.state,{maxAgeMs:0}),repoObserver:observer});
 assert.equal(second.report.requests,4);
 assert.equal(second.report.remaining,6);
 assert.equal(new Set(observedRepos).size,8,"second run must not repeat already-fresh repos");
 const third=await reconcilePublicSources(second.state,{plan:planPublicRefresh(second.state,{maxAgeMs:0}),repoObserver:observer});
 assert.equal(new Set(observedRepos).size,10);
 assert.equal(third.report.requests,4,"two previously observed sources can be rechecked after draining the initial queue");
 assert.equal(planPublicRefresh(third.state).due,0);
});

test("global binding limit applies to all groups, including shared repositories",async()=>{
 const first=createProject(empty(),{name:"Large"});
 let state=first.state;
 for(let i=0;i<40;i++)state=attach(state,first.id,"github","Example/repo"+Math.floor(i/10)).state;
 const plan=planPublicRefresh(state,{maxAgeMs:0,limit:30,maxRequests:4});
 assert.equal(plan.due,40);
 assert.equal(plan.selected,30);
 assert.equal(plan.remaining,10);
 assert.equal(plan.unique,3);
 const result=await reconcilePublicSources(state,{plan,repoObserver:async name=>observed(name)});
 assert.equal(result.report.updated,30);
 assert.equal(result.report.remaining,10);
 assert.equal(result.state.revision,state.revision+1);
 assert.equal(planPublicRefresh(result.state).due,10);
});

test("queue exposes observed freshness and escapes untrusted source identifiers",async()=>{
 const fixture=sample();
 const queue=publicSourceQueue(fixture.state);
 assert.equal(queue.unique,2);
 assert.equal(queue.pending,2);
 const markup=renderPublicSourceQueue(fixture.state);
 assert.match(markup,/Публичные источники портфеля/);
 assert.match(markup,/example\/shared/);
 const result=await reconcilePublicSources(fixture.state,{repoObserver:async name=>observed(name)});
 assert.equal(publicSourceQueue(result.state).pending,0);
 const poisoned=structuredClone(result.state);
 poisoned.projects[0].sources[0].locator="<img src=x onerror=alert(1)>";
 const html=renderPublicSourceQueue(poisoned);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img/);
});

test("failed and pending bindings do not become claimed delivery",async()=>{
 const a=sample();
 const result=await reconcilePublicSources(a.state,{repoObserver:async()=>{throw Error("HTTP 429") }});
 assert.equal(result.report.rateLimited,true);
 assert.equal(result.report.failed,2);
 assert.equal(result.report.remaining,1);
 assert.ok(result.state.projects.every(p=>p.sources.every(s=>!s.summary?.qualified)));
 assert.match(renderPublicSourceQueue(result.state,{lastReport:result.report}),/GitHub API ограничил запросы/);
});

test("public workflow receipt survives saved Atlas snapshot without accepting work",async()=>{
 const fixture=sample(),before=serialize(fixture.state);
 const sha="d".repeat(40);
 const result=await reconcilePublicSources(fixture.state,{repoObserver:async name=>({
  ...observed(name,sha),ci:{state:"observed",branch:"main",runId:42,
   headSha:sha,headCurrent:"current",status:"completed",conclusion:"success",
   url:"https://github.com/"+name+"/actions/runs/42"}
 })});
 const restored=deserialize(serialize(result.state));
 const ci=restored.projects[0].sources[0].summary.ci;
 assert.equal(ci.headSha,sha);
 assert.equal(ci.runId,42);
 assert.equal(ci.headCurrent,"current");
 assert.equal(restored.projects[0].items.length,0);
 assert.equal(result.report.updated,3);
 assert.equal(serialize(fixture.state),before);
 assert.equal(restored.projects[0].sources[0].summary.readiness,"not_assessed");
 const ui=readFileSync(new URL("../src/public-refresh.mjs",import.meta.url),"utf8");
 assert.match(ui,/repoObserver=\(name,branch\)=>observePublicRepo\(name,globalThis\.fetch,\{includeActions:true,actionsBranch:branch\}\)/);
});

test("same GitHub repository with distinct selected branches is refreshed separately",async()=>{
 const p=createProject(empty(),{name:"Atlas"});
 const a=attach(p.state,p.id,"github","Faust-S/Atlas",{branch:"release/0.4"});
 const b=attach(a.state,p.id,"github","Faust-S/Atlas",{branch:"work/2026-11-09-atlas-0-5"});
 const c=attach(b.state,p.id,"github","Faust-S/Atlas",{branch:"work/2026-11-09-atlas-0-5"});
 const plan=planPublicRefresh(c.state,{maxAgeMs:0});
 assert.equal(plan.unique,2);
 assert.equal(plan.selected,3);
 const called=[];
 const next=await reconcilePublicSources(c.state,{plan,repoObserver:async(name,branch)=>{
  called.push([name,branch]);
  return {...observed(name),ci:{state:"none",branch}};
 }});
 assert.deepEqual(called.map(([_,branch])=>branch).sort(),["release/0.4","work/2026-11-09-atlas-0-5"]);
 assert.equal(next.report.requests,2);
 assert.equal(next.report.updated,3);
 const restored=deserialize(serialize(next.state));
 assert.deepEqual(restored.projects[0].sources.map(source=>source.summary.ci.branch),
  ["release/0.4","work/2026-11-09-atlas-0-5","work/2026-11-09-atlas-0-5"]);
 assert.equal(publicSourceQueue(restored).unique,2);
});

test("a partial GitHub list preserves exact selected branch drift across save and restore",async()=>{
 const sampleState=sample().state,shaA="a".repeat(40),shaB="b".repeat(40);
 const partial=(name,sha)=>({...observed(name,sha),complete:false,
  ci:{state:"none",branch:"main"}});
 const first=await reconcilePublicSources(sampleState,{
  repoObserver:async name=>partial(name,shaA)});
 const second=await reconcilePublicSources(first.state,{
  plan:planPublicRefresh(first.state,{maxAgeMs:0}),
  repoObserver:async name=>partial(name,shaB)});
 const before=first.state.projects[0].sources[0],after=second.state.projects[0].sources[0];
 assert.equal(before.summary.changes.selectedRevision,undefined);
 assert.equal(after.summary.changes.comparable,false);
 assert.deepEqual(after.summary.changes.selectedRevision,
  {branch:"main",previousSha:shaA,currentSha:shaB});
 assert.deepEqual([after.summary.changes.added,after.summary.changes.removed],[[],[]]);
 assert.equal(after.summary.readiness,"not_assessed");
 assert.deepEqual(deserialize(serialize(second.state)),second.state);
 assert.equal(second.state.projects[0].findings.length,0);
});

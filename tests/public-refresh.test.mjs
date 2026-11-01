import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,serialize,deserialize} from "../src/core.mjs";
import {planPublicRefresh,reconcilePublicSources} from "../src/public-refresh.mjs";
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
 assert.equal(result.state.revision,state.revision+3);
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

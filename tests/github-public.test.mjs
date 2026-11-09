import test from "node:test";import assert from "node:assert/strict";import{repoName,observePublicRepo}from"../src/github-public.mjs";
test("normalizes plain names and urls",()=>{assert.equal(repoName("owner/repo"),"owner/repo");assert.equal(repoName("https://github.com/owner/repo.git"),"owner/repo")});
test("rejects invalid path",()=>{assert.throws(()=>repoName("https://evil.org/o/r"));assert.throws(()=>repoName("owner/../repo"))});
test("discovers working branches",async()=>{const f=async url=>({ok:true,json:async()=>url.includes("branches?")?[{name:"main"},{name:"work/feature"}]:{visibility:"public",default_branch:"main"}});const r=await observePublicRepo("o/r",f);assert.deepEqual(r.branches,["main","work/feature"]);assert.equal(r.readiness,"not_assessed")});
test("private source rejected",async()=>{await assert.rejects(observePublicRepo("o/r",async()=>({ok:true,json:async()=>({private:true})})),/Private/)});
test("errors surface",async()=>{await assert.rejects(observePublicRepo("o/r",async()=>({ok:false,status:403})),/403/)});

test("branch revision IDs and completeness are preserved",async()=>{const f=async url=>({ok:true,json:async()=>url.includes("branches?")?[{name:"main",commit:{sha:"abc123"}},{name:"work/fix",commit:{sha:"def456"}}]:{visibility:"public",default_branch:"main"}});const r=await observePublicRepo("o/r",f);assert.equal(r.branchHeads.main,"abc123");assert.equal(r.branchHeads["work/fix"],"def456");assert.equal(r.complete,true)});

const shaA="a".repeat(40),shaB="b".repeat(40);
const ok=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const missing=status=>({ok:false,status,headers:{get:()=>null},json:async()=>({})});
function publicGitHubWithActions(run,actionsStatus=200){
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(url.endsWith("/repos/example/demo"))return ok({id:31,private:false,default_branch:"main"});
  if(url.includes("/branches?"))return ok([{name:"main",commit:{sha:shaB}}]);
  if(url.includes("/actions/runs?"))
   return actionsStatus===200?ok({workflow_runs:run?[run]:[]}):missing(actionsStatus);
  throw Error("Unexpected public URL "+url);
 };
 return {fetcher,calls};
}
const workflow=(overrides={})=>({
 id:874,head_branch:"main",head_sha:shaB,status:"completed",conclusion:"success",...overrides
});
test("Actions evidence keeps exact head; a green run is not project acceptance",async()=>{
 const f=publicGitHubWithActions(workflow());
 const result=await observePublicRepo("example/demo",f.fetcher,{includeActions:true});
 assert.equal(result.ci.state,"observed");
 assert.equal(result.ci.headCurrent,"current");
 assert.equal(result.ci.conclusion,"success");
 assert.equal(result.ci.runId,874);
 assert.equal(result.ci.url,"https://github.com/example/demo/actions/runs/874");
 assert.equal(result.readiness,"not_assessed");
 assert.equal(result.complete,true);
 assert.equal(f.calls.length,3,"one repo, one branches and one latest-run request");
 assert.match(f.calls[2],/branch=main&per_page=1&exclude_pull_requests=true/);
 assert.ok(f.calls.every(url=>url.startsWith("https://api.github.com/repos/example/demo")));
});
test("an earlier successful run is explicitly stale for the current HEAD",async()=>{
 const f=publicGitHubWithActions(workflow({head_sha:shaA}));
 const observed=await observePublicRepo("example/demo",f.fetcher,{includeActions:true});
 assert.equal(observed.branchHeads.main,shaB);
 assert.equal(observed.ci.headCurrent,"previous");
 assert.equal(observed.ci.conclusion,"success");
 assert.equal(observed.readiness,"not_assessed");
});
test("running, cancelled, no-run and invalid responses never invent a pass",async()=>{
 for(const run of [
  workflow({status:"in_progress",conclusion:null}),
  workflow({status:"completed",conclusion:"cancelled"}),
  workflow({id:-1}),workflow({head_branch:"feature"}),
  workflow({head_sha:"not-a-sha"})
 ]){
  const f=publicGitHubWithActions(run);
  const r=await observePublicRepo("example/demo",f.fetcher,{includeActions:true});
  assert.notEqual(r.ci.conclusion,"success");
  assert.equal(r.readiness,"not_assessed");
 }
 const empty=await observePublicRepo("example/demo",publicGitHubWithActions(null).fetcher,{includeActions:true});
 assert.equal(empty.ci.state,"none");
});
test("Actions API failure leaves branch evidence readable and never upgrades its authority",async()=>{
 for(const status of [403,404,429,500]){
  const f=publicGitHubWithActions(workflow(),status);
  const result=await observePublicRepo("example/demo",f.fetcher,{includeActions:true});
  assert.equal(result.scope,"repository");
  assert.equal(result.branchHeads.main,shaB);
  assert.equal(result.complete,true);
  assert.equal(result.ci.state,"unavailable");
  assert.equal(result.readiness,"not_assessed");
  assert.equal(result.ci.reason,status===403||status===429?"RATE_LIMITED":"SOURCE_UNAVAILABLE");
 }
});
test("old read-only repo call remains unchanged without extra Actions requests",async()=>{
 const f=publicGitHubWithActions(workflow());
 const result=await observePublicRepo("example/demo",f.fetcher);
 assert.equal(f.calls.length,2);
 assert.equal("ci" in result,false);
});

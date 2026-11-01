import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe} from "../src/core.mjs";
import {ownerName,observePublicOwner,observePublicRepo} from "../src/github-public.mjs";
import {sourceChanges,applySourceObservation,attachDiscoveredRepo} from "../src/source-observation.mjs";

const response=value=>({ok:true,headers:{get:()=>null},json:async()=>value});
const ownerFixture=(type="Organization")=>async url=>{
 if(url.endsWith("/users/example"))return response({type});
 if(url.includes("/repos?"))return response([{id:11,full_name:"example/project-a",default_branch:"main",pushed_at:"2026-11-01T00:00:00Z",private:false}]);
 throw Error("unexpected "+url);
};
test("public owner discovery respects user/org endpoints and exposes identity without readiness claims",async()=>{
 assert.equal(ownerName("https://github.com/example"),"example");
 for(const type of ["Organization","User"]){
  const seen=[];
  const fetcher=async(url)=>{seen.push(url);return ownerFixture(type)(url)};
  const found=await observePublicOwner("example",fetcher);
  assert.equal(found.repositories[0].id,11);
  assert.equal(found.complete,true);
  assert.equal(found.readiness,"not_assessed");
  assert.ok(seen.some(url=>url.includes(type==="Organization"?"/orgs/example/repos":"/users/example/repos")));
 }
});
test("source deltas detect renames via stable GitHub ID and revisions by SHA",()=>{
 const owner={scope:"owner",complete:true,repositories:[{id:11,name:"example/old",defaultBranch:"main",pushedAt:"A",archived:false}]};
 const renamed={scope:"owner",complete:true,repositories:[{id:11,name:"example/new",defaultBranch:"main",pushedAt:"B",archived:false},{id:12,name:"example/other"}]};
 const delta=sourceChanges(owner,renamed);
 assert.deepEqual(delta.renamed,[{from:"example/old",to:"example/new"}]);
 assert.deepEqual(delta.added,["example/other"]);
 assert.deepEqual(delta.changed,["example/new"]);
 const previous={scope:"repository",complete:true,branches:["main","old"],branchHeads:{main:"abc",old:"def"}};
 const next={scope:"repository",complete:true,branches:["main","new"],branchHeads:{main:"xyz",new:"123"}};
 assert.deepEqual(sourceChanges(previous,next).removed,["old"]);
 assert.deepEqual(sourceChanges(previous,next).added,["new"]);
 assert.deepEqual(sourceChanges(previous,next).changed,["main"]);
 assert.equal(sourceChanges(previous,{...next,complete:false}).comparable,false);
});
test("owner selection attaches only explicitly approved public repository and leaves prior claims untouched",()=>{
 const p=createProject(empty(),{name:"Research",type:"research"});
 const owner=attach(p.state,p.id,"github_owner","example");
 const observed=applySourceObservation(owner.state,p.id,owner.id,{scope:"owner",complete:true,repositories:[{id:11,name:"example/project-a"}],observedAt:"2026-11-01T00:00:00Z"});
 const attached=attachDiscoveredRepo(observed.state,p.id,owner.id,"example/project-a");
 assert.equal(attached.state.projects[0].sources.length,2);
 assert.equal(attached.state.projects[0].sources[1].status,"never");
 assert.throws(()=>attachDiscoveredRepo(attached.state,p.id,owner.id,"example/project-a"),/already attached/);
});
test("partial owner enumeration never treats missing repositories as deletions",()=>{
 const previous={scope:"owner",complete:true,repositories:[{id:1,name:"example/a"}]};
 const next={scope:"owner",complete:false,repositories:[]};
 assert.equal(sourceChanges(previous,next).comparable,false);
 assert.deepEqual(sourceChanges(previous,next).removed,[]);
});
test("repo discovery records checked branch SHA but does not infer acceptance",async()=>{
 const mock=async url=>response(url.includes("/branches?")?[{name:"main",commit:{sha:"abc"}}]:{id:12,private:false,default_branch:"main"});
 const observation=await observePublicRepo("example/a",mock);
 assert.equal(observation.scope,"repository");
 assert.equal(observation.branchHeads.main,"abc");
 assert.equal(observation.readiness,"not_assessed");
});

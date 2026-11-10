import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,attach,serialize,deserialize} from "../src/core.mjs";
import {observePublicRepoWithTree,planPublicRefresh,reconcilePublicSources,
 publicSourceQueue} from "../src/public-refresh.mjs";
import {sourceChanges} from "../src/source-observation.mjs";
import {sourceReview} from "../src/source-review.mjs";

const shaA="a".repeat(40),shaB="b".repeat(40),
 treeA="c".repeat(40),treeB="d".repeat(40);
const ok=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const failed=status=>({ok:false,status,headers:{get:()=>null},json:async()=>({})});
const base="https://api.github.com/repos/example/demo";
function fixture(){
 const p=createProject(empty(),{name:"Demo",type:"engineering"});
 const a=attach(p.state,p.id,"github","example/demo",{branch:"work/dev"});
 return {state:a.state,pid:p.id,sid:a.id};
}
function api({sha=shaA,tree=treeA,folders=["src","docs"],files=["package.json"],
       rootStatus=200,truncated=false,complete=true}={}){
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(url===base)return ok({id:123,private:false,default_branch:"main"});
  if(url.startsWith(base+"/branches?"))return ok([
   {name:"main",commit:{sha:shaA}},
   {name:"work/dev",commit:{sha}},
   ...(!complete?Array.from({length:98},(_,i)=>({name:"other/"+i,commit:{sha:shaA}})):[])
  ]);
  if(url.startsWith(base+"/actions/runs?"))return ok({workflow_runs:[]});
  if(url===base+"/git/commits/"+sha)return ok({sha,tree:{sha:tree}});
  if(url===base+"/git/trees/"+tree)return rootStatus===200?
   ok({sha:tree,truncated,tree:[
    ...folders.map(path=>({path,type:"tree"})),
    ...files.map(path=>({path,type:"blob"}))
   ]}):failed(rootStatus);
  throw Error("Unexpected GitHub request "+url);
 };
 return {fetcher,calls};
}
const treeFrom=(sha,tree,folders,files,extra={})=>({
 status:"observed",branch:"work/dev",commitSha:sha,treeSha:tree,
 truncated:false,limited:false,folders,files,
 totalFolders:folders.length,totalFiles:files.length,detected:[],...extra
});
const observed=(sha,tree,folders,files,extra={})=>({
 scope:"repository",repository:"example/demo",complete:true,
 defaultBranch:"main",branches:["main","work/dev"],
 branchHeads:{main:shaA,"work/dev":sha},ci:{state:"none",branch:"work/dev"},
 structure:treeFrom(sha,tree,folders,files),...extra
});

test("Normal refresh observes exact selected branch root and Actions in one bounded source group",async()=>{
 const {state}=fixture(),firstApi=api();
 const first=await reconcilePublicSources(state,{repoObserver:(n,b)=>
  observePublicRepoWithTree(n,b,firstApi.fetcher)});
 assert.equal(first.report.requests,1);
 assert.equal(first.report.updated,1);
 assert.equal(first.report.failed,0);
 assert.equal(firstApi.calls.length,5);
 assert.ok(firstApi.calls.includes(base+"/git/commits/"+shaA));
 assert.ok(firstApi.calls.includes(base+"/git/trees/"+treeA));
 assert.ok(firstApi.calls.some(x=>x.includes("branch=work%2Fdev")));
 const source=first.state.projects[0].sources[0];
 assert.equal(source.status,"ok");
 assert.equal(source.summary.structure.status,"observed");
 assert.equal(source.summary.structure.commitSha,shaA);
 assert.deepEqual(source.summary.structure.folders,["docs","src"]);
 assert.equal(source.summary.ci.state,"none");
 assert.equal(source.summary.readiness,"not_assessed");
 assert.deepEqual(source.summary.changes.added,[]);
 assert.deepEqual(deserialize(serialize(first.state)),first.state);
 assert.deepEqual(state.projects[0].items,[]);
});

test("Refresh after commit change reports observed root differences, never fabricated work",async()=>{
 const {state}=fixture();
 const first=await reconcilePublicSources(state,{repoObserver:(n,b)=>
  observePublicRepoWithTree(n,b,api().fetcher)});
 const follow=api({sha:shaB,tree:treeB,folders:["src","lib"],
  files:["README.md","package.json"]});
 const refreshed=await reconcilePublicSources(first.state,{
  plan:planPublicRefresh(first.state,{maxAgeMs:0}),
  repoObserver:(n,b)=>observePublicRepoWithTree(n,b,follow.fetcher)
 });
 const source=refreshed.state.projects[0].sources[0];
 assert.equal(source.summary.structure.commitSha,shaB);
 assert.deepEqual(source.summary.structure.folders,["lib","src"]);
 assert.deepEqual(source.summary.changes.structureDelta,{
  branch:"work/dev",previousSha:shaA,currentSha:shaB,
  addedFolders:["lib"],removedFolders:["docs"],
  addedFiles:["README.md"],removedFiles:[]});
 const review=sourceReview(source);
 assert.equal(review.structureDelta.total,3);
 assert.equal(review.authority,"OBSERVATION_ONLY");
 assert.equal(publicSourceQueue(refreshed.state).changed,1);
 assert.equal(source.summary.readiness,"not_assessed");
 assert.deepEqual(source.summary.ci,{state:"none",branch:"work/dev"});
 assert.deepEqual(refreshed.state.projects[0].items,[]);
 assert.deepEqual(refreshed.state.projects[0].decisions,[]);
 assert.deepEqual(deserialize(serialize(refreshed.state)),refreshed.state);
 assert.equal(first.state.projects[0].sources[0].summary.structure.commitSha,shaA);
});

test("Temporary tree failure retains only same-SHA cached structure, not stale structure after drift",async()=>{
 const {state}=fixture();
 const first=await reconcilePublicSources(state,{repoObserver:(n,b)=>
  observePublicRepoWithTree(n,b,api().fetcher)});
 const outage=api({rootStatus:403});
 const same=await reconcilePublicSources(first.state,{
  plan:planPublicRefresh(first.state,{maxAgeMs:0}),
  repoObserver:(n,b)=>observePublicRepoWithTree(n,b,outage.fetcher)});
 assert.equal(same.report.failed,0);
 assert.equal(same.state.projects[0].sources[0].summary.structure.commitSha,shaA);
 assert.equal(same.state.projects[0].sources[0].status,"ok");
 const moved=api({sha:shaB,tree:treeB,rootStatus:403});
 const changed=await reconcilePublicSources(same.state,{
  plan:planPublicRefresh(same.state,{maxAgeMs:0}),
  repoObserver:(n,b)=>observePublicRepoWithTree(n,b,moved.fetcher)
 });
 const source=changed.state.projects[0].sources[0];
 assert.equal(source.status,"ok");
 assert.equal(source.summary.structure.status,"unavailable");
 assert.equal(source.summary.structure.branch,"work/dev");
 assert.equal(source.summary.changes.structureDelta,undefined);
 assert.equal(source.summary.branchHeads["work/dev"],shaB);
 assert.equal(source.summary.changes.revisions[0].currentSha,shaB);
 assert.equal(source.summary.readiness,"not_assessed");
 assert.equal(sourceReview(source).structureDelta,null);
 assert.equal(publicSourceQueue(changed.state).changed,1);
});

test("Root deltas are valid with partial branch lists but never prove deletions from partial root views",()=>{
 const before=observed(shaA,treeA,["src","old"],["package.json"],{complete:false});
 const after=observed(shaB,treeB,["src","new"],["package.json"],{complete:false});
 const comparableRoot=sourceChanges(before,after);
 assert.equal(comparableRoot.comparable,false);
 assert.deepEqual(comparableRoot.structureDelta.addedFolders,["new"]);
 assert.deepEqual(comparableRoot.structureDelta.removedFolders,["old"]);
 for(const key of ["truncated","limited"]){
  const partial=structuredClone(after);partial.structure[key]=true;
  assert.equal(sourceChanges(before,partial).structureDelta,undefined);
 }
 const switched=structuredClone(after);switched.structure.branch="main";
 assert.equal(sourceChanges(before,switched).structureDelta,undefined);
 const bad=structuredClone(after);bad.structure.commitSha="invalid";
 assert.equal(sourceChanges(before,bad).structureDelta,undefined);
 const same=structuredClone(before);same.structure.treeSha=treeB;
 assert.equal(sourceChanges(before,same).structureDelta,undefined);
});

test("UI shows updated root composition, exact revisions, and separate missing-data states",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/review\.structureDelta\.addedFolders\.length/);
 assert.match(ui,/review\.structureDelta\.removedFiles\.length/);
 assert.match(ui,/aria-label="Изменения в составе проекта"/);
 assert.match(ui,/aria-label="Структура источника недоступна"/);
 assert.match(ui,/Отсутствие сведений не означает удаление файлов/);
 assert.match(ui,/Структура получена из GitHub для редакции/);
 assert.match(ui,/Каталог отсутствует в новой редакции/);
 assert.match(ui,/atlas-connected-structure/);
 assert.match(ui,/не становятся работами/);
});

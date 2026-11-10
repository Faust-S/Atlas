import test from "node:test";
import assert from "node:assert/strict";
import {empty,serialize,deserialize} from "../src/core.mjs";
import {observePublicRootTree} from "../src/github-public.mjs";
import {projectConnectionAddress,inspectPublicProject,applyPublicProjectPreview,
 findConnectedRepository,findConnectedOwner} from "../src/project-onboarding.mjs";

const a="a".repeat(40),b="b".repeat(40);
const ok=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
const missing=status=>({ok:false,status,headers:{get:()=>null},json:async()=>({})});
function github({kind="repository",privateRepo=false,treeError=false,partial=false}={}){
 const calls=[];
 const fetcher=async url=>{
  calls.push(url);
  if(kind==="repository"){
   if(url.endsWith("/repos/demo/widget"))
    return ok({id:11,private:privateRepo,default_branch:"main",pushed_at:"2026-11-10T12:00:00Z"});
   if(url.includes("/branches?"))
    return ok([{name:"main",commit:{sha:a}}]);
   if(url.includes("/actions/runs?"))
    return ok({workflow_runs:[]});
   if(url.endsWith("/git/trees/main"))
    return treeError?missing(403):ok({sha:b,truncated:partial,tree:[
     {path:"src",type:"tree"},{path:"docs",type:"tree"},
     {path:"README.md",type:"blob"},{path:"package.json",type:"blob"},
     {path:"Cargo.toml",type:"blob"},{path:"src/index.js",type:"blob"},
     {path:"src",type:"tree"},{path:"irrelevant",type:"commit"}
    ]});
  }else{
   if(url.endsWith("/users/demo"))return ok({type:"Organization"});
   if(url.includes("/orgs/demo/repos?"))
    return ok([
     {id:11,full_name:"demo/widget",default_branch:"main",archived:false,private:false},
     {id:12,full_name:"demo/server",default_branch:"release/v1",archived:false,private:false},
     {id:13,full_name:"demo/private",default_branch:"main",private:true}
    ]);
  }
  throw Error("Unexpected GitHub address "+url);
 };
 return {fetcher,calls};
}
test("GitHub public project entry accepts only a precise repository or owner URL",()=>{
 assert.deepEqual(projectConnectionAddress("https://github.com/demo/widget.git"),{
  kind:"repository",locator:"demo/widget",url:"https://github.com/demo/widget"});
 assert.deepEqual(projectConnectionAddress("https://github.com/demo"),{
  kind:"owner",locator:"demo",url:"https://github.com/demo"});
 assert.equal(projectConnectionAddress("demo/widget").kind,"repository");
 for(const item of ["https://github.com/demo/widget/issues/4",
  "https://gitlab.com/demo/widget","https://github.com/demo/widget?token=test","","demo/../widget"]){
  assert.throws(()=>projectConnectionAddress(item));
 }
});
test("Public repository preview reads real root entries and never infers fake tasks",async()=>{
 const mock=github();
 const preview=await inspectPublicProject("https://github.com/demo/widget",mock.fetcher);
 assert.equal(preview.kind,"repository");
 assert.equal(preview.summary.scope,"repository");
 assert.equal(preview.summary.readiness,"not_assessed");
 assert.equal(preview.structure.status,"observed");
 assert.equal(preview.structure.commitSha,a);
 assert.equal(preview.structure.treeSha,b);
 assert.deepEqual(preview.structure.folders,["docs","src"]);
 assert.deepEqual(preview.structure.files,["Cargo.toml","package.json","README.md"]);
 assert.deepEqual(preview.structure.detected,["Cargo.toml","package.json","README.md"]);
 assert.equal(mock.calls.length,4);
 assert.ok(mock.calls.every(url=>url.startsWith("https://api.github.com/repos/demo/widget")));
 const before=empty(),value=serialize(before);
 const imported=applyPublicProjectPreview(before,preview);
 assert.equal(serialize(before),value);
 assert.equal(imported.createdIds.length,1);
 const project=imported.state.projects[0];
 assert.equal(project.name,"widget");
 assert.equal(project.type,"engineering");
 assert.deepEqual([project.stages,project.items,project.dependencies,project.decisions],[[],[],[],[]]);
 assert.equal(project.sources[0].status,"ok");
 assert.equal(project.sources[0].branch,"main");
 assert.equal(project.sources[0].summary.structure.treeSha,b);
 assert.deepEqual(deserialize(serialize(imported.state)),imported.state);
 assert.equal(findConnectedRepository(imported.state,"demo/widget").length,1);
 const repeat=applyPublicProjectPreview(imported.state,preview,{name:"Another name"});
 assert.equal(repeat.connected,false);
 assert.strictEqual(repeat.state,imported.state);
 assert.equal(repeat.primaryId,imported.primaryId);
});
test("Public root inspection remains bounded and reports incomplete trees",async()=>{
 const mock=github({partial:true});
 const tree=await observePublicRootTree("demo/widget","main",mock.fetcher,{maxEntries:1});
 assert.equal(tree.truncated,true);
 assert.equal(tree.limited,true);
 assert.equal(tree.totalFolders,2);
 assert.equal(tree.totalFiles,3);
 assert.equal(tree.folders.length,1);
 assert.equal(tree.files.length,1);
 assert.throws(()=>observePublicRootTree("demo/widget","main",mock.fetcher,{maxEntries:121}));
});
test("Private GitHub repositories are not silently described as public projects",async()=>{
 const mock=github({privateRepo:true});
 await assert.rejects(inspectPublicProject("demo/widget",mock.fetcher),/Private/);
 assert.equal(mock.calls.length,1);
});
test("A temporary tree failure does not turn repository discovery into a false readiness signal",async()=>{
 const mock=github({treeError:true});
 const p=await inspectPublicProject("demo/widget",mock.fetcher);
 assert.equal(p.structure.status,"unavailable");
 assert.match(p.structure.reason,/403/);
 assert.equal(p.summary.readiness,"not_assessed");
 const result=applyPublicProjectPreview(empty(),p,{name:"Custom name"});
 assert.equal(result.state.projects[0].name,"Custom name");
 assert.equal("structure" in result.state.projects[0].sources[0].summary,false);
});
test("Owner preview creates an explicitly selected subset using existing projects",async()=>{
 const mock=github({kind:"owner"});
 const preview=await inspectPublicProject("https://github.com/demo",mock.fetcher);
 assert.equal(preview.kind,"owner");
 assert.equal(preview.summary.complete,true);
 assert.deepEqual(preview.summary.repositories.map(x=>x.name),["demo/server","demo/widget"]);
 assert.throws(()=>applyPublicProjectPreview(empty(),preview),/Выберите/);
 assert.throws(()=>applyPublicProjectPreview(empty(),preview,{selectedRepositories:["demo/other"]}),/отсутствует/);
 assert.throws(()=>applyPublicProjectPreview(empty(),preview,{selectedRepositories:["other/widget"]}),/чужой/);
 assert.throws(()=>applyPublicProjectPreview(empty(),preview,{selectedRepositories:["demo/widget","demo/widget"]}),/Повторный/);
 const result=applyPublicProjectPreview(empty(),preview,{
  name:"Product portfolio",selectedRepositories:["demo/widget","demo/server"]});
 assert.equal(result.state.projects.length,3);
 assert.equal(result.createdIds.length,2);
 assert.equal(result.state.projects.find(p=>p.id===result.ownerId).name,"Product portfolio");
 assert.equal(result.state.projects.find(p=>p.id===result.ownerId).sources[0].kind,"github_owner");
 assert.equal(findConnectedOwner(result.state,"demo").id,result.ownerId);
 assert.deepEqual(result.state.projects.filter(p=>p.id!==result.ownerId)
  .map(p=>p.sources[0].kind),["github","github"]);
 assert.deepEqual(result.state.projects.filter(p=>p.id!==result.ownerId)
  .map(p=>p.items.length),[0,0]);
 const repeat=applyPublicProjectPreview(result.state,preview,{selectedRepositories:["demo/widget","demo/server"]});
 assert.equal(repeat.state.projects.length,3);
 assert.equal(repeat.createdIds.length,0);
 assert.equal(repeat.existingIds.length,2);
 assert.deepEqual(deserialize(serialize(repeat.state)),repeat.state);
});
test("Mismatched or fabricated preview input never changes a portfolio",async()=>{
 const p=await inspectPublicProject("demo/widget",github().fetcher);
 const s=empty(),old=serialize(s);
 assert.throws(()=>applyPublicProjectPreview(s,{...p,locator:"foreign/widget"}),/не соответствует/);
 assert.throws(()=>applyPublicProjectPreview(s,{...p,summary:{...p.summary,complete:undefined}}),/предпросмотр/);
 assert.throws(()=>applyPublicProjectPreview(s,p,{name:"x".repeat(161)}),/Некорректный/);
 assert.equal(serialize(s),old);
});

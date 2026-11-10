import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {githubPortfolioCatalog,createProjectFromGitHubCatalog,githubPortfolioOverview,
 filterGithubPortfolioOverview} from "../src/ecosystem.mjs";

function fixture({complete=true,owner="Faust-S"}={}){
 let s=empty();
 const root=createProject(s,{name:"IWXA",type:"engineering",goal:"One portfolio",owner:""});
 s=root.state;
 const binding=attach(s,root.id,"github_owner",owner);
 s=binding.state;
 const listing={scope:"owner",owner,complete,observedAt:"2026-11-10T10:00:00Z",repositories:[
  {id:1,name:owner+"/Atlas",defaultBranch:"main",pushedAt:"2026-11-10T09:00:00Z",archived:false},
  {id:2,name:owner+"/Center",defaultBranch:"release/0.3",pushedAt:null,archived:false},
  {id:3,name:owner+"/Archive",defaultBranch:null,archived:true},
  // Never accept unrelated names or duplicates from a malformed source cache.
  {id:4,name:"Another/Foreign",defaultBranch:"main"},
  {id:5,name:owner+"/Atlas",defaultBranch:"main"}
 ]};
 s=observe(s,root.id,binding.id,"ok",listing);
 return {s,rootId:root.id,sourceId:binding.id};
}
test("GitHub owner catalogue indexes actual saved Atlas bindings, not invented readiness",()=>{
 const {s,rootId,sourceId}=fixture({complete:false});
 const model=githubPortfolioCatalog(s,rootId,sourceId);
 assert.equal(model.total,3);
 assert.equal(model.matched,3);
 assert.equal(model.connected,0);
 assert.equal(model.observed,true);
 assert.equal(model.complete,false);
 assert.deepEqual(model.rows.map(r=>r.name),
  ["Faust-S/Atlas","Faust-S/Center","Faust-S/Archive"]);
 assert.ok(model.rows.every(r=>r.canCreate));
 assert.equal(githubPortfolioCatalog(s,rootId,sourceId,{query:"Center"}).rows[0].defaultBranch,
  "release/0.3");
 assert.equal(githubPortfolioCatalog(s,rootId,sourceId,{query:"no such"}).matched,0);
 assert.equal(githubPortfolioCatalog(s,rootId,sourceId,{limit:1}).remaining,2);
});
test("One explicit import makes a standard editable project with the original GitHub binding",()=>{
 const {s,rootId,sourceId}=fixture();
 const result=createProjectFromGitHubCatalog(s,rootId,sourceId,"Faust-S/Center");
 assert.equal(result.created,true);
 assert.equal(s.projects.length,1);
 assert.equal(result.state.projects.length,2);
 const p=result.state.projects.find(x=>x.id===result.projectId);
 assert.equal(p.type,"engineering");
 assert.equal(p.status,"planned");
 assert.deepEqual(p.items,[]);
 assert.equal(p.sources.length,1);
 assert.equal(p.sources[0].kind,"github");
 assert.equal(p.sources[0].branch,"release/0.3");
 assert.equal(p.sources[0].status,"never");
 assert.equal(p.sources[0].summary,null);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 const model=githubPortfolioCatalog(result.state,rootId,sourceId);
 assert.equal(model.connected,1);
 assert.equal(model.rows[1].projects[0].id,result.projectId);
 const repeat=createProjectFromGitHubCatalog(result.state,rootId,sourceId,"Faust-S/Center");
 assert.equal(repeat.created,false);
 assert.equal(repeat.state,result.state);
 assert.equal(repeat.projectId,result.projectId);
});
test("Outdated and cross-owner catalogues never confer project creation authority",()=>{
 const {s,rootId,sourceId}=fixture();
 assert.throws(()=>createProjectFromGitHubCatalog(s,rootId,sourceId,"Another/Foreign"),/владельцу/);
 assert.throws(()=>createProjectFromGitHubCatalog(s,rootId,sourceId,"Faust-S/Unknown"),/отсутствует/);
 const broken=structuredClone(s);broken.projects[0].sources[0].status="error";
 assert.equal(githubPortfolioCatalog(broken,rootId,sourceId).observed,false);
 assert.ok(githubPortfolioCatalog(broken,rootId,sourceId).rows.every(x=>!x.canCreate));
 assert.throws(()=>createProjectFromGitHubCatalog(broken,rootId,sourceId,"Faust-S/Atlas"),/обновите/);
 const mismatched=structuredClone(s);mismatched.projects[0].sources[0].summary.owner="Someone";
 assert.equal(githubPortfolioCatalog(mismatched,rootId,sourceId).total,0);
 assert.throws(()=>createProjectFromGitHubCatalog(mismatched,rootId,sourceId,"Faust-S/Atlas"),/обновите/);
});
test("Cross-product overview uses the saved plan, links and observations only",()=>{
 const {s,rootId,sourceId}=fixture();
 const linked=createProjectFromGitHubCatalog(s,rootId,sourceId,"Faust-S/Atlas");
 const view=githubPortfolioOverview(linked.state);
 assert.equal(view.totals.projects,2);
 assert.equal(view.totals.connected,2);
 assert.equal(view.totals.dependencies,0);
 assert.equal(view.totals.requirements,0);
 assert.equal(view.owners.includes("faust-s"),true);
 assert.equal(filterGithubPortfolioOverview(view,{owner:"faust-s"}).length,2);
 assert.equal(filterGithubPortfolioOverview(view,{query:"atlas"}).length,1);
 assert.equal(filterGithubPortfolioOverview(view,{query:"Missing"}).length,0);
 assert.throws(()=>filterGithubPortfolioOverview(view,{owner:"unlisted"}),/Неизвестный/);
 assert.deepEqual(linked.state.projects[0],s.projects[0]);
});

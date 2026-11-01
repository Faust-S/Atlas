// Scaled public-source Atlas portfolio tests. Public repo IDs/SHAs are sampled, all goals/tasks are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import {performance} from "node:perf_hooks";
import {makePublicPortfolio,publicInventory} from "./fixtures/public-portfolio.mjs";
import {serialize,deserialize,validate} from "../src/core.mjs";
import {portfolioSchedule} from "../src/portfolio-schedule.mjs";
import {portfolioCascade} from "../src/portfolio-cascade.mjs";
import {projectImpact} from "../src/impact.mjs";
import {buildPortfolioCommand,renderPortfolioCommandRows,filterPortfolioCommand} from "../src/portfolio-command.mjs";
import {observePublicRepo} from "../src/github-public.mjs";
import {sourceChanges} from "../src/source-observation.mjs";

function clock(work){
 const start=performance.now(),value=work();
 return {value,ms:Number((performance.now()-start).toFixed(2))};
}
test("public metadata is explicit, real IDs are unique, no false full enumeration",()=>{
 assert.equal(publicInventory.repositories.length,12);
 assert.equal(new Set(publicInventory.repositories.map(x=>x.id)).size,12);
 for(const r of publicInventory.repositories){
  assert.match(r.defaultSha,/^[0-9a-f]{40}$/i);
  assert.match(r.fullName,/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i);
 }
 const fixture=makePublicPortfolio();
 assert.equal(fixture.projects.length,12);
 assert.ok(fixture.projects.every(x=>x.sources[0].kind==="github"));
 assert.ok(fixture.projects.every(x=>x.sources[0].summary?.complete!==true));
 assert.ok(fixture.projects.every(x=>x.findings.every(f=>f.note.includes("SYNTHETIC"))));
 assert.ok(fixture.projects.every(x=>x.targets.every(t=>t.sourceNote.includes("SYNTHETIC"))));
 assert.equal(validate(fixture),true);
});
test("live-sampled public SHA can be reconciled, but partial branches cannot imply deletion",async()=>{
 const repo=publicInventory.repositories[0],last=repo.defaultSha,newHead="f".repeat(40);
 const response=data=>({ok:true,headers:{get:()=>null},json:async()=>data});
 const fetcher=async url=>response(url.includes("/branches?")?
  [{name:repo.defaultBranch,commit:{sha:last}}]:
  {id:repo.id,private:false,default_branch:repo.defaultBranch});
 const observation=await observePublicRepo(repo.fullName,fetcher,{maxPages:1});
 assert.equal(observation.branchHeads[repo.defaultBranch],last);
 assert.equal(observation.complete,true); // Complete only for this simulated single-branch response.
 const changed={...observation,branchHeads:{[repo.defaultBranch]:newHead}};
 assert.deepEqual(sourceChanges(observation,changed).changed,[repo.defaultBranch]);
 const partial={...changed,complete:false,branches:[]};
 assert.deepEqual(sourceChanges(observation,partial).removed,[]);
 assert.equal(sourceChanges(observation,partial).comparable,false);
});
test("12/60/120 project tiers: lossless JSON, DAG/CPM, command queue, bounded render",()=>{
 for(const projects of [12,60,120]){
  const data=makePublicPortfolio({projects,workPerProject:12,targetsPerProject:4});
  const a=clock(()=>validate(data));
  const serialized=clock(()=>serialize(data));
  const readback=clock(()=>deserialize(serialized.value));
  assert.deepEqual(readback.value,data);
  assert.equal(readback.value.projects.length,projects);
  const schedule=clock(()=>portfolioSchedule(data));
  assert.equal(schedule.value.totals.projects,projects);
  assert.equal(schedule.value.rows.filter(x=>x.projectedFinish!==null).length,projects);
  const cascades=clock(()=>portfolioCascade(data,projectImpact));
  assert.equal(cascades.value.projects.length,projects);
  assert.equal(cascades.value.byId.get(data.projects[0].id).downstreamAll.length,projects-1);
  const summary=clock(()=>buildPortfolioCommand(data));
  assert.equal(summary.value.rows.length,projects);
  assert.equal(filterPortfolioCommand(summary.value,{filter:"blocked"}).length,projects);
  const html=clock(()=>renderPortfolioCommandRows(summary.value));
  assert.equal((html.value.match(/class="atlas-command-row"/g)||[]).length,projects);
  assert.ok(html.value.includes("Public study"));
  const sizeBytes=Buffer.byteLength(serialized.value,"utf8");
  const rssMb=Number((process.memoryUsage().rss/1048576).toFixed(1));
  const result={tier:projects,works:projects*12,targets:projects*4,
    sources:projects,edges:projects-1,sizeBytes,rssMb,
    durationMs:{validate:a.ms,serialize:serialized.ms,deserialize:readback.ms,
     cpm:schedule.ms,cascade:cascades.ms,command:summary.ms,html:html.ms}};
  console.log("ATLAS_SCALE_NODE "+JSON.stringify(result));
  // Generous safety bound, not a product performance SLA.
  assert.ok(summary.ms<90000 && cascades.ms<90000,"Projection exceeded 90-second safety bound");
 }
});

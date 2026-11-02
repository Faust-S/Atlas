import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createItem,createDecision,connect,attach,serialize,deserialize} from "../src/core.mjs";
import {addTarget,recordFinding} from "../src/trace.mjs";
import {addPortfolioLink} from "../src/portfolio.mjs";
import {prepareImportedSnapshot} from "../desktop/src/import-snapshot.mjs";

test("desktop 0.1 JSON import keeps IDs, work DAG, sources, evidence, decisions, portfolio links",()=>{
 const first=createProject(empty(),{name:"Legacy research",type:"research"});
 const second=createProject(first.state,{name:"Dependent project",type:"team"});
 let legacy=second.state;
 const a=createItem(legacy,first.id,{title:"Experiment"});
 const b=createItem(a.state,first.id,{title:"Evaluate"});
 legacy=connect(b.state,first.id,a.id,b.id);
 legacy=createDecision(legacy,first.id,"Keep methodology and archive evidence");
 legacy=addTarget(legacy,first.id,{title:"Qualified evidence",desired:"Independent evaluation",intent:"committed"}).state;
 const source=attach(legacy,first.id,"github","example/public-repo");
 legacy=source.state;
 const target=legacy.projects[0].targets[0];
 legacy=recordFinding(legacy,first.id,{
  targetId:target.id,result:"partial",level:"test",sourceId:source.id,
  ref:"main",revision:"a".repeat(40),note:"Preliminary laboratory finding"
 }).state;
 legacy=addPortfolioLink(legacy,{from:first.id,to:second.id,note:"Research prerequisite"});
 legacy.importProvenance={source:"legacy-archive",originalRevision:2,importedAt:"2026-10-01T00:00:00.000Z"};
 const imported=JSON.parse(serialize(legacy));
 const current=createProject(empty(),{name:"Existing local portfolio"}).state;
 const oldCurrent=serialize(current),oldLegacy=serialize(legacy);
 const {snapshot,originalRevision}=prepareImportedSnapshot(current,imported,"2026-11-02T00:00:00.000Z");
 assert.equal(originalRevision,legacy.revision);
 assert.equal(snapshot.revision,Math.max(current.revision,legacy.revision)+1);
 assert.deepEqual(snapshot.projects,legacy.projects);
 assert.deepEqual(snapshot.portfolioLinks,legacy.portfolioLinks);
 assert.deepEqual(snapshot.importProvenance.previous,legacy.importProvenance);
 assert.deepEqual(deserialize(JSON.stringify(snapshot)),snapshot);
 assert.equal(serialize(current),oldCurrent);
 assert.equal(serialize(legacy),oldLegacy);
});
test("invalid 0.1 JSON cannot replace valid native portfolio draft",()=>{
 const current=createProject(empty(),{name:"Keep this project"}).state;
 const saved=serialize(current);
 assert.throws(()=>prepareImportedSnapshot(current,{schema:"atlas.project/1",revision:0,projects:[{id:"invalid"}]}));
 assert.equal(serialize(current),saved);
 const prepared=prepareImportedSnapshot(current,empty());
 assert.equal(prepared.snapshot.revision,current.revision+1);
 assert.equal(serialize(current),saved);
});
test("desktop has recoverable lists and rejects import on stale native or edited draft",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/setPortfolioLimit\(n=>Math\.min\(filtered\.length,n\+150\)\)/);
 assert.match(ui,/setWorkLimit\(n=>Math\.min\(filteredWork\.length,n\+200\)\)/);
 assert.match(ui,/filteredWork\.slice\(0,workLimit\)/);
 assert.match(ui,/latestSnapshot\.current!==startedWith\|\|dirtyRef\.current/);
 assert.match(ui,/head\.generation!==generation/);
});

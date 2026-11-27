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
 const {snapshot,originalRevision,summary}=prepareImportedSnapshot(current,imported,"2026-11-02T00:00:00.000Z");
 assert.equal(originalRevision,legacy.revision);
 assert.equal(snapshot.revision,Math.max(current.revision,legacy.revision)+1);
 assert.deepEqual(snapshot.projects,legacy.projects);
 assert.deepEqual(snapshot.portfolioLinks,legacy.portfolioLinks);
 assert.deepEqual(snapshot.importProvenance.previous,legacy.importProvenance);
 assert.equal(summary.current.projects,1);
 assert.equal(summary.incoming.projects,2);
 assert.equal(summary.incoming.works,2);
 assert.equal(summary.incoming.decisions,1);
 assert.equal(summary.incoming.findings,1);
 assert.equal(summary.incoming.links,1);
 assert.equal(summary.removed,1);
 assert.equal(summary.added,2);
 assert.equal(summary.matchingIds,0);
 assert.deepEqual(summary.removedExamples,["Existing local portfolio"]);
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
 assert.equal(prepared.summary.incoming.projects,0);
 assert.equal(prepared.summary.removed,1);
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


test("preview of 130-project import is bounded, accurate and non-mutating",()=>{
 let incoming=empty();
 for(let i=0;i<130;i++)incoming=createProject(incoming,{name:"Project "+i}).state;
 const current=createProject(empty(),{name:"Existing local data"}).state;
 const before=serialize(current),archive=serialize(incoming);
 const result=prepareImportedSnapshot(current,incoming,"2026-11-03T00:00:00.000Z");
 assert.equal(result.summary.incoming.projects,130);
 assert.equal(result.summary.added,130);
 assert.equal(result.summary.removed,1);
 assert.equal(result.summary.addedExamples.length,6);
 assert.equal(result.summary.removedExamples.length,1);
 assert.equal(result.snapshot.projects.length,130);
 assert.equal(serialize(current),before);
 assert.equal(serialize(incoming),archive);
});

test("installed JSON import preview keeps confirmation visible while details scroll",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 const acceptance=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.match(ui,/className="atlas-close-dialog atlas-import-dialog"/);
 assert.match(ui,/className="atlas-import-body"/);
 assert.match(ui,/className="button-row atlas-import-actions"/);
 assert.match(css,/\.atlas-import-dialog\{[^}]*display:flex;flex-direction:column;overflow:hidden/);
 assert.match(css,/\.atlas-import-body\{[^}]*min-height:0;overflow-y:auto/);
 assert.match(css,/\.atlas-import-actions\{[^}]*flex:0 0 auto/);
 assert.match(acceptance,/ATLAS_IMPORT_CONFIRM_VISIBLE_PASS/);
 assert.match(acceptance,/ATLAS_IMPORT_PRE_SAVE_NATIVE_UNCHANGED_PASS/);
});

test("installed GUI qualifies R5 only after authentic legacy import restart",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.ok(script.indexOf("ATLAS_INSTALLED_LEGACY_01_IMPORT_RESTART_PASS")<
  script.indexOf("phase=\"large-portfolio-open\""));
 assert.match(script,/ATLAS_R5_PORTFOLIO_JSON/);
 assert.match(script,/ATLAS_INSTALLED_R5_GUI_IMPORT_READBACK_PASS/);
 assert.match(script,/ATLAS_INSTALLED_R5_GUI_REOPEN_PASS/);
 assert.match(script,/expected_works==1200 and expected_links==300/);
});

test("installed import confirmation is keyboard reachable and exposes failures inside modal",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const driver=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
 assert.match(ui,/autoFocus=\{autoFocus\}/);
 assert.match(ui,/autoFocus disabled=\{busy\} onClick=\{\(\)=>setPendingImport\(null\)\}/);
 assert.match(ui,/Не удалось подтвердить импорт: \{error\}/);
 assert.match(ui,/Импорт пока нельзя применить/);
 assert.match(driver,/ATLAS_IMPORT_CONFIRM_KEYBOARD_ENTER/);
 assert.match(driver,/ATLAS_IMPORT_CONFIRMED_DRAFT_READY_PASS/);
 assert.equal((driver.match(/confirm_import_draft\(\)/g)||[]).length,4);
});

// Add-only archive route: no replacement of the existing Atlas owner head.
test('independent .iwxa projects can be appended without replacing existing Work or references',async()=>{
 const {prepareAddedSnapshot}=await import('../desktop/src/import-snapshot.mjs');
 const {empty,createProject,createItem,serialize}=await import('../src/core.mjs');
 const old=createProject(empty(),{name:'Existing project',type:'business'});
 const oldWork=createItem(old.state,old.id,{title:'Existing Work'});
 const fresh=createProject(empty(),{name:'Center preparation',type:'business'});
 const freshWork=createItem(fresh.state,fresh.id,{title:'Prepared Work'});
 const original=serialize(oldWork.state),incoming=serialize(freshWork.state);
 const result=prepareAddedSnapshot(oldWork.state,freshWork.state,'2026-11-27T12:00:00.000Z');
 assert.equal(result.addedProjects,1);
 assert.equal(result.addedWorks,1);
 assert.equal(result.snapshot.revision,Math.max(oldWork.state.revision,freshWork.state.revision)+1);
 assert.deepEqual(result.snapshot.projects[0],oldWork.state.projects[0]);
 assert.deepEqual(result.snapshot.projects[1],freshWork.state.projects[0]);
 assert.equal(serialize(oldWork.state),original);
 assert.equal(serialize(freshWork.state),incoming);
 assert.throws(()=>prepareAddedSnapshot(result.snapshot,freshWork.state),/уже существуют/);
});
test('append preserves distinct resource and calendar definitions and rejects conflicting IDs',async()=>{
 const {prepareAddedSnapshot}=await import('../desktop/src/import-snapshot.mjs');
 const {empty,createProject,createItem,createWorkCalendar}=await import('../src/core.mjs');
 const {addPlanningResource}=await import('../src/resource-planning.mjs');
 const a=createProject(empty(),{name:'A',type:'business'});
 const ra=addPlanningResource(a.state,{label:'Crane A',capacityPct:100});
 const b=createProject(empty(),{name:'B',type:'business'});
 const rb=addPlanningResource(b.state,{label:'Crane B',capacityPct:100});
 const wb=createItem(rb.state,b.id,{title:'Build',resourceId:rb.id});
 const merged=prepareAddedSnapshot(ra.state,wb.state).snapshot;
 assert.deepEqual(merged.resources.map(r=>r.id),[ra.id,rb.id]);
 assert.equal(merged.projects[1].items[0].resourceId,rb.id);
 const conflict=structuredClone(wb.state);
 conflict.resources[0].id=ra.id;conflict.projects[0].items[0].resourceId=ra.id;
 assert.throws(()=>prepareAddedSnapshot(ra.state,conflict),/Несовместимое определение/);
 assert.throws(()=>prepareAddedSnapshot(ra.state,{...wb.state,unrecognizedRoot:true}),/нельзя безопасно объединить/);
});

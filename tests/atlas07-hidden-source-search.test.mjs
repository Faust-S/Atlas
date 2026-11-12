import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editItem,serialize,deserialize} from "../src/core.mjs";
import {projectSourcePlanProjection,projectSourceFolderSearch,folderLinkAction,
 selectedSourceFolder} from "../src/project-organization.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";

const SHA="a".repeat(40);
const fixture=()=>{
 const base=atlas06VisualPortfolio(),projectId=base.projects[0].id;
 const state=editItem(base,projectId,"visual-work-0-0",{sourceId:null});
 return {state,projectId,project:state.projects[0]};
};

test("Search finds a current catalog omitted from the compact project map without modifying saved plan",()=>{
 const {state,projectId,project}=fixture();
 const before=serialize(state);
 const compact=projectSourcePlanProjection(state,projectId,{
  maxSources:2,maxFoldersPerSource:4,maxWorksPerFolder:3,maxOtherWorks:6,maxUnassignedStages:4
 });
 assert.equal(compact.sources.some(source=>source.sourceId==="visual-source-0"),false);
 const found=projectSourceFolderSearch(project,"project-0 directory-01");
 assert.equal(found.total,1);
 assert.equal(found.hidden,0);
 assert.deepEqual(found.matches[0],{
  sourceId:"visual-source-0",repository:"atlas-visual-fixture/project-0",
  branch:project.sources.find(s=>s.id==="visual-source-0").branch,
  commitSha:SHA,folder:"directory-01",role:"Назначение ещё не установлено"
 });
 assert.equal(serialize(state),before);
 assert.deepEqual(deserialize(before),state);
 const form=new FormData();form.set("workId","visual-work-0-0");
 const action=folderLinkAction(found.matches[0].sourceId,found.matches[0].commitSha,found.matches[0].folder);
 assert.doesNotThrow(()=>selectedSourceFolder(state,projectId,action));
 const spec=editorSpec(project,action,state);
 assert.match(spec.title,/Связать работу с каталогом/);
 const result=applyEditor(state,projectId,action,form).state;
 const item=result.projects[0].items.find(w=>w.id==="visual-work-0-0");
 assert.equal(item.sourceId,"visual-source-0");
 assert.equal(item.sourcePath,"directory-01");
 assert.equal(item.sourceRevision,SHA);
 assert.deepEqual(result.projects[0].dependencies,project.dependencies);
 assert.deepEqual(deserialize(serialize(result)),result);
 assert.equal(serialize(state),before);
});

test("Search covers all recorded current source folders without relying on bounded map, with safe result limits",()=>{
 const {project}=fixture();
 const found=projectSourceFolderSearch(project,"directory");
 assert.ok(found.total>8);
 assert.equal(found.matches.length,8);
 assert.equal(found.hidden,found.total-8);
 assert.ok(projectSourceFolderSearch(project,"PROJECT-0 DIRECTORY-01").matches.some(x=>x.sourceId==="visual-source-0"));
 assert.equal(projectSourceFolderSearch(project,"несуществующий-каталог").total,0);
 assert.deepEqual(projectSourceFolderSearch(project,"   "),{matches:[],total:0,hidden:0});
 assert.throws(()=>projectSourceFolderSearch(project,"directory",{limit:0}),/предел/);
 assert.throws(()=>projectSourceFolderSearch(project,"directory",{limit:41}),/предел/);
});

test("Stale, unavailable or invalid observations cannot yield a clickable catalog from search",()=>{
 const {state,projectId}=fixture();
 const stale=structuredClone(state),src=stale.projects[0].sources.find(s=>s.id==="visual-source-0");
 src.summary.branchHeads[src.branch]="b".repeat(40);
 assert.equal(projectSourceFolderSearch(stale.projects[0],"project-0 directory-01").total,0);
 assert.throws(()=>selectedSourceFolder(stale,projectId,folderLinkAction("visual-source-0",SHA,"directory-01")),/изменилась/);
 src.status="error";
 assert.equal(projectSourceFolderSearch(stale.projects[0],"project-0 directory-01").total,0);
});
test("Source folder search is present in existing plan search without adding a separate editor or storage",()=>{
 const ui=readFileSync(new URL("../desktop/src/ProjectVisuals.tsx",import.meta.url),"utf8");
 assert.match(ui,/projectSourceFolderSearch\(project,searchQuery,\{limit:8\}\)/);
 assert.match(ui,/Найденные каталоги исходников/);
 assert.match(ui,/Связать существующую работу с найденным каталогом/);
 assert.match(ui,/onLinkExistingWork\(folder\.sourceId,folder\.commitSha,folder\.folder\)/);
 assert.match(ui,/found\.total\+catalogHits\.total/);
});

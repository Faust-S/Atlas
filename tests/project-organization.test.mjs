import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {projectStructureGuide,folderWorkAction,selectedSourceFolder} from "../src/project-organization.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
const SHA="a".repeat(40),NEXT="b".repeat(40),TREE="c".repeat(40);
function fixture(){
 let p=createProject(empty(),{name:"Website",type:"engineering"});
 let b=attach(p.state,p.id,"github","example/site",{branch:"work/dev"});
 const structure={status:"observed",branch:"work/dev",commitSha:SHA,treeSha:TREE,
  truncated:false,limited:false,folders:["src","docs","tests",".github","custom"],
  files:["package.json"],detected:["package.json"],totalFolders:5,totalFiles:1};
 const summary={scope:"repository",repository:"example/site",complete:true,
  defaultBranch:"main",branches:["main","work/dev"],branchHeads:{"work/dev":SHA,main:NEXT},
  structure,readiness:"not_assessed"};
 const state=observe(b.state,p.id,b.id,"ok",summary);
 return {state,projectId:p.id,sourceId:b.id};
}
test("Known root directories suggest possible roles without changing the user's plan",()=>{
 const {state,projectId}=fixture(),before=serialize(state);
 const guide=projectStructureGuide(state,projectId);
 assert.equal(guide.sources.length,1);
 assert.equal(guide.sources[0].status,"current");
 assert.equal(guide.sources[0].folderCount,5);
 assert.deepEqual(guide.sources[0].folders.map(x=>x.role),[
  "Возможно, исходный код","Возможно, документация","Возможно, проверки",
  "Возможно, инструменты разработки","Назначение ещё не установлено"]);
 assert.equal(guide.sources[0].folders[0].url,
  "https://github.com/example/site/tree/"+SHA+"/src");
 assert.deepEqual(guide.sources[0].knownFiles,["package.json"]);
 assert.equal(guide.nextAction.action,"project-edit");
 assert.deepEqual(state.projects[0].items,[]);
 assert.deepEqual(state.projects[0].dependencies,[]);
 assert.equal(serialize(state),before);
 assert.deepEqual(deserialize(before),state);
});
test("A stale or failed source cannot offer an unverified catalog as a new work",()=>{
 const {state,projectId,sourceId}=fixture();
 const before=structuredClone(state);
 before.projects[0].sources[0].summary.branchHeads["work/dev"]=NEXT;
 const guide=projectStructureGuide(before,projectId);
 assert.equal(guide.sources[0].status,"stale");
 assert.deepEqual(guide.sources[0].folders,[]);
 const action=folderWorkAction(sourceId,SHA,"src");
 assert.throws(()=>selectedSourceFolder(before,projectId,action),/изменилась/);
 assert.throws(()=>editorSpec(before.projects[0],action,before),/изменилась/);
 before.projects[0].sources[0].status="error";
 assert.equal(projectStructureGuide(before,projectId).sources[0].status,"unavailable");
});
test("A user-submitted editor creates one standard work linked to its real source",()=>{
 const {state,projectId,sourceId}=fixture(),before=serialize(state);
 const candidate=projectStructureGuide(state,projectId).sources[0].folders[0];
 const action=folderWorkAction(sourceId,candidate.commitSha,candidate.name);
 assert.deepEqual(selectedSourceFolder(state,projectId,action),
  {sourceId,folder:"src",repository:"example/site",branch:"work/dev",commitSha:SHA});
 const spec=editorSpec(state.projects[0],action,state);
 assert.equal(spec.title,"Работа по каталогу: src");
 assert.ok(spec.hint.includes("Уточните задачу"));
 assert.equal(spec.fields.find(x=>x.name==="title").value,"Уточнить назначение каталога src");
 const form=new FormData();
 for(const [key,val] of Object.entries({title:"Проверить интерфейс сайта",
  stageId:"",targetId:"",assignee:"",resourceId:"",allocationPct:"100",estimateDays:"2"}))
  form.set(key,val);
 const result=applyEditor(state,projectId,action,form);
 assert.equal(serialize(state),before);
 const project=result.state.projects[0];
 assert.equal(project.items.length,1);
 assert.equal(project.items[0].title,"Проверить интерфейс сайта");
 assert.equal(project.items[0].sourceId,sourceId);
 assert.equal(project.items[0].sourcePath,"src");
 assert.equal(project.items[0].sourceRevision,SHA);
 assert.equal(project.items[0].estimateDays,2);
 assert.deepEqual(project.stages,[]);
 assert.deepEqual(project.dependencies,[]);
 assert.deepEqual(project.decisions,[]);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 const past=structuredClone(result.state);
 past.projects[0].sources[0].summary.branchHeads["work/dev"]=NEXT;
 assert.doesNotThrow(()=>deserialize(serialize(past)));
 assert.equal(past.projects[0].items[0].sourceRevision,SHA);
 const invalid=structuredClone(result.state);
 invalid.projects[0].items[0].sourcePath="../outside";
 assert.throws(()=>deserialize(JSON.stringify(invalid)),/Invalid work source location/);
 assert.equal(projectStructureGuide(result.state,projectId).sources[0].linkedWorkCount,1);
 assert.equal(projectStructureGuide(result.state,projectId).sources[0].folders[0].workCount,1);
 assert.equal(projectStructureGuide(result.state,projectId).nextAction.action,"project-edit");
});
test("Work suggestion only accepts an exact existing folder, revision, and connected source",()=>{
 const {state,projectId,sourceId}=fixture();
 for(const bad of [
  "folder-work:"+sourceId+":"+SHA+":absent",
  "folder-work:"+sourceId+":"+NEXT+":src",
  "folder-work:unknown:"+SHA+":src",
  "folder-work:"+sourceId+":"+SHA+":%2Fsecret",
  "folder-work:"+sourceId+":"+SHA+":..",
  "folder-work:broken",
 ])assert.throws(()=>selectedSourceFolder(state,projectId,bad));
 for(const bad of ["src/index.js","../private","","C:\\private"])
  assert.throws(()=>folderWorkAction(sourceId,SHA,bad));
 const changed=structuredClone(state);changed.projects[0].sources[0].branch="main";
 assert.throws(()=>selectedSourceFolder(changed,projectId,folderWorkAction(sourceId,SHA,"src")),/изменилась/);
});
test("Related repositories are context for review, never fabricated portfolio dependencies",()=>{
 const {state,projectId}=fixture();
 const second=createProject(state,{name:"Other app",type:"engineering"});
 const linked=attach(second.state,second.id,"github","example/other",{branch:"main"});
 const unchanged=serialize(linked.state);
 const guide=projectStructureGuide(linked.state,projectId);
 assert.equal(guide.related[0].reason,"Один владелец GitHub");
 assert.equal(guide.related[0].id,second.id);
 assert.equal(linked.state.portfolioLinks,undefined);
 assert.equal(serialize(linked.state),unchanged);
 const shared=attach(linked.state,second.id,"github","example/site",{branch:"main"});
 assert.equal(projectStructureGuide(shared.state,projectId).related[0].reason,"Общие исходники");
});
test("Incomplete observations produce bounded previews, not claims about missing directories",()=>{
 const {state,projectId}=fixture();
 const s=state.projects[0].sources[0];
 s.summary.structure.truncated=true;s.summary.structure.totalFolders=120;
 const guide=projectStructureGuide(state,projectId,{maxFolders:2});
 assert.equal(guide.sources[0].displayed,2);
 assert.equal(guide.sources[0].incomplete,true);
 assert.throws(()=>projectStructureGuide(state,projectId,{maxFolders:121}),/bounds/);
 assert.throws(()=>projectStructureGuide(state,projectId,{maxSources:0}),/bounds/);
});
test("Author voice: everyday UI text, with clear boundaries and no technical user-facing jargon",()=>{
 const ui=readFileSync(new URL("../desktop/src/ProjectOrganizationGuide.tsx",import.meta.url),"utf8");
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Состав проекта/);
 assert.match(ui,/Назначение каталогов требует уточнения/);
 assert.match(ui,/Предложить работу/);
 assert.match(ui,/aria-label=\{"Предложить работу по каталогу "\+folder.name\}/);
 assert.match(ui,/onEdit\(folderWorkAction\(/);
 assert.match(ui,/не означает зависимость/);
 assert.match(ui,/Открыть связанные работы/);
 assert.match(ui,/Версия исходников/);
 assert.match(main,/ProjectOrganizationGuide snapshot=\{data\} projectId=\{project.id\}/);
 assert.doesNotMatch(ui,/[—–]/);
 assert.doesNotMatch(ui,/\b(?:runtime|kernel|authority|object_type|schema)\b/i);
});

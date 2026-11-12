import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createStage,createItem,editItem,attach,observe,connect,serialize,deserialize} from "../src/core.mjs";
import {folderLinkAction,folderWorkAction,selectedSourceFolder,projectSourcePlanProjection} from "../src/project-organization.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";

const SHA="a".repeat(40),PREVIOUS="b".repeat(40),TREE="c".repeat(40);
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
function fixture(){
 const project=createProject(empty(),{name:"Обычный проект",type:"other"});
 const source=attach(project.state,project.id,"github","example/site",{branch:"main"});
 const summary={scope:"repository",repository:"example/site",defaultBranch:"main",
  complete:true,branches:["main"],branchHeads:{main:SHA},readiness:"not_assessed",
  structure:{status:"observed",branch:"main",commitSha:SHA,treeSha:TREE,
   folders:["src","docs"],files:["index.html"],detected:["index.html"],
   totalFolders:2,totalFiles:1,truncated:false,limited:false}};
 const observed=observe(source.state,project.id,source.id,"ok",summary);
 const stage=createStage(observed,project.id,"Исследование");
 const created=createItem(stage.state,project.id,{title:"Проверить исходники"});
 const existing=editItem(created.state,project.id,created.id,{
  stageId:stage.id,estimateDays:4,sourceId:source.id,
  sourcePath:"docs",sourceRevision:PREVIOUS});
 const next=createItem(existing,project.id,{title:"Согласовать результат"});
 const linked=connect(next.state,project.id,created.id,next.id);
 return {state:linked,pid:project.id,sid:source.id,stageId:stage.id,
  firstId:created.id,nextId:next.id};
}
test("Link existing work to observed folder without creating a new work or changing other fields",()=>{
 const f=fixture(),before=serialize(f.state);
 const action=folderLinkAction(f.sid,SHA,"src");
 assert.equal(selectedSourceFolder(f.state,f.pid,action).commitSha,SHA);
 const spec=editorSpec(f.state.projects[0],action,f.state);
 assert.match(spec.title,/Связать работу с каталогом: src/);
 assert.match(spec.hint,/черновике/);
 assert.equal(spec.fields[0].required,true);
 assert.deepEqual(spec.fields[0].options.map(x=>x.value),["",f.firstId,f.nextId]);
 const form=new FormData();form.set("workId",f.firstId);
 const updated=applyEditor(f.state,f.pid,action,form);
 assert.equal(updated.workId,undefined);
 const previous=f.state.projects[0],project=updated.state.projects[0];
 assert.equal(project.items.length,previous.items.length);
 assert.equal(project.stages.length,previous.stages.length);
 assert.deepEqual(project.dependencies,previous.dependencies);
 assert.deepEqual(project.sources,previous.sources);
 const work=project.items.find(x=>x.id===f.firstId);
 assert.equal(work.sourceId,f.sid);
 assert.equal(work.sourcePath,"src");
 assert.equal(work.sourceRevision,SHA);
 assert.equal(work.stageId,f.stageId);
 assert.equal(work.estimateDays,4);
 assert.equal(serialize(f.state),before);
 const restored=deserialize(serialize(updated.state));
 assert.deepEqual(restored,updated.state);
 const map=projectSourcePlanProjection(restored,f.pid);
 assert.equal(map.sources[0].folders.find(x=>x.name==="src").works[0].id,f.firstId);
 assert.equal(map.sources[0].folders.find(x=>x.name==="docs").works.length,0);
 assert.throws(()=>applyEditor(updated.state,f.pid,action,form),/уже связана/);
});
test("Linking rejects stale, missing or invented source folders and requires an explicit work choice",()=>{
 const f=fixture(),action=folderLinkAction(f.sid,SHA,"src");
 assert.equal(folderWorkAction(f.sid,SHA,"src").slice("folder-work:".length),
  action.slice("folder-link:".length));
 const stale=structuredClone(f.state);
 stale.projects[0].sources[0].summary.branchHeads.main=PREVIOUS;
 const form=new FormData();form.set("workId",f.nextId);
 assert.throws(()=>editorSpec(stale.projects[0],action,stale),/Структура проекта изменилась/);
 assert.throws(()=>applyEditor(stale,f.pid,action,form),/Структура проекта изменилась/);
 assert.throws(()=>selectedSourceFolder(f.state,f.pid,folderLinkAction(f.sid,SHA,"unknown")),
  /Структура проекта изменилась/);
 assert.throws(()=>applyEditor(f.state,f.pid,action,new FormData()),
  /Выберите существующую работу/);
 assert.throws(()=>folderLinkAction(f.sid,SHA,"../src"),/Некорректный источник/);
});
test("Source map exposes work linking only through the existing editor when works exist",()=>{
 const ui=read("../desktop/src/ProjectVisuals.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const editor=read("../src/editor.mjs");
 assert.ok(ui.includes("onLinkExistingWork(source.sourceId,folder.commitSha,folder.name)"));
 assert.ok(ui.includes("project?.items?.length>0&&<button"));
 assert.ok(guide.includes("onEdit(folderLinkAction(sourceId,commitSha,folder))"));
 assert.ok(editor.includes('if(action.startsWith("folder-link:"))'));
 assert.ok(!ui.includes("commitWithReadback"));
});

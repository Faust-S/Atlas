import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,attach,observe,serialize,deserialize,createItem,editItem,editProject} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
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
 // A project-specific folder stays available before tests and setup folders.
 assert.deepEqual(guide.sources[0].folders.map(x=>x.role),[
  "Возможно, исходный код","Назначение ещё не установлено",
  "Возможно, документация","Возможно, проверки",
  "Возможно, инструменты разработки"]);
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
 assert.deepEqual(spec.fields.map(field=>field.name),["title","newStageName","estimateDays","dueDate"]);
 assert.ok(spec.hint.includes("Назовите работу"));
 assert.equal(spec.fields.find(x=>x.name==="title").value,"Уточнить назначение каталога src");
 const form=new FormData();
 for(const [key,val] of Object.entries({title:"Проверить интерфейс сайта",
  stageId:"",targetId:"",assignee:"",resourceId:"",allocationPct:"100",estimateDays:"2"}))
  form.set(key,val);
 const result=applyEditor(state,projectId,action,form);
 assert.equal(serialize(state),before);
 const project=result.state.projects[0];
 assert.equal(project.items.length,1);
 assert.equal(result.workId,project.items[0].id);
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
 assert.match(main,/function workFolderUrl\(project:any,work:any\)/);
 assert.match(main,/Каталог: <a className="text-link"/);
 assert.match(main,/work.sourcePath.split\("\/"\).map\(encodeURIComponent\).join\("\/"\)/);
 assert.doesNotMatch(ui,/[—–]/);
 assert.doesNotMatch(ui,/\b(?:runtime|kernel|authority|object_type|schema)\b/i);
});

test("User chooses an existing stage or creates one with a source-linked work",()=>{
 const {state,projectId,sourceId}=fixture();
 const original=serialize(state),action=folderWorkAction(sourceId,SHA,"src");
 const newStage=new FormData();
 newStage.set("title","Разобрать интерфейс");
 newStage.set("estimateDays","3");
 newStage.set("newStageName","Подготовка");
 const created=applyEditor(state,projectId,action,newStage).state;
 assert.equal(serialize(state),original);
 const p=created.projects.find(entry=>entry.id===projectId);
 assert.equal(p.stages.length,1);
 assert.equal(p.stages[0].name,"Подготовка");
 assert.equal(p.items.length,1);
 assert.equal(p.items[0].stageId,p.stages[0].id);
 assert.equal(p.items[0].sourceId,sourceId);
 assert.equal(p.items[0].sourcePath,"src");
 assert.equal(p.items[0].sourceRevision,SHA);
 assert.equal(p.items[0].estimateDays,3);
 assert.deepEqual(deserialize(serialize(created)),created);
 const spec=editorSpec(p,action,created);
 assert.deepEqual(spec.fields.map(f=>f.name),
  ["title","stageId","newStageName","estimateDays","dueDate","predecessorId"]);
 assert.equal(spec.fields.find(f=>f.name==="stageId").options[1].value,p.stages[0].id);
 const existing=new FormData();
 existing.set("title","Доработать интерфейс");
 existing.set("estimateDays","2");
 existing.set("stageId",p.stages[0].id);
 const before=serialize(created);
 const appended=applyEditor(created,projectId,action,existing).state;
 assert.equal(appended.projects[0].stages.length,1);
 assert.equal(appended.projects[0].items.length,2);
 assert.equal(appended.projects[0].items[1].stageId,p.stages[0].id);
 assert.equal(serialize(created),before);
 const conflict=new FormData();
 conflict.set("title","Недопустимый вариант");
 conflict.set("estimateDays","1");
 conflict.set("stageId",p.stages[0].id);
 conflict.set("newStageName","Другой этап");
 assert.throws(()=>applyEditor(created,projectId,action,conflict),
  /существующий этап или укажите новый/);
 assert.equal(serialize(created),before);
 const stale=structuredClone(state);
 stale.projects[0].sources[0].summary.branchHeads["work/dev"]=NEXT;
 const staleBefore=serialize(stale);
 assert.throws(()=>applyEditor(stale,projectId,action,newStage),/изменилась/);
 assert.equal(serialize(stale),staleBefore);
});

test("An ordinary non-GitHub project also returns the new work ID without extra state",()=>{
 const p=createProject(empty(),{name:"Обычный план",type:"other"});
 const before=serialize(p.state),form=new FormData();
 form.set("title","Первая работа");form.set("estimateDays","1");
 const result=applyEditor(p.state,p.id,"item",form);
 assert.equal(result.state.projects[0].items.length,1);
 assert.equal(result.workId,result.state.projects[0].items[0].id);
 assert.equal(serialize(p.state),before);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
});

test("New folder work saves a deadline, explicit predecessor, and schedule effects",()=>{
 const {state,projectId,sourceId}=fixture();
 const first=createItem(state,projectId,{title:"Подготовить каталог"});
 const measured=editItem(first.state,projectId,first.id,{estimateDays:4});
 const started=editProject(measured,projectId,{startDate:"2026-11-01"});
 const original=serialize(started),action=folderWorkAction(sourceId,SHA,"src");
 const spec=editorSpec(started.projects[0],action,started);
 assert.deepEqual(spec.fields.map(x=>x.name),
  ["title","newStageName","estimateDays","dueDate","predecessorId"]);
 const predecessor=spec.fields.find(x=>x.name==="predecessorId");
 assert.equal(predecessor.required,false);
 assert.deepEqual(predecessor.options.map(o=>o.label),
  ["Без зависимости","Подготовить каталог"]);
 const form=new FormData();
 form.set("title","Проверить интерфейс");form.set("newStageName","Контроль");
 form.set("estimateDays","3");form.set("dueDate","2026-11-10");
 form.set("predecessorId",first.id);
 const result=applyEditor(started,projectId,action,form);
 assert.equal(serialize(started),original);
 const p=result.state.projects[0],added=p.items.find(x=>x.id===result.workId);
 assert.equal(p.items.length,2);
 assert.equal(p.stages.length,1);
 assert.equal(added.stageId,p.stages[0].id);
 assert.equal(added.sourceId,sourceId);
 assert.equal(added.sourcePath,"src");
 assert.equal(added.sourceRevision,SHA);
 assert.equal(added.estimateDays,3);
 assert.equal(added.dueDate,"2026-11-10");
 assert.deepEqual(p.dependencies,[{from:first.id,to:result.workId}]);
 const before=scheduleProject(started.projects[0]),after=scheduleProject(p);
 assert.equal(before.durationDays,4);
 assert.equal(after.durationDays,7);
 const row=after.rows.find(x=>x.id===result.workId);
 assert.equal(row.earlyStart,4);assert.equal(row.earlyFinish,7);
 assert.equal(row.startDate,"2026-11-05");assert.equal(row.finishDate,"2026-11-08");
 assert.deepEqual(row.predecessors,[first.id]);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 for(const [field,badValue,rejection] of [
  ["predecessorId","not-existing",/Unknown work item/],
  ["dueDate","2026-02-30",/Invalid work dueDate/]
 ]){
  const invalid=new FormData();
  for(const [k,v] of form.entries())invalid.set(k,v);
  invalid.set(field,badValue);
  assert.throws(()=>applyEditor(started,projectId,action,invalid),rejection);
  assert.equal(serialize(started),original);
 }
});
test("A project without GitHub can create work with the same scheduling fields",()=>{
 const p=createProject(empty(),{name:"Личный план",type:"personal"});
 const first=createItem(p.state,p.id,{title:"Подготовить материалы"});
 const before=serialize(first.state);
 const spec=editorSpec(first.state.projects[0],"item",first.state);
 assert.equal(spec.fields.find(x=>x.name==="predecessorId").options[1].value,first.id);
 assert.ok(spec.fields.some(x=>x.name==="dueDate"));
 const form=new FormData();
 form.set("title","Провести встречу");form.set("estimateDays","2");
 form.set("dueDate","2026-12-01");form.set("predecessorId",first.id);
 const result=applyEditor(first.state,p.id,"item",form);
 assert.equal(serialize(first.state),before);
 assert.equal(result.state.projects[0].sources.length,0);
 assert.deepEqual(result.state.projects[0].dependencies,[{from:first.id,to:result.workId}]);
 assert.equal(result.state.projects[0].items.at(-1).dueDate,"2026-12-01");
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
});

test("An existing work selects one predecessor without choosing the dependent work",()=>{
 const p=createProject(empty(),{name:"План",type:"other"});
 const first=createItem(p.state,p.id,{title:"Подготовка"});
 const second=createItem(first.state,p.id,{title:"Проверка"});
 const third=createItem(second.state,p.id,{title:"Публикация"});
 const before=serialize(third.state),action="dep-to:"+encodeURIComponent(third.id);
 const spec=editorSpec(third.state.projects[0],action,third.state);
 assert.equal(spec.title,"Предшествующая работа для: Публикация");
 assert.deepEqual(spec.fields.map(field=>field.name),["from"]);
 assert.deepEqual(spec.fields[0].options.map(o=>o.value),["",first.id,second.id]);
 assert.equal(spec.fields[0].searchable,true);
 assert.equal(spec.fields[0].value,"");
 const unselected=new FormData();
 assert.throws(()=>applyEditor(third.state,p.id,action,unselected),/больше недоступна/);
 const form=new FormData();form.set("from",second.id);
 const result=applyEditor(third.state,p.id,action,form);
 assert.deepEqual(result.state.projects[0].dependencies,[{from:second.id,to:third.id}]);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 assert.equal(serialize(third.state),before);
 assert.deepEqual(editorSpec(result.state.projects[0],action,result.state).fields[0].options.map(o=>o.value),["",first.id]);
 assert.throws(()=>applyEditor(result.state,p.id,action,form),/больше недоступна/);
 const self=new FormData();self.set("from",third.id);
 assert.throws(()=>applyEditor(third.state,p.id,action,self),/больше недоступна/);
 const invalid=new FormData();invalid.set("from","missing");
 assert.throws(()=>applyEditor(third.state,p.id,action,invalid),/больше недоступна/);
 const cycle=new FormData();cycle.set("from",third.id);
 assert.throws(()=>applyEditor(result.state,p.id,"dep-to:"+encodeURIComponent(second.id),cycle));
 assert.throws(()=>editorSpec(third.state.projects[0],"dep-to:missing",third.state),/не найдена/);
 assert.equal(serialize(third.state),before);
});
test("The work row offers a direct existing-work predecessor action",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/onClick=\{\(\)=>openEditor\("dep-to:"\+encodeURIComponent\(w\.id\)\)\}/);
 assert.match(ui,/ariaLabel=\{"Добавить предшественника для работы "\+w\.title\}/);
 assert.match(ui,/>После работы<\/Action>/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createStage,createItem,editItem,attach,observe,connect,serialize,deserialize} from "../src/core.mjs";
import {projectSourcePlanProjection,projectSourcePlanSearch} from "../src/project-organization.mjs";

const SHA="a".repeat(40),OLD="b".repeat(40),TREE="c".repeat(40);
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");
function fixture(){
 const initial=createProject(empty(),{name:"Project website",type:"engineering"});
 const source=attach(initial.state,initial.id,"github","example/site",{branch:"work/dev"});
 const observation={scope:"repository",repository:"example/site",defaultBranch:"main",
  complete:true,branches:["main","work/dev"],branchHeads:{"work/dev":SHA,main:OLD},
  readiness:"not_assessed",structure:{status:"observed",branch:"work/dev",commitSha:SHA,
   treeSha:TREE,folders:["src","docs"],files:["package.json"],detected:["package.json"],
   totalFolders:2,totalFiles:1,truncated:false,limited:false}};
 const observed=observe(source.state,initial.id,source.id,"ok",observation);
 const stage=createStage(observed,initial.id,"Проверка");
 const first=createItem(stage.state,initial.id,{title:"Проверить интерфейс"});
 const firstLinked=editItem(first.state,initial.id,first.id,{stageId:stage.id,
  sourceId:source.id,sourcePath:"src",sourceRevision:SHA});
 const second=createItem(firstLinked,initial.id,{title:"Обновить документацию"});
 const secondLinked=editItem(second.state,initial.id,second.id,{
  sourceId:source.id,sourcePath:"docs",sourceRevision:OLD});
 const third=createItem(secondLinked,initial.id,{title:"Согласовать результат"});
 const final=connect(third.state,initial.id,first.id,second.id);
 return {state:final,projectId:initial.id,sourceId:source.id,stageId:stage.id,
  firstId:first.id,secondId:second.id,thirdId:third.id};
}

test("Read-only source plan shows only actual folder, work and stage links",()=>{
 const f=fixture(),before=serialize(f.state);
 const map=projectSourcePlanProjection(f.state,f.projectId);
 assert.equal(map.projectName,"Project website");
 assert.equal(map.workTotal,3);
 assert.equal(map.stageTotal,1);
 assert.equal(map.dependencyTotal,1);
 assert.equal(map.mappedTotal,2);
 assert.equal(map.sources.length,1);
 assert.equal(map.sources[0].status,"current");
 const folder=map.sources[0].folders.find(x=>x.name==="src");
 assert.equal(folder.totalWorks,1);
 assert.equal(folder.works[0].id,f.firstId);
 assert.equal(folder.works[0].title,"Проверить интерфейс");
 assert.equal(folder.works[0].stageId,f.stageId);
 assert.equal(folder.works[0].stageName,"Проверка");
 assert.equal(folder.works[0].sameRevision,true);
 const docs=map.sources[0].folders.find(x=>x.name==="docs");
 assert.equal(docs.works[0].sameRevision,false);
 assert.equal(docs.works[0].stageName,"Без этапа");
 assert.deepEqual(docs.works[0].predecessors,[{id:f.firstId,title:"Проверить интерфейс"}]);
 assert.deepEqual(map.shownDependencies,[{from:f.firstId,to:f.secondId}]);
 assert.deepEqual(map.otherWorks.map(x=>x.id),[f.thirdId]);
 assert.equal(map.otherWorks[0].reason,"Каталог не указан");
 assert.equal(serialize(f.state),before);
 assert.deepEqual(deserialize(before),f.state);
});
test("Absent, stale or partial root observation does not invent deleted folders",()=>{
 const f=fixture(),old=structuredClone(f.state);
 old.projects[0].sources[0].summary.branchHeads["work/dev"]=OLD;
 const projection=projectSourcePlanProjection(old,f.projectId);
 assert.equal(projection.sources[0].status,"stale");
 assert.deepEqual(projection.sources[0].folders,[]);
 assert.equal(projection.mappedTotal,0);
 assert.equal(projection.otherWorks.length,3);
 assert.equal(projection.dependencyTotal,1);
 assert.equal(projection.hiddenDependencies,0);
 const inaccessible=structuredClone(f.state);
 inaccessible.projects[0].sources[0].status="error";
 const hidden=projectSourcePlanProjection(inaccessible,f.projectId);
 assert.equal(hidden.sources[0].status,"unavailable");
 assert.equal(hidden.otherWorks.length,3);
 assert.deepEqual(hidden.sources[0].folders,[]);
});
test("Bounded map retains totals and does not duplicate hidden work in the unrelated list",()=>{
 const f=fixture(),seed=createItem(f.state,f.projectId,{title:"Другая часть src"});
 const linked=editItem(seed.state,f.projectId,seed.id,{
  sourceId:f.sourceId,sourcePath:"src",sourceRevision:SHA});
 const map=projectSourcePlanProjection(linked,f.projectId,{maxWorksPerFolder:1,maxOtherWorks:1});
 const src=map.sources[0].folders.find(x=>x.name==="src");
 assert.equal(src.totalWorks,2);
 assert.equal(src.works.length,1);
 assert.equal(src.hiddenWorks,1);
 assert.equal(map.mappedTotal,3);
 assert.equal(map.otherWorks.length,1);
 assert.equal(map.otherWorks[0].id,f.thirdId);
 assert.equal(map.hiddenOtherWorks,0);
 assert.equal(map.workTotal,4);
 assert.throws(()=>projectSourcePlanProjection(linked,f.projectId,{maxWorksPerFolder:0}),/предел/);
 assert.throws(()=>projectSourcePlanProjection(linked,f.projectId,{maxSources:121}),/предел/);
 assert.throws(()=>projectSourcePlanProjection(linked,"missing"),/не найден/);
});
test("Legacy work without precise folder is shown, never silently assigned",()=>{
 const f=fixture();
 const older=createItem(f.state,f.projectId,{title:"Историческая задача"});
 const linked=editItem(older.state,f.projectId,older.id,{sourceId:f.sourceId});
 const map=projectSourcePlanProjection(linked,f.projectId);
 const oldWork=map.otherWorks.find(w=>w.id===older.id);
 assert.ok(oldWork);
 assert.equal(oldWork.reason,"Привязка к каталогу пока не показана");
 assert.equal(oldWork.stageName,"Без этапа");
 assert.equal(linked.projects[0].items.find(w=>w.id===older.id).sourcePath,undefined);
});
test("Atlas uses its existing editors, schedule, and dependency graph from a navigable source map",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const main=read("../desktop/src/main.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(visual,/export function ProjectSourcePlanMap/);
 assert.match(visual,/Как связаны части проекта/);
 assert.match(visual,/Каталог, работа и этап показаны рядом/);
 assert.match(visual,/onOpenWork\(work\.id\)/);
 assert.match(visual,/onEditStage\(work\.stageId\)/);
 assert.match(visual,/onSuggestFolder\(source\.sourceId,folder\.commitSha,folder\.name\)/);
 assert.match(visual,/onOpenTimeline/);
 assert.match(visual,/onOpenGraph/);
 assert.match(visual,/onAddDependency/);
 assert.match(visual,/source\.status==="current"/);
 assert.match(guide,/projectSourcePlanProjection\(snapshot,projectId,moreLinks\?/);
 assert.match(guide,/open=\{projection\.workTotal>0\|\|projection\.stageTotal>0\|\|linkedFolderWorks\|\|undefined\}/);
 assert.match(guide,/onOpenWork=\{id=>onEdit\("work:"\+id\)\}/);
 assert.match(guide,/onEditStage=\{id=>onEdit\("stage-edit:"\+id\)\}/);
 assert.match(guide,/onCreateStage=\{\(\)=>onEdit\("stage"\)\}/);
 assert.match(main,/onOpenTimeline=\{\(\)=>view\("timeline"\)\}/);
 assert.match(main,/onOpenGraph=\{\(\)=>view\("graph"\)\}/);
 assert.match(css,/\.atlas-source-plan-flow\{display:grid/);
 assert.match(css,/\.atlas-source-plan-assignment\{display:grid/);
 assert.doesNotMatch(visual.slice(visual.indexOf("export function ProjectSourcePlanMap")),/fetch\(|localStorage|mutate\(|createItem\(/);
 assert.doesNotMatch(visual.slice(visual.indexOf("export function ProjectSourcePlanMap")) ,/[—–]/);
});


test("Linked folders are shown first in a bounded map without changing source order",()=>{
 const f=fixture(),updated=structuredClone(f.state);
 const tree=updated.projects[0].sources[0].summary.structure;
 tree.folders=["unrelated-first","unrelated-second","src","docs"];
 tree.totalFolders=tree.folders.length;
 const original=serialize(updated);
 const map=projectSourcePlanProjection(updated,f.projectId,{
  maxSources:1,maxFoldersPerSource:1,maxWorksPerFolder:1,maxOtherWorks:2
 });
 assert.equal(map.sources[0].folders[0].name,"src");
 assert.equal(map.sources[0].folders[0].works[0].id,f.firstId);
 assert.equal(map.sources[0].displayed,1);
 assert.equal(map.sources[0].folderCount,4);
 assert.equal(map.sources[0].incomplete,true);
 assert.equal(map.otherWorks.some(work=>work.id===f.secondId),true);
 assert.deepEqual(tree.folders,["unrelated-first","unrelated-second","src","docs"]);
 assert.equal(serialize(updated),original);
});
test("Large linked folders stay bounded; long work and stage titles remain intact",()=>{
 const f=fixture(),veryLong="Разобрать структуру "+("длинного названия каталога ".repeat(4));
 let state=f.state;
 for(let i=0;i<55;i++){
  const added=createItem(state,f.projectId,{title:veryLong+" №"+i});
  state=editItem(added.state,f.projectId,added.id,{
   sourceId:f.sourceId,sourcePath:"src",sourceRevision:SHA});
 }
 const before=serialize(state);
 const map=projectSourcePlanProjection(state,f.projectId,{
  maxSources:1,maxFoldersPerSource:1,maxWorksPerFolder:3,maxOtherWorks:1
 });
 const folder=map.sources[0].folders[0];
 assert.equal(folder.name,"src");
 assert.equal(folder.totalWorks,56);
 assert.equal(folder.works.length,3);
 assert.equal(folder.hiddenWorks,53);
 assert.equal(folder.works[1].title,veryLong+" №0");
 assert.equal(map.workTotal,58);
 assert.equal(map.dependencyTotal,1);
 assert.equal(serialize(state),before);
});
test("The first screen prioritizes real project links and permits controlled expansion",()=>{
 const ui=read("../desktop/src/main.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 const mapIndex=ui.indexOf('<ProjectOrganizationGuide snapshot={data}');
 const metricsIndex=ui.indexOf('<div className="metric-grid">',mapIndex);
 const tipIndex=ui.indexOf('<section className="surface atlas-next-step"',mapIndex);
 assert.ok(mapIndex>0&&metricsIndex>mapIndex&&tipIndex>mapIndex);
 assert.match(guide,/maxSources:2,maxFoldersPerSource:4,maxWorksPerFolder:3,maxOtherWorks:6/);
 assert.match(visual,/Показать больше связей/);
 assert.match(guide,/Каталоги и сведения об источниках/);
 assert.match(visual,/Предшествующих работ: \{work\.predecessorTotal\}/);
 assert.match(visual,/onOpenWork\(previous\.id\)/);
 assert.match(visual,/Открыть все источники/);
 assert.match(css,/\.atlas-source-plan-map \.text-link,\.atlas-source-plan-map \.action-button\{[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.atlas-source-plan-dependencies>summary\{/);
});


test("Source plan prioritizes sources with confirmed work links beyond first two",()=>{
 const f=fixture(),snapshot=structuredClone(f.state);
 const p=snapshot.projects[0],selected=p.sources[0];
 const extra=Array.from({length:5},(_,i)=>({
  ...structuredClone(selected),id:"unrelated-"+i,locator:"example/unrelated-"+i
 }));
 p.sources=[...extra,selected];
 const before=serialize(snapshot);
 const map=projectSourcePlanProjection(snapshot,f.projectId,{
  maxSources:2,maxFoldersPerSource:1,maxWorksPerFolder:1,maxOtherWorks:1
 });
 assert.equal(map.sources[0].sourceId,f.sourceId);
 assert.equal(map.sources[0].folders[0].works[0].id,f.firstId);
 assert.equal(map.hiddenSources,4);
 assert.deepEqual(p.sources.map(s=>s.id),[...extra.map(s=>s.id),f.sourceId]);
 assert.equal(serialize(snapshot),before);
});
test("Map expansion has a reversible visible control, without new plan state",()=>{
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 assert.match(guide,/onToggleExpansion=\{\(\)=>setMoreLinks\(value=>!value\)\}/);
 assert.match(visual,/aria-expanded=\{expanded\}/);
 assert.match(visual,/\{expanded\?"Свернуть схему":"Показать больше связей"\}/);
 const projection=read("../src/project-organization.mjs");
 assert.match(projection,/sourceList\.sort\(/);
 assert.match(projection,/workByFolder=new Map\(\)/);
});

test("Very long diagram labels remain available without unbounded card heights",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(visual,/title=\{folder\.name\}/);
 assert.match(visual,/title=\{work\.title\}/);
 assert.match(visual,/title=\{work\.stageName\}/);
 assert.match(visual,/title=\{previous\.title\}/);
 assert.match(css,/\.atlas-source-plan-folder strong,[\s\S]*?-webkit-line-clamp:2;/);
 assert.match(css,/overflow:hidden;text-overflow:ellipsis;overflow-wrap:anywhere;line-height:1\.4/);
});


test("Any project can display saved work-stage and predecessor links without GitHub",()=>{
 const p=createProject(empty(),{name:"Открытие пространства",type:"business",goal:"Провести встречу"});
 const stage=createStage(p.state,p.id,"Подготовка");
 const one=createItem(stage.state,p.id,{title:"Подготовить помещение",stageId:stage.id});
 const two=createItem(one.state,p.id,{title:"Открыть площадку",stageId:stage.id});
 const linked=connect(two.state,p.id,one.id,two.id);
 const before=serialize(linked);
 const map=projectSourcePlanProjection(linked,p.id,{maxOtherWorks:1});
 assert.equal(map.sources.length,0);
 assert.equal(map.sourceCount,0);
 assert.equal(map.workTotal,2);
 assert.equal(map.stageTotal,1);
 assert.equal(map.dependencyTotal,1);
 assert.equal(map.otherWorks[0].title,"Подготовить помещение");
 assert.equal(map.hiddenOtherWorks,1);
 assert.equal(serialize(linked),before);
 const full=projectSourcePlanProjection(linked,p.id,{maxOtherWorks:2});
 assert.equal(full.otherWorks[1].stageName,"Подготовка");
 assert.deepEqual(full.otherWorks[1].predecessors,[{id:one.id,title:"Подготовить помещение"}]);
 assert.equal(full.otherWorks[1].predecessorTotal,1);
 assert.equal(serialize(linked),before);
});
test("The overview offers its existing plan diagram in non-engineering projects",()=>{
 const main=read("../desktop/src/main.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(main,/project\.items\.length>0\|\|project\.stages\.length>0\|\|project\.type==="engineering"/);
 assert.match(guide,/showMap=hasSources\|\|projection\.workTotal>0/);
 assert.match(guide,/Схема проекта: работы и этапы/);
 assert.match(guide,/Здесь показаны ваши работы, этапы и записанные зависимости/);
 assert.match(visual,/Работы, этапы и зависимости показаны по сохранённому плану/);
 assert.match(visual,/projection\.sources\.length\?"Работы без показанной связи с каталогом"/);
 assert.match(visual,/work\.predecessors\.map\(\(previous:any\)=>/);
 assert.match(visual,/Открыть все работы/);
 assert.match(css,/\.atlas-source-plan-other-list>\.atlas-source-plan-other-row/);
 assert.doesNotMatch(visual.slice(visual.indexOf("export function ProjectSourcePlanMap")),/createItem\(|mutate\(|localStorage/);
});


test("Project type names in navigation match the existing human-readable editor choices",async()=>{
 const {PROJECT_TYPE_LABELS,editorSpec}=await import("../src/editor.mjs");
 const labels=["Личный","Команда","Бизнес","Разработка","Исследование",
  "Здоровье (без медицинских записей)","Другое"];
 const choices=editorSpec(null,"new").fields.find(field=>field.name==="type").options;
 assert.deepEqual(choices.map(item=>item.label),labels);
 assert.deepEqual(Object.values(PROJECT_TYPE_LABELS),labels);
 const main=read("../desktop/src/main.tsx");
 assert.match(main,/PROJECT_TYPE_LABELS\[project\.type\]\|\|"Другой проект"/);
 assert.doesNotMatch(main,/<\/button> \/ \{project\.type\}/);
});


test("Stage-only projects reveal saved stages without inventing work or dependencies",()=>{
 const project=createProject(empty(),{name:"План встречи",type:"other"});
 const a=createStage(project.state,project.id,"Подготовить площадку");
 const b=createStage(a.state,project.id,"Провести встречу");
 const c=createStage(b.state,project.id,"Подвести итоги");
 const before=serialize(c.state);
 const compact=projectSourcePlanProjection(c.state,project.id,{maxUnassignedStages:2});
 assert.equal(compact.sources.length,0);
 assert.equal(compact.workTotal,0);
 assert.equal(compact.stageTotal,3);
 assert.equal(compact.dependencyTotal,0);
 assert.deepEqual(compact.unassignedStages.map(stage=>stage.name),
  ["Подготовить площадку","Провести встречу"]);
 assert.equal(compact.hiddenUnassignedStages,1);
 const full=projectSourcePlanProjection(c.state,project.id,{maxUnassignedStages:3});
 assert.deepEqual(full.unassignedStages.map(stage=>stage.name),
  ["Подготовить площадку","Провести встречу","Подвести итоги"]);
 assert.equal(serialize(c.state),before);
});
test("An assigned stage no longer appears as stage without work",()=>{
 const p=createProject(empty(),{name:"План",type:"personal"});
 const a=createStage(p.state,p.id,"Проверка");
 const b=createStage(a.state,p.id,"Без работ");
 const work=createItem(b.state,p.id,{title:"Проверить готовность",stageId:a.id});
 const before=serialize(work.state);
 const map=projectSourcePlanProjection(work.state,p.id);
 assert.equal(map.stageTotal,2);
 assert.equal(map.otherWorks.length,1);
 assert.deepEqual(map.unassignedStages.map(stage=>stage.name),["Без работ"]);
 assert.equal(map.hiddenUnassignedStages,0);
 assert.equal(serialize(work.state),before);
});
test("Stage-only projects display the existing map and link to all saved stages",()=>{
 const main=read("../desktop/src/main.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 assert.match(main,/project\.items\.length>0\|\|project\.stages\.length>0/);
 assert.match(main,/id="atlas-project-stages"/);
 assert.match(guide,/projection\.stageTotal>0/);
 assert.match(guide,/maxUnassignedStages:4/);
 assert.match(guide,/maxUnassignedStages:16/);
 assert.match(visual,/Этапы без работ/);
 assert.match(visual,/onEditStage\(stage\.id\)/);
 assert.match(visual,/Открыть все этапы/);
});


test("Bounded known folders are distinct from incomplete source observations",()=>{
 const f=fixture();
 const state=structuredClone(f.state);
 const tree=state.projects[0].sources[0].summary.structure;
 tree.folders=["src","docs","assets","tests","scripts"];
 tree.totalFolders=5;
 tree.truncated=false;tree.limited=false;
 const before=serialize(state);
 const result=projectSourcePlanProjection(state,f.projectId,{
  maxSources:1,maxFoldersPerSource:2,maxWorksPerFolder:3,maxOtherWorks:2
 });
 assert.equal(result.sources[0].hiddenKnownFolders,3);
 assert.equal(result.sources[0].observationIncomplete,false);
 assert.equal(result.sources[0].incomplete,true);
 assert.equal(result.sources[0].folderCount,5);
 assert.equal(serialize(state),before);
 tree.totalFolders=9;
 tree.truncated=true;
 const partial=projectSourcePlanProjection(state,f.projectId,{
  maxSources:1,maxFoldersPerSource:5,maxWorksPerFolder:3,maxOtherWorks:2
 });
 assert.equal(partial.sources[0].hiddenKnownFolders,0);
 assert.equal(partial.sources[0].observationIncomplete,true);
 assert.equal(partial.sources[0].incomplete,true);
});
test("Atlas tells hidden known folders apart from incomplete source readings",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 assert.match(visual,/source\.hiddenKnownFolders>0/);
 assert.match(visual,/source\.observationIncomplete/);
 assert.match(visual,/Проверить источник/);
 assert.match(guide,/source\.hiddenKnownFolders>0/);
 assert.match(guide,/source\.observationIncomplete/);
 assert.doesNotMatch(visual,/Другие каталоги могут быть не получены/);
});


test("Quick search finds an unassigned stage in a stage-only project",()=>{
 const p=createProject(empty(),{name:"Универсальный план",type:"other"});
 const a=createStage(p.state,p.id,"Подготовка");
 const b=createStage(a.state,p.id,"Подвести итоги");
 const before=serialize(b.state),project=b.state.projects[0];
 const projection=projectSourcePlanProjection(b.state,p.id,{maxUnassignedStages:1});
 assert.equal(projection.unassignedStages.length,1);
 assert.equal(projection.hiddenUnassignedStages,1);
 const found=projectSourcePlanSearch(project,"ПОДВЕСТИ ИТОГИ");
 assert.equal(found.total,1);
 assert.equal(found.matches[0].id,b.id);
 assert.equal(found.matches[0].kind,"stage");
 assert.equal(serialize(b.state),before);
});
test("Diagram search uses existing work and stage editors without changing storage",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(guide,/ProjectSourcePlanMap projection=\{projection\} project=\{project\}/);
 assert.match(visual,/projectSourcePlanSearch\(project,searchQuery,\{limit:8\}\)/);
 assert.match(visual,/aria-label="Найти работу или этап"/);
 assert.match(visual,/openFound\(hit\)/);
 assert.match(visual,/if\(hit\.kind==="work"\)onOpenWork\(hit\.id\)/);
 assert.match(visual,/else onEditStage\(hit\.id\)/);
 assert.match(visual,/setSearchOpen\(false\);setSearchQuery\(""\)/);
 assert.match(css,/\.atlas-source-plan-find-panel\{/);
 assert.match(css,/max-height:min\(450px,58vh\)/);
 assert.doesNotMatch(visual.slice(visual.indexOf("export function ProjectSourcePlanMap")),
  /localStorage|createItem\(|mutate\(|fetch\(/);
});


test("Search results open above the trigger instead of below the Windows viewport",()=>{
 const css=read("../desktop/src/style.css");
 assert.match(css,/\.atlas-source-plan-find-panel\{position:absolute;right:0;bottom:calc\(100% \+ 7px\);/);
 assert.doesNotMatch(css,/\.atlas-source-plan-find-panel\{position:absolute;right:0;top:calc\(100% \+ 7px\);/);
});


test("Search context stays inside one dialog and uses existing editors and sources",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(visual,/projectSourcePlanWorkContext\(project,detailWorkId\)/);
 assert.match(visual,/aria-label=\{"Связи работы "\+hit\.title\}/);
 assert.match(visual,/aria-label="Связи выбранной работы"/);
 assert.match(visual,/Открыть предшествующую работу/);
 assert.match(visual,/Открыть зависящую работу/);
 assert.match(visual,/Открыть каталог GitHub/);
 assert.match(visual,/onClick=\{\(\)=>\{closeSearch\(\);onOpenLinkedSource\(detail\.id\)\}\}/);
 assert.match(visual,/onClick=\{\(\)=>\{closeSearch\(\);onOpenGraph\(\)\}\}/);
 assert.match(visual,/onClick=\{\(\)=>\{if\(detail\.stage\)openFound\(\{kind:"stage",id:detail\.stage\.id\}\)\}\}/);
 assert.match(css,/\.atlas-source-plan-find-context\{display:grid/);
 assert.doesNotMatch(visual.slice(visual.indexOf("export function ProjectSourcePlanMap")),
  /localStorage|createItem\(|mutate\(|fetch\(/);
});


test("Long search result labels are bounded and recorded dependencies appear before source notes",()=>{
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(visual,/className="atlas-source-plan-find-stage"/);
 assert.match(visual,/title=\{hit\.stageName\}/);
 assert.match(css,/\.atlas-source-plan-find-stage,\.atlas-source-plan-find-relation>\.text-link,/);
 assert.match(css,/-webkit-line-clamp:2;/);
 const from=visual.indexOf("export function ProjectSourcePlanMap");
 const deps=visual.indexOf("detail.predecessorTotal>0&&",from);
 const stage=visual.indexOf("detail.stage&&",from);
 const source=visual.indexOf("detail.source&&",from);
 assert.ok(deps>from&&stage>deps&&source>stage);
 assert.doesNotMatch(visual.slice(from),/[—–]/);
});


test("Searching a work opens the exact saved source and folder within Atlas",()=>{
 const main=read("../desktop/src/main.tsx");
 const guide=read("../desktop/src/ProjectOrganizationGuide.tsx");
 const visual=read("../desktop/src/ProjectVisuals.tsx");
 const css=read("../desktop/src/style.css");
 assert.match(main,/const \[sourceJump,setSourceJump\]=useState/);
 assert.match(main,/projectSourcePlanWorkContext\(project,sourceJump\.workId\)/);
 assert.match(main,/onOpenLinkedSource=\{workId=>view\("sources",workId\)\}/);
 assert.match(main,/setSourceJump\(tabId==="sources"&&sourceWorkId&&project\?/);
 assert.match(main,/target\.scrollIntoView\(\{behavior:"auto",block:"start"\}\)/);
 assert.match(main,/ref=\{selected\?sourceJumpRef:undefined\}/);
 assert.match(main,/aria-label="Каталог связанной работы"/);
 assert.match(main,/linkedSource\.url&&<a className="text-link"/);
 assert.match(main,/setSourceJump\(null\)/);
 assert.match(guide,/onOpenLinkedSource=\{onOpenLinkedSource\}/);
 assert.match(visual,/Показать каталог в Atlas/);
 assert.match(css,/\.atlas-source-review-focused\{/);
 assert.doesNotMatch(main.slice(main.indexOf("const view=(tabId:Tab,"),main.indexOf("useEffect(()=>{",main.indexOf("const view=(tabId:Tab,"))),/mutate\(|commitWithReadback/);
});
test("Historical source and unavailable folder keep their provenance separate",()=>{
 const main=read("../desktop/src/main.tsx");
 assert.match(main,/linkedSource\.status==="stale"/);
 assert.match(main,/linkedSource\.status==="unavailable"/);
 assert.match(main,/linkedSource\.revisionCurrent/);
 assert.match(main,/Работа связана с прежней редакцией исходников/);
 assert.match(main,/Источник больше не подключён/);
 assert.match(main,/Каталог найден при последней сверке редакции исходников/);
 assert.doesNotMatch(main,/Каталог найден в текущем репозитории/);
});

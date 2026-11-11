// Read-only plan preparation from existing source observations and actual Atlas links.
// Filenames are evidence of a directory's existence, not evidence of a product,
// a dependency, completed work, or a requested task.
import {validate} from "./core.mjs";
import {repoName} from "./github-public.mjs";

const shaValid=value=>typeof value==="string"&&/^[a-f0-9]{40}$/i.test(value);
const rootName=value=>typeof value==="string"&&value.length>0&&value.length<=240&&
 value!=="."&&value!==".."&&!value.includes("/")&&!value.includes("\\")&&
 !/[\u0000-\u001f]/.test(value);
const roleFor=name=>{
 const part=name.toLowerCase();
 if(["docs","doc","documentation","manual","guides"].includes(part))
  return "Возможно, документация";
 if(["test","tests","spec","specs","e2e","__tests__"].includes(part))
  return "Возможно, проверки";
 if([".github",".gitlab","ci","scripts","tools"].includes(part))
  return "Возможно, инструменты разработки";
 if(["apps","app","desktop","web","frontend","backend","api","server","services"].includes(part))
  return "Возможно, приложение или сервис";
 if(["packages","libs","lib","modules","plugins"].includes(part))
  return "Возможно, общие части проекта";
 if(["src","source","sources"].includes(part))
  return "Возможно, исходный код";
 return "Назначение ещё не установлено";
};
const entryRepo=source=>{
 if(source?.kind!=="github")return null;
 try{return repoName(source.locator)}catch{return null}
};
const selectedBranch=source=>source.branch||source.summary?.defaultBranch||null;
const treeStatus=source=>{
 if(source.status!=="ok")return "unavailable";
 const tree=source.summary?.structure,branch=selectedBranch(source);
 if(!tree||tree.status!=="observed")return "unavailable";
 if(tree.branch!==branch||!shaValid(tree.commitSha)||!shaValid(source.summary?.branchHeads?.[branch])||
  tree.commitSha.toLowerCase()!==source.summary.branchHeads[branch].toLowerCase())return "stale";
 return "current";
};
const textOfSource=s=>({sourceId:s.id,repository:entryRepo(s),branch:selectedBranch(s)});
export function projectStructureGuide(snapshot,projectId,{maxFolders=24,maxSources=12,linkedFirst=false}={}){
 validate(snapshot);
 if(!Number.isInteger(maxFolders)||maxFolders<1||maxFolders>120||
    !Number.isInteger(maxSources)||maxSources<1||maxSources>40)
  throw Error("Invalid project source preview bounds");
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error("Проект не найден");
 const sourceList=project.sources.filter(s=>entryRepo(s));
 const linkCounts=new Map(),folderCounts=new Map();
 for(const item of project.items){
  if(!item.sourceId)continue;
  linkCounts.set(item.sourceId,(linkCounts.get(item.sourceId)||0)+1);
  if(item.sourcePath){
   let paths=folderCounts.get(item.sourceId);
   if(!paths){paths=new Map();folderCounts.set(item.sourceId,paths)}
   paths.set(item.sourcePath,(paths.get(item.sourcePath)||0)+1);
  }
 }
 if(linkedFirst){
  sourceList.sort((a,b)=>(linkCounts.get(b.id)||0)-(linkCounts.get(a.id)||0));
 }
 const sources=sourceList.slice(0,maxSources).map(source=>{
  const status=treeStatus(source),repo=entryRepo(source);
  const tree=status==="current"?source.summary.structure:null;
  const names=tree&&Array.isArray(tree.folders)?tree.folders.filter(rootName):[];
  if(linkedFirst){
   const linked=new Set(folderCounts.get(source.id)?.keys()||[]);
   names.sort((a,b)=>Number(linked.has(b))-Number(linked.has(a)));
  }
  const folders=names.slice(0,maxFolders).map(name=>({
    name,role:roleFor(name),sourceId:source.id,commitSha:tree.commitSha,
    workCount:folderCounts.get(source.id)?.get(name)||0,
    url:"https://github.com/"+repo+"/tree/"+tree.commitSha+"/"+encodeURIComponent(name)
   }));
  const hiddenKnownFolders=Math.max(0,names.length-folders.length);
  const observationIncomplete=Boolean(tree&&(tree.truncated||tree.limited||
   (Number.isInteger(tree.totalFolders)&&tree.totalFolders>names.length)));
  const knownFiles=tree&&Array.isArray(tree.detected)?
   tree.detected.filter(rootName).slice(0,8):[];
  return {...textOfSource(source),status,
   commitSha:tree?.commitSha??null,
   folderCount:tree?.totalFolders??null,
   displayed:folders.length,folders,knownFiles,
   hiddenKnownFolders,observationIncomplete,
   incomplete:hiddenKnownFolders>0||observationIncomplete,
   linkedWorkCount:linkCounts.get(source.id)||0};
 });
 const allRepos=new Set(sources.map(s=>s.repository.toLowerCase()));
 const ownerSet=new Set(sources.map(s=>s.repository.split("/")[0].toLowerCase()));
 const related=snapshot.projects.filter(p=>p.id!==projectId).map(p=>{
  const repoSources=p.sources.map(entryRepo).filter(Boolean);
  const shared=repoSources.filter(name=>allRepos.has(name.toLowerCase()));
  const sameOwner=repoSources.filter(name=>ownerSet.has(name.split("/")[0].toLowerCase()));
  return shared.length?{id:p.id,name:p.name,reason:"Общие исходники",evidence:shared.slice(0,3)}:
   sameOwner.length?{id:p.id,name:p.name,reason:"Один владелец GitHub",
    evidence:sameOwner.slice(0,3)}:null;
 }).filter(Boolean).slice(0,8);
 const nextAction=!project.goal?.trim()?
  {title:"Укажите, для чего нужен проект",action:"project-edit"}:
  !(project.targets||[]).length?{title:"Опишите ожидаемый результат",action:"target"}:
  !project.items.length?{title:"Добавьте первую работу",action:"item"}:null;
 return {projectId,projectName:project.name,sources,
  hiddenSources:Math.max(0,sourceList.length-sources.length),
  related,nextAction};
}
export function folderWorkAction(sourceId,commitSha,folder){
 if(typeof sourceId!=="string"||!sourceId||sourceId.length>160||
  !shaValid(commitSha)||!rootName(folder))throw Error("Некорректный источник работы");
 return "folder-work:"+encodeURIComponent(sourceId)+":"+
  commitSha.toLowerCase()+":"+encodeURIComponent(folder);
}
export function selectedSourceFolder(snapshot,projectId,action){
 validate(snapshot);
 if(typeof action!=="string"||!action.startsWith("folder-work:"))
  throw Error("Неизвестное действие по исходникам");
 const parts=action.slice("folder-work:".length).split(":");
 if(parts.length!==3)throw Error("Некорректная ссылка на каталог");
 let sourceId,folder;
 try{sourceId=decodeURIComponent(parts[0]);folder=decodeURIComponent(parts[2])}
 catch{throw Error("Некорректная ссылка на каталог")}
 const commitSha=parts[1].toLowerCase();
 if(!shaValid(commitSha)||!rootName(folder))throw Error("Некорректная ссылка на каталог");
 const project=snapshot.projects.find(p=>p.id===projectId);
 const source=project?.sources.find(s=>s.id===sourceId);
 if(!source||!entryRepo(source)||treeStatus(source)!=="current"||
    source.summary.structure.commitSha.toLowerCase()!==commitSha||
    !Array.isArray(source.summary.structure.folders)||
    !source.summary.structure.folders.includes(folder))
  throw Error("Структура проекта изменилась. Обновите источник и повторите выбор.");
 return {sourceId,folder,repository:entryRepo(source),branch:selectedBranch(source),
  commitSha};
}


// A bounded, read-only view of actual source folder -> work -> stage links.
// It never creates tasks, infers dependencies, or considers a source folder
// to be a required project component. Historical work links remain visible.
export function projectSourcePlanProjection(snapshot,projectId,{
 maxSources=8,maxFoldersPerSource=16,maxWorksPerFolder=8,maxOtherWorks=20,
 maxUnassignedStages=16
}={}){
 validate(snapshot);
 for(const n of [maxSources,maxFoldersPerSource,maxWorksPerFolder,maxOtherWorks,maxUnassignedStages]){
  if(!Number.isInteger(n)||n<1||n>120)throw Error("Некорректный предел схемы проекта");
 }
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error("Проект не найден");
 const overview=projectStructureGuide(snapshot,projectId,{
  maxSources,maxFolders:maxFoldersPerSource,linkedFirst:true
 });
 const assignedStageIds=new Set(project.items.map(work=>work.stageId).filter(Boolean));
 const unassigned=project.stages.filter(stage=>!assignedStageIds.has(stage.id));
 const unassignedStages=unassigned.slice(0,maxUnassignedStages).map(stage=>({
  id:stage.id,name:stage.name,status:stage.status
 }));
 const stageById=new Map(project.stages.map(s=>[s.id,s]));
 const workById=new Map(project.items.map(w=>[w.id,w]));
 const incoming=new Map();
 for(const edge of project.dependencies){
  if(!incoming.has(edge.to))incoming.set(edge.to,[]);
  incoming.get(edge.to).push(edge.from);
 }
 const toWork=work=>({
  id:work.id,title:work.title,state:work.state,
  stageId:work.stageId||null,
  stageName:stageById.get(work.stageId)?.name||"Без этапа",
  sourcePath:work.sourcePath||null,sourceRevision:work.sourceRevision||null,
  predecessors:(incoming.get(work.id)||[]).filter(id=>workById.has(id)).slice(0,3)
   .map(id=>({id,title:workById.get(id).title})),
  predecessorTotal:(incoming.get(work.id)||[]).length
 });
 const workByFolder=new Map();
 for(const item of project.items){
  if(!item.sourceId||!item.sourcePath)continue;
  let folders=workByFolder.get(item.sourceId);
  if(!folders){folders=new Map();workByFolder.set(item.sourceId,folders)}
  const rows=folders.get(item.sourcePath)||[];
  rows.push(item);folders.set(item.sourcePath,rows);
 }
 const represented=new Set();
 let mappedTotal=0;
 const sources=overview.sources.map(source=>{
  const folders=source.folders.map(folder=>{
   const matching=workByFolder.get(source.sourceId)?.get(folder.name)||[];
   mappedTotal+=matching.length;
   for(const w of matching)represented.add(w.id);
   const rows=matching.slice(0,maxWorksPerFolder).map(w=>({
    ...toWork(w),sameRevision:w.sourceRevision?.toLowerCase()===folder.commitSha.toLowerCase()
   }));
   return {...folder,works:rows,totalWorks:matching.length,
    hiddenWorks:matching.length-rows.length};
  });
  return {...source,folders};
 });
 const outside=project.items.filter(w=>!represented.has(w.id));
 // Keep genuine unassigned work ahead of links merely hidden by preview limits.
 const other=[...outside.filter(w=>!w.sourceId||!w.sourcePath),
  ...outside.filter(w=>w.sourceId&&w.sourcePath)];
 const shownSources=new Map(overview.sources.map(s=>[s.sourceId,s]));
 const otherRows=other.slice(0,maxOtherWorks).map(w=>({
  ...toWork(w),reason:!w.sourceId?"Каталог не указан":
   !w.sourcePath?"Привязка к каталогу пока не показана":
   !shownSources.has(w.sourceId)?"Источник не показан в схеме":
   shownSources.get(w.sourceId).status!=="current"?
    "Структура источника пока недоступна":
    "Связанный каталог вне показанной части схемы"
 }));
 const renderedWorkIds=new Set([...sources.flatMap(s=>s.folders.flatMap(f=>f.works.map(w=>w.id))),
  ...otherRows.map(w=>w.id)]);
 const links=project.dependencies.filter(d=>renderedWorkIds.has(d.from)&&
  renderedWorkIds.has(d.to)).map(d=>({from:d.from,to:d.to}));
 return {projectId,projectName:project.name,sources,otherWorks:otherRows,
  hiddenOtherWorks:other.length-otherRows.length,
  sourceCount:project.sources.filter(s=>entryRepo(s)).length,
  hiddenSources:overview.hiddenSources,
  mappedTotal,workTotal:project.items.length,
  stageTotal:project.stages.length,
  unassignedStages,hiddenUnassignedStages:unassigned.length-unassignedStages.length,
  dependencyTotal:project.dependencies.length,
  shownDependencies:links,hiddenDependencies:project.dependencies.length-links.length};
}


// Search the recorded names across the entire project. The bounded visual
// projection may omit a work or a stage, but the existing record is still
// available to open through its ordinary editor. This never writes to a plan.
const searchLabel=value=>String(value??"").normalize("NFKC")
 .toLocaleLowerCase("ru-RU").replace(/\s+/g," ").trim();
export function projectSourcePlanSearch(project,query,{limit=8,priorityWorkId=""}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.stages))
  throw Error("Проект не найден");
 if(!Number.isInteger(limit)||limit<1||limit>40)
  throw Error("Некорректный предел поиска");
 const needle=searchLabel(query);
 if(!needle)return {matches:[],total:0,hidden:0};
 const stages=new Map(project.stages.map(stage=>[stage.id,stage.name]));
 const results=[];
 let order=0;
 const add=(kind,record,stageName=null)=>{
  const label=searchLabel(kind==="work"?record.title:record.name);
  if(!label.includes(needle))return;
  const rank=label===needle?0:label.startsWith(needle)?1:2;
  results.push({kind,id:record.id,title:kind==="work"?record.title:record.name,
   stageName,rank,order:order++});
 };
 for(const work of project.items)add("work",work,
  stages.get(work.stageId)||"Без этапа");
 for(const stage of project.stages)add("stage",stage);
 results.sort((a,b)=>{
  const aSelected=a.kind==="work"&&a.id===priorityWorkId;
  const bSelected=b.kind==="work"&&b.id===priorityWorkId;
  return Number(bSelected)-Number(aSelected)||a.rank-b.rank||a.order-b.order;
 });
 const matches=results.slice(0,limit).map(({rank,order,...entry})=>entry);
 return {matches,total:results.length,hidden:results.length-matches.length};
}


// A read-only context for one recorded work. It uses the full plan, including
// dependencies and source links hidden by the bounded map. An old reference
// is not reported as a current GitHub directory.
export function projectSourcePlanWorkContext(project,workId,{maxRelated=3}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.stages)||
    !Array.isArray(project.sources)||!Array.isArray(project.dependencies))
  throw Error("Проект не найден");
 if(!Number.isInteger(maxRelated)||maxRelated<1||maxRelated>20)
  throw Error("Некорректный предел связей");
 const byId=new Map(project.items.map(work=>[work.id,work]));
 const work=byId.get(workId);
 if(!work)return null;
 const stage=project.stages.find(s=>s.id===work.stageId);
 const incoming=[],outgoing=[];
 for(const edge of project.dependencies){
  if(edge.to===work.id&&byId.has(edge.from))incoming.push(byId.get(edge.from));
  if(edge.from===work.id&&byId.has(edge.to))outgoing.push(byId.get(edge.to));
 }
 const related=items=>items.slice(0,maxRelated).map(item=>({
  id:item.id,title:item.title
 }));
 const linked=project.sources.find(source=>source.id===work.sourceId);
 const repository=entryRepo(linked);
 const status=!work.sourceId?null:!linked?"missing":
  repository?treeStatus(linked):"unavailable";
 const observation=linked?.summary?.structure;
 const revisionCurrent=status==="current"&&shaValid(work.sourceRevision)&&
  observation.commitSha.toLowerCase()===work.sourceRevision.toLowerCase();
 const folderKnown=revisionCurrent&&rootName(work.sourcePath)&&
  Array.isArray(observation.folders)&&observation.folders.includes(work.sourcePath);
 const source=work.sourceId?{
  id:work.sourceId,repository,branch:linked?selectedBranch(linked):null,
  folder:work.sourcePath||null,status,
  revisionCurrent:Boolean(revisionCurrent),
  url:repository&&folderKnown?"https://github.com/"+repository+
   "/tree/"+observation.commitSha+"/"+encodeURIComponent(work.sourcePath):null
 }:null;
 return {
  id:work.id,title:work.title,
  stage:stage?{id:stage.id,title:stage.name}:null,
  source,
  predecessorTotal:incoming.length,predecessors:related(incoming),
  successorTotal:outgoing.length,successors:related(outgoing)
 };
}

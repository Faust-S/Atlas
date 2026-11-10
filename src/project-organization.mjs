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
export function projectStructureGuide(snapshot,projectId,{maxFolders=24,maxSources=12}={}){
 validate(snapshot);
 if(!Number.isInteger(maxFolders)||maxFolders<1||maxFolders>120||
    !Number.isInteger(maxSources)||maxSources<1||maxSources>40)
  throw Error("Invalid project source preview bounds");
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error("Проект не найден");
 const sources=project.sources.filter(s=>entryRepo(s)).slice(0,maxSources).map(source=>{
  const status=treeStatus(source),repo=entryRepo(source);
  const tree=status==="current"?source.summary.structure:null;
  const folders=tree&&Array.isArray(tree.folders)?tree.folders.filter(rootName)
   .slice(0,maxFolders).map(name=>({
    name,role:roleFor(name),sourceId:source.id,commitSha:tree.commitSha,
    workCount:project.items.filter(item=>
     item.sourceId===source.id&&item.sourcePath===name).length,
    url:"https://github.com/"+repo+"/tree/"+tree.commitSha+"/"+encodeURIComponent(name)
   })):[];
  const knownFiles=tree&&Array.isArray(tree.detected)?
   tree.detected.filter(rootName).slice(0,8):[];
  const linkedWorks=project.items.filter(item=>item.sourceId===source.id);
  return {...textOfSource(source),status,
   commitSha:tree?.commitSha??null,
   folderCount:tree?.totalFolders??null,
   displayed:folders.length,folders,knownFiles,
   incomplete:Boolean(tree&&(tree.truncated||tree.limited||
    Number(tree.totalFolders)>folders.length)),
   linkedWorkCount:linkedWorks.length};
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
  hiddenSources:Math.max(0,project.sources.filter(s=>entryRepo(s)).length-sources.length),
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

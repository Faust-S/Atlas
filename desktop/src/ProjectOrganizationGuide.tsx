import React,{useEffect,useState} from "react";
import {projectStructureGuide,projectSourcePlanProjection,folderWorkAction} from "../../src/project-organization.mjs";
import {ProjectSourcePlanMap} from "./ProjectVisuals";

// Saved GitHub observations enrich this view when available; existing work,
// stage and dependency links remain usable in any project without GitHub.
// Suggested roles are explanations to review, never new project entities.
export function ProjectOrganizationGuide({snapshot,projectId,restoreSearch,onEdit,onRefresh,onOpenProject,
 onOpenSources,onOpenLinkedSource,onOpenWorks,onOpenStages,onAddRelation,onOpenTimeline,onOpenGraph,busy=false}:{
 snapshot:any;projectId:string;restoreSearch:{workId:string;query:string}|null;
 onEdit:(action:string)=>void;
 onRefresh:(sourceId:string)=>void;onOpenProject:(id:string)=>void;
 onOpenSources:()=>void;onOpenLinkedSource:(workId:string,query:string)=>void;
 onOpenWorks:()=>void;onOpenStages:()=>void;onAddRelation:()=>void;
 onOpenTimeline:()=>void;onOpenGraph:(workId?:string,query?:string)=>void;busy?:boolean;
}){
 const [moreLinks,setMoreLinks]=useState(false);
 useEffect(()=>setMoreLinks(false),[projectId]);
 const guide=projectStructureGuide(snapshot,projectId);
 const projection=projectSourcePlanProjection(snapshot,projectId,moreLinks?
  {maxSources:8,maxFoldersPerSource:16,maxWorksPerFolder:8,maxOtherWorks:20,maxUnassignedStages:16}:
  {maxSources:2,maxFoldersPerSource:4,maxWorksPerFolder:3,maxOtherWorks:6,maxUnassignedStages:4});
 const suggested=guide.nextAction;
 const hasSources=guide.sources.length>0;
 const project=snapshot.projects.find((p:any)=>p.id===projectId);
 const recordedSources=project?.sources.length??0;
 const linkedFolderWorks=project?.items.some((work:any)=>work.sourceId&&work.sourcePath)??false;
 const showMap=hasSources||projection.workTotal>0||projection.stageTotal>0;
 const hasMoreLinks=projection.hiddenSources>0||projection.hiddenOtherWorks>0||
  projection.hiddenUnassignedStages>0||
  projection.sources.some((source:any)=>source.incomplete||
   source.folders.some((folder:any)=>folder.hiddenWorks>0));
 return <section className="surface atlas-project-organization" aria-label="Состав проекта и возможные следующие действия">
  <div className="section-heading"><div>
   <h2>Состав проекта</h2>
   <p>{hasSources?
    "Здесь показаны найденные каталоги и связи, которые уже записаны в плане.":
    "Здесь показаны ваши работы, этапы и записанные зависимости."}</p>
  </div>{!recordedSources&&project?.type==="engineering"&&<button type="button"
   className="action-button" onClick={onOpenSources}>Подключить источник</button>}</div>
  {!hasSources&&recordedSources>0&&<p className="minor">
   Структура подключённых источников пока не показана. Работы и этапы остаются доступными.
   {" "}<button type="button" className="text-link" onClick={onOpenSources}>
    Посмотреть источники</button>
  </p>}
  {!showMap&&<p className="minor">Добавьте этап или работу, чтобы увидеть план проекта.</p>}
  {showMap&&<details className="atlas-source-plan-disclosure"
   open={projection.workTotal>0||projection.stageTotal>0||linkedFolderWorks||undefined}>
   <summary>{hasSources?"Схема проекта: каталоги, работы и этапы":
    "Схема проекта: работы и этапы"}</summary>
   <ProjectSourcePlanMap projection={projection} project={project}
    restoreSearch={restoreSearch} expanded={moreLinks} hasMoreLinks={hasMoreLinks}
    onToggleExpansion={()=>setMoreLinks(value=>!value)}
    onOpenWork={id=>onEdit("work:"+id)}
    onEditStage={id=>onEdit("stage-edit:"+id)}
    onSuggestFolder={(sourceId,commitSha,folder)=>
     onEdit(folderWorkAction(sourceId,commitSha,folder))}
    onOpenTimeline={onOpenTimeline} onOpenGraph={onOpenGraph}
    onOpenWorks={onOpenWorks} onOpenSources={onOpenSources}
    onOpenLinkedSource={onOpenLinkedSource}
    onOpenStages={onOpenStages}
    onCreateStage={()=>onEdit("stage")}
    onAddDependency={()=>onEdit("dep")}/>
  </details>}
  {hasSources&&<details className="atlas-organization-details"
   open={!linkedFolderWorks||undefined}>
   <summary>Каталоги и сведения об источниках</summary>
  {guide.sources.map((source:any)=><div key={source.sourceId} className="atlas-organization-source">
   <div className="atlas-organization-source-heading">
    <strong>{source.repository}</strong><span className="minor">Ветка: {source.branch||"не выбрана"}</span>
    {source.status!=="current"&&<button type="button" className="action-button"
     disabled={busy} onClick={()=>onRefresh(source.sourceId)}>Обновить сведения</button>}
   </div>
   {source.status==="current"?<>
    <p className="minor">Найдено каталогов: {source.folderCount}.
     {source.hiddenKnownFolders>0?" Часть известных каталогов скрыта в обзоре.":""}
     {source.observationIncomplete?" Сведения об источнике неполные.":""}
     {" "}Назначение каталогов требует уточнения.</p>
    <details className="atlas-organization-folders" open={snapshot.projects.find((p:any)=>p.id===projectId)?.items.length===0||undefined}>
     <summary>Каталоги и предполагаемое назначение</summary>
     {source.folders.length?<div className="atlas-organization-list">
      {source.folders.map((folder:any)=><div className="atlas-organization-row"
       key={source.sourceId+"/"+folder.name}>
       <div className="atlas-organization-item">
        <strong>{folder.name}</strong><small>{folder.role}</small>
        {folder.workCount>0&&<small>Связанных работ: {folder.workCount}</small>}
       </div>
       <div className="button-row">
        <a className="text-link" href={folder.url} target="_blank" rel="noopener noreferrer">
         Открыть каталог</a>
        <button type="button" className="action-button"
         aria-label={"Предложить работу по каталогу "+folder.name}
         onClick={()=>onEdit(folderWorkAction(source.sourceId,folder.commitSha,folder.name))}
         disabled={busy}>Предложить работу</button>
       </div>
      </div>)}
     </div>:<p className="minor">Каталогов на верхнем уровне нет.</p>}
    </details>
    {source.knownFiles.length>0&&<p className="minor">
     Файлы проекта: {source.knownFiles.join(", ")}</p>}
    {source.linkedWorkCount>0&&<button type="button" className="text-link"
     onClick={onOpenWorks}>Открыть связанные работы ({source.linkedWorkCount})</button>}
    <details className="atlas-technical-details"><summary>Версия исходников</summary>
     <code>{source.commitSha}</code></details>
   </>:<p className="minor">{source.status==="stale"?
    "С момента наблюдения ветка изменилась. Обновите сведения перед выбором работы.":
    "Atlas пока не получил структуру этой ветки. После обновления можно изучить каталоги."}</p>}
  </div>)}
  {guide.hiddenSources>0&&<p className="minor">Остальные источники ({guide.hiddenSources})
   доступны в разделе «Источники».</p>}
  </details>}
  {guide.related.length>0&&<div className="atlas-organization-related">
   <h3>Проекты, которые стоит сопоставить</h3>
   <p className="minor">Общий репозиторий или владелец GitHub ещё не означает зависимость.
    Уточните её, если один проект действительно ожидает результат другого.</p>
   <div className="atlas-organization-related-list">
    {guide.related.map((item:any)=><div key={item.id} className="atlas-organization-related-row">
     <button type="button" className="text-link" onClick={()=>onOpenProject(item.id)}>
      {item.name}</button><small>{item.reason}</small>
    </div>)}
   </div>
   <button type="button" className="action-button" onClick={onAddRelation} disabled={busy}>
    Указать зависимость между проектами</button>
  </div>}
  {suggested&&<div className="atlas-organization-next">
   <span className="minor">Что можно сделать дальше</span>
   <button type="button" className="action-button" disabled={busy}
    onClick={()=>onEdit(suggested.action)}>{suggested.title}</button>
  </div>}
  <p className="minor">Работы и связи появляются только после вашего выбора.
   Открытие каталогов и просмотр предложений план не меняют.</p>
 </section>;
}

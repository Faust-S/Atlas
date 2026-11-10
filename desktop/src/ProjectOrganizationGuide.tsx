import React from "react";
import {projectStructureGuide,folderWorkAction} from "../../src/project-organization.mjs";

// Existing project's saved GitHub observation is the only source of this view.
// Suggested roles are explanations to review, never new project entities.
export function ProjectOrganizationGuide({snapshot,projectId,onEdit,onRefresh,onOpenProject,
 onOpenSources,onOpenWorks,onAddRelation,busy=false}:{
 snapshot:any;projectId:string;onEdit:(action:string)=>void;
 onRefresh:(sourceId:string)=>void;onOpenProject:(id:string)=>void;
 onOpenSources:()=>void;onOpenWorks:()=>void;onAddRelation:()=>void;busy?:boolean;
}){
 const guide=projectStructureGuide(snapshot,projectId);
 const suggested=guide.nextAction;
 const hasSources=guide.sources.length>0;
 return <section className="surface atlas-project-organization" aria-label="Состав проекта и возможные следующие действия">
  <div className="section-heading"><div>
   <h2>Состав проекта</h2>
   <p>Atlas нашёл части исходников. Проверьте их назначение и решите, что включить в работу.</p>
  </div>{!hasSources&&<button type="button" className="action-button"
   onClick={onOpenSources}>Подключить источник</button>}</div>
  {!hasSources&&<p className="minor">Подключите исходники, чтобы увидеть их каталоги и связанные проекты.
   План проекта можно составлять и без GitHub.</p>}
  {guide.sources.map((source:any)=><div key={source.sourceId} className="atlas-organization-source">
   <div className="atlas-organization-source-heading">
    <strong>{source.repository}</strong><span className="minor">Ветка: {source.branch||"не выбрана"}</span>
    {source.status!=="current"&&<button type="button" className="action-button"
     disabled={busy} onClick={()=>onRefresh(source.sourceId)}>Обновить сведения</button>}
   </div>
   {source.status==="current"?<>
    <p className="minor">Найдено каталогов: {source.folderCount}.
     {source.incomplete?" Часть структуры пока не показана.":""}
     {" "}Назначение каталогов требует уточнения.</p>
    <details className="atlas-organization-folders" open={snapshot.projects.find((p:any)=>p.id===projectId)?.items.length===0||undefined}>
     <summary>Каталоги и предполагаемое назначение</summary>
     {source.folders.length?<div className="atlas-organization-list">
      {source.folders.map((folder:any)=><div className="atlas-organization-row"
       key={source.sourceId+"/"+folder.name}>
       <div className="atlas-organization-item">
        <strong>{folder.name}</strong><small>{folder.role}</small>
       </div>
       <div className="button-row">
        <a className="text-link" href={folder.url} target="_blank" rel="noopener noreferrer">
         Открыть каталог</a>
        <button type="button" className="action-button"
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

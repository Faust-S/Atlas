import React,{useEffect,useMemo,useState} from "react";

type Kind="project"|"work"|"source"|"baseline";
type Tab={key:string;kind:Kind;id:string};
type Props={
 project:any|null;snapshot:any;plan:any;forecast:any;dirty:boolean;
 saved:boolean;workRequest:{id:string;serial:number}|null;
 onClose:()=>void;onEditWork:(id:string)=>void;onEditProject:()=>void;
 onOpenTab:(tab:"overview"|"work"|"timeline"|"graph"|"reality"|"sources")=>void;
 onSave:()=>void;canSave:boolean;
};
const kindLabel:Record<Kind,string>={project:"Проект",work:"Работа",source:"Источник",baseline:"Контрольный план"};
const format=(value:string|null|undefined)=>value||"Не указано";
const workStatuses:Record<string,string>={
 todo:"Запланирована",in_progress:"В работе",blocked:"Заблокирована",done:"Выполнена (заявлено)"
};
export function AtlasInspectorPreview({project,snapshot,plan,forecast,dirty,saved,workRequest,
 onClose,onEditWork,onEditProject,onOpenTab,onSave,canSave}:Props){
 const defaultId=project?.id??"portfolio";
 const [tabs,setTabs]=useState<Tab[]>([{key:"project:"+defaultId,kind:"project",id:defaultId}]);
 const [active,setActive]=useState("project:"+defaultId);
 const shown=useMemo(()=>{
  const key=tabs.some(t=>t.key===active)?active:tabs[0]?.key;
  return tabs.find(t=>t.key===key)||null;
 },[tabs,active]);
 const open=(kind:Kind,id:string)=>{
  const key=kind+":"+id;
  setTabs(old=>old.some(tab=>tab.key===key)?old:
   [...old.slice(-(old.length>=8?7:8)),{kind,id,key}]);
  setActive(key);
 };
 useEffect(()=>{
  if(workRequest?.id&&project?.items?.some((w:any)=>w.id===workRequest.id))
   open("work",workRequest.id);
 },[workRequest?.serial,workRequest?.id,project?.id]);
 const close=(key:string)=>{
  const next=tabs.filter(t=>t.key!==key);
  if(!next.length){onClose();return;}
  setTabs(next);
  if(active===key)setActive(next[0].key);
 };
 const work=shown?.kind==="work"?project?.items.find((w:any)=>w.id===shown.id):null;
 const source=shown?.kind==="source"?project?.sources.find((s:any)=>s.id===shown.id):null;
 const baseline=shown?.kind==="baseline"?project?.planBaselines?.find((b:any)=>b.id===shown.id):null;
 const workPlan=work?plan?.rows?.find((r:any)=>r.id===work.id):null;
 const predecessors=work&&project?project.dependencies.filter((d:any)=>d.to===work.id):[];
 const successors=work&&project?project.dependencies.filter((d:any)=>d.from===work.id):[];
 const sourceOfWork=work?.sourceId?project?.sources?.find((s:any)=>s.id===work.sourceId):null;
 const resourceOfWork=work?.resourceId?snapshot.resources?.find((r:any)=>r.id===work.resourceId):null;
 const title=(tab:Tab)=>{
  if(tab.kind==="work")return project?.items.find((w:any)=>w.id===tab.id)?.title||"Работа";
  if(tab.kind==="source")return project?.sources.find((s:any)=>s.id===tab.id)?.locator||"Источник";
  if(tab.kind==="baseline")return project?.planBaselines?.find((b:any)=>b.id===tab.id)?.name||"План";
  return project?.name||"Портфель";
 };
 return <div className="atlas-v6-preview">
  <div className="atlas-v6-dock-header"><div><strong>Инспектор</strong><small>Выбранные объекты проекта</small></div>
   <button type="button" className="icon-button" aria-label="Скрыть инспектор" onClick={onClose}>×</button>
  </div>
  <div className="atlas-v6-dock-tabs" role="tablist" aria-label="Открытые объекты">
   {tabs.map(tab=><div className={"atlas-v6-dock-tab"+(shown?.key===tab.key?" selected":"")} key={tab.key}>
    <button type="button" role="tab" aria-selected={shown?.key===tab.key}
     aria-label={kindLabel[tab.kind]+": "+title(tab)}
     title={title(tab)} onClick={()=>setActive(tab.key)}>{title(tab)}</button>
    <button type="button" className="atlas-v6-dock-tab-close" aria-label={"Закрыть "+kindLabel[tab.kind]+": "+title(tab)}
     onClick={()=>close(tab.key)}>×</button>
   </div>)}
  </div>
  <div className="atlas-v6-preview-body" role="tabpanel">
   {shown?.kind==="project"&&<div className="atlas-v6-preview-view">
    <h2>{project?.name||"Портфель проектов"}</h2>
    {project?<><p>{project.goal||"Цель пока не определена"}</p>
     <section className="atlas-v6-preview-card"><strong>План проекта</strong>
      <p>Состояние: {project.status==="completed"?"Завершён (заявлено)":project.status==="active"?"В работе":project.status==="planned"?"Запланирован":project.status==="paused"?"Приостановлен":"Отменён"}</p>
      <p>Начало: {format(project.startDate)}</p><p>Контрольный срок: {format(project.dueDate)}</p>
      <p>Текущий календарный прогноз: {format(forecast?.projectedFinish)}</p>
      <p>Работ: {project.items.length}. Этапов: {project.stages.length}.</p>
     </section>
     <div className="atlas-v6-preview-actions">
      <button className="action-button" onClick={()=>onOpenTab("timeline")}>Гант</button>
      <button className="action-button" onClick={()=>onOpenTab("reality")}>План / факт</button>
      <button className="action-button" onClick={onEditProject}>Изменить проект</button>
     </div>
     <section className="atlas-v6-preview-card"><strong>Работы</strong>
      {project.items.slice(0,7).map((w:any)=><button type="button" className="atlas-v6-preview-link" key={w.id}
       onClick={()=>open("work",w.id)}>{w.title}</button>)}
      {project.items.length>7&&<button className="action-button" onClick={()=>onOpenTab("work")}>Все {project.items.length} работ</button>}
     </section>
     <section className="atlas-v6-preview-card"><strong>Источники и контрольные планы</strong>
      {(project.sources||[]).slice(0,5).map((source:any)=><button type="button"
       className="atlas-v6-preview-link" key={source.id}
       onClick={()=>open("source",source.id)}>{source.locator}</button>)}
      {(project.planBaselines||[]).slice(-5).reverse().map((b:any)=><button type="button"
       className="atlas-v6-preview-link" key={b.id}
       onClick={()=>open("baseline",b.id)}>{b.name}</button>)}
     </section></>:<p>Выберите проект слева или откройте портфель.</p>}
   </div>}
   {shown?.kind==="work"&&<div className="atlas-v6-preview-view">
    {work?<><h2>{work.title}</h2>
     <p>{workStatuses[work.state]||work.state}. Приоритет: {work.priority||"normal"}.</p>
     <div className="atlas-v6-preview-actions atlas-v6-preview-primary-actions">
      <button type="button" className="action-button primary"
       onClick={()=>onEditWork(work.id)}>Изменить работу</button>
      <button type="button" className="action-button"
       onClick={()=>onOpenTab("graph")}>Все зависимости</button>
     </div>
     <section className="atlas-v6-preview-card"><strong>Календарь работы</strong>
      <p>Длительность: {work.estimateDays??1} {work.durationUnit==="working_days"?"рабочих":"календарных"} дн.</p>
      <p>Расчётное начало: {format(workPlan?.startDate)}</p>
      <p>Расчётный финиш: {format(workPlan?.finishDate)}</p>
      <p>Контрольный срок: {format(work.dueDate)}</p>
      <p>Факт начала: {format(work.actualStartDate)}</p>
      <p>Факт завершения: {format(work.actualFinishDate)}</p>
     </section>
     <section className="atlas-v6-preview-card"><strong>Зависимости</strong>
      <p>Предшественники: {predecessors.length}. Последующие работы: {successors.length}.</p>
      {predecessors.slice(0,6).map((d:any)=><button type="button" className="atlas-v6-preview-link" key={"p"+d.from}
       onClick={()=>open("work",d.from)}>{project.items.find((w:any)=>w.id===d.from)?.title||"Работа"}</button>)}
      {successors.slice(0,6).map((d:any)=><button type="button" className="atlas-v6-preview-link" key={"s"+d.to}
       onClick={()=>open("work",d.to)}>→ {project.items.find((w:any)=>w.id===d.to)?.title||"Работа"}</button>)}
     </section>
     <section className="atlas-v6-preview-card"><strong>Ответственность и происхождение</strong>
      <p>Ответственный: {work.assignee||"Не указан"}</p>
      <p>Плановый ресурс: {resourceOfWork?.label||"Не назначен"}</p>
      {sourceOfWork?<button type="button" className="atlas-v6-preview-link" onClick={()=>open("source",sourceOfWork.id)}>
       Источник: {sourceOfWork.locator}</button>:<p>Источник не привязан.</p>}
     </section>
    </>:<p>Работа больше не существует в текущей редакции.</p>}
   </div>}
   {shown?.kind==="source"&&<div className="atlas-v6-preview-view">
    {source?<><h2>{source.locator}</h2>
     <section className="atlas-v6-preview-card"><strong>Сведения об источнике</strong>
      <p>Тип: {source.kind}. Ветка: {format(source.branch)}.</p>
      <p>Последнее наблюдение: {format(source.observedAt)}</p>
      <p>Состояние: {source.status==="ok"?"Сведения записаны":"Не подтверждено"}.</p>
     </section>
     <p>Наблюдение источника не является приёмкой проекта или работы.</p>
     <button className="action-button" onClick={()=>onOpenTab("sources")}>Источники проекта</button>
    </>:<p>Источник больше не существует.</p>}
   </div>}
   {shown?.kind==="baseline"&&<div className="atlas-v6-preview-view">
    {baseline?<><h2>{baseline.name}</h2>
     <section className="atlas-v6-preview-card"><strong>Контрольная редакция</strong>
      <p>Версия: {baseline.version}. Дата фиксации: {baseline.recordedAt?.slice(0,10)}.</p>
      <p>Исходная редакция портфеля: {baseline.sourceRevision}.</p>
      <p>Старт: {format(baseline.forecastStart)}. Финиш: {format(baseline.forecastFinish)}.</p>
      <p>Работ в исходном плане: {baseline.work?.length||0}.</p>
      <p>Текущий прогноз: {format(forecast?.projectedFinish)}.</p>
     </section>
     <button className="action-button" onClick={()=>onOpenTab("reality")}>Сравнить план и факт</button>
    </>:<p>Контрольная редакция недоступна.</p>}
   </div>}
  </div>
  <div className="atlas-v6-preview-footer">
   <span>{dirty?"Черновик ещё не сохранён":saved?"Сохранено в Native Store":"Портфель ещё не сохранён"}</span>
   <button className="action-button" onClick={onSave} disabled={!canSave}>Сохранить</button>
  </div>
 </div>;
}

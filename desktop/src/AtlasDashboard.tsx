import React,{useEffect,useMemo,useState} from "react";
import {projectHistoryRows} from "./history-view.mjs";
import {ATLAS_DASHBOARD_WIDGETS,DEFAULT_ATLAS_DASHBOARD,
 normalizeAtlasDashboardLayout,toggleAtlasDashboardWidget,
 moveAtlasDashboardWidget,shiftAtlasDashboardWidget} from "../../src/dashboard-layout.mjs";

// The standalone Atlas home is a projection of the live native snapshot.
// Local storage contains ONLY widget visibility/order, never Work or Result.
const KEY="iwxa.atlas.dashboard.layout.v1";
type Page="overview"|"work"|"timeline"|"reality"|"changes"|"resources"|"sources";
type Props={
 data:any;dates:any;resources:any;reviews:any[];sourceQueue:any;ecosystemRows:any[];
 dirty:boolean;onPortfolio:()=>void;onNewProject:()=>void;onConnect:()=>void;
 onOpenProject:(id:string,page?:Page)=>void;onResources:()=>void;
 onCalendar:()=>void;onReview:()=>void;onEcosystem:()=>void;onPlanSets:()=>void;onHistory:(projectId:string)=>void;
};
function initialLayout(){
 try{
  const value=localStorage.getItem(KEY);
  return value===null?[...DEFAULT_ATLAS_DASHBOARD]:normalizeAtlasDashboardLayout(JSON.parse(value));
 }catch{return [...DEFAULT_ATLAS_DASHBOARD]}
}
const date=(value:string|null|undefined)=>value||"Не определён";
const status:Record<string,string>={
 planned:"Запланирован",active:"В работе",paused:"Приостановлен",
 completed:"Завершён (заявлено)",cancelled:"Отменён"
};
const count=(value:number)=>value.toLocaleString("ru-RU");
export function AtlasDashboard({data,dates,resources,reviews,sourceQueue,ecosystemRows,dirty,
 onPortfolio,onNewProject,onConnect,onOpenProject,onResources,onCalendar,onReview,onEcosystem,onPlanSets,onHistory}:Props){
 const [layout,setLayout]=useState<string[]>(initialLayout);
 const [editing,setEditing]=useState(false);
 const [dragged,setDragged]=useState<string|null>(null);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(layout))}catch{}},[layout]);
 const projects:any[]=data.projects??[];
 const works=projects.reduce((sum:number,p:any)=>sum+p.items.length,0);
 const openWorks=projects.reduce((sum:number,p:any)=>
  sum+p.items.filter((w:any)=>w.state!=="done").length,0);
 const projected=useMemo(()=>projects.map((p:any)=>({
  project:p,forecast:dates.byId.get(p.id)
 })),[projects,dates]);
 const dated=projected.filter(({forecast}:any)=>forecast?.projectedFinish)
  .sort((a:any,b:any)=>a.forecast.projectedFinish.localeCompare(b.forecast.projectedFinish));
 const attention=projected.filter(({forecast}:any)=>forecast?.needsReview);
 const conflictResources=(resources.people??[]).filter((r:any)=>r.overloadDays>0||r.unavailableDays>0);
 const lastProjects=projects.slice(0,6);
 const recentHistory=useMemo(()=>projects.flatMap((p:any)=>
  projectHistoryRows(p).slice(0,8).map((row:any)=>({...row,projectId:p.id,projectName:p.name})))
  .sort((a:any,b:any)=>(Date.parse(b.at||"")||0)-(Date.parse(a.at||"")||0)).slice(0,7),
 [projects]);
 const widget=(id:string)=>{
  switch(id){
   case "metrics":return <div className="atlas-dash-metrics">
    <div><small>Проектов</small><strong>{count(projects.length)}</strong><button onClick={onPortfolio}>Открыть портфель</button></div>
    <div><small>Работ</small><strong>{count(works)}</strong><span>{count(openWorks)} ещё не отмечены выполненными</span></div>
    <div><small>Проектов с сигналами</small><strong>{count(attention.length)}</strong><span>Сроки, зависимости и полнота плана</span></div>
    <div><small>Решений к рассмотрению</small><strong>{count(reviews.length)}</strong><button onClick={onReview}>Открыть решения</button></div>
   </div>;
   case "schedule":return dated.length?<div className="atlas-dash-rows">
    {dated.slice(0,5).map(({project,forecast}:any)=>
     <div className="atlas-dash-row" key={project.id}>
      <div><button className="atlas-dash-link" onClick={()=>onOpenProject(project.id,"timeline")}>{project.name}</button>
       <small>{status[project.status]||project.status}{forecast.deadline?" · срок "+forecast.deadline:""}</small>
      </div><div className="atlas-dash-date">{date(forecast.projectedFinish)}
       {forecast.deadlineSlipDays>0&&<small className="atlas-dash-warn">+{forecast.deadlineSlipDays} дн. за сроком</small>}
      </div>
     </div>)}
    <div className="button-row"><button className="atlas-dash-secondary" onClick={onPortfolio}>Все прогнозы портфеля</button>
     {projects.length>1&&<button className="atlas-dash-secondary" onClick={onPlanSets}>Сравнить планы</button>}</div>
   </div>:<div className="atlas-dash-empty">Пока нет проектов с расчётным сроком. Добавьте проект и укажите дату начала и работы.
    <button onClick={onPortfolio}>Портфель</button></div>;
   case "attention":return attention.length?<div className="atlas-dash-rows">
    {attention.slice(0,5).map(({project,forecast}:any)=><div className="atlas-dash-row" key={project.id}>
     <div><button className="atlas-dash-link" onClick={()=>onOpenProject(project.id,"overview")}>{project.name}</button>
      <small>{(forecast.notes||[]).slice(0,2).join(". ")||"Требуется сверить план"}</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onOpenProject(project.id,"work")}>Работы</button>
    </div>)}
   </div>:<div className="atlas-dash-empty">По текущему календарному прогнозу нет проектов с отмеченными проблемами. Это не подтверждение выполнения или приёмки.</div>;
   case "portfolio":return lastProjects.length?<div className="atlas-dash-rows">
    {lastProjects.map((p:any)=><div className="atlas-dash-row" key={p.id}><div>
     <button className="atlas-dash-link" onClick={()=>onOpenProject(p.id)}>{p.name}</button>
     <small>{status[p.status]||p.status} · {p.items.length} работ</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onOpenProject(p.id,"work")}>Работы</button>
    </div>)}
    <button className="atlas-dash-secondary" onClick={onPortfolio}>Все проекты</button>
   </div>:<div className="atlas-dash-empty">Портфель пуст.
    <button onClick={onNewProject}>Создать проект</button>
    <button onClick={onConnect}>Подключить проект</button>
   </div>;
   case "review":return reviews.length?<div className="atlas-dash-rows">
    {reviews.slice(0,5).map((r:any,index:number)=><div className="atlas-dash-row" key={r.projectId+"-"+r.findingId+"-"+index}>
     <div><button className="atlas-dash-link" onClick={()=>onOpenProject(r.projectId,"changes")}>{r.projectName}</button>
      <small>{r.targetTitle||"Пересмотр плана"} · {r.state==="source_hold"?"Нужно проверить источник":r.state==="needs_decision"?"Ожидает решения":"Требует рассмотрения"}</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onOpenProject(r.projectId,"changes")}>Открыть</button>
    </div>)}
   </div>:<div className="atlas-dash-empty">Нет новых запросов на пересмотр плана по подтверждённым изменениям источников.</div>;
   case "resources":return (resources.people??[]).length?<div className="atlas-dash-rows">
    {(resources.people??[]).slice(0,5).map((r:any)=><div className="atlas-dash-row" key={r.id}><div>
     <strong>{r.label}</strong><small>{r.itemCount} работ · мощность {r.capacityPct}%</small></div>
     <span className={r.overloadDays>0||r.unavailableDays>0?"atlas-dash-warn":"atlas-dash-ok"}>
      {r.overloadDays>0?"Перегрузка "+r.overloadDays+" дн.":r.unavailableDays>0?"Вне доступности "+r.unavailableDays+" дн.":"Без выявленной перегрузки"}
     </span>
    </div>)}
    {conflictResources.length>0&&<small>Ресурсы не выравнивают расчётные сроки автоматически.</small>}
    <button className="atlas-dash-secondary" onClick={onResources}>Все ресурсы</button>
   </div>:<div className="atlas-dash-empty">Плановые ресурсы пока не добавлены.
    <button onClick={onResources}>Настроить ресурсы</button></div>;
   case "sources":return sourceQueue?.rows?.length?<div className="atlas-dash-rows">
    {sourceQueue.rows.slice(0,5).map((r:any,index:number)=><div className="atlas-dash-row" key={r.projectId+"-"+index}>
     <div><strong>{r.locator}{r.branch?" · "+r.branch:""}</strong>
      <small>{r.error?"Ошибка наблюдения":r.stale?"Требует повторной проверки":"Последнее наблюдение записано"}</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onOpenProject(r.projectId,"sources")}>Источник</button>
    </div>)}
   </div>:<div className="atlas-dash-empty">Публичных источников для обновления сейчас нет.
    <button onClick={onPortfolio}>Открыть портфель</button></div>;
   case "ecosystem":return ecosystemRows.length?<div className="atlas-dash-rows">
    {ecosystemRows.slice(0,6).map((r:any)=><div className="atlas-dash-row" key={r.id}>
     <div><button className="atlas-dash-link" onClick={()=>onOpenProject(r.id)}>{r.name}</button>
      <small>{r.repositories?.length??0} публичных репозиториев · {r.works} работ
       · {r.sourcesMissing?"Источник не подтверждён":"Сведения проекта доступны"}</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onOpenProject(r.id,"sources")}>Исходники</button>
    </div>)}
    <button className="atlas-dash-secondary" onClick={onEcosystem}>Карта портфеля</button>
   </div>:<div className="atlas-dash-empty">Пока нет проектов с исходниками на карте разработки.
    <button onClick={onEcosystem}>Карта портфеля</button></div>;
   case "history":return recentHistory.length?<div className="atlas-dash-rows">
    {recentHistory.map((r:any)=><div className="atlas-dash-row" key={r.projectId+":"+r.id}>
     <div><button className="atlas-dash-link" onClick={()=>onHistory(r.projectId)}>{r.projectName}</button>
      <small>{r.kind==="decision"?"Решение":"Наблюдение"} · {r.at?.slice(0,10)||"Дата не указана"}
       · {r.text||"Содержание не указано"}</small></div>
     <button className="atlas-dash-secondary" onClick={()=>onHistory(r.projectId)}>История</button>
    </div>)}
   </div>:<div className="atlas-dash-empty">В портфеле пока нет записанных решений и наблюдений.
    <button onClick={onPortfolio}>Открыть портфель</button></div>;
   case "calendar":return <div className="atlas-dash-empty">В портфеле сохранено редакций рабочих календарей: <strong>{data.calendarLibrary?.length??0}</strong>.
    <p>Календарь закрепляется за работой по конкретной редакции. Сценарий рассчитывается отдельно от сохранённого плана.</p>
    <button onClick={onCalendar}>К календарному сценарию</button></div>;
   default:return null;
  }
 };
 return <section className="atlas-dashboard" aria-label="Настраиваемая главная Atlas">
  <div className="atlas-dash-heading"><div><h1>Главная</h1>
   <p>Проекты, сроки и решения в одном месте. Расположите блоки так, как удобно для вашей работы.</p></div>
   <div className="atlas-dash-actions">
    {dirty&&<span className="atlas-dash-unsaved">Есть несохранённые изменения портфеля</span>}
    <button className="atlas-dash-secondary" type="button" aria-expanded={editing}
     onClick={()=>setEditing(!editing)}>{editing?"Готово":"Настроить дашборд"}</button>
    <button className="atlas-dash-primary" type="button" onClick={onNewProject}>Новый проект</button>
   </div></div>
  {editing&&<div className="atlas-dash-chooser" aria-label="Добавить и убрать блоки">
    <strong>Блоки главной</strong>
    {ATLAS_DASHBOARD_WIDGETS.map(w=><label key={w.id}>
     <input type="checkbox" checked={layout.includes(w.id)}
      onChange={e=>setLayout(old=>toggleAtlasDashboardWidget(old,w.id,e.target.checked))}/>{w.title}</label>)}
    <button className="atlas-dash-secondary" type="button"
     onClick={()=>setLayout([...DEFAULT_ATLAS_DASHBOARD])}>Вернуть расположение</button>
    <small>Перетаскивайте блоки. Для клавиатуры используйте кнопки вверх и вниз.</small>
   </div>}
  <div className="atlas-dash-grid">
   {layout.map(id=>{const def=ATLAS_DASHBOARD_WIDGETS.find(w=>w.id===id);if(!def)return null;
    return <section key={id} className={"atlas-dash-widget "+(def.span==="wide"?"is-wide":"")}
     draggable={editing} onDragStart={event=>{
      if(!editing)return;setDragged(id);event.dataTransfer.setData("text/plain",id);
      event.dataTransfer.effectAllowed="move";
     }} onDragOver={event=>{if(editing){event.preventDefault();event.dataTransfer.dropEffect="move"}}}
     onDrop={event=>{event.preventDefault();if(!editing)return;
      const from=dragged||event.dataTransfer.getData("text/plain");
      setLayout(old=>moveAtlasDashboardWidget(old,from,id));setDragged(null);
     }} onDragEnd={()=>setDragged(null)}>
     <div className="atlas-dash-widget-head"><h2>{def.title}</h2>
      {editing&&<div className="atlas-dash-move">
       <button aria-label={"Переместить блок вверх: "+def.title} disabled={layout[0]===id}
        onClick={()=>setLayout(old=>shiftAtlasDashboardWidget(old,id,-1))}>↑</button>
       <button aria-label={"Переместить блок вниз: "+def.title} disabled={layout.at(-1)===id}
        onClick={()=>setLayout(old=>shiftAtlasDashboardWidget(old,id,1))}>↓</button>
       <button aria-label={"Скрыть блок: "+def.title}
        onClick={()=>setLayout(old=>toggleAtlasDashboardWidget(old,id,false))}>×</button>
      </div>}</div>
     {widget(id)}
    </section>
   })}
  </div>
  {!layout.length&&<div className="atlas-dash-empty">
   Все блоки скрыты. Выберите нужные через «Настроить дашборд».</div>}
  <p className="atlas-dash-note">Данные взяты из текущего портфеля Atlas. Прогнозы не подтверждают фактическую приёмку. Расположение блоков сохраняется отдельно от проектов.</p>
 </section>;
}

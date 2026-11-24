import React,{useEffect,useMemo,useRef,useState} from "react";
import {inspectorWorkContext,inspectorPagedRows,inspectorRecentCorrection} from "./inspector-work-context.mjs";

type Kind="project"|"work"|"source"|"baseline";
type Tab={key:string;kind:Kind;id:string};
type Props={
 project:any|null;snapshot:any;plan:any;forecast:any;dirty:boolean;
 comparison:any|null;deadlineRisks:Map<string,any>;onSelectBaseline:(id:string)=>void;
 resourceConflicts:Map<string,{overloadDays:number;unavailableDays:number}>;
 onOpenResourceConflict:(resourceId:string,workId:string)=>void;
 localPlan:any|null;correctionContext:any|null;onShowAffected:()=>void;
 onOpenLinkedProject:(projectId:string,sourceWorkId:string)=>void;
 returnContext:{projectTitle:string;workTitle:string;linkedChanges:number;current:boolean}|null;
 onReturnToSource:()=>void;
 saved:boolean;workRequest:{id:string;serial:number}|null;
 onClose:()=>void;onEditWork:(id:string)=>void;onEditProject:()=>void;
 onOpenTab:(tab:"overview"|"work"|"timeline"|"graph"|"reality"|"sources"|"history")=>void;
 onSave:()=>void;canSave:boolean;
};
const kindLabel:Record<Kind,string>={project:"Проект",work:"Работа",source:"Источник",baseline:"Контрольный план"};
const format=(value:string|null|undefined)=>value||"Не указано";
const workStatuses:Record<string,string>={
 todo:"Запланирована",in_progress:"В работе",blocked:"Заблокирована",done:"Выполнена (заявлено)"
};
const priorityNames:Record<string,string>={
 low:"Низкий",normal:"Обычный",high:"Высокий",critical:"Критический"
};
const changeStatusNames:Record<string,string>={
 proposed:"Предложено",approved:"Согласовано",in_progress:"В работе",
 implemented:"Реализовано (заявлено)",deferred:"Отложено",rejected:"Отклонено"
};
const sourceTypes:Record<string,string>={
 github:"GitHub",github_owner:"Организация GitHub",gitlab:"GitLab",forgejo:"Forgejo",
 gitea:"Gitea",obsidian:"Obsidian",anytype:"Anytype",jira:"Jira",
 file:"Файл",other:"Другой источник"
};
export function AtlasInspectorPreview({project,snapshot,plan,forecast,comparison,
 deadlineRisks,onSelectBaseline,dirty,saved,workRequest,
 localPlan,correctionContext,onShowAffected,onOpenLinkedProject,returnContext,onReturnToSource,
 onClose,onEditWork,onEditProject,onOpenTab,onSave,canSave,resourceConflicts,onOpenResourceConflict}:Props){
 const defaultId=project?.id??"portfolio";
 const [tabs,setTabs]=useState<Tab[]>([{key:"project:"+defaultId,kind:"project",id:defaultId}]);
 const [active,setActive]=useState("project:"+defaultId);
 const [workSection,setWorkSection]=useState<"schedule"|"baseline"|"relations"|"history"|"impact">("schedule");
 const [relationPage,setRelationPage]=useState(0);
 const [historyPage,setHistoryPage]=useState(0);
 const [portfolioPage,setPortfolioPage]=useState(0);
 const shown=useMemo(()=>{
  const key=tabs.some(t=>t.key===active)?active:tabs[0]?.key;
  return tabs.find(t=>t.key===key)||null;
 },[tabs,active]);
 const open=(kind:Kind,id:string)=>{
  const key=kind+":"+id;
  setTabs(old=>old.some(tab=>tab.key===key)?old:
   [...old.slice(-(old.length>=8?7:8)),{kind,id,key}]);
  setActive(key);
  if(kind==="work"){setWorkSection("schedule");setRelationPage(0);setHistoryPage(0);}
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
 const facts=useMemo(()=>project&&shown?.kind==="work"?
  inspectorWorkContext(project,plan,shown.id,{
   comparison,deadlineRisks,resources:snapshot.resources??[]
  }):null,[project,plan,shown?.kind,shown?.id,comparison,deadlineRisks,snapshot.resources]);
 const work=facts?.work??null;
 const workPlan=facts?.row??null;
 const predecessors=facts?.predecessors??[];
 const successors=facts?.successors??[];
 const relationItems=[
  ...predecessors.map((linked:any)=>({id:linked.id,title:linked.title,arrow:"←",kind:"predecessor"})),
  ...successors.map((linked:any)=>({id:linked.id,title:linked.title,arrow:"→",kind:"successor"}))
 ];
 const relationWindow=inspectorPagedRows(relationItems,relationPage);
 const historyWindow=inspectorPagedRows(facts?.history??[],historyPage);
 const correction=useMemo(()=>project&&shown?.kind==="work"?
  inspectorRecentCorrection(project,snapshot.revision,shown.id,correctionContext,localPlan):null,
  [project,snapshot.revision,shown?.kind,shown?.id,correctionContext,localPlan]);
 const portfolio=correction?.portfolioChange??null;
 const portfolioWindow=inspectorPagedRows(portfolio?.rows??[],portfolioPage,2);
 useEffect(()=>setPortfolioPage(0),[project?.id,correction?.revision]);
 const lastAutoImpact=useRef<string|null>(null);
 useEffect(()=>{
  if(!correction||shown?.kind!=="work"||
   (shown.id!==correction.rootId&&!correction.followupIds.includes(shown.id)))return;
  const token=correction.projectId+":"+correction.rootId+":"+correction.revision;
  if(lastAutoImpact.current!==token){
   lastAutoImpact.current=token;
   setWorkSection("impact");
  }
 },[correction?.projectId,correction?.rootId,correction?.revision,shown?.kind,shown?.id]);
 useEffect(()=>{
  if(workSection==="impact"&&!correction)setWorkSection("schedule");
 },[workSection,correction]);
 const sourceOfWork=facts?.source??null;
 const resourceOfWork=facts?.resource??null;
 const conflict=work?resourceConflicts.get(work.id):null;
 const source=shown?.kind==="source"?project?.sources.find((s:any)=>s.id===shown.id):null;
 const baseline=shown?.kind==="baseline"?project?.planBaselines?.find((b:any)=>b.id===shown.id):null;
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
     title={title(tab)} onClick={()=>{setActive(tab.key);if(tab.kind==="work"){setWorkSection("schedule");setRelationPage(0);setHistoryPage(0)}}}>{title(tab)}</button>
    <button type="button" className="atlas-v6-dock-tab-close" aria-label={"Закрыть "+kindLabel[tab.kind]+": "+title(tab)}
     onClick={()=>close(tab.key)}>×</button>
   </div>)}
  </div>
   {returnContext&&<div className="atlas-v6-cross-project-return" role="group"
    aria-label="Исходный проект:">
    <button type="button" className="atlas-v6-cross-project-return-action"
     aria-label={"Вернуться к исходной работе "+returnContext.workTitle}
     title={"Вернуться к исходной работе "+returnContext.workTitle}
     onClick={onReturnToSource}>{"К исходной Work: "+returnContext.workTitle}</button>
    <small>{"Исходный проект: "+returnContext.projectTitle}
     {returnContext.linkedChanges>0?". Правок в зависимых проектах: "+returnContext.linkedChanges:""}
     {!returnContext.current?". План изменился. При возврате покажем работу без устаревшего расчёта.":""}</small>
   </div>}
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
     <p>{workStatuses[work.state]||work.state}. Приоритет: {priorityNames[work.priority]||"Обычный"}.</p>
     <div className="atlas-v6-preview-actions atlas-v6-preview-primary-actions">
      <button type="button" className="action-button primary"
       onClick={()=>onEditWork(work.id)}>Изменить работу</button>
      <button type="button" className="action-button"
       onClick={()=>onOpenTab("graph")}>Все зависимости</button>
      {work.resourceId&&conflict&&<button type="button" className="action-button"
       aria-label={"Устранить конфликт работы "+work.title}
       onClick={()=>onOpenResourceConflict(work.resourceId,work.id)}>Устранить конфликт</button>}
     </div>
     {conflict&&<p className="minor">Ресурсное ограничение работы: перегрузка {conflict.overloadDays} дн.; вне доступности {conflict.unavailableDays} дн.</p>}
     <div className={"atlas-v6-work-sections"+(correction?" has-impact":"")} role="tablist" aria-label="Разделы выбранной работы">
       {([
        ["schedule","Сроки"],["baseline","План"],["relations","Связи"],["history","История"]
       ] as const).map(([key,label])=><button type="button" key={key} role="tab"
        aria-selected={workSection===key} aria-label={"Инспектор: "+label.toLowerCase()}
        className={workSection===key?"is-active":""} onClick={()=>setWorkSection(key)}>
        {label}</button>)}
       {correction&&<button type="button" role="tab" aria-selected={workSection==="impact"}
        aria-label="Инспектор: итог" className={workSection==="impact"?"is-active":""}
        onClick={()=>setWorkSection("impact")}>Итог</button>}
      </div>
      {workSection==="impact"&&correction&&<section className="atlas-v6-preview-card atlas-v6-impact-summary"
       aria-label="Последствия корректировки работы">
       <strong>Последствия корректировки</strong>
       {correction.linkedFollowups?.length>0&&<p role="status" className="atlas-v6-linked-correction-count">{"Правок в связанных проектах: "+correction.linkedFollowups.length+". Прогноз от исходного плана."}</p>}
       {portfolio&&<section className="atlas-v6-portfolio-impact"
        aria-label="Последствия изменения работы для портфеля">
        <strong>Влияние на связанные проекты</strong>
        {portfolio.linkedTotal===0?
         <p role="status">У проекта нет зависимых проектов в портфеле.</p>:
         <p role="status">{"Зависимых проектов: "+portfolio.linkedTotal+
          ". Изменился прогноз у "+portfolio.affectedTotal+"."+
          (portfolio.laterTotal>0?" Позже: "+portfolio.laterTotal+".":"")+
          (portfolio.earlierTotal>0?" Раньше: "+portfolio.earlierTotal+".":"")+
          (portfolio.undatedTotal>0?" Потеряна расчётная дата: "+portfolio.undatedTotal+".":"")+
          (portfolio.restoredTotal>0?" Появилась расчётная дата: "+portfolio.restoredTotal+".":"")+
          (portfolio.newDeadlineRisks>0?" Новых нарушений срока: "+portfolio.newDeadlineRisks+".":"")}</p>}
        {portfolio.affectedTotal>0&&<div className="atlas-v6-portfolio-impact-list">
         {portfolioWindow.items.map((linked:any)=><div className="atlas-v6-portfolio-impact-row" key={linked.id}>
          <button type="button" className="atlas-v6-preview-link"
           aria-label={"Открыть зависимый проект "+linked.name}
           onClick={()=>onOpenLinkedProject(linked.id,shown.id)}>{linked.name}</button>
          <small>Начало: {format(linked.previousStart)} → {format(linked.projectedStart)}.
           {" "}Финиш: {format(linked.previousFinish)} → {format(linked.projectedFinish)}.
           {linked.finishShiftDays!==null&&linked.finishShiftDays!==0?
            " Сдвиг "+(linked.finishShiftDays>0?"+":"")+linked.finishShiftDays+" дн.":""}
           {linked.newlyUndated?" Расчётная дата больше недоступна.":""}
           {linked.newlyDated?" Появилась расчётная дата.":""}
           {linked.deadlineSlipDays>0?" Превышение контрольного срока: "+linked.deadlineSlipDays+" дн.":""}
          </small>
         </div>)}
         {portfolioWindow.pages>1&&<div className="atlas-v6-inspector-pager"
          aria-label="Страницы зависимых проектов">
          <span role="status">Проекты {portfolioWindow.start+1}–{portfolioWindow.end}
           {" "}из {portfolioWindow.total}</span>
          <button type="button" disabled={portfolioWindow.page===0}
           aria-label="Предыдущие зависимые проекты"
           onClick={()=>setPortfolioPage(portfolioWindow.page-1)}>Назад</button>
          <button type="button" disabled={portfolioWindow.page===portfolioWindow.pages-1}
           aria-label="Следующие зависимые проекты"
           onClick={()=>setPortfolioPage(portfolioWindow.page+1)}>Далее</button>
         </div>}
        </div>}
        <p>Финиш текущего проекта: было {format(portfolio.source.previousFinish)},
         стало {format(portfolio.source.projectedFinish)}.
         {portfolio.source.finishShiftDays!==null&&portfolio.source.finishShiftDays!==0?
          " Сдвиг "+(portfolio.source.finishShiftDays>0?"+":"")+
          portfolio.source.finishShiftDays+" дн.":""}</p>
        <small>Прогноз рассчитан по связям проектов и рабочим календарям.
         {dirty?" Для записи правки на диск нажмите «Сохранить».":""}</small>
       </section>}
       <p role="status">{correction.followupCount>0?
        "Последовательных правок: "+correction.followupCount+". Сравнение с планом до первого изменения.":
        "Сравнение с планом до изменения."}</p>

       <p>Изменена работа: {correction.rootTitle}.</p>
       {shown?.id!==correction.rootId&&<button type="button" className="atlas-v6-preview-link"
        aria-label={"Вернуться к исходной работе "+correction.rootTitle}
        onClick={()=>{open("work",correction.rootId);setWorkSection("impact")}}>
        К исходной работе: {correction.rootTitle}</button>}
       <p>Продолжительность проекта по CPM: было {correction.beforeDays} дн.,
        стало {correction.afterDays} дн.
        {correction.beforeDays!==correction.afterDays?
         " Сдвиг "+(correction.afterDays>correction.beforeDays?"+":"")+
          (correction.afterDays-correction.beforeDays)+" дн.":" Без сдвига длительности проекта."}
       </p>
       <p>Текущий прогноз окончания проекта: {format(forecast?.projectedFinish)}.</p>
       <p>Работ с изменениями: {correction.change.affectedTotal}.
        {correction.change.movedTotal>0?
         " Сдвинуты сроки: "+correction.change.movedTotal+
         " (позже "+correction.change.delayedTotal+", раньше "+correction.change.earlierTotal+").":""}
        {correction.change.criticalChangedTotal>0?
         " Изменён критический путь у "+correction.change.criticalChangedTotal+" работ.":""}
       </p>
       {correction.change.deadlineChangedTotal>0&&
        <p>Контрольные сроки изменены у {correction.change.deadlineChangedTotal} работ.
         {correction.change.deadlineRemovedTotal>0?
          " Снято контрольных сроков: "+correction.change.deadlineRemovedTotal+".":""}</p>}
       {correction.change.deadlineResolvedTotal>0&&
        <p>Нарушений срока по прогнозу устранено: {correction.change.deadlineResolvedTotal}.</p>}
       {correction.change.deadlineMissedTotal>0&&
        <p>Работ с просроченным контрольным сроком: {correction.change.deadlineMissedTotal}.</p>}
       {correction.change.examples.length>0&&<div className="atlas-v6-impact-items">
        <strong>Затронутые работы</strong>
        {correction.change.examples.map((affected:any)=><div className="atlas-v6-impact-row" key={affected.id}>
         <button type="button" className="atlas-v6-preview-link"
          aria-label={"Открыть затронутую работу "+affected.title}
          onClick={()=>open("work",affected.id)}>{affected.title}</button>
         <small>Финиш: {affected.previousFinishDate||"без даты"} → {affected.finishDate||"без даты"}.
          {" "}{affected.shiftDays===0?"Без сдвига":("Сдвиг "+(affected.shiftDays>0?"+":"")+affected.shiftDays+" дн.")}.
          {affected.criticalChanged?" Критический путь изменился.":""}
          {affected.dueDateChanged?" Контрольный срок изменён.":""}</small>
         <button type="button" className="action-button"
          aria-label={"Исправить затронутую работу "+affected.title}
          onClick={()=>{open("work",affected.id);onEditWork(affected.id)}}>Изменить</button>
        </div>)}
       </div>}
       {correction.change.affectedTotal>0&&
        <button type="button" className="action-button atlas-v6-impact-all"
         aria-label={"Показать все затронутые работы: "+correction.change.affectedTotal}
         onClick={onShowAffected}>Все затронутые работы ({correction.change.affectedTotal})</button>}
       <p className="atlas-v6-impact-note">{dirty?
        "Пересчёт выполнен в черновике. Для записи на диск нажмите «Сохранить».":
        "Расчёт соответствует текущему сохранённому плану."}
        {" "}Оценка относится к календарному плану без выравнивания ресурсов.</p>
      </section>}
      {workSection==="schedule"&&<section className="atlas-v6-preview-card"><strong>Календарь работы</strong>
      <p>Длительность: {work.estimateDays??1} {work.durationUnit==="working_days"?"рабочих":"календарных"} дн.</p>
      {work.notBeforeDate&&<p>Начало не ранее: {format(work.notBeforeDate)}.</p>}
      <p>Расчётное начало: {format(workPlan?.startDate)}</p>
      <p>Расчётный финиш: {format(workPlan?.finishDate)}</p>
      <p>Контрольный срок: {format(work.dueDate)}</p>
      <p>Запас по CPM: {workPlan?.floatDays==null?"Не определён":workPlan.floatDays+" дн."}</p>
      <p>{workPlan?.critical?"Работа находится на критическом пути.":"Критический путь рассчитывается по действующему календарю."}</p>
      <p>Факт начала (введён): {format(work.actualStartDate)}</p>
      <p>Факт завершения (введён): {format(work.actualFinishDate)}</p>
     </section>}
     {workSection==="baseline"&&<><section className="atlas-v6-preview-card" aria-label="Контрольный план выбранной работы">
      <strong>Исходный план и текущий прогноз</strong>
      {(project.planBaselines??[]).length>0?<>
       <label className="atlas-v6-baseline-picker">Контрольная редакция
        <select aria-label="Контрольный план работы"
         value={facts?.baseline?.id??""}
         onChange={event=>onSelectBaseline(event.target.value)}>
         {(project.planBaselines??[]).map((b:any)=>
          <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
       </label>
       {facts?.baselineRow?<div className="atlas-v6-baseline-comparison">
        <p>По исходному плану: {format(facts.baselineRow.referenceStart)} – {format(facts.baselineRow.referenceFinish)}</p>
        <p>Текущий прогноз: {format(facts.baselineRow.forecastStart)} – {format(facts.baselineRow.forecastFinish)}</p>
        <p>Изменение финиша: {facts.baselineRow.shiftDays===null?"Не определено":
         (facts.baselineRow.shiftDays>0?"+":"")+facts.baselineRow.shiftDays+" дн."}</p>
        <p>Фактическое завершение относительно плана: {facts.baselineRow.actualShiftDays===null?"Не введено":
         (facts.baselineRow.actualShiftDays>0?"+":"")+facts.baselineRow.actualShiftDays+" дн."}</p>
        {facts.baselineRow.reasons.length>0?<div className="atlas-v6-inspector-reasons">
         <strong>Зафиксированные отличия</strong>
         {facts.baselineRow.reasons.map((reason:string)=><p key={reason}>{reason}</p>)}
        </div>:<p>В исходных параметрах работы отличий нет.</p>}
       </div>:<p>Для выбранной работы сравнение пока недоступно.</p>}
       <button type="button" className="atlas-v6-preview-link" onClick={()=>onOpenTab("reality")}>
        Полное сравнение плана и факта
       </button>
      </>:<><p>Контрольный план проекта ещё не зафиксирован.</p>
       <button type="button" className="atlas-v6-preview-link" onClick={()=>onOpenTab("reality")}>
        Зафиксировать исходный план
       </button></>}
     </section>
     {facts?.deadline&&<section className="atlas-v6-preview-card" aria-label="Факторы расчётной просрочки">
      <strong>Факторы расчётной просрочки</strong>
      <p>Плановый финиш позже контрольного срока на {facts.deadline.daysLate} дн.</p>
      {facts.deadline.constraintWaitDays>0&&<p>Ожидание допустимого начала: {facts.deadline.constraintWaitDays} дн.</p>}
      {facts.deadline.calendarWaitDays>0&&<p>Ожидание рабочих дат по календарю: {facts.deadline.calendarWaitDays} дн.</p>}
      {(facts.deadline.drivers??[]).map((driver:any)=><button type="button"
       className="atlas-v6-preview-link" key={driver.id} onClick={()=>open("work",driver.id)}>
        {driver.title}</button>)}
      {facts.deadline.hiddenDrivers>0&&<p>Остальных ограничивающих работ: {facts.deadline.hiddenDrivers}.</p>}
      <small>Это объяснение календарного прогноза, а не подтверждение причины фактического отклонения.</small>
     </section>}</>}
     {workSection==="relations"&&<section className="atlas-v6-preview-card"><strong>Зависимости</strong>
      <p>Предшественники: {predecessors.length}. Последующие работы: {successors.length}.</p>
      {relationItems.length===0&&<p>Для этой работы зависимости не заданы.</p>}
      {relationWindow.items.map((linked:any)=><button type="button" className="atlas-v6-preview-link"
       key={linked.kind+":"+linked.id} onClick={()=>open("work",linked.id)}>
       {linked.arrow} {linked.title}</button>)}
      {relationWindow.pages>1&&<div className="atlas-v6-inspector-pager" aria-label="Страницы связанных работ">
       <span role="status">Связи {relationWindow.start+1}–{relationWindow.end} из {relationWindow.total}</span>
       <button type="button" disabled={relationWindow.page===0}
        aria-label="Предыдущие связанные работы"
        onClick={()=>setRelationPage(relationWindow.page-1)}>Назад</button>
       <button type="button" disabled={relationWindow.page>=relationWindow.pages-1}
        aria-label="Следующие связанные работы"
        onClick={()=>setRelationPage(relationWindow.page+1)}>Далее</button>
      </div>}
     </section>}
     {workSection==="schedule"&&<section className="atlas-v6-preview-card"><strong>Ответственность и происхождение</strong>
      <p>Ответственный: {work.assignee||"Не указан"}</p>
      <p>Плановый ресурс: {resourceOfWork?.label||"Не назначен"}</p>
      {sourceOfWork?<button type="button" className="atlas-v6-preview-link" onClick={()=>open("source",sourceOfWork.id)}>
       Источник: {sourceOfWork.locator}</button>:<p>Источник не привязан.</p>}
     </section>}
     {workSection==="history"&&<section className="atlas-v6-preview-card" aria-label="Связанные решения и наблюдения">
      <strong>Решения и наблюдения</strong>
      {facts?.relatedChange&&<p>Изменение «{facts.relatedChange.title}»: {changeStatusNames[facts.relatedChange.status]||"Не определено"}.</p>}
      {(facts?.history??[]).length>0?
       <>{historyWindow.items.map((record:any)=>
        <div className="atlas-v6-inspector-history" key={record.kind+":"+record.id}>
         <small>{record.kind==="decision"?"Решение по изменению":
          record.scope==="work"?"Наблюдение по работе":"Наблюдение по общей цели"}
          {" · "}{format(record.at?.slice(0,10))}</small>
         <p>{record.text||"Запись без пояснения"}</p>
         {record.source&&<small>Источник: {record.source}</small>}
        </div>)}
        {historyWindow.pages>1&&<div className="atlas-v6-inspector-pager" aria-label="Страницы истории работы">
         <span role="status">Записи {historyWindow.start+1}–{historyWindow.end} из {historyWindow.total}</span>
         <button type="button" disabled={historyWindow.page===0}
          aria-label="Предыдущие записи работы"
          onClick={()=>setHistoryPage(historyWindow.page-1)}>Назад</button>
         <button type="button" disabled={historyWindow.page>=historyWindow.pages-1}
          aria-label="Следующие записи работы"
          onClick={()=>setHistoryPage(historyWindow.page+1)}>Далее</button>
        </div>}</>:
       <p>Для этой работы пока нет явно связанных решений и наблюдений.</p>}
      <button type="button" className="atlas-v6-preview-link" onClick={()=>onOpenTab("history")}>
       Открыть полную историю проекта</button>
     </section>}
    </>:<p>Работа больше не существует в текущей редакции.</p>}
   </div>}
   {shown?.kind==="source"&&<div className="atlas-v6-preview-view">
    {source?<><h2>{source.locator}</h2>
     <section className="atlas-v6-preview-card"><strong>Сведения об источнике</strong>
      <p>Тип: {sourceTypes[source.kind]||"Другой источник"}. Ветка: {format(source.branch)}.</p>
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

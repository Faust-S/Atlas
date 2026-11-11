import React,{useEffect,useMemo,useRef,useState} from 'react';
import {dependencyDiagram,ganttViewport,ganttFocusOffset} from './visual-layout.mjs';
import {portfolioNetwork} from '../../src/portfolio.mjs';
import {projectSourcePlanSearch,projectSourcePlanWorkContext} from '../../src/project-organization.mjs';

type CPM={durationDays:number;rows:Array<{id:string;title:string;earlyStart:number;earlyFinish:number;durationDays:number;critical:boolean;state:string;predecessors:string[];blockedBy:string[];floatDays:number}>};
type Mode='fit'|'30'|'90';
const statusName:Record<string,string>={todo:'Запланировано',in_progress:'В работе',blocked:'Заблокировано',done:'Выполнено (заявлено)'};
const trim=(value:string,max=110)=>value.length>max?value.slice(0,max-1)+'…':value;

export function ProjectGantt({schedule,projectStart,projectDue,portfolioStart,shiftDays,projectStatus,unavailableOrigins,onOpenWork,onOpenProject,onEditDates}:{
 schedule:CPM;projectStart:string|null;projectDue:string|null;portfolioStart:string|null;
 shiftDays:number|null;projectStatus:string;
 unavailableOrigins:Array<{id:string;name:string;status:string}>;
 onOpenWork:(id:string)=>void;onOpenProject:(id:string)=>void;onEditDates:()=>void
}){
 const [scale,setScale]=useState<Mode>('fit');
 const [offset,setOffset]=useState(0);
 const [query,setQuery]=useState('');
 const [matchIndex,setMatchIndex]=useState(0);
 const [criticalOnly,setCriticalOnly]=useState(false);
 const [visibleLimit,setVisibleLimit]=useState(160);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(!expanded)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false)}};
  window.addEventListener('keydown',close);
  return ()=>window.removeEventListener('keydown',close);
 },[expanded]);
 const view=useMemo(()=>ganttViewport(schedule,{scale,offset,startDate:projectStart,dueDate:projectDue} as any),
  [schedule,scale,offset,projectStart,projectDue]);
 const matching=view.rows.filter((r:any)=>(!criticalOnly||r.critical)&&r.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU')));
 const focusMatch=(index:number)=>{
  const row=matching[index];
  if(!row)return;
  const targetScale:Mode=scale==='fit'?'30':scale;
  setMatchIndex(index);
  setScale(targetScale);
  setOffset(ganttFocusOffset(schedule,row.id,targetScale));
  setVisibleLimit(160);
 };
 const inWindow=matching.filter((r:any)=>r.visible);
 // In zoomed mode list work intersecting the calendar viewport, not the
 // first 160 items (which may all be off screen in a large project).
 const candidates=scale==='fit'?matching:inWindow;
 const displayed=candidates.slice(0,visibleLimit);
 const nearest=matching.reduce((best:any,row:any)=>
  !best||Math.abs(row.earlyStart-view.from)<Math.abs(best.earlyStart-view.from)?row:best,null);
 const guide=(key:string)=><>
  {view.ticks.map((tick:any)=><span className="atlas-gantt-guide" aria-hidden="true" key={key+'-tick-'+tick.day} style={{left:tick.positionPct+'%'}}/>)}
  {view.deadline&&<span className="atlas-gantt-deadline" aria-hidden="true" title={'Контрольный срок: '+view.deadline.label} style={{left:view.deadline.positionPct+'%'}}/>}
 </>;
 return <section className={'surface atlas-gantt-panel'+(expanded?' is-expanded':'')} role={expanded?'dialog':undefined}
  aria-label={expanded?'Развёрнутый график CPM':undefined} aria-modal={expanded?'true':undefined}>
  <div className="section-heading"><div><h2>План-график CPM</h2>
   <p>Расчётная длительность и критический путь по календарным дням. Состояния работ — заявления, а не фактическая приёмка.</p></div>
   <div className="button-row"><span className="status-chip">{schedule.rows.length} работ · {schedule.durationDays} дн.</span>
    <button type="button" className="action-button" onClick={()=>{setExpanded(false);onEditDates()}}>Плановые даты</button>
    <button type="button" className="action-button" aria-expanded={expanded}
     onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть график':'Развернуть график'}</button></div></div>
  <div className="atlas-gantt-tools">
   <label>Масштаб <select value={scale} onChange={e=>{setScale(e.target.value as Mode);setOffset(0);setVisibleLimit(160)}}>
    <option value="fit">Весь проект</option><option value="30">30 дней</option><option value="90">90 дней</option>
   </select></label>
   <button type="button" className="action-button" disabled={scale==='fit'||view.from===0}
    onClick={()=>setOffset(Math.max(0,view.from-view.days))}>← Ранее</button>
   <button type="button" className="action-button" disabled={scale==='fit'||view.from>=view.maxOffset}
    onClick={()=>setOffset(Math.min(view.maxOffset,view.from+view.days))}>Позднее →</button>
   <span className="atlas-range">{view.windowLabel}</span>
   <label className="atlas-gantt-query">Поиск <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setMatchIndex(0);setVisibleLimit(160)}} placeholder="Название работы"/></label>
   <label className="atlas-check"><input type="checkbox" checked={criticalOnly} onChange={e=>{setCriticalOnly(e.target.checked);setMatchIndex(0);setVisibleLimit(160)}}/> Критический путь</label>
   {!!query.trim()&&<div className="atlas-gantt-matches">
    <span className="atlas-range">{matching.length?String(Math.min(matchIndex+1,matching.length))+' из '+matching.length+' работ':'Нет совпадений'}</span>
    {matching.length>0&&<>
     <button type="button" className="action-button" disabled={matchIndex<=0} onClick={()=>focusMatch(Math.max(0,matchIndex-1))} title="Предыдущая найденная работа">←</button>
     <button type="button" className="action-button" disabled={matchIndex>=matching.length-1} onClick={()=>focusMatch(Math.min(matching.length-1,matchIndex+1))} title="Следующая найденная работа">→</button>
     <button type="button" className="action-button" onClick={()=>focusMatch(Math.min(matchIndex,matching.length-1))}>Показать на шкале</button>
    </>}
   </div>}
  </div>
  {(projectStatus==='paused'||projectStatus==='cancelled')&&<p className="atlas-schedule-warning" role="status">
   {projectStatus==='cancelled'?'Проект отменён':'Проект приостановлен'}.
   Диаграмма ниже показывает исходный календарный план CPM для анализа, а не действующую дату поставки.
   Возобновление или корректировка плана требует отдельного решения человека.
  </p>}
  {projectStatus!=='paused'&&projectStatus!=='cancelled'&&unavailableOrigins.length>0&&
   <div className="atlas-schedule-warning" role="status">
    Поставка этого проекта не имеет расчётной даты: один или несколько предшественников приостановлены или отменены.
    Ниже показан собственный план работ, а не доступная дата начала проекта.
    <div className="button-row">
     {unavailableOrigins.slice(0,5).map(origin=>
      <button type="button" className="action-button" key={origin.id}
       onClick={()=>{setExpanded(false);onOpenProject(origin.id)}}>
       {origin.name} ({origin.status==='cancelled'?'отменён':'приостановлен'})
      </button>)}
     {unavailableOrigins.length>5&&<small>И ещё {unavailableOrigins.length-5} причин в портфеле</small>}
    </div>
   </div>}
  {(shiftDays!=null&&shiftDays>0)&&<p className="atlas-schedule-warning">Начало с учётом межпроектных зависимостей сдвинуто на +{shiftDays} дн.: {portfolioStart||'нет расчётной даты'}. Шкала ниже показывает исходный CPM от планового старта и не переписывает даты автоматически.</p>}
  {!projectStart&&<p className="minor">Начальная дата не задана: на оси показаны относительные дни, не календарные даты.</p>}
  <div className="atlas-gantt-key" aria-label="Условные обозначения"><span><i className="key-normal"/>Плановая работа</span>
   <span><i className="key-critical"/>Критический путь</span><span><i className="key-done"/>Заявлено выполнение</span>
   <span><i className="key-milestone"/>Работа 0 дней</span>{view.deadline&&<span><i className="key-deadline"/>Контрольный срок</span>}</div>
  <div className="atlas-gantt-scroller" role="region" aria-label="График работ с прокруткой" tabIndex={0}>
   <div className="atlas-gantt-axis">
    <strong className="atlas-gantt-name">Работа</strong><div className="atlas-gantt-track atlas-gantt-scale">
     {guide('axis')}{view.ticks.map((tick:any)=><span key={tick.day} className="atlas-gantt-tick" style={{left:tick.positionPct+'%'}}>{tick.label}</span>)}
    </div><strong>Дл.</strong>
   </div>
   {displayed.map((row:any)=><div className="atlas-gantt-row" key={row.id}>
    <button className="atlas-gantt-work" title={row.title} onClick={()=>{setExpanded(false);onOpenWork(row.id)}}>{trim(row.title,65)}
     <small>{statusName[row.state]||row.state}{row.critical?' · критическая':''}</small></button>
    <div className="atlas-gantt-track">
     {guide(row.id)}
     {row.visible&&<button type="button" onClick={()=>{setExpanded(false);onOpenWork(row.id)}}
      title={row.title+' · '+row.dateStart+' → '+row.dateFinish+' · '+row.durationDays+' дн. · '+(statusName[row.state]||row.state)}
      aria-label={'Открыть работу '+row.title}
      className={'atlas-gantt-bar'+(row.isMilestone?' is-milestone':'')+(row.critical?' is-critical':'')+(row.state==='done'?' is-done':'')+(row.state==='blocked'?' is-blocked':'')}
      style={{left:row.leftPct+'%',width:row.isMilestone?'10px':Math.max(0.45,row.widthPct)+'%'}}/>}
    </div><span className="atlas-gantt-days">{row.durationDays} дн.</span>
   </div>)}
  </div>
  {!matching.length&&<p className="minor">По выбранному фильтру работ нет.</p>}
  {scale!=='fit'&&<p className="minor">В выбранном периоде: {inWindow.length} из {matching.length} работ по текущему фильтру.</p>}
  {scale!=='fit'&&matching.length>0&&!inWindow.length&&nearest&&
   <p className="minor">На этом участке календаря нет работ из выборки.{' '}
    <button type="button" className="action-button"
     onClick={()=>setOffset(Math.min(view.maxOffset,Math.max(0,nearest.earlyStart)))}>
     Перейти к ближайшей работе
    </button></p>}
  {candidates.length>0&&<p className="minor">Показано {displayed.length} из {candidates.length} работ на графике. Остальные доступны через раскрытие или поиск.</p>}
  {candidates.length>displayed.length&&<button type="button" className="action-button"
   onClick={()=>setVisibleLimit(limit=>Math.min(candidates.length,limit+160))}>
   Показать ещё 160 работ
  </button>}
  <p className="minor">Расчёт не распределяет загрузку сотрудников, не подтверждает фактическое исполнение и не переносит автоматически сроки. Изменение плана оформляется отдельно через вкладку «Изменения».</p>
 </section>;
}

export function ProjectDependencyDiagram({schedule,onOpenWork}:{schedule:CPM;onOpenWork:(id:string)=>void}){
 const [query,setQuery]=useState('');
 const [matchIndex,setMatchIndex]=useState(0);
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{
  if(!expanded)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setExpanded(false)}};
  window.addEventListener('keydown',close);
  return ()=>window.removeEventListener('keydown',close);
 },[expanded]);
 const matches=useMemo(()=>query.trim()?schedule.rows.filter(row=>row.title.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'))):[],[schedule,query]);
 const activeMatch=matches[Math.min(matchIndex,Math.max(0,matches.length-1))];
 const display=useMemo(()=>dependencyDiagram(schedule,{limit:80,focusId:activeMatch?.id||null} as any),[schedule,activeMatch?.id]);
 return <div className={'atlas-dag-panel'+(expanded?' is-expanded':'')} role={expanded?'dialog':undefined}
  aria-label={expanded?'Развёрнутый граф зависимостей':undefined} aria-modal={expanded?'true':undefined}>
  <div className="atlas-graph-tools">
   <button type="button" className="action-button" aria-expanded={expanded}
    onClick={()=>setExpanded(v=>!v)}>{expanded?'Свернуть граф':'Развернуть граф'}</button><label>Найти работу <input type="search" value={query} placeholder="Название или фрагмент" onChange={e=>{setQuery(e.target.value);setMatchIndex(0)}}/></label>
   {!!query.trim()&&<><span className="atlas-range">{matches.length?String(Math.min(matchIndex+1,matches.length))+' из '+matches.length+' совпадений':'Нет совпадений'}</span>
    <button type="button" className="action-button" disabled={matchIndex<=0} onClick={()=>setMatchIndex(i=>Math.max(0,i-1))}>←</button>
    <button type="button" className="action-button" disabled={matchIndex>=matches.length-1} onClick={()=>setMatchIndex(i=>Math.min(matches.length-1,i+1))}>→</button>
    <button type="button" className="action-button" onClick={()=>{setQuery('');setMatchIndex(0)}}>Сбросить</button></>}
  </div>
  {!schedule.rows.length?<p className="minor">Работ пока нет. Добавьте их в таблице.</p>:
   query.trim()&&!matches.length?<p className="minor">Не найдено ни одной работы с таким названием.</p>:<>
    <p className="minor">Слева — предшественники, справа — зависимые работы. Красными линиями выделены связи на критическом пути. Нажатие на узел открывает работу.</p>
    <div className="atlas-dependency-scroll" role="region" tabIndex={0} aria-label="Ориентированный граф работ с прокруткой">
     <div className="atlas-dependency-layout" style={{width:display.width,height:display.height}}>
      <svg className="atlas-dependency-lines" width={display.width} height={display.height} viewBox={'0 0 '+display.width+' '+display.height} aria-hidden="true">
       <defs><marker id="atlas-dag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7394bb"/></marker>
        <marker id="atlas-dag-critical-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#c2615b"/></marker></defs>
       {display.edges.map((edge:any)=><path key={edge.from+'-'+edge.to} d={edge.path}
        className={'atlas-dependency-edge'+(edge.critical?' critical':'')}
        markerEnd={edge.critical?'url(#atlas-dag-critical-arrow)':'url(#atlas-dag-arrow)'}/>)}
      </svg>
      {display.nodes.map((node:any)=><button key={node.id} type="button" title={node.title}
       onClick={()=>{setExpanded(false);onOpenWork(node.id)}}
       className={'atlas-dependency-node'+(node.critical?' critical':'')+(node.state==='done'?' done':'')+(activeMatch?.id===node.id?' focused':'')}
       style={{left:node.x,top:node.y,width:node.width,height:node.height}}>
       <strong>{trim(node.title,66)}</strong><small>{statusName[node.state]||node.state}
        {node.critical?' · критическая':' · резерв '+node.floatDays+' дн.'}</small>
      </button>)}
     </div>
    </div>
    {display.partial&&<p className="minor">Визуально показано {display.shown} из {display.total} работ. {activeMatch?'Это окружение выбранной работы (до двух связей в каждую сторону).':'Для большого проекта найдите работу, чтобы увидеть её окружение.'} Полный список связей находится в таблице ниже.</p>}
   </>}
 </div>;
}

/** Interactive projection of the existing portfolio dependency DAG.
 * A planning arrow never certifies a product release or grants task execution. */
export function PortfolioNetworkMap({snapshot,onOpenProject}:{
 snapshot:any;onOpenProject:(projectId:string)=>void
}){
 const network=useMemo(()=>portfolioNetwork(snapshot),[snapshot]);
 const markerId=React.useId().replace(/:/g,'');
 const labels:Record<string,string>={planned:'Запланирован',active:'В работе',
  paused:'Приостановлен',completed:'Завершён (заявлено)',cancelled:'Отменён'};
 if(!network.links.length)return <p className="minor">Межпроектные зависимости ещё не заданы.
  Свяжите проекты, чтобы видеть, чей результат необходим следующему продукту.</p>;
 if(network.nodes.length>100)return <p className="minor">В портфеле больше 100 проектов.
  Полная таблица связей находится ниже; интерактивная карта ограничена 100 узлами.</p>;
 const byId=new Map<string,any>(network.nodes.map((node:any)=>[node.id,node]));
 const width=Math.max(340,...network.nodes.map((node:any)=>node.x+230));
 const height=Math.max(150,...network.nodes.map((node:any)=>node.y+104));
 return <div className="atlas-portfolio-dependency-map" aria-label="Карта зависимостей проектов">
  <p className="minor">Стрелка показывает плановую зависимость, а не подтверждённую передачу результата.
   Нажмите на продукт, чтобы открыть его требования, работы и источники.</p>
  <div className="atlas-dependency-scroll" role="region" tabIndex={0}
   aria-label="Карта зависимостей продуктов с прокруткой">
   <div className="atlas-dependency-layout" style={{width,height}}>
    <svg className="atlas-dependency-lines" width={width} height={height}
     viewBox={'0 0 '+width+' '+height} aria-hidden="true">
     <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="7" markerHeight="7" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#7394bb"/>
     </marker></defs>
     {network.links.map((link:any)=>{
      const from=byId.get(link.from),to=byId.get(link.to);
      const x1=from.x+204,y1=from.y+39,x2=to.x,y2=to.y+39,middle=(x1+x2)/2;
      return <path key={link.id} className="atlas-dependency-edge"
       d={'M '+x1+' '+y1+' C '+middle+' '+y1+' '+middle+' '+y2+' '+x2+' '+y2}
       markerEnd={'url(#'+markerId+')'}/>;
     })}
    </svg>
    {network.nodes.map((node:any)=><button key={node.id} type="button"
     className={'atlas-dependency-node'+(node.status==='completed'?' done':'')}
     style={{left:node.x,top:node.y,width:204,height:78}}
     title={node.name} aria-label={'Открыть проект: '+node.name}
     onClick={()=>onOpenProject(node.id)}>
     <strong>{trim(node.name,30)}</strong>
     <small>{labels[node.status]||node.status} · требований: {node.targets}</small>
    </button>)}
   </div>
  </div>
  <p className="minor">Зависимых проектов: {network.affected}.
   {" "}Ожидают результата предшественника: {network.pending}.
   {" "}Заявленное завершение предшественника требует проверки: {network.needsReview}.</p>
 </div>;
}


// A navigable projection of saved GitHub observations and existing Atlas work.
// The connectors illustrate only confirmed user-created work/stage assignments.
// No component or dependency is created by opening the diagram.
export function ProjectSourcePlanMap({projection,project,restoreSearch,onOpenWork,onEditStage,onSuggestFolder,
 onOpenTimeline,onOpenGraph,onOpenWorks,onOpenSources,onOpenLinkedSource,onOpenStages,
 onCreateStage,onAddDependency,
 expanded,hasMoreLinks,onToggleExpansion}:{
 projection:any;project:any;restoreSearch:{workId:string;query:string}|null;
 onOpenWork:(id:string)=>void;onEditStage:(id:string)=>void;
 onSuggestFolder:(sourceId:string,commitSha:string,folder:string)=>void;
 onOpenTimeline:()=>void;onOpenGraph:()=>void;
 onOpenWorks:()=>void;onOpenSources:()=>void;onOpenStages:()=>void;
 onOpenLinkedSource:(workId:string,query:string)=>void;
 onCreateStage:()=>void;onAddDependency:()=>void;
 expanded:boolean;hasMoreLinks:boolean;onToggleExpansion:()=>void;
}){
 const [searchOpen,setSearchOpen]=useState(false);
 const [searchQuery,setSearchQuery]=useState("");
 const [detailWorkId,setDetailWorkId]=useState<string|null>(null);
 const inputRef=useRef<HTMLInputElement|null>(null);
 const triggerRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{
  setSearchOpen(false);setSearchQuery("");setDetailWorkId(null);
 },[projection.projectId]);
 useEffect(()=>{
  if(!restoreSearch?.workId)return;
  const work=project?.items?.find((item:any)=>item.id===restoreSearch.workId);
  if(!work)return;
  const previous=restoreSearch.query.trim();
  // A search can match many identical names. Pin the previously selected
  // work ahead of the eight-item preview when returning from sources.
  const valid=previous&&projectSourcePlanSearch(project,previous,{
   limit:8,priorityWorkId:work.id
  }).matches.some((hit:any)=>hit.kind==="work"&&hit.id===work.id);
  setSearchQuery(valid?previous:work.title);
  setDetailWorkId(work.id);setSearchOpen(true);
 },[projection.projectId,restoreSearch?.workId,restoreSearch?.query]);
 useEffect(()=>{if(searchOpen)inputRef.current?.focus()},[searchOpen]);
 const found=useMemo(()=>projectSourcePlanSearch(project,searchQuery,{
  limit:8,priorityWorkId:detailWorkId
 }),[project,searchQuery,detailWorkId]);
 const detail=useMemo(()=>detailWorkId?
  projectSourcePlanWorkContext(project,detailWorkId):null,[project,detailWorkId]);
 const closeSearch=()=>{
  setSearchOpen(false);setSearchQuery("");setDetailWorkId(null);
 };
 const openFound=(hit:any)=>{
  closeSearch();
  if(hit.kind==="work")onOpenWork(hit.id);
  else onEditStage(hit.id);
 };
 return <div className="atlas-source-plan-map"
  aria-label={projection.sources.length?"Схема каталогов, работ и этапов":
   "Схема работ, этапов и зависимостей"}>
  <div className="section-heading"><div><h3>Как связаны части проекта</h3>
   <p>{projection.sources.length?
    "Каталог, работа и этап показаны рядом, если связь уже есть в плане.":
    "Работы, этапы и зависимости показаны по сохранённому плану."}</p></div>
   <div className="button-row">
    <div className="atlas-source-plan-find">
     <button type="button" ref={triggerRef} className="action-button"
      aria-expanded={searchOpen} onClick={()=>setSearchOpen(open=>!open)}>Найти</button>
     {searchOpen&&<div className="atlas-source-plan-find-panel" role="search"
      onKeyDown={event=>{
       if(event.key==="Escape"){
        event.preventDefault();event.stopPropagation();closeSearch();
        triggerRef.current?.focus();
       }
      }}>
      <label>Работа или этап
       <input ref={inputRef} type="search" aria-label="Найти работу или этап"
        placeholder="Название или фрагмент" value={searchQuery}
        onChange={event=>{
         setSearchQuery(event.target.value);setDetailWorkId(null);
        }}/>
      </label>
      {searchQuery.trim()?<>
       <p className="minor" role="status">{found.total?
        "Найдено: "+found.total:"Совпадений нет"}</p>
       <div className="atlas-source-plan-find-results">
        {found.matches.map((hit:any)=><div className="atlas-source-plan-find-item"
         key={hit.kind+":"+hit.id}>
         <button type="button" className="atlas-source-plan-find-hit" title={hit.title}
          aria-label={(hit.kind==="work"?"Открыть работу ":"Открыть этап ")+hit.title}
          onClick={()=>openFound(hit)}>
          <small>{hit.kind==="work"?"Работа":"Этап"}</small>
          <strong>{hit.title}</strong>
          {hit.kind==="work"&&<small className="atlas-source-plan-find-stage"
           title={hit.stageName}>{hit.stageName}</small>}
         </button>
         {hit.kind==="work"&&<button type="button" className="text-link"
          aria-label={"Связи работы "+hit.title}
          aria-expanded={detailWorkId===hit.id}
          onClick={()=>setDetailWorkId(current=>current===hit.id?null:hit.id)}>
          {detailWorkId===hit.id?"Скрыть связи":"Связи работы"}
         </button>}
         {detailWorkId===hit.id&&detail&&<div className="atlas-source-plan-find-context"
          role="group" aria-label="Связи выбранной работы">
          {detail.predecessorTotal>0&&<div className="atlas-source-plan-find-relation">
           <small>Предшествующих работ: {detail.predecessorTotal}</small>
           {detail.predecessors.map((related:any)=><button key={related.id}
            type="button" className="text-link" title={related.title}
            aria-label={"Открыть предшествующую работу "+related.title}
            onClick={()=>openFound({kind:"work",id:related.id})}>
            {related.title}</button>)}
          </div>}
          {detail.successorTotal>0&&<div className="atlas-source-plan-find-relation">
           <small>Зависящих работ: {detail.successorTotal}</small>
           {detail.successors.map((related:any)=><button key={related.id}
            type="button" className="text-link" title={related.title}
            aria-label={"Открыть зависящую работу "+related.title}
            onClick={()=>openFound({kind:"work",id:related.id})}>
            {related.title}</button>)}
          </div>}
          {detail.stage&&<div className="atlas-source-plan-find-relation">
           <small>Этап</small>
           <button type="button" className="text-link"
            aria-label={"Открыть этап работы "+detail.stage.title}
            onClick={()=>{if(detail.stage)openFound({kind:"stage",id:detail.stage.id})}}>
            {detail.stage.title}</button>
          </div>}
          {detail.source&&<div className="atlas-source-plan-find-relation">
           <small>Исходники</small>
           <span title={(detail.source.repository||"Источник не найден")+
            (detail.source.folder?" / "+detail.source.folder:"")}>
            {detail.source.repository||"Подключённый источник отсутствует"}
            {detail.source.folder?" / "+detail.source.folder:""}</span>
           <small>{detail.source.status==="missing"?
            "Источник больше не подключён":detail.source.status==="unavailable"?
            "Сведения об источнике сейчас недоступны":
            detail.source.revisionCurrent?"Сохранённые редакции совпадают":
            "Работа связана с прежней редакцией исходников"}</small>
           <div className="atlas-source-plan-find-links">
            <button type="button" className="text-link"
             onClick={()=>onOpenLinkedSource(detail.id,searchQuery)}>
             Показать каталог в Atlas</button>
            {detail.source.url&&<a className="text-link"
             href={detail.source.url} target="_blank" rel="noopener noreferrer">
             Открыть каталог GitHub</a>}
           </div>
          </div>}
          {(detail.predecessorTotal>detail.predecessors.length||
            detail.successorTotal>detail.successors.length)&&
           <button type="button" className="text-link"
            onClick={()=>{closeSearch();onOpenGraph()}}>
            Все зависимости на схеме</button>}
          {!detail.source&&!detail.stage&&!detail.predecessorTotal&&
           !detail.successorTotal&&<small>Связи пока не записаны.</small>}
         </div>}
        </div>)}
       </div>
       {found.hidden>0&&<p className="minor">
        Показаны первые {found.matches.length} результатов. Уточните название.</p>}
      </>:<p className="minor">Поиск по всем работам и этапам проекта.</p>}
     </div>}
    </div>
    <button type="button" className="action-button" disabled={!projection.workTotal}
     onClick={onOpenTimeline}>План-график</button>
    <button type="button" className="action-button" disabled={!projection.workTotal}
     onClick={onOpenGraph}>Зависимости работ</button>
    {(hasMoreLinks||expanded)&&<button type="button" className="action-button"
     aria-expanded={expanded} onClick={onToggleExpansion}>
     {expanded?"Свернуть схему":"Показать больше связей"}</button>}
   </div>
  </div>
  {projection.sources.map((source:any)=><div className="atlas-source-plan-source" key={source.sourceId}>
   <div className="atlas-source-plan-source-title">
    <strong>{source.repository}</strong>
    <small>{source.branch||"Ветка не указана"}</small>
   </div>
   {source.status==="current"?<>
    <div className="atlas-source-plan-legend" aria-hidden="true">
     <span>Каталог исходников</span><span>Работа</span><span>Этап</span>
    </div>
    {source.folders.map((folder:any)=><div className="atlas-source-plan-flow"
     key={source.sourceId+"/"+folder.name}>
     <div className="atlas-source-plan-folder">
      <strong title={folder.name}>{folder.name}</strong>
      <small>{folder.role}</small>
      <a className="text-link" href={folder.url} target="_blank"
       rel="noopener noreferrer">Открыть в GitHub</a>
     </div>
     <span className="atlas-source-plan-arrow" aria-hidden="true">→</span>
     <div className="atlas-source-plan-works">
      {folder.works.length?folder.works.map((work:any)=><div
       className="atlas-source-plan-assignment" key={work.id}>
       <div className="atlas-source-plan-work">
        <button type="button" className="text-link" title={work.title}
         onClick={()=>onOpenWork(work.id)}>{work.title}</button>
        {!work.sameRevision&&<small>Работа связана с прежней редакцией исходников</small>}
        {work.predecessorTotal>0&&<details className="atlas-source-plan-dependencies">
         <summary>Предшествующих работ: {work.predecessorTotal}</summary>
         {work.predecessors.map((previous:any)=><button key={previous.id} type="button"
          className="text-link" title={previous.title}
          onClick={()=>onOpenWork(previous.id)}>{previous.title}</button>)}
         {work.predecessorTotal>work.predecessors.length&&<button type="button"
          className="text-link" onClick={onOpenGraph}>Открыть остальные зависимости</button>}
        </details>}
       </div>
       <span className="atlas-source-plan-arrow" aria-hidden="true">→</span>
       <div className="atlas-source-plan-stage">
        {work.stageId?
         <button type="button" className="text-link" title={work.stageName}
          onClick={()=>onEditStage(work.stageId)}>{work.stageName}</button>:
         <button type="button" className="action-button"
          onClick={()=>onOpenWork(work.id)}>Выбрать этап</button>}
       </div>
      </div>):
      <div className="atlas-source-plan-unassigned">
       <small>Работ по этому каталогу ещё нет.</small>
       <button type="button" className="action-button"
        onClick={()=>onSuggestFolder(source.sourceId,folder.commitSha,folder.name)}>
        Добавить работу</button>
      </div>}
      {folder.hiddenWorks>0&&<p className="minor">Ещё {folder.hiddenWorks} работ.
       {" "}<button type="button" className="text-link"
        onClick={onOpenWorks}>Открыть все работы</button></p>}
     </div>
    </div>)}
    {!source.folders.length&&<p className="minor">На верхнем уровне этой ветки каталоги не найдены.</p>}
    {source.hiddenKnownFolders>0&&<p className="minor">
     В кратком обзоре скрыто каталогов: {source.hiddenKnownFolders}.
     {" "}Показать больше можно вверху схемы.</p>}
    {source.observationIncomplete&&<p className="minor">
     Сведения об исходниках неполные. Не все каталоги удалось определить.
     {" "}<button type="button" className="text-link" onClick={onOpenSources}>
      Проверить источник</button></p>}
   </>:<p className="minor">Сведения о каталогах этой ветки сейчас недоступны.
    Работы остаются в плане. Обновите источник, чтобы сравнить их со структурой.</p>}
  </div>)}
  {!!projection.otherWorks.length&&<div className="atlas-source-plan-other">
   <h4>{projection.sources.length?"Работы без показанной связи с каталогом":
    "Работы и этапы"}</h4>
   {projection.sources.length>0&&<p className="minor">
    Эти работы остаются в плане, даже если каталог не показан.</p>}
   <div className="atlas-source-plan-other-list">
    {projection.otherWorks.map((work:any)=><div key={work.id} className="atlas-source-plan-other-row">
     <div className="atlas-source-plan-other-work">
      <button type="button" className="text-link" title={work.title}
       onClick={()=>onOpenWork(work.id)}>{work.title}</button>
      {projection.sources.length>0&&<small>{work.reason}.</small>}
      {work.predecessorTotal>0&&<details className="atlas-source-plan-dependencies">
       <summary>Предшествующих работ: {work.predecessorTotal}</summary>
       {work.predecessors.map((previous:any)=><button key={previous.id}
        type="button" className="text-link" title={previous.title}
        onClick={()=>onOpenWork(previous.id)}>{previous.title}</button>)}
       {work.predecessorTotal>work.predecessors.length&&<button type="button"
        className="text-link" onClick={onOpenGraph}>Открыть остальные зависимости</button>}
      </details>}
     </div>
     <div className="atlas-source-plan-other-stage">
      {work.stageId?<button type="button" className="text-link" title={work.stageName}
       onClick={()=>onEditStage(work.stageId)}>{work.stageName}</button>:
       <small>Без этапа</small>}
     </div>
    </div>)}
   </div>
   {projection.hiddenOtherWorks>0&&<p className="minor">
    Ещё {projection.hiddenOtherWorks} работ. {" "}
    <button type="button" className="text-link" onClick={onOpenWorks}>
     Открыть все работы</button></p>}
  </div>}
  {projection.unassignedStages.length>0&&<div className="atlas-source-plan-unused-stages">
   <h4>Этапы без работ</h4>
   <p className="minor">Эти этапы уже записаны в проекте. Работы к ним пока не привязаны.</p>
   <div className="atlas-source-plan-unused-stage-list">
    {projection.unassignedStages.map((stage:any)=><button type="button" key={stage.id}
     className="text-link" title={stage.name} onClick={()=>onEditStage(stage.id)}>
     {stage.name}</button>)}
   </div>
   {projection.hiddenUnassignedStages>0&&<p className="minor">
    Ещё {projection.hiddenUnassignedStages} этапов. {" "}
    <button type="button" className="text-link" onClick={onOpenStages}>
     Открыть все этапы</button>
   </p>}
  </div>}
  {projection.hiddenSources>0&&<p className="minor">Ещё {projection.hiddenSources} источников.
   {" "}<button type="button" className="text-link" onClick={onOpenSources}>
    Открыть все источники</button></p>}
  <div className="atlas-source-plan-actions">
   <button type="button" className="action-button"
    onClick={onCreateStage}>Добавить этап</button>
   <button type="button" className="action-button"
    disabled={projection.workTotal<2}
    onClick={onAddDependency}>Связать работы</button>
   <span className="minor">Связей между работами в плане: {projection.dependencyTotal}.
    Изменения появятся только после вашего подтверждения.</span>
  </div>
 </div>;
}

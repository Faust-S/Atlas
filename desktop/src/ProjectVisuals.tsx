import React,{useEffect,useMemo,useState} from 'react';
import {dependencyDiagram,ganttViewport,ganttFocusOffset} from './visual-layout.mjs';

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
    <button className="atlas-gantt-work" title={row.title} onClick={()=>{setExpanded(false);onOpenWork(row.id)}}>>{trim(row.title,65)}
     <small>{statusName[row.state]||row.state}{row.critical?' · критическая':''}</small></button>
    <div className="atlas-gantt-track">
     {guide(row.id)}
     {row.visible&&<button type="button" onClick={()=>{setExpanded(false);onOpenWork(row.id)}}>
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
       onClick={()=>{setExpanded(false);onOpenWork(node.id)}}>
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

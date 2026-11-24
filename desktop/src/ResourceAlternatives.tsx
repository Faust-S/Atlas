import React,{useMemo,useState} from 'react';
import {previewWorkResourceReassignment,compareWorkResourceAlternatives} from '../../src/resource-alternatives.mjs';

type Props={snapshot:any;forecast:any;resources:any;resourceId:string|null;
 onClose:()=>void;onOpenWork:(projectId:string,workId:string,comparison:any)=>void};
const key=(w:any)=>JSON.stringify([w.projectId,w.id]);
const change=(value:number)=>value>0?'+'+value:String(value);
function deadlineLine(label:string,deadline:{forecastFinish:string|null;controlDate:string|null;slipDays:number|null}){
 return label+': расчётный финиш '+(deadline.forecastFinish||'не определён')+
  '; контрольная дата '+(deadline.controlDate||'не задана')+'.'+
  (deadline.slipDays===null?' Нельзя определить календарное отклонение.':
   deadline.slipDays>0?' Превышение: '+deadline.slipDays+' дн.':
   ' По календарю в пределах срока.');
}

/** Planning choices only. The existing Work editor owns any actual change. */
export function ResourceAlternatives({snapshot,forecast,resources,resourceId,onClose,onOpenWork}:Props){
 const assigned=resources.work.filter((w:any)=>w.resourceId===resourceId&&w.state!=='done');
 const alternatives=resources.people.filter((r:any)=>r.id!==resourceId);
 const [chosenWork,setChosenWork]=useState('');
 const [chosenTarget,setChosenTarget]=useState('');
 const [page,setPage]=useState(0);
 const [showAll,setShowAll]=useState(false);
 const pageSize=6;
 const work=assigned.find((w:any)=>key(w)===chosenWork)||assigned[0]||null;
 const target=alternatives.find((r:any)=>r.id===chosenTarget)||alternatives[0]||null;
 const result=useMemo(()=>{
  if(!work||!target)return null;
  try{return {value:previewWorkResourceReassignment(snapshot,{
   projectId:work.projectId,workId:work.id,targetResourceId:target.id
  },{schedule:forecast,resources})};}
  catch(error){return {error:error instanceof Error?error.message:'Прогноз недоступен'};}
 },[snapshot,forecast,resources,work?.projectId,work?.id,target?.id]);
 const comparisons=useMemo(()=>{
  if(!showAll||!work||!alternatives.length)return null;
  try{return {value:compareWorkResourceAlternatives(snapshot,{
   projectId:work.projectId,workId:work.id,offset:page*pageSize,limit:pageSize
  },{schedule:forecast,resources})};}
  catch(error){return {error:error instanceof Error?error.message:'Сравнение недоступно'};}
 },[snapshot,forecast,resources,work?.projectId,work?.id,page,showAll]);
 const pageData=comparisons&&'value' in comparisons?comparisons.value:null;
 const comparisonError=comparisons&&'error' in comparisons?comparisons.error:null;
 const preview=result&&'value' in result?result.value:null;
 const failure=result&&'error' in result?result.error:null;
 const original=resources.byId.get(resourceId);
 const resourceLabel=original?.label||(resourceId===null?'Без привязки к ресурсу':'ресурс');
 const summary=preview?[
  'Изменение дней перегрузки: '+change(preview.overloadDaysDelta)+'.',
  'Вне доступности: '+change(preview.unavailableDaysDelta)+'.',
  preview.unverified?'У части расчёта нет достоверных плановых дат.':
   'Сроки Work по CPM не изменятся.'
 ].join(' '):'';
 return <section className="atlas-resource-alternatives" role="region"
  aria-label={'Варианты ресурсного назначения: '+resourceLabel}>
  <div className="atlas-resource-alternatives-header">
   <strong>Варианты ресурсного назначения</strong>
   <button type="button" onClick={onClose} aria-label="Закрыть сравнение ресурсных вариантов">Закрыть</button>
  </div>
  <p>Сравните назначение Work. Полный список альтернатив открывается отдельно.
   Прогноз не изменяет проект или сохранённые данные.</p>
  {assigned.length===0?<p>{resourceId===null?'Нет работ без ресурсного назначения.':'К этому ресурсу нет незавершённых работ.'}</p>:
  alternatives.length===0?<p>Нет доступных для сравнения плановых ресурсов. Добавьте ресурс.</p>:
  <>
   <div className="atlas-resource-alternatives-controls">
    <label>Работа
     <select aria-label="Выбрать работу для сравнения ресурсов"
      value={key(work)} onChange={event=>{setChosenWork(event.target.value);setPage(0);setChosenTarget('');}}>
      {assigned.map((w:any)=><option key={key(w)} value={key(w)}>{w.projectName}: {w.title}</option>)}
     </select>
    </label>
    <label>{resourceId===null?'Первое назначение':'Другой ресурс'}
     <select aria-label="Выбрать альтернативный плановый ресурс"
      value={target.id} onChange={event=>setChosenTarget(event.target.value)}>
      {alternatives.map((r:any)=><option key={r.id} value={r.id}>{r.label} (до {r.capacityPct}%)</option>)}
     </select>
    </label>
   </div>
   {failure&&<p role="status">{failure}</p>}
   {preview&&<>
    <div className="atlas-resource-alternatives-table">
     <table aria-label="Плановая загрузка до и после изменения назначения">
      <thead><tr><th>Показатель</th><th>Сейчас</th><th>Если переназначить</th></tr></thead>
      <tbody>
       <tr><th scope="row">Дней перегрузки по портфелю</th>
        <td>{preview.original.overloadResourceDays}</td><td>{preview.alternative.overloadResourceDays}</td></tr>
       <tr><th scope="row">Дней вне доступности</th>
        <td>{preview.original.unavailableResourceDays}</td><td>{preview.alternative.unavailableResourceDays}</td></tr>
       {preview.source.id!==null?<tr><th scope="row">{preview.source.label}: превышение</th>
        <td>{preview.source.overloadDays}</td><td>{preview.proposedSource.overloadDays}</td></tr>:
        <tr><th scope="row">Работ без привязки к ресурсу</th>
         <td>{preview.original.unlinkedWork}</td><td>{preview.alternative.unlinkedWork}</td></tr>}
       <tr><th scope="row">{preview.target.label}: превышение</th>
        <td>{preview.target.overloadDays}</td><td>{preview.proposedTarget.overloadDays}</td></tr>
      </tbody>
     </table>
    </div>
    <p role="status" aria-label={summary}
     className="atlas-resource-alternatives-result">{summary}</p>
    <button type="button" className="atlas-resource-alternatives-edit"
     aria-label={'Открыть Work для изменения ресурса '+preview.workTitle}
     onClick={()=>onOpenWork(preview.projectId,preview.workId,preview)}>
      Открыть Work с выбранным ресурсом
    </button>

    <section className="atlas-resource-deadlines" role="region" aria-label="Контрольные сроки и ресурсные ограничения">
     <strong>Контрольные сроки и ресурсные ограничения</strong>
     <p>{deadlineLine('Work',preview.controlDates.work)}</p>
     <p>{deadlineLine('Проект',preview.controlDates.project)}</p>
     {preview.controlDates.baseline&&<p>Контрольный план:
      {preview.controlDates.baseline.name}, финиш
      {preview.controlDates.baseline.forecastFinish||'не определён'}.</p>}
     <small>{preview.controlDates.note}</small>
    </section>
    <p className="atlas-resource-alternatives-note">{preview.note}</p>
    <button type="button" className="atlas-resource-options-toggle"
     aria-expanded={showAll} onClick={()=>setShowAll(value=>!value)}>
      {showAll?'Скрыть все варианты':'Показать все варианты ('+alternatives.length+')'}
    </button>
   </>}
   {showAll&&comparisonError&&<p role="status">{comparisonError}</p>}
   {showAll&&pageData&&<section className="atlas-resource-options" aria-label="Сравнение нескольких ресурсных альтернатив">
    <strong>Все варианты назначения</strong>
    <p>Сравнение по известным календарям и мощности. Нулевой суммарный сдвиг
     может означать перенос конфликта на другой ресурс, а не его устранение.</p>
    <div className="atlas-resource-options-list">
     {pageData.options.map((option:any)=>{
      const c=option.constraints;
      const label=c.classification==='TRADEOFF'?'Компромисс':
       c.classification==='WORSENED'?'Ухудшение':
       c.classification==='IMPROVED'?'Улучшение':'Без измеримого изменения';
      return <div className="atlas-resource-option" key={option.target.id}>
       <div><strong>{option.target.label}</strong>
        {c.assignmentAdded&&<small>Первое плановое назначение Work.</small>}
        <small>{label}. Перегрузка {change(option.overloadDaysDelta)} дн.;
         вне доступности {change(option.unavailableDaysDelta)} дн.</small>
        <small>Устранено или сокращено: {c.relieved.length};
         новых конфликтов: {c.introduced.length};
         усилено существующих: {c.worsened.length}.</small>
        {c.introduced.map((x:any)=><small key={x.resourceId+x.kind}>
         {'Новый конфликт: '+x.resourceLabel+', '+
         (x.kind==='overload'?'перегрузка':'вне периода доступности')+' '+x.days+' дн.'}</small>)}
        {c.worsened.map((x:any)=><small key={x.resourceId+x.kind}>
         Усиление: {x.resourceLabel}, {x.days} дн.</small>)}
        {c.relieved.map((x:any)=><small key={x.resourceId+x.kind}>
         Снижение: {x.resourceLabel}, {x.days} дн.
         {x.fullyCleared?' (ограничение снято)':''}</small>)}
        <small>{c.outlook==='KNOWN_RESOURCE_CONFLICTS'?
         'В портфеле остаются известные ресурсные конфликты.':
         c.outlook==='DATES_INCOMPLETE'?'Сроки части работ неизвестны.':
         c.outlook==='ASSIGNMENTS_INCOMPLETE'?'Не все работы имеют плановые ресурсные назначения.':
         'По известным датам ресурсных конфликтов не обнаружено.'}</small>
       </div>
       <button type="button" onClick={()=>setChosenTarget(option.target.id)}
        aria-label={'Рассмотреть ресурс '+option.target.label}
        aria-pressed={target?.id===option.target.id}>Рассмотреть</button>
      </div>;
     })}
    </div>
    <div className="atlas-resource-options-pagination">
     <button type="button" disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}>Назад</button>
     <span>Варианты {pageData.offset+1}-{pageData.offset+pageData.options.length} из {pageData.candidateCount}</span>
     <button type="button" disabled={pageData.offset+pageData.options.length>=pageData.candidateCount}
      onClick={()=>setPage(p=>p+1)}>Далее</button>
    </div>
   </section>}

  </>}
 </section>;
}

import React,{useMemo,useState} from 'react';
import {previewWorkResourceReassignment,compareWorkResourceAlternatives} from '../../src/resource-alternatives.mjs';
import {projectResourceReassignment,resourceConflictPeriods,resourceConflictDifference} from '../../src/portfolio-resources.mjs';
import {compareResourceSequenceAlternatives} from '../../src/resource-sequence-alternatives.mjs';

type Props={snapshot:any;forecast:any;resources:any;resourceId:string|null;
 onClose:()=>void;onOpenWork:(projectId:string,workId:string,comparison:any)=>void;
 onOpenSequence:(projectId:string,option:any,asProposal?:boolean)=>void;
 onOpenAmendment:(projectId:string,workId:string,comparison:any)=>void};
const key=(w:any)=>JSON.stringify([w.projectId,w.id]);
const change=(value:number)=>value>0?'+'+value:String(value);
function deadlineLine(label:string,deadline:{forecastFinish:string|null;controlDate:string|null;slipDays:number|null}){
 return label+': расчётный финиш '+(deadline.forecastFinish||'не определён')+
  '; контрольная дата '+(deadline.controlDate||'не задана')+'.'+
  (deadline.slipDays===null?' Нельзя определить календарное отклонение.':
   deadline.slipDays>0?' Превышение: '+deadline.slipDays+' дн.':
   ' По календарю в пределах срока.');
}




const intervalState=(kind:string|null,load:number|null,excess:number)=>kind==='overload'?
 'перегрузка '+excess+' п. п. (нагрузка '+load+'%)':
 kind==='availability'?'вне доступности: '+load+'% нагрузки':'конфликта нет';
const differenceLabel=(kind:string)=>({NEW:'Новый конфликт',CLEARED:'Конфликт устранён',
 WORSENED:'Конфликт усилен',RELIEVED:'Конфликт ослаблен',CHANGED_KIND:'Изменён вид ограничения'} as Record<string,string>)[kind]||kind;
const differenceSummary=(totals:Record<string,number>)=>'Новые дни конфликта: '+totals.NEW+
 '. Устранены: '+totals.CLEARED+'. Усилены: '+totals.WORSENED+
 '. Ослаблены: '+totals.RELIEVED+'. Изменён вид: '+totals.CHANGED_KIND+'.';
function ConflictChangePage({before,after}:{before:any;after:any}){
 const [offset,setOffset]=useState(0);
 const view=useMemo(()=>resourceConflictDifference(before,after,{offset,limit:4}),[before,after,offset]);
 const summary=differenceSummary(view.totals);
 return <div className="atlas-resource-conflict-page">
  <p role="status" aria-label={summary}>{summary}</p>
  <small>{'Превышение мощности: '+before.overloadPctDays+' → '+after.overloadPctDays+
   ' п. п.·дн.; нагрузка вне доступности: '+before.unavailablePctDays+' → '+after.unavailablePctDays+' %·дн.'}</small>
  {!view.count?<p>Изменённых известных периодов конфликтов нет.</p>:<>
   {view.rows.map(row=><div className="atlas-resource-conflict-period" key={row.kind+':'+row.startDate}>
    <strong>{differenceLabel(row.kind)+': '+row.startDate+' по '+row.endDate+' ('+row.days+' дн.)'}</strong>
    <small>{'Было: '+intervalState(row.beforeKind,row.beforeLoadPct,row.beforeExcessPct)+
     '. Стало: '+intervalState(row.afterKind,row.afterLoadPct,row.afterExcessPct)+'.'}</small>
   </div>)}
   <div className="atlas-resource-period-nav">
    <button type="button" disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-4))}>Предыдущие изменения</button>
    <small>{'Периоды '+(offset+1)+'-'+(offset+view.rows.length)+' из '+view.count}</small>
    <button type="button" disabled={offset+view.rows.length>=view.count} onClick={()=>setOffset(n=>n+4)}>Следующие изменения</button>
   </div>
  </>}
 </div>;
}

/** Compare two selected participants of the current, not hypothetical, overload. */
function ResourceSequencePanel({snapshot,forecast,resources,period,onOpenSequence}:{
 snapshot:any;forecast:any;resources:any;period:any;
 onOpenSequence:Props['onOpenSequence']}){
 const [selected,setSelected]=useState<any[]>([]);
 const [show,setShow]=useState(false);
 const toggle=(w:any)=>{
  setShow(false);
  setSelected(old=>{
   const exists=old.some(x=>x.projectId===w.projectId&&x.workId===w.workId);
   return exists?old.filter(x=>x.projectId!==w.projectId||x.workId!==w.workId):
    [...old.slice(-1),w];
  });
 };
 const sameProject=selected.length===2&&selected[0].projectId===selected[1].projectId;
 const result=useMemo(()=>{
  if(!show||!sameProject)return null;
  try{return {value:compareResourceSequenceAlternatives(snapshot,{
   projectId:selected[0].projectId,firstWorkId:selected[0].workId,secondWorkId:selected[1].workId
  },{schedule:forecast,resources})};}
  catch(error){return {error:error instanceof Error?error.message:'Расчёт порядка недоступен'};}
 },[snapshot,forecast,resources,selected,show,sameProject]);
 return <section className="atlas-resource-sequence" aria-label="Варианты порядка конфликтующих работ">
  <strong>Изменить порядок работ</strong>
  <p>Выберите две работы одного проекта. Сравнение добавляет только предлагаемую связь в расчёт. Технологическую допустимость определяет пользователь.</p>
  <div className="atlas-resource-period-nav">
   {period.works.map((w:any)=>{
    const active=selected.some(x=>x.projectId===w.projectId&&x.workId===w.workId);
    return <button type="button" key={key({projectId:w.projectId,id:w.workId})}
     aria-pressed={active} aria-label={'Выбрать для порядка '+w.projectName+': '+w.title}
     onClick={()=>toggle(w)}>{w.title}{active?' (выбрана)':''}</button>;
   })}
  </div>
  <small>{selected.length?'Выбрано: '+selected.map(x=>x.projectName+': '+x.title).join('; '):'Выбрано 0 из 2.'}</small>
  {selected.length===2&&!sameProject&&<p role="status">Работы относятся к разным проектам. Atlas не создаёт искусственную связь между проектами.</p>}
  <button type="button" className="atlas-resource-options-toggle" disabled={!sameProject}
   onClick={()=>setShow(true)}>Сравнить порядок двух работ</button>
  {result&&'error' in result&&<p role="status">{result.error}</p>}
  {result&&'value' in result&&result.value&&<div className="atlas-resource-options-list">
   {result.value.alternatives.map((option:any)=>{
    const title=option.fromTitle+' → '+option.toTitle;
    if(!option.valid)return <div className="atlas-resource-option" key={option.from}>
     <strong>{title}</strong><small>{option.reason}</small></div>;
    const summary='Порядок: '+title+'. Перегрузка портфеля: '+option.before.overloadDays+
     ' → '+option.after.overloadDays+' дн. Финиш проекта: '+
     (option.project.beforeFinish||'не определён')+' → '+(option.project.afterFinish||'не определён')+'.';
    return <div className="atlas-resource-option" key={option.from}>
     <div><strong>{title}</strong>
      <small role="status" aria-label={summary}>{summary}</small>
      <div className="atlas-resource-primary-actions">
       <button type="button" className="action-button atlas-sequence-open"
        aria-label={'Открыть порядок '+title} onClick={()=>onOpenSequence(option.projectId,option)}>Открыть зависимость</button>
       <button type="button" className="action-button atlas-sequence-open"
        aria-label={'Добавить порядок в заявку '+title} onClick={()=>onOpenSequence(option.projectId,option,true)}>В заявку</button>
      </div>
      <small>{'Контроль проекта: '+(option.project.dueDate||'не задан')+
       '. Отклонение: '+(option.project.beforeSlip??'не определено')+' → '+(option.project.afterSlip??'не определено')+' дн.'}</small>
      <details className="atlas-sequence-details">
      <summary>Подробнее о последствиях</summary>
      <small>{'Вне доступности по портфелю: '+option.before.unavailableDays+' → '+option.after.unavailableDays+' дн.'}</small>
      <small>{'Превышение мощности: '+option.before.overloadPctDays+' → '+option.after.overloadPctDays+' п. п.·дн.; нагрузка вне доступности: '+option.before.unavailablePctDays+' → '+option.after.unavailablePctDays+' %·дн.'}</small>
      <small>{option.source.label+': перегрузка '+option.source.overloadBefore+' → '+option.source.overloadAfter+' дн.'}</small>
      <small>{'Критический путь: изменено работ '+option.affected.criticalChangedTotal+
       '; новых нарушений сроков работ '+option.affected.deadlineNewMissedTotal+'.'}</small>

      <small>{'Затронуто связанных проектов: '+option.portfolio.affectedTotal+
       '; новых рисков срока: '+option.portfolio.newDeadlineRisks+'.'}</small>
      {option.portfolio.rows.slice(0,3).map((r:any)=><small key={r.id}>
       {r.name+': '+(r.previousFinish||'не определён')+' → '+(r.projectedFinish||'не определён')}</small>)}
      {option.portfolio.affectedTotal>3&&<small>{'Ещё связанных проектов: '+(option.portfolio.affectedTotal-3)}</small>}
      <small>{'Ресурсов с ухудшением: '+option.worsenedResources+'; с улучшением: '+option.improvedResources+'.'}</small>
      {option.resourceExamples.map((r:any)=><React.Fragment key={r.id}>
       <small>{r.label+': перегрузка '+r.overloadBefore+' → '+r.overloadAfter+
        ' дн.; вне доступности '+r.availabilityBefore+' → '+r.availabilityAfter+' дн.'}</small>
       <small>{'Превышение: '+r.overloadDepthBefore+' → '+r.overloadDepthAfter+' п. п.·дн.; нагрузка вне доступности: '+r.availabilityDepthBefore+' → '+r.availabilityDepthAfter+' %·дн.'}</small>
       {r.periodChanges?.count>0&&<>
        <small>{differenceSummary(r.periodChanges.totals)}</small>
        <details>
         <summary>Изменённые интервалы: {r.periodChanges.count}</summary>
         {r.periodChanges.rows.map((p:any)=><small key={p.kind+':'+p.startDate}>
          {differenceLabel(p.kind)+': '+p.startDate+' по '+p.endDate+'. '+intervalState(p.beforeKind,p.beforeLoadPct,p.beforeExcessPct)+' → '+intervalState(p.afterKind,p.afterLoadPct,p.afterExcessPct)}</small>)}
         {r.periodChanges.count>r.periodChanges.rows.length&&<small>{'Ещё изменённых периодов: '+(r.periodChanges.count-r.periodChanges.rows.length)}</small>}
        </details>
       </>}
      </React.Fragment>)}
      {option.resourcesChanged>option.resourceExamples.length&&<small>{'Ещё изменённых ресурсов: '+(option.resourcesChanged-option.resourceExamples.length)}</small>}
      {option.unknown&&<small>Часть расчётных дат отсутствует.</small>}
      <small>{option.note}</small>
      </details>
     </div>
    </div>;
   })}
  </div>}
 </section>;
}

/** On-demand interval explanation; the ordinary editor still owns changes. */
function ConflictPeriodPage({group,onOpenWork,snapshot,forecast,resources,allowSequence,onOpenSequence}:{
 group:any;onOpenWork:Props['onOpenWork'];snapshot:any;forecast:any;resources:any;
 allowSequence:boolean;onOpenSequence:Props['onOpenSequence']}){
 const [offset,setOffset]=useState(0),[workOffset,setWorkOffset]=useState(0);
 const view=useMemo(()=>resourceConflictPeriods(group,{offset,workOffset,workLimit:6}),
  [group,offset,workOffset]);
 const p=view.period;
 const periodLabel=p?(p.kind==='overload'?'Перегрузка':'Вне периода доступности')+
  ': '+p.startDate+' по '+p.endDate+'. Нагрузка '+p.loadPct+'%, мощность '+p.capacityPct+'%.':'';
 return <div className="atlas-resource-conflict-page">
  <p>{'Выше мощности: '+view.overloadDays+' дн. Вне доступности: '+view.unavailableDays+
   ' дн. Работ без даты: '+view.undatedWork+'.'}</p>
  {!p?<p>По известным датам конфликтов нет.</p>:<>
   <div className="atlas-resource-conflict-period">
    <strong role="status" aria-label={periodLabel}>{periodLabel}</strong>
    <small>{'Период '+(offset+1)+' из '+view.periodCount+'. Дней: '+p.days+
     '. Работ: '+p.workCount+'. Проектов: '+p.projectCount+'.'}</small>
    <div className="atlas-resource-period-nav">
     <button type="button" disabled={offset===0} onClick={()=>{setOffset(n=>n-1);setWorkOffset(0);}}>Предыдущий период</button>
     <button type="button" disabled={offset+1>=view.periodCount} onClick={()=>{setOffset(n=>n+1);setWorkOffset(0);}}>Следующий период</button>
    </div>
    {p.works.map((w:any)=><div className="atlas-resource-conflict-work" key={key({projectId:w.projectId,id:w.workId})}>
     <div><strong>{w.title}</strong><small>{w.projectName} · {w.allocationPct}%</small></div>
     <button type="button" aria-label={'Открыть работу конфликта '+w.projectName+': '+w.title}
      onClick={()=>onOpenWork(w.projectId,w.workId,null)}>Открыть Work</button>
    </div>)}
    {allowSequence&&p.kind==='overload'&&p.workCount>=2&&
     <ResourceSequencePanel key={offset} snapshot={snapshot} forecast={forecast} resources={resources}
      period={p} onOpenSequence={onOpenSequence}/>}
    {p.workCount>p.workLimit&&<div className="atlas-resource-period-nav">
     <button type="button" disabled={p.workOffset===0} onClick={()=>setWorkOffset(n=>Math.max(0,n-6))}>Предыдущие работы</button>
     <small>{'Работы '+(p.workOffset+1)+'-'+(p.workOffset+p.works.length)+' из '+p.workCount}</small>
     <button type="button" disabled={p.workOffset+p.works.length>=p.workCount}
      onClick={()=>setWorkOffset(n=>n+6)}>Следующие работы</button>
    </div>}
   </div>
  </>}
 </div>;
}
function ResourceConflictDetails({resources,resourceId,preview,onOpenWork,snapshot,forecast,onOpenSequence}:{
 resources:any;resourceId:string|null;preview:any;onOpenWork:Props['onOpenWork'];
 snapshot:any;forecast:any;onOpenSequence:Props['onOpenSequence']}){
 const [show,setShow]=useState(false),[selected,setSelected]=useState('source-now');
 const groups=useMemo(()=>{
  if(!show)return [];
  const out:{key:string;label:string;group:any;before?:any;after?:any}[]=[];
  const source=resources.byId.get(resourceId);
  if(source)out.push({key:'source-now',label:'Сейчас: '+source.label,group:source});
  if(preview){
   const v=projectResourceReassignment(resources,{projectId:preview.projectId,
    workId:preview.workId,targetResourceId:preview.target.id});
   out.push({key:'target-now',label:'Сейчас: '+v.target.label,group:v.target});
   if(v.sourceAfter)out.push({key:'source-after',label:'После: '+v.sourceAfter.label,group:v.sourceAfter});
   out.push({key:'target-after',label:'После: '+v.targetAfter.label,group:v.targetAfter});
   if(v.source&&v.sourceAfter)out.push({key:'source-change',label:'Изменения: '+v.source.label,
    group:v.sourceAfter,before:v.source,after:v.sourceAfter});
   out.push({key:'target-change',label:'Изменения: '+v.target.label,
    group:v.targetAfter,before:v.target,after:v.targetAfter});
  }
  return out;
 },[resources,resourceId,preview,show]);
 if(resourceId===null&&!preview)return null;
 const choice=groups.find(g=>g.key===selected)??groups[0];
 return <section className="atlas-resource-conflicts" aria-label="Периоды ресурсных конфликтов">
  <button type="button" className="atlas-resource-options-toggle" aria-expanded={show}
   onClick={()=>setShow(value=>!value)}>{show?'Скрыть периоды конфликтов':'Показать периоды конфликтов'}</button>
  {show&&choice&&<>
   <p>Точные интервалы занятости CPM и работы, которые формируют нагрузку. Даты периода включены с обеих сторон.</p>
   <div className="atlas-resource-period-nav">
    {groups.map(g=><button type="button" key={g.key} aria-pressed={choice.key===g.key}
     onClick={()=>setSelected(g.key)}>{g.label}</button>)}
   </div>
   {choice.before&&choice.after?
    <ConflictChangePage key={choice.key+':'+choice.group.id+':'+(preview?.workId??'')+':'+(preview?.target.id??'')}
     before={choice.before} after={choice.after}/>:
    <ConflictPeriodPage key={choice.key+':'+choice.group.id+':'+(preview?.workId??'')+':'+(preview?.target.id??'')}
     group={choice.group} onOpenWork={onOpenWork} snapshot={snapshot} forecast={forecast} resources={resources}
     allowSequence={choice.key==='source-now'||choice.key==='target-now'} onOpenSequence={onOpenSequence}/>}

  </>}
 </section>;
}

/** Planning choices only. The existing Work editor owns any actual change. */
export function ResourceAlternatives({snapshot,forecast,resources,resourceId,onClose,onOpenWork,onOpenSequence,onOpenAmendment}:Props){
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
  alternatives.length===0?<><p>Нет доступных для сравнения плановых ресурсов. Добавьте ресурс.</p>
   <ResourceConflictDetails resources={resources} resourceId={resourceId} preview={null} onOpenWork={onOpenWork} snapshot={snapshot} forecast={forecast} onOpenSequence={onOpenSequence}/></>:
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
    <div className="atlas-resource-primary-actions">
    <button type="button" className="atlas-resource-alternatives-edit"
     aria-label={'Открыть Work для изменения ресурса '+preview.workTitle}
     onClick={()=>onOpenWork(preview.projectId,preview.workId,preview)}>
      Открыть Work с выбранным ресурсом
    </button>
    <button type="button" className="atlas-resource-options-toggle"
     aria-label={'Добавить ресурсный вариант в заявку '+preview.workTitle}
     onClick={()=>onOpenAmendment(preview.projectId,preview.workId,preview)}>В заявку</button>
    <button type="button" className="atlas-resource-options-toggle"
     aria-expanded={showAll} onClick={()=>setShowAll(value=>!value)}>
      {showAll?'Скрыть все варианты':'Показать все варианты ('+alternatives.length+')'}
    </button>
    </div>

    <section className="atlas-resource-deadlines" role="region" aria-label="Контрольные сроки и ресурсные ограничения">
     <strong>Контрольные сроки и ресурсные ограничения</strong>
     <p role="status" aria-label={deadlineLine('Work',preview.controlDates.work)}>{deadlineLine('Work',preview.controlDates.work)}</p>
     <p role="status" aria-label={deadlineLine('Проект',preview.controlDates.project)}>{deadlineLine('Проект',preview.controlDates.project)}</p>
     {preview.controlDates.baseline&&<p>Контрольный план:
      {preview.controlDates.baseline.name}, финиш
      {preview.controlDates.baseline.forecastFinish||'не определён'}.</p>}
     <small>{preview.controlDates.note}</small>
    </section>
    <p role="status" className="atlas-resource-alternatives-note">
     {'Превышение мощности по портфелю: '+preview.original.overloadPctDays+' → '+preview.alternative.overloadPctDays+
      ' п. п.·дн. Нагрузка вне доступности: '+preview.original.unavailablePctDays+' → '+preview.alternative.unavailablePctDays+' %·дн.'}
    </p>
    <small>Превышение мощности учитывает превышение в каждый занятый день; нагрузка вне доступности учитывается отдельно.</small>
    <p className="atlas-resource-alternatives-note">{preview.note}</p>

   </>}
   <ResourceConflictDetails resources={resources} resourceId={resourceId} preview={preview} onOpenWork={onOpenWork} snapshot={snapshot} forecast={forecast} onOpenSequence={onOpenSequence}/>
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
        {c.introduced.map((x:any)=>{
         const label='Новый конфликт: '+x.resourceLabel+', '+
          (x.kind==='overload'?'перегрузка':'вне периода доступности')+' '+x.days+' дн.';
         return <small key={x.resourceId+x.kind} role="status" aria-label={label}>{label}</small>;
        })}
        {c.worsened.map((x:any)=><small key={x.resourceId+x.kind}>
         Усиление: {x.resourceLabel}, {x.days} дн.</small>)}
        {c.relieved.map((x:any)=><small key={x.resourceId+x.kind}>
         Снижение: {x.resourceLabel}, {x.days} дн.
         {x.fullyCleared?' (ограничение снято)':''}</small>)}
        {c.severity.map((x:any)=><small key={'severity:'+x.resourceId+':'+x.kind}>
         {x.resourceLabel+': '+(x.kind==='overload'?'превышение мощности':'нагрузка вне доступности')+
          ' '+x.before+' → '+x.after+(x.kind==='overload'?' п. п.·дн.':' %·дн.')}</small>)}
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

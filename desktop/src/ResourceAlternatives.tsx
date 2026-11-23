import React,{useMemo,useState} from 'react';
import {previewWorkResourceReassignment} from '../../src/resource-alternatives.mjs';

type Props={snapshot:any;forecast:any;resources:any;resourceId:string;
 onClose:()=>void;onOpenWork:(projectId:string,workId:string)=>void};
const key=(w:any)=>JSON.stringify([w.projectId,w.id]);
const change=(value:number)=>value>0?'+'+value:String(value);

/** Planning choices only. The existing Work editor owns any actual change. */
export function ResourceAlternatives({snapshot,forecast,resources,resourceId,onClose,onOpenWork}:Props){
 const assigned=resources.work.filter((w:any)=>w.resourceId===resourceId&&w.state!=='done');
 const alternatives=resources.people.filter((r:any)=>r.id!==resourceId);
 const [chosenWork,setChosenWork]=useState('');
 const [chosenTarget,setChosenTarget]=useState('');
 const work=assigned.find((w:any)=>key(w)===chosenWork)||assigned[0]||null;
 const target=alternatives.find((r:any)=>r.id===chosenTarget)||alternatives[0]||null;
 const result=useMemo(()=>{
  if(!work||!target)return null;
  try{return {value:previewWorkResourceReassignment(snapshot,{
   projectId:work.projectId,workId:work.id,targetResourceId:target.id
  },{schedule:forecast,resources})};}
  catch(error){return {error:error instanceof Error?error.message:'Прогноз недоступен'};}
 },[snapshot,forecast,resources,work?.projectId,work?.id,target?.id]);
 const preview=result&&'value' in result?result.value:null;
 const failure=result&&'error' in result?result.error:null;
 const original=resources.byId.get(resourceId);
 return <section className="atlas-resource-alternatives" role="region"
  aria-label={'Сравнение ресурсных вариантов: '+(original?.label||'ресурс')}>
  <div className="atlas-resource-alternatives-header">
   <strong>Варианты ресурсного назначения</strong>
   <button type="button" onClick={onClose} aria-label="Закрыть сравнение ресурсных вариантов">Закрыть</button>
  </div>
  <p>Сравните существующее назначение Work с одним другим плановым ресурсом.
   Прогноз не изменяет проект или сохранённые данные.</p>
  {assigned.length===0?<p>К этому ресурсу нет незавершённых работ.</p>:
  alternatives.length===0?<p>Других плановых ресурсов пока нет. Добавьте ресурс, чтобы сравнить назначения.</p>:
  <>
   <div className="atlas-resource-alternatives-controls">
    <label>Работа
     <select aria-label="Выбрать работу для сравнения ресурсов"
      value={key(work)} onChange={event=>setChosenWork(event.target.value)}>
      {assigned.map((w:any)=><option key={key(w)} value={key(w)}>{w.projectName}: {w.title}</option>)}
     </select>
    </label>
    <label>Другой ресурс
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
       <tr><th scope="row">{preview.source.label}: превышение</th>
        <td>{preview.source.overloadDays}</td><td>{preview.proposedSource.overloadDays}</td></tr>
       <tr><th scope="row">{preview.target.label}: превышение</th>
        <td>{preview.target.overloadDays}</td><td>{preview.proposedTarget.overloadDays}</td></tr>
      </tbody>
     </table>
    </div>
    <p role="status" className="atlas-resource-alternatives-result">{[
     'Изменение дней перегрузки: '+change(preview.overloadDaysDelta)+'.',
     'Вне доступности: '+change(preview.unavailableDaysDelta)+'.',
     preview.unverified?'У части расчёта нет достоверных плановых дат.':
      'Сроки Work по CPM не изменятся.'
    ].join(' ')}</p>
    <button type="button" className="atlas-resource-alternatives-edit"
     aria-label={'Открыть Work для изменения ресурса '+preview.workTitle}
     onClick={()=>onOpenWork(preview.projectId,preview.workId)}>
      Открыть Work и выбрать назначение
    </button>
    <p className="atlas-resource-alternatives-note">{preview.note}</p>
   </>}
  </>}
 </section>;
}

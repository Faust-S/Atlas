import React,{useMemo,useState} from "react";
import {inspectDeadlineRecovery,compareDeadlineRecovery} from "../../src/plan-recovery.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";

type WorkVariant={itemId:string;estimateDays:string;resourceId:string;allocationPct:string};
const effectLabel:Record<string,string>={UNKNOWN:"Даты не определены",LATER:"Финиш позже",UNCHANGED:"Финиш не изменён",
 RECOVERED:"Контрольный срок достигнут по расчёту",PARTIAL:"Отставание сокращено",EARLIER:"Финиш раньше"};
const date=(x:any)=>x??"не определена";
const unit=(x:any)=>x==="working_days"?"раб. дн.":"кал. дн.";
const days=(x:any)=>x==null?"не определено":x+" дн.";
export function PlanRecoveryComparison({snapshot,projectId,onDraft}:{
 snapshot:any;projectId:string;onDraft:(comparison:any,optionId:string,rationale:string)=>void}){
 const [expanded,setExpanded]=useState(false);
 const [candidateId,setCandidateId]=useState("");
 const [variants,setVariants]=useState<WorkVariant[]>([]);
 const [calculation,setCalculation]=useState<{snapshot:any;value:any}|null>(null);
 const [error,setError]=useState("");
 const [rationale,setRationale]=useState("");
 const context=useMemo(()=>{
  if(!expanded)return null;
  try{return {value:inspectDeadlineRecovery(snapshot,projectId)}}catch(e){return {error:e instanceof Error?e.message:"Расчёт недоступен"}}
 },[expanded,snapshot,projectId]);
 const info=context&&"value" in context?context.value:null;
 const candidates=(info?.candidates??[]) as any[];
 const available=candidates.filter(w=>!variants.some(v=>v.itemId===w.id));
 const chosen=available.find(w=>w.id===candidateId)??available[0];
 const resources=(snapshot.resources??[]) as any[];
 const current=calculation?.snapshot===snapshot?calculation.value:null;
 const stale=!!calculation&&!current;
 const invalidate=()=>{setCalculation(null);setError("")};
 const patch=(id:string,values:Partial<WorkVariant>)=>{
  setVariants(rows=>rows.map(v=>v.itemId===id?{...v,...values}:v));invalidate();
 };
 const add=()=>{
  if(!chosen||variants.length>=(info?.maxWorks??4))return;
  setVariants(rows=>[...rows,{itemId:chosen.id,estimateDays:String(chosen.estimateDays),
   resourceId:chosen.resourceId??"",allocationPct:String(chosen.allocationPct)}]);invalidate();
 };
 const calculate=()=>{
  try{
   setError("");
   const number=(s:string)=>/^\d+$/.test(s.trim())?Number(s):NaN;
   const value=compareDeadlineRecovery(snapshot,projectId,variants.map(v=>({itemId:v.itemId,
    estimateDays:number(v.estimateDays),resourceId:v.resourceId||null,allocationPct:number(v.allocationPct)})));
   setCalculation({snapshot,value});
  }catch(e){setCalculation(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 return <section className="atlas-plan-alternatives" aria-label="Восстановление контрольного срока">
  <button type="button" className="action-button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
   {expanded?"Скрыть восстановление срока":"Проверить восстановление срока"}</button>
  {expanded&&<>
   {context&&"error" in context&&<p role="alert">{context.error}</p>}
   {info&&<>
    <div className="atlas-amendment-row">
     <strong>{"Контрольный срок: "+date(info.deadline)}</strong>
     <small>{"Текущий финиш: "+date(info.finish)+"; отставание: "+days(info.slipDays)}</small>
     <small>{"Критических работ: "+info.criticalCount+"; не доступны для этого расчёта: "+info.fixedCriticalCount}</small>
     {info.startShiftDays>0&&<small>{"Сдвиг начала из-за предшественников: "+days(info.startShiftDays)}</small>}
     {info.limitingProjects.length>0&&<small>{"Ограничивают начало: "+info.limitingProjects.map((p:any)=>p.name+" ("+date(p.finish)+")").join(", ")}</small>}
     {info.missingParents.length>0&&<small>{"Нет прогноза предшественников: "+info.missingParents.map((p:any)=>p.name).join(", ")}</small>}
     {info.unavailableProjects.length>0&&<small>{"Недоступны проекты: "+info.unavailableProjects.map((p:any)=>p.name).join(", ")}</small>}
    </div>
    {!info.available?<p>{info.reason}</p>:<>
     <p>Введите реально достижимую длительность и, при необходимости, другой существующий ресурс или долю загрузки. До четырёх ещё не начатых работ. Каждая проверяется отдельно и совместно, без переноса контрольного срока.</p>
     {available.length>0&&variants.length<info.maxWorks&&<div className="atlas-plan-choice-fields">
      <label>Работа для проверки<select aria-label="Работа для восстановления срока" value={chosen?.id??""}
       onChange={e=>setCandidateId(e.target.value)}>
       {available.map(w=><option key={w.id} value={w.id}>{w.title+" · "+(w.critical?"критическая":"резерв "+w.floatDays+" дн.")+" · "+w.estimateDays+" "+unit(w.durationUnit)}</option>)}
      </select></label>
      <button type="button" className="action-button" onClick={add} disabled={!chosen}>Добавить работу для расчёта</button>
     </div>}
     <div className="atlas-amendment-rows">{variants.map((v,i)=>{
      const w=candidates.find(w=>w.id===v.itemId);
      return <div className="atlas-amendment-row" key={v.itemId}>
       <strong>{w?.title??"Работа больше недоступна"}</strong>
       {w&&<small>{w.estimateDays+" "+unit(w.durationUnit)+" · "+(w.critical?"критическая":"резерв "+w.floatDays+" дн.")+(w.state==="blocked"?" · заблокирована":"")}</small>}
       <div className="atlas-plan-choice-fields">
        <label>Длительность ({unit(w?.durationUnit)})<input type="number" min="1" max="36500" step="1"
         aria-label={"Длительность варианта "+(i+1)} value={v.estimateDays} onChange={e=>patch(v.itemId,{estimateDays:e.target.value})}/></label>
        <label>Плановый ресурс<select aria-label={"Ресурс варианта "+(i+1)} value={v.resourceId} onChange={e=>patch(v.itemId,{resourceId:e.target.value})}>
         {!w?.resourceId&&<option value="">Не назначен</option>}
         {resources.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
        </select></label>
        <label>Загрузка, %<input type="number" min="1" max="100" step="1" disabled={!v.resourceId}
         aria-label={"Загрузка варианта "+(i+1)} value={v.allocationPct} onChange={e=>patch(v.itemId,{allocationPct:e.target.value})}/></label>
       </div>
       <button type="button" className="action-button" onClick={()=>{setVariants(rows=>rows.filter(x=>x.itemId!==v.itemId));invalidate()}}>Убрать из расчёта</button>
      </div>;
     })}</div>
     <button type="button" className="action-button primary" disabled={!variants.length||variants.some(v=>!candidates.some(w=>w.id===v.itemId))}
      onClick={calculate}>Рассчитать восстановление срока</button>
     {error&&<p role="alert">{error}</p>}
     {stale&&<p role="alert">План изменился. Рассчитайте варианты заново.</p>}
     {current&&<>
      <p role="status">{"Рассчитано вариантов: "+current.options.filter((o:any)=>o.valid).length+" из "+current.options.length}</p>
      <label className="atlas-recovery-reason">Обоснование выбранного варианта
       <textarea aria-label="Обоснование восстановления срока" rows={2} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/>
      </label>
      <div className="atlas-plan-comparison-cards">{current.options.map((o:any)=><div className="atlas-amendment-row" key={o.id}>
       <strong>{o.title}</strong>
       {!o.valid?<p role="alert">{o.reason}</p>:<>
        <small>{effectLabel[o.effect.dateEffect]}</small>
        <small>{"Финиш варианта: "+date(o.effect.afterFinish)+"; оставшееся отставание: "+days(o.effect.remainingSlip)}</small>
        <small>{"Выигрыш календарных дней: "+days(o.effect.advanceDays)}</small>
        {o.effect.tradeoff&&<small>Есть ухудшения сроков или ресурсных ограничений. Проверьте последствия.</small>}
        {o.effect.unknownDates&&<small>Не все даты или ресурсные периоды определены.</small>}
        {o.effect.unlinked>0&&<small>{"Работ без плановой привязки в портфеле: "+o.effect.unlinked}</small>}
        <AmendmentAnalysis result={o.preview} compact/>
        <button type="button" className="action-button" disabled={rationale.trim().length<8}
         aria-label={"Подготовить заявку: "+o.title} onClick={()=>onDraft(current,o.id,rationale)}>Подготовить заявку</button>
       </>}
      </div>)}</div>
      <p className="minor">Варианты отражают введённые предположения, а не подтверждённую производительность или ресурсное выравнивание. Заявка требует отдельного решения и сохранения.</p>
     </>}
    </>}
   </>}
  </>}
 </section>;
}

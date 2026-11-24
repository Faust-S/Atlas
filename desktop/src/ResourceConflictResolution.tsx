import React,{useLayoutEffect,useMemo,useRef,useState} from "react";
import {inspectResourceConflictResolution,compareResourceConflictResolution} from "../../src/resource-conflict-resolution.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";

const labels:Record<string,string>={assignment:"Назначение",work_shift:"Резерв работ",sequence:"Порядок",project_shift:"Старт проектов"};
const classification:Record<string,string>={FOCUS_CLEARED:"Конфликт выбранной работы устранён",RELIEVED:"Ограничение сокращено",
 TRADEOFF:"Компромисс",BLOCKED:"Недоступно"};
const shown=(w:any)=>w?.known?w.overloadDays+" / "+w.unavailableDays:"не определено";
const name=(w:any)=>w.projectName+": "+w.title;
const ref=(w:any)=>({projectId:w.projectId,workId:w.workId});
const days=(x:any)=>x==null?"не определён":x+" дн.";
const date=(x:any)=>x??"не определено";
const optionTitle=(o:any)=>(labels[o.kind]??o.kind)+": "+o.title;
const delayOptions=(max:number)=>Array.from({length:max+1},(_,i)=><option key={i} value={i}>{i?i+" дн.":"Не переносить"}</option>);

/** Same selected conflict, one current portfolio, ordinary plan proposals. */
export function ResourceConflictResolution({snapshot,resourceId,onClose,onDraft,disabled=false}:{
 snapshot:any;resourceId:string;onClose:()=>void;disabled?:boolean;
 onDraft:(comparison:any,optionId:string,choice:{rationale:string;confirmTradeoff:boolean;confirmTechnology:boolean})=>boolean}){
 const [focusId,setFocusId]=useState(""),[companionId,setCompanionId]=useState("");
 const [target,setTarget]=useState(""),[workDelay,setWorkDelay]=useState(7),[projectDelay,setProjectDelay]=useState(0);
 const [allowSequence,setAllowSequence]=useState(false);
 const [calculation,setCalculation]=useState<{snapshot:any;value:any}|null>(null);
 const [choice,setChoice]=useState(""),[error,setError]=useState(""),[rationale,setRationale]=useState("");
 const [confirmTradeoff,setConfirmTradeoff]=useState(false),[confirmTechnology,setConfirmTechnology]=useState(false);
 const resultsHeading=useRef<HTMLParagraphElement|null>(null),selectedHeading=useRef<HTMLHeadingElement|null>(null),sectionRef=useRef<HTMLElement|null>(null);
 const info=useMemo(()=>{
  try{return {value:inspectResourceConflictResolution(snapshot,resourceId)}}
  catch(e){return {error:e instanceof Error?e.message:"Расчёт недоступен"}}
 },[snapshot,resourceId]);
 const model=info&&"value" in info?info.value:null;
 const participants:any[]=model?.participants??[];
 const focus=participants.find(w=>w.id===focusId)??participants[0];
 const companion=participants.find(w=>w.id===companionId&&w.id!==focus?.id);
 const targetResource=focus?.canReassign?model?.alternatives.find((r:any)=>r.id===target):null;
 const result=calculation?.snapshot===snapshot?calculation.value:null;
 const chosen=result?.options.find((o:any)=>o.id===choice);
 const invalidate=()=>{setCalculation(null);setChoice("");setError("");setConfirmTradeoff(false);setConfirmTechnology(false)};
 const selectOption=(id:string)=>{setChoice(id);setConfirmTradeoff(false);setConfirmTechnology(false);setRationale("")};
 useLayoutEffect(()=>{
  sectionRef.current?.scrollIntoView({block:"start",behavior:"auto"});
  sectionRef.current?.focus({preventScroll:true});
 },[]);
 useLayoutEffect(()=>{
  if(result){resultsHeading.current?.focus({preventScroll:true});resultsHeading.current?.scrollIntoView({block:"nearest"});}
 },[result]);
 useLayoutEffect(()=>{
  if(chosen){selectedHeading.current?.focus({preventScroll:true});selectedHeading.current?.scrollIntoView({block:"nearest"});}
 },[chosen]);
 const calculate=()=>{
  if(!focus)return;
  try{
   setError("");setChoice("");setConfirmTradeoff(false);setConfirmTechnology(false);
   const value=compareResourceConflictResolution(snapshot,resourceId,{
    focus:ref(focus),companion:companion?ref(companion):null,targetResourceId:targetResource?.id??null,
    workDelayDays:workDelay,projectDelayDays:projectDelay,allowSequence:allowSequence&&Boolean(companion&&focus.projectId===companion.projectId)
   });
   setCalculation({snapshot,value});
  }catch(e){setCalculation(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 const canCalculate=Boolean(focus&&(targetResource||workDelay||projectDelay||allowSequence&&companion&&focus.projectId===companion.projectId));
 return <section ref={sectionRef} tabIndex={-1} className="atlas-resource-alternatives atlas-conflict-resolution" aria-label="Устранение ресурсного конфликта">
  <div className="atlas-resource-alternatives-header">
   <strong>{"Устранение конфликта: "+(model?.resourceLabel??"ресурс")}</strong>
   <button type="button" aria-label="Закрыть устранение конфликта" onClick={onClose}>Закрыть</button>
  </div>
  {info&&"error" in info&&<p role="alert">{info.error}</p>}
  {model&&focus&&<>
   <p>{"Перегрузка: "+model.current.overloadDays+" дн.; вне доступности: "+model.current.unavailableDays+
    " дн. Известных конфликтующих работ: "+participants.length+"."}</p>
   {model.undatedWork>0&&<p className="minor">{"Работ ресурса без дат: "+model.undatedWork+". Их фактическая загрузка не подтверждена."}</p>}
   <div className="atlas-plan-choice-fields">
    <label>Работа с конфликтом<select aria-label="Работа для устранения конфликта" value={focus.id}
     onChange={e=>{setFocusId(e.target.value);setTarget("");if(e.target.value===companionId)setCompanionId("");setAllowSequence(false);invalidate()}}>
     {participants.map(w=><option key={w.id} value={w.id}>{name(w)}</option>)}
    </select></label>
    <label>Вторая работа (необязательно)<select aria-label="Вторая конфликтующая работа" value={companion?.id??""}
     onChange={e=>{setCompanionId(e.target.value);setAllowSequence(false);invalidate()}}>
     <option value="">Не выбрана</option>
     {participants.filter(w=>w.id!==focus.id).map(w=><option key={w.id} value={w.id}>{name(w)}</option>)}
    </select></label>
   </div>
   <div className="atlas-amendment-row">
    <strong>{focus.title}</strong>
    <small>{"Даты: "+date(focus.startDate)+" → "+date(focus.finishDate)+"; конфликт: "+focus.overloadDays+
     " / "+focus.unavailableDays+" дн. (перегрузка / вне доступности); резерв: "+days(focus.reserveDays)}</small>
    {!focus.unstarted&&<small>Работа уже начата. Можно искать перенос другой выбранной работы, не меняя её даты.</small>}
    {companion&&<small>{name(companion)+": резерв "+days(companion.reserveDays)+"; конфликт "+companion.overloadDays+" / "+companion.unavailableDays+" дн."}</small>}
   </div>
   <strong>Какие изменения допустимы</strong>
   <div className="atlas-plan-choice-fields">
    <label>Другое назначение выбранной работы<select aria-label="Ресурс для устранения конфликта" value={targetResource?.id??""}
     disabled={!focus.canReassign||!model.alternatives.length} onChange={e=>{setTarget(e.target.value);invalidate()}}>
     <option value="">Не менять назначение</option>
     {model.alternatives.map((r:any)=><option key={r.id} value={r.id}>{r.label+" ("+r.capacityPct+"%)"}</option>)}
    </select></label>
    <label>Предел переноса работ<select aria-label="Предел переноса конфликтующих работ" value={workDelay}
     onChange={e=>{setWorkDelay(Number(e.target.value));invalidate()}}>{delayOptions(7)}</select></label>
    <label>Предел переноса проектов<select aria-label="Предел переноса конфликтующих проектов" value={projectDelay}
     onChange={e=>{setProjectDelay(Number(e.target.value));invalidate()}}>{delayOptions(7)}</select></label>
   </div>
   <small>{focus.maxWorkDelay?"Допустимый резерв выбранной работы: до "+focus.maxWorkDelay+" дн.":focus.workReason}
    {companion&&(" Вторая работа: "+(companion.maxWorkDelay?"до "+companion.maxWorkDelay+" дн.":companion.workReason))}</small>
   <label className="atlas-conflict-check"><input type="checkbox" aria-label="Сравнить технологический порядок работ"
    checked={allowSequence&&Boolean(companion&&focus.projectId===companion.projectId)}
    disabled={!companion||focus.projectId!==companion.projectId||!focus.unstarted||!companion.unstarted}
    onChange={e=>{setAllowSequence(e.target.checked);invalidate()}}/> Сравнить оба направления зависимости</label>
   {companion&&focus.projectId!==companion.projectId&&<small>Работы разных проектов. Искусственная межпроектная связь не создаётся.</small>}
   <button type="button" className="action-button primary" disabled={disabled||!canCalculate} onClick={calculate}>Сравнить решения конфликта</button>
   <p className="minor">Каждый вариант рассчитывается отдельно на одном текущем портфеле. Подбор не изменяет план или данные. Сопоставляются известные даты и мощность, а не фактическая доступность.</p>
   {error&&<p role="alert">{error}</p>}
   {calculation&&!result&&<p role="alert">Портфель изменился. Рассчитайте решения заново.</p>}
   {result&&<>
    <p role="status" tabIndex={-1} ref={resultsHeading}>
     {"Рассчитано решений конфликта: "+result.options.filter((o:any)=>o.valid).length+"; доступны для заявки: "+result.options.filter((o:any)=>o.canDraft).length+"."}</p>
    <small>В каждой строке дни перегрузки / дни вне доступности. Для оценки смотрите также количество конфликтующих работ всего портфеля.</small>
    <div className="atlas-conflict-options">
     {result.options.map((o:any)=><button key={o.id} type="button" className="atlas-conflict-option" aria-pressed={choice===o.id}
      aria-label={"Рассмотреть решение: "+optionTitle(o)} onClick={()=>selectOption(o.id)}>
      <strong>{optionTitle(o)}</strong>
      {o.valid?<><span>{classification[o.classification]??"Расчёт"}</span>
       <small>{"Ресурс: "+o.source.after.overloadDays+" / "+o.source.after.unavailableDays+"; работа: "+shown(o.focus[0]?.after)+
        "; работ портфеля в конфликтах: "+o.assessment.conflictedWorkAfter}</small>
       <small>{"Новых или усиленных нарушений сроков: "+(o.assessment.warnings.newLate+o.assessment.warnings.worseLate+
        o.assessment.warnings.newLateWork+o.assessment.warnings.worseLateWork)+"; уменьшен резерв работ: "+o.assessment.warnings.reserveReduced}</small>
      </>:<small>{o.reason}</small>}
     </button>)}
    </div>
    {chosen&&<div className="atlas-amendment-row atlas-conflict-selected">
     <h3 tabIndex={-1} ref={selectedHeading}>{optionTitle(chosen)}</h3>
     {!chosen.valid?<><p role="status">{chosen.reason}</p>
      {chosen.search&&<small>{"Проверено комбинаций: "+chosen.search.evaluated+" из "+chosen.search.space+"."}</small>}</>:<>
      <p role="status">{"Перегрузка выбранного ресурса: "+chosen.source.before.overloadDays+" → "+chosen.source.after.overloadDays+" дн.; вне доступности: "+chosen.source.before.unavailableDays+" → "+chosen.source.after.unavailableDays+" дн."}</p>
      {chosen.focus.map((w:any)=><div className="atlas-amendment-row" key={JSON.stringify([w.projectId,w.workId])}>
       <strong>{w.title}</strong>
       <small>{"Назначение: "+(w.before?.resourceLabel??"не назначено")+" → "+(w.after?.resourceLabel??"не назначено")+
        "; конфликт: "+shown(w.before)+" → "+shown(w.after)+" дн."}</small>
       <small>{"Начало: "+date(w.before?.startDate)+" → "+date(w.after?.startDate)+"; финиш: "+date(w.before?.finishDate)+" → "+date(w.after?.finishDate)}</small>
       {w.newConflictDays>0&&<small>{"Новых конфликтных дней: "+w.newConflictDays+"; устранено: "+w.clearedConflictDays}</small>}
      </div>)}
      {chosen.changes?.shifts?.map((s:any)=><small key={JSON.stringify([s.projectId,s.workId])}>
       {(s.projectName?s.projectName+" / "+s.title:s.name)+": "+s.beforeStart+" → "+s.afterStart+
        (s.beforeReserve!=null?"; резерв "+s.beforeReserve+" → "+s.afterReserve+" дн.":"")}</small>)}
      {chosen.changes?.search&&<small>{"Проверено комбинаций: "+chosen.changes.search.evaluated+" из "+chosen.changes.search.space+"."+
       (chosen.changes.search.exact?"":" Поиск ограничен, глобальный оптимум не гарантируется.")}</small>}
      {chosen.tradeoff&&<p role="status">Есть новые ограничения, перенос конфликта или ухудшение известных сроков. Сравните последствия для всего портфеля.</p>}
      {chosen.blocker&&<p role="alert">{chosen.blocker}</p>}
      <details><summary>Последствия для всего портфеля</summary><AmendmentAnalysis result={chosen.preview} compact/></details>
      {chosen.canDraft&&<>
       <label className="atlas-recovery-reason">Обоснование выбранного решения<textarea rows={2} maxLength={2000}
        aria-label="Обоснование решения конфликта" value={rationale} onChange={e=>setRationale(e.target.value)}/></label>
       {chosen.tradeoff&&<label className="atlas-conflict-check"><input type="checkbox" checked={confirmTradeoff}
        onChange={e=>setConfirmTradeoff(e.target.checked)}/> Подтверждаю известный компромисс</label>}
       {chosen.requiresTechnologyConfirmation&&<label className="atlas-conflict-check"><input type="checkbox" checked={confirmTechnology}
        onChange={e=>setConfirmTechnology(e.target.checked)}/> Подтверждаю технологическую допустимость этой связи</label>}
       <button type="button" className="action-button primary" disabled={disabled||rationale.trim().length<8||
        chosen.tradeoff&&!confirmTradeoff||chosen.requiresTechnologyConfirmation&&!confirmTechnology}
        onClick={()=>onDraft(result,chosen.id,{rationale,confirmTradeoff,confirmTechnology})}>Подготовить заявки по решению</button>
       <small>Из выбранного решения будут созданы обычные неутверждённые заявки. Утверждение, применение и сохранение выполняются отдельно.</small>
      </>}
     </>}
    </div>}
   </>}
  </>}
 </section>;
}

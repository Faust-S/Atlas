import React,{useLayoutEffect,useMemo,useRef,useState} from "react";
import {inspectResourceConflictResolution,compareResourceConflictResolution} from "../../src/resource-conflict-resolution.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";
import {ConflictPeriodPage} from "./ResourceAlternatives";

const labels:Record<string,string>={assignment:"Переназначение",work_shift:"Резерв работ",sequence:"Порядок",project_shift:"Старт проектов"};
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
export function ResourceConflictResolution({snapshot,resourceId,resourceGroup,initialFocus=null,onClose,onDraft,disabled=false}:{
 snapshot:any;resourceId:string;resourceGroup:any;initialFocus?:{projectId:string;workId:string}|null;onClose:()=>void;disabled?:boolean;
 onDraft:(comparison:any,optionId:string,choice:{rationale:string;confirmTradeoff:boolean;confirmTechnology:boolean})=>boolean}){
 const [focusId,setFocusId]=useState(()=>initialFocus?JSON.stringify([initialFocus.projectId,initialFocus.workId]):""),[companionId,setCompanionId]=useState("");
 const [targetIds,setTargetIds]=useState<string[]>([""]),[workDelay,setWorkDelay]=useState(7),[projectDelay,setProjectDelay]=useState(0);
 const [companionTargetIds,setCompanionTargetIds]=useState<string[]>([]);
 const [allowSequence,setAllowSequence]=useState(false);
 const [conditionsOpen,setConditionsOpen]=useState(true);
 const [showPeriods,setShowPeriods]=useState(false);
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
 const focus=focusId?participants.find(w=>w.id===focusId):participants[0];
 const companion=participants.find(w=>w.id===companionId&&w.id!==focus?.id);
 const availableTargets=(ids:string[])=>ids.flatMap(id=>{
  const resource=model?.alternatives.find((r:any)=>r.id===id);return resource?[resource]:[];
 });
 const targetResources:any[]=focus?.canReassign?availableTargets(targetIds):[];
 const companionTargetResources:any[]=companion?.canReassign?availableTargets(companionTargetIds):[];
 const staleSelection=Boolean(companionId&&!companion||
  targetIds.some(id=>id&&!targetResources.some(r=>r.id===id))||
  companionTargetIds.some(id=>id&&!companionTargetResources.some(r=>r.id===id)));
 const result=calculation&&calculation.snapshot===snapshot?calculation.value:null;
 const chosen=result?.options.find((o:any)=>o.id===choice);
 const invalidate=()=>{setCalculation(null);setChoice("");setError("");setConfirmTradeoff(false);setConfirmTechnology(false);setConditionsOpen(true)};
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
  if(!focus||staleSelection)return;
  try{
   setError("");setChoice("");setConfirmTradeoff(false);setConfirmTechnology(false);
   const value=compareResourceConflictResolution(snapshot,resourceId,{
    focus:ref(focus),companion:companion?ref(companion):null,targetResourceIds:targetResources.map(r=>r.id),
    companionTargetResourceIds:companionTargetResources.map(r=>r.id),
    workDelayDays:workDelay,projectDelayDays:projectDelay,allowSequence:allowSequence&&Boolean(companion&&focus.projectId===companion.projectId)
   });
   setCalculation({snapshot,value});setConditionsOpen(false);
  }catch(e){setCalculation(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 const canCalculate=Boolean(!staleSelection&&focus&&(targetResources.length||companionTargetResources.length||workDelay||projectDelay||allowSequence&&companion&&focus.projectId===companion.projectId));
 return <section ref={sectionRef} tabIndex={-1} data-atlas-conflict-panel="true" className="atlas-resource-alternatives atlas-conflict-resolution" aria-label="Устранение ресурсного конфликта">
  <div className="atlas-resource-alternatives-header">
   <strong>{"Устранение конфликта: "+(model?.resourceLabel??"ресурс")}</strong>
   <button type="button" aria-label="Закрыть устранение конфликта" onClick={onClose}>Закрыть</button>
  </div>
  {info&&"error" in info&&<p role="alert">{info.error}</p>}
  {model&&!focus&&participants.length>0&&<>
   <p role="alert">Выбранная ранее работа больше не участвует в конфликте. Выберите другую работу для нового расчёта.</p>
   <label className="atlas-plan-choice-fields">Работа с конфликтом<select aria-label="Работа для устранения конфликта" value=""
    onChange={e=>{setFocusId(e.target.value);setCompanionId("");setTargetIds([""]);setCompanionTargetIds([]);setAllowSequence(false);invalidate()}}>
    <option value="">Выберите работу</option>{participants.map(w=><option key={w.id} value={w.id}>{name(w)}</option>)}
   </select></label>
  </>}
  {model&&focus&&<>
   <p>{"Перегрузка: "+model.current.overloadDays+" дн.; вне доступности: "+model.current.unavailableDays+
    " дн. Известных конфликтующих работ: "+participants.length+"."}</p>
   {model.undatedWork>0&&<p className="minor">{"Работ ресурса без дат: "+model.undatedWork+". Их фактическая загрузка не подтверждена."}</p>}
   {(!result||conditionsOpen)?<>
   <div className="atlas-plan-choice-fields">
    <label>Работа с конфликтом<select aria-label="Работа для устранения конфликта" value={focus.id}
     onChange={e=>{setFocusId(e.target.value);setTargetIds([""]);setCompanionTargetIds([]);if(e.target.value===companionId)setCompanionId("");setAllowSequence(false);invalidate()}}>
     {participants.map(w=><option key={w.id} value={w.id}>{name(w)}</option>)}
    </select></label>
    <label>Вторая работа (необязательно)<select aria-label="Вторая конфликтующая работа" value={companion?.id??""}
     onChange={e=>{setCompanionId(e.target.value);setCompanionTargetIds([]);setAllowSequence(false);invalidate()}}>
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
   <button type="button" className="atlas-resource-options-toggle" aria-expanded={showPeriods}
    onClick={()=>setShowPeriods(v=>!v)}>{showPeriods?"Скрыть периоды конфликта работы":"Показать периоды конфликта работы"}</button>
   {showPeriods&&<ConflictPeriodPage key={JSON.stringify([snapshot.revision,focus.id])} group={resourceGroup} focus={ref(focus)}
    onSelectCompanion={w=>{setCompanionId(JSON.stringify([w.projectId,w.workId]));setCompanionTargetIds([]);setAllowSequence(false);setShowPeriods(false);invalidate()}}/>}
   <strong>Какие изменения допустимы</strong>
   <div className="atlas-plan-choice-fields">
    {targetIds.map((id,index)=><label key={index}>{index===0?"Другое назначение выбранной работы":"Дополнительный ресурс "+(index+1)}
     <select aria-label={index===0?"Ресурс для устранения конфликта":"Дополнительный ресурс для сравнения "+(index+1)}
      value={focus.canReassign&&model.alternatives.some((r:any)=>r.id===id)?id:""}
      disabled={!focus.canReassign||!model.alternatives.length} onChange={e=>{setTargetIds(old=>old.map((v,i)=>i===index?e.target.value:v));invalidate()}}>
      <option value="">{index===0?"Не менять назначение":"Не сравнивать"}</option>
      {model.alternatives.filter((r:any)=>!targetIds.some((v,i)=>i!==index&&v===r.id)).map((r:any)=>
       <option key={r.id} value={r.id}>{r.label+" ("+r.capacityPct+"%)"}</option>)}
     </select></label>)}
    {focus.canReassign&&targetIds.length<Math.min(3,model.alternatives.length)&&targetResources.length===targetIds.length&&
     <button type="button" className="action-button" onClick={()=>{setTargetIds(old=>[...old,""]);invalidate()}}>Сравнить ещё ресурс</button>}
    <label>Предел переноса работ<select aria-label="Предел переноса конфликтующих работ" value={workDelay}
     onChange={e=>{setWorkDelay(Number(e.target.value));invalidate()}}>{delayOptions(7)}</select></label>
    <label>Предел переноса проектов<select aria-label="Предел переноса конфликтующих проектов" value={projectDelay}
     onChange={e=>{setProjectDelay(Number(e.target.value));invalidate()}}>{delayOptions(7)}</select></label>
   </div>
   {companion?.canReassign&&model.alternatives.length>0&&<>
    <button type="button" className="atlas-resource-options-toggle" aria-expanded={companionTargetIds.length>0}
     onClick={()=>{setCompanionTargetIds(old=>old.length?[]:[""]);invalidate()}}>
     {companionTargetIds.length?"Исключить переназначение второй работы":"Сравнить переназначение второй работы"}
    </button>
    {companionTargetIds.length>0&&<div className="atlas-plan-choice-fields">
     {companionTargetIds.map((id,index)=><label key={index}>{index===0?"Другое назначение: "+companion.title:"Дополнительный ресурс второй работы "+(index+1)}
      <select aria-label={index===0?"Ресурс для второй конфликтующей работы":"Дополнительный ресурс второй работы "+(index+1)}
       value={model.alternatives.some((r:any)=>r.id===id)?id:""} onChange={e=>{setCompanionTargetIds(old=>old.map((v,i)=>i===index?e.target.value:v));invalidate()}}>
       <option value="">Не сравнивать</option>
       {model.alternatives.filter((r:any)=>!companionTargetIds.some((v,i)=>i!==index&&v===r.id)).map((r:any)=>
        <option key={r.id} value={r.id}>{r.label+" ("+r.capacityPct+"%)"}</option>)}
      </select></label>)}
     {companionTargetIds.length<Math.min(3,model.alternatives.length)&&companionTargetResources.length===companionTargetIds.length&&
      <button type="button" className="action-button" onClick={()=>{setCompanionTargetIds(old=>[...old,""]);invalidate()}}>Сравнить ещё ресурс второй работы</button>}
    </div>}
   </>}
   {staleSelection&&<div role="alert" className="atlas-amendment-row">
    <small>Ранее выбранная работа или назначение больше недоступны. Уточните условия, прежде чем рассчитывать решения.</small>
    <button type="button" className="action-button" onClick={()=>{if(!companion)setCompanionId("");setTargetIds([""]);setCompanionTargetIds([]);setAllowSequence(false);invalidate()}}>Сбросить выбранные назначения</button>
   </div>}
   <small>{focus.maxWorkDelay?"Допустимый резерв выбранной работы: до "+focus.maxWorkDelay+" дн.":focus.workReason}
    {companion&&(" Вторая работа: "+(companion.maxWorkDelay?"до "+companion.maxWorkDelay+" дн.":companion.workReason))}</small>
   <label className="atlas-conflict-check"><input type="checkbox" aria-label="Сравнить технологический порядок работ"
    checked={allowSequence&&Boolean(companion&&focus.projectId===companion.projectId)}
    disabled={!companion||focus.projectId!==companion.projectId||!focus.unstarted||!companion.unstarted}
    onChange={e=>{setAllowSequence(e.target.checked);invalidate()}}/> Сравнить оба направления зависимости</label>
   {companion&&focus.projectId!==companion.projectId&&<small>Работы разных проектов. Искусственная межпроектная связь не создаётся.</small>}
   <button type="button" className="action-button primary" disabled={disabled||!canCalculate} onClick={calculate}>Сравнить решения конфликта</button>
   <p className="minor">Каждый вариант рассчитывается отдельно на одном текущем портфеле. Подбор не изменяет план или данные. Сопоставляются известные даты и мощность, а не фактическая доступность.</p>
   </>:<div className="atlas-conflict-conditions">
    <div><strong>{name(focus)}{companion?"; "+name(companion):""}</strong>
     <small>{[
      targetResources.length?"Назначения выбранной работы: "+targetResources.map(r=>r.label).join(", "):null,
      companionTargetResources.length?"Назначения второй работы: "+companionTargetResources.map(r=>r.label).join(", "):null,
      workDelay?"Перенос работ до "+workDelay+" дн.":null,
      allowSequence?"Оба направления зависимости":null,
      projectDelay?"Перенос проектов до "+projectDelay+" дн.":null
     ].filter(Boolean).join(" · ")}</small></div>
    <button type="button" className="action-button" onClick={()=>setConditionsOpen(true)}>Изменить условия</button>
   </div>}
   {error&&<p role="alert">{error}</p>}
   {calculation&&!result&&<p role="alert">Портфель изменился. Рассчитайте решения заново.</p>}
   {result&&<>
    <p role="status" tabIndex={-1} ref={resultsHeading}>
     {"Рассчитано решений конфликта: "+result.options.filter((o:any)=>o.valid).length+"; доступны для заявки: "+result.options.filter((o:any)=>o.canDraft).length+"."}</p>
    <div className="atlas-amendment-row atlas-conflict-current">
     <strong>Текущий план</strong>
     <small>{"Ресурс: "+result.baseline.current.overloadDays+" / "+result.baseline.current.unavailableDays+
      " дн.; выбранная работа: "+focus.overloadDays+" / "+focus.unavailableDays+" дн."+
      (companion?"; вторая: "+companion.overloadDays+" / "+companion.unavailableDays+" дн.":"")}</small>
     <small>{"Портфель: "+result.baseline.portfolio.overloadDays+" / "+result.baseline.portfolio.unavailableDays+
      " ресурс-дн.; превышение мощности "+result.baseline.portfolio.overloadPctDays+" п. п.·дн."+
      (result.options.find((o:any)=>o.valid)?"; работ в конфликтах "+result.options.find((o:any)=>o.valid).assessment.conflictedWorkBefore:"")}</small>
    </div>
    <small>Во всех вариантах: дни перегрузки / дни вне доступности. Сравнивайте также глубину перегрузки и конфликтующие работы всего портфеля.</small>
    <div className="atlas-conflict-options">
     {result.options.map((o:any)=><button key={o.id} type="button" className="atlas-conflict-option" aria-pressed={choice===o.id}
      aria-label={"Рассмотреть решение: "+optionTitle(o)} onClick={()=>selectOption(o.id)}>
      <strong>{optionTitle(o)}</strong>
      {o.valid?<><span>{classification[o.classification]??"Расчёт"}</span>
       <small>{"Ресурс: "+o.source.after.overloadDays+" / "+o.source.after.unavailableDays+"; работа: "+shown(o.focus[0]?.after)+
        (o.focus[1]?"; вторая: "+shown(o.focus[1].after):"")+
        "; работ портфеля в конфликтах: "+o.assessment.conflictedWorkAfter}</small>
       <small>{"Портфель: "+o.preview.resourceAfter.overloadDays+" / "+o.preview.resourceAfter.unavailableDays+
        " ресурс-дн.; превышение "+o.preview.resourceAfter.overloadPctDays+" п. п.·дн."}</small>
       <small>{"Новых или усиленных нарушений сроков: "+(o.assessment.warnings.newLate+o.assessment.warnings.worseLate+
        o.assessment.warnings.newLateWork+o.assessment.warnings.worseLateWork)+"; уменьшен резерв работ: "+o.assessment.warnings.reserveReduced}</small>
      </>:<small>{o.reason}</small>}
     </button>)}
    </div>
    {chosen&&<div className="atlas-amendment-row atlas-conflict-selected">
     <h3 tabIndex={-1} ref={selectedHeading}>{optionTitle(chosen)}</h3>
     {!chosen.valid?<><p role="status">{chosen.reason}</p>
      {chosen.search&&<>
       <small>{"Проверено комбинаций: "+chosen.search.evaluated+" из "+chosen.search.space+"."}</small>
       {[
        ["noReduction","Конфликт ресурса не уменьшается"],
        ["projectMoved","Изменяются даты проектов"],
        ["fixedMoved","Затронуты начатые или недоступные проекты"],
        ["fixedWorkMoved","Затронуты начатые или завершённые работы"],
        ["reserveExceeded","Превышен резерв или предел переноса"],
        ["deadlineWorse","Ухудшаются известные сроки"],
        ["worseResources","Усиливаются другие ресурсные ограничения"],
        ["lostDates","Теряются известные даты"],
        ["calculationUnavailable","Расчёт недоступен"],
        ["invalidHorizon","Выход за пределы календаря"]
       ].filter(([id])=>chosen.search.reasons[id]>0).map(([id,label])=><small key={id}>{label+": "+chosen.search.reasons[id]}</small>)}
      </>}</>:<>
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

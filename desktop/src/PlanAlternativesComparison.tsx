import React,{useMemo,useState} from "react";
import {comparePlanAmendments,planAmendmentReviewAction} from "../../src/plan-amendment.mjs";

const date=(value:any)=>value??"не определён";
const shift=(value:any)=>value==null?"не определён":(value>0?"+":"")+value+" дн.";
const number=(value:any)=>value==null?"не определено":String(value);
const periodLabel=(kind:string)=>({NEW:"Новый конфликт",CLEARED:"Устранён",WORSENED:"Усилен",
 RELIEVED:"Ослаблен",CHANGED_KIND:"Изменён вид ограничения"} as Record<string,string>)[kind]??kind;
const control=(value:any)=>value??"не задан";
function workLine(w:any){
 if(!w)return "Работа отсутствует";
 return date(w.start)+" → "+date(w.finish)+
  "; резерв: "+number(w.floatDays)+" дн.; контроль: "+control(w.dueDate)+
  "; отклонение: "+number(w.slipDays)+" дн.";
}

/** The full existing amendment preview, with bounded detail lists. */
export function AmendmentAnalysis({result,compact=false}:{result:any;compact?:boolean}){
 const [projects,setProjects]=useState(8);
 const [works,setWorks]=useState(8);
 const [resources,setResources]=useState(8);
 const [expanded,setExpanded]=useState(!compact);
 const summary="Затронуто работ: "+result.workSummary.affected+
  ". Новых нарушений неизменённых сроков работ: "+result.workSummary.newlyLate+
  ". Усилено прежних: "+result.workSummary.worsenedLate+
  ". Уменьшился резерв: "+result.workSummary.reserveReduced+
  ". Изменение критического пути: "+result.workSummary.criticalChanged+".";
 const focus=result.rows.find((r:any)=>!r.downstream);
 const capacity="Перегрузка портфеля: "+result.resourceBefore.overloadDays+" → "+result.resourceAfter.overloadDays+
  " дн. Вне доступности: "+result.resourceBefore.unavailableDays+" → "+result.resourceAfter.unavailableDays+" дн.";
 const finish="Финиш проекта: "+date(focus?.beforeFinish)+" → "+date(focus?.afterFinish)+".";
 return <div className="atlas-amendment-analysis">
  {!compact&&<h4>Последствия относительно текущего плана</h4>}
  <p role="status" aria-label={finish} className="atlas-amendment-summary">{finish}</p>
  {focus?.baselineName&&<p>{"Контрольный план "+focus.baselineName+": "+date(focus.baselineFinish)+
   ". Отклонение: "+shift(focus.beforeBaselineShift)+" → "+shift(focus.afterBaselineShift)+"."}</p>}
  <p role="status" aria-label={capacity} className="atlas-amendment-summary">{capacity}</p>
  <p>{'Превышение мощности: '+result.resourceBefore.overloadPctDays+' → '+result.resourceAfter.overloadPctDays+
   ' п. п.·дн.; нагрузка вне доступности: '+result.resourceBefore.unavailablePctDays+' → '+result.resourceAfter.unavailablePctDays+' %·дн.'}</p>
  <p role="status" aria-label={summary}>{summary}</p>
  <p>{'Проектов по цепочке: '+result.affected+'; изменено: '+result.changed+
   '; новых нарушений сроков проектов: '+result.projectSummary.newlyLate+
   '; усилено прежних: '+result.projectSummary.worsenedLate+'.'}</p>
  <p>{'Изменены контрольные даты: проектов '+result.projectSummary.controlChanged+', работ '+result.workSummary.controlChanged+
   '. Неизвестны даты: проектов '+result.projectSummary.unknown+', работ '+result.workSummary.unknown+
   '. Без плановой привязки: '+result.resourceBefore.unlinked+' → '+result.resourceAfter.unlinked+'.'}</p>
  {compact&&<button type="button" className="action-button" aria-expanded={expanded}
   onClick={()=>setExpanded(v=>!v)}>{expanded?"Скрыть подробности сценария":"Подробности сценария"}</button>}
  {expanded&&<>
   <details open={!compact}>
    <summary>Проекты и контрольные редакции ({result.rows.length})</summary>
    <div className="atlas-amendment-rows">{result.rows.slice(0,projects).map((r:any)=>
     <div className="atlas-amendment-row" key={r.id}>
      <strong>{r.name}</strong><small>{"Расчётный финиш: "+date(r.beforeFinish)+" → "+date(r.afterFinish)}</small>
      {r.baselineName&&<small>{"Контрольная редакция "+r.baselineName+": "+date(r.baselineFinish)+
       "; отклонение "+shift(r.beforeBaselineShift)+" → "+shift(r.afterBaselineShift)}</small>}
      <small>{"Срок: "+control(r.beforeDeadline)+" → "+control(r.afterDeadline)+
       "; отклонение "+number(r.beforeSlip)+" → "+number(r.afterSlip)+" дн."}</small>
     </div>)}</div>
    {result.rows.length>projects&&<button type="button" className="action-button" onClick={()=>setProjects(n=>n+8)}>
     Ещё проекты ({result.rows.length-projects})</button>}
   </details>
   {result.dependencyRows?.length>0&&<details open={!compact}>
    <summary>Изменения порядка работ ({result.dependencyRows.length})</summary>
    <div className="atlas-amendment-rows">{result.dependencyRows.map((r:any)=>
     <div className="atlas-amendment-row" key={JSON.stringify([r.from,r.to])}>
      <strong>{r.fromTitle+" → "+r.toTitle}</strong>
      <small>{r.after?"Добавить зависимость":"Удалить зависимость"}</small>
     </div>)}</div>
   </details>}
   <details>
    <summary>Затронутые работы и резервы ({result.workRows.length})</summary>
    <div className="atlas-amendment-rows">{result.workRows.slice(0,works).map((w:any)=>
     <div className="atlas-amendment-row" key={JSON.stringify([w.projectId,w.workId])}>
      <strong>{w.projectName}: {w.title}</strong>
      <small>{"Сейчас: "+workLine(w.before)}</small><small>{"Вариант: "+workLine(w.after)}</small>
      {w.baselineFinish&&<small>{"Контрольная редакция: "+w.baselineFinish+"; сдвиг "+shift(w.afterBaselineShift)}</small>}
      <small>{"Ресурс: "+(w.beforeResource??"не назначен")+" → "+(w.afterResource??"не назначен")+
       "; доля "+number(w.before?.allocationPct)+" → "+number(w.after.allocationPct)+"%"}</small>
      {w.criticalChanged&&<small>{w.after.critical?"Входит в критический путь":"Выходит из критического пути"}</small>}
      {w.controlChanged&&<small>Контрольная дата изменена, это не устранение прежнего отставания.</small>}
     </div>)}</div>
    {result.workRows.length>works&&<button type="button" className="action-button" onClick={()=>setWorks(n=>n+8)}>
     Ещё работы ({result.workRows.length-works})</button>}
   </details>
   <details>
    <summary>Изменение ресурсных ограничений ({result.resourceRows.length})</summary>
    <div className="atlas-amendment-rows">{result.resourceRows.slice(0,resources).map((r:any)=>
     <div className="atlas-amendment-row" key={r.id}>
      <strong>{r.label}</strong>
      <small>{"Перегрузка: "+r.beforeOverload+" → "+r.afterOverload+
       " дн.; вне доступности: "+r.beforeUnavailable+" → "+r.afterUnavailable+" дн."}</small>
      <small>{"Превышение мощности: "+r.overloadDepthBefore+" → "+r.overloadDepthAfter+" п. п.·дн."}</small>
      {r.periodChanges?.count>0&&<>
       <small>{"Новых дней: "+r.periodChanges.totals.NEW+"; устранено: "+r.periodChanges.totals.CLEARED+
        "; усилено: "+r.periodChanges.totals.WORSENED+"; ослаблено: "+r.periodChanges.totals.RELIEVED+
        "; изменён вид: "+r.periodChanges.totals.CHANGED_KIND+"."}</small>
       {r.periodChanges.rows.map((p:any)=><small key={p.kind+":"+p.startDate}>
        {periodLabel(p.kind)+": "+p.startDate+" по "+p.endDate+
         ". Ограничение: "+(p.beforeKind==="availability"?p.beforeExcessPct+"% вне доступности":p.beforeKind==="overload"?p.beforeExcessPct+" п. п. превышения":"нет")+
         " → "+(p.afterKind==="availability"?p.afterExcessPct+"% вне доступности":p.afterKind==="overload"?p.afterExcessPct+" п. п. превышения":"нет")}</small>)}
       {r.periodChanges.count>r.periodChanges.rows.length&&<small>Ещё периодов: {r.periodChanges.count-r.periodChanges.rows.length}</small>}
      </>}
     </div>)}</div>
    {result.resourceRows.length>resources&&<button type="button" className="action-button" onClick={()=>setResources(n=>n+8)}>
     Ещё ресурсы ({result.resourceRows.length-resources})</button>}
   </details>
  </>}
  <p className="minor">Расчёт плана, не фактическая доступность ресурсов или разрешение на исполнение.</p>
 </div>;
}

/** Explain the exact stale source fields before opening the ordinary editor. */
export function AmendmentReview({view,onOpenEditor}:{view:any;onOpenEditor:(action:string)=>void}){
 if(!view||(!view.rows.length&&!view.sourceIssue))return null;
 const labels:Record<string,string>={CURRENT_ONLY:"Сохранится текущее значение",PROPOSED_ONLY:"Предложение можно сохранить или исключить",
  CONVERGED:"Уже соответствует предложению",CONFLICT:"Требуется выбор",CONTEXT_CHANGED:"Единицы или календарь изменились",BLOCKED:"Нельзя изменить порядок"};
 return <div className="atlas-amendment-review">
  <h4>Исходные данные заявки изменились</h4>
  {view.sourceIssue&&<p role="alert">{view.sourceIssue}</p>}
  {view.needsDeferral&&<><p>Сначала отложите утверждённую заявку через существующее решение. Предыдущее утверждение останется в истории.</p>
   <button type="button" className="action-button" onClick={()=>onOpenEditor("change:"+view.changeId)}>Открыть решение</button></>}
  <p role="status">Корректировок к пересмотру: {view.rows.length}. Сам план не изменяется.</p>
  {view.rows.map((r:any)=><div className="atlas-amendment-row" key={r.key}>
   <strong>{r.title}</strong><small>{r.reason}</small>
   {view.editable&&r.canReview&&<button type="button" className="action-button" aria-label={"Пересмотреть корректировку "+r.title}
    onClick={()=>onOpenEditor(planAmendmentReviewAction(view.changeId,r.key,view.revision))}>Пересмотреть</button>}
   {view.editable&&!r.canReview&&<small>Уберите эту корректировку из заявки, если она больше недопустима.</small>}
   {r.fields.map((f:any)=><div key={f.name} className="atlas-amendment-review-field">
    <strong>{f.label+": "+(labels[f.state]??f.state)}</strong>
    <small>{"Было: "+f.beforeLabel}</small><small>{"Сейчас: "+f.currentLabel}</small>
    <small>{"Предлагалось: "+f.proposedLabel}</small>
    {f.interpretation&&<small>Нельзя автоматически переносить длительность между календарями. Выберите значение в текущей единице явно.</small>}
   </div>)}
  </div>)}
 </div>;
}

export function PlanAlternativesComparison({snapshot,projectId,onOpenChange}:{
 snapshot:any;projectId:string;onOpenChange:(id:string)=>void}){
 const [expanded,setExpanded]=useState(false);
 const [first,setFirst]=useState("");
 const [second,setSecond]=useState("");
 const [compare,setCompare]=useState(false);
 const proposals=(snapshot.projects.find((p:any)=>p.id===projectId)?.changes??[]).filter((c:any)=>
  c.planAmendments?.length&&!c.planAppliedAt&&["proposed","deferred","approved","in_progress"].includes(c.status));
 const a=proposals.find((c:any)=>c.id===first)??proposals[0];
 const b=proposals.find((c:any)=>c.id===second&&c.id!==a?.id)??proposals.find((c:any)=>c.id!==a?.id);
 const result=useMemo(()=>{
  if(!expanded||!compare||!a||!b)return null;
  try{return {value:comparePlanAmendments(snapshot,projectId,a.id,b.id)}}
  catch(error){return {error:error instanceof Error?error.message:"Сравнение недоступно"}}
 },[snapshot,projectId,a?.id,b?.id,expanded,compare]);
 if(proposals.length<2)return null;
 return <section className="atlas-plan-alternatives" aria-label="Сравнение заявок на изменение плана">
  <button type="button" className="action-button" aria-expanded={expanded}
   onClick={()=>{setExpanded(v=>!v);setCompare(false)}}>{expanded?"Скрыть сравнение заявок":"Сравнить варианты плана"}</button>
  {expanded&&<>
   <p>Две неприменённые заявки сравниваются независимо с одной текущей редакцией. Выбор не утверждает и не применяет изменение.</p>
   <div className="atlas-plan-choice-fields">
    <label>Вариант A<select aria-label="Вариант плана A" value={a?.id??""}
     onChange={event=>{setFirst(event.target.value);setCompare(false)}}>
     {proposals.map((c:any)=><option key={c.id} value={c.id}>{c.title}</option>)}
    </select></label>
    <label>Вариант B<select aria-label="Вариант плана B" value={b?.id??""}
     onChange={event=>{setSecond(event.target.value);setCompare(false)}}>
     {proposals.filter((c:any)=>c.id!==a?.id).map((c:any)=><option key={c.id} value={c.id}>{c.title}</option>)}
    </select></label>
   </div>
   <button type="button" className="action-button primary" disabled={!a||!b}
    onClick={()=>setCompare(true)}>Рассчитать два сценария</button>
   {result&&"error" in result&&<p role="alert">{result.error}</p>}
   {result&&"value" in result&&result.value&&<div className="atlas-plan-comparison-cards">
    {result.value.options.map((o:any,i:number)=><div className="atlas-amendment-row" key={o.id}>
     <strong>{(i===0?"A: ":"B: ")+o.title}</strong>
     <small>{o.status==="approved"||o.status==="in_progress"?"Утверждена, не применена":
      o.status==="deferred"?"Отложена":o.status==="proposed"?"Предложение":"Недоступна"}</small>
     <button type="button" className="action-button" aria-label={"Открыть заявку "+o.title}
      onClick={()=>onOpenChange(o.id)}>К заявке</button>
     {o.valid?<AmendmentAnalysis key={o.id} result={o.preview} compact/>:<p role="alert">{o.reason}</p>}
    </div>)}
   </div>}
  </>}
 </section>;
}

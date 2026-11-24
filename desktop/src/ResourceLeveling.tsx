import React,{useLayoutEffect,useMemo,useRef,useState} from "react";
import {inspectResourceLeveling,compareResourceLeveling} from "../../src/resource-leveling.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";

type Choice={projectId:string;maxDelay:string};
export function ResourceLeveling({snapshot,resources,onDraft,disabled=false}:{
 snapshot:any;resources:any;onDraft:(comparison:any,optionId:string,rationale:string)=>void;disabled?:boolean}){
 const [expanded,setExpanded]=useState(false),[resourceId,setResourceId]=useState("");
 const [choice,setChoice]=useState<Choice[]>([]),[candidateId,setCandidateId]=useState("");
 const [calc,setCalc]=useState<{snapshot:any;value:any}|null>(null);
 const [error,setError]=useState(""),[rationale,setRationale]=useState("");
 const resultHeading=useRef<HTMLParagraphElement|null>(null);
 const groups=(resources.people??[]).filter((r:any)=>r.overloadDays||r.unavailableDays);
 const resource=groups.find((r:any)=>r.id===resourceId)??groups[0];
 const info=useMemo(()=>{
  if(!expanded||!resource)return null;
  try{return {value:inspectResourceLeveling(snapshot,resource.id)}}catch(e){return {error:e instanceof Error?e.message:"Расчёт недоступен"}}
 },[expanded,snapshot,resource?.id]);
 const model=info&&"value" in info?info.value:null;
 const candidates=model?.candidates??[],available=candidates.filter((c:any)=>c.available&&!choice.some(r=>r.projectId===c.id));
 const selected=available.find((c:any)=>c.id===candidateId)??available[0];
 const result=calc&&calc.snapshot===snapshot&&calc.value.resourceId===resource?.id?calc.value:null;
 const invalidate=()=>{setCalc(null);setError("")};
 const changeChoice=(next:Choice[])=>{setChoice(next);invalidate()};
 const move=(i:number,delta:number)=>{
  const next=[...choice],j=i+delta;
  if(j<0||j>=next.length)return;
  [next[i],next[j]]=[next[j],next[i]];changeChoice(next);
 };
 useLayoutEffect(()=>{
  if(result&&expanded){resultHeading.current?.focus({preventScroll:true});resultHeading.current?.scrollIntoView({block:"nearest"});}
 },[result,expanded]);
 const calculate=()=>{
  if(!resource)return;
  try{
   setError("");
   setCalc({snapshot,value:compareResourceLeveling(snapshot,resource.id,choice.map(c=>({
    projectId:c.projectId,maxDelay:/^\d+$/.test(c.maxDelay)?Number(c.maxDelay):NaN})))});
  }catch(e){setCalc(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 return <section className="atlas-plan-alternatives atlas-resource-leveling" aria-label="Выравнивание плановых ресурсов">
  <div className="section-heading"><div><h3>Выравнивание ресурсов</h3><p>Подберите допустимые переносы начала ещё не начатых проектов.</p></div>
   <button type="button" className="action-button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
    {expanded?"Скрыть выравнивание":"Подобрать план по ресурсу"}</button></div>
  {expanded&&<>
   {!groups.length?<p>По известным срокам перегрузки и выходы за доступность не обнаружены. Это не подтверждение фактической доступности.</p>:<>
    <div className="atlas-plan-choice-fields">
     <label>Ресурс с ограничениями<select aria-label="Ресурс для выравнивания" value={resource?.id??""}
      onChange={e=>{setResourceId(e.target.value);setCandidateId("");changeChoice([])}}>
      {groups.map((r:any)=><option key={r.id} value={r.id}>{r.label+" · перегрузка "+r.overloadDays+" дн.; вне доступности "+r.unavailableDays+" дн."}</option>)}
     </select></label>
    </div>
    {info&&"error" in info&&<p role="alert">{info.error}</p>}
    {model&&<>
     <p>Выберите до четырёх проектов и предел переноса для каждого (1–7 календарных дней). Первый проект имеет больший приоритет при равных результатах. Не выбранные проекты не получают новых дат начала. Возможные последствия зависимостей учитываются во всём портфеле.</p>
     {model.undatedWork>0&&<p className="minor">{"Работ ресурса без дат: "+model.undatedWork+". Расчёт учитывает только известную занятость."}</p>}
     {choice.map((ref,i)=>{
      const p=candidates.find((c:any)=>c.id===ref.projectId);
      return <div className="atlas-amendment-row atlas-leveling-choice" key={ref.projectId}>
       <strong>{(i+1)+". "+(p?.name??"Проект недоступен")}</strong>
       <small>{p?"Финиш: "+(p.finish??"не определён")+"; контрольный срок: "+(p.deadline??"не задан")+"; запас до срока: "+(p.reserveDays==null?"не определён":p.reserveDays+" дн."):"Обновите выбор."}</small>
       <div className="atlas-plan-choice-fields">
        <label>Максимальный перенос, кал. дн.<input aria-label={"Предел переноса "+(i+1)} type="number" min={1} max={7} step={1}
         value={ref.maxDelay} onChange={e=>changeChoice(choice.map((r,j)=>j===i?{...r,maxDelay:e.target.value}:r))}/></label>
        <div className="button-row">
         <button type="button" className="action-button" disabled={i===0} aria-label={"Повысить приоритет "+(i+1)} onClick={()=>move(i,-1)}>↑</button>
         <button type="button" className="action-button" disabled={i===choice.length-1} aria-label={"Понизить приоритет "+(i+1)} onClick={()=>move(i,1)}>↓</button>
         <button type="button" className="action-button" aria-label={"Убрать проект "+(i+1)} onClick={()=>changeChoice(choice.filter((_,j)=>j!==i))}>Убрать</button>
        </div>
       </div>
      </div>;
     })}
     {choice.length<model.maxProjects&&available.length>0&&<div className="atlas-plan-choice-fields">
      <label>Допустимый к переносу проект<select aria-label="Проект для выравнивания" value={selected?.id??""} onChange={e=>setCandidateId(e.target.value)}>
       {available.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <button type="button" className="action-button" disabled={!selected}
       onClick={()=>selected&&changeChoice([...choice,{projectId:selected.id,maxDelay:"7"}])}>Добавить проект для выравнивания</button>
     </div>}
     {candidates.some((p:any)=>!p.available)&&<details><summary>Почему часть проектов нельзя переносить</summary>
      {candidates.filter((p:any)=>!p.available).map((p:any)=><p key={p.id}>{p.name+": "+p.reason}</p>)}
     </details>}
     <button type="button" className="action-button primary" disabled={disabled||!choice.length||choice.some(r=>!candidates.some((p:any)=>p.id===r.projectId&&p.available))}
      onClick={calculate}>Рассчитать выравнивание</button>
    </>}
   </>}
   {error&&<p role="alert">{error}</p>}
   {calc&&!result&&<p role="alert">Портфель изменился. Рассчитайте варианты заново.</p>}
   {result&&<>
    <p role="status" tabIndex={-1} ref={resultHeading}>{"Вариантов выравнивания: "+result.options.length+". Проверено комбинаций: "+result.search.evaluated+" из "+result.search.space+"."}</p>
    {!result.search.exact&&<p className="minor">Использован ограниченный поиск. Не гарантируется нахождение всех допустимых решений.</p>}
    {!result.options.length?<p>В проверенных комбинациях не найдено уменьшения ограничений без роста агрегированной перегрузки других ресурсов и без переноса уже начатых проектов. Уточните пределы или подготовьте другие корректировки в обычных заявках.</p>:<>
     <label className="atlas-recovery-reason">Обоснование переноса
      <textarea aria-label="Обоснование выравнивания ресурсов" rows={2} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/>
     </label>
     <div className="atlas-plan-comparison-cards">{result.options.map((o:any)=><div className="atlas-amendment-row" key={o.id}>
      <strong>{o.title}</strong>
      {o.objectives.length>1&&<small>Совпадает лучший вариант по обоим проверяемым критериям.</small>}
      <p role="status">{"Перегрузка выбранного ресурса: "+result.before.overloadDays+" → "+o.target.overloadDays+" дн.; вне доступности: "+result.before.unavailableDays+" → "+o.target.unavailableDays+" дн."}</p>
      <small>{"Превышение мощности: "+result.before.overloadPctDays+" → "+o.target.overloadPctDays+" п. п.·дн."}</small>
      <small>{"Дополнительное отставание по известным срокам: проекты "+o.projectIncrease+" дн., работы "+o.workIncrease+" дн."}</small>
      <small>{"Конфликтующих работ портфеля: "+o.assessment.conflictedWorkBefore+" → "+o.assessment.conflictedWorkAfter}</small>
      {o.assessment.hasTradeoff&&<small>Есть изменившиеся ограничения, сроки или резервы. Изучите подробности.</small>}
      {o.assessment.resourceState==="INCOMPLETE"&&<small>Ресурсный расчёт неполон.</small>}
      {o.assessment.resourceState==="CONFLICTS"&&<small>Остаются ресурсные ограничения портфеля.</small>}
      {o.shifts.map((s:any)=><div className="atlas-plan-set-member" key={s.projectId}><div>
       <strong>{s.name+" · +"+s.days+" дн."}</strong>
       <small>{"Начало: "+s.beforeStart+" → "+s.afterStart+"; финиш: "+s.beforeFinish+" → "+s.afterFinish}</small>
       <small>{"Контрольный срок: "+(s.deadline??"не задан")}</small>
      </div></div>)}
      <details><summary>Последствия для работ и всего портфеля</summary><AmendmentAnalysis compact result={o.preview}/></details>
      <button type="button" className="action-button" disabled={disabled||rationale.trim().length<8}
       aria-label={"Подготовить заявки: "+o.title} onClick={()=>onDraft(result,o.id,rationale)}>Подготовить заявки</button>
     </div>)}</div>
     <p className="minor">Будут подготовлены обычные неутверждённые заявки на перенос начала, без изменения контрольных сроков, длительностей или назначений. Согласование, применение и сохранение выполняются отдельно.</p>
    </>}
   </>}
  </>}
 </section>;
}

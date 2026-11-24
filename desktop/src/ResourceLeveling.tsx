import React,{useLayoutEffect,useMemo,useRef,useState} from "react";
import {inspectResourceLeveling,compareResourceLeveling} from "../../src/resource-leveling.mjs";
import {inspectWorkResourceLeveling,compareWorkResourceLeveling} from "../../src/work-resource-leveling.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";

type Choice={id:string;projectId:string;workId?:string;maxDelay:string};
export function ResourceLeveling({snapshot,resources,onDraft,disabled=false}:{
 snapshot:any;resources:any;onDraft:(comparison:any,optionId:string,rationale:string)=>boolean;disabled?:boolean}){
 const [expanded,setExpanded]=useState(false),[resourceId,setResourceId]=useState("");
 const [mode,setMode]=useState<"project"|"work">("project");
 const workMode=mode==="work";
 const [choice,setChoice]=useState<Choice[]>([]),[candidateId,setCandidateId]=useState("");
 const [calc,setCalc]=useState<{snapshot:any;value:any}|null>(null);
 const [error,setError]=useState(""),[rationale,setRationale]=useState("");
 const resultHeading=useRef<HTMLParagraphElement|null>(null);
 const groups=(resources.people??[]).filter((r:any)=>r.overloadDays||r.unavailableDays);
 const resource=groups.find((r:any)=>r.id===resourceId)??groups[0];
 const info=useMemo(()=>{
  if(!expanded||!resource)return null;
  try{return {value:workMode?inspectWorkResourceLeveling(snapshot,resource.id):inspectResourceLeveling(snapshot,resource.id)}}catch(e){return {error:e instanceof Error?e.message:"Расчёт недоступен"}}
 },[expanded,snapshot,resource?.id,workMode]);
 const model:any=info&&"value" in info?info.value:null;
 const candidates=model?.candidates??[],available=candidates.filter((c:any)=>c.available&&!choice.some(r=>r.id===c.id));
 const selected=available.find((c:any)=>c.id===candidateId)??available[0];
 const result=calc&&calc.snapshot===snapshot&&calc.value.resourceId===resource?.id?calc.value:null;
 const invalidate=()=>{setCalc(null);setError("")};
 const changeChoice=(next:Choice[])=>{setChoice(next);invalidate()};
 const changeMode=(next:"project"|"work")=>{if(next!==mode){setMode(next);setCandidateId("");changeChoice([])}};
 const name=(p:any)=>workMode?p.projectName+" / "+p.title:p.name;
 const number=(s:string)=>/^\d+$/.test(s)?Number(s):NaN;
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
   const value=workMode?compareWorkResourceLeveling(snapshot,resource.id,choice.map(c=>({
    projectId:c.projectId,workId:c.workId!,maxDelay:number(c.maxDelay)}))):
    compareResourceLeveling(snapshot,resource.id,choice.map(c=>({projectId:c.projectId,maxDelay:number(c.maxDelay)})));
   setCalc({snapshot,value});
  }catch(e){setCalc(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 return <section className="atlas-plan-alternatives atlas-resource-leveling" aria-label="Выравнивание плановых ресурсов">
  <div className="section-heading"><div><h3>Выравнивание ресурсов</h3><p>Подберите допустимые переносы начала работ или проектов.</p></div>
   <button type="button" className="action-button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
    {expanded?"Скрыть выравнивание":"Подобрать план по ресурсу"}</button></div>
  {expanded&&<>
   {!groups.length?<p>По известным срокам перегрузки и выходы за доступность не обнаружены. Это не подтверждение фактической доступности.</p>:<>
    <div className="button-row atlas-leveling-modes" role="group" aria-label="Что можно переносить">
     <button type="button" className="action-button" aria-pressed={workMode} onClick={()=>changeMode("work")}>Перенос отдельных работ</button>
     <button type="button" className="action-button" aria-pressed={!workMode} onClick={()=>changeMode("project")}>Перенос начала проектов</button>
    </div>
    <div className="atlas-plan-choice-fields">
     <label>Ресурс с ограничениями<select aria-label="Ресурс для выравнивания" value={resource?.id??""}
      onChange={e=>{setResourceId(e.target.value);setCandidateId("");changeChoice([])}}>
      {groups.map((r:any)=><option key={r.id} value={r.id}>{r.label+" · перегрузка "+r.overloadDays+" дн.; вне доступности "+r.unavailableDays+" дн."}</option>)}
     </select></label>
    </div>
    {info&&"error" in info&&<p role="alert">{info.error}</p>}
    {model&&<>
     {workMode?<p>Выберите до четырёх конфликтующих работ с резервом. Перенос ограничен доступным резервом и вашим пределом (до 7 календарных дней). Даты проектов, известные контрольные сроки и даты уже начатых работ сохраняются. Первый выбранный объект имеет больший приоритет при равных результатах.</p>:
      <p>Выберите до четырёх проектов и предел переноса для каждого (1–7 календарных дней). Первый проект имеет больший приоритет при равных результатах. Не выбранные проекты не получают новых дат начала. Возможные последствия зависимостей учитываются во всём портфеле.</p>}
     {model.undatedWork>0&&<p className="minor">{"Работ ресурса без дат: "+model.undatedWork+". Расчёт учитывает только известную занятость."}</p>}
     {choice.map((ref,i)=>{
      const p=candidates.find((c:any)=>c.id===ref.id);
      return <div className="atlas-amendment-row atlas-leveling-choice" key={ref.id}>
       <strong>{(i+1)+". "+(p?name(p):"Объект недоступен")}</strong>
       <small>{p?workMode?"Начало: "+p.startDate+"; финиш: "+p.finishDate+"; резерв: "+p.reserveDays+" дн.; контрольный срок: "+(p.deadline??"не задан"):
        "Финиш: "+(p.finish??"не определён")+"; контрольный срок: "+(p.deadline??"не задан")+"; запас до срока: "+(p.reserveDays==null?"не определён":p.reserveDays+" дн."):"Обновите выбор."}</small>
       <div className="atlas-plan-choice-fields">
        <label>Максимальный перенос, кал. дн.<input aria-label={"Предел переноса "+(i+1)} type="number" min={1} max={workMode?p?.maxDelay??7:7} step={1}
         value={ref.maxDelay} onChange={e=>changeChoice(choice.map((r,j)=>j===i?{...r,maxDelay:e.target.value}:r))}/></label>
        <div className="button-row">
         <button type="button" className="action-button" disabled={i===0} aria-label={"Повысить приоритет "+(i+1)} onClick={()=>move(i,-1)}>↑</button>
         <button type="button" className="action-button" disabled={i===choice.length-1} aria-label={"Понизить приоритет "+(i+1)} onClick={()=>move(i,1)}>↓</button>
         <button type="button" className="action-button" aria-label={(workMode?"Убрать работу ":"Убрать проект ")+(i+1)} onClick={()=>changeChoice(choice.filter((_,j)=>j!==i))}>Убрать</button>
        </div>
       </div>
      </div>;
     })}
     {choice.length<(workMode?model.maxWorks:model.maxProjects)&&available.length>0&&<div className="atlas-plan-choice-fields">
      <label>{workMode?"Работа с доступным резервом":"Допустимый к переносу проект"}<select aria-label={workMode?"Работа для выравнивания":"Проект для выравнивания"} value={selected?.id??""} onChange={e=>setCandidateId(e.target.value)}>
       {available.map((p:any)=><option key={p.id} value={p.id}>{name(p)+(workMode?" · резерв "+p.reserveDays+" дн.":"")}</option>)}
      </select></label>
      <button type="button" className="action-button" disabled={!selected}
       onClick={()=>selected&&changeChoice([...choice,{id:selected.id,projectId:workMode?selected.projectId:selected.id,
        ...(workMode?{workId:selected.workId}:{}),maxDelay:String(workMode?selected.maxDelay:7)}])}>{workMode?"Добавить работу для выравнивания":"Добавить проект для выравнивания"}</button>
     </div>}
     {candidates.some((p:any)=>!p.available)&&<details><summary>{workMode?"Почему часть работ нельзя переносить":"Почему часть проектов нельзя переносить"}</summary>
      {candidates.filter((p:any)=>!p.available).map((p:any)=><p key={p.id}>{name(p)+": "+p.reason}</p>)}
     </details>}
     <button type="button" className="action-button primary" disabled={disabled||!choice.length||choice.some(r=>!candidates.some((p:any)=>p.id===r.id&&p.available&&Number.isSafeInteger(number(r.maxDelay))&&number(r.maxDelay)>=1&&number(r.maxDelay)<=(workMode?p.maxDelay:7)))}
      onClick={calculate}>{workMode?"Рассчитать переносы работ":"Рассчитать выравнивание"}</button>
    </>}
   </>}
   {error&&<p role="alert">{error}</p>}
   {calc&&!result&&<p role="alert">Портфель изменился. Рассчитайте варианты заново.</p>}
   {result&&<>
    <p role="status" tabIndex={-1} ref={resultHeading}>{"Вариантов выравнивания: "+result.options.length+". Проверено комбинаций: "+result.search.evaluated+" из "+result.search.space+"."}</p>
    {!result.search.exact&&<p className="minor">Использован ограниченный поиск. Не гарантируется нахождение всех допустимых решений.</p>}
    <details open={!result.options.length}><summary>Почему варианты ограничены</summary>
     <p className="minor">Причины относятся к проверенным комбинациям и могут пересекаться.</p>
     {[
      ["invalidHorizon","Перенос выходит за допустимые даты проекта"],
      ["calculationUnavailable","Календарный расчёт недоступен"],
      ["noReduction","Выбранный ресурс не получает улучшения"],
      ["fixedMoved","Изменяются даты уже начатых или недоступных проектов"],
      ["lostDates","Теряются известные расчётные даты"],
      ["worseResources","Увеличиваются ограничения хотя бы одного ресурса"],
      ["deadlineCompromise","Допустимо по ресурсам, но ухудшаются известные сроки"],
      ["projectMoved","Изменяются даты проектов"],
      ["fixedWorkMoved","Переносятся уже начатые или завершённые работы"],
      ["stale","Исходные даты или состояние работ не позволяют перенос"],
      ["reserveExceeded","Фактический сдвиг превышает резерв или предел"],
      ["deadlineWorse","Ухудшаются известные сроки работ"]
     ].filter(([key])=>result.search.reasons[key]>0).map(([key,label])=>
      <p key={key}>{label+": "+result.search.reasons[key]}</p>)}
     {!!result.search.fixedProjects?.length&&<p>{"Затронуты фиксированные проекты: "+result.search.fixedProjects.map((p:any)=>p.name).join(", ")}</p>}
     {!!result.search.fixedWorks?.length&&<p>{"Затронуты фиксированные работы: "+result.search.fixedWorks.map((w:any)=>w.title).join(", ")}</p>}
     {result.search.worsenedResources.length>0&&<p>{"Ресурсы, ограничения которых могут усилиться: "+result.search.worsenedResources.map((r:any)=>r.name).join(", ")}</p>}
    </details>
    {!result.options.length?<p>{workMode?"В проверенных комбинациях не найден допустимый перенос в пределах резервов. Можно рассмотреть другие назначения ресурсов или перейти к пересмотру начала проектов.":"В проверенных комбинациях не найдено уменьшения ограничений без роста агрегированной перегрузки других ресурсов и без переноса уже начатых проектов. Уточните пределы или подготовьте другие корректировки в обычных заявках."}</p>:<>
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
      <small>{"Новых конфликтующих работ: "+o.assessment.newlyConflicted+"; освобождено работ: "+o.assessment.clearedConflict}</small>
      {(o.assessment.newlyConflicted>0||o.assessment.newConflictDateWorks>0)&&<p>Часть конфликтов может перейти на другие работы или даты. Сравните полный состав последствий до утверждения.</p>}
      {o.assessment.hasTradeoff&&<small>Есть изменившиеся ограничения, сроки или резервы. Изучите подробности.</small>}
      {o.assessment.resourceState==="INCOMPLETE"&&<small>Ресурсный расчёт неполон.</small>}
      {o.assessment.resourceState==="CONFLICTS"&&<small>Остаются ресурсные ограничения портфеля.</small>}
      {workMode&&<small>Расчётные даты всех проектов и известные сроки работ не ухудшаются.</small>}
      {o.shifts.map((s:any)=><div className="atlas-plan-set-member" key={workMode?JSON.stringify([s.projectId,s.workId]):s.projectId}><div>
       <strong>{(workMode?s.projectName+" / "+s.title:s.name)+" · +"+s.days+" дн."}</strong>
       <small>{"Начало: "+s.beforeStart+" → "+s.afterStart+"; финиш: "+s.beforeFinish+" → "+s.afterFinish}</small>
       {workMode&&<small>{"Начало не ранее: "+s.notBeforeDate+"; резерв: "+s.beforeReserve+" → "+s.afterReserve+" дн."}</small>}
       <small>{"Контрольный срок: "+(s.deadline??"не задан")}</small>
      </div></div>)}
      <details><summary>Последствия для работ и всего портфеля</summary><AmendmentAnalysis compact result={o.preview}/></details>
      <button type="button" className="action-button" disabled={disabled||rationale.trim().length<8}
       aria-label={"Подготовить заявки: "+o.title} onClick={()=>{if(onDraft(result,o.id,rationale)){setExpanded(false);changeChoice([]);setRationale("")}}}>Подготовить заявки</button>
     </div>)}</div>
     <p className="minor">{workMode?"Будут подготовлены обычные неутверждённые заявки на ограничения начала отдельных работ. По одной заявке на проект. Даты проектов, длительности, назначения и контрольные сроки сохраняются.":"Будут подготовлены обычные неутверждённые заявки на перенос начала, без изменения контрольных сроков, длительностей или назначений."} Согласование, применение и сохранение выполняются отдельно.</p>
    </>}
   </>}
  </>}
 </section>;
}

import React,{useMemo,useState} from "react";
import {listPortfolioPlanProposals,comparePortfolioPlanSets,listPortfolioPlanApplications} from "../../src/plan-amendment.mjs";
import {AmendmentAnalysis} from "./PlanAlternativesComparison";

type Ref={projectId:string;changeId:string};
export type PortfolioPlanSelection={first:Ref[];second:Ref[];expanded:boolean};
export const emptyPortfolioPlanSelection=():PortfolioPlanSelection=>({first:[],second:[],expanded:false});
const labels:Record<string,string>={proposed:"Предложено",deferred:"Отложено",approved:"Утверждено",in_progress:"В работе"};
const match=(a:Ref,b:Ref)=>a.projectId===b.projectId&&a.changeId===b.changeId;
function PlanSetPicker({name,choices,selection,onChange,onOpen}:{
 name:string;choices:any[];selection:Ref[];onChange:(refs:Ref[])=>void;onOpen:(projectId:string,changeId:string)=>void}){
 const [projectId,setProjectId]=useState("");
 const [changeId,setChangeId]=useState("");
 const projects=[...new Map(choices.filter(c=>!selection.some(r=>r.projectId===c.projectId)).map(c=>[c.projectId,c.projectName])).entries()];
 const pid=projects.some(([id])=>id===projectId)?projectId:projects[0]?.[0]??"";
 const proposals=choices.filter(c=>c.projectId===pid);
 const selected=proposals.find(c=>c.changeId===changeId)??proposals[0];
 return <div className="atlas-amendment-row atlas-plan-set-picker">
  <strong>{name} · {selection.length} из 4 проектов</strong>
  {selection.map((ref,i)=>{
   const proposal=choices.find(c=>match(c,ref));
   return <div className="atlas-plan-set-member" key={JSON.stringify([ref.projectId,ref.changeId])}>
    <div><strong>{proposal?.projectName??"Проект недоступен"}</strong>
     <small>{proposal?proposal.title+" · "+labels[proposal.status]+" · "+proposal.actionCount+" корректировок":"Заявка больше недоступна"}</small></div>
    <div className="button-row">
     {proposal&&<button type="button" className="action-button" onClick={()=>onOpen(ref.projectId,ref.changeId)}
      aria-label={"Открыть заявку "+name+" "+(i+1)}>К заявке</button>}
     <button type="button" className="action-button" onClick={()=>onChange(selection.filter(x=>!match(x,ref)))}
      aria-label={"Убрать заявку "+name+" "+(i+1)}>Убрать</button>
    </div>
   </div>;
  })}
  {selection.length<4&&projects.length>0&&<div className="atlas-plan-choice-fields">
   <label>Проект<select aria-label={"Проект "+name} value={pid} onChange={e=>{setProjectId(e.target.value);setChangeId("")}}>
    {projects.map(([id,title])=><option key={id} value={id}>{title}</option>)}
   </select></label>
   <label>Заявка<select aria-label={"Заявка "+name} value={selected?.changeId??""} onChange={e=>setChangeId(e.target.value)}>
    {proposals.map(c=><option key={c.changeId} value={c.changeId}>{c.title+" · "+labels[c.status]}</option>)}
   </select></label>
   <button type="button" className="action-button" disabled={!selected}
    aria-label={"Добавить заявку "+name} onClick={()=>selected&&onChange([...selection,{projectId:pid,changeId:selected.changeId}])}>Добавить</button>
  </div>}
  {selection.length>0&&<button type="button" className="text-link" aria-label={"Очистить "+name} onClick={()=>onChange([])}>Очистить состав</button>}
 </div>;
}
export function PortfolioPlanSets({snapshot,onOpen,onApply,selection,onSelection,disabled=false}:{
 snapshot:any;onOpen:(projectId:string,changeId:string)=>void;
 onApply:(comparison:any,optionId:string,rationale:string)=>void;disabled?:boolean;
 selection:PortfolioPlanSelection;onSelection:(selection:PortfolioPlanSelection)=>void}){
 const {expanded,first,second}=selection;
 const [historyLimit,setHistoryLimit]=useState(6);
 const [comparison,setComparison]=useState<{snapshot:any;value:any}|null>(null);
 const [rationale,setRationale]=useState("");
 const [error,setError]=useState("");
 const choices=useMemo(()=>expanded?listPortfolioPlanProposals(snapshot):[],[expanded,snapshot]);
 const history=useMemo(()=>expanded?listPortfolioPlanApplications(snapshot):[],[expanded,snapshot]);
 const result=comparison&&comparison.snapshot===snapshot?comparison.value:null;
 const invalidate=()=>{setComparison(null);setError("")};
 const calculate=()=>{
  try{setError("");setComparison({snapshot,value:comparePortfolioPlanSets(snapshot,first,second.length?second:null)})}
  catch(e){setComparison(null);setError(e instanceof Error?e.message:"Расчёт недоступен")}
 };
 return <section id="atlas-portfolio-plan-sets" tabIndex={-1} className="surface" aria-label="Согласованное планирование портфеля">
  <div className="section-heading"><div><h2>Согласованное планирование</h2>
   <p>Сравните варианты из существующих заявок нескольких проектов. Учитываются сроки и общие ресурсы всего портфеля.</p></div>
   <button type="button" className="action-button" aria-expanded={expanded} onClick={()=>onSelection({...selection,expanded:!expanded})}>
    {expanded?"Скрыть согласованное планирование":"Сравнить планы портфеля"}</button></div>
  {expanded&&<>
   {!choices.length?<p className="minor">Подготовьте хотя бы одну заявку с конкретными корректировками в разделе «Изменения и решения» проекта.</p>:<>
    <p className="minor">В каждом варианте до четырёх разных проектов и по одной заявке на проект. Вариант Б можно оставить пустым для сравнения только с действующим планом. Расчёт не меняет заявки.</p>
    <div className="atlas-plan-comparison-cards">
     <PlanSetPicker name="Вариант А" choices={choices} selection={first} onChange={refs=>{onSelection({...selection,first:refs});invalidate()}} onOpen={onOpen}/>
     <PlanSetPicker name="Вариант Б" choices={choices} selection={second} onChange={refs=>{onSelection({...selection,second:refs});invalidate()}} onOpen={onOpen}/>
    </div>
    <button type="button" className="action-button primary" disabled={disabled||!first.length} onClick={calculate}>Рассчитать планы портфеля</button>
   </>}
   {error&&<p role="alert">{error}</p>}
   {comparison&&!result&&first.length>0&&<p role="alert">Портфель изменился. Рассчитайте варианты заново.</p>}
   {result&&<>
    <p role="status">{"Рассчитано вариантов портфеля: "+result.options.filter((o:any)=>o.valid).length+" из "+result.options.length}</p>
    {result.summary&&<div className="atlas-plan-set-summary">
     <p>{"Единая база сравнения: "+result.summary.comparableProjects+" из "+result.summary.projectCount+
      " проектов имеют исходную контрольную дату и прогноз во всех рассчитанных вариантах."}</p>
     <div className="table-scroll"><table aria-label="Сводное сравнение согласованных планов">
      <thead><tr><th>Показатель</th>{result.summary.columns.map((c:any)=><th key={c.id}>{c.id==="current"?"Текущий":c.id==="A"?"А":"Б"}</th>)}</tr></thead>
      <tbody>{[
       ["late","Просрочено из сопоставимых проектов"],["slip","Сумма дней отставания по прежним срокам"],
       ["unknownProjects","Проектов без прогноза"],["changedDeadline","Изменено сроков проектов"],
       ["overloadDays","Перегрузка, ресурс-дн."],["unavailableDays","Вне доступности, ресурс-дн."],
       ["overloadDepth","Превышение мощности, п. п.·дн."],["conflictWorks","Работ с конфликтами ресурсов"],
       ["newConflicts","Новых конфликтующих работ"],["newConflictDates","Работ с новыми датами конфликта"],
       ["newConflictWorkDays","Добавлено конфликтных дней работ"],["clearedConflictWorkDays","Устранено конфликтных дней работ"],["unlinked","Работ с длительностью без ресурса"],["undated","Работ без дат"]
      ].map(([key,label])=><tr key={key}><td>{label}</td>{result.summary.columns.map((c:any)=><td key={c.id}>
       {(key==="late"||key==="slip")&&!result.summary.comparableProjects?"Нет данных":c[key]}</td>)}</tr>)}</tbody>
     </table></div>
     <small className="minor">Календарное сравнение использует контрольные сроки, действующие до расчёта. Ресурсные показатели относятся ко всему портфелю, даже если сроки известны не для всех проектов.</small>
    </div>}
    {result.options.some((o:any)=>o.canApply)&&<label className="atlas-recovery-reason">Обоснование совместного применения
     <textarea aria-label="Обоснование согласованного плана" rows={2} maxLength={2000} value={rationale} onChange={e=>setRationale(e.target.value)}/>
    </label>}
    <div className="atlas-plan-comparison-cards">{result.options.map((o:any)=>{
     const name=o.id==="A"?"Вариант А":"Вариант Б",p=o.assessment;
     return <div className="atlas-amendment-row" key={o.id}>
      <strong>{name}</strong>
      {!o.valid?<p role="alert">{o.reason}</p>:<>
       <small>{"Выбрано проектов: "+p.selectedProjects+"; с зависимыми: "+p.calendarChainProjects}</small>
       <small>{"Просрочено по исходным контрольным срокам: "+p.deadlines.lateBefore+" → "+p.deadlines.lateAfter+" проектов"}</small>
       <small>{"Сумма дней отставания по сопоставимым исходным срокам ("+p.deadlines.comparable+"): "+p.deadlines.comparableSlipBefore+" → "+p.deadlines.comparableSlipAfter}</small>
       <small>{"Выбранные проекты: просрочено "+p.selectedDeadlines.lateBefore+" → "+p.selectedDeadlines.lateAfter+
        "; остальные: "+p.otherDeadlines.lateBefore+" → "+p.otherDeadlines.lateAfter}</small>
       <small>{"Сопоставимые исходные сроки: "+p.deadlines.knownBefore+" → "+p.deadlines.knownAfter+
        "; без исходного срока: "+p.deadlines.missingDeadline+"; неизвестен прогноз: "+p.deadlines.unknownAfter}</small>
       {p.deadlines.changedDeadline>0&&<small>Контрольные сроки изменены; оценка выше сохраняет сроки, действовавшие до расчёта.</small>}
       <small>{"Сроки работ: просрочено "+p.workDeadlines.lateBefore+" → "+p.workDeadlines.lateAfter+
        "; по сопоставимым датам дней отставания "+p.workDeadlines.comparableSlipBefore+" → "+p.workDeadlines.comparableSlipAfter}</small>
       <small>{"Работ с конфликтами ресурсов: "+p.conflictedWorkBefore+" → "+p.conflictedWorkAfter}</small>
       <small>{"Новые конфликтующие работы: "+p.newlyConflicted+"; освобождены: "+p.clearedConflict}</small>
       {(p.newConflictWorkDays>0||p.clearedConflictWorkDays>0||p.changedConflictKindWorks>0)&&
        <small>{"Новые даты конфликта у ранее конфликтующих работ: "+p.newConflictDateWorks+
         "; добавлено дней работ: "+p.newConflictWorkDays+"; устранено: "+p.clearedConflictWorkDays+
         "; изменился вид ограничения у работ: "+p.changedConflictKindWorks}</small>}
       <small>{"Работ без привязки ресурса: "+p.missingResourceWork+"; без расчётных дат: "+p.unknownResourceWork}</small>
       {p.outsideChain.length>0&&<details><summary>{"Изменения ресурсной ситуации вне цепочек: "+p.outsideChain.length+" проектов"}</summary>
        {p.outsideChain.map((id:string)=>{
         const row=o.preview.rows.find((r:any)=>r.id===id),scope=o.preview.resourceScope;
         const before=scope.before.projects.find((r:any)=>r.id===id),after=scope.after.projects.find((r:any)=>r.id===id);
         const changes=scope.workChanges.projects.find((r:any)=>r.id===id);
         return <small key={id}>{row?.name+": конфликтующих работ "+before?.conflictedWork+" → "+after?.conflictedWork+
          "; новых "+changes?.newlyConflicted+"; освобождены "+changes?.cleared+
          "; добавлено конфликтных дней работ "+changes?.newConflictDays}</small>;
        })}
       </details>}
       <small>{p.hasTradeoff?"Есть ухудшения или пересмотр контрольных сроков. Изучите последствия.":
        "Новых ухудшений по проверяемым показателям не обнаружено."}</small>
       {p.resourceState==="CONFLICTS"&&<small>Остаются ресурсные ограничения.</small>}
       {p.resourceState==="INCOMPLETE"&&<small>Ресурсный расчёт неполон.</small>}
       <details><summary>Последствия для всего портфеля</summary><AmendmentAnalysis compact result={o.preview}/></details>
      </>}
      {o.members.map((member:any)=><div className="atlas-plan-set-member" key={member.projectId}>
       <div><strong>{member.projectName}</strong><small>{member.title+" · "+(labels[member.status]??"Недоступно")}</small>
        {!member.valid&&<small>{member.reason}</small>}</div>
       {member.status&&<button type="button" className="action-button" onClick={()=>onOpen(member.projectId,member.changeId)}
        aria-label={"Открыть "+name+": "+member.projectName}>К заявке</button>}
      </div>)}
      {o.valid&&(o.canApply?<button type="button" className="action-button" disabled={disabled||rationale.trim().length<8}
       onClick={()=>onApply(result,o.id,rationale)} aria-label={"Применить согласованный "+name}>Применить согласованный план</button>:
       <p className="minor">{o.members.length<2?"Одну заявку применяйте в её проекте.":"Для совместного применения сначала отдельно утвердите все заявки."}</p>)}
     </div>;
    })}</div>
    <p className="minor">Применение всех утверждённых корректировок создаёт одну новую редакцию черновика. После подтверждения сохраните её обычным способом. Расчёт не подтверждает фактическое исполнение или доступность.</p>
   </>}
   {history.length>0&&<details className="atlas-coordination-history"><summary>{"История совместных применений ("+history.length+")"}</summary>
    {history.slice(0,historyLimit).map((h:any)=><div className="atlas-amendment-row" key={h.id}>
     <strong>{"Совместное применение · "+h.at}</strong>
     <small>{"Исходная редакция портфеля: "+h.sourceRevision+"; записей доступно: "+h.recordedCount+" из "+h.members.length}</small>
     <p>{h.text}</p>
     {h.members.map((member:any)=><div className="atlas-plan-set-member" key={member.projectId}>
      <div><strong>{member.projectName}</strong><small>{member.changeTitle}</small></div>
      {member.available?<button type="button" className="action-button" aria-label={"Открыть применённую заявку "+member.projectName}
       onClick={()=>onOpen(member.projectId,member.changeId)}>К заявке</button>:<small>Историческая ссылка</small>}
     </div>)}
    </div>)}
    {history.length>historyLimit&&<button type="button" className="action-button" onClick={()=>setHistoryLimit(n=>n+6)}>Ещё совместные применения</button>}
   </details>}
  </>}
 </section>;
}

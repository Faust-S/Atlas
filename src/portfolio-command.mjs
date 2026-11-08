// Read-only portfolio command view. Existing Atlas projections remain the source of truth.
// Nothing here may approve work, mutate dates, or infer verified release readiness.
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {portfolioCascade} from "./portfolio-cascade.mjs";
import {projectImpact} from "./impact.mjs";
import {responseState} from "./response.mjs";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const filterKinds = new Set(["all","blocked","dates","evidence","decisions","sources"]);
const priority = {blocked:5,dates:4,evidence:3,decisions:2,sources:2,planning:1};
const labels = {blocked:"Блокировки",dates:"Сроки",evidence:"Факты",decisions:"Решения",sources:"Источники",planning:"План"};

const actionFor = (projectId,kind,ref="") =>
 "inspect:"+encodeURIComponent(projectId)+":"+kind+(ref?":"+encodeURIComponent(ref):"");

/** @param {any} snapshot
 * @param {{now?:string, impacts?:Map<string, any>|null, schedules?:any}} [options]
 */
export function buildPortfolioCommand(snapshot,{now=new Date().toISOString(),impacts:cachedImpacts=null,schedules:cachedSchedules=null}={}) {
 const projects=snapshot.projects||[];
 // Standalone callers derive their own data; React desktop reuses the exact
 // snapshot-bound projections already calculated for its existing portfolio.
 const impacts=cachedImpacts??new Map(projects.map(p=>[p.id,projectImpact(p,{now})]));
 const cascade=portfolioCascade(snapshot,p=>impacts.get(p.id));
 const schedules=cachedSchedules??portfolioSchedule(snapshot);
 const rows=projects.map(project=>{
  const impact=impacts.get(project.id),response=responseState(project,impact);
  const chain=cascade.byId.get(project.id),schedule=schedules.byId.get(project.id);
  const signals=[];
  const add=(kind,label,detail,panel,ref="",value=0)=>{
   if(!label)return;
   signals.push({kind,label,detail,panel,ref,priority:priority[kind]+value});
  };
  // Use precisely the existing cause ledger to drill into the human decision path.
  for(const cause of response.rows.filter(r=>r.level==="blocked").slice(0,2))
   add("blocked",cause.title,cause.detail,"response",cause.key,1);
  if(chain.inherited.some(x=>x.kind==="blocked")){
   const inherited=chain.inherited.find(x=>x.kind==="blocked");
   const origin=cascade.byId.get(inherited.originId);
   add("blocked","Возможное влияние блокировки: "+(origin?.name||"предшественник"),
    "Цепочка: "+inherited.path.map(id=>cascade.byId.get(id)?.name||id).join(" → "),"relations");
  }
  if(schedule.deadlineSlipDays>0)
   add("dates","Риск нарушения контрольного срока: +"+schedule.deadlineSlipDays+" дн.",
    "Расчёт: "+(schedule.projectedFinish||"—")+" при дедлайне "+(schedule.deadline||"—"),"schedule", "",1);
  if(schedule.shiftDays>0 && schedule.deadlineSlipDays===0)
   add("dates","Пересмотр начала: +"+schedule.shiftDays+" дн.",
    "Причина — срок предшествующих проектов","schedule");
  if(schedule.projectedFinish===null)
   add("planning","Нет надёжной расчётной даты завершения",
    schedule.notes.join("; "),"schedule");
  for(const result of impact.rows.filter(r=>r.intent==="committed" && r.priority).slice(0,2))
   add("evidence","Требует внимания: "+result.title,result.reasons.join("; ")||"Нужна сверка результата",
    "evidence",result.targetId);
  if(impact.rows.filter(r=>r.intent==="committed" && r.priority).length>2)
   add("evidence","Другие требования требуют внимания: "+(impact.attention-2),
    "Откройте матрицу требований и свидетельств","evidence");
  if(response.proposed>0)
   add("decisions","Предложения ожидают решения: "+response.proposed,
    "Утверждение требует явного решения и обоснования","response");
  if(response.approvedWithoutWork>0)
   add("decisions","Утверждено без связанных работ: "+response.approvedWithoutWork,
    "Создайте работу по принятому изменению","response");
  if(response.unplanned>0 && !signals.some(s=>s.kind==="blocked"&&s.panel==="response"))
   add("planning","Причины без активного плана: "+response.unplanned,
    "Предложения не создаются автоматически","response");
  const sourceSignals=response.rows.filter(r=>r.key.startsWith("source-issue:"));
  if(sourceSignals.length>0)
   add("sources","Проблемы наблюдения: "+sourceSignals.length,
    "Сведения из недоступного, неполного или ещё не проверенного источника не считаются актуальными","sources");
  if(signals.length===0)
   add("planning","Новых сигналов не обнаружено",
    "Отсутствие сигналов не является подтверждением готовности","project");
  signals.sort((a,b)=>b.priority-a.priority||a.label.localeCompare(b.label,"ru"));
  const primary=signals[0];
  const required=impact.rows.filter(r=>r.intent==="committed").length;
  return {
   id:project.id,name:project.name,type:project.type,status:project.status,
   required,attention:impact.attention,proposed:response.proposed,
   affected:chain.downstreamAll.length,deadline:schedule.deadline,
   projectedFinish:schedule.projectedFinish,slip:schedule.deadlineSlipDays,
   signals,primary,rank:primary.priority,
   filterTags:new Set(signals.map(s=>s.kind)),
   search:[project.name,project.goal||"",...signals.map(s=>s.label)].join(" ").toLocaleLowerCase("ru")
  };
 });
 rows.sort((a,b)=>b.rank-a.rank||b.affected-a.affected||a.name.localeCompare(b.name,"ru"));
 return {rows,totals:{
  projects:rows.length,
  blocked:rows.filter(r=>r.filterTags.has("blocked")).length,
  dates:rows.filter(r=>r.filterTags.has("dates")&&r.slip>0).length,
  evidence:rows.reduce((n,r)=>n+r.attention,0),
  decisions:rows.reduce((n,r)=>n+r.proposed,0),
  unknownDates:schedules.totals.unknown
 },warning:"Это очередь рассмотрения по наблюдаемым сведениям и расчётам; она не подтверждает готовность продуктов"};
}

export function filterPortfolioCommand(model,{filter="all",search=""}={}) {
 if(!filterKinds.has(filter))throw Error("Invalid portfolio command filter");
 const q=String(search).trim().toLocaleLowerCase("ru");
 return model.rows.filter(row=>(filter==="all"||row.filterTags.has(filter))&&(!q||row.search.includes(q)));
}

function inspect(projectId,signal){
 return actionFor(projectId,signal.panel,signal.ref);
}
export function renderPortfolioCommandRows(model,{filter="all",search="",escape=escapeHtml}={}) {
 const found=filterPortfolioCommand(model,{filter,search});
 if(!found.length)return '<p class="muted">Нет проектов по выбранному фильтру. Измените фильтр или поиск.</p>';
 return '<div class="atlas-command-list">'+found.map(row=>{
  const main=row.primary;
  const reasons=row.signals.slice(1,6).map(reason=>
    '<li><button data-action="'+escape(inspect(row.id,reason))+'" class="atlas-plain-button">'+
    '<span class="atlas-command-kind">'+escape(labels[reason.kind]||reason.kind)+'</span> '+escape(reason.label)+'</button>'+
    (reason.detail?'<small>'+escape(reason.detail)+'</small>':'')+'</li>').join("");
  const flags=[
   row.attention?row.attention+" требований к проверке":null,
   row.affected?row.affected+" зависимых проектов":null,
   row.proposed?row.proposed+" решений ожидается":null
  ].filter(Boolean).join(" · ");
  return '<article class="atlas-command-row"><div class="atlas-command-project">'+
   '<strong>'+escape(row.name)+'</strong><small>'+escape(row.type||"project")+' · '+escape(row.status)+'</small>'+
   '<small>'+escape(flags||"Заявленный статус не равен приёмке")+'</small></div>'+
   '<div class="atlas-command-evidence"><strong>'+escape(main.label)+'</strong>'+
   (main.detail?'<p class="muted">'+escape(main.detail)+'</p>':'')+
   (row.signals.length>1?'<details><summary>Другие сигналы ('+(row.signals.length-1)+')</summary><ul>'+reasons.slice(0)+'</ul></details>':'')+'</div>'+
   '<div class="atlas-command-deadline"><span>Расчётный финиш</span><strong>'+escape(row.projectedFinish||"Неизвестен")+'</strong>'+
   '<small>Дедлайн: '+escape(row.deadline||"не указан")+'</small>'+
   (row.slip>0?'<small class="atlas-command-risk">Риск +'+row.slip+' дн.</small>':'')+'</div>'+
   '<div class="atlas-command-actions"><button class="primary" data-action="'+escape(inspect(row.id,main))+'">Разобрать</button>'+
   '<button data-action="open:'+escape(row.id)+'">Проект</button></div></article>';
 }).join("")+'</div>'+
 (found.length<model.rows.length?'<p class="muted">Показано '+found.length+' из '+model.rows.length+' проектов.</p>':'');
}
export function renderPortfolioCommand(model,{filter="all",search="",escape=escapeHtml}={}) {
 const t=model.totals,options=[["all","Все"],["blocked","Блокировки"],["dates","Сроки"],["evidence","Факты"],["decisions","Решения"],["sources","Источники"]];
 return '<section id="atlas-command" class="card atlas-command"><div class="row"><h2>Что требует внимания</h2>'+
  '<span class="tag">Единая картина портфеля</span></div>'+
  '<p class="muted">От риска к причине, плану и действиям. Отдельно показаны расчётные сроки и заявления о фактах; автоматической приёмки нет.</p>'+
  '<div class="atlas-kpis"><div><small>Потенциально затронуты блокировкой</small><strong>'+t.blocked+'</strong></div>'+
  '<div><small>Риск дедлайна</small><strong>'+t.dates+'</strong></div>'+
  '<div><small>Требования к проверке</small><strong>'+t.evidence+'</strong></div>'+
  '<div><small>Ожидают решения</small><strong>'+t.decisions+'</strong></div></div>'+
  '<div class="row atlas-command-controls"><label for="atlas-command-filter">Причина</label><select id="atlas-command-filter">'+
  options.map(([value,title])=>'<option value="'+value+'"'+(value===filter?' selected':'')+'>'+title+'</option>').join("")+'</select>'+
  '<label for="atlas-command-search">Поиск</label><input id="atlas-command-search" type="search" placeholder="Название проекта или проблема" value="'+escape(search)+'"></div>'+
  '<div id="atlas-command-rows" aria-live="polite">'+renderPortfolioCommandRows(model,{filter,search,escape})+'</div>'+
  '</section>';
}

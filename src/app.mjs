import {empty,validate,createProject,editProject,createStage,createItem,editItem,connect,createRisk,createDecision,attach,observe,summary,serialize,deserialize} from "./core.mjs";
import {observePublicRepo} from "./github-public.mjs";
import {scheduleProject} from "./planning.mjs";
import {addTarget,recordFinding,planChange,updateChange,compareProject} from "./trace.mjs";
import {renderPortfolioInsight,statusBand,filterTraceRows} from "./visual.mjs";
import {editorSpec,renderEditor,applyEditor} from "./editor.mjs";
import {renderDependencyGraph,renderTimeline} from "./graph.mjs";
const key="iwxa-atlas-public/1",root=document.querySelector("#app"),msg=document.querySelector("#message"),esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let data;try{data=deserialize(localStorage.getItem(key)||JSON.stringify(empty()))}catch{data=empty()}let active=null,traceMode="all",editorAction=null,graphMode="all";
function save(next){localStorage.setItem(key,serialize(next));data=next;render()}async function safe(fn){try{await fn();msg.textContent=""}catch(e){msg.textContent=e.message}}

const button=(label,action,css="")=>'<button data-action="'+action+'" class="'+css+'">'+label+'</button>';
function render(){const p=data.projects.find(x=>x.id===active),stateCounts={active:data.projects.filter(x=>x.status==="active").length,blocked:data.projects.reduce((n,p)=>n+summary(p).blocked,0)};
root.innerHTML='<div id="atlas-editor-slot"></div>'+(p?projectView(p):'<h2>Портфель проектов</h2><p class="muted">Проекты человека и организации. Связи с внешними системами не дублируют их данные.</p><div class="grid"><div class="card"><small>Всего проектов</small><div class="metric">'+data.projects.length+'</div></div><div class="card"><small>Активные</small><div class="metric">'+stateCounts.active+'</div></div><div class="card"><small>Заблокированные работы</small><div class="metric">'+stateCounts.blocked+'</div></div></div><div class="row">'+button("＋ Создать проект","new","primary")+'</div>'+renderPortfolioInsight(data.projects,esc)+'<div class="grid">'+data.projects.map(p=>'<article class="card"><span class="tag">'+esc(p.type)+'</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.goal||"Без описания цели")+'</p><p class="muted">'+summary(p).total+' работ · '+p.sources.length+' источников</p><p class="muted">Требований: '+compareProject(p).committed+' · Без подтверждений: '+compareProject(p).counts.unknown+' · Несоответствия: '+(compareProject(p).counts.gap_reported+compareProject(p).counts.partial_reported)+' · Устарело / конфликтует: '+(compareProject(p).counts.stale+compareProject(p).counts.conflict)+'</p>'+button("Открыть","open:"+esc(p.id))+'</article>').join("")+'</div>');if(p){renderSchedule(p);renderTrace(p);renderGraph(p);}renderActiveEditor(p);}
function renderSchedule(p){
 const target=document.querySelector("#atlas-schedule");if(!target||!p)return;
 const plan=scheduleProject(p);
 const rows=plan.rows.map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+x.durationDays+'</td><td>'+esc(x.startDate||"день "+x.earlyStart)+'</td><td>'+esc(x.finishDate||"день "+x.earlyFinish)+'</td><td>'+x.floatDays+'</td><td>'+(x.critical?"●":"—")+'</td></tr>').join("");
 target.innerHTML='<div class="card"><p><strong>Длительность:</strong> '+plan.durationDays+' календарных дней · <strong>Начало:</strong> '+esc(p.startDate||"не задано")+' · <strong>Финиш:</strong> '+esc(plan.estimatedFinish||"—")+'</p><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Работа</th><th>Дни</th><th>Начало</th><th>Финиш</th><th>Резерв</th><th>Критическая</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted">Календарный CPM без ресурсного выравнивания. Не означает принятие результата или релиза.</p></div>';
}
function renderGraph(p){const mount=document.querySelector("#atlas-relations");if(!mount)return;mount.innerHTML='<section class="card"><h2>Граф связей</h2><p class="muted">Стрелка: предшественник → зависимая работа. Выберите работу на доске, чтобы изменить её параметры.</p><div class="row"><label for="atlas-graph-mode">Отображать</label><select id="atlas-graph-mode"><option value="all"'+(graphMode==="all"?" selected":"")+'>Все</option><option value="critical"'+(graphMode==="critical"?" selected":"")+'>Критический путь</option><option value="blocked"'+(graphMode==="blocked"?" selected":"")+'>Заблокированные</option></select></div>'+renderDependencyGraph(p,{mode:graphMode})+'<h3>Временная шкала</h3>'+renderTimeline(p)+'</section>'}
function renderActiveEditor(p){const mount=document.querySelector("#atlas-editor-slot");if(mount)mount.innerHTML=editorAction?renderEditor(editorSpec(p,editorAction),esc):"";}
function renderTrace(p){
 const mount=document.querySelector("#atlas-trace");if(!mount)return;
 const view=compareProject(p),titles={unknown:"Нет подтверждений",conflict:"Противоречия",stale:"Данные требуют сверки",gap_reported:"Сообщено об отсутствии",partial_reported:"Реализовано частично (заявлено)",implemented_claim:"Реализовано (заявлено)",test_claim:"Проверено (заявлено)",acceptance_claim:"Принято (заявлено)"};
 const labels=Object.entries(view.counts).filter(([,v])=>v>0).map(([k,v])=>'<span class="tag">'+esc(titles[k]||k)+': '+v+'</span>').join(" ");
 const rows=filterTraceRows(view.rows,traceMode).map(x=>'<tr><td>'+esc(x.title)+'<div class="muted">'+esc(x.desired)+'</div></td><td>'+esc(x.intent==="candidate"?"Предложено":"Обязательно")+'</td><td>'+esc(titles[x.assessment]||x.assessment)+'</td><td>'+esc(x.latest?.reference||x.latest?.sourceId||"Не указан")+'</td><td>'+esc(x.latest?.revision||"—")+'</td><td>'+esc(x.latest?.observedAt||"—")+'</td></tr>').join("");
 const proposed=(p.changes||[]).map(c=>'<div class="item"><strong>'+esc(c.title)+'</strong><span class="tag">'+esc(c.status)+'</span> '+button("Изменить статус","change:"+esc(c.id))+'<p class="muted">'+esc(c.description||"")+'</p></div>').join("");
 mount.innerHTML='<section class="card"><h2>Что должно быть / что есть / что изменим</h2><p class="muted">Ниже перечислены требования, утверждения с происхождением и запросы изменений. Эти записи не заменяют независимую квалификацию результата.</p><div class="row">'+button("＋ Требование","target")+button("＋ Факт","finding")+button("＋ Изменение","proposal")+'</div><p>'+labels+'</p>'+statusBand(view.counts,esc)+'<div class="row"><label for="trace-filter">Показать:</label><select id="trace-filter"><option value="all"'+(traceMode==="all"?" selected":"")+'>Все требования</option><option value="needs_attention"'+(traceMode==="needs_attention"?" selected":"")+'>Есть вопросы</option><option value="unconfirmed"'+(traceMode==="unconfirmed"?" selected":"")+'>Нет подтверждений / устарело</option><option value="reported"'+(traceMode==="reported"?" selected":"")+'>Заявлена реализация или проверка</option><option value="candidate"'+(traceMode==="candidate"?" selected":"")+'>Предлагаемые возможности</option></select></div><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Ожидается</th><th>Статус плана</th><th>Фактически</th><th>Источник</th><th>Версия</th><th>Дата</th></tr></thead><tbody>'+rows+'</tbody></table></div><h3>Изменения и предложения</h3>'+proposed+'</section>';
}
function projectView(p){const s=summary(p), cols=[["todo","Запланировано"],["in_progress","В работе"],["blocked","Блокировано"],["done","Готово"]];
return '<div class="row">'+button("← Все проекты","back")+'<span class="tag">'+esc(p.status)+'</span>'+button("Изменить статус","status")+'</div><h1>'+esc(p.name)+'</h1><p class="muted">'+esc(p.goal)+'</p><div class="grid"><div class="card"><small>Выполнено работ</small><div class="metric">'+(s.progress===null?"—":s.progress+"%")+'</div><small>Не является подтверждением готовности релиза</small></div><div class="card"><small>Блокеры</small><div class="metric">'+s.blocked+'</div></div><div class="card"><small>Связанных источников</small><div class="metric">'+s.sourceCount+'</div></div></div><div class="row">'+button("＋ Этап","stage")+button("＋ Работа","item","primary")+button("＋ Зависимость","dep")+button("Дата старта","start")+button("＋ Риск","risk")+button("＋ Решение","decision")+'</div><section class="card"><h2>Этапы</h2>'+p.stages.map(x=>'<p>◈ '+esc(x.name)+' <small>('+p.items.filter(y=>y.stageId===x.id).length+' работ)</small></p>').join("")+'</section><h2>План-график</h2><div id="atlas-schedule"></div><div id="atlas-relations"></div><div id="atlas-trace"></div><h2>Работы</h2><div class="board">'+cols.map(([st,title])=>'<section class="column"><strong>'+title+'</strong>'+p.items.filter(x=>x.state===st).map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><small>'+esc(x.assignee||"Не назначено")+'</small><div class="row">'+button("Редактировать · "+(x.estimateDays??1)+" дн.","work:"+esc(x.id))+'</div><select data-work="'+esc(x.id)+'">'+cols.map(([v,t])=>'<option value="'+v+'" '+(x.state===v?"selected":"")+'>'+t+'</option>').join("")+'</select></div>').join("")+'</section>').join("")+'</div><section class="card"><h2>Зависимости</h2>'+p.dependencies.map(x=>'<p>'+esc(p.items.find(t=>t.id===x.from)?.title)+' → '+esc(p.items.find(t=>t.id===x.to)?.title)+'</p>').join("")+'</section><section class="card"><h2>Риски и решения</h2>'+p.risks.map(r=>'<p>⚠ '+esc(r.title)+'</p>').join("")+p.decisions.map(d=>'<p>✓ '+esc(d.text)+'</p>').join("")+'</section><section class="card"><div class="row"><h2>Источники</h2>'+button("＋ Источник","source")+'</div><p class="muted">Автоматический вход в приватные аккаунты пока отсутствует. Публичные репозитории GitHub можно сверять вручную.</p>'+p.sources.map(x=>'<p><strong>'+esc(x.kind)+'</strong> '+esc(x.locator)+' <small>'+esc(x.status)+(x.observedAt?" · "+esc(x.observedAt):"")+'</small> '+(x.kind==="github"?button("Сверить","sync:"+esc(x.id)):"")+(x.summary?'<p class="muted">Ветки: '+esc((x.summary.branches||[]).join(", "))+' · Готовность не оценивалась</p>':"")+'</p>').join("")+'</section>';
}
root.addEventListener("click",event=>{
 const b=event.target.closest("[data-action]");if(!b)return;
 const action=b.dataset.action;
 safe(async()=>{
  if(action==="cancel-editor"){editorAction=null;render();return}
  if(action==="back"){active=null;editorAction=null;render();return}
  if(action.startsWith("open:")){active=action.slice(5);editorAction=null;traceMode="all";graphMode="all";render();return}
  const p=data.projects.find(x=>x.id===active);
  if(action.startsWith("sync:")){
   if(!p)return;
   const source=p.sources.find(x=>x.id===action.slice(5));
   if(!source||source.kind!=="github")return;
   try{const observation=await observePublicRepo(source.locator);save(observe(data,p.id,source.id,"ok",observation))}
   catch(e){save(observe(data,p.id,source.id,"error",null,e.message));throw e}
   return;
  }
  editorAction=action;editorSpec(p,action);render();
 });
});
root.addEventListener("submit",event=>{
 if(event.target.id!=="atlas-editor-form")return;
 event.preventDefault();
 safe(async()=>{
  if(!editorAction)return;
  const values=new FormData(event.target);
  const result=applyEditor(data,active,editorAction,values);
  if(result.projectId)active=result.projectId;
  editorAction=null;
  save(result.state);
 });
});
root.addEventListener("change",e=>{
 if(e.target.id==="trace-filter"){traceMode=e.target.value;render();return}
 if(e.target.id==="atlas-graph-mode"){graphMode=e.target.value;render();return}
 const id=e.target.dataset.work;if(!id)return;
 safe(()=>save(editItem(data,active,id,{state:e.target.value})));
});
document.querySelector("#export").onclick=()=>{const u=URL.createObjectURL(new Blob([serialize(data)],{type:"application/json"}));const a=document.createElement("a");a.href=u;a.download="atlas-backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)};
document.querySelector("#import").onclick=()=>document.querySelector("#file").click();
document.querySelector("#file").onchange=async e=>{const file=e.target.files?.[0];if(!file)return;safe(async()=>{if(file.size>5000000)throw Error("Import limit 5 MB");const s=deserialize(await file.text());if(confirm("Заменить текущие проекты загруженным архивом?")){save(s);active=null;render()}});e.target.value=""};
render();

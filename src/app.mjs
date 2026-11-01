import {empty,validate,createProject,editProject,createStage,createItem,editItem,connect,createRisk,createDecision,attach,observe,summary,serialize,deserialize} from "./core.mjs";
import {observePublicRepo,observePublicOwner} from "./github-public.mjs";
import {applySourceObservation,attachDiscoveredRepo} from "./source-observation.mjs";
import {scheduleProject} from "./planning.mjs";
import {addTarget,recordFinding,planChange,updateChange,compareProject} from "./trace.mjs";
import {renderPortfolioInsight,statusBand,filterTraceRows} from "./visual.mjs";
import {editorSpec,renderEditor,applyEditor} from "./editor.mjs";
import {renderDependencyGraph,renderTimeline} from "./graph.mjs";
import {createStandaloneStore} from "./storage.mjs";
import {projectImpact,portfolioImpact} from "./impact.mjs";
import {renderPortfolioNetwork,renderProjectRelations,removePortfolioLink} from "./portfolio.mjs";
import {renderPortfolioCascade,renderProjectCascade} from "./portfolio-cascade.mjs";
import {renderProjectResponses,renderPortfolioResponses} from "./response.mjs";
import {renderPortfolioSchedule,renderProjectSchedule} from "./portfolio-schedule.mjs";
import {buildPortfolioCommand,renderPortfolioCommand,renderPortfolioCommandRows} from "./portfolio-command.mjs";
const root=document.querySelector("#app"),msg=document.querySelector("#message"),storageMount=document.querySelector("#storage-status");
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const store=createStandaloneStore();
let data=empty(),active=null,traceMode="all",editorAction=null,graphMode="all",cascadeMode="attention",portfolioView="focus",commandFilter="all",commandSearch="";
let ready=false,storageStatus="loading",storageWarning="",storageError=null,busy=false;
async function save(next){await store.save(next);data=next;storageStatus="ready";storageWarning="";render()}
async function safe(fn){
 if(busy)return;
 busy=true;
 try{await fn();msg.textContent=""}
 catch(e){msg.textContent=e instanceof Error?e.message:String(e)}
 finally{busy=false}
}
function storageBanner(){
 if(!ready){
  return '<div class="atlas-storage-warning"><strong>Хранилище не открыто.</strong> '+esc(storageError?.message||"Загрузка IndexedDB…")+' <span>Импорт исправной копии возможен после восстановления доступа к хранилищу.</span></div>';
 }
 if(storageStatus==="recovery"){
  return '<div class="atlas-storage-warning"><strong>Требуется восстановление:</strong> '+esc(storageWarning)+' '+button("Восстановить предыдущую версию","restore-storage","primary")+'</div>';
 }
 if(storageStatus==="migrated")return '<p class="atlas-storage-notice">'+esc(storageWarning)+'</p>';
 return '<p class="atlas-storage-notice">Локальные данные: IndexedDB · контроль целостности SHA-256 · резервная версия. Хранение не зашифровано — не вводите конфиденциальные записи.</p>';
}
async function boot(){
 try{
  const result=await store.load();
  data=result.state;storageStatus=result.status;storageWarning=result.warning||"";ready=true;storageError=null;
 }catch(e){storageError=e;storageStatus="unavailable"}
 render();
 if(ready)queueMicrotask(()=>refreshDueSources());
}
const SOURCE_REFRESH_MS=15*60*1000;
let autoRefreshing=false;
async function refreshSource(projectId,sourceId){
 const p=data.projects.find(x=>x.id===projectId),src=p?.sources.find(s=>s.id===sourceId);
 if(!src||!["github","github_owner"].includes(src.kind))return;
 let observation;
 try{
  observation=src.kind==="github_owner"?
   await observePublicOwner(src.locator):await observePublicRepo(src.locator);
 }catch(e){
  // Preserve cached objects and provenance on source or transport errors.
  await save(observe(data,projectId,sourceId,"error",null,e.message));
  throw e;
 }
 const result=applySourceObservation(data,projectId,sourceId,observation);
 await save(result.state);
}
async function refreshDueSources(){
 if(!ready||storageStatus==="recovery"||autoRefreshing||busy||document.visibilityState==="hidden")return;
 autoRefreshing=true;
 try{
  const due=data.projects.flatMap(p=>p.sources.filter(s=>["github","github_owner"].includes(s.kind)&&
   (!s.observedAt||Date.now()-Date.parse(s.observedAt)>=SOURCE_REFRESH_MS)).map(s=>[p.id,s.id]));
  // Cap automatic work; next timer/focus reconciles remaining bindings.
  for(const [pid,sid] of due.slice(0,3)){
   try{await refreshSource(pid,sid)}catch(e){msg.textContent="Источник недоступен: "+e.message}
  }
 }finally{autoRefreshing=false}
}
function sourceCard(source){
 const repo=source.kind==="github",owner=source.kind==="github_owner",summary=source.summary;
 let content='<div class="item"><div class="row"><strong>'+esc(source.kind)+'</strong><span>'+esc(source.locator)+'</span><span class="tag">'+esc(source.status)+'</span>';
 if(repo||owner)content+=button("Сверить сейчас","sync:"+esc(source.id));
 content+='</div><small>Последнее наблюдение: '+esc(source.observedAt||"ещё не выполнялось")+'</small>';
 if(source.error)content+='<p class="atlas-source-error">Ошибка: '+esc(source.error)+' · сохранённый снимок может устареть</p>';
 if(summary){
  content+='<p class="muted">Полнота: '+(summary.complete?"подтверждена":"неполная — удаления не устанавливаются")+' · происхождение: публичный GitHub REST · готовность не оценивалась</p>';
  const changes=summary.changes;
  if(changes?.comparable){
   content+='<p class="muted">Изменения: добавлено '+changes.added.length+', удалено '+changes.removed.length+', обновлено '+changes.changed.length+', переименовано '+changes.renamed.length+'</p>';
   if(changes.added.length)content+='<p class="muted">Новые: '+esc(changes.added.join(", "))+'</p>';
   if(changes.removed.length)content+='<p class="atlas-source-error">Больше не обнаружено: '+esc(changes.removed.join(", "))+'</p>';
   if(changes.renamed.length)content+='<p class="muted">Переименовано: '+esc(changes.renamed.map(x=>x.from+" → "+x.to).join(", "))+'</p>';
  }
  if(repo)content+='<p class="muted">Ветки: '+esc((summary.branches||[]).join(", "))+'</p>';
  if(owner){
   const repositories=summary.repositories||[];
   const p=data.projects.find(x=>x.id===active);
   content+='<p>Найдено публичных репозиториев: '+repositories.length+'</p><div class="atlas-discovered">';
   for(const r of repositories){
    const attached=p?.sources.some(s=>s.kind==="github"&&s.locator.toLowerCase()===r.name.toLowerCase());
    content+='<div class="row"><span>'+esc(r.name)+'</span><small>'+esc(r.pushedAt||"нет даты")+'</small> '+(attached?'<span class="tag">Подключён</span>':button("Наблюдать ветки","adopt:"+esc(source.id)+":"+encodeURIComponent(r.name)))+'</div>';
   }
   content+='</div>';
  }
 }
 return content+'</div>';
}
const button=(label,action,css="")=>'<button data-action="'+action+'" class="'+css+'">'+label+'</button>';
function renderImpact(p){
 const mount=document.querySelector("#atlas-impact");if(!mount)return;
 const impact=projectImpact(p);
 const records=impact.rows.filter(r=>r.intent==="committed");
 const summary='<div class="atlas-kpis"><div><small>Требуют внимания</small><strong>'+impact.attention+'</strong></div><div><small>Без открытых работ</small><strong>'+impact.missingWork+'</strong></div><div><small>Проверить сведения</small><strong>'+impact.evidenceReview+'</strong></div><div><small>Проблемные источники</small><strong>'+impact.sourceIssues.length+'</strong></div></div>';
 const rows=records.map(row=>{
  const actions=row.action==="review_evidence"||row.action==="verify_acceptance"?button("Уточнить факт","finding-target:"+esc(row.targetId)):
    button("Запланировать работу","item-target:"+esc(row.targetId));
  const changeLine=row.changeRequests.length?'<p class="muted">Изменения: '+esc(row.changeRequests.map(c=>c.title+" ["+c.status+"]").join(", "))+'</p>':"";
  return '<div class="atlas-impact-row"><div><strong>'+esc(row.title)+'</strong><p class="muted">'+esc(row.reasons.join("; ")||"Необходима оценка критериев")+'</p>'+changeLine+'</div><div class="atlas-impact-state">'+esc(row.assessment)+'</div><div><small>'+esc(row.work.map(w=>w.title+" ("+w.state+")").join(", ")||"Нет связанных работ")+'</small></div><div>'+actions+'</div></div>';
 }).join("");
 mount.innerHTML='<section class="card"><h2>Цель → факты → действия</h2><p class="muted">Изменение Git-ревизии может потребовать пересмотра ранее заявленного результата. Завершённые работы и CI сами по себе не означают приёмку.</p>'+summary+(records.length?'<div class="atlas-impact-list">'+rows+'</div>':'<p class="muted">Добавьте обязательные требования, чтобы начать оценку разрывов.</p>')+'</section>';
}
function render(){if(storageMount)storageMount.innerHTML=storageBanner();if(!ready){root.innerHTML='<section class="card"><h2>Проекты не загружены</h2><p>Atlas не создаёт пустой портфель вместо повреждённых или недоступных данных. Восстановите доступ к IndexedDB либо импортируйте корректную резервную копию.</p></section>';return;}const p=data.projects.find(x=>x.id===active),stateCounts={active:data.projects.filter(x=>x.status==="active").length,blocked:data.projects.reduce((n,p)=>n+summary(p).blocked,0)};
root.innerHTML='<div id="atlas-editor-slot"></div>'+(p?projectView(p):'<h2>Портфель проектов</h2><p class="muted">Проекты человека и организации. Связи с внешними системами не дублируют их данные.</p><div class="grid"><div class="card"><small>Всего проектов</small><div class="metric">'+data.projects.length+'</div></div><div class="card"><small>Активные</small><div class="metric">'+stateCounts.active+'</div></div><div class="card"><small>Заблокированные работы</small><div class="metric">'+stateCounts.blocked+'</div></div></div><div class="row">'+button("＋ Создать проект","new","primary")+'</div>'+renderPortfolioCommand(buildPortfolioCommand(data),{filter:commandFilter,search:commandSearch,escape:esc})+
'<div class="row atlas-portfolio-switch">'+button(portfolioView==="focus"?"Показать подробные графы и отчёты":"Скрыть подробные отчёты","portfolio-view:"+(portfolioView==="focus"?"details":"focus"))+'</div>'+
(portfolioView==="details"?renderPortfolioInsight(data.projects,esc)+renderPortfolioImpact()+renderPortfolioResponses(data,projectImpact,esc)+renderPortfolioSchedule(data,esc)+renderPortfolioCascade(data,projectImpact,{mode:cascadeMode,escape:esc})+renderPortfolioNetwork(data,esc):"")+'<div class="grid">'+data.projects.map(p=>'<article class="card"><span class="tag">'+esc(p.type)+'</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.goal||"Без описания цели")+'</p><p class="muted">'+summary(p).total+' работ · '+p.sources.length+' источников</p><p class="muted">Требований: '+compareProject(p).committed+' · Без подтверждений: '+compareProject(p).counts.unknown+' · Несоответствия: '+(compareProject(p).counts.gap_reported+compareProject(p).counts.partial_reported)+' · Устарело / конфликтует: '+(compareProject(p).counts.stale+compareProject(p).counts.conflict)+'</p>'+button("Открыть","open:"+esc(p.id))+'</article>').join("")+'</div>');if(p){renderSchedule(p);renderTrace(p);renderGraph(p);renderImpact(p);}renderActiveEditor(p);}
function renderPortfolioImpact(){
 const impact=portfolioImpact(data.projects);
 if(!impact.rows.length)return "";
 return '<section class="card"><h2>Действия по портфелю</h2><p class="muted">Требования, связанные с фактами и работами; это очередь пересмотра, не процент готовности.</p><div class="atlas-kpis"><div><small>Требуют внимания</small><strong>'+impact.attention+'</strong></div><div><small>Без открытых работ</small><strong>'+impact.missingWork+'</strong></div><div><small>Перепроверить факты</small><strong>'+impact.evidenceReview+'</strong></div><div><small>Проблемные источники</small><strong>'+impact.sourceIssues+'</strong></div></div></section>';
}
function renderSchedule(p){
 const target=document.querySelector("#atlas-schedule");if(!target||!p)return;
 const plan=scheduleProject(p);
 const rows=plan.rows.map(x=>'<tr><td>'+esc(x.title)+'</td><td>'+x.durationDays+'</td><td>'+esc(x.startDate||"день "+x.earlyStart)+'</td><td>'+esc(x.finishDate||"день "+x.earlyFinish)+'</td><td>'+x.floatDays+'</td><td>'+(x.critical?"●":"—")+'</td></tr>').join("");
 target.innerHTML='<div class="card"><p><strong>Длительность:</strong> '+plan.durationDays+' календарных дней · <strong>Начало:</strong> '+esc(p.startDate||"не задано")+' · <strong>Финиш:</strong> '+esc(plan.estimatedFinish||"—")+'</p><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Работа</th><th>Дни</th><th>Начало</th><th>Финиш</th><th>Резерв</th><th>Критическая</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted">Календарный CPM без ресурсного выравнивания. Не означает принятие результата или релиза.</p></div>';
}
function renderGraph(p){const mount=document.querySelector("#atlas-relations");if(!mount)return;mount.innerHTML='<section class="card"><h2>Граф связей</h2><p class="muted">Стрелка: предшественник → зависимая работа. Выберите работу на доске, чтобы изменить её параметры.</p><div class="row"><label for="atlas-graph-mode">Отображать</label><select id="atlas-graph-mode"><option value="all"'+(graphMode==="all"?" selected":"")+'>Все</option><option value="critical"'+(graphMode==="critical"?" selected":"")+'>Критический путь</option><option value="blocked"'+(graphMode==="blocked"?" selected":"")+'>Заблокированные</option></select></div>'+renderDependencyGraph(p,{mode:graphMode})+'<h3>Временная шкала</h3>'+renderTimeline(p)+'</section>'}
function renderActiveEditor(p){const mount=document.querySelector("#atlas-editor-slot");if(mount)mount.innerHTML=editorAction?renderEditor(editorSpec(p,editorAction,data),esc):"";}
function renderTrace(p){
 const mount=document.querySelector("#atlas-trace");if(!mount)return;
 const view=compareProject(p),titles={unknown:"Нет подтверждений",conflict:"Противоречия",stale:"Данные требуют сверки",gap_reported:"Сообщено об отсутствии",partial_reported:"Реализовано частично (заявлено)",implemented_claim:"Реализовано (заявлено)",test_claim:"Проверено (заявлено)",acceptance_claim:"Принято (заявлено)"};
 const labels=Object.entries(view.counts).filter(([,v])=>v>0).map(([k,v])=>'<span class="tag">'+esc(titles[k]||k)+': '+v+'</span>').join(" ");
 const rows=filterTraceRows(view.rows,traceMode).map(x=>'<tr id="atlas-target-'+esc(encodeURIComponent(x.id))+'" tabindex="-1" class="atlas-focus-target"><td>'+esc(x.title)+'<div class="muted">'+esc(x.desired)+'</div></td><td>'+esc(x.intent==="candidate"?"Предложено":"Обязательно")+'</td><td>'+esc(titles[x.assessment]||x.assessment)+'</td><td>'+esc(x.latest?.reference||x.latest?.sourceId||"Не указан")+'</td><td>'+esc(x.latest?.revision||"—")+'</td><td>'+esc(x.latest?.observedAt||"—")+'</td></tr>').join("");
 const proposed=(p.changes||[]).map(c=>'<div class="item"><strong>'+esc(c.title)+'</strong><span class="tag">'+esc(c.status)+'</span> '+button("Изменить статус","change:"+esc(c.id))+'<p class="muted">'+esc(c.description||"")+'</p></div>').join("");
 mount.innerHTML='<section class="card"><h2>Что должно быть / что есть / что изменим</h2><p class="muted">Ниже перечислены требования, утверждения с происхождением и запросы изменений. Эти записи не заменяют независимую квалификацию результата.</p><div class="row">'+button("＋ Требование","target")+button("＋ Факт","finding")+button("＋ Изменение","proposal")+'</div><p>'+labels+'</p>'+statusBand(view.counts,esc)+'<div class="row"><label for="trace-filter">Показать:</label><select id="trace-filter"><option value="all"'+(traceMode==="all"?" selected":"")+'>Все требования</option><option value="needs_attention"'+(traceMode==="needs_attention"?" selected":"")+'>Есть вопросы</option><option value="unconfirmed"'+(traceMode==="unconfirmed"?" selected":"")+'>Нет подтверждений / устарело</option><option value="reported"'+(traceMode==="reported"?" selected":"")+'>Заявлена реализация или проверка</option><option value="candidate"'+(traceMode==="candidate"?" selected":"")+'>Предлагаемые возможности</option></select></div><div style="overflow:auto"><table style="width:100%;text-align:left"><thead><tr><th>Ожидается</th><th>Статус плана</th><th>Фактически</th><th>Источник</th><th>Версия</th><th>Дата</th></tr></thead><tbody>'+rows+'</tbody></table></div><h3>Изменения и предложения</h3>'+proposed+'</section>';
}
function projectView(p){const s=summary(p), cols=[["todo","Запланировано"],["in_progress","В работе"],["blocked","Блокировано"],["done","Готово"]];
return '<div class="row">'+button("← Все проекты","back")+'<span class="tag">'+esc(p.status)+'</span>'+button("Изменить статус","status")+'</div><h1>'+esc(p.name)+'</h1><p class="muted">'+esc(p.goal)+'</p><div class="grid"><div class="card"><small>Выполнено работ</small><div class="metric">'+(s.progress===null?"—":s.progress+"%")+'</div><small>Не является подтверждением готовности релиза</small></div><div class="card"><small>Блокеры</small><div class="metric">'+s.blocked+'</div></div><div class="card"><small>Связанных источников</small><div class="metric">'+s.sourceCount+'</div></div></div><div class="row">'+button("＋ Этап","stage")+button("＋ Работа","item","primary")+button("＋ Зависимость","dep")+button("Дата старта","start")+button("＋ Риск","risk")+button("＋ Решение","decision")+'</div><section class="card"><h2>Этапы</h2>'+p.stages.map(x=>'<p>◈ '+esc(x.name)+' <small>('+p.items.filter(y=>y.stageId===x.id).length+' работ)</small></p>').join("")+'</section>'+'<div id="atlas-project-relations" class="atlas-focus-target" tabindex="-1">'+renderProjectRelations(data,p.id,esc)+renderProjectCascade(data,p.id,projectImpact,esc)+'</div>'+
'<div id="atlas-project-response" class="atlas-focus-target" tabindex="-1">'+renderProjectResponses(p,projectImpact(p),esc)+'</div>'+
'<div id="atlas-project-schedule" class="atlas-focus-target" tabindex="-1">'+renderProjectSchedule(data,p.id,esc)+'</div>'+'<h2>План-график</h2><div id="atlas-schedule"></div><div id="atlas-relations"></div><div id="atlas-impact"></div><div id="atlas-trace" class="atlas-focus-target" tabindex="-1"></div><h2>Работы</h2><div class="board">'+cols.map(([st,title])=>'<section class="column"><strong>'+title+'</strong>'+p.items.filter(x=>x.state===st).map(x=>'<div class="item"><strong>'+esc(x.title)+'</strong><small>'+esc(x.assignee||"Не назначено")+'</small><div class="row">'+button("Редактировать · "+(x.estimateDays??1)+" дн.","work:"+esc(x.id))+'</div><select data-work="'+esc(x.id)+'">'+cols.map(([v,t])=>'<option value="'+v+'" '+(x.state===v?"selected":"")+'>'+t+'</option>').join("")+'</select></div>').join("")+'</section>').join("")+'</div><section class="card"><h2>Зависимости</h2>'+p.dependencies.map(x=>'<p>'+esc(p.items.find(t=>t.id===x.from)?.title)+' → '+esc(p.items.find(t=>t.id===x.to)?.title)+'</p>').join("")+'</section><section class="card"><h2>Риски и решения</h2>'+p.risks.map(r=>'<p>⚠ '+esc(r.title)+'</p>').join("")+p.decisions.map(d=>'<p>✓ '+esc(d.text)+'</p>').join("")+'</section><section id="atlas-project-sources" class="card atlas-focus-target" tabindex="-1"><div class="row"><h2>Источники</h2>'+button("＋ Источник","source")+'</div><p class="muted">Публичный владелец GitHub обнаруживает новые репозитории, выбранный репозиторий — ветки и SHA. Изменения источников не подтверждают готовность продукта.</p>'+p.sources.map(sourceCard).join("")+'</section>';
}
root.addEventListener("click",event=>{
 const b=event.target.closest("[data-action]");if(!b)return;
 const action=b.dataset.action;
 safe(async()=>{
  if(action==="cancel-editor"){editorAction=null;render();return}
  if(action==="restore-storage"){
   if(storageStatus!=="recovery")return;
   if(!confirm("Восстановить предыдущую исправную версию? Повреждённый снимок будет сохранён в карантине."))return;
   data=await store.restorePrevious();storageStatus="ready";storageWarning="";editorAction=null;render();return;
  }
  if(action==="back"){active=null;editorAction=null;render();return}
  if(action.startsWith("portfolio-view:")){
   const mode=action.slice("portfolio-view:".length);
   if(!["focus","details"].includes(mode))throw Error("Неизвестный режим портфеля");
   portfolioView=mode;render();return;
  }
  if(action.startsWith("inspect:")){
   const parts=action.slice("inspect:".length).split(":");
   const projectId=decodeURIComponent(parts[0]||""),panel=parts[1]||"project";
   const selectors={response:"#atlas-project-response",schedule:"#atlas-project-schedule",
    relations:"#atlas-project-relations",evidence:"#atlas-trace",
    sources:"#atlas-project-sources",project:"#atlas-project-response"};
   if(!ready||!data.projects.some(p=>p.id===projectId)||!Object.hasOwn(selectors,panel))
    throw Error("Указанный проект или раздел не найден");
   active=projectId;editorAction=null;traceMode="all";graphMode="all";render();
   const ref=parts.length>2?decodeURIComponent(parts.slice(2).join(":")):"";
   const id=ref&&panel==="response"?"atlas-cause-"+encodeURIComponent(ref):
    ref&&panel==="evidence"?"atlas-target-"+encodeURIComponent(ref):null;
   const target=(id?document.getElementById?.(id):null)||document.querySelector(selectors[panel]);
   target?.focus?.({preventScroll:true});target?.scrollIntoView?.({block:"start",behavior:"auto"});
   return;
  }
  if(action.startsWith("unlink:")){
   if(!ready)throw Error("Хранилище не готово");
   if(confirm("Удалить межпроектную зависимость? Это не удаляет проекты или работы."))await save(removePortfolioLink(data,action.slice(7)));
   return;
  }
  if(action.startsWith("open:")){active=action.slice(5);editorAction=null;traceMode="all";graphMode="all";render();return}
  if(!ready)throw Error("Локальное хранилище не готово");
  const p=data.projects.find(x=>x.id===active);
  if(action.startsWith("sync:")){
   if(!p)return;
   await refreshSource(p.id,action.slice(5));
   return;
  }
  if(action.startsWith("adopt:")){
   if(!p)return;
   const marker=action.indexOf(":",6);
   if(marker===-1)throw Error("Неверная ссылка на репозиторий");
   const sourceId=action.slice(6,marker),name=decodeURIComponent(action.slice(marker+1));
   const result=attachDiscoveredRepo(data,p.id,sourceId,name);
   await save(result.state);return;
  }
  editorAction=action;editorSpec(p,action,data);render();
 });
});
root.addEventListener("submit",event=>{
 if(event.target.id!=="atlas-editor-form")return;
 event.preventDefault();
 safe(async()=>{
  if(!editorAction)return;
  const values=new FormData(event.target);
  if(!ready)throw Error("Хранилище не готово");
  const result=applyEditor(data,active,editorAction,values);
  await save(result.state);
  if(result.projectId)active=result.projectId;
  editorAction=null;
  render();
 });
});
root.addEventListener("input",e=>{
 if(e.target.id!=="atlas-command-search"||active)return;
 commandSearch=e.target.value;
 const target=document.querySelector("#atlas-command-rows");
 if(target)target.innerHTML=renderPortfolioCommandRows(buildPortfolioCommand(data),{filter:commandFilter,search:commandSearch,escape:esc});
});
root.addEventListener("change",e=>{
 if(e.target.id==="atlas-command-filter"){commandFilter=e.target.value;
  const target=document.querySelector("#atlas-command-rows");
  if(target)target.innerHTML=renderPortfolioCommandRows(buildPortfolioCommand(data),{filter:commandFilter,search:commandSearch,escape:esc});return;
 }
 if(e.target.id==="trace-filter"){traceMode=e.target.value;render();return}
 if(e.target.id==="atlas-graph-mode"){graphMode=e.target.value;render();return}
 if(e.target.id==="atlas-cascade-mode"){cascadeMode=e.target.value;render();return}
 const id=e.target.dataset.work;if(!id)return;
 safe(()=>save(editItem(data,active,id,{state:e.target.value})));
});
document.querySelector("#export").onclick=()=>{
 safe(async()=>{
  if(!ready)throw Error("Нет достоверного снимка для экспорта");
  const url=URL.createObjectURL(new Blob([serialize(data)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="atlas-backup.json";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
 });
};
document.querySelector("#import").onclick=()=>document.querySelector("#file").click();
document.querySelector("#file").onchange=async event=>{
 const file=event.target.files?.[0];if(!file)return;
 await safe(async()=>{
  if(file.size>100000000)throw Error("Размер резервной копии превышает 100 МБ");
  const snapshot=deserialize(await file.text());
  if(!confirm("Заменить текущий портфель загруженным архивом? Предыдущий снимок будет сохранён для восстановления."))return;
  await store.replace(snapshot);
  data=snapshot;ready=true;storageStatus="ready";storageWarning="";storageError=null;
  active=null;editorAction=null;render();
 });
 event.target.value="";
};
render();
boot();
if(typeof window!=="undefined"&&typeof window.setInterval==="function"){
 window.setInterval(()=>{refreshDueSources().catch(e=>{msg.textContent=e.message})},SOURCE_REFRESH_MS);
 window.addEventListener?.("focus",()=>{refreshDueSources().catch(e=>{msg.textContent=e.message})});
}

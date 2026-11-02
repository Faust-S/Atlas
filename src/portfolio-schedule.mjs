// Cross-project date forecasts. These are planning projections, never observed completion.
// Reuses the existing CPM and the existing project dependency DAG; no new store.
import {validatePortfolioLinks} from "./portfolio.mjs";
import {scheduleProject} from "./planning.mjs";

const DAY = 86400000;
const MAX_DAY = Date.parse("9999-12-31T00:00:00Z") / DAY;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function day(date) {
 if (!date) return null;
 const value = Date.parse(date+"T00:00:00Z") / DAY;
 if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DAY) throw Error("Invalid schedule date");
 return value;
}
const dateOf = value => value != null && value >= 0 && value <= MAX_DAY ?
 new Date(value*DAY).toISOString().slice(0,10) : null;
const labelDate = value => value || "не определена";
const inactive = p => p.status==="paused"||p.status==="cancelled";
const inactiveLabel = p => p.status==="cancelled"?"отменён":"приостановлен";
export function projectedFinishLabel(row){
 if(!row)return "Не определён";
 if(row.status==="cancelled")return "Нет поставки (проект отменён)";
 if(row.status==="paused")return "Срок неизвестен (проект на паузе)";
 if(row.unavailableOrigins?.some(x=>x.status==="cancelled"))return "Блокировано отменённым предшественником";
 if(row.unavailableOrigins?.length)return "Предшественник приостановлен";
 return labelDate(row.projectedFinish);
}

// A dependency means successor may start only after the predecessor's CPM finish.
// The estimate is calendar-day only, does not account for people/capacity/acceptance.
export function portfolioSchedule(snapshot) {
 const order=validatePortfolioLinks(snapshot), projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const inputs=new Map(order.map(id=>[id,[]]));
 for(const link of snapshot.portfolioLinks||[])inputs.get(link.to).push(link.from);
 const byId=new Map();
 for(const id of order){
  const p=projects.get(id),incoming=inputs.get(id);
  const plan=scheduleProject(p);
  const hasEstimate=p.items.length>0;
  const plannedStartDay=day(p.startDate),dueDay=day(p.dueDate);
  const parents=incoming.map(from=>byId.get(from));
  const missingParents=parents.filter(row=>row.projectedFinishDay===null);
  // A paused/cancelled predecessor cannot promise a delivery date. Preserve
  // its historical baseline but propagate the root cause through the DAG.
  const origins=new Map();
  if(inactive(p))origins.set(id,{id,name:p.name,status:p.status});
  for(const parent of parents)for(const cause of parent.unavailableOrigins||[])
   origins.set(cause.id,cause);
  const unavailableOrigins=[...origins.values()];
  const unknownParents=missingParents.filter(row=>!row.unavailableOrigins?.length);
  const upstreamReadyDay=incoming.length && !missingParents.length ? Math.max(...parents.map(r=>r.projectedFinishDay)) : null;
  let projectedStartDay=null;
  if(!inactive(p)&&missingParents.length===0) {
   if(incoming.length) projectedStartDay=plannedStartDay===null?upstreamReadyDay:Math.max(plannedStartDay,upstreamReadyDay);
   else projectedStartDay=plannedStartDay;
  }
  const projectedFinishDay=projectedStartDay!==null && hasEstimate && projectedStartDay+plan.durationDays<=MAX_DAY ?
   projectedStartDay+plan.durationDays : null;
  const plannedFinishDay=plannedStartDay!==null && hasEstimate && plannedStartDay+plan.durationDays<=MAX_DAY ?
   plannedStartDay+plan.durationDays : null;
  const shiftDays=plannedStartDay!==null && projectedStartDay!==null ? projectedStartDay-plannedStartDay : null;
  const deadlineSlipDays=dueDay!==null && projectedFinishDay!==null ? Math.max(0,projectedFinishDay-dueDay) : null;
  const limitingParents=upstreamReadyDay!==null?parents.filter(row=>row.projectedFinishDay===upstreamReadyDay).map(row=>row.id):[];
  const approvedChanges=(p.changes||[]).filter(c=>["approved","in_progress","implemented"].includes(c.status));
  const changedWork=p.items.filter(item=>item.changeId&&approvedChanges.some(change=>change.id===item.changeId));
  const unplannedChanges=approvedChanges.filter(change=>["approved","in_progress"].includes(change.status)&&!p.items.some(item=>item.changeId===change.id));
  const notes=[];
  if(!hasEstimate)notes.push("Работы с оценками длительности отсутствуют");
  if(inactive(p))notes.push(p.status==="cancelled"?
   "Проект отменён: расчётная поставка недоступна, требуется решение человека":
   "Проект приостановлен: дата поставки неизвестна до возобновления");
  if(unavailableOrigins.length&&!inactive(p))
   notes.push("Поставка заблокирована состоянием предшественников: "+
    unavailableOrigins.map(x=>x.name+" ("+inactiveLabel(x)+")").join(", "));
  if(unknownParents.length)notes.push("Нет расчётной даты завершения предшественников: "+unknownParents.map(x=>x.name).join(", "));
  if(!incoming.length&&plannedStartDay===null)notes.push("Дата начала не задана");
  if(incoming.length&&plannedStartDay===null&&projectedStartDay!==null)notes.push("Начало вычислено только по срокам предшественников");
  if(shiftDays>0)notes.push("Начало потребует пересмотра: +"+shiftDays+" дн. относительно указанного плана");
  if(deadlineSlipDays>0)notes.push("Расчётное превышение дедлайна: "+deadlineSlipDays+" дн.");
  if(dueDay===null)notes.push("Контрольная дата не установлена");
  if(unplannedChanges.length)notes.push("Утверждённые изменения без открытой работы: "+unplannedChanges.length);
  if(p.status==="completed")notes.push("Завершение проекта заявлено, независимая приёмка не установлена");
  byId.set(id,{
   id,name:p.name,status:p.status,declaredStart:p.startDate||null,deadline:p.dueDate||null,
   durationDays:plan.durationDays,hasEstimate,plannedFinish:dateOf(plannedFinishDay),
   projectedStart:dateOf(projectedStartDay),projectedFinish:dateOf(projectedFinishDay),
   projectedFinishDay,upstreamReady:dateOf(upstreamReadyDay),missingParents:missingParents.map(x=>x.id),
   unavailableOrigins,
   shiftDays,deadlineSlipDays,limitingParents,incoming:[...incoming],
   changedWork:changedWork.map(w=>({id:w.id,title:w.title,estimateDays:w.estimateDays??1,changeId:w.changeId})),
   approvedChanges:approvedChanges.map(c=>({id:c.id,title:c.title,status:c.status})),
   unplannedChanges:unplannedChanges.map(c=>c.id),notes,
   needsReview:inactive(p)||shiftDays>0||deadlineSlipDays>0||missingParents.length>0||unplannedChanges.length>0||!hasEstimate||(!incoming.length&&plannedStartDay===null),
   // Explicit dates/requirements can be absent; never invent complete delivery.
   confidence:projectedFinishDay===null?"undated":"calendar_estimate_only"
  });
 }
 const rows=snapshot.projects.map(p=>byId.get(p.id));
 return {rows,byId,
  totals:{projects:rows.length,dated:rows.filter(r=>r.projectedFinish!==null).length,
   needsReview:rows.filter(r=>r.needsReview).length,
   deadlineRisks:rows.filter(r=>r.deadlineSlipDays>0).length,
   unknown:rows.filter(r=>r.projectedFinish===null).length},
  warning:"Расчётные календарные даты не являются прогнозом фактического выполнения или подтверждённой приёмкой"};
}
export function renderPortfolioSchedule(snapshot, escape=escapeHtml){
 const result=portfolioSchedule(snapshot);
 const rows=result.rows.map(r=>{
  const notes=r.notes.length?r.notes.join("; "):"Расчёт без обнаруженных календарных конфликтов";
  return '<tr><td><button class="atlas-plain-button" data-action="open:'+escape(r.id)+'">'+escape(r.name)+'</button></td>'+
   '<td>'+escape(labelDate(r.declaredStart))+'</td><td>'+r.durationDays+'</td><td>'+escape(labelDate(r.plannedFinish))+'</td>'+
   '<td>'+escape(labelDate(r.projectedStart))+'</td><td>'+escape(projectedFinishLabel(r))+'</td>'+
   '<td>'+escape(labelDate(r.deadline))+'</td>'+
   '<td>'+(r.deadlineSlipDays===null?"—":r.deadlineSlipDays>0?"+"+r.deadlineSlipDays+" дн.":"В пределах плана")+'</td>'+
   '<td><small>'+escape(notes)+'</small></td></tr>';
 }).join("");
 return '<section class="card"><h2>Сроки и последствия изменений плана</h2>'+
  '<p class="muted">Исходная дата → CPM по работам → расчётный срок с учётом зависимостей между проектами. Утверждённые изменения учитываются через связанные плановые работы; автоматического переноса сроков нет.</p>'+
  '<div class="atlas-kpis"><div><small>Расчётные сроки</small><strong>'+result.totals.dated+'</strong></div><div><small>Нужен пересмотр плана</small><strong>'+result.totals.needsReview+'</strong></div><div><small>Риск нарушения срока</small><strong>'+result.totals.deadlineRisks+'</strong></div><div><small>Недостаточно дат</small><strong>'+result.totals.unknown+'</strong></div></div>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Начало по плану</th><th>CPM, дни</th><th>Финиш локально</th><th>Начало с зависимостями</th><th>Финиш расчётный</th><th>Контрольная дата</th><th>Отклонение</th><th>Основание</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<p class="muted">CPM: календарные дни, без ресурсного выравнивания. Оценки не подтверждают фактическое исполнение.</p></section>';
}
export function renderProjectSchedule(snapshot,projectId,escape=escapeHtml){
 const result=portfolioSchedule(snapshot),r=result.byId.get(projectId);
 if(!r)return "";
 const predecessor=r.limitingParents.map(id=>result.byId.get(id)?.name||id);
 const linked=r.changedWork.map(w=>'<li>'+escape(w.title)+' · '+w.estimateDays+' дн. (по утверждённому изменению)</li>').join("");
 const notes=r.notes.map(note=>'<li>'+escape(note)+'</li>').join("");
 return '<section class="card"><div class="row"><h2>Пересмотр сроков проекта</h2><button data-action="dates">Изменить плановые даты</button></div>'+
  '<p>Начало по плану: <strong>'+escape(labelDate(r.declaredStart))+'</strong> · Завершение CPM: <strong>'+escape(labelDate(r.plannedFinish))+'</strong> · С учётом зависимостей: <strong>'+escape(projectedFinishLabel(r))+'</strong> · Контрольная дата: <strong>'+escape(labelDate(r.deadline))+'</strong></p>'+
  (predecessor.length?'<p class="muted">Срок ограничивают предшественники: '+escape(predecessor.join(", "))+'</p>':"")+
  (linked?'<p><strong>Работы по утверждённым изменениям</strong></p><ul>'+linked+'</ul>':"")+
  (notes?'<ul>'+notes+'</ul>':'<p class="muted">Календарных конфликтов не выявлено, но готовность не подтверждена.</p>')+
  '<p class="muted">Расчёт носит рекомендательный характер. Даты изменяются только по явному решению пользователя.</p></section>';
}

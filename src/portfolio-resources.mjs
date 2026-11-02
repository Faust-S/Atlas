// Read-only capacity commitments over the existing Atlas CPM and portfolio dependencies.
// Explicit local planning resource IDs prevent falsely treating equal names as one person.
// No personnel identity, actual availability verification, resource leveling or execution.
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {scheduleProject} from "./planning.mjs";

const esc = x => String(x ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY=86400000;
const day = value => value ? Date.parse(value+"T00:00:00Z")/DAY : null;
const date = value => new Date(value*DAY).toISOString().slice(0,10);
const show = value => value||"—";
const names = value => value.trim().replace(/\s+/g," ");
const dayEvents=(group)=>{
 const events=new Map();
 const append=(day,load,count)=>{const e=events.get(day)||{load:0,count:0};e.load+=load;e.count+=count;events.set(day,e)};
 for(const w of group.work){
  if(w.startDay!==null&&w.finishDay!==null&&w.finishDay>w.startDay){
   append(w.startDay,w.allocationPct,1);
   append(w.finishDay,-w.allocationPct,-1);
  }
 }
 const from=day(group.availableFrom),until=day(group.availableUntil);
 if(from!==null)append(from,0,0);
 if(until!==null)append(until+1,0,0);
 const boundaries=[...events.keys()].sort((a,b)=>a-b);
 let load=0,concurrent=0,maxLoadPct=0,maxConcurrent=0;
 let overloadDays=0,unavailableDays=0,overlapDays=0;
 for(let i=0;i<boundaries.length;i++){
  const event=events.get(boundaries[i]);
  load+=event.load;concurrent+=event.count;
  maxLoadPct=Math.max(maxLoadPct,load);
  maxConcurrent=Math.max(maxConcurrent,concurrent);
  if(i+1===boundaries.length)continue;
  const length=boundaries[i+1]-boundaries[i];
  if(length<=0||load<=0)continue;
  if(concurrent>1)overlapDays+=length;
  const outOfWindow=from!==null&&boundaries[i]<from||until!==null&&boundaries[i]>until;
  if(outOfWindow)unavailableDays+=length;
  else if(load>group.capacityPct)overloadDays+=length;
 }
 return {overlapDays,maxConcurrent,maxLoadPct,overloadDays,unavailableDays};
};
export function portfolioResources(snapshot,{schedule=null}={}){
 const forecast=schedule||portfolioSchedule(snapshot);
 const groups=new Map((snapshot.resources||[]).map(r=>[r.id,{
  id:r.id,label:r.label,capacityPct:r.capacityPct,availableFrom:r.availableFrom||null,
  availableUntil:r.availableUntil||null,work:[],projects:new Set()
 }]));
 const work=[];
 const totals={openWork:0,assigned:0,unassigned:0,unlinked:0,undated:0,dated:0,
  zeroDay:0,potentialConflicts:0,outsideAvailability:0,assignees:0};
 for(const project of snapshot.projects){
  if(project.status==="cancelled")continue;
  const start=day(forecast.byId.get(project.id)?.projectedStart);
  const own=scheduleProject(project);
  const items=new Map(project.items.map(x=>[x.id,x]));
  for(const planned of own.rows){
   if(planned.state==="done")continue;
   const item=items.get(planned.id),owner=names(item.assignee||"");
   const resourceId=item.resourceId||null;
   const linked=resourceId?groups.get(resourceId):null;
   const startDay=start===null?null:start+planned.earlyStart;
   const finishDay=start===null?null:start+planned.earlyFinish;
   const row={projectId:project.id,projectName:project.name,id:item.id,title:item.title,
    state:item.state,assignee:owner,resourceId,resourceLabel:linked?.label||null,
    allocationPct:item.allocationPct??100,estimateDays:planned.durationDays,
    startDay,finishDay,startDate:startDay===null?null:date(startDay),
    finishDate:finishDay===null?null:date(finishDay)};
   work.push(row);totals.openWork++;
   if(!owner)totals.unassigned++;else totals.assigned++;
   if(!resourceId)totals.unlinked++;
   if(startDay===null)totals.undated++;else totals.dated++;
   if(planned.durationDays===0)totals.zeroDay++;
   if(linked){linked.work.push(row);linked.projects.add(project.id)}
  }
 }
 const people=[...groups.values()].map(r=>{
  const load=dayEvents(r);
  return {...r,projectCount:r.projects.size,itemCount:r.work.length,
   scheduledDays:r.work.reduce((n,w)=>n+w.estimateDays,0),
   datedWork:r.work.filter(w=>w.startDay!==null).length,
   undatedWork:r.work.filter(w=>w.startDay===null).length,
   ...load};
 }).sort((a,b)=>(b.overloadDays+b.unavailableDays)-(a.overloadDays+a.unavailableDays)||
  b.undatedWork-a.undatedWork||a.label.localeCompare(b.label,"ru"));
 totals.potentialConflicts=people.filter(r=>r.overloadDays>0).length;
 totals.outsideAvailability=people.filter(r=>r.unavailableDays>0).length;
 totals.assignees=people.length;
 const byId=new Map(people.map(p=>[p.id,p]));
 return {people,byId,work,totals,
  warning:"Ресурсы и мощность заданы человеком для планирования, не являются проверенной личностью, официальной доступностью или полномочием. CPM использует календарные дни без выравнивания нагрузки."};
}
export function renderPortfolioResources(snapshot,escape=esc){
 const {people,totals:t}=portfolioResources(snapshot);
 const rows=people.slice(0,60).map(p=>{
  const issue=p.overloadDays||p.unavailableDays?
   '<strong>Выше мощности: '+p.overloadDays+' дн.; вне доступности: '+p.unavailableDays+' дн.</strong>':
   p.undatedWork?'Сроки части работ неизвестны':'В известных сроках превышений нет';
  return '<tr><td><strong>'+escape(p.label)+'</strong><small>Плановая привязка, не учётная запись</small></td>'+
   '<td>'+p.capacityPct+'%</td><td>'+escape(show(p.availableFrom))+' — '+escape(show(p.availableUntil))+'</td>'+
   '<td>'+p.projectCount+'</td><td>'+p.itemCount+'</td><td>'+p.maxLoadPct+'%</td>'+
   '<td>'+issue+'</td><td>'+p.undatedWork+'</td>'+
   '<td><button data-action="resource-edit:'+escape(p.id)+'">Настроить</button></td></tr>';
 }).join("");
 return '<section class="card" id="atlas-portfolio-resources"><div class="row"><h2>Ресурсные обязательства портфеля</h2>'+
  '<button data-action="resource-new" class="primary">＋ Плановый ресурс</button></div>'+
  '<p class="muted">Объединение работ только по явно выбранному ресурсу. Совпадение имени ответственного не означает, что это один человек. Мощность — плановые проценты, а не измеренная занятость.</p>'+
  '<div class="atlas-kpis"><div><small>Плановых ресурсов</small><strong>'+t.assignees+'</strong></div>'+
  '<div><small>Выше заданной мощности</small><strong>'+t.potentialConflicts+'</strong></div>'+
  '<div><small>Вне периода доступности</small><strong>'+t.outsideAvailability+'</strong></div>'+
  '<div><small>Работ без привязки</small><strong>'+t.unlinked+'</strong></div>'+
  '<div><small>Работ без даты</small><strong>'+t.undated+'</strong></div></div>'+
  (rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
   '<th>Ресурс</th><th>Мощность</th><th>Доступность (заявлено)</th><th>Проектов</th><th>Работ</th>'+
   '<th>Макс. нагрузка</th><th>Ограничения</th><th>Без дат</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':
   '<p class="muted">Плановые ресурсы пока не определены. Создайте ресурс и явно привяжите к нему работы через форму редактирования.</p>')+
  (people.length>60?'<p class="muted">Показаны первые 60 из '+people.length+' ресурсов.</p>':"")+
  '<p class="muted">Нулевое превышение не означает доступности человека: не учитываются рабочие часы, отпуска, реальное исполнение, права и другие системы планирования.</p></section>';
}
export function renderProjectResources(snapshot,projectId,escape=esc){
 const result=portfolioResources(snapshot),rows=result.work.filter(w=>w.projectId===projectId);
 if(!rows.length)return "";
 const tr=rows.slice(0,50).map(w=>{
  const group=w.resourceId?result.byId.get(w.resourceId):null;
  const signal=!group?'Не связан с ресурсом':!w.startDate?'Недостаточно дат':
   group.unavailableDays>0?'Есть задачи вне периода доступности':
   group.overloadDays>0?'Есть перегрузка планового ресурса':
   'По известным датам превышений нет';
  return '<tr><td><button class="atlas-plain-button" data-action="work:'+escape(w.id)+'">'+escape(w.title)+'</button></td>'+
   '<td>'+escape(w.assignee||"Не назначен")+'</td><td>'+escape(group?.label||"Не привязан")+'</td>'+
   '<td>'+w.allocationPct+'%</td><td>'+w.estimateDays+'</td>'+
   '<td>'+escape(show(w.startDate))+'</td><td>'+escape(show(w.finishDate))+'</td><td>'+escape(signal)+'</td></tr>';
 }).join("");
 return '<section class="card" id="atlas-project-resources"><h2>Ресурсы работ проекта</h2>'+
  '<p class="muted">Для межпроектного сопоставления явно выберите один плановый ресурс в карточке работы. Имя ответственного остаётся отдельным текстовым полем.</p>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Работа</th><th>Ответственный</th><th>Ресурс</th><th>Доля</th><th>Дней</th><th>Начало CPM</th><th>Финиш CPM</th><th>Внимание</th></tr></thead><tbody>'+tr+'</tbody></table></div>'+
  (rows.length>50?'<p class="muted">Показаны 50 из '+rows.length+' работ.</p>':"")+
  '<p class="muted">Прогноз не распределяет работы автоматически, не подтверждает доступность и не заменяет решение человека.</p></section>';
}

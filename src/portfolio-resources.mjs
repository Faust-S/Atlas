// Read-only workload projection over Atlas's existing CPM and project DAG.
// Matching assignee text is a planning hint, not identity, capacity or actual utilization.
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {scheduleProject} from "./planning.mjs";

const escape = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY=86400000;
const day = date => date ? Date.parse(date+"T00:00:00Z")/DAY : null;
const date = n => new Date(n*DAY).toISOString().slice(0,10);
const label = value => value || "—";
const identity = x => x.trim().replace(/\s+/g," ").toLocaleLowerCase("ru-RU");

function load(group) {
 const events=new Map();
 for(const w of group.work)if(w.startDay!==null&&w.finishDay!==null&&w.finishDay>w.startDay){
  events.set(w.startDay,(events.get(w.startDay)||0)+1);
  events.set(w.finishDay,(events.get(w.finishDay)||0)-1);
 }
 const days=[...events.keys()].sort((a,b)=>a-b);
 let active=0,maxConcurrent=0,overlapDays=0;
 for(let i=0;i<days.length;i++){
  active+=events.get(days[i]);
  maxConcurrent=Math.max(maxConcurrent,active);
  if(i<days.length-1&&active>1)overlapDays+=days[i+1]-days[i];
 }
 return {maxConcurrent,overlapDays};
}
export function portfolioResources(snapshot,{schedule=null}={}){
 const forecast=schedule||portfolioSchedule(snapshot),groups=new Map(),work=[];
 const totals={openWork:0,assigned:0,unassigned:0,undated:0,dated:0,zeroDay:0,potentialConflicts:0};
 for(const project of snapshot.projects){
  if(project.status==="cancelled")continue;
  const projected=forecast.byId.get(project.id);
  const start=day(projected?.projectedStart);
  const own=scheduleProject(project);
  const original=new Map(project.items.map(w=>[w.id,w]));
  for(const item of own.rows){
   if(item.state==="done")continue;
   totals.openWork++;
   const owner=(original.get(item.id)?.assignee||"").trim().replace(/\s+/g," ");
   const startDay=start===null?null:start+item.earlyStart;
   const finishDay=start===null?null:start+item.earlyFinish;
   const entry={projectId:project.id,projectName:project.name,id:item.id,title:item.title,
    assignee:owner,ownerKey:owner?identity(owner):null,estimateDays:item.durationDays,
    startDay,finishDay,startDate:startDay===null?null:date(startDay),
    finishDate:finishDay===null?null:date(finishDay),state:item.state};
   work.push(entry);
   if(!owner)totals.unassigned++;else totals.assigned++;
   if(startDay===null)totals.undated++;else totals.dated++;
   if(item.durationDays===0)totals.zeroDay++;
   if(owner){
    if(!groups.has(entry.ownerKey))groups.set(entry.ownerKey,{
     key:entry.ownerKey,assignee:owner,work:[],projects:new Set()
    });
    const group=groups.get(entry.ownerKey);
    group.projects.add(project.id);
    group.work.push(entry);
   }
  }
 }
 const people=[...groups.values()].map(group=>{
  const {maxConcurrent,overlapDays}=load(group);
  return {key:group.key,assignee:group.assignee,projectCount:group.projects.size,
   itemCount:group.work.length,datedWork:group.work.filter(w=>w.startDay!==null).length,
   undatedWork:group.work.filter(w=>w.startDay===null).length,
   scheduledDays:group.work.reduce((n,w)=>n+w.estimateDays,0),maxConcurrent,overlapDays,
   work:group.work};
 }).sort((a,b)=>b.overlapDays-a.overlapDays||b.undatedWork-a.undatedWork||
  b.scheduledDays-a.scheduledDays||a.assignee.localeCompare(b.assignee,"ru"));
 totals.potentialConflicts=people.filter(p=>p.overlapDays>0).length;
 totals.assignees=people.length;
 return {people,work,totals,
  warning:"Совпадающие подписи ответственных не подтверждают личность, доступность или норматив мощности. Интервалы — календарный CPM без выравнивания ресурсов; завершённые работы исключены, отменённые проекты не учитываются."};
}
export function renderPortfolioResources(snapshot,esc=escape){
 const data=portfolioResources(snapshot),t=data.totals;
 const rows=data.people.slice(0,45).map(p=>'<tr><td>'+esc(p.assignee)+'</td><td>'+p.projectCount+'</td>'+
  '<td>'+p.itemCount+'</td><td>'+p.scheduledDays+'</td><td>'+
  (p.overlapDays>0?'<strong>Возможное пересечение: '+p.overlapDays+' дн.</strong>':'Не найдено в известных датах')+
  '</td><td>'+p.maxConcurrent+'</td><td>'+p.undatedWork+'</td></tr>').join("");
 return '<section class="card" id="atlas-portfolio-resources"><h2>Нагрузка ответственных и пересечения планов</h2>'+
  '<p class="muted">Подписи ответственных объединены по совпадению текста между проектами. Сопоставлены расчётные календарные интервалы незавершённых работ, не фактическая занятость.</p>'+
  '<div class="atlas-kpis"><div><small>Ответственных (подписи)</small><strong>'+t.assignees+'</strong></div>'+
  '<div><small>Возможные пересечения</small><strong>'+t.potentialConflicts+'</strong></div>'+
  '<div><small>Работ без ответственного</small><strong>'+t.unassigned+'</strong></div>'+
  '<div><small>Работ без расчётной даты</small><strong>'+t.undated+'</strong></div></div>'+
  (rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Ответственный / роль</th><th>Проектов</th><th>Работ</th><th>Сумма дней</th><th>Пересечение</th><th>Одновременно, макс.</th><th>Без дат</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
   '<p class="muted">Нет назначенных незавершённых работ. Это не означает доступности ресурсов.</p>')+
  (data.people.length>45?'<p class="muted">Показаны первые 45 из '+data.people.length+' ответственных.</p>':"")+
  '<p class="muted">Без календарного начала пересечение оценить нельзя. Два проекта с одинаковой подписью могут иметь разных исполнителей. Расчёт не меняет план.</p></section>';
}
export function renderProjectResources(snapshot,projectId,esc=escape){
 const data=portfolioResources(snapshot);
 const rows=data.work.filter(w=>w.projectId===projectId);
 if(!rows.length)return "";
 const index=new Map(data.people.map(p=>[p.key,p]));
 const table=rows.slice(0,40).map(w=>{
  const group=index.get(w.ownerKey),risk=group?.overlapDays>0?
   'Потенциальное пересечение: '+group.overlapDays+' дн. по подписи':'Пересечений по известным датам нет';
  return '<tr><td><button data-action="work:'+esc(w.id)+'" class="atlas-plain-button">'+esc(w.title)+'</button></td>'+
   '<td>'+esc(w.assignee||"Не назначен")+'</td><td>'+w.estimateDays+'</td>'+
   '<td>'+esc(label(w.startDate))+'</td><td>'+esc(label(w.finishDate))+'</td>'+
   '<td>'+esc(w.startDate?(w.ownerKey?risk:"Назначьте ответственного"):"Недостаточно дат")+'</td></tr>';
 }).join("");
 return '<section class="card" id="atlas-project-resources"><h2>Ответственные и плановая загрузка</h2>'+
  '<p class="muted">Расчёт по незавершённым работам этого проекта; совпадающие имена и роли в портфеле рассматриваются только как сигнал для уточнения доступности.</p>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Работа (изменить)</th><th>Ответственный</th><th>Дней</th><th>Начало расчётное</th><th>Финиш расчётный</th><th>Что уточнить</th></tr></thead><tbody>'+table+'</tbody></table></div>'+
  (rows.length>40?'<p class="muted">Показаны первые 40 из '+rows.length+' работ.</p>':"")+
  '<p class="muted">Пересечение не является доказанной перегрузкой: Atlas не знает ставку, рабочий календарь, фактическую доступность и тождество людей.</p></section>';
}

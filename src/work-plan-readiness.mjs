// Atlas-owned, read-only planning questions for existing Work.
// This never issues Tasks, approves Results, verifies domain delivery,
// assigns people, or creates a second schedule/Store.
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {scheduleProject} from './planning.mjs';
import {portfolioResources} from './portfolio-resources.mjs';

const inactive=new Set(['paused','cancelled']);
const priorityWeight={critical:0,high:1,normal:2,low:3};
const states={
 ready:'Нет препятствий в записанном плане',
 waiting:'Ожидает предшествующие работы или проекты',
 review:'Нужно проверить плановый ресурс',
 no_dates:'Нужна расчётная дата',
 blocked:'Приостановлена или заблокирована',
 started:'Отмечена в работе',
 reported_done:'Отмечена завершённой'
};

/**
 * Planning-only feasibility. "Ready" means no unresolved dependencies in
 * the user's current Atlas plan; never permission to start, proven supply,
 * employee availability, accepted Result, or domain execution readiness.
 * Uses the canonical CPM, cross-project forecast, and capacity projection.
 *
 * @param {any} snapshot
 * @param {string} projectId
 * @param {{portfolio?:any, resources?:any, maxRows?:number}} [options]
 */
export function projectWorkPlanReadiness(snapshot,projectId,{portfolio=null,resources=null,maxRows=4}={}){
 if(!snapshot||!Array.isArray(snapshot.projects)||!projectId||
    !Number.isSafeInteger(maxRows)||maxRows<1||maxRows>20)
  throw Error('Некорректный запрос готовности плана');
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error('Проект не найден');
 const forecast=portfolio??portfolioSchedule(snapshot);
 const current=forecast.byId.get(projectId);
 if(!current)throw Error('Нет расчёта проекта');
 const workPlan=scheduleProject(project,{calendarLibrary:snapshot.calendarLibrary??[],
  startDate:current.projectedStart??project.startDate??null});
 const resourceView=resources??((snapshot.resources??[]).length&&project.items.some(w=>w.resourceId)?
  portfolioResources(snapshot,{schedule:forecast}):null);
 const byWork=new Map(project.items.map(item=>[item.id,item]));
 const planned=new Map(workPlan.rows.map(row=>[row.id,row]));
 const resourceWork=new Map((resourceView?.work??[])
  .filter(row=>row.projectId===projectId).map(row=>[row.id,row]));
 const byProject=new Map(snapshot.projects.map(p=>[p.id,p]));
 const waitingProjects=(snapshot.portfolioLinks??[])
  .filter(link=>link.to===projectId)
  .map(link=>byProject.get(link.from))
  .filter(p=>p&&p.status!=='completed')
  .map(p=>({id:p.id,name:p.name,status:p.status}));
 const projectedUnavailable=(current.unavailableOrigins??[]).map(p=>({
  id:p.id,name:p.name,status:p.status
 }));
 const rows=project.items.map(item=>{
  const row=planned.get(item.id);
  const predecessorWorks=(row?.predecessors??[])
   .map(id=>byWork.get(id)).filter(p=>p&&p.state!=='done')
   .map(p=>({id:p.id,title:p.title,state:p.state}));
  const resource=item.resourceId?resourceView?.byId?.get(item.resourceId):null;
  const allocation=resourceWork.get(item.id);
  const outsideResource=Boolean(resource&&allocation&&allocation.startDate&&(
   resource.availableFrom&&allocation.startDate<resource.availableFrom||
   resource.availableUntil&&allocation.finishDate>resource.availableUntil));
  // Resource group conflicts are warnings for review, not a claim that this
  // particular Work caused the overload or that an employee is unavailable.
  const resourceReview=Boolean(resource&&(
   outsideResource||resource.overloadDays>0||resource.unavailableDays>0));
  let status;
  if(item.state==='done')status='reported_done';
  else if(item.state==='in_progress')status='started';
  else if(item.state==='blocked'||inactive.has(project.status))status='blocked';
  else if(predecessorWorks.length||waitingProjects.length||projectedUnavailable.length)
   status='waiting';
  else if(!current.projectedStart||!row?.startDate)status='no_dates';
  else if(resourceReview)status='review';
  else status='ready';
  const reasons=[];
  if(inactive.has(project.status))reasons.push('Проект приостановлен или отменён');
  if(item.state==='blocked')reasons.push('Работа отмечена заблокированной');
  if(predecessorWorks.length)
   reasons.push('Ждёт работ: '+predecessorWorks.map(w=>w.title).join(', '));
  if(waitingProjects.length)
   reasons.push('Ждёт проектов: '+waitingProjects.map(p=>p.name).join(', '));
  if(projectedUnavailable.length&&!waitingProjects.length)
   reasons.push('Недоступен расчёт по связанному проекту');
  if(status==='no_dates')reasons.push('Не определена расчётная дата начала');
  if(resourceReview)reasons.push('Проверить общую загрузку планового ресурса'+
   (resource?.label?': '+resource.label:''));
  return {id:item.id,title:item.title,priority:item.priority??'normal',
   status,label:states[status],predecessorWorks,waitingProjects,
   startDate:current.projectedStart?row?.startDate??null:null,
   finishDate:current.projectedStart?row?.finishDate??null:null,
   resourceReview,reasons};
 });
 const totals={
  all:rows.length,
  ready:rows.filter(row=>row.status==='ready').length,
  waiting:rows.filter(row=>row.status==='waiting').length,
  review:rows.filter(row=>row.status==='review').length,
  no_dates:rows.filter(row=>row.status==='no_dates').length,
  blocked:rows.filter(row=>row.status==='blocked').length,
  started:rows.filter(row=>row.status==='started').length,
  reported_done:rows.filter(row=>row.status==='reported_done').length
 };
 const order={waiting:0,blocked:1,review:2,no_dates:3,ready:4,started:5,reported_done:6};
 const attention=rows.filter(row=>!['reported_done','started'].includes(row.status))
  .sort((a,b)=>order[a.status]-order[b.status]||
   priorityWeight[a.priority]-priorityWeight[b.priority]||a.title.localeCompare(b.title,'ru'));
 return {projectId,revision:snapshot.revision,
  totals,rows,attention:attention.slice(0,maxRows),hiddenAttention:Math.max(0,attention.length-maxRows),
  note:'Оценка по датам, состояниям и связям Atlas. Доступность материалов, сотрудников и принятие результата определяются в соответствующей работе.'};
}

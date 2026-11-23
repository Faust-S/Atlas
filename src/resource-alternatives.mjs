// Read-only comparison over the original Atlas portfolio resources.
// A proposed planning-resource assignment is NOT proof of employee availability
// or a decision by Admin Center / a domain system.
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {portfolioResources} from './portfolio-resources.mjs';

function totals(view){
 return {
  overloadedResources:view.people.filter(p=>p.overloadDays>0).length,
  unavailableResources:view.people.filter(p=>p.unavailableDays>0).length,
  overloadResourceDays:view.people.reduce((n,p)=>n+p.overloadDays,0),
  unavailableResourceDays:view.people.reduce((n,p)=>n+p.unavailableDays,0),
  undatedWork:view.totals.undated
 };
}
function resourceStatus(group){
 if(!group)throw Error('Плановый ресурс не найден');
 return {id:group.id,label:group.label,capacityPct:group.capacityPct,
  maxLoadPct:group.maxLoadPct,overloadDays:group.overloadDays,
  unavailableDays:group.unavailableDays,undatedWork:group.undatedWork,
  itemCount:group.itemCount};
}
/**
 * Compare ONE explicit change of a Work's existing planning-resource link.
 * The hypothetical assignment is projected onto a shallow, isolated Work
 * copy. The authoritative calendar and capacity calculations remain the
 * original portfolioSchedule / portfolioResources. Applying the choice is
 * only possible through the ordinary Work editor and Native Store flow.
 * Nothing is applied to the caller's snapshot or to Native Store.
 *
 * @param {any} snapshot
 * @param {{projectId:string,workId:string,targetResourceId:string}} selection
 * @param {{schedule?:any,resources?:any}} [options]
 */
export function previewWorkResourceReassignment(snapshot,{projectId,workId,targetResourceId},
 {schedule=null,resources=null}={}){
 if(!snapshot||!Array.isArray(snapshot.projects)||!projectId||!workId||!targetResourceId)
  throw Error('Выберите работу и другой плановый ресурс');
 const project=snapshot.projects.find(p=>p.id===projectId);
 const work=project?.items?.find(item=>item.id===workId);
 const sourceId=work?.resourceId;
 if(!project||!work)throw Error('Работа не найдена');
 if(project.status==='cancelled'||work.state==='done')
  throw Error('Завершённую или отменённую работу не сравниваем');
 if(!sourceId||sourceId===targetResourceId)
  throw Error('Требуется другое действующее назначение');
 const availableIds=new Set((snapshot.resources??[]).map(x=>x.id));
 if(!availableIds.has(sourceId)||!availableIds.has(targetResourceId))
  throw Error('Плановый ресурс не найден');
 const forecast=schedule??portfolioSchedule(snapshot);
 const baseline=resources??portfolioResources(snapshot,{schedule:forecast});
 if(!baseline.byId.has(sourceId)||!baseline.byId.has(targetResourceId))
  throw Error('Нет расчёта выбранных ресурсов');
 const before=totals(baseline);
 // The comparison is read-only. Copy only the selected Work and its
 // containing project instead of cloning and validating the full portfolio.
 // Capacity values still use the single canonical portfolioResources engine.
 const candidate={...snapshot,projects:snapshot.projects.map(p=>p.id===projectId?
  {...p,items:p.items.map(item=>item.id===workId?
   {...item,resourceId:targetResourceId}:item)}:p)};
 const result=portfolioResources(candidate,{schedule:forecast});
 const after=totals(result);
 const current=baseline.work.find(row=>row.projectId===projectId&&row.id===workId);
 const alternative=result.work.find(row=>row.projectId===projectId&&row.id===workId);
 if(!current||!alternative)throw Error('Нет расчёта выбранной работы');
 return {
  kind:'RESOURCE_ASSIGNMENT_COMPARISON',
  projectId,workId,workTitle:work.title,revision:snapshot.revision,
  source:resourceStatus(baseline.byId.get(sourceId)),
  proposedSource:resourceStatus(result.byId.get(sourceId)),
  target:resourceStatus(baseline.byId.get(targetResourceId)),
  proposedTarget:resourceStatus(result.byId.get(targetResourceId)),
  original:before,alternative:after,
  overloadDaysDelta:after.overloadResourceDays-before.overloadResourceDays,
  unavailableDaysDelta:after.unavailableResourceDays-before.unavailableResourceDays,
  startDate:current.startDate,finishDate:current.finishDate,
  datesUnchanged:current.startDate===alternative.startDate&&
   current.finishDate===alternative.finishDate,
  unverified:!current.startDate||!current.finishDate,
  note:'Сравнение двух плановых назначений. Даты CPM не выравниваются по ресурсам. '+
   'Проверка реальной доступности и исполнение принадлежат исходным владельцам. '+
   'Изменения можно внести только через карточку Work и отдельно сохранить.'
 };
}

// Read-only comparison over the original Atlas portfolio resources.
// A proposed planning-resource assignment is NOT proof of employee availability
// or a decision by Admin Center / a domain system.
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {portfolioResources,projectResourceReassignment} from './portfolio-resources.mjs';

function totals(view){
 return {
  overloadedResources:view.people.filter(p=>p.overloadDays>0).length,
  unavailableResources:view.people.filter(p=>p.unavailableDays>0).length,
  overloadResourceDays:view.people.reduce((n,p)=>n+p.overloadDays,0),
  unavailableResourceDays:view.people.reduce((n,p)=>n+p.unavailableDays,0),
  overloadPctDays:view.people.reduce((n,p)=>n+p.overloadPctDays,0),
  unavailablePctDays:view.people.reduce((n,p)=>n+p.unavailablePctDays,0),
  undatedWork:view.totals.undated,
  unlinkedWork:view.totals.unlinked
 };
}

/**
 * Explain resource-level consequences, including a conflict moved from one
 * planning resource to another with no change in the portfolio total.
 * "Relieved" may be partial; only fullyCleared means the recorded constraint
 * disappears. No resource leveling or new scheduling authority is introduced.
 */
function explainShift(sourceBefore,sourceAfter,targetBefore,targetAfter,remaining){
 const assignmentAdded=sourceBefore.id===null;
 const relieved=[],introduced=[],worsened=[],severity=[];
 for(const [prior,next] of [[sourceBefore,sourceAfter],[targetBefore,targetAfter]]){
  if(prior.id===null)continue; // unlinked Work is not a virtual resource
  for(const [metric,kind] of [['overloadDays','overload'],['unavailableDays','availability']]){
   const beforeDays=prior[metric],afterDays=next[metric];
   if(afterDays<beforeDays)relieved.push({resourceId:prior.id,resourceLabel:prior.label,
    kind,days:beforeDays-afterDays,beforeDays,afterDays,fullyCleared:afterDays===0});
   if(afterDays>beforeDays){
    const record={resourceId:prior.id,resourceLabel:prior.label,kind,
     days:afterDays-beforeDays,beforeDays,afterDays};
    if(beforeDays===0)introduced.push(record);
    else worsened.push(record);
   }
  }
  for(const [metric,kind] of [['overloadPctDays','overload'],['unavailablePctDays','availability']]){
   if(prior[metric]!==next[metric])severity.push({resourceId:prior.id,resourceLabel:prior.label,
    kind,before:prior[metric],after:next[metric],delta:next[metric]-prior[metric]});
  }
 }
 const improved=Boolean(relieved.length||assignmentAdded||severity.some(s=>s.delta<0));
 const degraded=Boolean(introduced.length||worsened.length||severity.some(s=>s.delta>0));
 return {relieved,introduced,worsened,severity,remaining,assignmentAdded,
  classification:degraded?(improved?'TRADEOFF':'WORSENED'):(improved?'IMPROVED':'UNCHANGED'),
  // Even a fully clean *planning* result is not an assertion that a real
  // person, machine, or delivery slot has been committed.
  outlook:remaining.overloadResourceDays>0||remaining.unavailableResourceDays>0?
   'KNOWN_RESOURCE_CONFLICTS':remaining.undatedWork>0?'DATES_INCOMPLETE':
   remaining.unlinkedWork>0?'ASSIGNMENTS_INCOMPLETE':'NO_KNOWN_RESOURCE_CONFLICTS'};
}

// Compare known calendar forecasts with recorded control dates, not with
// simulated resource leveling. A resource reassignment alone cannot alter CPM.
function calendarDeadline(finish,due){
 const slip=finish&&due?
  Math.max(0,(Date.parse(finish+'T00:00:00Z')-Date.parse(due+'T00:00:00Z'))/86400000):null;
 return {forecastFinish:finish??null,controlDate:due??null,slipDays:slip,
  status:!finish?'FORECAST_UNKNOWN':!due?'CONTROL_DATE_UNKNOWN':
   slip>0?'CALENDAR_LATE':'CALENDAR_WITHIN_CONTROL'};
}
function resourceAssignmentControlDates(project,work,projection,current){
 if(!projection)throw Error('Расчёт сроков проекта не найден');
 const baseline=project.planBaselines?.at(-1)??null;
 return {
  work:calendarDeadline(current.finishDate,work.dueDate??null),
  project:calendarDeadline(projection.projectedFinish,project.dueDate??null),
  baseline:baseline?{name:baseline.name,forecastFinish:baseline.forecastFinish??null}:null,
  calendarForecastUnchanged:true,
  note:'Переназначение без выравнивания ресурсов не изменяет даты CPM. '+
   'Риск превышения контрольного срока остаётся, даже если плановая перегрузка уменьшилась. '+
   'Фактическая выполнимость требует отдельного подтверждения.'
 };
}

function unlinkedStatus(count){
 return {id:null,label:'Без привязки к ресурсу',capacityPct:null,maxLoadPct:null,
  overloadDays:0,unavailableDays:0,overloadPctDays:0,unavailablePctDays:0,
  peakExcessPct:0,undatedWork:null,itemCount:count};
}
function adjustedTotals(before,sourceBefore,sourceAfter,targetBefore,targetAfter){
 return {...before,
  overloadedResources:before.overloadedResources+
   Number(sourceAfter.overloadDays>0)-Number(sourceBefore.overloadDays>0)+
   Number(targetAfter.overloadDays>0)-Number(targetBefore.overloadDays>0),
  unavailableResources:before.unavailableResources+
   Number(sourceAfter.unavailableDays>0)-Number(sourceBefore.unavailableDays>0)+
   Number(targetAfter.unavailableDays>0)-Number(targetBefore.unavailableDays>0),
  overloadResourceDays:before.overloadResourceDays+sourceAfter.overloadDays-
   sourceBefore.overloadDays+targetAfter.overloadDays-targetBefore.overloadDays,
  unavailableResourceDays:before.unavailableResourceDays+sourceAfter.unavailableDays-
   sourceBefore.unavailableDays+targetAfter.unavailableDays-targetBefore.unavailableDays,
  overloadPctDays:before.overloadPctDays+sourceAfter.overloadPctDays-sourceBefore.overloadPctDays+
   targetAfter.overloadPctDays-targetBefore.overloadPctDays,
  unavailablePctDays:before.unavailablePctDays+sourceAfter.unavailablePctDays-sourceBefore.unavailablePctDays+
   targetAfter.unavailablePctDays-targetBefore.unavailablePctDays,
  unlinkedWork:before.unlinkedWork-(sourceBefore.id===null?1:0)};
}
function resourceStatus(group){
 if(!group)throw Error('Плановый ресурс не найден');
 return {id:group.id,label:group.label,capacityPct:group.capacityPct,
  maxLoadPct:group.maxLoadPct,overloadDays:group.overloadDays,
  unavailableDays:group.unavailableDays,overloadPctDays:group.overloadPctDays,
  unavailablePctDays:group.unavailablePctDays,peakExcessPct:group.peakExcessPct,undatedWork:group.undatedWork,
  itemCount:group.itemCount};
}
/**
 * Compare ONE explicit change or first assignment of a Work resource link.
 * Reuse the already calculated canonical calendar occupancy. Only the
 * affected resource groups are projected by the original capacity engine. Applying the choice is
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
 const sourceId=work?.resourceId??null;
 if(!project||!work)throw Error('Работа не найдена');
 if(project.status==='cancelled'||work.state==='done')
  throw Error('Завершённую или отменённую работу не сравниваем');
 if(sourceId===targetResourceId)
  throw Error('Требуется другое действующее назначение');
 const availableIds=new Set((snapshot.resources??[]).map(x=>x.id));
 if((sourceId!==null&&!availableIds.has(sourceId))||!availableIds.has(targetResourceId))
  throw Error('Плановый ресурс не найден');
 const forecast=schedule??portfolioSchedule(snapshot);
 const baseline=resources??portfolioResources(snapshot,{schedule:forecast});
 if((sourceId!==null&&!baseline.byId.has(sourceId))||!baseline.byId.has(targetResourceId))
  throw Error('Нет расчёта выбранных ресурсов');
 const before=totals(baseline);
 const result=projectResourceReassignment(baseline,{projectId,workId,targetResourceId});
 const {current,alternative}=result;
 if(current.resourceId!==sourceId)throw Error('Ресурсный прогноз устарел');
 const sourceBefore=result.source?resourceStatus(result.source):unlinkedStatus(before.unlinkedWork);
 const sourceAfter=result.sourceAfter?resourceStatus(result.sourceAfter):unlinkedStatus(before.unlinkedWork-1);
 const targetBefore=resourceStatus(result.target);
 const targetAfter=resourceStatus(result.targetAfter);
 const after=adjustedTotals(before,sourceBefore,sourceAfter,targetBefore,targetAfter);
 return {
  kind:'RESOURCE_ASSIGNMENT_COMPARISON',
  projectId,workId,workTitle:work.title,revision:snapshot.revision,
  source:sourceBefore,proposedSource:sourceAfter,
  target:targetBefore,proposedTarget:targetAfter,
  original:before,alternative:after,
  controlDates:resourceAssignmentControlDates(project,work,forecast.byId.get(projectId),current),
  constraints:explainShift(sourceBefore,sourceAfter,targetBefore,targetAfter,after),
  overloadDaysDelta:after.overloadResourceDays-before.overloadResourceDays,
  unavailableDaysDelta:after.unavailableResourceDays-before.unavailableResourceDays,
  overloadPctDaysDelta:after.overloadPctDays-before.overloadPctDays,
  unavailablePctDaysDelta:after.unavailablePctDays-before.unavailablePctDays,
  startDate:current.startDate,finishDate:current.finishDate,
  datesUnchanged:current.startDate===alternative.startDate&&
   current.finishDate===alternative.finishDate,
  unverified:!current.startDate||!current.finishDate,
  note:'Сравнение плановых назначений. Даты CPM не выравниваются по ресурсам. '+
   'Проверка реальной доступности и исполнение принадлежат исходным владельцам. '+
   'Изменения можно внести только через карточку Work и отдельно сохранить.'
 };
}

/**
 * Preserve an explicit resource comparison as a one-time Work editor choice.
 * The proposal has no authority: its target remains a local form value until
 * the user applies the ordinary Work edit and separately saves Native Store.
 */
export function assertResourceEditorChoiceCurrent(snapshot,choice){
 if(!snapshot||!choice||!Array.isArray(snapshot.projects)||
    snapshot.revision!==choice.revision||!choice.projectId||!choice.workId||
    (choice.sourceResourceId!==null&&!choice.sourceResourceId)||!choice.targetResourceId||
    choice.sourceResourceId===choice.targetResourceId)
  throw Error('Ресурсный вариант устарел. Повторите сравнение.');
 const project=snapshot.projects.find(p=>p.id===choice.projectId);
 const work=project?.items?.find(w=>w.id===choice.workId);
 if(!work||project.status==='cancelled'||work.state==='done'||
    (work.resourceId??null)!==choice.sourceResourceId)
  throw Error('Назначение Work изменилось. Повторите сравнение.');
 const source=(snapshot.resources??[]).find(r=>r.id===choice.sourceResourceId);
 const target=(snapshot.resources??[]).find(r=>r.id===choice.targetResourceId);
 if((choice.sourceResourceId!==null&&!source)||!target)
  throw Error('Плановый ресурс изменился. Повторите сравнение.');
 return {...choice,sourceLabel:source?.label??'Без привязки к ресурсу',targetLabel:target.label};
}

/** Turn a previously calculated read-only comparison into a form-only choice. */
export function prepareResourceEditorChoice(snapshot,comparison){
 if(comparison?.kind!=='RESOURCE_ASSIGNMENT_COMPARISON'||
    (comparison.source?.id!==null&&!comparison.source?.id)||!comparison.target?.id)
  throw Error('Нет рассчитанного ресурсного варианта');
 return assertResourceEditorChoiceCurrent(snapshot,{
  projectId:comparison.projectId,workId:comparison.workId,
  revision:comparison.revision,
  sourceResourceId:comparison.source.id,targetResourceId:comparison.target.id
 });
}

/**
 * Compare an explicitly chosen Work against an entire page of EXISTING
 * planning resources. Every comparison uses the same schedule and baseline
 * resource projection. Pages bound the amount of authoritative recalculation
 * even when the portfolio has many resources.
 *
 * Results are ordered by label, not by a fabricated "optimal" ranking.
 * No choice is made, applied, or saved by this function.
 */
export function compareWorkResourceAlternatives(snapshot,
 {projectId,workId,offset=0,limit=6}, {schedule=null,resources=null}={}){
 if(!snapshot||!Array.isArray(snapshot.projects)||!projectId||!workId)
  throw Error('Выберите работу для сравнения');
 if(!Number.isSafeInteger(offset)||offset<0||
    !Number.isSafeInteger(limit)||limit<1||limit>12)
  throw Error('Некорректная страница ресурсных вариантов');
 const project=snapshot.projects.find(p=>p.id===projectId);
 const work=project?.items?.find(item=>item.id===workId);
 if(!work)throw Error('Работа не найдена');
 if(project.status==='cancelled'||work.state==='done')
  throw Error('Завершённую или отменённую работу не сравниваем');
 const all=snapshot.resources??[];
 if(work.resourceId&&!all.some(r=>r.id===work.resourceId))
  throw Error('Исходный плановый ресурс не найден');
 const alternatives=all.filter(r=>r.id!==work.resourceId).sort((a,b)=>
  a.label.localeCompare(b.label,'ru')||a.id.localeCompare(b.id));
 const forecast=schedule??portfolioSchedule(snapshot);
 const baseline=resources??portfolioResources(snapshot,{schedule:forecast});
 const options=alternatives.slice(offset,offset+limit).map(target=>
  previewWorkResourceReassignment(snapshot,{projectId,workId,targetResourceId:target.id},
   {schedule:forecast,resources:baseline}));
 return {kind:'RESOURCE_ASSIGNMENT_OPTIONS',projectId,workId,workTitle:work.title,
  revision:snapshot.revision,sourceResourceId:work.resourceId??null,
  candidateCount:alternatives.length,offset,limit,
  options,original:totals(baseline),
  // A list of alternatives is not a ranked recommendation or a promise
  // that resource choice alone can achieve a project's deadline.
  note:'Сопоставление плановых вариантов без переноса дат CPM и без сохранения. '+
   'Решение принимает пользователь в редакторе Work.'};
}

// User-selected ordering of two genuinely conflicting Works in one project.
// This is a read-only what-if using the existing connect(), canonical CPM,
// portfolio forecast and capacity projection. No leveling engine, task,
// cross-project Work dependency, execution permission or new Store.
import {connect} from './core.mjs';
import {scheduleProject,scheduleChangeSummary} from './planning.mjs';
import {portfolioSchedule,portfolioScheduleChangeSummary} from './portfolio-schedule.mjs';
import {portfolioResources,resourceOverloadContainsPair,planningResourceTotals as resourceTotals,comparePlanningResourceGroups as changedGroups} from './portfolio-resources.mjs';

const plannedWork=w=>w&&['todo','blocked'].includes(w.state)&&
 !w.actualStartDate&&!w.actualFinishDate;
function pairInSnapshot(snapshot,projectId,firstWorkId,secondWorkId){
 if(!snapshot||!Array.isArray(snapshot.projects)||!projectId||!firstWorkId||
    !secondWorkId||firstWorkId===secondWorkId)
  throw Error('Выберите две разные работы одного проекта');
 const project=snapshot.projects.find(p=>p.id===projectId);
 const first=project?.items?.find(w=>w.id===firstWorkId);
 const second=project?.items?.find(w=>w.id===secondWorkId);
 if(!project||!first||!second)throw Error('Работы одного проекта не найдены');
 if(!['planned','active'].includes(project.status)||!plannedWork(first)||!plannedWork(second))
  throw Error('Порядок можно сравнивать только для ещё не начатых работ действующего плана');
 const resourceId=first.resourceId??null;
 if(!resourceId||second.resourceId!==resourceId||
    !(snapshot.resources??[]).some(r=>r.id===resourceId))
  throw Error('У выбранных работ нет общего планового ресурса');
 return {project,first,second,resourceId};
}
function plannedDates(plan,id){
 const w=plan.rows.find(r=>r.id===id);
 if(!w)throw Error('Работа отсутствует в расчёте');
 return {start:w.startDate??null,finish:w.finishDate??null,critical:w.critical,
  dueDate:w.dueDate??null,slip:w.dueDate&&w.finishDate?
   Math.max(0,(Date.parse(w.finishDate+'T00:00:00Z')-Date.parse(w.dueDate+'T00:00:00Z'))/86400000):null};
}
function direction(snapshot,pair,from,to,baseline,beforeResources,beforePlan){
 const {project,resourceId}=pair;
 const identity={kind:'RESOURCE_SEQUENCE_OPTION',revision:snapshot.revision,
  projectId:project.id,resourceId,from:from.id,to:to.id,fromTitle:from.title,toTitle:to.title};
 try{
  // connect() owns validation (including the DAG) and clones the original
  // domain snapshot. This ephemeral candidate is never returned for saving.
  const candidate=connect(snapshot,project.id,from.id,to.id);
  const forecast=portfolioSchedule(candidate);
  const afterProject=forecast.byId.get(project.id);
  const projected=candidate.projects.find(p=>p.id===project.id);
  const afterPlan=scheduleProject(projected,{calendarLibrary:candidate.calendarLibrary??[],
   startDate:afterProject.projectedStart??project.startDate??null});
  const afterResources=portfolioResources(candidate,{schedule:forecast});
  const old=baseline.byId.get(project.id),before=resourceTotals(beforeResources),after=resourceTotals(afterResources);
  const changes=changedGroups(beforeResources,afterResources);
  const affected=scheduleChangeSummary(beforePlan,afterPlan,{limit:5});
  const portfolio=portfolioScheduleChangeSummary(baseline,forecast,project.id);
  const sourceBefore=beforeResources.byId.get(resourceId),sourceAfter=afterResources.byId.get(resourceId);
  const fromBefore=plannedDates(beforePlan,from.id),fromAfter=plannedDates(afterPlan,from.id);
  const toBefore=plannedDates(beforePlan,to.id),toAfter=plannedDates(afterPlan,to.id);
  const unknown=after.undated>0||!afterProject.projectedFinish||portfolio.undatedTotal>0;
  return {...identity,valid:true,before,after,
   overloadDelta:after.overloadDays-before.overloadDays,
   availabilityDelta:after.unavailableDays-before.unavailableDays,
   overloadDepthDelta:after.overloadPctDays-before.overloadPctDays,
   availabilityDepthDelta:after.unavailablePctDays-before.unavailablePctDays,
   source:{label:sourceBefore.label,overloadBefore:sourceBefore.overloadDays,
    overloadAfter:sourceAfter.overloadDays,availabilityBefore:sourceBefore.unavailableDays,
    availabilityAfter:sourceAfter.unavailableDays,peakBefore:sourceBefore.maxLoadPct,peakAfter:sourceAfter.maxLoadPct},
   fromBefore,fromAfter,toBefore,toAfter,affected,portfolio,
   project:{beforeFinish:old.projectedFinish??null,afterFinish:afterProject.projectedFinish??null,
    dueDate:project.dueDate??null,beforeSlip:old.deadlineSlipDays??null,
    afterSlip:afterProject.deadlineSlipDays??null},
   resourcesChanged:changes.length,worsenedResources:changes.filter(r=>r.worsened).length,
   improvedResources:changes.filter(r=>r.improved).length,
   resourceExamples:changes.slice(0,6),unknown,
   note:'Это вариант явного порядка работ, а не автоматическое выравнивание. '+
    'Проверьте, допустимо ли такое предшествование по технологии. Длительности, контрольные сроки, '+
    'ресурсные назначения и фактические данные не меняются.'};
 }catch(error){
  return {...identity,valid:false,reason:error instanceof Error?error.message:'Расчёт порядка недоступен'};
 }
}

/**
 * @param {any} snapshot
 * @param {{projectId:string,firstWorkId:string,secondWorkId:string}} selection
 * @param {{schedule?:any,resources?:any}} [options]
 */
export function compareResourceSequenceAlternatives(snapshot,{projectId,firstWorkId,secondWorkId},
 {schedule=null,resources=null}={}){
 const pair=pairInSnapshot(snapshot,projectId,firstWorkId,secondWorkId);
 const baseline=schedule??portfolioSchedule(snapshot);
 const old=baseline.byId.get(projectId);
 if(!old?.projectedStart||!old.projectedFinish)throw Error('Для сравнения порядка нужны расчётные даты проекта');
 const resourceView=resources??portfolioResources(snapshot,{schedule:baseline});
 const group=resourceView.byId.get(pair.resourceId);
 if(!resourceOverloadContainsPair(group,projectId,firstWorkId,secondWorkId))
  throw Error('Выбранные работы не пересекаются в известном периоде перегрузки');
 const beforePlan=scheduleProject(pair.project,{calendarLibrary:snapshot.calendarLibrary??[],
  startDate:old.projectedStart});
 const alternatives=[direction(snapshot,pair,pair.first,pair.second,baseline,resourceView,beforePlan),
  direction(snapshot,pair,pair.second,pair.first,baseline,resourceView,beforePlan)];
 return {kind:'RESOURCE_SEQUENCE_ALTERNATIVES',projectId,resourceId:pair.resourceId,
  revision:snapshot.revision,alternatives,
  note:'Сравниваются только две явно выбранные работы одного проекта. '+
   'Межпроектные конфликты требуют пересмотра исходных планов, а не искусственной связи проектов.'};
}

/** Keep the explicit proposed edge in the existing dependency form only. */
export function assertResourceSequenceChoiceCurrent(snapshot,choice){
 if(!snapshot||!choice||snapshot.revision!==choice.revision||
    choice.kind!=='RESOURCE_SEQUENCE_OPTION'||choice.valid!==true)
  throw Error('Вариант порядка устарел. Повторите сравнение.');
 const pair=pairInSnapshot(snapshot,choice.projectId,choice.from,choice.to);
 if(pair.resourceId!==choice.resourceId||
    pair.project.dependencies.some(e=>e.from===choice.from&&e.to===choice.to))
  throw Error('Работы или их связи изменились. Повторите сравнение.');
 return {...choice,fromTitle:pair.first.title,toTitle:pair.second.title};
}
export function prepareResourceSequenceChoice(snapshot,choice){
 const current=assertResourceSequenceChoiceCurrent(snapshot,choice);
 // Recheck the exact current portfolio rather than trusting a stale result
 // that might have the same revision after an independent archive import.
 const result=compareResourceSequenceAlternatives(snapshot,{projectId:current.projectId,
  firstWorkId:current.from,secondWorkId:current.to});
 const fresh=result.alternatives[0];
 if(!fresh.valid)throw Error(fresh.reason);
 return {kind:fresh.kind,valid:true,revision:fresh.revision,projectId:fresh.projectId,
  resourceId:fresh.resourceId,from:fresh.from,to:fresh.to,
  fromTitle:fresh.fromTitle,toTitle:fresh.toTitle};
}

// Read-only handoff to organizational consumers such as Admin Center.
// Atlas owns the plan. Neither this projection nor a WorkRef grants access,
// confirms an employee's availability, issues a Task, or accepts a Result.
import {validate} from './core.mjs';
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {projectWorkPlanReadiness} from './work-plan-readiness.mjs';
import {atlasT3ProjectResultLinks} from './atlas-t3-native-recipient.mjs';

/**
 * Selected project only. Use the original calendar-aware portfolio forecast
 * and the original Work readiness and resource-conflict calculation.
 * The return value is plain, detached data; no persisted or mutable plan.
 * @param {any} snapshot
 * @param {string} projectId
 * @param {{corporateScope?:{organizationId:string,workspaceId:string|null}|null}} [options]
 */
export function organizationPlanProjection(snapshot,projectId,{corporateScope=null}={}){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error('ATLAS_PROJECT_NOT_FOUND');
 const portfolio=portfolioSchedule(snapshot);
 const forecast=portfolio.byId.get(projectId);
 const readiness=projectWorkPlanReadiness(snapshot,projectId,{portfolio});
 const works=new Map(project.items.map(w=>[w.id,w]));
 const resources=new Map((snapshot.resources??[]).map(r=>[r.id,r]));
 const resultLinks=new Map();
 for(const link of atlasT3ProjectResultLinks(project,{corporateScope})){
  if(!resultLinks.has(link.workId))resultLinks.set(link.workId,[]);
  // Center's planning projection contains references only, never the
  // original selected Result text or a claim of current authorization.
  resultLinks.get(link.workId).push({taskId:link.taskId,resultId:link.resultId,
   decisionId:link.decisionId,sourceRevision:link.sourceRevision,
   receivedAt:link.receivedAt,signedFileMode:link.signedFileMode,
   hasContent:link.portableSelectedSummary,
   targetLinks:link.targetLinks.map(t=>({id:t.id,title:t.title,observationCount:t.observationCount}))});
 }
 return {
  source:'atlas.project/1',
  projectId,
  revision:String(snapshot.revision),
  plannedStart:forecast.declaredStart,
  projectedStart:forecast.projectedStart,
  projectedFinish:forecast.projectedFinish,
  deadline:forecast.deadline,
  deadlineSlipDays:forecast.deadlineSlipDays,
  needsReview:forecast.needsReview,
  totals:{...readiness.totals},
  works:readiness.rows.map(row=>{
   const work=works.get(row.id);
   const resource=resources.get(work.resourceId);
   return {...row,
    assignee:work.assignee??'',
    resultLinks:resultLinks.get(row.id)??[],
    resource:resource?{id:resource.id,label:resource.label,
     allocationPct:work.allocationPct??100}:null};
  }),
  note:readiness.note
 };
}

// Compare the original saved plan with a later observed plan, using exactly
// the same Atlas scheduling engine in both editions. Actual dates are only
// the dates recorded in Atlas, never inferred from a received Result.
/** @param {any} current
 * @param {any|null} original
 * @param {{projectId:string,workId:string,revision:string}} ref */
export function organizationWorkEditionComparison(current,original,ref){
 validate(current);
 if(!ref||typeof ref.projectId!=='string'||!ref.projectId||
    typeof ref.workId!=='string'||!ref.workId||
    typeof ref.revision!=='string'||!/^(0|[1-9][0-9]*)$/.test(ref.revision)||
    !Number.isSafeInteger(Number(ref.revision)))throw Error('ATLAS_WORK_REFERENCE_INVALID');
 if(original!==null){
   validate(original);
   if(String(original.revision)!==ref.revision)
     throw Error('ATLAS_HISTORY_EDITION_MISMATCH');
 }
 function edition(snapshot){
   if(!snapshot)return null;
   const project=snapshot.projects.find(p=>p.id===ref.projectId);
   const work=project?.items.find(w=>w.id===ref.workId);
   const revision=String(snapshot.revision);
   if(!project)return {revision,status:'PROJECT_MISSING',work:null};
   if(!work)return {revision,status:'WORK_MISSING',work:null};
   const plan=organizationPlanProjection(snapshot,project.id);
   const row=plan.works.find(w=>w.id===ref.workId);
   const predecessors=project.dependencies.filter(d=>d.to===work.id)
     .map(d=>d.from).sort();
   const successors=project.dependencies.filter(d=>d.from===work.id)
     .map(d=>d.to).sort();
   return {revision,status:'FOUND',work:{
      title:work.title,state:work.state,priority:work.priority,
      dueDate:work.dueDate??null,estimateDays:work.estimateDays??1,
      plannedStart:row?.startDate??null,plannedFinish:row?.finishDate??null,
      actualStart:work.actualStartDate??null,actualFinish:work.actualFinishDate??null,
      assignee:work.assignee??'',resource:row?.resource??null,
      predecessors,successors,projectedProjectFinish:plan.projectedFinish,
      deadlineSlipDays:plan.deadlineSlipDays
   }};
 }
 const before=edition(original),after=original===current?before:edition(current);
 const old=before?.work,now=after?.work;
 const changedFields=old&&now?Object.keys(old).filter(key=>
   JSON.stringify(old[key])!==JSON.stringify(now[key])):[];
 return {sourceRevision:ref.revision,original:before,current:after,
   changedFields,originalStatus:before?.status??'NOT_RETAINED'};
}

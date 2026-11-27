// Read-only handoff to organizational consumers such as Admin Center.
// Atlas owns the plan. Neither this projection nor a WorkRef grants access,
// confirms an employee's availability, issues a Task, or accepts a Result.
import {validate} from './core.mjs';
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {projectWorkPlanReadiness} from './work-plan-readiness.mjs';

/**
 * Selected project only. Use the original calendar-aware portfolio forecast
 * and the original Work readiness and resource-conflict calculation.
 * The return value is plain, detached data; no persisted or mutable plan.
 * @param {any} snapshot
 * @param {string} projectId
 */
export function organizationPlanProjection(snapshot,projectId){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error('ATLAS_PROJECT_NOT_FOUND');
 const portfolio=portfolioSchedule(snapshot);
 const forecast=portfolio.byId.get(projectId);
 const readiness=projectWorkPlanReadiness(snapshot,projectId,{portfolio});
 const works=new Map(project.items.map(w=>[w.id,w]));
 const resources=new Map((snapshot.resources??[]).map(r=>[r.id,r]));
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
    resource:resource?{id:resource.id,label:resource.label,
     allocationPct:work.allocationPct??100}:null};
  }),
  note:readiness.note
 };
}

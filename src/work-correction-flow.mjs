// Read-only comparison context for successive edits to affected work.
// It is UI state only: no Store changes, revision rewrites or second scheduler.
import {scheduleProject,scheduleChangeSummary} from "./planning.mjs";
import {portfolioSchedule,portfolioScheduleChangeSummary} from "./portfolio-schedule.mjs";

/**
 * @param {{projectId:string|null,workId:string,revision:number,beforePlan:any,
 *  afterPlan:any,beforePortfolio?:any,afterPortfolio?:any}} options
 */
export function startWorkCorrection({projectId,workId,revision,beforePlan,afterPlan,
 beforePortfolio=null,afterPortfolio=null}){
 if(!projectId||!workId||!Number.isSafeInteger(revision))
  throw Error("Invalid work correction context");
 return {
  projectId,workId,revision,days:beforePlan.durationDays,baseline:beforePlan,
  change:scheduleChangeSummary(beforePlan,afterPlan),followups:[],
  // The initial portfolio state belongs to this in-memory correction series,
  // not to Native Store or a new control plan.
  portfolioBaseline:beforePortfolio&&afterPortfolio?beforePortfolio:null,
  portfolioChange:beforePortfolio&&afterPortfolio?
   portfolioScheduleChangeSummary(beforePortfolio,afterPortfolio,projectId):null
 };
}

// Only extend a session for an actually affected work at the exact current
// revision. An unrelated edit or a new project must start a fresh comparison.
/**
 * @param {any} context
 * @param {{projectId:string|null,workId:string,revision:number,nextRevision:number,
 *  afterPlan:any,recordCorrection?:boolean,afterPortfolio?:any}} options
 */
export function continueWorkCorrection(context,{projectId,workId,revision,nextRevision,afterPlan,
 recordCorrection=true,afterPortfolio=null}){
 if(!context||context.projectId!==projectId||context.revision!==revision||
    !context.change?.affectedIds.includes(workId)||!context.baseline||
    !Number.isSafeInteger(nextRevision)||nextRevision<=revision)return null;
 return {
  ...context,revision:nextRevision,
  change:scheduleChangeSummary(context.baseline,afterPlan),
  portfolioChange:context.portfolioBaseline&&afterPortfolio?
   portfolioScheduleChangeSummary(context.portfolioBaseline,afterPortfolio,projectId):
   context.portfolioChange??null,
  // Assignee/state-only edits advance the revision but are not schedule
  // corrections. Keep the initial comparison without falsely counting one.
  followups:recordCorrection?
   [...new Set([...(context.followups||[]),workId])]:[...(context.followups||[])]
 };
}

/**
 * Remember a user-initiated cross-project visit, not a new routing engine.
 * The route and its source comparison live only in the mounted Atlas UI.
 * @param {any} snapshot
 * @param {any} correction
 * @param {{sourceWorkId:string,linkedProjectId:string,
 *  sourceTab?:"overview"|"work"|"board"|"timeline"|"graph"|"reality"|
 *   "changes"|"resources"|"history"|"sources",
 *  sourceWorkKind?:"created"|"dependency"|"adjusted"}} options
 */
export function beginCrossProjectWorkReturn(snapshot,correction,{
 sourceWorkId,sourceTab="timeline",linkedProjectId,sourceWorkKind="adjusted"
}){
 if(!snapshot||!correction||!sourceWorkId||!linkedProjectId||
    snapshot.revision!==correction.revision||
    !Array.isArray(snapshot.projects)||
    !["overview","work","board","timeline","graph","reality","changes",
      "resources","history","sources"].includes(sourceTab)||
    !correction.portfolioChange?.rows?.some(row=>row.id===linkedProjectId))return null;
 const source=snapshot.projects.find(row=>row.id===correction.projectId);
 const target=snapshot.projects.find(row=>row.id===linkedProjectId);
 if(!source||!target||!source.items?.some(row=>row.id===sourceWorkId)||
    (sourceWorkId!==correction.workId&&
     !correction.change?.affectedIds?.includes(sourceWorkId)&&
     !correction.followups?.includes(sourceWorkId)))return null;
 return {
  sourceProjectId:source.id,sourceWorkId,linkedProjectId,
  sourceTab,
  sourceWorkKind,revision:snapshot.revision,correction
 };
}

/**
 * Continue the same source comparison after an explicit edit of a Work in
 * the visited downstream project. Both plans use the existing Atlas engines.
 * No project is edited and no intermediate result is persisted.
 */
export function advanceCrossProjectWorkReturn(route,{
 beforeSnapshot,afterSnapshot,editedProjectId,editedWorkId,
 recordCorrection=true,afterPortfolio=null
 }){
 if(!route||!beforeSnapshot||!afterSnapshot||
    route.revision!==beforeSnapshot.revision||
    route.correction?.revision!==beforeSnapshot.revision||
    editedProjectId!==route.linkedProjectId||
    !editedWorkId||afterSnapshot.revision<=beforeSnapshot.revision||
    !route.correction.portfolioBaseline)return route;
 const source=afterSnapshot.projects?.find(row=>row.id===route.sourceProjectId);
 const linked=afterSnapshot.projects?.find(row=>row.id===editedProjectId);
 if(!source?.items?.some(row=>row.id===route.sourceWorkId)||
    !linked?.items?.some(row=>row.id===editedWorkId))return route;
 const context=route.correction;
 const updatedSourcePlan=scheduleProject(source,{
  calendarLibrary:afterSnapshot.calendarLibrary??[]});
 const forecast=afterPortfolio??portfolioSchedule(afterSnapshot);
 const linkedFollowups=recordCorrection?
  [...(context.linkedFollowups??[]),{projectId:editedProjectId,workId:editedWorkId}]:
  [...(context.linkedFollowups??[])];
 const nextCorrection={...context,revision:afterSnapshot.revision,
  change:scheduleChangeSummary(context.baseline,updatedSourcePlan),
  portfolioChange:portfolioScheduleChangeSummary(
   context.portfolioBaseline,forecast,route.sourceProjectId),
  linkedFollowups};
 return {...route,revision:afterSnapshot.revision,correction:nextCorrection};
}

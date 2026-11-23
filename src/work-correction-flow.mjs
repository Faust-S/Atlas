// Read-only comparison context for successive edits to affected work.
// It is UI state only: no Store changes, revision rewrites or second scheduler.
import {scheduleChangeSummary} from "./planning.mjs";
import {portfolioScheduleChangeSummary} from "./portfolio-schedule.mjs";

/**
 * @param {{projectId:string,workId:string,revision:number,beforePlan:any,
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
 * @param {{projectId:string,workId:string,revision:number,nextRevision:number,
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

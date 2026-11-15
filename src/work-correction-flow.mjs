// Read-only comparison context for successive edits to affected work.
// It is UI state only: no Store changes, revision rewrites or second scheduler.
import {scheduleChangeSummary} from "./planning.mjs";

export function startWorkCorrection({projectId,workId,revision,beforePlan,afterPlan}){
 if(!projectId||!workId||!Number.isSafeInteger(revision))
  throw Error("Invalid work correction context");
 return {
  projectId,workId,revision,days:beforePlan.durationDays,baseline:beforePlan,
  change:scheduleChangeSummary(beforePlan,afterPlan),followups:[]
 };
}

// Only extend a session for an actually affected work at the exact current
// revision. An unrelated edit or a new project must start a fresh comparison.
export function continueWorkCorrection(context,{projectId,workId,revision,nextRevision,afterPlan,
 recordCorrection=true}){
 if(!context||context.projectId!==projectId||context.revision!==revision||
    !context.change?.affectedIds.includes(workId)||!context.baseline||
    !Number.isSafeInteger(nextRevision)||nextRevision<=revision)return null;
 return {
  ...context,revision:nextRevision,
  change:scheduleChangeSummary(context.baseline,afterPlan),
  // Assignee/state-only edits advance the revision but are not schedule
  // corrections. Keep the initial comparison without falsely counting one.
  followups:recordCorrection?
   [...new Set([...(context.followups||[]),workId])]:[...(context.followups||[])]
 };
}

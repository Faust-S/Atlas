// Read-only Work context for the standalone Atlas inspector.
// Canonical baseline comparison, deadline explanations and project history
// are computed by their existing owners and passed into this projection.
// No new CPM, Store, evidence model, or inferred acceptance is created.
import {projectHistoryRows} from "./history-view.mjs";

/**
 * Return the selected Work's linked data without changing the project.
 * Historical findings link to Work only when workId is explicit; an
 * unassigned finding on a Work target is identified as shared-target context.
 * Decisions must reference the Work's changeId, not just mention its title.
 *
 * @param {any} project
 * @param {any|null} plan
 * @param {string} workId
 * @param {{comparison?:any|null,deadlineRisks?:Map<string,any>|null,resources?:any[]}} [options]
 */
export function inspectorWorkContext(project,plan,workId,{
 comparison=null,deadlineRisks=null,resources=[]
}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.dependencies))
  throw Error("Invalid Atlas inspector project");
 const work=project.items.find(item=>item.id===workId);
 if(!work)return null;
 const byId=new Map(project.items.map(item=>[item.id,item]));
 const row=(plan?.rows??[]).find(item=>item.id===workId)??null;
 const baselineRow=comparison?.rows?.find(item=>item.id===workId)??null;
 const relatedChange=work.changeId?
  (project.changes??[]).find(change=>change.id===work.changeId)??null:null;
 const predecessorIds=project.dependencies.filter(link=>link.to===workId).map(link=>link.from);
 const successorIds=project.dependencies.filter(link=>link.from===workId).map(link=>link.to);
 const predecessors=predecessorIds.map(id=>byId.get(id)).filter(Boolean);
 const successors=successorIds.map(id=>byId.get(id)).filter(Boolean);
 const targetIds=new Set(work.targetIds??[]);
 const findingScope=new Map();
 for(const finding of project.findings??[]){
  if(finding.workId===workId)findingScope.set(finding.id,"work");
  else if(finding.workId==null&&targetIds.has(finding.targetId))
   findingScope.set(finding.id,"shared_target");
 }
 const decisionIds=new Set((project.decisions??[])
  .filter(decision=>relatedChange&&decision.changeId===relatedChange.id)
  .map(decision=>decision.id));
 const history=projectHistoryRows(project).filter(item=>
  (item.kind==="finding"&&findingScope.has(item.id))||
  (item.kind==="decision"&&decisionIds.has(item.id))
 ).map(item=>({...item,scope:item.kind==="decision"?"change":findingScope.get(item.id)}));
 return {
  work,row,
  baseline:comparison?.baseline??null,baselineRow,
  deadline:deadlineRisks?.get(workId)??null,
  predecessors,successors,relatedChange,
  source:work.sourceId?(project.sources??[]).find(source=>source.id===work.sourceId)??null:null,
  resource:work.resourceId?resources.find(resource=>resource.id===work.resourceId)??null:null,
  history
 };
}

/**
 * Page existing inspector links and history without limiting accessible records.
 * Read-only: no Work, Store, CPM or T3 state is modified.
 * @param {any[]} rows
 * @param {number} requestedPage
 * @param {number} [pageSize]
 */
export function inspectorPagedRows(rows,requestedPage,pageSize=6){
 if(!Array.isArray(rows)||!Number.isInteger(requestedPage)||requestedPage<0||
  !Number.isInteger(pageSize)||pageSize<1)
  throw Error("Invalid Atlas inspector page");
 const total=rows.length;
 const pages=Math.max(1,Math.ceil(total/pageSize));
 const page=Math.min(requestedPage,pages-1);
 const start=page*pageSize;
 const end=Math.min(start+pageSize,total);
 return {items:rows.slice(start,end),page,pages,total,start,end};
}

/**
 * Read-only projection of the existing successive Work correction. The
 * original scheduleChangeSummary remains the only impact calculation.
 */
export function inspectorRecentCorrection(project,revision,selectedWorkId,context,localPlan){
 if(!project||!Array.isArray(project.items)||!context||!localPlan||
   context.projectId!==project.id||context.revision!==revision||
   !Number.isSafeInteger(localPlan.durationDays)||
   !Number.isSafeInteger(context.days)||
   !context.change||!Array.isArray(context.change.affectedIds)||
   !Array.isArray(context.change.examples))return null;
 const root=project.items.find(item=>item.id===context.workId);
 const selected=project.items.find(item=>item.id===selectedWorkId);
 const followupIds=Array.isArray(context.followups)?context.followups:[];
 // Cross-project corrections are an in-memory continuation of this Work.
 // Preserve their identifiers in the read-only projection: the source of
 // truth is the correction session, not the inspector's local Work list.
 const linkedFollowups=Array.isArray(context.linkedFollowups)?
  context.linkedFollowups.filter(entry=>entry&&typeof entry.projectId==="string"&&
   typeof entry.workId==="string"&&entry.projectId!==project.id&&
   entry.projectId.length>0&&entry.workId.length>0)
   .map(entry=>({projectId:entry.projectId,workId:entry.workId})):[];
 if(!root||!selected||(root.id!==selectedWorkId&&
    !context.change.affectedIds.includes(selectedWorkId)&&
    !followupIds.includes(selectedWorkId)))return null;
 const byId=new Map(project.items.map(item=>[item.id,item]));
 const examples=context.change.examples
  .filter(item=>byId.has(item.id))
  .map(item=>({...item,title:byId.get(item.id).title}));
 return {
  projectId:project.id,revision,rootId:root.id,rootTitle:root.title,
  beforeDays:context.days,afterDays:localPlan.durationDays,
  followupCount:followupIds.length,followupIds:[...followupIds],
  linkedFollowups,linkedFollowupCount:linkedFollowups.length,
  change:{...context.change,examples},
  // Already computed by the original portfolioSchedule; never recalculate in UI.
  portfolioChange:context.portfolioChange??null
 };
}

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

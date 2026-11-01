// Project impact projection: known source revisions -> affected requirements -> planned actions.
// This is a read-only view, never a verifier, executor, or authority resolver.
import {compareProject} from "./trace.mjs";
const bad=new Set(["unknown","conflict","stale","gap_reported","partial_reported"]);
export function projectImpact(project,options={}){
 const trace=compareProject(project,options);
 const itemsByTarget=new Map();
 for(const work of project.items||[])for(const id of work.targetIds||[]){
  if(!itemsByTarget.has(id))itemsByTarget.set(id,[]);
  itemsByTarget.get(id).push(work);
 }
 const rows=trace.rows.map(row=>{
  const source=project.sources.find(s=>s.id===row.latest?.sourceId)||null;
  const work=itemsByTarget.get(row.id)||[];
  const openWork=work.filter(w=>w.state!=="done");
  const priority=row.intent==="committed"&&(bad.has(row.assessment)||row.assessment==="test_claim"||row.assessment==="implemented_claim"||row.assessment==="acceptance_claim"&&row.freshness.state!=="current_revision");
  const reasons=[];
  if(row.assessment==="stale")reasons.push(row.freshness.note);
  if(row.assessment==="conflict")reasons.push("Противоречивые сведения");
  if(row.assessment==="unknown")reasons.push("Нет заявленного факта");
  if(row.assessment==="gap_reported"||row.assessment==="partial_reported")reasons.push("Заявлен разрыв относительно цели");
  if(["implemented_claim","test_claim","acceptance_claim"].includes(row.assessment))reasons.push("Результат заявлен, но не подтверждён независимой приёмкой");
  if(openWork.length)reasons.push("Связанные незавершённые работы: "+openWork.length);
  const sourceDelta=source?.summary?.changes;
  const ref=row.latest?.ref;
  const changed=ref&&sourceDelta?.comparable&&(
   sourceDelta.changed?.includes(ref)||sourceDelta.removed?.includes(ref)
  );
  if(changed)reasons.push("Связанная ветка была изменена или больше не обнаруживается");
  let action="none";
  if(row.assessment==="stale"||row.assessment==="conflict")action="review_evidence";
  else if(row.assessment==="unknown"||row.assessment==="gap_reported"||row.assessment==="partial_reported")action="plan_work";
  else if(["implemented_claim","test_claim","acceptance_claim"].includes(row.assessment))action="verify_acceptance";
  return {targetId:row.id,title:row.title,intent:row.intent,assessment:row.assessment,
   sourceId:source?.id||null,ref:ref||null,revision:row.latest?.revision||null,
   freshness:row.freshness.state,changed:!!changed,priority,action,reasons,
   work:work.map(w=>({id:w.id,title:w.title,state:w.state})),openWork:openWork.length,
   changeRequests:row.relatedChanges};
 });
 const attention=rows.filter(x=>x.intent==="committed"&&x.priority);
 const sourceIssues=(project.sources||[]).filter(s=>s.status==="error"||s.summary?.complete===false)
  .map(s=>({id:s.id,locator:s.locator,status:s.status,complete:s.summary?.complete!==false}));
 return {projectId:project.id,rows,attention:attention.length,missingWork:attention.filter(x=>x.openWork===0).length,
  evidenceReview:attention.filter(x=>x.action==="review_evidence").length,
  sourceIssues,warning:"Impact is a recommendation derived from linked claims and observed revisions; not a verified product readiness score"};
}
export function portfolioImpact(projects,options={}){
 const rows=projects.map(project=>{
  const impact=projectImpact(project,options);
  return {id:project.id,name:project.name,attention:impact.attention,
    missingWork:impact.missingWork,evidenceReview:impact.evidenceReview,sourceIssues:impact.sourceIssues.length};
 });
 return {rows,attention:rows.reduce((n,x)=>n+x.attention,0),
  missingWork:rows.reduce((n,x)=>n+x.missingWork,0),
  evidenceReview:rows.reduce((n,x)=>n+x.evidenceReview,0),
  sourceIssues:rows.reduce((n,x)=>n+x.sourceIssues,0)};
}

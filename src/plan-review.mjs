// Atlas portfolio consequences of a HUMAN SHA-pinned recheck.
// Read-only projections + append-only decisions in the existing project snapshot.
// No acceptance authority, task execution, grants, additional store, or auto-replanning.
import {validate} from "./core.mjs";
import {validatePortfolioLinks} from "./portfolio.mjs";
import {compareProject} from "./trace.mjs";

const escape=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const choices=new Set(["keep","revise","defer"]);
const statusText={needs_decision:"Ожидает решения",deferred:"Отложено человеком",
 kept:"План сохранён по решению",needs_proposal:"Нужна заявка на изменение",
 proposal_open:"Заявка ожидает дальнейшего решения",
 plan_pending:"Утверждённые корректировки ожидают применения",
 plan_applied:"Корректировки применены",source_hold:"Требуется сверить источник"};
const assessmentText={unknown:"Нет сведений",stale:"Сведения устарели",conflict:"Противоречие",
 gap_reported:"Отсутствует (заявлено)",partial_reported:"Частично (заявлено)",
 implemented_claim:"Реализовано (заявлено)",test_claim:"Протестировано (заявлено)",
 acceptance_claim:"Принято (заявлено)"};
const day=86400000;

export const planReviewAction=(rootProjectId,findingId,projectId,revision)=>
 "plan-review:"+[rootProjectId,findingId,projectId,revision].map(encodeURIComponent).join(":");
export const planProposalAction=(projectId,decisionId)=>
 "plan-proposal:"+[projectId,decisionId].map(encodeURIComponent).join(":");

function parseAction(action,prefix,arity){
 if(typeof action!=="string"||!action.startsWith(prefix))throw Error("Unknown review action");
 const args=action.slice(prefix.length).split(":");
 if(args.length!==arity)throw Error("Invalid review action");
 const items=args.map(decodeURIComponent);
 if(items.some(x=>!x||x.length>300))throw Error("Invalid review action reference");
 return items;
}
export function parsePlanReviewAction(action){
 const [rootProjectId,findingId,projectId,revision]=parseAction(action,"plan-review:",4);
 return {rootProjectId,findingId,projectId,revision};
}
export function parsePlanProposalAction(action){
 const [projectId,decisionId]=parseAction(action,"plan-proposal:",2);
 return {projectId,decisionId};
}

export function planReviewQueue(snapshot,{now=new Date().toISOString(),maxAgeMs=7*day}={}){
 const order=validatePortfolioLinks(snapshot),current=Date.parse(now);
 if(!Number.isFinite(current)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw Error("Invalid plan review clock");
 const projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const outgoing=new Map(order.map(id=>[id,[]]));
 for(const link of snapshot.portfolioLinks||[])outgoing.get(link.from).push(link.to);
 const rows=[];
 for(const root of snapshot.projects){
  const reviewEvents=compareProject(root,{now,maxAgeMs}).rows.filter(row=>
   row.intent==="committed"&&row.latest?.reviewOfFindingId);
  if(!reviewEvents.length)continue;
  const paths=new Map([[root.id,[root.id]]]),queue=[root.id];
  for(let i=0;i<queue.length;i++)for(const next of outgoing.get(queue[i])){
   if(paths.has(next))continue;
   paths.set(next,[...paths.get(queue[i]),next]);queue.push(next);
  }
  for(const target of reviewEvents){
   const claim=target.latest,source=root.sources.find(s=>s.id===claim.sourceId);
   const currentRevision=target.freshness.state==="current_revision";
   const previous=root.findings.find(f=>f.id===claim.reviewOfFindingId);
   if(!previous||!source)continue;
   for(const [projectId,path] of paths){
    const project=projects.get(projectId);
    const decisions=project.decisions.filter(d=>d.kind==="plan_review"&&
     d.upstreamProjectId===root.id&&d.reviewOfFindingId===claim.id&&
     d.reviewRevision===claim.revision);
    const decision=decisions.at(-1)||null;
    const proposals=decision?(project.changes||[]).filter(c=>c.planReviewDecisionId===decision.id):[];
    // A rejected/deferred proposal is not an active plan. The human may
    // create a replacement from the same SHA-pinned decision.
    const activeProposal=proposals.findLast(c=>
     ["proposed","approved","in_progress","implemented"].includes(c.status))||null;
    const proposal=activeProposal||proposals.at(-1)||null;
    const approvedChanges=(project.changes||[]).filter(c=>["approved","in_progress","implemented"].includes(c.status));
    const openWork=project.items.filter(w=>w.state!=="done").length;
    const state=!currentRevision?"source_hold":decision?.outcome==="keep"?"kept":
     decision?.outcome==="revise"?
      (!activeProposal?"needs_proposal":activeProposal.planAppliedAt?"plan_applied":
       ["approved","in_progress","implemented"].includes(activeProposal.status)&&
       activeProposal.planAmendments?.length?"plan_pending":"proposal_open"):
     decision?.outcome==="defer"?"deferred":"needs_decision";
    rows.push({
     rootProjectId:root.id,rootProjectName:root.name,
     findingId:claim.id,originalFindingId:claim.reviewOfFindingId,
     targetId:target.id,targetTitle:target.title,assessment:target.assessment,
     previousResult:previous.result,recheckedResult:claim.result,
     oldSha:previous.revision||null,revision:claim.revision,sourceRef:claim.ref,
     sourceLocator:source.locator,sourceState:target.freshness.state,
     projectId,projectName:project.name,path,downstream:projectId!==root.id,
     state,decision,proposal,approvedChanges:approvedChanges.map(c=>({id:c.id,title:c.title,status:c.status})),
     openWork,decisionHistory:decisions.length
    });
   }
  }
 }
 const attention=rows.filter(r=>!["kept","proposal_open","plan_applied"].includes(r.state));
 return {rows,attention,totals:{
  events:new Set(rows.map(r=>JSON.stringify([r.rootProjectId,r.findingId]))).size,
  affected:rows.length,projects:new Set(rows.map(r=>r.projectId)).size,
  approvedPlansAffected:rows.filter(r=>r.approvedChanges.length>0).length,
  needsDecision:rows.filter(r=>r.state==="needs_decision").length,
  sourceHold:rows.filter(r=>r.state==="source_hold").length,
  deferred:rows.filter(r=>r.state==="deferred").length,
  needsProposal:rows.filter(r=>r.state==="needs_proposal").length,
  kept:rows.filter(r=>r.state==="kept").length,
  proposalOpen:rows.filter(r=>r.state==="proposal_open").length,
  planPending:rows.filter(r=>r.state==="plan_pending").length,
  planApplied:rows.filter(r=>r.state==="plan_applied").length
 },warning:"Impact is a planning reason for human review, not a finding of loss, verified readiness or permission to change the plan"};
}
export function planReviewContext(snapshot,request,options={}){
 const row=planReviewQueue(snapshot,options).rows.find(r=>
  r.rootProjectId===request.rootProjectId&&r.findingId===request.findingId&&
  r.projectId===request.projectId&&r.revision===request.revision);
 if(!row||row.sourceState!=="current_revision")throw Error("Нужна новая сверка актуальной Git-ревизии");
 if(row.state==="kept"||row.decision?.outcome==="revise")
  throw Error("Решение по этой проверке уже принято");
 return row;
}
export function decidePlanReview(snapshot,request,{outcome,rationale}){
 validate(snapshot);
 if(!choices.has(outcome))throw Error("Invalid plan review outcome");
 if(typeof rationale!=="string"||rationale.trim().length<8||rationale.length>4000)
  throw Error("Укажите обоснование решения (не менее 8 символов)");
 const row=planReviewContext(snapshot,request);
 const next=structuredClone(snapshot),project=next.projects.find(p=>p.id===row.projectId);
 const id=crypto.randomUUID();
 project.decisions.push({
  id,kind:"plan_review",text:rationale.trim(),at:new Date().toISOString(),
  upstreamProjectId:row.rootProjectId,reviewOfFindingId:row.findingId,
  reviewRevision:row.revision,reviewTargetId:row.targetId,
  outcome
 });
 next.revision++;
 validate(next);
 return {id,state:next};
}
export function planProposalContext(snapshot,projectId,decisionId){
 const project=snapshot.projects.find(p=>p.id===projectId);
 const decision=project?.decisions.find(d=>d.id===decisionId);
 if(!decision||decision.kind!=="plan_review"||decision.outcome!=="revise")
  throw Error("Нет решения о пересмотре плана");
 const current=planReviewQueue(snapshot).rows.find(row=>row.projectId===projectId&&
  row.rootProjectId===decision.upstreamProjectId&&row.findingId===decision.reviewOfFindingId&&
  row.revision===decision.reviewRevision);
 if(!current||current.sourceState!=="current_revision")
  throw Error("Перед созданием заявки сверьте исходный факт");
 if((project.changes||[]).some(c=>c.planReviewDecisionId===decisionId&&
  ["proposed","approved","in_progress","implemented"].includes(c.status)))
  throw Error("Заявка по этому решению уже существует");
 return {project,decision,row:current};
}
function renderRows(rows,{limit=45,esc=escape}={}){
 return rows.slice(0,limit).map(row=>{
  let action='<span class="muted">'+(row.state==="source_hold"?"Обновите источник":"Нет новых действий")+'</span>';
  if(["needs_decision","deferred"].includes(row.state))
   action='<button data-action="'+esc(planReviewAction(row.rootProjectId,row.findingId,row.projectId,row.revision))+'">Рассмотреть план</button>';
  if(row.state==="needs_proposal")
   action='<button data-action="'+esc(planProposalAction(row.projectId,row.decision.id))+'">Предложить изменение</button>';
  if(row.state==="plan_pending")
   action='<span class="muted">Открыть проект → Изменения → Сценарий до / после → Применить</span>';
  const decision=row.decision?'<small>Решение: '+esc(row.decision.text)+
   ' · '+esc(row.decision.at||"")+'</small>':"";
  const route=row.path.length>1?' · '+esc(row.path.length-1)+' переход(ов) по зависимости':"";
  const approvals=row.approvedChanges.length?'<small>Действующих утверждённых изменений: '+
    row.approvedChanges.length+' · открыть проект для анализа</small>':"";
  const proposal=row.proposal?'<small>Заявка: '+esc(row.proposal.title)+
   ' ['+esc(row.proposal.status)+']</small>':"";
  return '<tr><td>'+esc(row.projectName)+'<small>'+esc(row.rootProjectName)+route+'</small></td>'+
   '<td>'+esc(row.targetTitle)+'<small>'+esc(assessmentText[row.assessment]||row.assessment)+'</small></td>'+
   '<td><code>'+esc(row.oldSha||"—")+'</code> → <code>'+esc(row.revision||"—")+'</code></td>'+
   '<td>'+esc(statusText[row.state]||row.state)+approvals+decision+proposal+
   '<small>Незавершённых работ: '+row.openWork+'</small></td><td>'+action+'</td></tr>';
 }).join("");
}
export function renderPortfolioPlanReviews(snapshot,{escape:esc=escape}={}){
 const info=planReviewQueue(snapshot),rows=[...info.attention,...info.rows.filter(r=>!info.attention.includes(r))];
 return '<section class="card" id="atlas-plan-reviews"><h2>Последствия перепроверки: решения по планам</h2>'+
  '<p class="muted">Новая проверка на Git SHA → последствия для проекта и зависимых проектов → решение человека. План не меняется автоматически.</p>'+
  '<div class="atlas-kpis"><div><small>Затронутые проекты и проверки</small><strong>'+info.totals.affected+'</strong></div>'+
  '<div><small>Ожидают решения</small><strong>'+info.totals.needsDecision+'</strong></div>'+
  '<div><small>Нужны заявки на изменение</small><strong>'+info.totals.needsProposal+'</strong></div>'+
  '<div><small>Требуется сверка источника</small><strong>'+info.totals.sourceHold+'</strong></div></div>'+
  (rows.length?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
   '<th>Затронутый проект / источник</th><th>Требование и результат</th><th>Ревизии</th><th>Решение</th><th>Действие</th>'+
   '</tr></thead><tbody>'+renderRows(rows,{esc})+'</tbody></table></div>':
   '<p class="muted">Пока нет перепроверок, требующих решения по плану; это не подтверждение готовности.</p>')+
  (rows.length>45?'<p class="muted">Показаны первые 45 из '+rows.length+' последствий.</p>':"")+
  '</section>';
}
export function renderProjectPlanReviews(snapshot,projectId,esc=escape){
 const rows=planReviewQueue(snapshot).rows.filter(r=>r.projectId===projectId);
 if(!rows.length)return "";
 return '<section class="card" id="atlas-project-plan-reviews"><h2>Пересмотр плана после новых фактов</h2>'+
  '<p class="muted">Решения о плане документируются в этом проекте. Даже при принятом решении изменение плана требует отдельной заявки и утверждения.</p>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Источник</th><th>Требование</th><th>Ревизии</th><th>Состояние</th><th>Действие</th></tr></thead><tbody>'+
  renderRows(rows,{esc,limit:35})+'</tbody></table></div>'+
  (rows.length>35?'<p class="muted">Показаны 35 из '+rows.length+' записей.</p>':"")+'</section>';
}

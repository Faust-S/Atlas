// Revision-review projection from the existing Atlas portfolio snapshot.
// No new ledger or authority: source revisions are observations, findings remain claims.
import {validatePortfolioLinks} from "./portfolio.mjs";
import {compareProject} from "./trace.mjs";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rank={revision_changed:0,ref_removed:1,source_unavailable:2,source_incomplete:3,source_outdated:4};
const labels={revision_changed:"Ветка изменилась",ref_removed:"Ветка не обнаружена",source_unavailable:"Источник недоступен",source_incomplete:"Неполное наблюдение",source_outdated:"Наблюдение устарело"};
const day=24*60*60*1000;
export function recheckAction(projectId,findingId,expectedSha){
 return "recheck:"+[projectId,findingId,expectedSha].map(encodeURIComponent).join(":");
}
export function parseRecheckAction(action){
 if(typeof action!=="string"||!action.startsWith("recheck:"))throw Error("Invalid revision-review action");
 const parts=action.slice(8).split(":");
 if(parts.length!==3)throw Error("Invalid revision-review action");
 const [projectId,findingId,expectedSha]=parts.map(decodeURIComponent);
 if(!projectId||!findingId||!expectedSha)throw Error("Invalid revision-review action");
 return {projectId,findingId,expectedSha};
}
export function recheckCandidate(project,findingId,expectedSha=null,{now=new Date().toISOString(),maxAgeMs=7*day}={}){
 const evidence=compareProject(project,{now,maxAgeMs}).rows;
 const row=evidence.find(x=>x.latest?.id===findingId);
 const claim=row?.latest,source=project.sources.find(x=>x.id===claim?.sourceId);
 if(!claim||!claim.ref||!claim.revision||source?.kind!=="github"||source.status!=="ok"||
    source.summary?.complete!==true)return null;
 const seen=Date.parse(source.observedAt||""),current=Date.parse(now);
 const observedSha=source.summary.branchHeads?.[claim.ref];
 if(!Number.isFinite(seen)||!Number.isFinite(current)||seen>current+300000||current-seen>maxAgeMs||
    typeof observedSha!=="string"||!observedSha||observedSha===claim.revision||
    (expectedSha!==null&&observedSha!==expectedSha))return null;
 return {projectId:project.id,claim,target:row,source,observedSha,previousSha:claim.revision};
}
export function revisionReview(snapshot,{now=new Date().toISOString(),maxAgeMs=7*day}={}){
 validatePortfolioLinks(snapshot);
 const nowMs=Date.parse(now);
 if(!Number.isFinite(nowMs)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw Error("Invalid revision-review window");
 const projects=new Map(snapshot.projects.map(p=>[p.id,p])), downstream=new Map([...projects.keys()].map(id=>[id,new Set()]));
 for(const link of snapshot.portfolioLinks||[])downstream.get(link.from).add(link.to);
 const memo=new Map();
 function affected(id){
  if(memo.has(id))return memo.get(id);
  const result=new Set();
  for(const next of downstream.get(id)){result.add(next);for(const dependent of affected(next))result.add(dependent)}
  memo.set(id,result);return result;
 }
 const rows=[];
 const reasons={revision_changed:"revision_changed",ref_not_found:"ref_removed",
  unavailable:"source_unavailable",missing_source:"source_unavailable",
  incomplete:"source_incomplete",outdated:"source_outdated"};
 for(const project of snapshot.projects){
  const sources=new Map(project.sources.map(source=>[source.id,source]));
  // The same latest finding drives the project assessment and the active review queue.
  // Older observations remain in the append-only ledger but do not reopen resolved reviews.
  for(const row of compareProject(project,{now,maxAgeMs}).rows){
   const claim=row.latest,source=sources.get(claim?.sourceId);
   if(!claim?.ref||!claim?.revision||source?.kind!=="github")continue;
   const reason=reasons[row.freshness.state];
   if(!reason)continue;
   const head=source.summary?.branchHeads;
   const observedSha=head&&Object.hasOwn(head,claim.ref)?head[claim.ref]:null;
   const canRecheck=!!recheckCandidate(project,claim.id,observedSha,{now,maxAgeMs});
   rows.push({id:claim.id,claimId:claim.id,projectId:project.id,projectName:project.name,
    sourceId:source.id,locator:source.locator,targetId:row.id,targetTitle:row.title,
    targetIntent:row.intent,ref:claim.ref,claimedSha:claim.revision,observedSha,
    reason,canRecheck,lastObserved:source.observedAt||null,claimCount:1,
    downstream:[...affected(project.id)]});
  }
 }
 rows.sort((a,b)=>rank[a.reason]-rank[b.reason]||a.projectName.localeCompare(b.projectName,"ru")||a.targetTitle.localeCompare(b.targetTitle,"ru"));
 const impacted=new Set(rows.flatMap(row=>row.downstream));
 return {rows,totals:{claims:rows.length,reviews:rows.length,
  changed:rows.filter(row=>row.reason==="revision_changed").length,
  uncertain:rows.filter(row=>row.reason!=="revision_changed"&&row.reason!=="ref_removed").length,
  projects:new Set(rows.map(row=>row.projectId)).size,downstream:impacted.size},
  warning:"Observed revision mismatches require human re-check; neither the claim nor an observation independently establishes release acceptance"};
}
export function renderRevisionReview(snapshot,{now=new Date().toISOString(),escape=esc}={}){
 const result=revisionReview(snapshot,{now});
 const rows=result.rows.slice(0,60).map(row=>{
  const link='inspect:'+encodeURIComponent(row.projectId)+':evidence:'+encodeURIComponent(row.targetId);
  return '<tr><td><button class="atlas-plain-button" data-action="'+escape(link)+'">'+escape(row.projectName)+'</button>'+
   '<small>'+escape(row.targetTitle)+'</small></td><td>'+escape(row.locator)+'<small>'+escape(row.ref)+'</small></td>'+
   '<td><code>'+escape(row.claimedSha)+'</code></td><td><code>'+escape(row.observedSha||"не установлена")+'</code></td>'+
   '<td>'+escape(labels[row.reason])+'<small>Зависимых проектов: '+row.downstream.length+'</small></td>'+
   '<td>'+(row.canRecheck?'<button class="primary" data-action="'+
     escape(recheckAction(row.projectId,row.claimId,row.observedSha))+'">Повторно проверить</button>':
     '<button data-action="'+escape("inspect:"+encodeURIComponent(row.projectId)+":sources")+'">Сверить источник</button>')+
     '<button data-action="'+escape(link)+'">История факта</button></td></tr>';
 }).join("");
 return '<section class="card" id="atlas-revision-review"><h2>Изменения Git и пересмотр фактов</h2>'+
  '<p class="muted">Указаны факты с привязкой к исходной Git-ревизии. Различие SHA или неполные сведения не означает провал проекта; подтверждение результата требует отдельной проверки.</p>'+
  '<div class="atlas-kpis"><div><small>Фактов к пересмотру</small><strong>'+result.totals.claims+'</strong></div>'+
  '<div><small>Изменившиеся ветки</small><strong>'+result.totals.changed+'</strong></div>'+
  '<div><small>Недостоверна актуальность источника</small><strong>'+result.totals.uncertain+'</strong></div>'+
  '<div><small>Зависимых проектов под влиянием</small><strong>'+result.totals.downstream+'</strong></div></div>'+
  (rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
   '<th>Проект / требование</th><th>Источник / ветка</th><th>SHA факта</th><th>SHA наблюдения</th><th>Основание</th><th></th></tr></thead><tbody>'+
   rows+'</tbody></table></div>':'<p class="muted">Нет фактов с обнаруженными причинами для пересмотра. Это не свидетельствует о готовности проектов.</p>')+
  (result.rows.length>60?'<p class="muted">Показаны 60 из '+result.rows.length+' записей; уточните отдельный проект для остальных.</p>':"")+'</section>';
}

// Revision-review projection from the existing Atlas portfolio snapshot.
// No new ledger or authority: source revisions are observations, findings remain claims.
import {validatePortfolioLinks} from "./portfolio.mjs";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rank={revision_changed:0,ref_removed:1,source_unavailable:2,source_incomplete:3,source_outdated:4};
const labels={revision_changed:"Ветка изменилась",ref_removed:"Ветка не обнаружена",source_unavailable:"Источник недоступен",source_incomplete:"Неполное наблюдение",source_outdated:"Наблюдение устарело"};
const day=24*60*60*1000;
export function revisionReview(snapshot,{now=new Date().toISOString(),maxAgeMs=7*day}={}){
 validatePortfolioLinks(snapshot);
 const current=Date.parse(now);
 if(!Number.isFinite(current)||!Number.isFinite(maxAgeMs)||maxAgeMs<0)throw Error("Invalid revision-review window");
 const projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const downstream=new Map([...projects.keys()].map(id=>[id,new Set()]));
 for(const link of snapshot.portfolioLinks||[])downstream.get(link.from).add(link.to);
 const reachable=new Map();
 function affected(id){
  if(reachable.has(id))return reachable.get(id);
  const result=new Set();
  for(const next of downstream.get(id)){result.add(next);for(const descendant of affected(next))result.add(descendant)}
  reachable.set(id,result);return result;
 }
 const rows=[];
 for(const project of snapshot.projects){
  const sources=new Map(project.sources.map(s=>[s.id,s]));
  const targets=new Map((project.targets||[]).map(t=>[t.id,t]));
  const issues=new Map();
  for(const claim of project.findings||[]){
   if(!claim.sourceId||!claim.ref||!claim.revision)continue;
   const source=sources.get(claim.sourceId);
   if(!source||!["github","github_owner"].includes(source.kind))continue;
   // Only GitHub repository snapshots have branch-to-SHA lineage.
   if(source.kind!=="github")continue;
   const summary=source.summary,heads=summary?.branchHeads||{};
   const observed=Date.parse(source.observedAt||"");
   let reason=null;
   if(source.status!=="ok")reason="source_unavailable";
   else if(!Number.isFinite(observed)||observed>current+5*60*1000||current-observed>maxAgeMs)reason="source_outdated";
   else if(summary?.complete!==true)reason="source_incomplete";
   else if(Object.hasOwn(heads,claim.ref)&&heads[claim.ref]!==claim.revision)reason="revision_changed";
   else if(!Object.hasOwn(heads,claim.ref))reason="ref_removed";
   if(!reason)continue;
   const target=targets.get(claim.targetId);
   if(!target)continue;
   const key=JSON.stringify([project.id,source.id,claim.ref,claim.revision,claim.targetId]);
   const known=issues.get(key);
   const issue={id:key,projectId:project.id,projectName:project.name,sourceId:source.id,locator:source.locator,
    targetId:target.id,targetTitle:target.title,targetIntent:target.intent,
    ref:claim.ref,claimedSha:claim.revision,
    observedSha:Object.hasOwn(heads,claim.ref)?heads[claim.ref]:null,
    lastObserved:source.observedAt||null,reason,claimCount:known?known.claimCount+1:1,
    downstream:[...affected(project.id)]};
   if(!known||rank[reason]<rank[known.reason])issues.set(key,issue);
   else known.claimCount++;
  }
  rows.push(...issues.values());
 }
 rows.sort((a,b)=>rank[a.reason]-rank[b.reason]||a.projectName.localeCompare(b.projectName,"ru")||a.targetTitle.localeCompare(b.targetTitle,"ru"));
 const impacted=new Set(rows.flatMap(row=>row.downstream));
 return {rows,totals:{claims:rows.reduce((n,r)=>n+r.claimCount,0),reviews:rows.length,
   changed:rows.filter(r=>r.reason==="revision_changed").length,
   uncertain:rows.filter(r=>r.reason!=="revision_changed"&&r.reason!=="ref_removed").length,
   projects:new Set(rows.map(r=>r.projectId)).size,downstream:impacted.size},
  warning:"Git SHA differences indicate a reason to re-check previously declared findings, not proof of defective work or accepted delivery"};
}
export function renderRevisionReview(snapshot,{now=new Date().toISOString(),escape=esc}={}){
 const result=revisionReview(snapshot,{now});
 const rows=result.rows.slice(0,60).map(row=>{
  const link='inspect:'+encodeURIComponent(row.projectId)+':evidence:'+encodeURIComponent(row.targetId);
  return '<tr><td><button class="atlas-plain-button" data-action="'+escape(link)+'">'+escape(row.projectName)+'</button>'+
   '<small>'+escape(row.targetTitle)+'</small></td><td>'+escape(row.locator)+'<small>'+escape(row.ref)+'</small></td>'+
   '<td><code>'+escape(row.claimedSha)+'</code></td><td><code>'+escape(row.observedSha||"не установлена")+'</code></td>'+
   '<td>'+escape(labels[row.reason])+'<small>Зависимых проектов: '+row.downstream.length+'</small></td>'+
   '<td><button data-action="'+escape(link)+'">Пересмотреть факт</button></td></tr>';
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

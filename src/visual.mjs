// Read-only portfolio visualization for Atlas snapshots.
// All figures describe linked claims and project plans, not qualified release readiness.
import {compareProject} from "./trace.mjs";

export const states={
  unknown:{label:"Нет подтверждений",tone:"unknown"},
  gap_reported:{label:"Заявлен пробел",tone:"missing"},
  partial_reported:{label:"Заявлено частично",tone:"partial"},
  stale:{label:"Устарело / недоступно",tone:"stale"},
  conflict:{label:"Противоречия",tone:"conflict"},
  implemented_claim:{label:"Реализация заявлена",tone:"reported"},
  test_claim:{label:"Проверка заявлена",tone:"reported"},
  acceptance_claim:{label:"Приёмка заявлена",tone:"reported"}
};
export const concernStates=new Set(["unknown","gap_reported","partial_reported","stale","conflict"]);

export function portfolioSummary(projects, options={}){
 if(!Array.isArray(projects))throw Error("Expected projects");
 const rows=projects.map(p=>{
  const view=compareProject(p,options);
  const sourceStats={fresh:0,unavailable:0,unobserved:0};
  for(const source of p.sources||[]){
    if(source.status==="ok")sourceStats.fresh++;
    else if(source.status==="never")sourceStats.unobserved++;
    else sourceStats.unavailable++;
  }
  return {id:p.id,name:p.name,status:p.status,committed:view.committed,
    candidates:view.candidates,counts:view.counts,sourceStats,
    proposals:view.proposedChanges,approved:view.approvedChanges};
 });
 const counts=Object.fromEntries(Object.keys(states).map(k=>[k,rows.reduce((n,r)=>n+(r.counts[k]||0),0)]));
 return {projects:rows.length,committed:rows.reduce((n,r)=>n+r.committed,0),
   candidates:rows.reduce((n,r)=>n+r.candidates,0),counts,
   unknown:counts.unknown,gaps:counts.gap_reported+counts.partial_reported,
   stale:counts.stale+counts.conflict,
   sourceProblems:rows.reduce((n,r)=>n+r.sourceStats.unavailable+r.sourceStats.unobserved,0),
   proposals:rows.reduce((n,r)=>n+r.proposals,0),approved:rows.reduce((n,r)=>n+r.approved,0),
   rows};
}
export function statusBand(counts, escapeHtml=(v)=>String(v)){
 const entries=Object.entries(states).map(([k,v])=>({key:k,...v,count:counts[k]||0})).filter(x=>x.count>0);
 const total=entries.reduce((n,x)=>n+x.count,0);
 if(!total)return '<p class="muted">Требования ещё не определены. Начните с формулировки ожидаемых результатов.</p>';
 const aria=escapeHtml(entries.map(x=>x.label+": "+x.count).join("; "));
 return '<div class="atlas-status-band" role="img" aria-label="'+aria+'">'+entries.map(x=>'<span class="atlas-band-part atlas-band-'+x.tone+'" style="width:'+(x.count/total*100).toFixed(3)+'%" title="'+escapeHtml(x.label)+': '+x.count+'"></span>').join("")+'</div>';
}
export function renderPortfolioInsight(projects,escapeHtml=(v)=>String(v)){
 const v=portfolioSummary(projects);
 const statusDetails=Object.entries(states).filter(([k])=>v.counts[k]>0).map(([k,d])=>'<span class="atlas-key"><i class="atlas-dot atlas-band-'+d.tone+'"></i>'+escapeHtml(d.label)+': '+v.counts[k]+'</span>').join("");
 const rows=v.rows.map(p=>{
  const issues=p.counts.unknown+p.counts.gap_reported+p.counts.partial_reported+p.counts.stale+p.counts.conflict;
  return '<tr><td><button data-action="open:'+escapeHtml(p.id)+'" class="atlas-plain-button">'+escapeHtml(p.name)+'</button></td><td>'+p.committed+'</td><td>'+issues+'</td><td>'+(p.counts.stale+p.counts.conflict)+'</td><td>'+p.sourceStats.unavailable+' / '+p.sourceStats.unobserved+'</td><td>'+p.approved+'</td></tr>';
 }).join("");
 return '<section class="card atlas-overview"><h2>Общая картина портфеля</h2><p class="muted">Сопоставление целей и заявленных результатов по всем проектам; показатели не являются сертификацией готовности.</p><div class="atlas-kpis"><div><small>Обязательных результатов</small><strong>'+v.committed+'</strong></div><div><small>Неясно / есть разрывы</small><strong>'+(v.unknown+v.gaps)+'</strong></div><div><small>Устарело / противоречит</small><strong>'+v.stale+'</strong></div><div><small>Предстоящие изменения</small><strong>'+(v.proposals+v.approved)+'</strong></div></div>'+statusBand(v.counts,escapeHtml)+'<div class="atlas-legend">'+statusDetails+'</div><h3>По проектам</h3><div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Обязательных</th><th>Проблемных / неизвестных</th><th>Устарело / конфликт</th><th>Ошибка / нет наблюдения источников</th><th>Одобрено / в работе</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="muted">Здесь считаются только явно заданные критерии. Отсутствие критериев не означает завершение проекта.</p></section>';
}
export function filterTraceRows(rows,mode){
 switch(mode){
  case "needs_attention":return rows.filter(r=>concernStates.has(r.assessment));
  case "unconfirmed":return rows.filter(r=>r.assessment==="unknown"||r.assessment==="stale"||r.assessment==="conflict");
  case "reported":return rows.filter(r=>["implemented_claim","test_claim","acceptance_claim"].includes(r.assessment));
  case "candidate":return rows.filter(r=>r.intent==="candidate");
  case "all":return rows;
  default:throw Error("Unknown trace view filter");
 }
}

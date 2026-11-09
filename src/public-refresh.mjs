// Public GitHub observation is read-only. One bounded refresh creates one Atlas
// snapshot revision; no extra store, credentials, grants or readiness authority.
import {validate} from "./core.mjs";
import {sourceChanges} from "./source-observation.mjs";
import {observePublicRepo,observePublicOwner,repoName,ownerName} from "./github-public.mjs";

const MAX_BINDINGS=30,MAX_REQUESTS=4,DEFAULT_AGE=15*60*1000;
const supported=new Set(["github","github_owner"]);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function canonical(source){
 try{return (source.kind==="github"?repoName(source.locator):ownerName(source.locator)).toLowerCase()}
 catch{return String(source.locator).trim().toLowerCase()}
}
const keyOf=s=>s.kind+":"+canonical(s)+
 (s.kind==="github"&&typeof s.branch==="string"?"#"+s.branch:"");
const timestamp=source=>{
 const value=source.observedAt?Date.parse(source.observedAt):NaN;
 return Number.isFinite(value)?value:Number.NEGATIVE_INFINITY;
};
const eligible=(source,now,maxAgeMs)=>maxAgeMs===0||timestamp(source)===Number.NEGATIVE_INFINITY||now-timestamp(source)>=maxAgeMs;

export function planPublicRefresh(snapshot,{
 now=Date.now(),maxAgeMs=DEFAULT_AGE,limit=MAX_BINDINGS,maxRequests=MAX_REQUESTS,only=null
}={}){
 if(!Number.isFinite(now)||!Number.isFinite(maxAgeMs)||maxAgeMs<0||
    !Number.isInteger(limit)||limit<1||limit>MAX_BINDINGS||
    !Number.isInteger(maxRequests)||maxRequests<1||maxRequests>MAX_REQUESTS)
  throw Error("Invalid public refresh limits");
 if(only!==null&&(!Array.isArray(only)||only.some(x=>!x||typeof x.projectId!=="string"||typeof x.sourceId!=="string")))
  throw Error("Invalid public source selection");
 const requested=only?new Set(only.map(x=>JSON.stringify([x.projectId,x.sourceId]))):null;
 const candidates=[];let sequence=0;
 for(const project of snapshot.projects)for(const source of project.sources){
  if(!supported.has(source.kind))continue;
  if(requested&&!requested.has(JSON.stringify([project.id,source.id])))continue;
  if(!requested&&!eligible(source,now,maxAgeMs))continue;
  candidates.push({source,projectId:project.id,sourceId:source.id,age:timestamp(source),sequence:sequence++});
 }
 // The oldest or never-observed bindings go first. After a successful manual
 // refresh, their timestamp moves forward, so subsequent clicks reach the rest.
 candidates.sort((a,b)=>a.age-b.age||a.sequence-b.sequence);
 const groups=new Map();let selected=0;
 for(const candidate of candidates){
  if(selected===limit)break;
  const key=keyOf(candidate.source);
  if(!groups.has(key)){
   if(groups.size===maxRequests)continue;
   groups.set(key,{key,kind:candidate.source.kind,locator:canonical(candidate.source),
    branch:candidate.source.kind==="github"?candidate.source.branch??null:null,
    bindings:[]});
  }
  groups.get(key).bindings.push({projectId:candidate.projectId,sourceId:candidate.sourceId});
  selected++;
 }
 return {groups:[...groups.values()],due:candidates.length,selected,unique:groups.size,
  remaining:candidates.length-selected};
}

const isRateLimited=e=>/\b(?:403|429)\b|rate.limit|rate-limit/i.test(String(e?.message||e));
export async function reconcilePublicSources(snapshot,{
 plan=planPublicRefresh(snapshot),repoObserver=(name,branch)=>observePublicRepo(name,globalThis.fetch,{includeActions:true,actionsBranch:branch}),ownerObserver=observePublicOwner
}={}){
 validate(snapshot);
 const state=structuredClone(snapshot),projects=new Map(state.projects.map(x=>[x.id,x]));
 const report={due:plan.due,selected:plan.selected,requests:0,updated:0,failed:0,
  rateLimited:false,remaining:plan.remaining,errors:[]};
 let touched=0;
 for(const group of plan.groups){
  let observation,error;
  report.requests++;
  try{observation=await (group.kind==="github"?
   repoObserver(group.locator,group.branch):ownerObserver(group.locator))}
  catch(e){error=e instanceof Error?e:Error(String(e))}
  for(const binding of group.bindings){
   const source=projects.get(binding.projectId)?.sources.find(s=>s.id===binding.sourceId);
   if(!source||source.kind!==group.kind||keyOf(source)!==group.key)
    throw Error("Public source binding changed during refresh");
   try{
    if(error)throw error;
    if((source.kind==="github"&&observation?.scope!=="repository")||
       (source.kind==="github_owner"&&observation?.scope!=="owner")||
       typeof observation.complete!=="boolean")throw Error("Invalid public observation");
    const changes=sourceChanges(source.summary,observation);
    source.summary={...observation,changes};
    source.status="ok";source.error=null;
    report.updated++;
   }catch(e){
    source.status="error";source.error=String(e?.message||e);
    report.failed++;
    report.errors.push({projectId:binding.projectId,sourceId:binding.sourceId,message:source.error});
   }
   source.observedAt=new Date().toISOString();
   touched++;
  }
  if(error&&isRateLimited(error)){report.rateLimited=true;break}
 }
 if(touched){
  state.revision++;
  validate(state);
 }
 report.remaining=Math.max(0,report.due-report.updated-report.failed);
 return {state:touched?state:snapshot,report};
}

export function publicSourceQueue(snapshot,{now=Date.now(),maxAgeMs=DEFAULT_AGE}={}){
 const groups=new Map();let total=0;
 for(const project of snapshot.projects)for(const source of project.sources){
  if(!supported.has(source.kind))continue;
  total++;
  const key=keyOf(source);
  if(!groups.has(key))groups.set(key,{key,kind:source.kind,locator:canonical(source),
   branch:source.kind==="github"?source.branch??null:null,count:0,never:0,error:0,stale:0,incomplete:0,changed:0,lastObserved:null,
   projectId:project.id});
  const row=groups.get(key);
  row.count++;
  if(!source.observedAt||source.status==="never")row.never++;
  if(source.status==="error")row.error++;
  if(eligible(source,now,maxAgeMs))row.stale++;
  if(source.summary?.complete===false)row.incomplete++;
  const changes=source.summary?.changes;
  if(changes?.comparable)
   row.changed+=(changes.added?.length||0)+(changes.removed?.length||0)+
    (changes.changed?.length||0)+(changes.renamed?.length||0);
  if(source.observedAt&&(!row.lastObserved||Date.parse(source.observedAt)>Date.parse(row.lastObserved)))
   row.lastObserved=source.observedAt;
 }
 const rows=[...groups.values()].sort((a,b)=>
   (b.never>0)-(a.never>0)||(b.error>0)-(a.error>0)||(b.stale>0)-(a.stale>0)||
   (b.changed>0)-(a.changed>0)||a.locator.localeCompare(b.locator));
 return {rows,bindings:total,unique:rows.length,pending:rows.filter(r=>r.stale).length,
  errors:rows.filter(r=>r.error).length,changed:rows.filter(r=>r.changed).length,
  incomplete:rows.filter(r=>r.incomplete).length};
}

export function renderPublicSourceQueue(snapshot,{now=Date.now(),lastReport=null,escape=escapeHtml}={}){
 const queue=publicSourceQueue(snapshot,{now});
 const rows=queue.rows.slice(0,12).map(r=>{
  const state=r.never?"Ещё не наблюдался":r.error?"Ошибка наблюдения":
    r.stale?"Требует обновления":"Наблюдение актуально по времени";
  const details=[
   r.changed?"Изменений в последней сопоставимой сверке: "+r.changed:null,
   r.incomplete?"Неполные сведения: "+r.incomplete:null,
   r.count>1?"Привязок в проектах: "+r.count:null,
   r.lastObserved?"Последняя попытка: "+r.lastObserved:null
  ].filter(Boolean).join(" · ");
  return '<tr><td>'+escape(r.locator+(r.branch?" · "+r.branch:""))+'</td><td>'+escape(state)+'</td>'+
   '<td><small>'+escape(details||"Готовность проекта не оценивалась")+'</small></td>'+
   '<td><button data-action="inspect:'+encodeURIComponent(r.projectId)+':sources">Открыть</button></td></tr>';
 }).join("");
 const report=lastReport?
  '<p class="muted" role="status">Последний проход: '+lastReport.updated+' обновлено, '+
  lastReport.failed+' ошибок, '+lastReport.requests+' обращений, '+lastReport.remaining+
  ' привязок отложено'+(lastReport.rateLimited?" · GitHub API ограничил запросы":"")+'.</p>':"";
 return '<section class="card" id="atlas-public-sources"><h2>Публичные источники портфеля</h2>'+
  '<p class="muted">Очередь наблюдения GitHub: одинаковые репозитории нескольких проектов запрашиваются один раз. Частичная проверка не подтверждает завершение работ или релиз.</p>'+
  '<div class="atlas-kpis"><div><small>Уникальных источников</small><strong>'+queue.unique+'</strong></div>'+
  '<div><small>Нужна сверка</small><strong>'+queue.pending+'</strong></div>'+
  '<div><small>Ошибки</small><strong>'+queue.errors+'</strong></div>'+
  '<div><small>Есть изменения в последней сверке</small><strong>'+queue.changed+'</strong></div></div>'+
  report+(rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
   '<th>Источник</th><th>Состояние</th><th>Сведения</th><th></th></tr></thead><tbody>'+
   rows+'</tbody></table></div>':'<p class="muted">Публичные источники ещё не подключены.</p>')+
  (queue.rows.length>12?'<p class="muted">Показаны 12 из '+queue.unique+' уникальных источников.</p>':"")+
  '</section>';
}

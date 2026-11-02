// Concrete, human-approved plan amendments stored on existing Atlas change records.
// Preview reuses the single CPM / portfolio dependency projection; no task execution.
import {validate} from "./core.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {portfolioResources} from "./portfolio-resources.mjs";
import {planReviewQueue} from "./plan-review.mjs";

const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const text = (x,name,max=500) => {
 if(typeof x!=="string"||!x.trim()||x.length>max)throw Error("Invalid "+name);
 return x.trim();
};
const workFields = item => ({estimateDays:item.estimateDays??1,assignee:item.assignee||"",dueDate:item.dueDate||null,resourceId:item.resourceId||null,allocationPct:item.allocationPct??100});
const dateFields = project => ({startDate:project.startDate||null,dueDate:project.dueDate||null});
const key = action => action.kind==="dates"?"dates":action.kind==="work"?"work:"+action.itemId:"new_work:"+action.id;
const eligible = c => c && ["proposed","deferred"].includes(c.status) && !c.planAppliedAt;

function pinnedSource(snapshot,project,change) {
 if(!change.planReviewDecisionId)return;
 const decision=project.decisions.find(d=>d.id===change.planReviewDecisionId&&d.kind==="plan_review");
 if(!decision)throw Error("Связанное решение по плану не найдено");
 const row=planReviewQueue(snapshot).rows.find(r=>r.projectId===project.id&&
  r.rootProjectId===decision.upstreamProjectId&&r.findingId===decision.reviewOfFindingId&&
  r.revision===decision.reviewRevision);
 if(!row||row.sourceState!=="current_revision")
  throw Error("Исходная Git-ревизия устарела: сначала обновите проверку и решение");
}
function find(snapshot,projectId,changeId) {
 const project=snapshot.projects.find(p=>p.id===projectId);
 const change=(project?.changes||[]).find(c=>c.id===changeId);
 if(!project||!change)throw Error("Заявка на изменение не найдена");
 return {project,change};
}
function mutableDraft(snapshot,projectId,changeId,fn) {
 validate(snapshot);
 const old=find(snapshot,projectId,changeId);
 if(!eligible(old.change))throw Error("Уточнять корректировку можно только до утверждения");
 pinnedSource(snapshot,old.project,old.change);
 const next=structuredClone(snapshot),{project,change}=find(next,projectId,changeId);
 change.planAmendments??=[];
 fn(project,change);
 next.revision++;
 validate(next);
 return {state:next};
}
function upsert(change,action) {
 const actions=change.planAmendments,position=actions.findIndex(x=>key(x)===key(action));
 if(position<0)actions.push(action);else actions[position]=action;
 if(actions.length>60)throw Error("Не более 60 корректировок в одной заявке");
}
export function setPlanDates(snapshot,projectId,changeId,{startDate,dueDate}) {
 return mutableDraft(snapshot,projectId,changeId,(project,change)=>{
  const before=dateFields(project),after={startDate:startDate||null,dueDate:dueDate||null};
  if(same(before,after))throw Error("Укажите даты, которые действительно изменятся");
  upsert(change,{kind:"dates",before,after});
 });
}
export function setPlanWork(snapshot,projectId,changeId,{itemId,estimateDays,assignee,dueDate,resourceId,allocationPct}) {
 return mutableDraft(snapshot,projectId,changeId,(project,change)=>{
  const item=project.items.find(x=>x.id===itemId);
  if(!item)throw Error("Работа для изменения не найдена");
  const before=workFields(item),after={estimateDays,assignee:String(assignee??"").trim(),dueDate:dueDate||null,
   resourceId:resourceId===""?null:resourceId??item.resourceId??null,allocationPct:allocationPct??item.allocationPct??100};
  if(same(before,after))throw Error("Укажите изменённый срок, длительность или ответственного");
  upsert(change,{kind:"work",itemId,before,after});
  change.targetIds=[...new Set([...(change.targetIds||[]),...(item.targetIds||[])])];
 });
}
export function addPlanWork(snapshot,projectId,changeId,{title,estimateDays,assignee="",dueDate=null,stageId=null,targetId=null,resourceId=null,allocationPct=100}) {
 const id=crypto.randomUUID();
 return mutableDraft(snapshot,projectId,changeId,(project,change)=>{
  const stage=stageId||null,target=targetId||null;
  if(stage&&!project.stages.some(x=>x.id===stage))throw Error("Этап не найден");
  if(target&&!(project.targets||[]).some(x=>x.id===target))throw Error("Требование не найдено");
  change.planAmendments.push({kind:"new_work",id,title:text(title,"new work title"),
   estimateDays,assignee:String(assignee??"").trim(),dueDate:dueDate||null,
   stageId:stage,targetIds:target?[target]:[],resourceId:resourceId||null,allocationPct});
  if(target)change.targetIds=[...new Set([...(change.targetIds||[]),target])];
  if(change.planAmendments.length>60)throw Error("Не более 60 корректировок в одной заявке");
 });
}
export function removePlanAmendment(snapshot,projectId,changeId,actionKey) {
 return mutableDraft(snapshot,projectId,changeId,(_project,change)=>{
  const before=change.planAmendments.length;
  change.planAmendments=change.planAmendments.filter(x=>key(x)!==actionKey);
  if(before===change.planAmendments.length)throw Error("Корректировка не найдена");
 });
}
export function checkPlanAmendment(snapshot,projectId,changeId) {
 validate(snapshot);
 const {project,change}=find(snapshot,projectId,changeId);
 const actions=change.planAmendments||[];
 if(!actions.length)throw Error("В заявке не указаны конкретные корректировки плана");
 if(change.planAppliedAt)throw Error("Корректировка уже применена");
 pinnedSource(snapshot,project,change);
 for(const action of actions){
  if(action.kind==="dates"&&!same(dateFields(project),action.before))
   throw Error("Даты проекта изменились после подготовки заявки: требуется пересмотр");
  if(action.kind==="work"){
   const item=project.items.find(w=>w.id===action.itemId);
   if(!item||!Object.entries(action.before).every(([k,v])=>same(workFields(item)[k],v)))
    throw Error("Исходная работа изменилась после подготовки заявки: требуется пересмотр");
  }
  if(action.kind==="new_work"&&project.items.some(w=>w.id===action.id))
   throw Error("Предлагаемая работа уже существует: применение остановлено");
 }
 return {project,change,actions};
}
function applyToProject(project,change,actions) {
 for(const action of actions){
  if(action.kind==="dates")Object.assign(project,action.after);
  else if(action.kind==="work")Object.assign(project.items.find(w=>w.id===action.itemId),action.after);
  else if(action.kind==="new_work")project.items.push({
   id:action.id,title:action.title,state:"todo",priority:"normal",stageId:action.stageId,
   assignee:action.assignee,dueDate:action.dueDate,estimateDays:action.estimateDays,
   resourceId:action.resourceId||null,allocationPct:action.allocationPct??100,
   targetIds:[...action.targetIds],sourceId:null,executor:null,changeId:change.id
  });
 }
}
export function previewPlanAmendment(snapshot,projectId,changeId) {
 const {actions}=checkPlanAmendment(snapshot,projectId,changeId);
 const before=portfolioSchedule(snapshot),beforeResources=portfolioResources(snapshot);
 const candidate=structuredClone(snapshot);
 const {project,change}=find(candidate,projectId,changeId);
 applyToProject(project,change,actions);
 // Ephemeral what-if: proposed work is intentionally not yet applied in the real snapshot.
 change.planAmendments=[];
 validate(candidate);
 const after=portfolioSchedule(candidate),afterResources=portfolioResources(candidate);
 const affected=new Set([projectId]),links=snapshot.portfolioLinks||[];
 const queue=[projectId];
 for(let i=0;i<queue.length;i++)for(const edge of links)if(edge.from===queue[i]&&!affected.has(edge.to)){
  affected.add(edge.to);queue.push(edge.to);
 }
 const rows=before.rows.filter(r=>affected.has(r.id)).map(r=>{
  const updated=after.byId.get(r.id);
  return {id:r.id,name:r.name,downstream:r.id!==projectId,
   beforeStart:r.projectedStart,afterStart:updated.projectedStart,
   beforeFinish:r.projectedFinish,afterFinish:updated.projectedFinish,
   beforeDeadline:r.deadline,afterDeadline:updated.deadline,
   beforeSlip:r.deadlineSlipDays,afterSlip:updated.deadlineSlipDays,
   beforeDuration:r.durationDays,afterDuration:updated.durationDays,
   changed:r.projectedStart!==updated.projectedStart||r.projectedFinish!==updated.projectedFinish||
    r.deadline!==updated.deadline||r.durationDays!==updated.durationDays};
 });
 const resourceRows=[...new Set([...beforeResources.byId.keys(),...afterResources.byId.keys()])].map(id=>{
  const prior=beforeResources.byId.get(id),next=afterResources.byId.get(id);
  return {id,label:next?.label||prior?.label||"Плановый ресурс",
   beforeOverload:prior?.overloadDays??0,afterOverload:next?.overloadDays??0,
   beforeUnavailable:prior?.unavailableDays??0,afterUnavailable:next?.unavailableDays??0,
   beforeMaxLoad:prior?.maxLoadPct??0,afterMaxLoad:next?.maxLoadPct??0};
 }).filter(r=>r.beforeOverload!==r.afterOverload||r.beforeUnavailable!==r.afterUnavailable||
  r.beforeMaxLoad!==r.afterMaxLoad);
 return {rows,resourceRows,changed:rows.filter(r=>r.changed).length,affected:rows.length,actions:actions.length};
}
export function applyPlanAmendment(snapshot,projectId,changeId) {
 const {change}=checkPlanAmendment(snapshot,projectId,changeId);
 if(!["approved","in_progress"].includes(change.status))
  throw Error("Для изменения плана необходимо утверждение человеком");
 // Forecast before writing: reject invalid horizons and dates for the whole portfolio.
 previewPlanAmendment(snapshot,projectId,changeId);
 const next=structuredClone(snapshot),entry=find(next,projectId,changeId);
 applyToProject(entry.project,entry.change,entry.change.planAmendments);
 const now=new Date().toISOString();
 entry.change.planAppliedAt=now;
 entry.project.decisions.push({id:crypto.randomUUID(),kind:"plan_application",changeId,
  text:"Подтверждено применение "+entry.change.planAmendments.length+" корректировок утверждённой заявки",
  at:now});
 next.revision++;
 validate(next);
 return {state:next};
}
const shownDate = value => value||"не задана";
function describe(project,action) {
 if(action.kind==="dates")return "Сроки проекта: начало "+shownDate(action.before.startDate)+" → "+shownDate(action.after.startDate)+
  "; контрольный срок "+shownDate(action.before.dueDate)+" → "+shownDate(action.after.dueDate);
 if(action.kind==="work"){
  const name=project.items.find(x=>x.id===action.itemId)?.title||"Работа";
  return "Работа «"+name+"»: "+action.before.estimateDays+" → "+action.after.estimateDays+" дн.; "+
   (action.before.assignee||"без ответственного")+" → "+(action.after.assignee||"без ответственного")+
   "; срок "+shownDate(action.before.dueDate)+" → "+shownDate(action.after.dueDate)+
   "; плановый ресурс "+(action.before.resourceId||"не назначен")+" → "+(action.after.resourceId||"не назначен")+
   "; загрузка "+(action.before.allocationPct??100)+"% → "+(action.after.allocationPct??100)+"%";
 }
 return "Новая работа «"+action.title+"»: "+action.estimateDays+" дн.; "+
  (action.assignee||"ответственный не назначен")+"; срок "+shownDate(action.dueDate)+"; плановая загрузка "+(action.allocationPct??100)+"%";
}
export function renderProjectPlanAmendments(snapshot,projectId,{previewId=null,escape=esc}={}) {
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)return "";
 const changes=(project.changes||[]).filter(c=>c.planAmendments?.length||
  ["proposed","deferred"].includes(c.status)).slice(-25).reverse();
 if(!changes.length)return "";
 const cards=changes.map(change=>{
  const actions=change.planAmendments||[],canEdit=eligible(change);
  let buttons="";
  if(canEdit){
   buttons='<button data-action="amend-dates:'+escape(change.id)+'">Даты проекта</button> '+
    (project.items.length?'<button data-action="amend-work:'+escape(change.id)+'">Изменить работу</button> ':"")+
    '<button data-action="amend-new:'+escape(change.id)+'">Добавить работу в план</button> ';
  }
  if(actions.length&&!change.planAppliedAt)buttons+='<button data-action="preview-amendment:'+escape(change.id)+'">'+
   (previewId===change.id?"Скрыть расчёт":"Посмотреть последствия")+'</button> ';
  if(canEdit&&actions.length)buttons+='<button data-action="change:'+escape(change.id)+'">Рассмотреть утверждение</button> ';
  const list=actions.map(a=>'<li>'+escape(describe(project,a))+
   (canEdit?' <button data-action="remove-amendment:'+escape(change.id)+':'+escape(encodeURIComponent(key(a)))+'">Убрать</button>':"")+'</li>').join("");
  let preview="";
  if(previewId===change.id&&actions.length&&!change.planAppliedAt){
   try{
    const view=previewPlanAmendment(snapshot,projectId,change.id);
    const tr=view.rows.slice(0,20).map(r=>'<tr><td>'+escape(r.name)+(r.downstream?" · зависит от проекта":"")+'</td>'+
     '<td>'+escape(shownDate(r.beforeFinish))+' → '+escape(shownDate(r.afterFinish))+'</td>'+
     '<td>'+escape(shownDate(r.beforeDeadline))+' → '+escape(shownDate(r.afterDeadline))+'</td>'+
     '<td>'+(r.beforeSlip==null?"?":r.beforeSlip)+' → '+(r.afterSlip==null?"?":r.afterSlip)+'</td></tr>').join("");
    const resourceTable=view.resourceRows.slice(0,15).map(r=>'<tr><td>'+escape(r.label)+'</td>'+
     '<td>'+r.beforeMaxLoad+'% → '+r.afterMaxLoad+'%</td>'+
     '<td>'+r.beforeOverload+' → '+r.afterOverload+'</td>'+
     '<td>'+r.beforeUnavailable+' → '+r.afterUnavailable+'</td></tr>').join("");
    const capacity=resourceTable?
     '<p><strong>Последствия для плановых ресурсов</strong></p>'+
     '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
     '<th>Ресурс</th><th>Максимальная загрузка</th><th>Дни выше мощности</th>'+
     '<th>Дни вне доступности</th></tr></thead><tbody>'+resourceTable+'</tbody></table></div>':
     '<p class="muted">Изменений расчётной ресурсной нагрузки не обнаружено; доступность не подтверждена.</p>';
    preview='<p class="muted">Расчёт CPM по календарным дням: '+view.affected+
     ' проектов по цепочке, изменены расчётные показатели у '+view.changed+
     '. Назначение ответственных не является проверкой доступности ресурсов.</p>'+
     '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Расчётное завершение</th><th>Контрольная дата</th><th>Риск срока, дни</th></tr></thead><tbody>'+tr+'</tbody></table></div>'+
     (view.rows.length>20?'<p class="muted">Показаны первые 20 проектов из '+view.rows.length+'.</p>':"")+capacity+
     (["approved","in_progress"].includes(change.status)?
       '<button class="primary" data-action="apply-amendment:'+escape(change.id)+'">Применить утверждённую корректировку</button>':"");
   }catch(e){preview='<p class="atlas-source-error">Применение приостановлено: '+escape(e.message||String(e))+'</p>'}
  }
  return '<article class="atlas-response-plan"><h3>'+escape(change.title)+'</h3>'+
   '<p class="muted">Статус: '+escape(change.status)+(change.planAppliedAt?" · план изменён "+escape(change.planAppliedAt):"")+'</p>'+
   (list?'<ul>'+list+'</ul>':'<p class="muted">Конкретные параметры пока не указаны.</p>')+
   '<div class="row">'+buttons+'</div>'+preview+'</article>';
 }).join("");
 return '<section class="card" id="atlas-plan-amendments"><h2>Конкретные корректировки утверждаемого плана</h2>'+
  '<p class="muted">До решения укажите сроки, работы и ответственных. После утверждения сравните расчёт по всему зависимому портфелю и отдельно подтвердите применение. План и источники не меняются автоматически.</p>'+
  cards+(project.changes.length>25?'<p class="muted">Показаны последние 25 заявок с корректировками.</p>':"")+
  '</section>';
}

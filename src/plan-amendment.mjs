// Concrete, human-approved plan amendments stored on existing Atlas change records.
// Preview reuses the single CPM / portfolio dependency projection; no task execution.
import {validate,planAmendmentKey as key} from "./core.mjs";
import {planChange} from "./trace.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {portfolioResources,planningResourceTotals,comparePlanningResourceGroups} from "./portfolio-resources.mjs";
import {scheduleProject} from "./planning.mjs";
import {planReviewQueue} from "./plan-review.mjs";

const esc = x => String(x ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const text = (x,name,max=500) => {
 if(typeof x!=="string"||!x.trim()||x.length>max)throw Error("Invalid "+name);
 return x.trim();
};
const amendableWorkFields = item => ({estimateDays:item.estimateDays??1,
 assignee:item.assignee||"",dueDate:item.dueDate||null,
 resourceId:item.resourceId||null,allocationPct:item.allocationPct??100});
// Pin the meaning of a planned duration in the proposed decision. An
// authorized Work edit may change its calendar, so checking only numeric
// estimateDays before approval would silently change the proposal's meaning.
const workFields = item => ({
 ...amendableWorkFields(item),
 durationUnit:item.durationUnit??"elapsed_days",
 calendarBasis:item.calendarBasis??null
});
const dateFields = project => ({startDate:project.startDate||null,dueDate:project.dueDate||null});
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
  assertExistingActionCurrent(project,change,"dates");
  upsert(change,{kind:"dates",before,after});
 });
}
export function setPlanWork(snapshot,projectId,changeId,{itemId,estimateDays,assignee,dueDate,resourceId,allocationPct}) {
 return mutableDraft(snapshot,projectId,changeId,(project,change)=>{
  const item=project.items.find(x=>x.id===itemId);
  if(!item)throw Error("Работа для изменения не найдена");
  const before=workFields(item),after={estimateDays,
   assignee:assignee===undefined?item.assignee||"":String(assignee??"").trim(),
   dueDate:dueDate===undefined?item.dueDate??null:dueDate||null,
   resourceId:resourceId===undefined?item.resourceId??null:resourceId||null,
   allocationPct:allocationPct??item.allocationPct??100};
  if(same(amendableWorkFields(item),after))throw Error("Укажите изменение срока, длительности, ответственного или планового ресурса");
  assertExistingActionCurrent(project,change,"work:"+itemId);
  upsert(change,{kind:"work",itemId,before,after});
  change.targetIds=[...new Set([...(change.targetIds||[]),...(item.targetIds||[])])];
 });
}
/**
 * Transfer a chosen resource into an ordinary unapplied amendment.
 * A new proposal is an existing planChange; an existing proposal keeps its
 * previously entered duration, assignee, control date and other actions.
 * The current Work, baseline and Store never change at this stage.
 * @param {any} snapshot
 * @param {string} projectId
 * @param {string} workId
 * @param {{changeId?:string|null,title?:string,description?:string,resourceId:string}} choice
 */
export function addResourcePlanChoice(snapshot,projectId,workId,{changeId=null,title="",description="",resourceId}){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 const work=project?.items?.find(w=>w.id===workId);
 if(!work||project.status==="cancelled"||work.state==="done")
  throw Error("Работа недоступна для ресурсной корректировки");
 if(!resourceId||resourceId===(work.resourceId??null)||!(snapshot.resources??[]).some(r=>r.id===resourceId))
  throw Error("Выберите другой действующий плановый ресурс");
 let next=snapshot,previous=null;
 if(changeId){
  const {change}=find(snapshot,projectId,changeId);
  if(!eligible(change))throw Error("Заявку нельзя уточнить после утверждения");
  pinnedSource(snapshot,project,change);
  // Do not silently rebase a pending duration or other stale Work change.
  if(change.planAmendments?.length)checkPlanAmendment(snapshot,projectId,changeId);
  previous=(change.planAmendments??[]).find(a=>a.kind==="work"&&a.itemId===workId)??null;
  if(previous?.after.resourceId===resourceId)throw Error("Этот ресурс уже указан в заявке");
 }else{
  const result=planChange(snapshot,projectId,{title:text(title,"название заявки"),
   description:String(description??"").trim(),targetIds:[...(work.targetIds??[])]});
  next=result.state;changeId=result.id;
 }
 const fields=previous?.after??amendableWorkFields(work);
 const result=setPlanWork(next,projectId,changeId,{itemId:workId,...fields,resourceId});
 return {state:result.state,changeId};
}
const edgePresent=(project,from,to)=>project.dependencies.some(e=>e.from===from&&e.to===to);
const pendingWork=w=>w&&["todo","blocked"].includes(w.state)&&!w.actualStartDate&&!w.actualFinishDate;
function dependencyEndpoints(project,from,to){
 if(!project||["completed","cancelled"].includes(project.status)||!from||!to||from===to)
  throw Error("Выберите две разные работы действующего проекта");
 const a=project.items.find(w=>w.id===from),b=project.items.find(w=>w.id===to);
 if(!a||!b)throw Error("Работы зависимости должны принадлежать одному проекту");
 if(!pendingWork(a)||!pendingWork(b))
  throw Error("Порядок можно изменить в заявке только для ещё не начатых работ");
 return {a,b};
}
/** One explicit addition or removal of an ordinary dependency in a proposal.
 * The existing DAG validator checks the complete combined scenario.
 */
export function setPlanDependency(snapshot,projectId,changeId,{from,to,present}){
 const original=find(snapshot,projectId,changeId);
 if(original.change.planAmendments?.length)checkPlanAmendment(snapshot,projectId,changeId);
 const result=mutableDraft(snapshot,projectId,changeId,(project,change)=>{
  const {a,b}=dependencyEndpoints(project,from,to);
  const before=edgePresent(project,from,to);
  if(typeof present!=="boolean"||before===present)
   throw Error("Укажите действительное добавление или удаление зависимости");
  const action={kind:"dependency",from,to,before,after:present};
  if((change.planAmendments??[]).some(x=>key(x)===key(action)))
   throw Error("Эта зависимость уже указана в заявке");
  upsert(change,action);
  change.targetIds=[...new Set([...(change.targetIds??[]),...(a.targetIds??[]),...(b.targetIds??[])])];
 });
 checkPlanAmendment(result.state,projectId,changeId);
 return result;
}
/** Transfer the selected order to a new or existing unapplied proposal. */
export function addSequencePlanChoice(snapshot,projectId,{from,to,changeId=null,title="",description=""}){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 dependencyEndpoints(project,from,to);
 let next=snapshot;
 if(!changeId){
  const created=planChange(snapshot,projectId,{title:text(title,"название заявки"),description:String(description??"").trim()});
  next=created.state;changeId=created.id;
 }
 const result=setPlanDependency(next,projectId,changeId,{from,to,present:true});
 return {state:result.state,changeId};
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
// The same source checks drive both application and the review screen.
function assertPlanActionCurrent(project,action){
 if(action.kind==="dates"&&!same(dateFields(project),action.before))
  throw Error("Даты проекта изменились после подготовки заявки: требуется пересмотр");
 if(action.kind==="work"){
  const item=project.items.find(w=>w.id===action.itemId);
  if(!item||!Object.entries(action.before).every(([k,v])=>same(workFields(item)[k],v)))
   throw Error("Исходная работа изменилась после подготовки заявки: требуется пересмотр");
 }
 if(action.kind==="dependency"){
  dependencyEndpoints(project,action.from,action.to);
  if(edgePresent(project,action.from,action.to)!==action.before)
   throw Error("Исходная зависимость изменилась после подготовки заявки: требуется пересмотр");
 }
 if(action.kind==="new_work"&&project.items.some(w=>w.id===action.id))
  throw Error("Предлагаемая работа уже существует: применение остановлено");
}
function assertExistingActionCurrent(project,change,actionKey){
 const existing=(change.planAmendments??[]).find(a=>key(a)===actionKey);
 if(existing)assertPlanActionCurrent(project,existing);
}
const REVIEW_LABELS={startDate:"Плановое начало",dueDate:"Контрольный срок",
 estimateDays:"Длительность",assignee:"Ответственный",resourceId:"Плановый ресурс",
 allocationPct:"Доля ресурса",durationUnit:"Единица длительности",calendarBasis:"Редакция календаря"};
const REVIEW_WORK_FIELDS=["estimateDays","assignee","dueDate","resourceId","allocationPct"];
const REVIEW_DATE_FIELDS=["startDate","dueDate"];
function reviewValueLabel(snapshot,name,value,context={}){
 if(name==="resourceId")return value?snapshot.resources?.find(r=>r.id===value)?.label??"Ресурс недоступен":"Не назначен";
 if(name==="durationUnit")return value==="working_days"?"Рабочие дни":"Календарные дни";
 if(name==="calendarBasis"){
  if(!value)return "Без рабочего календаря";
  const c=snapshot.calendarLibrary?.find(r=>r.id===value.id&&r.version===value.version);
  return (c?.name??"Недоступный календарь")+" · редакция "+value.version;
 }
 if(name==="estimateDays")return value+(context.durationUnit==="working_days"?" раб. дн.":" кал. дн.");
 if(name==="allocationPct")return value+"%";
 return value==null||value===""?"Не задано":String(value);
}
function reviewField(snapshot,name,before,current,proposed,{oldContext={},currentContext={},contextChanged=false}={}){
 const changedNow=!same(before,current),changedProposal=!same(before,proposed);
 const interpretation=name==="estimateDays"&&contextChanged&&changedProposal;
 const state=interpretation?"CONFLICT":!changedProposal?"CURRENT_ONLY":
  same(current,proposed)?"CONVERGED":changedNow?"CONFLICT":"PROPOSED_ONLY";
 if(!changedNow&&!changedProposal&&!interpretation)return null;
 const selectable=state==="CONFLICT"||state==="PROPOSED_ONLY";
 return {name,label:REVIEW_LABELS[name],before,current,proposed,state,selectable,
  required:state==="CONFLICT",defaultChoice:state==="CONFLICT"?"":selectable?"proposed":"current",
  beforeLabel:reviewValueLabel(snapshot,name,before,oldContext),
  currentLabel:reviewValueLabel(snapshot,name,current,currentContext),
  proposedLabel:reviewValueLabel(snapshot,name,proposed,oldContext),
  proposedInCurrentLabel:reviewValueLabel(snapshot,name,proposed,currentContext),interpretation};
}
function inspectAction(snapshot,project,action){
 let reason=null;
 try{assertPlanActionCurrent(project,action)}catch(error){reason=error instanceof Error?error.message:String(error)}
 if(!reason)return null;
 const item=action.kind==="work"?project.items.find(w=>w.id===action.itemId):null;
 const title=action.kind==="dates"?"Даты проекта":action.kind==="work"?item?.title??"Работа недоступна":
  action.kind==="dependency"?(project.items.find(w=>w.id===action.from)?.title??"Работа")+" → "+
   (project.items.find(w=>w.id===action.to)?.title??"Работа"):action.title;
 const row={key:key(action),kind:action.kind,title,reason,fields:[],canReview:false,alreadySatisfied:false};
 if(action.kind==="dates"||action.kind==="work"&&item){
  const current=action.kind==="dates"?dateFields(project):workFields(item);
  const known=action.kind==="dates"?REVIEW_DATE_FIELDS:[...REVIEW_WORK_FIELDS,"durationUnit","calendarBasis"];
  if(Object.keys(action.before).some(k=>!known.includes(k))||Object.keys(action.after).some(k=>!(action.kind==="dates"?REVIEW_DATE_FIELDS:REVIEW_WORK_FIELDS).includes(k)))
   return {...row,reason:"В заявке есть неподдерживаемые поля. Исключите эту корректировку и создайте её заново."};
  const oldContext={durationUnit:action.before.durationUnit??current.durationUnit,
   calendarBasis:Object.hasOwn(action.before,"calendarBasis")?action.before.calendarBasis:current.calendarBasis};
  const contextChanged=action.kind==="work"&&(!same(oldContext.durationUnit,current.durationUnit)||!same(oldContext.calendarBasis,current.calendarBasis));
  const fields=(action.kind==="dates"?REVIEW_DATE_FIELDS:REVIEW_WORK_FIELDS).map(name=>reviewField(snapshot,name,action.before[name],current[name],action.after[name],{
   oldContext,currentContext:current,contextChanged})).filter(Boolean);
  if(contextChanged)for(const name of ["durationUnit","calendarBasis"]){
   if(same(oldContext[name],current[name]))continue;
   fields.push({name,label:REVIEW_LABELS[name],state:"CONTEXT_CHANGED",selectable:false,
    beforeLabel:reviewValueLabel(snapshot,name,oldContext[name]),currentLabel:reviewValueLabel(snapshot,name,current[name]),
    proposedLabel:reviewValueLabel(snapshot,name,oldContext[name])});
  }
  return {...row,fields,canReview:true};
 }
 if(action.kind==="dependency"){
  const current=edgePresent(project,action.from,action.to);
  const present=value=>value?"Связь есть":"Связи нет";
  const alreadySatisfied=current===action.after;
  return {...row,alreadySatisfied,canReview:alreadySatisfied,
   fields:[{name:"presence",label:"Зависимость",state:alreadySatisfied?"CONVERGED":"BLOCKED",selectable:false,
    beforeLabel:present(action.before),currentLabel:present(current),proposedLabel:present(action.after)}]};
 }
 return row;
}
/** Read-only explanation of stale actions; no forecast, rebase or writes. */
export function inspectPlanAmendment(snapshot,projectId,changeId){
 validate(snapshot);
 const {project,change}=find(snapshot,projectId,changeId);
 let sourceIssue=null;
 try{pinnedSource(snapshot,project,change)}catch(error){sourceIssue=error instanceof Error?error.message:String(error)}
 const editable=eligible(change)&&!sourceIssue;
 const rows=change.planAppliedAt?[]:(change.planAmendments??[]).map(a=>inspectAction(snapshot,project,a)).filter(Boolean);
 return {projectId,changeId,revision:snapshot.revision,status:change.status,editable,sourceIssue,
  needsDeferral:!change.planAppliedAt&&["approved","in_progress"].includes(change.status),rows};
}
export function planAmendmentReviewAction(changeId,actionKey,revision){
 return "amend-review:"+encodeURIComponent(changeId)+":"+encodeURIComponent(actionKey)+":"+revision;
}
export function parsePlanAmendmentReviewAction(action){
 const parts=action.slice("amend-review:".length).split(":");
 if(!action.startsWith("amend-review:")||parts.length!==3||!parts[0]||!parts[1]||!/^\d+$/.test(parts[2])||!Number.isSafeInteger(Number(parts[2])))
  throw Error("Неверная ссылка на пересмотр заявки");
 return {changeId:decodeURIComponent(parts[0]),actionKey:decodeURIComponent(parts[1]),revision:Number(parts[2])};
}
export function planAmendmentReviewContext(snapshot,projectId,request){
 if(snapshot.revision!==request.revision)throw Error("План изменился после открытия пересмотра. Откройте его заново.");
 const view=inspectPlanAmendment(snapshot,projectId,request.changeId);
 if(!view.editable)throw Error(view.sourceIssue??"Уточнять корректировку можно только до утверждения");
 const row=view.rows.find(r=>r.key===request.actionKey);
 if(!row?.canReview)throw Error("Корректировка не требует такого пересмотра или должна быть исключена вручную");
 return row;
}
/** Explicit three-way review of ONE existing action in the ordinary draft.
 * Independent current edits survive, conflicting values require a choice.
 * Other actions, approval history, actual Work and Store are untouched.
 */
export function reviewPlanAmendmentAction(snapshot,projectId,request,choices){
 const row=planAmendmentReviewContext(snapshot,projectId,request);
 const allowed=new Set(row.fields.filter(f=>f.selectable).map(f=>f.name));
 if(!choices||typeof choices!=="object"||Array.isArray(choices)||Object.keys(choices).some(k=>!allowed.has(k)))
  throw Error("Недопустимые поля пересмотра");
 let removed=false;
 const result=mutableDraft(snapshot,projectId,request.changeId,(project,change)=>{
  const position=change.planAmendments.findIndex(a=>key(a)===request.actionKey);
  const old=change.planAmendments[position];
  if(old.kind==="dependency"&&row.alreadySatisfied){change.planAmendments.splice(position,1);removed=true;return;}
  const current=old.kind==="dates"?dateFields(project):workFields(project.items.find(w=>w.id===old.itemId));
  const after=old.kind==="dates"?{...current}:Object.fromEntries(REVIEW_WORK_FIELDS.map(name=>[name,current[name]]));
  for(const f of row.fields.filter(f=>f.selectable)){
   const selected=choices[f.name]??f.defaultChoice;
   if(!["current","proposed"].includes(selected))throw Error("Выберите значение: "+f.label);
   if(selected==="proposed")after[f.name]=f.proposed;
  }
  const unchanged=Object.entries(after).every(([name,value])=>same(current[name],value));
  if(unchanged){change.planAmendments.splice(position,1);removed=true;}
  else change.planAmendments[position]={...old,before:current,after};
 });
 // Full graph/calendar/portfolio validation remains in the normal forecast
 // and approval route. Other stale actions can be reviewed independently.
 return {...result,changeId:request.changeId,removed};
}

export function checkPlanAmendment(snapshot,projectId,changeId) {
 validate(snapshot);
 const {project,change}=find(snapshot,projectId,changeId);
 const actions=change.planAmendments||[];
 if(!actions.length)throw Error("В заявке не указаны конкретные корректировки плана");
 if(change.planAppliedAt)throw Error("Корректировка уже применена");
 pinnedSource(snapshot,project,change);
 for(const action of actions)assertPlanActionCurrent(project,action);
 // Check the whole candidate with the existing validator. Separate
 // proposals may each be possible yet become cyclic in combination.
 if(actions.some(a=>a.kind==="dependency"))amendmentCandidate(snapshot,projectId,changeId,actions);
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
 // Remove explicitly proposed old edges before adding the new edges.
 // Only the final combined DAG is validated, not an artificial order of
 // individual mutations. No Work or cross-project relation is invented.
 const changes=actions.filter(a=>a.kind==="dependency");
 if(changes.length){
  const removed=new Set(changes.filter(a=>!a.after).map(a=>JSON.stringify([a.from,a.to])));
  project.dependencies=project.dependencies.filter(e=>!removed.has(JSON.stringify([e.from,e.to])));
  for(const a of changes)if(a.after)project.dependencies.push({from:a.from,to:a.to});
 }
}
function amendmentCandidate(snapshot,projectId,changeId,actions){
 const candidate=structuredClone(snapshot),{project,change}=find(candidate,projectId,changeId);
 applyToProject(project,change,actions);
 change.planAmendments=[];
 validate(candidate);
 return candidate;
}
const dateDelta=(before,after)=>before&&after?
 (Date.parse(after+"T00:00:00Z")-Date.parse(before+"T00:00:00Z"))/86400000:null;
const slip=(due,finish)=>due&&finish?Math.max(0,dateDelta(due,finish)):null;

function amendmentPlanningContext(snapshot){
 const forecast=portfolioSchedule(snapshot);
 return {forecast,resources:portfolioResources(snapshot,{schedule:forecast})};
}
// Exact project-adjusted CPM rows. A paused project or an unknown upstream
// finish must not acquire fabricated dates or critical-path claims.
function amendmentWorkPlan(snapshot,project,forecast){
 if(!forecast?.projectedStart||!forecast.projectedFinish)return new Map();
 const plan=scheduleProject(project,{calendarLibrary:snapshot.calendarLibrary??[],
  startDate:forecast.projectedStart});
 if(plan.estimatedFinish!==forecast.projectedFinish)throw Error("Расчёты плана и портфеля различаются");
 return new Map(plan.rows.map(row=>[row.id,row]));
}
function workProjection(item,row){
 if(!item)return null;
 return {start:row?.startDate??null,finish:row?.finishDate??null,
  critical:row?.critical??null,floatDays:row?.floatDays??null,
  estimateDays:item.estimateDays??1,durationUnit:item.durationUnit??"elapsed_days",
  dueDate:item.dueDate??null,slipDays:slip(item.dueDate,row?.finishDate),
  assignee:item.assignee||"",resourceId:item.resourceId??null,allocationPct:item.allocationPct??100};
}
function amendmentWorkComparison(snapshot,candidate,ids,before,after){
 const workRows=[],workSummary={affected:0,moved:0,criticalChanged:0,
  reserveReduced:0,newlyLate:0,worsenedLate:0,resolvedLate:0,
  controlChanged:0,newlyUndated:0,added:0,unknown:0};
 const beforeProjects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const afterProjects=new Map(candidate.projects.map(p=>[p.id,p]));
 const resourceLabels=new Map((snapshot.resources??[]).map(r=>[r.id,r.label]));
 for(const projectId of ids){
  const p=beforeProjects.get(projectId),next=afterProjects.get(projectId);
  const oldPlan=amendmentWorkPlan(snapshot,p,before.byId.get(projectId));
  const nextPlan=amendmentWorkPlan(candidate,next,after.byId.get(projectId));
  const previous=new Map(p.items.map(w=>[w.id,w]));
  const baseline=p.planBaselines?.at(-1)??null;
  const reference=new Map((baseline?.work??[]).map(w=>[w.id,w]));
  for(const item of next.items){
   const prior=previous.get(item.id),historical=reference.get(item.id);
   const a=workProjection(prior,oldPlan.get(item.id));
   const b=workProjection(item,nextPlan.get(item.id));
   if(!b.finish)workSummary.unknown++;
   if(a&&same(a,b))continue;
   const controlChanged=Boolean(a&&a.dueDate!==b.dueDate);
   const shiftDays=dateDelta(a?.finish,b.finish);
   const startShiftDays=dateDelta(a?.start,b.start);
   const criticalChanged=a?.critical!=null&&b.critical!=null&&a.critical!==b.critical;
   const reserveReduced=a?.floatDays!=null&&b.floatDays!=null&&b.floatDays<a.floatDays;
   // Changing/removing a deadline must never masquerade as fixing a missed date.
   const comparableDeadline=Boolean(a&&!controlChanged&&a.slipDays!==null&&b.slipDays!==null);
   const newlyLate=Boolean(comparableDeadline&&a.slipDays===0&&b.slipDays>0);
   const worsenedLate=Boolean(comparableDeadline&&a.slipDays>0&&b.slipDays>a.slipDays);
   const resolvedLate=Boolean(comparableDeadline&&a.slipDays>0&&b.slipDays===0);
   const newlyUndated=Boolean(a?.finish&&!b.finish);
   workSummary.affected++;
   if(shiftDays||startShiftDays)workSummary.moved++;
   if(!a)workSummary.added++;
   if(criticalChanged)workSummary.criticalChanged++;
   if(reserveReduced)workSummary.reserveReduced++;
   if(newlyLate)workSummary.newlyLate++;
   if(worsenedLate)workSummary.worsenedLate++;
   if(resolvedLate)workSummary.resolvedLate++;
   if(controlChanged)workSummary.controlChanged++;
   if(newlyUndated)workSummary.newlyUndated++;
   workRows.push({projectId,projectName:p.name,workId:item.id,title:item.title,before:a,after:b,
    baselineName:baseline?.name??null,baselineFinish:historical?.finishDate??null,
    baselineDueDate:historical?.dueDate??null,
    beforeResource:resourceLabels.get(a?.resourceId)??null,afterResource:resourceLabels.get(b.resourceId)??null,
    shiftDays,startShiftDays,criticalChanged,reserveReduced,controlChanged,newlyLate,worsenedLate,resolvedLate,newlyUndated,
    beforeBaselineShift:dateDelta(historical?.finishDate,a?.finish),
    afterBaselineShift:dateDelta(historical?.finishDate,b.finish)});
  }
 }
 workRows.sort((a,b)=>Number(b.newlyUndated)-Number(a.newlyUndated)||
  Number(b.newlyLate||b.worsenedLate)-Number(a.newlyLate||a.worsenedLate)||
  Number(b.controlChanged)-Number(a.controlChanged)||Number(b.reserveReduced)-Number(a.reserveReduced)||
  Math.abs(b.shiftDays??0)-Math.abs(a.shiftDays??0)||
  a.projectName.localeCompare(b.projectName,"ru")||a.title.localeCompare(b.title,"ru")||
  a.projectId.localeCompare(b.projectId)||a.workId.localeCompare(b.workId));
 return {workRows,workSummary};
}

function forecastAmendment(snapshot,projectId,changeId,context){
 const {actions}=checkPlanAmendment(snapshot,projectId,changeId);
 const {forecast:before,resources:beforeResources}=context;
 // Preview and actual application share the same plan operations.
 const candidate=amendmentCandidate(snapshot,projectId,changeId,actions);
 const after=portfolioSchedule(candidate),afterResources=portfolioResources(candidate,{schedule:after});
 const affected=new Set([projectId]),links=snapshot.portfolioLinks||[];
 const outgoing=new Map(snapshot.projects.map(p=>[p.id,[]]));
 for(const edge of links)outgoing.get(edge.from).push(edge.to);
 const queue=[projectId];
 for(let i=0;i<queue.length;i++)for(const id of outgoing.get(queue[i]))if(!affected.has(id)){
  affected.add(id);queue.push(id);
 }
 const projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const rows=before.rows.filter(r=>affected.has(r.id)).map(r=>{
  const updated=after.byId.get(r.id),baseline=projects.get(r.id).planBaselines?.at(-1)??null;
  return {id:r.id,name:r.name,downstream:r.id!==projectId,
   beforeStart:r.projectedStart,afterStart:updated.projectedStart,
   beforeFinish:r.projectedFinish,afterFinish:updated.projectedFinish,
   beforeDeadline:r.deadline,afterDeadline:updated.deadline,
   beforeSlip:r.deadlineSlipDays,afterSlip:updated.deadlineSlipDays,
   beforeDuration:r.durationDays,afterDuration:updated.durationDays,
   baselineName:baseline?.name??null,baselineFinish:baseline?.forecastFinish??null,
   baselineDeadline:baseline?.deadline??null,
   beforeBaselineShift:dateDelta(baseline?.forecastFinish,r.projectedFinish),
   afterBaselineShift:dateDelta(baseline?.forecastFinish,updated.projectedFinish),
   changed:r.projectedStart!==updated.projectedStart||r.projectedFinish!==updated.projectedFinish||
    r.deadline!==updated.deadline||r.durationDays!==updated.durationDays||
    r.deadlineSlipDays!==updated.deadlineSlipDays};
 });
 const resourceRows=comparePlanningResourceGroups(beforeResources,afterResources).map(r=>({...r,
  beforeOverload:r.overloadBefore,afterOverload:r.overloadAfter,
  beforeUnavailable:r.availabilityBefore,afterUnavailable:r.availabilityAfter,
  beforeMaxLoad:r.peakBefore,afterMaxLoad:r.peakAfter}));
 const resourceBefore=planningResourceTotals(beforeResources),resourceAfter=planningResourceTotals(afterResources);
 const work=amendmentWorkComparison(snapshot,candidate,affected,before,after);
 const dependencyRows=actions.filter(a=>a.kind==="dependency").map(a=>{
  const p=projects.get(projectId);
  return {...a,fromTitle:p.items.find(w=>w.id===a.from).title,toTitle:p.items.find(w=>w.id===a.to).title};
 });
 const projectSummary={
  newlyLate:rows.filter(r=>r.beforeDeadline===r.afterDeadline&&r.beforeSlip===0&&r.afterSlip>0).length,
  worsenedLate:rows.filter(r=>r.beforeDeadline===r.afterDeadline&&r.beforeSlip>0&&r.afterSlip>r.beforeSlip).length,
  resolvedLate:rows.filter(r=>r.beforeDeadline===r.afterDeadline&&r.beforeSlip>0&&r.afterSlip===0).length,
  controlChanged:rows.filter(r=>r.beforeDeadline!==r.afterDeadline).length,
  unknown:rows.filter(r=>!r.afterFinish).length
 };
 return {rows,resourceRows,resourceBefore,resourceAfter,projectSummary,dependencyRows,...work,
  changed:rows.filter(r=>r.changed).length,affected:rows.length,actions:actions.length};
}
export function previewPlanAmendment(snapshot,projectId,changeId) {
 return forecastAmendment(snapshot,projectId,changeId,amendmentPlanningContext(snapshot));
}

/**
 * Compare exactly two independent existing unapplied change proposals on
 * the SAME current portfolio. No new scenario store or automatically selected
 * decision. An invalid/stale option does not erase the other option.
 */
export function comparePlanAmendments(snapshot,projectId,firstId,secondId){
 if(!firstId||!secondId||firstId===secondId)throw Error("Выберите две разные заявки");
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error("Проект не найден");
 const context=amendmentPlanningContext(snapshot);
 const options=[firstId,secondId].map(id=>{
  const change=(project.changes??[]).find(c=>c.id===id);
  const identity={id,title:change?.title??"Заявка не найдена",status:change?.status??null};
  try{
   if(!change||change.planAppliedAt||!["proposed","deferred","approved","in_progress"].includes(change.status))
    throw Error("Заявка больше недоступна для сравнения");
   return {...identity,valid:true,preview:forecastAmendment(snapshot,projectId,id,context)};
  }catch(error){return {...identity,valid:false,reason:error instanceof Error?error.message:"Сценарий недоступен"};}
 });
 return {projectId,revision:snapshot.revision,options};
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
 if(action.kind==="dependency"){
  const from=project.items.find(w=>w.id===action.from)?.title??"Работа";
  const to=project.items.find(w=>w.id===action.to)?.title??"Работа";
  return (action.after?"Добавить связь: ":"Удалить связь: ")+from+" → "+to;
 }
 if(action.kind==="work"){
  const name=project.items.find(x=>x.id===action.itemId)?.title||"Работа";
  return "Работа «"+name+"»: "+action.before.estimateDays+" → "+action.after.estimateDays+
   (action.before.durationUnit==="working_days"?" раб. дн.; ":" кал. дн.; ")+
   (action.before.assignee||"без ответственного")+" → "+(action.after.assignee||"без ответственного")+
   "; срок "+shownDate(action.before.dueDate)+" → "+shownDate(action.after.dueDate)+
   "; плановый ресурс "+(action.before.resourceId||"не назначен")+" → "+(action.after.resourceId||"не назначен")+
   "; загрузка "+(action.before.allocationPct??100)+"% → "+(action.after.allocationPct??100)+"%";
 }
 return "Новая работа «"+action.title+"»: "+action.estimateDays+" дн.; "+
  (action.assignee||"ответственный не назначен")+"; срок "+shownDate(action.dueDate)+"; плановая загрузка "+(action.allocationPct??100)+"%";
}
function renderPlanAmendmentReview(snapshot,projectId,changeId,escape){
 const view=inspectPlanAmendment(snapshot,projectId,changeId);
 if(!view.rows.length&&!view.sourceIssue)return "";
 return '<div class="atlas-plan-review"><h4>Исходные данные заявки изменились</h4>'+
  (view.sourceIssue?'<p>'+escape(view.sourceIssue)+'</p>':"")+
  (view.needsDeferral?'<p>Для пересмотра утверждённой заявки сначала отложите её через решение.</p><button data-action="change:'+escape(changeId)+'">Открыть решение</button>':"")+
  view.rows.map(r=>'<article><strong>'+escape(r.title)+'</strong><p>'+escape(r.reason)+'</p><ul>'+r.fields.map(f=>
   '<li>'+escape(f.label)+': было '+escape(f.beforeLabel)+'; сейчас '+escape(f.currentLabel)+'; предлагалось '+escape(f.proposedLabel)+'</li>').join("")+'</ul>'+
   (view.editable&&r.canReview?'<button data-action="'+escape(planAmendmentReviewAction(changeId,r.key,view.revision))+'">Пересмотреть корректировку</button>':"")+'</article>').join("")+'</div>';
}
export function renderProjectPlanAmendments(snapshot,projectId,{previewId=null,escape=esc}={}) {
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)return "";
 const changes=(project.changes||[]).filter(c=>c.planAmendments?.length||
  ["proposed","deferred","approved","in_progress"].includes(c.status)).slice(-25).reverse();
 if(!changes.length)return "";
 const cards=changes.map(change=>{
  const actions=change.planAmendments||[],canEdit=eligible(change);
  let buttons="";
  if(canEdit){
   buttons='<button data-action="amend-dates:'+escape(change.id)+'">Даты проекта</button> '+
    (project.items.length?'<button data-action="amend-work:'+escape(change.id)+'">Изменить работу</button> ':"")+
    (project.items.length>1?'<button data-action="amend-dependency:'+escape(change.id)+'">Изменить связь</button> ':"")+
    '<button data-action="amend-new:'+escape(change.id)+'">Добавить работу в план</button> ';
  }
  if(actions.length&&!change.planAppliedAt)buttons+='<button data-action="preview-amendment:'+escape(change.id)+'">'+
   (previewId===change.id?"Скрыть расчёт":"Посмотреть последствия")+'</button> ';
  if(canEdit&&actions.length)buttons+='<button data-action="change:'+escape(change.id)+'">Рассмотреть утверждение</button> ';
  if(!actions.length&&["approved","in_progress"].includes(change.status))
   buttons+='<button data-action="work-change:'+escape(change.id)+'">Создать связанную работу</button> ';
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
    preview='<p class="muted">Календарный CPM по сохранённым единицам работ: '+view.affected+
     ' проектов по цепочке, изменены расчётные показатели у '+view.changed+
     '. Назначение ответственных не является проверкой доступности ресурсов.</p>'+
     '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Проект</th><th>Расчётное завершение</th><th>Контрольная дата</th><th>Риск срока, дни</th></tr></thead><tbody>'+tr+'</tbody></table></div>'+
     (view.rows.length>20?'<p class="muted">Показаны первые 20 проектов из '+view.rows.length+'.</p>':"")+capacity+
     (["approved","in_progress"].includes(change.status)?
       '<button class="primary" data-action="apply-amendment:'+escape(change.id)+'">Применить утверждённую корректировку</button>':"");
   }catch(e){preview='<p class="atlas-source-error">Применение приостановлено: '+escape(e.message||String(e))+'</p>';
    try{preview+=renderPlanAmendmentReview(snapshot,projectId,change.id,escape)}catch(_error){/* preserve the actual forecast failure */}}

  }
  return '<article class="atlas-response-plan" id="atlas-amendment-'+escape(encodeURIComponent(change.id))+'" tabindex="-1"><h3>'+escape(change.title)+'</h3>'+
   '<p class="muted">Статус: '+escape(change.status)+(change.planAppliedAt?" · план изменён "+escape(change.planAppliedAt):"")+'</p>'+
   (list?'<ul>'+list+'</ul>':'<p class="muted">Конкретные параметры пока не указаны.</p>')+
   '<div class="row">'+buttons+'</div>'+preview+'</article>';
 }).join("");
 return '<section class="card" id="atlas-plan-amendments"><h2>Конкретные корректировки утверждаемого плана</h2>'+
  '<p class="muted">До решения укажите сроки, работы и ответственных. После утверждения сравните расчёт по всему зависимому портфелю и отдельно подтвердите применение. План и источники не меняются автоматически.</p>'+
  cards+(project.changes.length>25?'<p class="muted">Показаны последние 25 заявок с корректировками.</p>':"")+
  '</section>';
}

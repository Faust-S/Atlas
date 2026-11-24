// Bounded portfolio resource leveling by explicit project-start alternatives.
// Canonical Atlas CPM, existing resource occupancy and ordinary change proposals.
// No execution, calendars of actual availability, new scheduler or scenario store.
import {validate} from "./core.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {createScheduleProjectionMemo} from "./planning.mjs";
import {portfolioResources,planningResourceTotals,resourceWorkConflicts} from "./portfolio-resources.mjs";
import {planChange} from "./trace.mjs";
import {setPlanDates,comparePortfolioPlanSets,canShiftUnstartedProject as eligible,
 inspectResourceShiftConstraints,resourceShiftMetricKeys as keys} from "./plan-amendment.mjs";

const DAY=86400000;
const MAX_PROJECTS=4,MAX_DELAY=7,EXACT_LIMIT=128,BEAM_WIDTH=3;
const plus=(date,days)=>{
 const d=new Date(Date.parse(date+"T00:00:00Z")+days*DAY);
 if(!Number.isFinite(d.valueOf())||d.getUTCFullYear()>9999)return null;
 return d.toISOString().slice(0,10);
};
const late=(due,finish)=>due&&finish?Math.max(0,(Date.parse(finish+"T00:00:00Z")-Date.parse(due+"T00:00:00Z"))/DAY):null;
const metrics=g=>Object.fromEntries(keys.map(k=>[k,g[k]]));
const cmp=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i]}return 0};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function resourceContext(snapshot,resourceId){
 const scheduleMemo=createScheduleProjectionMemo();
 const schedule=portfolioSchedule(snapshot,{scheduleMemo}),resources=portfolioResources(snapshot,{schedule,scheduleMemo});
 const group=resources.byId.get(resourceId);
 if(!group)throw Error("Плановый ресурс не найден");
 const projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const conflicting=new Set();
 for(const id of new Set(group.work.map(w=>w.projectId)))
  if(resourceWorkConflicts(group,id).size)conflicting.add(id);
 // Only projects participating in an actual conflict may be selected. Others
 // still participate in every calculation and can constrain the solution.
 const candidates=[...conflicting].map(id=>{
  const p=projects.get(id),r=schedule.byId.get(id);
  const available=Boolean(eligible(p)&&r.projectedStart&&r.projectedFinish);
  return {id,name:p.name,startDate:p.startDate??null,projectedStart:r.projectedStart,
   finish:r.projectedFinish,deadline:p.dueDate??null,
   reserveDays:p.dueDate&&r.projectedFinish?(Date.parse(p.dueDate+"T00:00:00Z")-Date.parse(r.projectedFinish+"T00:00:00Z"))/DAY:null,
   available,reason:available?null:"Нельзя переносить начатый, завершённый, приостановленный или недатированный проект"};
 });
 candidates.sort((a,b)=>Number(b.available)-Number(a.available)||a.name.localeCompare(b.name,"ru")||a.id.localeCompare(b.id));
 const deadlines=new Map(snapshot.projects.flatMap(p=>p.items.map(w=>[JSON.stringify([p.id,w.id]),w.dueDate??null])));
 return {schedule,resources,group,projects,candidates,deadlines,scheduleMemo};
}
/** Resource choice and explicit list of movable projects. No mutation. */
export function inspectResourceLeveling(snapshot,resourceId){
 validate(snapshot);
 const c=resourceContext(snapshot,resourceId);
 return {resourceId,resourceLabel:c.group.label,before:metrics(c.group),undatedWork:c.group.undatedWork,
  candidates:c.candidates,maxProjects:MAX_PROJECTS,maxDelay:MAX_DELAY};
}

function normalize(c,selection){
 if(!Array.isArray(selection)||!selection.length||selection.length>MAX_PROJECTS)
  throw Error("Выберите от одного до четырёх проектов");
 const ids=new Set();
 return selection.map(ref=>{
  if(!ref||typeof ref.projectId!=="string"||ids.has(ref.projectId)||
   !Number.isSafeInteger(ref.maxDelay)||ref.maxDelay<1||ref.maxDelay>MAX_DELAY)
   throw Error("Для каждого проекта укажите уникальный выбор и предел от 1 до 7 дней");
  const p=c.candidates.find(p=>p.id===ref.projectId);
  if(!p?.available)throw Error("Проект недоступен для переноса начала");
  ids.add(ref.projectId);
  return {projectId:ref.projectId,maxDelay:ref.maxDelay};
 });
}
function deadlineIncrease(before,after){
 if(before===null)return {increase:0,lost:false};
 if(after===null)return {increase:0,lost:true};
 return {increase:Math.max(0,after-before),lost:false};
}
function evaluate(snapshot,c,selection,vector){
 const shifts=new Map(selection.map((r,i)=>[r.projectId,vector[i]]).filter(([,d])=>d>0));
 const projects=snapshot.projects.map(p=>shifts.has(p.id)?{...p,startDate:plus(p.startDate,shifts.get(p.id))}:p);
 if(projects.some(p=>shifts.has(p.id)&&(!p.startDate||p.dueDate&&p.startDate>p.dueDate)))
  return {vector:[...vector],invalid:"HORIZON"};
 const candidate={...snapshot,projects};
 let after,resources;
 try{
  after=portfolioSchedule(candidate,{scheduleMemo:c.scheduleMemo});
  resources=portfolioResources(candidate,{schedule:after,scheduleMemo:c.scheduleMemo});
 }catch{return {vector:[...vector],invalid:"CALCULATION"}}
 const guardState=inspectResourceShiftConstraints(snapshot,c.schedule,after,c.resources,resources,[c.group.id]);
 const {lost,fixedMoved,unknownMoved,excessIncrease}=guardState;
 let projectIncrease=0,workIncrease=0,worsenedProjects=0,worsenedWorks=0;
 for(const b of c.schedule.rows){
  const a=after.byId.get(b.id);
  const delta=deadlineIncrease(b.deadlineSlipDays,a.deadlineSlipDays);
  projectIncrease+=delta.increase;
  if(delta.increase)worsenedProjects++;
 }
 const nextWorks=new Map(resources.work.map(w=>[JSON.stringify([w.projectId,w.id]),w]));
 for(const b of c.resources.work){
  const key=JSON.stringify([b.projectId,b.id]),a=nextWorks.get(key);
  if(b.finishDate&&!a?.finishDate)continue;
  const due=c.deadlines.get(key),delta=deadlineIncrease(late(due,b.finishDate),late(due,a?.finishDate));
  workIncrease+=delta.increase;if(delta.increase)worsenedWorks++;
 }
 const target=metrics(resources.byId.get(c.group.id));
 const worseResources=guardState.worsenedResources.length;
 const otherWorse=guardState.worsenedResources.filter(id=>id!==c.group.id).length;
 const reduced=!guardState.notImproved.length;
 // Neither missing dates nor moving a conflict to another resource counts
 // as a successful alternative. Intermediate nodes can still be explored.
 const admissible=shifts.size>0&&reduced&&!lost&&!fixedMoved&&!worseResources;
 const totals=planningResourceTotals(resources);
 const sum=vector.reduce((a,b)=>a+b,0);
 const resourceRank=[target.unavailablePctDays,target.overloadPctDays,target.unavailableDays,
  target.overloadDays,totals.unavailablePctDays,totals.overloadPctDays];
 const dateRank=[worsenedProjects,projectIncrease,worsenedWorks,workIncrease,unknownMoved];
 const guard=[lost,fixedMoved,worseResources,excessIncrease];
 return {vector:[...vector],admissible,strict:admissible&&!projectIncrease&&!workIncrease,
  target,projectIncrease,workIncrease,worsenedProjects,worsenedWorks,unknownMoved,
  lost,fixedMoved,otherWorse,worseResources,totals,reduced,
  fixedProjectIds:guardState.fixedMovedProjects,worsenedResourceIds:guardState.worsenedResources,
  deadlineRank:[...guard,...dateRank,...resourceRank,...vector,sum],
  resourceRank:[...guard,...resourceRank,...dateRank,...vector,sum]};
}
function draftShifts(snapshot,resourceId,selection,vector,rationale,preserveDeadlines){
 let state=snapshot;const refs=[];
 for(const [i,ref] of selection.entries()){
  if(!vector[i])continue;
  const p=state.projects.find(p=>p.id===ref.projectId),startDate=plus(p.startDate,vector[i]);
  const q=planChange(state,p.id,{title:"Выравнивание ресурса: перенос начала проекта",
   description:rationale});
  state=setPlanDates(q.state,p.id,q.id,{startDate,dueDate:p.dueDate??null,
   levelingGuard:{resourceId,maxDelay:ref.maxDelay,preserveDeadlines}}).state;
  refs.push({projectId:p.id,changeId:q.id});
 }
 return {state,refs};
}
function detailed(snapshot,resourceId,selection,entry){
 const d=draftShifts(snapshot,resourceId,selection,entry.vector,"Расчётный вариант выравнивания планового ресурса.",entry.strict);
 const result=comparePortfolioPlanSets(d.state,d.refs).options[0];
 if(!result.valid)throw Error(result.reason);
 const shifts=selection.flatMap((ref,i)=>{
  if(!entry.vector[i])return [];
  const p=snapshot.projects.find(p=>p.id===ref.projectId);
  const row=result.preview.rows.find(r=>r.id===p.id);
  return [{projectId:p.id,name:p.name,days:entry.vector[i],beforeStart:p.startDate,
   afterStart:plus(p.startDate,entry.vector[i]),beforeFinish:row.beforeFinish,afterFinish:row.afterFinish,
   deadline:p.dueDate??null}];
 });
 // Full canonical preview validates Work deadlines, calendar unknowns and
 // exact conflict dates; never expose a lightweight score as final evidence.
 if(result.preview.applicationBlocker||result.assessment.deadlines.newlyUnknown||result.assessment.warnings.newlyUndatedWork)
  return null;
 return {vector:entry.vector,shifts,target:entry.target,preview:result.preview,
  assessment:result.assessment,projectIncrease:entry.projectIncrease,workIncrease:entry.workIncrease,
  strict:entry.strict};
}
/**
 * Full enumeration up to 128 combinations, otherwise deterministic beam
 * search. Input order gives priority: among equal outcome metrics, minimize
 * the delay of earlier projects first. No optimality claim for beam search.
 * @param {any} snapshot
 * @param {string} resourceId
 * @param {Array<{projectId:string,maxDelay:number}>} selection
 */
export function compareResourceLeveling(snapshot,resourceId,selection){
 validate(snapshot);
 const c=resourceContext(snapshot,resourceId),refs=normalize(c,selection);
 if(!c.group.overloadDays&&!c.group.unavailableDays)throw Error("По известным датам у ресурса нет конфликта");
 const space=refs.reduce((n,r)=>n*(r.maxDelay+1),1),exact=space<=EXACT_LIMIT;
 const visited=new Map();
 const get=vector=>{
  const key=vector.join(",");
  if(!visited.has(key))visited.set(key,evaluate(snapshot,c,refs,vector));
  return visited.get(key);
 };
 const zero=refs.map(()=>0);get(zero);
 if(exact){
  const walk=(i,v)=>{if(i===refs.length){get(v);return}
   for(let n=0;n<=refs[i].maxDelay;n++)walk(i+1,[...v,n]);};
  walk(0,[]);
 }else{
  // Include every single-project shift, and expand a small frontier for
  // each objective. Invalid intermediate states are ranked, not discarded.
  for(const [i,r] of refs.entries())for(let n=1;n<=r.maxDelay;n++){const v=[...zero];v[i]=n;get(v)}
  let frontier=[get(zero)];
  // Consider the least protected project first. Retain the unchanged
  // path as a diversification seed, so a promising single shift never
  // prunes every option preserving higher-priority projects.
  for(const [i,r] of [...refs.entries()].reverse()){
   const layer=new Map();
   for(const parent of frontier.filter(e=>e?.deadlineRank))for(let n=0;n<=r.maxDelay;n++){
    const v=[...parent.vector];v[i]=n;const e=get(v);if(e?.deadlineRank)layer.set(v.join(","),e);
   }
   const all=[...layer.values()];
   frontier=[...new Map([get(zero),...["deadlineRank","resourceRank"].flatMap(rank=>[...all].sort((a,b)=>cmp(a[rank],b[rank])).slice(0,BEAM_WIDTH))]
    .filter(e=>e?.deadlineRank).map(e=>[e.vector.join(","),e])).values()];
  }
 }
 const checked=[...visited.values()];
 const reasons={invalidHorizon:0,calculationUnavailable:0,noReduction:0,fixedMoved:0,lostDates:0,worseResources:0,deadlineCompromise:0};
 const fixedIds=new Set(),resourceIds=new Set();
 for(const e of checked){
  if(!e||!e.vector.some(Boolean))continue;
  if(e.invalid){reasons[e.invalid==="HORIZON"?"invalidHorizon":"calculationUnavailable"]++;continue}
  if(!e.reduced)reasons.noReduction++;
  if(e.fixedMoved)reasons.fixedMoved++;
  if(e.lost)reasons.lostDates++;
  if(e.worseResources)reasons.worseResources++;
  if(e.admissible&&!e.strict)reasons.deadlineCompromise++;
  for(const id of e.fixedProjectIds)fixedIds.add(id);
  for(const id of e.worsenedResourceIds)resourceIds.add(id);
 }
 const entries=checked.filter(e=>e?.admissible);
 const strict=entries.filter(e=>e.strict).sort((a,b)=>cmp(a.deadlineRank,b.deadlineRank));
 const resource=[...entries].sort((a,b)=>cmp(a.resourceRank,b.resourceRank));
 const options=[];
 const add=(list,id,title)=>{
  for(const e of list.slice(0,6)){
   const result=detailed(snapshot,resourceId,refs,e);
   if(!result)continue;
   if(id==="deadlines"&&(result.assessment.deadlines.newlyLate||result.assessment.deadlines.worsenedLate||
    result.assessment.workDeadlines.newlyLate||result.assessment.workDeadlines.worsenedLate))continue;
   const prior=options.find(o=>equal(o.vector,e.vector));
   if(prior){prior.objectives.push(id);return}
   options.push({id,title,objectives:[id],...result});return;
  }
 };
 add(strict,"deadlines","Не ухудшать известные сроки");
 add(resource,"capacity","Сократить ресурсные ограничения");
 return {kind:"ATLAS_RESOURCE_LEVELING",sourceStamp:JSON.stringify(snapshot),revision:snapshot.revision,
  resourceId,resourceLabel:c.group.label,selection:refs,before:metrics(c.group),search:{exact,space,evaluated:visited.size,
   admissible:entries.length,deadlinePreserving:strict.length,reasons,
   fixedProjects:[...fixedIds].map(id=>({id,name:c.projects.get(id)?.name??id})),
   worsenedResources:[...resourceIds].map(id=>({id,name:c.resources.byId.get(id)?.label??id})),
   memo:c.scheduleMemo.stats()},options};
}

/** Prepare ordinary unapproved date amendments; do not apply or write them. */
export function createResourceLevelingProposals(snapshot,comparison,optionId,{rationale}){
 validate(snapshot);
 if(!comparison||comparison.kind!=="ATLAS_RESOURCE_LEVELING"||comparison.revision!==snapshot.revision||
  comparison.sourceStamp!==JSON.stringify(snapshot))throw Error("Портфель изменился. Рассчитайте варианты заново");
 if(typeof rationale!=="string"||rationale.trim().length<8||rationale.trim().length>2000)
  throw Error("Укажите обоснование (от 8 до 2000 символов)");
 const selected=comparison.options?.find(o=>o.id===optionId);
 if(!selected)throw Error("Выберите рассчитанный вариант");
 const c=resourceContext(snapshot,comparison.resourceId),refs=normalize(c,comparison.selection);
 if(!Array.isArray(selected.vector)||selected.vector.length!==refs.length||
  selected.vector.some((d,i)=>!Number.isSafeInteger(d)||d<0||d>refs[i].maxDelay))
  throw Error("Некорректный вариант переноса");
 const entry=evaluate(snapshot,c,refs,selected.vector);
 if(!entry?.admissible)throw Error("Вариант больше не устраняет ограничения");
 const fresh=detailed(snapshot,comparison.resourceId,refs,entry);
 if(!fresh||!equal(fresh.preview,selected.preview)||!equal(fresh.assessment,selected.assessment)||
  !equal(fresh.target,selected.target)||!equal(fresh.shifts,selected.shifts))
  throw Error("Последствия варианта изменились. Рассчитайте заново");
 if(selected.id==="deadlines"&&(!entry.strict||fresh.assessment.deadlines.newlyLate||
  fresh.assessment.deadlines.worsenedLate||fresh.assessment.workDeadlines.newlyLate||fresh.assessment.workDeadlines.worsenedLate))
  throw Error("Вариант ухудшает известные контрольные сроки");
 const description="Ресурс: "+c.group.label+". "+rationale.trim()+"\nПереносы: "+
  fresh.shifts.map(s=>s.name+": "+s.beforeStart+" → "+s.afterStart).join("; ")+
  "\nПерегрузка ресурса: "+c.group.overloadDays+" → "+fresh.target.overloadDays+
  " дн.; вне доступности: "+c.group.unavailableDays+" → "+fresh.target.unavailableDays+
  " дн. Дополнительное отставание проектов: "+entry.projectIncrease+" дн.; работ: "+entry.workIncrease+
  " дн. Контрольные сроки не меняются. Согласование и применение выполняются отдельно.";
 const draft=draftShifts(snapshot,comparison.resourceId,refs,entry.vector,description,entry.strict);
 const checked=comparePortfolioPlanSets(draft.state,draft.refs).options[0];
 if(!checked.valid||!equal(checked.preview,fresh.preview)||!equal(checked.assessment,fresh.assessment))
  throw Error("Подготовленные заявки не совпадают с рассчитанным вариантом");
 return draft;
}

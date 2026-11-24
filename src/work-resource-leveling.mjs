// In-project resource leveling: bounded search of explicit earliest-start
// limits. Reuses the original CPM, resource sweep, vector enumerator and
// ordinary Work amendments. No artificial edges or persistent scenarios.
import {validate,isUnstartedWork} from "./core.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {portfolioResources,planningResourceTotals,resourceWorkConflicts} from "./portfolio-resources.mjs";
import {scheduleProject,createScheduleProjectionMemo} from "./planning.mjs";
import {inspectResourceShiftConstraints,inspectWorkShiftConditions,resourceShiftMetricKeys,
 setPlanWork,comparePortfolioPlanSets} from "./plan-amendment.mjs";
import {enumerateResourceShiftVectors} from "./resource-leveling.mjs";
import {planChange} from "./trace.mjs";

const MAX_WORKS=4,MAX_DELAY=7,DAY=86400000;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const compare=(a,b)=>{for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]-b[i]}return 0};
const key=(projectId,workId)=>JSON.stringify([projectId,workId]);
const metrics=g=>Object.fromEntries(resourceShiftMetricKeys.map(k=>[k,g[k]]));
function plus(date,days){
 const value=new Date(Date.parse(date+"T00:00:00Z")+days*DAY);
 return Number.isFinite(value.valueOf())&&value.getUTCFullYear()<=9999?value.toISOString().slice(0,10):null;
}
function context(snapshot,resourceId){
 const memo=createScheduleProjectionMemo(),schedule=portfolioSchedule(snapshot,{scheduleMemo:memo}),
  resources=portfolioResources(snapshot,{schedule,scheduleMemo:memo}),group=resources.byId.get(resourceId);
 if(!group)throw Error("Плановый ресурс не найден");
 const projects=new Map(snapshot.projects.map(p=>[p.id,p])),candidates=[];
 for(const id of group.projects){
  const conflicts=resourceWorkConflicts(group,id);
  if(!conflicts.size)continue;
  const p=projects.get(id),f=schedule.byId.get(id);
  const plan=f?.projectedStart&&f?.projectedFinish?scheduleProject(p,{
   calendarLibrary:snapshot.calendarLibrary??[],startDate:f.projectedStart,memo}):null;
  const rows=new Map((plan?.rows??[]).map(w=>[w.id,w]));
  for(const work of p.items){
   if(!conflicts.has(work.id)||work.resourceId!==resourceId)continue;
   const row=rows.get(work.id),bound=Math.min(MAX_DELAY,row?.floatDays??0);
   const available=Boolean(["planned","active"].includes(p.status)&&isUnstartedWork(work)&&
    p.startDate&&row?.startDate&&row.finishDate&&row.durationDays>0&&bound>0);
   candidates.push({id:key(p.id,work.id),projectId:p.id,projectName:p.name,workId:work.id,title:work.title,
    startDate:row?.startDate??null,finishDate:row?.finishDate??null,notBeforeDate:work.notBeforeDate??null,
    deadline:work.dueDate??null,reserveDays:row?.floatDays??null,maxDelay:available?bound:0,available,
    reason:available?null:!isUnstartedWork(work)?"Работа уже начата или завершена":
     !["planned","active"].includes(p.status)?"Проект недоступен":
     !p.startDate||!row?.startDate||!row.finishDate?"Нет известных расчётных дат":
     !bound?"Нет резерва для переноса":"Работа не занимает ресурс в известные даты"});
  }
 }
 candidates.sort((a,b)=>Number(b.available)-Number(a.available)||a.projectName.localeCompare(b.projectName,"ru")||
  a.title.localeCompare(b.title,"ru")||a.id.localeCompare(b.id));
 return {memo,schedule,resources,group,projects,candidates};
}
export function inspectWorkResourceLeveling(snapshot,resourceId){
 validate(snapshot);
 const c=context(snapshot,resourceId);
 return {resourceId,resourceLabel:c.group.label,before:metrics(c.group),undatedWork:c.group.undatedWork,
  candidates:c.candidates,maxWorks:MAX_WORKS,maxDelay:MAX_DELAY};
}
function normalize(c,selection){
 if(!Array.isArray(selection)||!selection.length||selection.length>MAX_WORKS)
  throw Error("Выберите от одной до четырёх работ");
 const used=new Set();
 return selection.map(ref=>{
  const id=key(ref?.projectId,ref?.workId),w=c.candidates.find(w=>w.id===id);
  if(used.has(id)||!w?.available||!Number.isSafeInteger(ref.maxDelay)||ref.maxDelay<1||ref.maxDelay>w.maxDelay)
   throw Error("Работа недоступна или перенос выходит за её резерв");
  used.add(id);return {projectId:w.projectId,workId:w.workId,maxDelay:ref.maxDelay};
 });
}
function actionsFor(c,refs,vector){
 const actions=[];
 for(const [i,ref] of refs.entries()){
  if(!vector[i])continue;
  const w=c.candidates.find(w=>w.id===key(ref.projectId,ref.workId)),limit=plus(w.startDate,vector[i]);
  if(!limit)return null;
  actions.push({projectId:ref.projectId,action:{kind:"work",itemId:ref.workId,
   after:{notBeforeDate:limit},levelingGuard:{resourceId:c.group.id,sourceStart:w.startDate,
    maxDelay:ref.maxDelay,preserveDeadlines:true}}});
 }
 return actions;
}
function evaluate(snapshot,c,refs,vector){
 const actions=actionsFor(c,refs,vector);
 if(!actions)return {vector:[...vector],invalid:"HORIZON"};
 const byProject=new Map();
 for(const {projectId,action} of actions){
  if(!byProject.has(projectId))byProject.set(projectId,new Map());
  byProject.get(projectId).set(action.itemId,action.after.notBeforeDate);
 }
 const candidate={...snapshot,projects:snapshot.projects.map(p=>{
  const limits=byProject.get(p.id);
  if(!limits)return p;
  return {...p,items:p.items.map(w=>limits.has(w.id)?{...w,notBeforeDate:limits.get(w.id)}:w)};
 })};
 let after,resources,conditions;
 try{
  after=portfolioSchedule(candidate,{scheduleMemo:c.memo});
  resources=portfolioResources(candidate,{schedule:after,scheduleMemo:c.memo});
  conditions=inspectWorkShiftConditions(snapshot,candidate,c.schedule,after,actions,{scheduleMemo:c.memo});
 }catch{return {vector:[...vector],invalid:"CALCULATION"}}
 const resource=inspectResourceShiftConstraints(snapshot,c.schedule,after,c.resources,resources,[c.group.id]);
 const target=metrics(resources.byId.get(c.group.id)),totals=planningResourceTotals(resources);
 const reduced=!resource.notImproved.length;
 const admissible=actions.length>0&&conditions.valid&&reduced&&!resource.lost&&!resource.fixedMoved&&!resource.worsenedResources.length;
 const penalty=Object.values(conditions.issues).reduce((n,v)=>n+v,0);
 const guard=[penalty,resource.lost,resource.fixedMoved,resource.worsenedResources.length,resource.excessIncrease];
 const capacity=[target.unavailablePctDays,target.overloadPctDays,target.unavailableDays,target.overloadDays,
  totals.unavailablePctDays,totals.overloadPctDays];
 const actualMoves=conditions.moves.reduce((n,w)=>n+w.days,0);
 const intervention=[actions.length,actualMoves,conditions.affectedProjects.length];
 return {vector:[...vector],admissible,target,reduced,conditions,resource,actions,
  // Shared enumerator uses two ranks. Here the first objective is minimum
  // intervention, not deadline relaxation: ALL candidates preserve deadlines.
  deadlineRank:[...guard,...intervention,...capacity,...vector],
  resourceRank:[...guard,...capacity,...intervention,...vector]};
}
function draftActions(snapshot,actions,rationale){
 let state=snapshot;const refs=[],byProject=new Map();
 for(const entry of actions){
  if(!byProject.has(entry.projectId))byProject.set(entry.projectId,[]);
  byProject.get(entry.projectId).push(entry.action);
 }
 for(const [projectId,items] of byProject){
  const q=planChange(state,projectId,{title:"Выравнивание ресурса: перенос работ в пределах резервов",
   description:rationale});
  state=q.state;
  for(const a of items){
   const w=state.projects.find(p=>p.id===projectId).items.find(w=>w.id===a.itemId);
   state=setPlanWork(state,projectId,q.id,{itemId:w.id,estimateDays:w.estimateDays??1,
    notBeforeDate:a.after.notBeforeDate,levelingGuard:a.levelingGuard}).state;
  }
  refs.push({projectId,changeId:q.id});
 }
 return {state,refs};
}
function detailed(snapshot,e){
 const draft=draftActions(snapshot,e.actions,"Расчётный перенос работ в пределах резервов.");
 const option=comparePortfolioPlanSets(draft.state,draft.refs).options[0];
 if(!option.valid||option.preview.applicationBlocker)return null;
 return {vector:e.vector,shifts:e.conditions.moves,target:e.target,preview:option.preview,
  assessment:option.assessment,projectIncrease:0,workIncrease:0};
}
export function compareWorkResourceLeveling(snapshot,resourceId,selection){
 validate(snapshot);
 const c=context(snapshot,resourceId),refs=normalize(c,selection);
 if(!c.group.overloadDays&&!c.group.unavailableDays)throw Error("По известным датам у ресурса нет конфликта");
 const {space,exact,checked}=enumerateResourceShiftVectors(refs,v=>evaluate(snapshot,c,refs,v));
 const reasons={invalidHorizon:0,calculationUnavailable:0,noReduction:0,projectMoved:0,
  fixedWorkMoved:0,lostDates:0,stale:0,reserveExceeded:0,deadlineWorse:0,worseResources:0};
 const fixed=new Map(),worse=new Set();
 for(const e of checked){
  if(!e||!e.vector.some(Boolean))continue;
  if(e.invalid){reasons[e.invalid==="HORIZON"?"invalidHorizon":"calculationUnavailable"]++;continue}
  if(!e.reduced)reasons.noReduction++;
  for(const field of ["projectMoved","fixedWorkMoved","stale","reserveExceeded","deadlineWorse"])
   if(e.conditions.issues[field])reasons[field]++;
  if(e.resource.lost||e.conditions.issues.lost)reasons.lostDates++;
  if(e.resource.worsenedResources.length)reasons.worseResources++;
  for(const w of e.conditions.fixedWorks)fixed.set(key(w.projectId,w.workId),w);
  for(const id of e.resource.worsenedResources)worse.add(id);
 }
 const entries=checked.filter(e=>e?.admissible),options=[];
 const add=(rank,id,title)=>{
  for(const e of [...entries].sort((a,b)=>compare(a[rank],b[rank])).slice(0,6)){
   const prior=options.find(o=>equal(o.vector,e.vector));
   if(prior){prior.objectives.push(id);return}
   const option=detailed(snapshot,e);
   if(option){options.push({id,title,objectives:[id],...option});return}
  }
 };
 add("resourceRank","capacity","Сократить ограничения в пределах резервов");
 add("deadlineRank","minimal","Минимальный перенос работ");
 return {kind:"ATLAS_WORK_RESOURCE_LEVELING",sourceStamp:JSON.stringify(snapshot),revision:snapshot.revision,
  resourceId,resourceLabel:c.group.label,selection:refs,before:metrics(c.group),options,
  search:{exact,space,evaluated:checked.length,admissible:entries.length,reasons,
   fixedWorks:[...fixed.values()],worsenedResources:[...worse].map(id=>({id,name:c.resources.byId.get(id)?.label??id})),
   memo:c.memo.stats()}};
}
export function createWorkResourceLevelingProposals(snapshot,comparison,optionId,{rationale}){
 validate(snapshot);
 if(!comparison||comparison.kind!=="ATLAS_WORK_RESOURCE_LEVELING"||comparison.revision!==snapshot.revision||
  comparison.sourceStamp!==JSON.stringify(snapshot))throw Error("Портфель изменился. Рассчитайте варианты заново");
 if(typeof rationale!=="string"||rationale.trim().length<8||rationale.trim().length>2000)
  throw Error("Укажите обоснование (от 8 до 2000 символов)");
 const selected=comparison.options?.find(o=>o.id===optionId);
 if(!selected)throw Error("Выберите рассчитанный вариант");
 const c=context(snapshot,comparison.resourceId),refs=normalize(c,comparison.selection);
 if(!Array.isArray(selected.vector)||selected.vector.length!==refs.length||
  selected.vector.some((d,i)=>!Number.isSafeInteger(d)||d<0||d>refs[i].maxDelay))
  throw Error("Некорректный вариант переноса");
 const e=evaluate(snapshot,c,refs,selected.vector);
 if(!e?.admissible)throw Error("Перенос больше не допустим в пределах резервов");
 const fresh=detailed(snapshot,e);
 if(!fresh||!equal(fresh.preview,selected.preview)||!equal(fresh.assessment,selected.assessment)||
  !equal(fresh.shifts,selected.shifts)||!equal(fresh.target,selected.target))
  throw Error("Последствия варианта изменились. Рассчитайте заново");
 const description="Ресурс: "+c.group.label+". "+rationale.trim()+"\n"+
  fresh.shifts.map(s=>s.projectName+" / "+s.title+": "+s.beforeStart+" → "+s.afterStart+
   "; резерв "+s.beforeReserve+" → "+s.afterReserve+" дн.").join("; ")+
  "\nПерегрузка: "+c.group.overloadDays+" → "+fresh.target.overloadDays+
  " дн. Даты проектов, длительность, контрольные сроки и назначения сохраняются.";
 const result=draftActions(snapshot,e.actions,description);
 const checked=comparePortfolioPlanSets(result.state,result.refs).options[0];
 if(!checked.valid||checked.preview.applicationBlocker||!equal(checked.preview,fresh.preview)||!equal(checked.assessment,fresh.assessment))
  throw Error("Подготовленные заявки не совпадают с расчётом");
 return result;
}

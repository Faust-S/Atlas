// One decision route for a known resource conflict. All alternatives are
// ordinary proposals evaluated by the existing assignment, sequence,
// bounded leveling and portfolio amendment mechanisms. No scenario Store,
// planner, fabricated dependency or automatic application.
import {validate,isUnstartedWork} from "./core.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {portfolioResources,resourceWorkConflicts,resourceOverloadContainsPair,planningResourceTotals} from "./portfolio-resources.mjs";
import {previewWorkResourceReassignment} from "./resource-alternatives.mjs";
import {compareResourceSequenceAlternatives} from "./resource-sequence-alternatives.mjs";
import {inspectWorkResourceLeveling,compareWorkResourceLeveling,createWorkResourceLevelingProposals} from "./work-resource-leveling.mjs";
import {inspectResourceLeveling,compareResourceLeveling,createResourceLevelingProposals} from "./resource-leveling.mjs";
import {addResourcePlanChoice,addSequencePlanChoice,comparePortfolioPlanSets} from "./plan-amendment.mjs";

const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const key=(projectId,workId)=>JSON.stringify([projectId,workId]);
const errorText=e=>e instanceof Error?e.message:String(e);
const active=p=>["planned","active"].includes(p?.status);
const ref=w=>({projectId:w.projectId,workId:w.workId});
const groupMetrics=g=>({overloadDays:g.overloadDays,unavailableDays:g.unavailableDays,
 overloadPctDays:g.overloadPctDays,unavailablePctDays:g.unavailablePctDays});
function buildContext(snapshot,resourceId){
 validate(snapshot);
 const schedule=portfolioSchedule(snapshot),resources=portfolioResources(snapshot,{schedule});
 const group=resources.byId.get(resourceId);
 if(!group)throw Error("Плановый ресурс не найден");
 if(!group.overloadDays&&!group.unavailableDays)throw Error("У ресурса нет известных конфликтов по текущему плану");
 const workLevel=inspectWorkResourceLeveling(snapshot,resourceId);
 const projectLevel=inspectResourceLeveling(snapshot,resourceId);
 const projects=new Map(snapshot.projects.map(p=>[p.id,p]));
 const items=new Map(snapshot.projects.flatMap(p=>p.items.map(w=>[key(p.id,w.id),w])));
 const workCandidates=new Map(workLevel.candidates.map(w=>[w.id,w]));
 const projectCandidates=new Map(projectLevel.candidates.map(p=>[p.id,p]));
 const conflicts=new Map([...group.projects].map(id=>[id,resourceWorkConflicts(group,id)]));
 const participants=group.work.flatMap(w=>{
  const conflict=conflicts.get(w.projectId)?.get(w.id);
  if(!conflict)return [];
  const p=projects.get(w.projectId),item=items.get(key(w.projectId,w.id));
  const wc=workCandidates.get(key(w.projectId,w.id)),pc=projectCandidates.get(w.projectId);
  return [{id:key(w.projectId,w.id),projectId:w.projectId,workId:w.id,projectName:p.name,title:item.title,
   startDate:w.startDate,finishDate:w.finishDate,deadline:item.dueDate??null,
   resourceId:w.resourceId,allocationPct:w.allocationPct,state:item.state,
   ...conflict,unstarted:isUnstartedWork(item),active:active(p),
   canReassign:active(p)&&isUnstartedWork(item),reserveDays:wc?.reserveDays??null,
   maxWorkDelay:wc?.maxDelay??0,workReason:wc?.reason??"Нет известного резерва для переноса",
   canShiftProject:pc?.available===true,projectReason:pc?.reason??"Проект недоступен для переноса"}];
 });
 participants.sort((a,b)=>(b.overloadDays+b.unavailableDays)-(a.overloadDays+a.unavailableDays)||
  a.projectName.localeCompare(b.projectName,"ru")||a.title.localeCompare(b.title,"ru")||a.id.localeCompare(b.id));
 const alternatives=resources.people.filter(r=>r.id!==resourceId).map(r=>({id:r.id,label:r.label,
  capacityPct:r.capacityPct,availableFrom:r.availableFrom,availableUntil:r.availableUntil}));
 return {snapshot,resourceId,schedule,resources,group,projects,items,participants,alternatives};
}
function contextView(c){
 return {resourceId:c.resourceId,resourceLabel:c.group.label,
  current:groupMetrics(c.group),portfolio:planningResourceTotals(c.resources),
  undatedWork:c.group.undatedWork,participants:c.participants,alternatives:c.alternatives,
  maxDelay:7,maxParticipants:4};
}
export function inspectResourceConflictResolution(snapshot,resourceId){
 return contextView(buildContext(snapshot,resourceId));
}
/**
 * Navigate with exact current Work identity, not just its title or an old
 * resource name. The same read-only projection used by the resource table
 * decides whether a conflict still exists.
 * @param {any} resources
 * @param {string} resourceId
 * @param {{projectId:string,workId:string}|null} [focus]
 */
export function resourceConflictEntry(resources,resourceId,focus=null){
 const group=resources?.byId?.get(resourceId);
 if(!group||!group.overloadDays&&!group.unavailableDays)
  throw Error("У ресурса больше нет известного конфликта.");
 if(focus&&(!group.work.some(w=>w.projectId===focus.projectId&&w.id===focus.workId)||
  !resourceWorkConflicts(group,focus.projectId).has(focus.workId)))
  throw Error("Выбранная работа больше не участвует в конфликте этого ресурса.");
 return {resourceId,focus:focus?{projectId:focus.projectId,workId:focus.workId}:null};
}
/**
 * Keep one directly opened resource visible without rendering every earlier row.
 * @param {any[]} people
 * @param {number} limit
 * @param {string|null} [resourceId]
 */
export function resourceConflictPage(people,limit,resourceId=null){
 const rows=people.slice(0,limit);
 if(!resourceId||limit<1||rows.some(r=>r.id===resourceId))return rows;
 const selected=people.find(r=>r.id===resourceId);
 return selected?[selected,...rows.slice(0,-1)]:rows;
}
function normalize(c,input){
 const participant=x=>c.participants.find(w=>w.id===key(x?.projectId,x?.workId));
 const primary=participant(input?.focus),other=input?.companion==null?null:participant(input.companion);
 if(!primary||input?.companion!=null&&(!other||primary.id===other.id))
  throw Error("Выберите разные работы, участвующие в известных конфликтах ресурса");
 const additional=input.additionalWorks===undefined?[]:input.additionalWorks;
 if(!Array.isArray(additional)||additional.length>2||additional.length&&!other)
  throw Error("Выберите до четырёх работ, включая основную и вторую");
 const extra=additional.map(participant),selected=[primary,...(other?[other]:[]),...extra];
 if(extra.some(w=>!w)||new Set(selected.map(w=>w?.id)).size!==selected.length)
  throw Error("Выберите разные работы, участвующие в известных конфликтах ресурса");
 const days=(value,name)=>{
  if(!Number.isSafeInteger(value)||value<0||value>7)throw Error("Укажите от 0 до 7 дней: "+name);
  return value;
 };
 const targets=ids=>{
  if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)
   throw Error("Выберите до трёх разных альтернативных ресурсов для каждой работы");
  if(ids.some(id=>!c.alternatives.some(r=>r.id===id)))
   throw Error("Выберите другой существующий ресурс");
  return [...ids];
 };
 const targetResourceIds=targets(input.targetResourceIds);
 const companionTargetResourceIds=targets(input.companionTargetResourceIds===undefined?[]:input.companionTargetResourceIds);
 if(companionTargetResourceIds.length&&!other)throw Error("Для второго назначения выберите вторую конфликтующую работу");
 if(typeof input.allowSequence!=="boolean")throw Error("Укажите, сравнивать ли технологический порядок");
 const workDelayDays=days(input.workDelayDays,"перенос работ"),projectDelayDays=days(input.projectDelayDays,"перенос проектов");
 if(!targetResourceIds.length&&!companionTargetResourceIds.length&&!workDelayDays&&!projectDelayDays&&!input.allowSequence)
  throw Error("Разрешите хотя бы один способ устранения конфликта");
 return {focus:ref(primary),companion:other?ref(other):null,additionalWorks:extra.map(ref),
  targetResourceIds,companionTargetResourceIds,workDelayDays,projectDelayDays,allowSequence:input.allowSequence};
}
function chosenWorks(c,selection){
 return focusRefs(selection).map(w=>c.participants.find(p=>p.id===key(w.projectId,w.workId)));
}
function focusRefs(selection){return [selection.focus,selection.companion,...(selection.additionalWorks??[])].filter(Boolean)}
function selectedMetrics(c,preview){
 const old=groupMetrics(c.group),row=preview.resourceRows.find(r=>r.id===c.resourceId);
 return {before:old,after:row?{overloadDays:row.overloadAfter,unavailableDays:row.availabilityAfter,
  overloadPctDays:row.overloadDepthAfter,unavailablePctDays:row.availabilityDepthAfter}:{...old}};
}
function compareMetrics(before,after){
 const fields=Object.keys(before);
 return {improved:fields.some(k=>after[k]<before[k]),worsened:fields.some(k=>after[k]>before[k])};
}
function focusChange(w){
 if(!w?.before?.known||!w?.after?.known)return {improved:false,worsened:false,unknown:true};
 return {...compareMetrics({overloadDays:w.before.overloadDays,unavailableDays:w.before.unavailableDays},
  {overloadDays:w.after.overloadDays,unavailableDays:w.after.unavailableDays}),unknown:false};
}
function assess(c,selection,option){
 const {preview,assessment}=option;
 const source=selectedMetrics(c,preview),focus=preview.resourceScope.workChanges.focus;
 const sourceChange=compareMetrics(source.before,source.after),effects=focus.map(focusChange);
 const focusEffect=effects[0],companionEffect=effects[1]??null,additionalEffects=effects.slice(2);
 const movedBegun=preview.workRows.filter(r=>{
  const w=c.items.get(key(r.projectId,r.workId)),p=c.projects.get(r.projectId);
  return w&&(!isUnstartedWork(w)||!active(p))&&
   (r.before?.start!==r.after?.start||r.before?.finish!==r.after?.finish);
 }).map(r=>({projectId:r.projectId,workId:r.workId,title:r.title}));
 const w=assessment.warnings;
 const tradeoff=sourceChange.worsened||effects.some(e=>e.worsened)||Boolean(w.newLate||w.worseLate||
  w.newLateWork||w.worseLateWork||w.newConflictWork||w.worseConflictWork||w.movedConflictResource||
  w.newConflictDates||w.changedConflictKind||w.worseResources);
 const lost=preview.rows.some(r=>r.beforeFinish&&!r.afterFinish)||preview.workSummary.newlyUndated||
  w.undatedIncrease||w.unknownDates||focus.some(x=>x.before?.known&&!x.after?.known);
 const relief=sourceChange.improved||effects.some(e=>e.improved);
 const blocker=preview.applicationBlocker??(lost?"Теряются известные даты или ресурсный расчёт.":
  movedBegun.length?"Изменяются даты уже начатых или недоступных работ.":
  !relief?"Не уменьшает известный конфликт выбранного ресурса или работы.":null);
 return {source,focus,sourceChange,focusEffect,companionEffect,additionalEffects,tradeoff,
  classification:blocker?"BLOCKED":tradeoff?"TRADEOFF":focus[0]?.after?.known&&
   !focus[0].after.overloadDays&&!focus[0].after.unavailableDays?"FOCUS_CLEARED":"RELIEVED",
  canDraft:!blocker,blocker,movedBegun};
}
function titleFor(kind,changes){
 if(kind==="assignment")return changes.resourceLabel;
 if(kind==="sequence")return changes.fromTitle+" → "+changes.toTitle;
 if(kind==="work_shift")return changes.title;
 return changes.title;
}
function optionFrom(c,selection,spec){
 try{
  // Only a normal, unapproved, ephemeral proposal is created for analysis.
  // Compare on the complete same portfolio and exact selected Work records.
  const draft=spec.make("Расчётный вариант устранения ресурсного конфликта.");
  const checked=comparePortfolioPlanSets(draft.state,draft.refs,null,{focusWorks:focusRefs(selection)}).options[0];
  if(!checked.valid)throw Error(checked.reason);
  const {preview,assessment}=checked;
  return {...spec.identity,valid:true,preview,assessment,
   ...assess(c,selection,checked)};
 }catch(e){return {...spec.identity,valid:false,canDraft:false,reason:errorText(e)}}
}
function unavailable(id,kind,title,reason,search=null){
 return {id,kind,title,valid:false,canDraft:false,reason,...(search?{search}:{})};
}
function derive(c,selection,onlyId=null){
 const snapshot=c.snapshot,works=chosenWorks(c,selection),primary=works[0],other=works[1];
 const specs=[],options=[];
 const add=spec=>{specs.push(spec);options.push(optionFrom(c,selection,spec))};
 const assignments=[{work:primary,targets:selection.targetResourceIds,prefix:"assignment"},
  ...(other?[{work:other,targets:selection.companionTargetResourceIds,prefix:"companion-assignment"}]:[])];
 for(const {work,targets,prefix} of assignments){
  for(const [index,targetResourceId] of targets.entries()){
   const kind="assignment",id=index===0?prefix:prefix+"-"+(index+1);
   if(onlyId&&onlyId!==id)continue;
   const resource=c.alternatives.find(r=>r.id===targetResourceId);
   const changes={...ref(work),workTitle:work.title,resourceId:resource.id,resourceLabel:resource.label};
   const title=work.id===primary.id?titleFor(kind,changes):work.projectName+": "+work.title+" → "+resource.label;
   if(!work.canReassign)options.push(unavailable(id,kind,title,"Назначение уже начатой или недоступной работы не меняется в этом маршруте."));
   else{
    try{
     previewWorkResourceReassignment(snapshot,{...ref(work),targetResourceId:resource.id},{schedule:c.schedule,resources:c.resources});
     add({identity:{id,kind,title,changes},make:rationale=>{
      const result=addResourcePlanChoice(snapshot,work.projectId,work.workId,{title:"Ресурс: "+work.title,
       description:rationale,resourceId:resource.id});
      return {state:result.state,refs:[{projectId:work.projectId,changeId:result.changeId}]};
     }});
    }catch(e){options.push(unavailable(id,kind,title,errorText(e)))}
   }
  }
 }
 if(selection.workDelayDays&&(!onlyId||onlyId.startsWith("work-shift-"))){
  const kind="work_shift",title="Перенести отдельные работы";
  const refs=works.filter(w=>w.maxWorkDelay>0).map(w=>({...ref(w),maxDelay:Math.min(w.maxWorkDelay,selection.workDelayDays)}));
  if(!refs.length)options.push(unavailable("work-shift-none",kind,title,"У выбранных работ нет доступного резерва."));
  else{
   try{
    const result=compareWorkResourceLeveling(snapshot,c.resourceId,refs);
    if(!result.options.length)options.push(unavailable("work-shift-none",kind,title,"В проверенных комбинациях нет допустимого переноса в пределах резервов.",result.search));
    for(const option of result.options){
     const id="work-shift-"+option.id;
     if(onlyId&&id!==onlyId)continue;
     const changes={title:option.title,shifts:option.shifts,search:result.search,objectives:option.objectives};
     add({identity:{id,kind,title:titleFor(kind,changes),changes},
      make:rationale=>createWorkResourceLevelingProposals(snapshot,result,option.id,{rationale})});
    }
   }catch(e){options.push(unavailable("work-shift-none",kind,title,errorText(e)))}
  }
 }
 if(selection.allowSequence&&(!onlyId||onlyId.startsWith("sequence-"))){
  const kind="sequence",title="Изменить технологический порядок";
  if(!other||other.projectId!==primary.projectId)options.push(unavailable("sequence-none",kind,title,
   "Нужны две конфликтующие работы одного проекта. Межпроектная связь Work не создаётся."));
  else if(!resourceOverloadContainsPair(c.group,primary.projectId,primary.workId,other.workId))
   options.push(unavailable("sequence-none",kind,title,"Работы не участвуют в одном известном периоде перегрузки."));
  else{
   try{
    const result=compareResourceSequenceAlternatives(snapshot,{projectId:primary.projectId,
     firstWorkId:primary.workId,secondWorkId:other.workId},{schedule:c.schedule,resources:c.resources});
    for(const [i,option] of result.alternatives.entries()){
     const id="sequence-"+(i+1);
     if(onlyId&&id!==onlyId)continue;
     const changes={projectId:option.projectId,from:option.from,to:option.to,
      fromTitle:option.fromTitle,toTitle:option.toTitle};
     if(!option.valid){options.push(unavailable(id,kind,titleFor(kind,changes),option.reason));continue}
     add({identity:{id,kind,title:titleFor(kind,changes),changes,requiresTechnologyConfirmation:true},
      make:rationale=>{
       const result=addSequencePlanChoice(snapshot,option.projectId,{from:option.from,to:option.to,
        title:"Порядок: "+option.fromTitle+" → "+option.toTitle,description:rationale});
       return {state:result.state,refs:[{projectId:option.projectId,changeId:result.changeId}]};
      }});
    }
   }catch(e){options.push(unavailable("sequence-none",kind,title,errorText(e)))}
  }
 }
 if(selection.projectDelayDays&&(!onlyId||onlyId.startsWith("project-shift-"))){
  const kind="project_shift",title="Перенести начало проектов";
  const refs=[...new Set(works.filter(w=>w.canShiftProject).map(w=>w.projectId))].map(projectId=>({projectId,maxDelay:selection.projectDelayDays}));
  if(!refs.length)options.push(unavailable("project-shift-none",kind,title,"Выбранные проекты недоступны для переноса начала."));
  else{
   try{
    const result=compareResourceLeveling(snapshot,c.resourceId,refs);
    if(!result.options.length)options.push(unavailable("project-shift-none",kind,title,"В проверенных комбинациях нет допустимого переноса начала проектов.",result.search));
    for(const option of result.options){
     const id="project-shift-"+option.id;
     if(onlyId&&id!==onlyId)continue;
     const changes={title:option.title,shifts:option.shifts,search:result.search,objectives:option.objectives};
     add({identity:{id,kind,title:titleFor(kind,changes),changes},
      make:rationale=>createResourceLevelingProposals(snapshot,result,option.id,{rationale})});
    }
   }catch(e){options.push(unavailable("project-shift-none",kind,title,errorText(e)))}
  }
 }
 return {options,specs};
}
export function compareResourceConflictResolution(snapshot,resourceId,input){
 const c=buildContext(snapshot,resourceId),selection=normalize(c,input),result=derive(c,selection);
 return {kind:"ATLAS_RESOURCE_CONFLICT_RESOLUTION",revision:snapshot.revision,sourceStamp:JSON.stringify(snapshot),
  resourceId,resourceLabel:c.group.label,selection,baseline:contextView(c),options:result.options};
}
/**
 * A fresh calculation must still agree with the chosen comparison. The
 * selected method alone is drafted; other calculated variants do not enter
 * the portfolio. Ordinary approval and explicit Save remain separate.
 */
export function createResourceConflictProposals(snapshot,comparison,optionId,{rationale,confirmTradeoff=false,confirmTechnology=false}){
 validate(snapshot);
 if(comparison?.kind!=="ATLAS_RESOURCE_CONFLICT_RESOLUTION"||comparison.revision!==snapshot.revision||
  comparison.sourceStamp!==JSON.stringify(snapshot))throw Error("Портфель изменился. Рассчитайте варианты заново");
 if(typeof rationale!=="string"||rationale.trim().length<8||rationale.trim().length>2000)
  throw Error("Укажите обоснование (от 8 до 2000 символов)");
 const selected=comparison.options?.find(o=>o.id===optionId);
 if(!selected?.valid||!selected.canDraft)throw Error("Выберите доступный рассчитанный вариант");
 const c=buildContext(snapshot,comparison.resourceId),selection=normalize(c,comparison.selection);
 // Recheck only the selected method, not every unrelated alternative.
 const derived=derive(c,selection,optionId),fresh=derived.options.find(o=>o.id===optionId),spec=derived.specs.find(s=>s.identity.id===optionId);
 if(!fresh?.valid||!fresh.canDraft||!spec||!equal(fresh,selected))
  throw Error("Последствия варианта изменились. Рассчитайте заново");
 if(fresh.tradeoff&&confirmTradeoff!==true)throw Error("Подтвердите известные ухудшения или перенос конфликта");
 if(fresh.requiresTechnologyConfirmation&&confirmTechnology!==true)
  throw Error("Подтвердите технологическую допустимость выбранной связи");
 const description=rationale.trim()+"\nВыбранный конфликт: "+c.group.label+
  ". "+fresh.title+". Дней перегрузки ресурса: "+fresh.source.before.overloadDays+" → "+fresh.source.after.overloadDays+
  "; вне доступности: "+fresh.source.before.unavailableDays+" → "+fresh.source.after.unavailableDays+
  ". Работ в конфликтах портфеля: "+fresh.assessment.conflictedWorkBefore+" → "+fresh.assessment.conflictedWorkAfter+
  ". "+(fresh.tradeoff?"Пользователь подтвердил известный компромисс. ":"")+
  (fresh.requiresTechnologyConfirmation?"Пользователь подтвердил технологическую допустимость порядка. ":"")+
  "Сравнение плановое; требуется отдельное утверждение и применение.";
 // Leveling creators limit their own rationale to 2000 characters. The
 // user's justification is preserved there; the common summary is added
 // to the normal descriptions only after their guards and preview agree.
 const draft=spec.make(rationale.trim());
 const checked=comparePortfolioPlanSets(draft.state,draft.refs,null,{focusWorks:focusRefs(selection)}).options[0];
 if(!checked.valid||!equal(checked.preview,fresh.preview)||!equal(checked.assessment,fresh.assessment))
  throw Error("Подготовленные заявки не совпадают с расчётом");
 for(const {projectId,changeId} of draft.refs){
  const change=draft.state.projects.find(p=>p.id===projectId).changes.find(c=>c.id===changeId);
  // Preserve the existing detailed leveling rationale and guard provenance.
  change.description=change.description+"\n"+description;
 }
 validate(draft.state);
 return draft;
}

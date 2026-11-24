// Bounded, explicit deadline-recovery assumptions, not a second scheduler.
// Every alternative is an ordinary Atlas Change in a transient snapshot.
// No task, resource authorization, automatic application or persistence.
import {validate} from './core.mjs';
import {portfolioSchedule} from './portfolio-schedule.mjs';
import {scheduleProject} from './planning.mjs';
import {planChange} from './trace.mjs';
import {setPlanWork,previewPlanAmendment} from './plan-amendment.mjs';

const MAX_WORK=4;
const editable=w=>['todo','blocked'].includes(w.state)&&!w.actualStartDate&&!w.actualFinishDate&&
 (w.estimateDays??1)>0;
const day=86400000;
const difference=(a,b)=>a&&b?(Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/day:null;
const identical=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function recoveryContext(snapshot,projectId){
 validate(snapshot);
 const project=snapshot.projects.find(p=>p.id===projectId);
 if(!project)throw Error('Проект не найден');
 const forecast=portfolioSchedule(snapshot),row=forecast.byId.get(projectId);
 let reason=null;
 if(!['planned','active'].includes(project.status))reason='Для восстановления срока нужен действующий план проекта';
 else if(!row.projectedStart||!row.projectedFinish)reason='Сначала определите расчётные даты проекта и его предшественников';
 else if(!row.deadline)reason='Сначала установите контрольный срок проекта';
 const plan=row.projectedStart&&row.projectedFinish?
  scheduleProject(project,{calendarLibrary:snapshot.calendarLibrary??[],startDate:row.projectedStart}):null;
 const items=new Map(project.items.map(w=>[w.id,w]));
 const works=(plan?.rows??[]).map(r=>{
  const item=items.get(r.id);
  return {id:r.id,title:r.title,state:item.state,estimateDays:item.estimateDays??1,
   durationUnit:item.durationUnit??'elapsed_days',calendarBasis:item.calendarBasis??null,
   resourceId:item.resourceId??null,allocationPct:item.allocationPct??100,
   start:r.startDate,finish:r.finishDate,critical:r.critical,floatDays:r.floatDays,
   eligible:editable(item)};
 }).sort((a,b)=>Number(b.critical)-Number(a.critical)||a.floatDays-b.floatDays||
  b.estimateDays-a.estimateDays||a.title.localeCompare(b.title,'ru')||a.id.localeCompare(b.id));
 const candidates=reason?[]:works.filter(w=>w.eligible);
 return {project,forecast,context:{projectId,revision:snapshot.revision,available:!reason&&candidates.length>0,
  reason:reason??(!candidates.length?'Нет ещё не начатых работ с положительной длительностью':null),
  start:row.projectedStart,finish:row.projectedFinish,deadline:row.deadline,
  slipDays:row.deadlineSlipDays,startShiftDays:row.shiftDays,
  limitingProjects:row.limitingParents.map(id=>({id,name:forecast.byId.get(id).name,
   finish:forecast.byId.get(id).projectedFinish})),
  unavailableProjects:row.unavailableOrigins.map(p=>({id:p.id,name:p.name,status:p.status})),
  missingParents:row.missingParents.map(id=>({id,name:forecast.byId.get(id).name})),
  criticalCount:works.filter(w=>w.critical).length,
  fixedCriticalCount:works.filter(w=>w.critical&&!w.eligible).length,
  candidates,maxWorks:MAX_WORK}};
}
/** Read the real project deadline and distinguish local critical Work from upstream constraints. */
export function inspectDeadlineRecovery(snapshot,projectId){
 return recoveryContext(snapshot,projectId).context;
}
function normalize(snapshot,project,changes){
 if(!Array.isArray(changes)||changes.length<1||changes.length>MAX_WORK)
  throw Error('Укажите от одной до четырёх работ');
 const ids=new Set(),resources=new Set((snapshot.resources??[]).map(r=>r.id));
 return changes.map(input=>{
  if(!input||typeof input.itemId!=='string'||ids.has(input.itemId))throw Error('Работы для сравнения не должны повторяться');
  ids.add(input.itemId);
  const work=project.items.find(w=>w.id===input.itemId);
  if(!work||!editable(work))throw Error('Выберите ещё не начатую работу с положительной длительностью');
  const oldDays=work.estimateDays??1,oldResource=work.resourceId??null,oldLoad=work.allocationPct??100;
  const estimateDays=input.estimateDays,resourceId=input.resourceId===undefined?oldResource:input.resourceId;
  const allocationPct=input.allocationPct===undefined?oldLoad:input.allocationPct;
  // A resource-only trade-off may need MORE time. A Work must not be
  // compressed into an invented milestone or "fixed" by dropping its resource.
  if(!Number.isSafeInteger(estimateDays)||estimateDays<1||estimateDays>36500)
   throw Error('Длительность варианта должна быть целым числом от 1 до 36500');
  if(resourceId!==null&&!resources.has(resourceId)||oldResource!==null&&resourceId===null)
   throw Error('Выберите действующий плановый ресурс; снятие назначения не считается восстановлением');
  if(!Number.isSafeInteger(allocationPct)||allocationPct<1||allocationPct>100)
   throw Error('Плановая загрузка должна быть целым числом от 1 до 100');
  if(estimateDays===oldDays&&resourceId===oldResource&&allocationPct===oldLoad)
   throw Error('Укажите хотя бы одно изменение для работы «'+work.title+'»');
  if(!resourceId&&allocationPct!==oldLoad)
   throw Error('Изменять загрузку без планового ресурса нельзя');
  return {itemId:work.id,estimateDays,resourceId,allocationPct};
 });
}
function ordinaryProposal(snapshot,projectId,changes,{title,description}){
 const draft=planChange(snapshot,projectId,{title,description});
 let state=draft.state;
 for(const change of changes)state=setPlanWork(state,projectId,draft.id,change).state;
 return {state,changeId:draft.id};
}
function describeOption(preview,projectId){
 const own=preview.rows.find(r=>r.id===projectId);
 if(!own)throw Error('Нет расчёта изменённого проекта');
 const before=own.beforeFinish,after=own.afterFinish;
 const advanceDays=difference(after,before);
 const recoveredDays=own.beforeSlip!=null&&own.afterSlip!=null?own.beforeSlip-own.afterSlip:null;
 const dateEffect=advanceDays===null?'UNKNOWN':advanceDays<0?'LATER':advanceDays===0?'UNCHANGED':
  own.beforeSlip>0&&own.afterSlip===0?'RECOVERED':own.afterSlip>0?'PARTIAL':'EARLIER';
 const worsenedResources=preview.resourceRows.filter(r=>r.worsened).length;
 const newlyLateProjects=preview.projectSummary.newlyLate,worsenedLateProjects=preview.projectSummary.worsenedLate;
 const newlyLateWorks=preview.workSummary.newlyLate,worsenedLateWorks=preview.workSummary.worsenedLate;
 // Even an equal total overload may hide a new conflict on a different
 // resource or date. Use the existing per-resource period comparator.
 const tradeoff=Boolean(worsenedResources||newlyLateProjects||worsenedLateProjects||newlyLateWorks||
  worsenedLateWorks||preview.resourceAfter.unlinked>preview.resourceBefore.unlinked||
  preview.resourceAfter.undated>preview.resourceBefore.undated||preview.workSummary.newlyUndated);
 return {beforeFinish:before,afterFinish:after,deadline:own.beforeDeadline,
  beforeSlip:own.beforeSlip,remainingSlip:own.afterSlip,advanceDays,recoveredDays,dateEffect,
  worsenedResources,newlyLateProjects,worsenedLateProjects,newlyLateWorks,worsenedLateWorks,tradeoff,
  unknownDates:preview.projectSummary.unknown>0||preview.workSummary.unknown>0||preview.resourceAfter.undated>0,
  unlinked:preview.resourceAfter.unlinked};
}
/**
 * Calculate the explicitly entered Work variants individually and together
 * against the same current snapshot (at most 5 calculations). Never infer a
 * shorter estimate from float, free capacity, or the number of resources.
 * @param {any} snapshot
 * @param {string} projectId
 * @param {Array<{itemId:string,estimateDays:number,resourceId?:string|null,allocationPct?:number}>} changes
 */
export function compareDeadlineRecovery(snapshot,projectId,changes){
 const {project,context}=recoveryContext(snapshot,projectId);
 if(!context.available)throw Error(context.reason);
 const selected=normalize(snapshot,project,changes);
 const sets=selected.map((change,i)=>({id:'work-'+(i+1),title:project.items.find(w=>w.id===change.itemId).title,changes:[change]}));
 if(selected.length>1)sets.push({id:'combined',title:'Совместный вариант',changes:selected});
 const options=sets.map(option=>{
  try{
   const draft=ordinaryProposal(snapshot,projectId,option.changes,{title:'Расчёт варианта',description:''});
   const preview=previewPlanAmendment(draft.state,projectId,draft.changeId);
   return {...option,valid:true,effect:describeOption(preview,projectId),preview};
  }catch(error){
   return {...option,valid:false,reason:error instanceof Error?error.message:'Расчёт недоступен'};
  }
 });
 // Exact in-memory stamp prevents reuse after an independently imported
 // snapshot with the same numeric revision. Never serialize this receipt.
 return {kind:'ATLAS_DEADLINE_RECOVERY',projectId,revision:snapshot.revision,
  sourceStamp:JSON.stringify(snapshot),context,options};
}
/** Recheck the chosen assumptions and exact result before drafting a normal Change. */
export function createDeadlineRecoveryProposal(snapshot,comparison,optionId,{rationale}){
 validate(snapshot);
 if(!comparison||comparison.kind!=='ATLAS_DEADLINE_RECOVERY'||
  comparison.revision!==snapshot.revision||comparison.sourceStamp!==JSON.stringify(snapshot))
  throw Error('План изменился. Рассчитайте варианты заново');
 const option=comparison.options?.find(o=>o.id===optionId);
 if(!option?.valid)throw Error('Выберите рассчитанный вариант');
 if(typeof rationale!=='string'||rationale.trim().length<8||rationale.trim().length>2000)
  throw Error('Укажите обоснование варианта (от 8 до 2000 символов)');
 const {project,context}=recoveryContext(snapshot,comparison.projectId);
 if(!context.available)throw Error(context.reason);
 const changes=normalize(snapshot,project,option.changes);
 const names=new Map((snapshot.resources??[]).map(r=>[r.id,r.label]));
 const assumptions=changes.map(c=>{
  const w=project.items.find(w=>w.id===c.itemId);
  return w.title+': '+(w.estimateDays??1)+' → '+c.estimateDays+
   (w.durationUnit==='working_days'?' раб. дн.':' кал. дн.')+
   '; ресурс '+(names.get(w.resourceId)??'не назначен')+' → '+(names.get(c.resourceId)??'не назначен')+
   '; загрузка '+(w.allocationPct??100)+' → '+c.allocationPct+'%.';
 });
 const draft=ordinaryProposal(snapshot,project.id,changes,{title:'Пересмотр срока: '+option.title,
  description:rationale.trim()+'\n'+assumptions.join('\n')+
   '\nРасчёт до утверждения: '+option.effect.beforeFinish+' → '+option.effect.afterFinish+
   '; контрольный срок остаётся '+option.effect.deadline+'.'});
 const preview=previewPlanAmendment(draft.state,project.id,draft.changeId);
 if(!identical(describeOption(preview,project.id),option.effect)||!identical(preview,option.preview))
  throw Error('Расчёт варианта изменился. Проверьте его заново');
 return {state:draft.state,changeId:draft.changeId};
}

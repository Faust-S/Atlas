// Atlas 0.11: immutable calendar control points inside the existing project snapshot.
// Dates come exclusively from the canonical CPM and portfolio dependency projection.
// User-entered actual dates are not independent proof of completed work or acceptance.
import {validate} from "./core.mjs";
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {scheduleProject} from "./planning.mjs";

const DAY=86400000;
const day=value=>value==null?null:Date.parse(value+"T00:00:00Z")/DAY;
const difference=(current,reference)=>current&&reference?day(current)-day(reference):null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const findProject=(snapshot,id)=>{
 const project=snapshot.projects.find(p=>p.id===id);
 if(!project)throw Error("Проект не найден");
 return project;
};
const forecastFor=(snapshot,project,portfolio)=>{
 const forecast=portfolio.byId.get(project.id);
 if(!forecast)throw Error("Прогноз проекта не найден");
 if(!forecast.projectedStart||!forecast.projectedFinish)return {forecast,plan:null};
 const plan=scheduleProject(project,{
  startDate:forecast.projectedStart,calendarLibrary:snapshot.calendarLibrary??[]
 });
 if(plan.estimatedFinish!==forecast.projectedFinish)
  throw Error("Даты портфеля и календарного CPM различаются");
 return {forecast,plan};
};

/**
 * Record a dated human-selected control plan. This is a new project revision
 * in the existing Atlas snapshot, NOT an approval, archive or automatic save.
 * A control point includes portfolio-adjusted dates and the Work calendar
 * revision so later edits cannot silently rewrite the original plan.
 */
/**
 * @param {any} snapshot
 * @param {string} projectId
 * @param {{name?: string|null, recordedAt?: string}} [options]
 */
export function capturePlanBaseline(snapshot,projectId,{name=null,recordedAt=new Date().toISOString()}={}){
 validate(snapshot);
 const project=findProject(snapshot,projectId);
 if(!project.items.length)throw Error("Добавьте хотя бы одну работу для фиксации плана");
 const count=project.planBaselines?.length??0;
 if(count>=8)throw Error("В проекте допускается не более восьми контрольных редакций");
 if(typeof recordedAt!=="string"||!Number.isFinite(Date.parse(recordedAt))||
  new Date(recordedAt).toISOString()!==recordedAt)
  throw Error("Некорректная дата фиксации исходного плана");
 const label=name===null?(count?"Контрольная редакция "+(count+1):"Исходный план"):
  String(name).trim();
 if(!label||label.length>120)throw Error("Введите название контрольного плана (до 120 знаков)");
 if((project.planBaselines??[]).some(b=>b.name.toLocaleLowerCase("ru-RU")===
  label.toLocaleLowerCase("ru-RU")))
  throw Error("Контрольный план с таким названием уже существует");
 const {forecast,plan}=forecastFor(snapshot,project,portfolioSchedule(snapshot));
 if(!plan)throw Error("Нет достоверного календарного прогноза: проверьте дату начала, состояние проекта и предшественников");
 const items=new Map(project.items.map(w=>[w.id,w]));
 const baseline={
  id:crypto.randomUUID(),version:count+1,name:label,recordedAt,
  sourceRevision:snapshot.revision,
  projectStart:project.startDate??null,deadline:project.dueDate??null,
  forecastStart:forecast.projectedStart,forecastFinish:forecast.projectedFinish,
  work:plan.rows.map(row=>{
   const item=items.get(row.id);
   return {
    id:row.id,title:row.title,estimateDays:row.durationDays,
    durationUnit:row.durationUnit,
    calendarBasis:row.calendarBasis??null,
    startDate:row.startDate,finishDate:row.finishDate,
    dueDate:item.dueDate??null,predecessors:[...row.predecessors],
    critical:row.critical
   };
  })
 };
 const state=structuredClone(snapshot);
 state.projects.find(p=>p.id===projectId).planBaselines??=[];
 state.projects.find(p=>p.id===projectId).planBaselines.push(baseline);
 state.revision++;
 validate(state);
 return {state,id:baseline.id,version:baseline.version,baseline};
}

/**
 * Compare one fixed historical control point with the current authoritative
 * calendar forecast and manually entered actual dates. Never infers actual
 * completion from Work.state or a T3 claim.
 */
/**
 * @param {any} snapshot
 * @param {string} projectId
 * @param {string|null} [baselineId]
 * @param {{portfolio?: any}} [options]
 */
export function comparePlanBaseline(snapshot,projectId,baselineId=null,{portfolio=null}={}){
 validate(snapshot);
 const project=findProject(snapshot,projectId);
 const baselines=project.planBaselines??[];
 const baseline=baselineId===null?baselines.at(-1):
  baselines.find(b=>b.id===baselineId);
 if(!baseline)throw Error("Контрольный план не найден");
 const {forecast,plan}=forecastFor(snapshot,project,portfolio??portfolioSchedule(snapshot));
 const planned=new Map(baseline.work.map(w=>[w.id,w]));
 const live=new Map(project.items.map(w=>[w.id,w]));
 const projected=new Map((plan?.rows??[]).map(w=>[w.id,w]));
 const ids=[...baseline.work.map(w=>w.id),...project.items.map(w=>w.id).filter(id=>!planned.has(id))];
 const startShift=difference(forecast.projectedStart,baseline.forecastStart);
 const rows=ids.map(id=>{
  const reference=planned.get(id)??null,item=live.get(id)??null,now=projected.get(id)??null;
  const predecessors=item?project.dependencies.filter(d=>d.to===id).map(d=>d.from):[];
  const referencePredecessors=reference?.predecessors??[];
  const sorted=arr=>[...arr].sort((a,b)=>a.localeCompare(b));
  const reasons=[];
  if(!reference)reasons.push("Новая работа");
  if(!item)reasons.push("Работа удалена из текущего плана");
  if(item&&reference){
   if((item.estimateDays??1)!==reference.estimateDays||
      (item.durationUnit??"elapsed_days")!==reference.durationUnit)
    reasons.push("Изменена длительность");
   if(!same(item.calendarBasis??null,reference.calendarBasis??null))
    reasons.push("Изменён рабочий календарь");
   if(!same(sorted(predecessors),sorted(referencePredecessors)))
    reasons.push("Изменены зависимости");
   if((item.dueDate??null)!==reference.dueDate)
    reasons.push("Изменён контрольный срок");
   if(startShift!==null&&startShift!==0)
    reasons.push("Изменился расчётный старт проекта");
  }
  const shiftDays=difference(now?.finishDate??null,reference?.finishDate??null);
  const actualStart=item?.actualStartDate??null,actualFinish=item?.actualFinishDate??null;
  const actualShiftDays=difference(actualFinish,reference?.finishDate??null);
  if(item&&reference&&shiftDays!==null&&shiftDays!==0&&!reasons.length)
   reasons.push("Изменение расчёта по цепочке работ");
  const changed=reasons.length>0||(shiftDays!==null&&shiftDays!==0)||
   actualStart!==null||actualFinish!==null;
  return {
   id,title:item?.title??reference?.title??id,
   referenceStart:reference?.startDate??null,referenceFinish:reference?.finishDate??null,
   forecastStart:now?.startDate??null,forecastFinish:now?.finishDate??null,
   actualStart,actualFinish,actualSource:actualStart||actualFinish?"entered_by_user":null,
   shiftDays,actualShiftDays,
   baselineCritical:reference?.critical??null,currentCritical:now?.critical??null,
   added:!reference,removed:!item,changed,reasons
  };
 });
 return {
  baseline,projectId,projectName:project.name,
  forecastStart:forecast.projectedStart,forecastFinish:forecast.projectedFinish,
  forecastAvailable:!!plan,
  finishShiftDays:difference(forecast.projectedFinish,baseline.forecastFinish),
  startShiftDays:startShift,
  rows,totals:{
   work:rows.length,changed:rows.filter(r=>r.changed).length,
   lateForecast:rows.filter(r=>r.shiftDays>0).length,
   reportedFinish:rows.filter(r=>r.actualFinish!==null).length,
   added:rows.filter(r=>r.added).length,removed:rows.filter(r=>r.removed).length
  },
  notice:"Факт введён пользователем. Состояние работы, подтверждение Result и приёмка не устанавливаются автоматически."
 };
}

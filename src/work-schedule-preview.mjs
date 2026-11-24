// A read-only preview for a single existing work's duration and control date.
// Uses canonical Atlas CPM and its comparison. Never calls editItem, changes a
// revision, creates an approval or writes to the native Store.
import {scheduleProject,scheduleChangeSummary} from "./planning.mjs";
import {portfolioSchedule,portfolioScheduleChangeSummary} from "./portfolio-schedule.mjs";

const validDate=value=>{
 if(value===null)return true;
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
};
const late=(due,finish)=>due&&finish?finish>due:null;
// Show the complete effect of a multi-step correction separately from
// the effect of this one proposed change. Both use the canonical CPM.
const cumulativeResult=(baseline,plan)=>baseline?{
 ...scheduleChangeSummary(baseline,plan,{limit:3}),
 beforeDays:baseline.durationDays,afterDays:plan.durationDays
}:null;

/**
 * @param {any} project
 * @param {string} workId
 * @param {any} draft
 * @param {any} [beforePlan]
 * @param {any} [cumulativeBaseline]
 * @param {{calendarLibrary?:any[],portfolioSnapshot?:any,
 *  portfolioBefore?:any,cumulativePortfolioBaseline?:any}} [options]
 */
export function previewWorkScheduleEdit(project,workId,draft,beforePlan=null,cumulativeBaseline=null,
 {calendarLibrary=/** @type {any[]} */([]),portfolioSnapshot=null,
  portfolioBefore=null,cumulativePortfolioBaseline=null}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.dependencies))
  throw Error("Проект для расчёта недоступен");
 const work=project.items.find(item=>item.id===workId);
 if(!work)throw Error("Работа для расчёта не найдена");
 const raw=String(draft?.estimateDays??"").trim();
 if(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>36500)
  return {kind:"invalid",reason:"Укажите целое число дней от 0 до 36500."};
 const estimateDays=Number(raw);
 const dueDate=draft?.dueDate===undefined?(work.dueDate??null):
  (String(draft.dueDate??"").trim()||null);
 if(!validDate(dueDate))
  return {kind:"invalid",reason:"Проверьте календарную дату контрольного срока."};
 const oldEstimate=work.estimateDays??1,oldDueDate=work.dueDate??null;
 const oldLimit=work.notBeforeDate??null,notBeforeDate=draft?.notBeforeDate===undefined?oldLimit:
  String(draft.notBeforeDate??"").trim()||null;
 if(!validDate(notBeforeDate)||notBeforeDate&&!project.startDate)
  return {kind:"invalid",reason:"Проверьте ограничение даты начала и дату начала проекта."};
 if(oldLimit!==notBeforeDate&&(!["todo","blocked"].includes(work.state)||work.actualStartDate||work.actualFinishDate))
  return {kind:"invalid",reason:"Ограничение начала уже начатой работы не меняется."};
 const oldUnit=work.durationUnit??"elapsed_days",newUnit=draft?.durationUnit??oldUnit;
 const oldBasis=work.calendarBasis??null;
 let nextBasis=oldBasis;
 if(draft?.calendarBasis!==undefined){
  const selected=draft.calendarBasis;
  if(selected===null||selected==="")nextBasis=null;
  else if(typeof selected==="string"){
   const separator=selected.lastIndexOf("@"),version=Number(selected.slice(separator+1));
   if(separator<1||!Number.isSafeInteger(version)||version<1)
    return {kind:"invalid",reason:"Выберите редакцию рабочего календаря."};
   nextBasis={id:selected.slice(0,separator),version};
  }else nextBasis=selected;
 }
 if(newUnit==="elapsed_days")nextBasis=null;
 if(newUnit==="working_days"&&!nextBasis)
  return {kind:"invalid",reason:"Для рабочих дней требуется действительная редакция календаря."};
 if(estimateDays===oldEstimate&&dueDate===oldDueDate&&oldLimit===notBeforeDate&&
    newUnit===oldUnit&&JSON.stringify(nextBasis)===JSON.stringify(oldBasis))
  return {kind:"unchanged",cumulative:cumulativeResult(
   cumulativeBaseline,beforePlan??(cumulativeBaseline?
    scheduleProject(project,{calendarLibrary}):null))};
 // Only the changed work gets a new object, all other project data are shared
 // as read-only inputs to the existing scheduler.
 const projected={...project,items:project.items.map(item=>item.id===workId?
  {...item,estimateDays,dueDate,durationUnit:newUnit,notBeforeDate,
   ...(nextBasis?{calendarBasis:nextBasis}:{calendarBasis:undefined})}:item)};
 let before,after,effect;
 try{
  before=beforePlan??scheduleProject(project,{calendarLibrary});
  after=scheduleProject(projected,{calendarLibrary});
  effect=scheduleChangeSummary(before,after,{limit:3});
 }catch{
  return {kind:"invalid",reason:"План с такими значениями не рассчитывается. Проверьте длительность и сроки."};
 }
 const was=before.rows.find(row=>row.id===workId);
 const will=after.rows.find(row=>row.id===workId);
 if(!was||!will)throw Error("Работа отсутствует в расчёте плана");
 // The form estimates consequences before any draft or Native Store write.
 // This is the existing portfolioSchedule, with only the selected Work
 // substituted into an ephemeral snapshot. No second calendar algorithm.
 let portfolioImpact=null,portfolioCumulative=null,portfolioIssue=null;
 if(portfolioSnapshot?.portfolioLinks?.some(link=>link.from===project.id)){
  const original=portfolioSnapshot.projects?.find(item=>item.id===project.id);
  if(original!==project){
   portfolioIssue="Проект изменился. Откройте редактор заново для расчёта связей.";
  }else{
   try{
    const state={...portfolioSnapshot,projects:portfolioSnapshot.projects.map(item=>
     item.id===project.id?projected:item)};
    const beforePortfolio=portfolioBefore??portfolioSchedule(portfolioSnapshot);
    const afterPortfolio=portfolioSchedule(state);
    portfolioImpact=portfolioScheduleChangeSummary(beforePortfolio,afterPortfolio,project.id);
    if(cumulativePortfolioBaseline)
     portfolioCumulative=portfolioScheduleChangeSummary(
      cumulativePortfolioBaseline,afterPortfolio,project.id);
   }catch{
    portfolioIssue="Расчёт связанных проектов недоступен для этих значений.";
   }
  }
 }
 return {
  kind:"changed",workId,portfolioImpact,portfolioCumulative,portfolioIssue,
  oldEstimate,estimateDays,oldDueDate,dueDate,
  ...(oldLimit!==notBeforeDate?{oldNotBeforeDate:oldLimit,notBeforeDate,
   oldStart:was.startDate??null,newStart:will.startDate??null,
   oldReserve:was.floatDays,newReserve:will.floatDays}:{}),
  beforeDays:before.durationDays,afterDays:after.durationDays,
  oldFinish:was.finishDate??null,newFinish:will.finishDate??null,
  oldFinishOffset:was.earlyFinish,newFinishOffset:will.earlyFinish,
  wasLate:late(oldDueDate,was.finishDate),willBeLate:late(dueDate,will.finishDate),
  cumulative:cumulativeResult(cumulativeBaseline,after),
  ...effect
 };
}

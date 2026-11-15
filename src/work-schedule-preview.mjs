// A read-only preview for a single existing work's duration and control date.
// Uses canonical Atlas CPM and its comparison. Never calls editItem, changes a
// revision, creates an approval or writes to the native Store.
import {scheduleProject,scheduleChangeSummary} from "./planning.mjs";

const validDate=value=>{
 if(value===null)return true;
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;
};
const late=(due,finish)=>due&&finish?finish>due:null;

export function previewWorkScheduleEdit(project,workId,draft,beforePlan=null){
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
 if(estimateDays===oldEstimate&&dueDate===oldDueDate)
  return {kind:"unchanged"};
 // Only the changed work gets a new object, all other project data are shared
 // as read-only inputs to the existing scheduler.
 const projected={...project,items:project.items.map(item=>item.id===workId?
  {...item,estimateDays,dueDate}:item)};
 let before,after,effect;
 try{
  before=beforePlan??scheduleProject(project);
  after=scheduleProject(projected);
  effect=scheduleChangeSummary(before,after,{limit:3});
 }catch{
  return {kind:"invalid",reason:"План с такими значениями не рассчитывается. Проверьте длительность и сроки."};
 }
 const was=before.rows.find(row=>row.id===workId);
 const will=after.rows.find(row=>row.id===workId);
 if(!was||!will)throw Error("Работа отсутствует в расчёте плана");
 return {
  kind:"changed",workId,
  oldEstimate,estimateDays,oldDueDate,dueDate,
  beforeDays:before.durationDays,afterDays:after.durationDays,
  oldFinish:was.finishDate??null,newFinish:will.finishDate??null,
  oldFinishOffset:was.earlyFinish,newFinishOffset:will.earlyFinish,
  wasLate:late(oldDueDate,was.finishDate),willBeLate:late(dueDate,will.finishDate),
  ...effect
 };
}

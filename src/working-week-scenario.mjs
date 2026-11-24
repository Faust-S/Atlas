/**
 * Read-only working-week alternative for Atlas' canonical calendar-day CPM.
 *
 * Existing estimateDays are CALENDAR days and remain so in Atlas Store.
 * This scenario deliberately asks "what if the SAME numbers meant working
 * days?" It must never silently replace canonical scheduling, due dates,
 * project/portfolio forecasts, or an accepted Result.
 *
 * Date semantics here are explicit: a positive N-day work occupies N
 * eligible work dates; completionDate is the LAST occupied work date.
 * The original CPM's finishDate is an exclusive day boundary and therefore
 * must NOT be compared directly to completionDate.
 */
const DAY_MS=86400000;
const MAX_OFFSET=36500;
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WEEKDAYS=Object.freeze([1,2,3,4,5]); // JS UTC 0 = Sunday

function civilDate(value,label){
 if(typeof value!=="string"||!DATE_RE.test(value))
  throw Error("Invalid "+label);
 const parsed=new Date(value+"T00:00:00.000Z");
 if(!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==value)
  throw Error("Invalid "+label);
 return parsed.getTime();
}
function dateAt(epoch){
 if(!Number.isFinite(epoch))return null;
 const d=new Date(epoch);
 if(!Number.isFinite(d.valueOf())||d.getUTCFullYear()<0||d.getUTCFullYear()>9999)return null;
 return d.toISOString().slice(0,10);
}
function addCivilDays(start,offset){
 return dateAt(start+offset*DAY_MS);
}
function dateDifference(a,b){
 if(!a||!b)return null;
 return (civilDate(a,"scenario date")-civilDate(b,"baseline date"))/DAY_MS;
}
function calendarOptions({weekdays=DEFAULT_WEEKDAYS,holidays=[]}={}){
 if(!Array.isArray(weekdays)||weekdays.length<1||weekdays.length>7||
  weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)||
  new Set(weekdays).size!==weekdays.length)
  throw Error("Invalid working weekdays");
 if(!Array.isArray(holidays)||holidays.length>1000)
  throw Error("Invalid calendar holidays");
 const excluded=new Set();
 for(const day of holidays){
  civilDate(day,"calendar holiday");
  excluded.add(day);
 }
 return {weekdays:[...weekdays].sort((a,b)=>a-b),excluded};
}
function validatePlan(plan){
 if(!plan||!Array.isArray(plan.rows)||
  !Number.isSafeInteger(plan.durationDays)||
  plan.durationDays<0||plan.durationDays>MAX_OFFSET)
  throw Error("Invalid working-week scenario plan");
 for(const row of plan.rows){
  if(!row||typeof row.id!=="string"||
   !Number.isSafeInteger(row.earlyStart)||
   !Number.isSafeInteger(row.earlyFinish)||
   row.earlyStart<0||row.earlyStart>row.earlyFinish||
   row.earlyFinish>plan.durationDays)
   throw Error("Invalid working-week scenario work offsets");
 }
}

/**
 * @param {object} plan The canonical scheduleProject() result.
 * @param {object} options startDate (YYYY-MM-DD); weekdays (UTC 0..6);
 *                         holidays (explicit YYYY-MM-DD exclusions).
 * @returns a separate, non-authoritative scenario projection.
 */
export function previewWorkingWeek(plan,{startDate=null,weekdays=DEFAULT_WEEKDAYS,holidays=[]}={}){
 validatePlan(plan);
 const config=calendarOptions({weekdays,holidays});
 if(startDate===null||startDate===""){
  return {available:false,reason:"NO_PROJECT_START",kind:"WORKDAY_HYPOTHESIS",
   rows:[],projectBaselineLastDate:null,projectScenarioLastDate:null,shiftDays:null};
 }
 const start=civilDate(startDate,"project start date");
 if(plan.rows.some(row=>row.notBeforeDate)){
  const mixed=previewOperationCalendars(plan,{startDate,weekdays,holidays,defaultMode:"working_days"});
  return {...mixed,kind:"WORKDAY_HYPOTHESIS",calendarName:"working-week",
   inputDurationMeaning:"HYPOTHETIC_WORKDAYS_NOT_PERSISTED",weekdays:config.weekdays,holidaysCount:config.excluded.size,
   rows:mixed.rows.map(r=>({...r,durationWorkdays:r.durationDays}))};
 }
 const allowed=new Set(config.weekdays);
 const dates=[];
 let daysScanned=0,skippedHolidays=0;
 let at=start;
 // For a one-day working week EACH excluded eligible day can cost seven
 // more civil days. Multiply the holiday allowance, not just its count.
 // This stays bounded even for the 36,500-day maximum and 1,000 holidays.
 const maxScans=(plan.durationDays+config.excluded.size+2)*7+7;
 while(dates.length<=plan.durationDays && daysScanned<maxScans){
  const day=new Date(at);
  const label=dateAt(at);
  const weekday=day.getUTCDay();
  if(allowed.has(weekday)){
   if(label!==null&&config.excluded.has(label))skippedHolidays++;
   else dates.push(label);
  }
  at+=DAY_MS;
  daysScanned++;
 }
 if(dates.length<=plan.durationDays)
  throw Error("Working-week calendar exceeds supported horizon");
 // The last occupied workday can be EARLIER than a zero-day milestone
 // at the same CPM end offset. A terminal milestone is a real date point.
 const lastIndex=plan.rows.length?Math.max(...plan.rows.map(row=>
  row.earlyFinish>row.earlyStart?row.earlyFinish-1:row.earlyStart)):null;
 const scenarioLastDate=lastIndex===null?null:dates[lastIndex];
 const baselineLastDate=lastIndex===null?null:addCivilDays(start,lastIndex);
 const rows=plan.rows.map(row=>{
  const lastIndex=row.earlyFinish>row.earlyStart?row.earlyFinish-1:row.earlyStart;
  const date=dates[lastIndex];
  const baseline=addCivilDays(start,lastIndex);
  return {
   id:row.id,title:row.title,
   critical:Boolean(row.critical),dueDate:row.dueDate??null,
   durationWorkdays:row.durationDays,
   startDate:dates[row.earlyStart],
   completionDate:date,
   baselineLastDate:baseline,
   shiftDays:dateDifference(date,baseline),
   // Compare occupied workdays against the *inclusive* control date.
   // Never mark this as an accepted fact or change the canonical CPM risk.
   wouldMissDueDate:Boolean(date&&row.dueDate&&date>row.dueDate)
  };
 });
 return {
  available:true,kind:"WORKDAY_HYPOTHESIS",calendarName:"working-week",
  inputDurationMeaning:"HYPOTHETIC_WORKDAYS_NOT_PERSISTED",
  weekdays:config.weekdays,holidaysCount:config.excluded.size,
  skippedHolidays,firstEligibleDate:dates[0],
  startAdjusted:dates[0]!==startDate,
  projectBaselineLastDate:baselineLastDate,
  projectScenarioLastDate:scenarioLastDate,
  shiftDays:dateDifference(scenarioLastDate,baselineLastDate),
  projectedBoundaryDate:dates[plan.durationDays], // Next eligible work start
  rows
 };
}


/**
 * Typed, draft-only calculation for a MIXED project:
 *   working_days = consumes N eligible dates (e.g. installation);
 *   elapsed_days = occupies N consecutive civil dates (e.g. curing).
 *
 * Uses the canonical scheduleProject() topological row ordering and direct
 * predecessors. Does not introduce another graph, CPM, project field, Store,
 * authorization layer or .iwxa schema. Float/critical data remain the original
 * calendar-day CPM attributes and are NOT recomputed here.
 *
 * Work that has zero duration is an instantaneous milestone at the predecessor
 * release boundary, even if that boundary falls on a non-working day. To
 * require staffed acceptance, model a positive-duration working operation.
 *
 * @param {object} plan scheduleProject(project), unchanged.
 * @param {object} options explicit draft calendar and per-work duration modes.
 * @returns {object} non-authoritative scenario, never a saved project.
 */
export function previewOperationCalendars(plan,{
 startDate=null,weekdays=DEFAULT_WEEKDAYS,holidays=[],
 additionalWorkingDates=[],defaultMode="working_days",modeByWork={}
}={}){
 validatePlan(plan);
 const config=calendarOptions({weekdays,holidays});
 if(!Array.isArray(additionalWorkingDates)||additionalWorkingDates.length>1000)
  throw Error("Invalid additional working dates");
 const included=new Set();
 for(const date of additionalWorkingDates){
  civilDate(date,"additional working date");
  if(config.excluded.has(date))throw Error("Conflicting calendar date "+date);
  included.add(date);
 }
 const modes=new Set(["working_days","elapsed_days"]);
 if(!modes.has(defaultMode)||!modeByWork||typeof modeByWork!=="object"||
  Array.isArray(modeByWork))
  throw Error("Invalid duration mode");
 const ids=new Set();
 for(const row of plan.rows){
  if(!row||typeof row.id!=="string"||!row.id||ids.has(row.id)||
   !Array.isArray(row.predecessors)||!Number.isSafeInteger(row.durationDays)||
   row.durationDays<0||
   (row.durationDays!==row.earlyFinish-row.earlyStart&&
    !(row.durationUnit==="working_days"&&row.calendarBasis?.id&&
      Number.isSafeInteger(row.calendarBasis.version))))
   throw Error("Invalid calendar scenario work");
  ids.add(row.id);
 }
 for(const [id,mode] of Object.entries(modeByWork)){
  if(!ids.has(id)||!modes.has(mode))throw Error("Invalid work calendar mode");
 }
 const definition={
  kind:"PLANNING_CALENDAR_DRAFT",version:1,weekdays:config.weekdays,
  excludedDates:[...config.excluded].sort(),
  additionalWorkingDates:[...included].sort()
 };
 if(startDate===null||startDate===""){
  return {available:false,reason:"NO_PROJECT_START",kind:"MIXED_CALENDAR_HYPOTHESIS",
   calendar:definition,rows:[],projectScenarioLastDate:null,
   projectBaselineLastDate:null,shiftDays:null};
 }
 const start=civilDate(startDate,"project start date");
 const allowed=new Set(config.weekdays);
 const eligible=[];
 let cursor=start,scanned=0,skippedHolidays=0;
 // The canonical CPM bounds all positive-duration work along a dependency
 // chain. A worst-case one-day week and 1000 holidays remain finite.
 const maxScans=(plan.durationDays+config.excluded.size+included.size+3)*7+7;
 function appendEligible(){
  while(scanned<maxScans){
   const at=cursor, label=dateAt(at);
   cursor+=DAY_MS;
   scanned++;
   const weekly=allowed.has(new Date(at).getUTCDay());
   if(label!==null&&config.excluded.has(label)){
    if(weekly)skippedHolidays++;
    continue;
   }
   if(weekly||(label!==null&&included.has(label))){
    eligible.push(at);
    return;
   }
  }
  throw Error("Working-week calendar exceeds supported horizon");
 }
 function eligibleIndex(at){
  while(!eligible.length||eligible[eligible.length-1]<at)appendEligible();
  let left=0,right=eligible.length;
  while(left<right){
   const mid=left+Math.floor((right-left)/2);
   if(eligible[mid]<at)left=mid+1;
   else right=mid;
  }
  return left;
 }
 const ends=new Map();
 const rows=[];
 for(const row of plan.rows){
  let ready=start;
  for(const predecessor of row.predecessors){
   if(!ends.has(predecessor))
    throw Error("Invalid canonical predecessor order");
   ready=Math.max(ready,ends.get(predecessor));
  }
  if(row.notBeforeDate)ready=Math.max(ready,civilDate(row.notBeforeDate,"work start limit"));
  const mode=Object.hasOwn(modeByWork,row.id)?modeByWork[row.id]:defaultMode;
  const count=row.durationDays;
  let first=ready,last=ready,finishBoundary=ready;
  if(count>0&&mode==="working_days"){
   const index=eligibleIndex(ready);
   while(eligible.length<index+count)appendEligible();
   first=eligible[index];
   last=eligible[index+count-1];
   finishBoundary=last+DAY_MS;
  }else if(count>0){
   last=ready+(count-1)*DAY_MS;
   finishBoundary=ready+count*DAY_MS;
  }
  ends.set(row.id,finishBoundary);
  const offset=row.earlyFinish>row.earlyStart?
   row.earlyFinish-1:row.earlyStart;
  const baseline=addCivilDays(start,offset);
  const completion=dateAt(last);
  rows.push({
   id:row.id,title:row.title,critical:Boolean(row.critical),
   dueDate:row.dueDate??null,durationDays:count,durationMode:mode,
   startDate:dateAt(first),completionDate:completion,
   finishBoundaryDate:dateAt(finishBoundary),
   baselineLastDate:baseline,
   shiftDays:dateDifference(completion,baseline),
   wouldMissDueDate:Boolean(completion&&row.dueDate&&completion>row.dueDate)
  });
 }
 if(!eligible.length)appendEligible();
 const lastBaselineIndex=plan.rows.length?Math.max(...plan.rows.map(row=>
  row.earlyFinish>row.earlyStart?row.earlyFinish-1:row.earlyStart)):null;
 const baselineLast=lastBaselineIndex===null?null:addCivilDays(start,lastBaselineIndex);
 // If one branch escapes the four-digit calendar, the project finish
 // is unknown. Returning the latest OTHER branch would be a false forecast.
 const scenarioLast=rows.length&&rows.every(row=>row.completionDate!==null)?
  rows.reduce((latest,row)=>
   !latest||row.completionDate>latest?row.completionDate:latest,null):null;
 // A date outside the four-digit range is unavailable. Do not fabricate a
 // shorter date or claim "on time" for that row.
 const boundary=ends.size?Math.max(...ends.values()):null;
 return {
  available:true,kind:"MIXED_CALENDAR_HYPOTHESIS",
  inputDurationMeaning:"HYPOTHETICAL_MIXED_DURATIONS_NOT_PERSISTED",
  calendar:definition,firstEligibleDate:dateAt(eligible[0]),
  startAdjusted:dateAt(eligible[0])!==startDate,
  skippedHolidays,continuousTotal:rows.filter(row=>row.durationMode==="elapsed_days").length,
  workdayTotal:rows.filter(row=>row.durationMode==="working_days").length,
  projectBaselineLastDate:baselineLast,projectScenarioLastDate:scenarioLast,
  projectedBoundaryDate:boundary===null?null:dateAt(boundary),
  shiftDays:dateDifference(scenarioLast,baselineLast),rows
 };
}

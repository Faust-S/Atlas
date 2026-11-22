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
 const allowed=new Set(config.weekdays);
 const dates=[];
 let daysScanned=0,skippedHolidays=0;
 let at=start;
 // With >=1 allowed weekday, this finite bound covers all 36500 offsets,
 // up to 1000 excluded calendar dates and an arbitrary non-working start.
 const maxScans=(plan.durationDays+1)*7+config.excluded.size+14;
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

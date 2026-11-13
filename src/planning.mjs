/**
 * Project scheduling view over already-owned Atlas project items.
 * Uses Marcel Klehr's MIT topological sort; does not execute tasks, alter
 * external sources or infer accepted project/release readiness.
 * All durations are elapsed calendar days. Resource leveling, working-day
 * calendars, lags, and constrained deadlines are NOT implemented.
 */
import toposort from './vendor/toposort.mjs';
const MAX_DAYS = 36500;
function plannedDuration(item) {
  const value = item.estimateDays ?? 1;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DAYS) {
    throw new Error('Invalid estimateDays for ' + String(item.id));
  }
  return value;
}
function optionalStartDate(input) {
  if (!input) return null;
  if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Invalid project start date');
  const d = new Date(input + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== input) throw new Error('Invalid project start date');
  return d;
}
function daysFrom(start,days) {
  if (!start) return null;
  const at=new Date(start.getTime()+days*86400000);
  // Atlas accepts four-digit dates. Never truncate an extended ISO year
  // (e.g. +010000-01-01) into a fabricated YYYY-MM-DD date.
  if(!Number.isFinite(at.getTime())||at.getUTCFullYear()>9999)return null;
  return at.toISOString().slice(0,10);
}
export function scheduleProject(p) {
  if (!p || !Array.isArray(p.items) || !Array.isArray(p.dependencies)) throw new Error('Invalid project');
  const items = p.items;
  if (items.length > 5000) throw new Error('Project scheduling limit: 5000 work items');
  const ids = items.map(item => item.id);
  const set = new Set(ids);
  if (set.size !== ids.length) throw new Error('Duplicate work item ID');
  const edges = p.dependencies.map(e=>{
    const a = e.from ?? e.fromId;
    const b = e.to ?? e.toId;
    if (!set.has(a) || !set.has(b)) throw new Error('Dependency references missing item');
    return [a,b];
  });
  const order = toposort.array(ids,edges);
  const byId = new Map(items.map(item=>[item.id,item]));
  const incoming = new Map(ids.map(id=>[id,[]]));
  const outgoing = new Map(ids.map(id=>[id,[]]));
  for (const [a,b] of edges) { outgoing.get(a).push(b); incoming.get(b).push(a); }
  const times = new Map();
  let durationDays = 0;
  for (const id of order) {
    const duration = plannedDuration(byId.get(id));
    const es = Math.max(0,...incoming.get(id).map(parent=>times.get(parent).earlyFinish));
    const ef = es + duration;
    if (ef > MAX_DAYS) throw new Error('Project schedule exceeds supported horizon');
    times.set(id,{durationDays:duration,earlyStart:es,earlyFinish:ef});
    durationDays = Math.max(durationDays,ef);
  }
  for (const id of [...order].reverse()) {
    const row = times.get(id);
    const successors = outgoing.get(id);
    const lateFinish = successors.length ? Math.min(...successors.map(child=>times.get(child).lateStart)) : durationDays;
    const lateStart = lateFinish-row.durationDays;
    Object.assign(row,{lateStart,lateFinish,floatDays:lateStart-row.earlyStart,critical:lateStart===row.earlyStart});
  }
  const start = optionalStartDate(p.startDate ?? null);
  const rows = order.map(id=>{
    const item = byId.get(id),row=times.get(id);
    return {id,title:item.title,state:item.state,stageId:item.stageId??null,priority:item.priority||'normal',
       dueDate:item.dueDate??null,...row,
      predecessors:[...incoming.get(id)],blockedBy:incoming.get(id).filter(pred=>byId.get(pred).state!=='done'),
      startDate:daysFrom(start,row.earlyStart),finishDate:daysFrom(start,row.earlyFinish)};
  });
  return {durationDays,estimatedFinish:daysFrom(start,durationDays),rows,criticalIds:rows.filter(r=>r.critical).map(r=>r.id),
    workItems:rows.length,warning:'Calendar-day CPM estimate; not resource-leveled, not execution authority, not release acceptance'};
}


/**
 * Compare two existing CPM calculations. No project entities are written.
 * New work is not counted as a shifted previously existing work.
 */
export function scheduleChangeSummary(before,after,{limit=4}={}){
 if(!before||!after||!Array.isArray(before.rows)||!Array.isArray(after.rows)||
    !Number.isSafeInteger(before.durationDays)||!Number.isSafeInteger(after.durationDays))
  throw new Error("Invalid schedule comparison");
 if(!Number.isInteger(limit)||limit<1||limit>20)
  throw new Error("Invalid schedule comparison limit");
 const previous=new Map(before.rows.map(row=>[row.id,row]));
 let movedTotal=0,delayedTotal=0,earlierTotal=0,criticalChangedTotal=0,deadlineMissedTotal=0;
 let deadlineChangedTotal=0,deadlineResolvedTotal=0,deadlineNewMissedTotal=0,deadlineRemovedTotal=0;
 const affected=[];
 for(const row of after.rows){
  const old=previous.get(row.id);
  if(!old)continue;
  if(Boolean(old.critical)!==Boolean(row.critical))criticalChangedTotal++;
  const previousDueDate=old.dueDate??null,dueDate=row.dueDate??null;
  const dueDateChanged=previousDueDate!==dueDate;
  // A deadline can be changed without shifting the CPM finish. Keep that
  // correction in the impact preview and compare calendar facts only when
  // a real project start permits a dated finish.
  const previouslyMissed=Boolean(previousDueDate&&old.finishDate&&old.finishDate>previousDueDate);
  const missedDeadline=Boolean(dueDate&&row.finishDate&&row.finishDate>dueDate);
  if(dueDateChanged)deadlineChangedTotal++;
  // Removing a control date removes the basis for checking its compliance.
  // It is not a successful correction of a missed deadline.
  const deadlineRemoved=Boolean(previousDueDate&&!dueDate);
  if(deadlineRemoved)deadlineRemovedTotal++;
  const deadlineResolved=Boolean(previouslyMissed&&dueDate&&!missedDeadline);
  if(deadlineResolved)deadlineResolvedTotal++;
  if(!previouslyMissed&&missedDeadline)deadlineNewMissedTotal++;
  const shiftDays=row.earlyFinish-old.earlyFinish;
  if(!shiftDays&&!dueDateChanged)continue;
  if(shiftDays){
   movedTotal++;
   if(shiftDays>0)delayedTotal++;else earlierTotal++;
  }
  if(missedDeadline)deadlineMissedTotal++;
  affected.push({
   id:row.id,title:row.title,shiftDays,
   previousFinishOffset:old.earlyFinish,finishOffset:row.earlyFinish,
   previousFinishDate:old.finishDate??null,finishDate:row.finishDate??null,
   previousDueDate,dueDate,dueDateChanged,missedDeadline,
   deadlineResolved,deadlineRemoved,
   critical:Boolean(row.critical)
  });
 }
 // Keep missed deadlines and corrected deadlines visible in a limited
 // preview; remaining moved works follow by the magnitude of their impact.
 affected.sort((a,b)=>Number(b.missedDeadline)-Number(a.missedDeadline)||
  Number(b.deadlineResolved)-Number(a.deadlineResolved)||
  Number(b.deadlineRemoved)-Number(a.deadlineRemoved)||
  Number(b.dueDateChanged)-Number(a.dueDateChanged)||
  Number(b.shiftDays>0)-Number(a.shiftDays>0)||
  Math.abs(b.shiftDays)-Math.abs(a.shiftDays)||Number(b.critical)-Number(a.critical));
 return {durationBefore:before.durationDays,durationAfter:after.durationDays,
  movedTotal,delayedTotal,earlierTotal,criticalChangedTotal,deadlineMissedTotal,
  deadlineChangedTotal,deadlineResolvedTotal,deadlineNewMissedTotal,deadlineRemovedTotal,
  affectedTotal:affected.length,affectedIds:affected.map(item=>item.id),
  examples:affected.slice(0,limit)};
}

/**
 * Read-only preview of recorded work dependencies.
 * Reuses the existing schedule's direct predecessors and blockedBy IDs,
 * without computing a second graph or inferring accepted results.
 * A "done" state is a user claim, not independent verification.
 */
export function workDependencyOverview(project,plan,{maxNames=2}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.dependencies)||
    !plan||!Array.isArray(plan.rows))throw Error("Invalid work dependency projection");
 if(!Number.isInteger(maxNames)||maxNames<1||maxNames>5)
  throw Error("Invalid work dependency preview limit");
 const byId=new Map(project.items.map(work=>[work.id,work]));
 const hints=new Map(project.items.map(work=>[work.id,{
  predecessorTotal:0,pendingTotal:0,pendingWorks:[],successorTotal:0
 }]));
 for(const row of plan.rows){
  const entry=hints.get(row.id);
  if(!entry)continue;
  entry.predecessorTotal=row.predecessors.length;
  entry.pendingTotal=row.blockedBy.length;
  entry.pendingWorks=row.blockedBy.slice(0,maxNames)
   .filter(id=>byId.has(id)).map(id=>({id,title:byId.get(id).title}));
 }
 for(const edge of project.dependencies){
  const entry=hints.get(edge.from);
  if(entry&&hints.has(edge.to))entry.successorTotal++;
 }
 return hints;
}


/**
 * Filter existing work rows by recorded unfinished predecessors.
 * No pending predecessors is not proof that execution can start or has passed.
 * Sorting, searching and other filters remain in the existing work table.
 */
export function filterWorkRowsByDependencies(items,overview,mode="all"){
 if(!Array.isArray(items)||!(overview instanceof Map)||
    !["all","has_pending","no_pending"].includes(mode))
  throw new Error("Invalid work dependency filter");
 if(mode==="all")return items;
 return items.filter(item=>{
  const pending=(overview.get(item.id)?.pendingTotal??0)>0;
  return mode==="has_pending"?pending:!pending;
 });
}

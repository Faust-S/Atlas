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
    return {id,title:item.title,state:item.state,stageId:item.stageId??null,priority:item.priority||'normal',...row,
      predecessors:[...incoming.get(id)],blockedBy:incoming.get(id).filter(pred=>byId.get(pred).state!=='done'),
      startDate:daysFrom(start,row.earlyStart),finishDate:daysFrom(start,row.earlyFinish)};
  });
  return {durationDays,estimatedFinish:daysFrom(start,durationDays),rows,criticalIds:rows.filter(r=>r.critical).map(r=>r.id),
    workItems:rows.length,warning:'Calendar-day CPM estimate; not resource-leveled, not execution authority, not release acceptance'};
}

// Read-only capacity commitments over the existing Atlas CPM and portfolio dependencies.
// Explicit local planning resource IDs prevent falsely treating equal names as one person.
// No personnel identity, actual availability verification, resource leveling or execution.
import {portfolioSchedule} from "./portfolio-schedule.mjs";
import {scheduleProject} from "./planning.mjs";

const esc = x => String(x ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAY=86400000;
const day = value => value ? Date.parse(value+"T00:00:00Z")/DAY : null;
const date = value => new Date(value*DAY).toISOString().slice(0,10);
const show = value => value||"—";
const names = value => value.trim().replace(/\s+/g," ");
// One sweep for the aggregate and (only on request) its exact conflict periods.
const dayEvents=(group,onConflict=null,withParticipants=Boolean(onConflict))=>{
 const events=new Map();
 const active=withParticipants?new Map():null;
 const append=(day,load,count,work=null)=>{
  const e=events.get(day)||{load:0,count:0};
  e.load+=load;e.count+=count;
  if(active&&work)(e.changes??=[]).push({work,count});
  events.set(day,e);
 };
 for(const w of group.work){
  // The original CPM emits exact occupied intervals for calendar-based Work.
  // Weekend gaps no longer create capacity load or false overload warnings.
  for(const [from,until] of w.activeRanges??[]){
   append(from,w.allocationPct,1,w);
   append(until,-w.allocationPct,-1,w);
  }
 }
 const from=day(group.availableFrom),until=day(group.availableUntil);
 if(from!==null)append(from,0,0);
 if(until!==null)append(until+1,0,0);
 const boundaries=[...events.keys()].sort((a,b)=>a-b);
 let load=0,concurrent=0,maxLoadPct=0,maxConcurrent=0;
 let overloadDays=0,unavailableDays=0,overlapDays=0;
 let overloadPctDays=0,unavailablePctDays=0,peakExcessPct=0;
 for(let i=0;i<boundaries.length;i++){
  const event=events.get(boundaries[i]);
  load+=event.load;concurrent+=event.count;
  if(active)for(const {work,count} of event.changes??[]){
   const key=JSON.stringify([work.projectId,work.id]);
   const previous=active.get(key);
   const next=(previous?.count??0)+count;
   if(next>0)active.set(key,{work,count:next});
   else active.delete(key);
  }
  maxLoadPct=Math.max(maxLoadPct,load);
  maxConcurrent=Math.max(maxConcurrent,concurrent);
  if(i+1===boundaries.length)continue;
  const length=boundaries[i+1]-boundaries[i];
  if(length<=0||load<=0)continue;
  if(concurrent>1)overlapDays+=length;
  const outOfWindow=from!==null&&boundaries[i]<from||until!==null&&boundaries[i]>until;
  if(outOfWindow){unavailableDays+=length;unavailablePctDays+=load*length;}
  else if(load>group.capacityPct){
   const excess=load-group.capacityPct;
   overloadDays+=length;overloadPctDays+=excess*length;
   peakExcessPct=Math.max(peakExcessPct,excess);
  }
  if(onConflict&&(outOfWindow||load>group.capacityPct))
   onConflict({from:boundaries[i],until:boundaries[i+1],
    kind:outOfWindow?"availability":"overload",loadPct:load,
    capacityPct:group.capacityPct,concurrent},active);
 }
 return {overlapDays,maxConcurrent,maxLoadPct,overloadDays,unavailableDays,
  overloadPctDays,unavailablePctDays,peakExcessPct};
};

/**
 * Exact conflict segments on one resource, with a bounded page of participating
 * Work references. The sweep uses the same half-open occupied intervals and
 * availability precedence as the authoritative aggregate; no per-day expansion.
 * Unknown dates and zero-day work do not create fabricated intervals.
 *
 * @param {any} group Resource group from portfolioResources or its projection.
 * @param {{offset?:number,workOffset?:number,workLimit?:number}} [options]
 * @returns {{resourceId:string,resourceLabel:string,offset:number,periodCount:number,
 * period: {kind:string,startDate:string,endDate:string,days:number,loadPct:number,
 * capacityPct:number,workCount:number,projectCount:number,workOffset:number,
 * workLimit:number,works:Array<{projectId:string,projectName:string,workId:string,
 * title:string,allocationPct:number}>}|null,overloadDays:number,unavailableDays:number,
 * undatedWork:number}}
 */
export function resourceConflictPeriods(group,{offset=0,workOffset=0,workLimit=8}={}){
 if(!group||!Array.isArray(group.work)||
    !Number.isSafeInteger(offset)||offset<0||
    !Number.isSafeInteger(workOffset)||workOffset<0||
    !Number.isSafeInteger(workLimit)||workLimit<1||workLimit>30)
  throw Error("Некорректный запрос периодов ресурсного конфликта");
 /** @type {{kind:string,startDate:string,endDate:string,days:number,
  * loadPct:number,capacityPct:number,workCount:number,projectCount:number,
  * workOffset:number,workLimit:number,works:Array<{projectId:string,
  * projectName:string,workId:string,title:string,allocationPct:number}>}|null} */
 let period=null;
 let periodCount=0;
 const aggregate=dayEvents(group,(segment,active)=>{
  if(periodCount++!==offset)return;
  const all=[...active.values()].map(x=>x.work).sort((a,b)=>
   a.projectName.localeCompare(b.projectName,"ru")||a.title.localeCompare(b.title,"ru")||
   a.projectId.localeCompare(b.projectId)||a.id.localeCompare(b.id));
  const count=all.length;
  const safeOffset=Math.min(workOffset,Math.max(0,Math.floor((count-1)/workLimit)*workLimit));
  period={kind:segment.kind,startDate:date(segment.from),endDate:date(segment.until-1),
   days:segment.until-segment.from,loadPct:segment.loadPct,capacityPct:segment.capacityPct,
   workCount:count,projectCount:new Set(all.map(w=>w.projectId)).size,
   workOffset:safeOffset,workLimit,works:all.slice(safeOffset,safeOffset+workLimit).map(w=>({
    projectId:w.projectId,projectName:w.projectName,workId:w.id,title:w.title,
    allocationPct:w.allocationPct}))};
 });
 return {resourceId:group.id,resourceLabel:group.label,offset,periodCount,period,
  overloadDays:aggregate.overloadDays,unavailableDays:aggregate.unavailableDays,
  undatedWork:group.undatedWork??group.work.filter(w=>w.startDay===null).length};
}


/**
 * Exact per-Work conflict participation, using the same occupied intervals
 * and availability precedence as the resource totals. Project-scoped keys
 * prevent identical Work IDs in different projects from being conflated.
 */
export function resourceWorkConflicts(group,projectId){
 const result=new Map();
 if(!group||!projectId)return result;
 dayEvents(group,(segment,active)=>{
  for(const {work} of active.values()){
   if(work.projectId!==projectId)continue;
   const row=result.get(work.id)??{overloadDays:0,unavailableDays:0};
   row[segment.kind==="overload"?"overloadDays":"unavailableDays"]+=segment.until-segment.from;
   result.set(work.id,row);
  }
 });
 return result;
}

/** Both selected Works must participate in an actual overload interval. */
export function resourceOverloadContainsPair(group,projectId,firstWorkId,secondWorkId){
 if(!group||!projectId||!firstWorkId||!secondWorkId||firstWorkId===secondWorkId)return false;
 const first=JSON.stringify([projectId,firstWorkId]),second=JSON.stringify([projectId,secondWorkId]);
 let found=false;
 dayEvents(group,(segment,active)=>{
  if(segment.kind==="overload"&&active.has(first)&&active.has(second))found=true;
 });
 return found;
}

/**
 * Compare actual conflict intervals, not merely their total lengths. Uses
 * the same sweep and civil dates as resourceConflictPeriods. Only the
 * requested page is retained; no expansion into individual days.
 * @param {any} before
 * @param {any} after
 * @param {{offset?:number,limit?:number}} [options]
 * @returns {{resourceId:string,resourceLabel:string,offset:number,limit:number,count:number,
 * totals:Record<string,number>,rows:Array<{kind:string,startDate:string,endDate:string,
 * days:number,beforeKind:string|null,afterKind:string|null,beforeLoadPct:number|null,
 * afterLoadPct:number|null,beforeExcessPct:number,afterExcessPct:number}>}}
 */
export function resourceConflictDifference(before,after,{offset=0,limit=4}={}){
 if(!before||!after||before.id!==after.id||!Array.isArray(before.work)||!Array.isArray(after.work)||
    !Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>12)
  throw Error('Invalid resource conflict difference');
 const intervals=group=>{
  const out=[];
  dayEvents(group,segment=>out.push(segment),false);
  return out;
 };
 const a=intervals(before),b=intervals(after);
 const boundaries=[...new Set([...a,...b].flatMap(x=>[x.from,x.until]))].sort((x,y)=>x-y);
 const totals={NEW:0,CLEARED:0,WORSENED:0,RELIEVED:0,CHANGED_KIND:0};
 const rows=[];
 let i=0,j=0,count=0,pending=null;
 const flush=()=>{
  if(!pending)return;
  totals[pending.kind]+=pending.until-pending.from;
  if(count>=offset&&rows.length<limit)rows.push({kind:pending.kind,startDate:date(pending.from),
   endDate:date(pending.until-1),days:pending.until-pending.from,beforeKind:pending.beforeKind,
   afterKind:pending.afterKind,beforeLoadPct:pending.beforeLoadPct,afterLoadPct:pending.afterLoadPct,
   beforeExcessPct:pending.beforeExcessPct,afterExcessPct:pending.afterExcessPct});
  count++;pending=null;
 };
 for(let k=0;k+1<boundaries.length;k++){
  const from=boundaries[k],until=boundaries[k+1];
  while(i<a.length&&a[i].until<=from)i++;
  while(j<b.length&&b[j].until<=from)j++;
  const old=i<a.length&&a[i].from<=from?a[i]:null;
  const next=j<b.length&&b[j].from<=from?b[j]:null;
  const excess=x=>x?(x.kind==='overload'?x.loadPct-x.capacityPct:x.loadPct):0;
  const beforeExcessPct=excess(old),afterExcessPct=excess(next);
  const kind=!old&&next?'NEW':old&&!next?'CLEARED':old&&next&&old.kind!==next.kind?'CHANGED_KIND':
   afterExcessPct>beforeExcessPct?'WORSENED':afterExcessPct<beforeExcessPct?'RELIEVED':null;
  if(!kind){flush();continue;}
  const row={kind,from,until,beforeKind:old?.kind??null,afterKind:next?.kind??null,
   beforeLoadPct:old?.loadPct??null,afterLoadPct:next?.loadPct??null,beforeExcessPct,afterExcessPct};
  if(pending&&pending.until===from&&pending.kind===kind&&pending.beforeKind===row.beforeKind&&
     pending.afterKind===row.afterKind&&pending.beforeLoadPct===row.beforeLoadPct&&
     pending.afterLoadPct===row.afterLoadPct&&pending.beforeExcessPct===beforeExcessPct&&
     pending.afterExcessPct===afterExcessPct){pending.until=until;continue;}
  flush();pending=row;
 }
 flush();
 return {resourceId:before.id,resourceLabel:before.label,offset,limit,count,totals,rows};
}

// Shared impact projections for resource sequence and multi-Work amendments.
export function planningResourceTotals(view){
 return {overloadDays:view.people.reduce((n,r)=>n+r.overloadDays,0),
  unavailableDays:view.people.reduce((n,r)=>n+r.unavailableDays,0),
  overloadPctDays:view.people.reduce((n,r)=>n+r.overloadPctDays,0),
  unavailablePctDays:view.people.reduce((n,r)=>n+r.unavailablePctDays,0),
  overloaded:view.totals.potentialConflicts,unavailable:view.totals.outsideAvailability,
  undated:view.totals.undated,unlinked:view.totals.unlinked};
}
/**
 * Actual resource-conflict participation of an explicitly selected project
 * scope. Reuse the authoritative sweep, including work in OTHER projects
 * sharing the same resource. One resource-day is counted once per scope,
 * not once per participating Work or project.
 */
function planningResourceScopeProjection(view,projectIds){
 const ids=new Set(projectIds);
 const blank=()=>({openWork:0,linked:0,unlinked:0,positiveUnlinked:0,undated:0,
  conflictedWork:0,overloadWork:0,unavailableWork:0,overloadDays:0,unavailableDays:0,conflictResources:0});
 const totals=blank(),projects=new Map([...ids].map(id=>[id,{id,...blank()}]));
 const selected=view.work.filter(w=>ids.has(w.projectId));
 const conflicts=new Map(),scopeResources=new Set(),projectResources=new Map([...ids].map(id=>[id,new Set()]));
 for(const group of view.people){
  if(!group.overloadDays&&!group.unavailableDays||!group.work.some(w=>ids.has(w.projectId)))continue;
  dayEvents(group,(segment,active)=>{
   const participating=new Set(),length=segment.until-segment.from;
   const metric=segment.kind==="overload"?"overloadDays":"unavailableDays";
   for(const [key,{work}] of active){
    if(!ids.has(work.projectId))continue;
    const detail=conflicts.get(key)??{overloadDays:0,unavailableDays:0};
    detail[metric]+=length;conflicts.set(key,detail);
    participating.add(work.projectId);
   }
   if(!participating.size)return;
   totals[metric]+=length;scopeResources.add(group.id);
   for(const projectId of participating){
    projects.get(projectId)[metric]+=length;projectResources.get(projectId).add(group.id);
   }
  });
 }
 const examples=[],conflictWorks=new Map();
 for(const work of selected){
  const detail=conflicts.get(JSON.stringify([work.projectId,work.id]));
  for(const stats of [totals,projects.get(work.projectId)]){
   stats.openWork++;
   if(work.resourceId)stats.linked++;else{
    stats.unlinked++;
    if(work.estimateDays>0)stats.positiveUnlinked++;
   }
   if(work.startDay===null)stats.undated++;
   if(detail){
    stats.conflictedWork++;
    if(detail.overloadDays>0)stats.overloadWork++;
    if(detail.unavailableDays>0)stats.unavailableWork++;
   }
  }
  if(detail){
   const row={projectId:work.projectId,projectName:work.projectName,workId:work.id,
    title:work.title,resourceId:work.resourceId,resourceLabel:work.resourceLabel,...detail};
   examples.push(row);conflictWorks.set(JSON.stringify([work.projectId,work.id]),row);
  }
 }
 totals.conflictResources=scopeResources.size;
 for(const [id,stats] of projects)stats.conflictResources=projectResources.get(id).size;
 examples.sort((a,b)=>(b.overloadDays+b.unavailableDays)-(a.overloadDays+a.unavailableDays)||
  a.projectName.localeCompare(b.projectName,"ru")||a.title.localeCompare(b.title,"ru")||
  a.projectId.localeCompare(b.projectId)||a.workId.localeCompare(b.workId));
 return {scope:{totals,projects:[...projects.values()],examples:examples.slice(0,8)},conflictWorks};
}
export function planningResourceScope(view,projectIds){
 return planningResourceScopeProjection(view,projectIds).scope;
}
/**
 * Equal aggregate load may conceal a newly conflicted Work when assignments
 * exchange places. Complete counts use all participating Works.
 */
export function comparePlanningResourceScopes(before,after,projectIds){
 const ids=[...projectIds];
 const a=planningResourceScopeProjection(before,ids),b=planningResourceScopeProjection(after,ids);
 const blank=()=>({newlyConflicted:0,cleared:0,worsened:0,relieved:0,resourceChanged:0,changed:0});
 const totals=blank(),byProject=new Map(ids.map(id=>[id,{id,...blank()}]));
 const examples=[];
 for(const key of new Set([...a.conflictWorks.keys(),...b.conflictWorks.keys()])){
  const old=a.conflictWorks.get(key),next=b.conflictWorks.get(key);
  const newlyConflicted=!old&&!!next,cleared=!!old&&!next;
  const worsened=!!old&&!!next&&(next.overloadDays>old.overloadDays||next.unavailableDays>old.unavailableDays);
  const relieved=!!old&&!!next&&(next.overloadDays<old.overloadDays||next.unavailableDays<old.unavailableDays);
  const resourceChanged=!!old&&!!next&&old.resourceId!==next.resourceId;
  if(!newlyConflicted&&!cleared&&!worsened&&!relieved&&!resourceChanged)continue;
  const work=next??old;
  for(const stats of [totals,byProject.get(work.projectId)]){
   stats.changed++;
   if(newlyConflicted)stats.newlyConflicted++;
   if(cleared)stats.cleared++;
   if(worsened)stats.worsened++;
   if(relieved)stats.relieved++;
   if(resourceChanged)stats.resourceChanged++;
  }
  examples.push({projectId:work.projectId,projectName:work.projectName,workId:work.workId,title:work.title,
   beforeResource:old?.resourceLabel??null,afterResource:next?.resourceLabel??null,
   beforeOverloadDays:old?.overloadDays??0,afterOverloadDays:next?.overloadDays??0,
   beforeUnavailableDays:old?.unavailableDays??0,afterUnavailableDays:next?.unavailableDays??0,
   newlyConflicted,cleared,worsened,relieved,resourceChanged});
 }
 examples.sort((x,y)=>Number(y.newlyConflicted||y.worsened||y.resourceChanged)-Number(x.newlyConflicted||x.worsened||x.resourceChanged)||
  Number(y.newlyConflicted)-Number(x.newlyConflicted)||
  x.projectName.localeCompare(y.projectName,"ru")||x.title.localeCompare(y.title,"ru")||
  x.projectId.localeCompare(y.projectId)||x.workId.localeCompare(y.workId));
 return {before:a.scope,after:b.scope,workChanges:{totals,projects:[...byProject.values()],examples:examples.slice(0,8)}};
}
export function comparePlanningResourceGroups(before,after){
 const changes=[];
 for(const old of before.people){
  const next=after.byId.get(old.id);
  if(!next)throw Error('Ресурс исчез из расчёта');
  const overloadDelta=next.overloadDays-old.overloadDays;
  const availabilityDelta=next.unavailableDays-old.unavailableDays;
  const peakDelta=next.maxLoadPct-old.maxLoadPct;
  const overloadDepthDelta=next.overloadPctDays-old.overloadPctDays;
  const availabilityDepthDelta=next.unavailablePctDays-old.unavailablePctDays;
  const undatedDelta=next.undatedWork-old.undatedWork;
  const periodChanges=old.overloadDays||next.overloadDays||old.unavailableDays||next.unavailableDays?
   resourceConflictDifference(old,next,{limit:3}):null;
  const dates=periodChanges?.totals??{NEW:0,CLEARED:0,WORSENED:0,RELIEVED:0,CHANGED_KIND:0};
  if(!overloadDelta&&!availabilityDelta&&!peakDelta&&!undatedDelta&&!overloadDepthDelta&&!availabilityDepthDelta&&!periodChanges?.count)continue;
  changes.push({id:old.id,label:old.label,overloadBefore:old.overloadDays,
   overloadAfter:next.overloadDays,availabilityBefore:old.unavailableDays,
   availabilityAfter:next.unavailableDays,peakBefore:old.maxLoadPct,
   peakAfter:next.maxLoadPct,undatedBefore:old.undatedWork,undatedAfter:next.undatedWork,
   overloadDelta,availabilityDelta,peakDelta,undatedDelta,overloadDepthDelta,availabilityDepthDelta,
   overloadDepthBefore:old.overloadPctDays,overloadDepthAfter:next.overloadPctDays,
   availabilityDepthBefore:old.unavailablePctDays,availabilityDepthAfter:next.unavailablePctDays,
   periodChanges,
   worsened:overloadDelta>0||availabilityDelta>0||undatedDelta>0||overloadDepthDelta>0||availabilityDepthDelta>0||
    next.peakExcessPct>old.peakExcessPct||dates.NEW>0||dates.WORSENED>0||dates.CHANGED_KIND>0,
   improved:overloadDelta<0||availabilityDelta<0||undatedDelta<0||overloadDepthDelta<0||availabilityDepthDelta<0||
    next.peakExcessPct<old.peakExcessPct||dates.CLEARED>0||dates.RELIEVED>0});
 }
 return changes.sort((a,b)=>Number(b.worsened)-Number(a.worsened)||
  Math.abs(b.overloadDelta)+Math.abs(b.availabilityDelta)-
  Math.abs(a.overloadDelta)-Math.abs(a.availabilityDelta)||a.label.localeCompare(b.label,'ru'));
}
// The single capacity summarizer is also used for a hypothetical reassignment.
// It consumes the canonical occupied intervals, never recalculates the CPM.
function summarizeResourceGroup(r){
 const projects=new Set(r.work.map(w=>w.projectId));
 return {...r,projects,projectCount:projects.size,itemCount:r.work.length,
  scheduledDays:r.work.reduce((n,w)=>n+w.estimateDays,0),
  occupiedCalendarDays:r.work.reduce((n,w)=>n+w.activeRanges.reduce((total,[from,until])=>total+until-from,0),0),
  datedWork:r.work.filter(w=>w.startDay!==null).length,
  undatedWork:r.work.filter(w=>w.startDay===null).length,
  ...dayEvents(r)};
}

/**
 * Project a resource-link-only change on existing authoritative calendar rows.
 * Recalculate at most two resource groups, including the unlinked-to-resource
 * case. No clone of the whole portfolio, no new CPM and no persistent change.
 */
export function projectResourceReassignment(view,{projectId,workId,targetResourceId}){
 const current=view.work.find(w=>w.projectId===projectId&&w.id===workId);
 if(!current)throw Error("Нет расчёта выбранной работы");
 const source=current.resourceId?view.byId.get(current.resourceId):null;
 const target=view.byId.get(targetResourceId);
 if(!target||(current.resourceId&&!source)||current.resourceId===targetResourceId)
  throw Error("Нет расчёта выбранных ресурсов");
 const alternative={...current,resourceId:targetResourceId,resourceLabel:target.label};
 const sameWork=w=>w.projectId===projectId&&w.id===workId;
 const sourceAfter=source?summarizeResourceGroup({
  ...source,work:source.work.filter(w=>!sameWork(w))
 }):null;
 const targetAfter=summarizeResourceGroup({...target,work:[...target.work,alternative]});
 return {current,alternative,source,sourceAfter,target,targetAfter};
}

export function portfolioResources(snapshot,{schedule=null}={}){
 const forecast=schedule||portfolioSchedule(snapshot);
 const groups=new Map((snapshot.resources||[]).map(r=>[r.id,{
  id:r.id,label:r.label,capacityPct:r.capacityPct,availableFrom:r.availableFrom||null,
  availableUntil:r.availableUntil||null,work:[],projects:new Set()
 }]));
 const work=[];
 const totals={openWork:0,assigned:0,unassigned:0,unlinked:0,undated:0,dated:0,
  zeroDay:0,potentialConflicts:0,outsideAvailability:0,assignees:0};
 for(const project of snapshot.projects){
  if(project.status==="cancelled")continue;
  const start=day(forecast.byId.get(project.id)?.projectedStart);
  const own=scheduleProject(project,{calendarLibrary:snapshot.calendarLibrary??[],
   startDate:start===null?project.startDate:forecast.byId.get(project.id)?.projectedStart,
   includeResourceOccupancy:true});
  const items=new Map(project.items.map(x=>[x.id,x]));
  for(const planned of own.rows){
   if(planned.state==="done")continue;
   const item=items.get(planned.id),owner=names(item.assignee||"");
   const resourceId=item.resourceId||null;
   const linked=resourceId?groups.get(resourceId):null;
   const startDay=start===null?null:start+planned.earlyStart;
   const finishDay=start===null?null:start+planned.earlyFinish;
   const row={projectId:project.id,projectName:project.name,id:item.id,title:item.title,
    state:item.state,assignee:owner,resourceId,resourceLabel:linked?.label||null,
    allocationPct:item.allocationPct??100,estimateDays:planned.durationDays,
    durationUnit:planned.durationUnit,
    activeRanges:start===null?[]:(planned.activeRanges??[]).map(([from,until])=>[start+from,start+until]),
    startDay,finishDay,startDate:startDay===null?null:date(startDay),
    finishDate:finishDay===null?null:date(finishDay)};
   work.push(row);totals.openWork++;
   if(!owner)totals.unassigned++;else totals.assigned++;
   if(!resourceId)totals.unlinked++;
   if(startDay===null)totals.undated++;else totals.dated++;
   if(planned.durationDays===0)totals.zeroDay++;
   if(linked){linked.work.push(row);linked.projects.add(project.id)}
  }
 }
 const people=[...groups.values()].map(summarizeResourceGroup).sort((a,b)=>(b.overloadDays+b.unavailableDays)-(a.overloadDays+a.unavailableDays)||
  b.undatedWork-a.undatedWork||a.label.localeCompare(b.label,"ru"));
 totals.potentialConflicts=people.filter(r=>r.overloadDays>0).length;
 totals.outsideAvailability=people.filter(r=>r.unavailableDays>0).length;
 totals.assignees=people.length;
 const byId=new Map(people.map(p=>[p.id,p]));
 return {people,byId,work,totals,
  warning:"Ресурсы и мощность заданы человеком для планирования, не являются проверенной личностью, официальной доступностью или полномочием. Занятость учитывает закреплённые рабочие календари и календарные операции исходного CPM; выравнивания нагрузки нет."};
}
export function renderPortfolioResources(snapshot,escape=esc){
 const {people,totals:t}=portfolioResources(snapshot);
 const rows=people.slice(0,60).map(p=>{
  const issue=p.overloadDays||p.unavailableDays?
   '<strong>Выше мощности: '+p.overloadDays+' дн.; вне доступности: '+p.unavailableDays+' дн.</strong>':
   p.undatedWork?'Сроки части работ неизвестны':'В известных сроках превышений нет';
  return '<tr><td><strong>'+escape(p.label)+'</strong><small>Плановая привязка, не учётная запись</small></td>'+
   '<td>'+p.capacityPct+'%</td><td>'+escape(show(p.availableFrom))+' — '+escape(show(p.availableUntil))+'</td>'+
   '<td>'+p.projectCount+'</td><td>'+p.itemCount+'</td><td>'+p.maxLoadPct+'%</td>'+
   '<td>'+issue+'</td><td>'+p.undatedWork+'</td>'+
   '<td><button data-action="resource-edit:'+escape(p.id)+'">Настроить</button></td></tr>';
 }).join("");
 return '<section class="card" id="atlas-portfolio-resources"><div class="row"><h2>Ресурсные обязательства портфеля</h2>'+
  '<button data-action="resource-new" class="primary">＋ Плановый ресурс</button></div>'+
  '<p class="muted">Объединение работ только по явно выбранному ресурсу. Совпадение имени ответственного не означает, что это один человек. Мощность — плановые проценты, а не измеренная занятость.</p>'+
  '<div class="atlas-kpis"><div><small>Плановых ресурсов</small><strong>'+t.assignees+'</strong></div>'+
  '<div><small>Выше заданной мощности</small><strong>'+t.potentialConflicts+'</strong></div>'+
  '<div><small>Вне периода доступности</small><strong>'+t.outsideAvailability+'</strong></div>'+
  '<div><small>Работ без привязки</small><strong>'+t.unlinked+'</strong></div>'+
  '<div><small>Работ без даты</small><strong>'+t.undated+'</strong></div></div>'+
  (rows?'<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr>'+
   '<th>Ресурс</th><th>Мощность</th><th>Доступность (заявлено)</th><th>Проектов</th><th>Работ</th>'+
   '<th>Макс. нагрузка</th><th>Ограничения</th><th>Без дат</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>':
   '<p class="muted">Плановые ресурсы пока не определены. Создайте ресурс и явно привяжите к нему работы через форму редактирования.</p>')+
  (people.length>60?'<p class="muted">Показаны первые 60 из '+people.length+' ресурсов.</p>':"")+
  '<p class="muted">Нулевое превышение не означает доступности человека: не учитываются рабочие часы, отпуска, реальное исполнение, права и другие системы планирования.</p></section>';
}
export function renderProjectResources(snapshot,projectId,escape=esc){
 const result=portfolioResources(snapshot),rows=result.work.filter(w=>w.projectId===projectId);
 if(!rows.length)return "";
 const tr=rows.slice(0,50).map(w=>{
  const group=w.resourceId?result.byId.get(w.resourceId):null;
  const signal=!group?'Не связан с ресурсом':!w.startDate?'Недостаточно дат':
   group.unavailableDays>0?'Есть задачи вне периода доступности':
   group.overloadDays>0?'Есть перегрузка планового ресурса':
   'По известным датам превышений нет';
  return '<tr><td><button class="atlas-plain-button" data-action="work:'+escape(w.id)+'">'+escape(w.title)+'</button></td>'+
   '<td>'+escape(w.assignee||"Не назначен")+'</td><td>'+escape(group?.label||"Не привязан")+'</td>'+
   '<td>'+w.allocationPct+'%</td><td>'+w.estimateDays+(w.durationUnit==='working_days'?' раб. дн.':' кал. дн.')+'</td>'+ 
   '<td>'+escape(show(w.startDate))+'</td><td>'+escape(show(w.finishDate))+'</td><td>'+escape(signal)+'</td></tr>';
 }).join("");
 return '<section class="card" id="atlas-project-resources"><h2>Ресурсы работ проекта</h2>'+
  '<p class="muted">Для межпроектного сопоставления явно выберите один плановый ресурс в карточке работы. Имя ответственного остаётся отдельным текстовым полем.</p>'+
  '<div class="atlas-table-scroll"><table class="atlas-table"><thead><tr><th>Работа</th><th>Ответственный</th><th>Ресурс</th><th>Доля</th><th>Длительность</th><th>Начало CPM</th><th>Финиш CPM</th><th>Внимание</th></tr></thead><tbody>'+tr+'</tbody></table></div>'+
  (rows.length>50?'<p class="muted">Показаны 50 из '+rows.length+' работ.</p>':"")+
  '<p class="muted">Прогноз не распределяет работы автоматически, не подтверждает доступность и не заменяет решение человека.</p></section>';
}

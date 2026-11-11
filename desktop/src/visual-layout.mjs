// Presentation-only projections of the existing CPM schedule. No second planner/store.
const DAY_MS=86400000;
const DATE_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
const NODE_WIDTH=208, NODE_HEIGHT=78, COLUMN_GAP=100, ROW_GAP=28, PAD=28;

function positiveInteger(value,fallback){return Number.isSafeInteger(value)&&value>=0?value:fallback;}
function calendarDay(value){
 if(!value||!DATE_PATTERN.test(value))return null;
 const day=Date.parse(value+'T00:00:00Z')/DAY_MS;
 return Number.isSafeInteger(day)?day:null;
}
function calendarLabel(start,day){
 const epoch=calendarDay(start);
 if(epoch===null)return 'День '+day;
 const date=new Date((epoch+day)*DAY_MS);
 return Number.isFinite(date.getTime())&&date.getUTCFullYear()<=9999?
  date.toISOString().slice(0,10):'День '+day;
}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

/** Includes clipped bar spans and a marker for zero-day work; never invents dates. */
export function ganttViewport(schedule,{scale='fit',offset=0,startDate=null,dueDate=null}={}){
 if(!schedule||!Array.isArray(schedule.rows))throw Error('Invalid CPM schedule');
 if(!['fit','30','90'].includes(scale))throw Error('Unsupported Gantt scale');
 const horizon=positiveInteger(schedule.durationDays,0);
 const days=scale==='fit'?Math.max(1,horizon):Number(scale);
 const maxOffset=Math.max(0,horizon-days);
 const from=scale==='fit'?0:clamp(positiveInteger(offset,0),0,maxOffset);
 const until=from+days;
 const ticks=[],seen=new Set();
 for(let index=0;index<=5;index++){
  const day=Math.round(from+days*index/5);
  if(seen.has(day))continue;
  seen.add(day);
  ticks.push({day,positionPct:100*(day-from)/days,label:calendarLabel(startDate,day)});
 }
 const rows=schedule.rows.map(row=>{
  const start=positiveInteger(row.earlyStart,0),finish=positiveInteger(row.earlyFinish,start);
  const isMilestone=finish===start;
  const visible=isMilestone?start>=from&&start<=until:finish>from&&start<until;
  const left=clamp(100*(start-from)/days,0,100);
  const right=clamp(100*(finish-from)/days,0,100);
  // Only the canonical CPM's real calendar finish can establish a missed
  // work deadline. A relative-day project must not invent calendar risk.
  const dueDay=calendarDay(row.dueDate),finishDay=calendarDay(row.finishDate);
  const missedDeadline=dueDay!==null&&finishDay!==null&&finishDay>dueDay;
  return {id:row.id,title:row.title,critical:!!row.critical,
   state:row.state||'todo',blockedBy:row.blockedBy||[],floatDays:row.floatDays,
   dueDate:row.dueDate??null,missedDeadline,
   durationDays:row.durationDays??finish-start,earlyStart:start,earlyFinish:finish,
   dateStart:calendarLabel(startDate,start),dateFinish:calendarLabel(startDate,finish),
   isMilestone,visible,leftPct:left,widthPct:Math.max(0,right-left)};
 });
 const deadlineDay=calendarDay(dueDate)!==null&&calendarDay(startDate)!==null?
  calendarDay(dueDate)-calendarDay(startDate):null;
 const deadline=deadlineDay!==null&&deadlineDay>=from&&deadlineDay<=until?
  {day:deadlineDay,positionPct:100*(deadlineDay-from)/days,label:dueDate}:null;
 return {rows,ticks,days,horizon,from,until,maxOffset,deadline,dated:calendarDay(startDate)!==null,
  windowLabel:calendarLabel(startDate,from)+' — '+calendarLabel(startDate,until),
  visibleCount:rows.filter(r=>r.visible).length};
}

/** Locate a real CPM work item within a zoomed timeline without changing it. */
export function ganttFocusOffset(schedule,workId,scale='30'){
 if(!['30','90'].includes(scale))throw Error('Unsupported Gantt focus scale');
 const view=ganttViewport(schedule,{scale});
 const row=view.rows.find(item=>item.id===workId);
 if(!row)throw Error('Gantt work not found');
 return clamp(row.earlyStart-Math.floor(view.days/5),0,view.maxOffset);
}

/** Deterministic layered DAG view; the core already validated/ordered the work DAG. */
export function dependencyDiagram(schedule,{limit=80,focusId=null}={}){
 if(!schedule||!Array.isArray(schedule.rows))throw Error('Invalid CPM schedule');
 const all=schedule.rows;
 const byId=new Map(all.map(x=>[x.id,x]));
 if(byId.size!==all.length)throw Error('Duplicate DAG node');
 const bounded=clamp(positiveInteger(limit,80),1,100);
 const children=new Map(all.map(row=>[row.id,[]]));
 for(const row of all)for(const p of row.predecessors||[]){
  if(!children.has(p))throw Error('Dangling DAG predecessor');
  children.get(p).push(row.id);
 }
 let selected;
 const focused=focusId&&byId.has(focusId)?focusId:null;
 if(focused){
  selected=new Set([focused]);
  const queue=[{id:focused,distance:0}];
  for(let at=0;at<queue.length&&selected.size<bounded;at++){
   const {id,distance}=queue[at];
   if(distance>=2)continue;
   const adjacent=[...(byId.get(id).predecessors||[]),...children.get(id)];
   for(const neighbor of adjacent){
    if(selected.size>=bounded)break;
    if(!selected.has(neighbor)){
     selected.add(neighbor);queue.push({id:neighbor,distance:distance+1});
    }
   }
  }
 }else selected=new Set(all.slice(0,bounded).map(row=>row.id));
 const ordered=all.filter(row=>selected.has(row.id));
 const depth=new Map();
 // Keep meaningful depth even when a predecessor is outside the rendered subset.
 for(const row of all){
  const parentDepth=(row.predecessors||[]).map(p=>depth.get(p));
  if(parentDepth.some(v=>v===undefined))throw Error('CPM work is not topologically ordered');
  depth.set(row.id,parentDepth.length?1+Math.max(...parentDepth):0);
 }
 const minDepth=ordered.length?Math.min(...ordered.map(row=>depth.get(row.id))):0;
 const cols=new Map();
 for(const row of ordered){
  const d=depth.get(row.id)-minDepth;
  if(!cols.has(d))cols.set(d,[]);
  cols.get(d).push(row);
 }
 const maxDepth=cols.size?Math.max(...cols.keys()):0;
 const maxRows=Math.max(1,...[...cols.values()].map(items=>items.length));
 const columnStep=NODE_WIDTH+COLUMN_GAP,rowStep=NODE_HEIGHT+ROW_GAP;
 const width=2*PAD+(maxDepth+1)*NODE_WIDTH+maxDepth*COLUMN_GAP;
 const height=2*PAD+maxRows*NODE_HEIGHT+(maxRows-1)*ROW_GAP;
 const nodes=[],position=new Map();
 for(const [d,col] of cols)for(let rank=0;rank<col.length;rank++){
  const r=col[rank];
  const node={id:r.id,title:r.title,state:r.state,critical:!!r.critical,
   blockedBy:r.blockedBy?.length||0,floatDays:r.floatDays??null,
   x:PAD+d*columnStep,y:PAD+rank*rowStep,width:NODE_WIDTH,height:NODE_HEIGHT};
  nodes.push(node);position.set(node.id,node);
 }
 const edges=[];
 for(const row of ordered)for(const fromId of row.predecessors||[]){
  const from=position.get(fromId),to=position.get(row.id);
  if(!from||!to)continue;
  const x1=from.x+NODE_WIDTH,y1=from.y+NODE_HEIGHT/2;
  const x2=to.x,y2=to.y+NODE_HEIGHT/2;
  const bend=Math.max(15,(x2-x1)*0.43);
  edges.push({from:fromId,to:row.id,
   critical:!!byId.get(fromId).critical&&!!row.critical&&byId.get(fromId).earlyFinish===row.earlyStart,
   path:'M '+x1+' '+y1+' C '+(x1+bend)+' '+y1+', '+(x2-bend)+' '+y2+', '+x2+' '+y2});
 }
 return {nodes,edges,width:Math.max(340,width),height:Math.max(140,height),
  total:all.length,shown:nodes.length,partial:nodes.length<all.length,focusId:focused};
}

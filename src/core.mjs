// Atlas v0.1 project domain; never executes agent tasks or writes to external sources.
import {validatePortfolioLinks} from "./portfolio.mjs";
import {validCauseKey} from "./response.mjs";
import toposort from "./vendor/toposort.mjs";
export const SCHEMA="atlas.project/1";
// One identity for an action in an existing change record. The directed
// dependency is identified by both local Work IDs, not its display title.
export const planAmendmentKey=a=>a.kind==="dates"?"dates":a.kind==="work"?"work:"+a.itemId:
 a.kind==="dependency"?"dependency:"+JSON.stringify([a.from,a.to]):"new_work:"+a.id;
const types=new Set(["personal","team","business","engineering","research","care","other"]);
const statuses=new Set(["planned","active","paused","completed","cancelled"]);
const workStates=new Set(["todo","in_progress","blocked","done"]);
const priorities=new Set(["low","normal","high","critical"]);
const kinds=new Set(["github","github_owner","gitlab","forgejo","gitea","obsidian","anytype","jira","file","other"]);
const uid=()=>crypto.randomUUID();
const nonempty=(x,label)=>{if(typeof x!=="string"||!x.trim())throw Error(label+" required");return x.trim()};
const validSourcePath=value=>typeof value==="string"&&value.length>0&&value.length<=320&&
 !value.startsWith("/")&&!value.endsWith("/")&&!value.includes("\\")&&
 value.split("/").every(part=>part.length>0&&part!=="."&&part!==".."&&
  !/[\u0000-\u001f]/.test(part));
const validDate=value=>{if(value==null||value==="")return true;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value};

/**
 * Optional PROJECT-OWNED what-if calendar profiles. They are user drafts and
 * never modify estimateDays, the canonical calendar-day CPM or an accepted
 * Result. The existing atlas.project/1 container and native Store are reused.
 */
const calendarDate=value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 validDate(value);
const durationUnits=new Set(["elapsed_days","working_days"]);
const calendarDates=(dates,label)=>{
 if(!Array.isArray(dates)||dates.length>1000||dates.some(d=>!calendarDate(d))||
  new Set(dates).size!==dates.length)throw Error("Invalid "+label);
 return [...dates].sort();
};
/**
 * Shared LOCAL Atlas-portfolio work calendars. A recorded source is only
 * provenance supplied by the user; it is not verified or approved by Admin.
 * Each revision is a separate immutable entry, never modified in place.
 */
function normalizedCalendarRules(data){
 if(!data||typeof data!=="object"||Array.isArray(data))
  throw Error("Invalid calendar rules");
 const weekdays=data.weekdays;
 if(!Array.isArray(weekdays)||weekdays.length<1||weekdays.length>7||
   new Set(weekdays).size!==weekdays.length||
   weekdays.some(day=>!Number.isInteger(day)||day<0||day>6))
  throw Error("Invalid calendar weekdays");
 const excludedDates=calendarDates(data.excludedDates??[],"calendar excluded dates");
 const additionalWorkingDates=calendarDates(data.additionalWorkingDates??[],
  "calendar additional working dates");
 if(additionalWorkingDates.some(day=>excludedDates.includes(day)))
  throw Error("Conflicting calendar date");
 return {weekdays:[...weekdays].sort((a,b)=>a-b),
  excludedDates,additionalWorkingDates};
}
const sourceKinds=new Set(["entered_by_user","document_reference"]);
function normalizedCalendarSource(source){
 if(!source||typeof source!=="object"||Array.isArray(source)||
    !sourceKinds.has(source.kind))throw Error("Invalid calendar source");
 if(source.kind==="entered_by_user"){
  if(source.reference!==null&&source.reference!==undefined)
   throw Error("Invalid user-entered calendar source reference");
  return {kind:source.kind,reference:null};
 }
 if(typeof source.reference!=="string"||
    !source.reference.trim()||source.reference.trim().length>320)
  throw Error("Invalid calendar document source reference");
 return {kind:source.kind,reference:source.reference.trim()};
}
function calendarBasis(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||
  typeof value.id!=="string"||!value.id||value.id.length>128||
  !Number.isSafeInteger(value.version)||value.version<1)
  throw Error("Invalid calendar source revision");
 return {id:value.id,version:value.version};
}
function normalizedCalendarDraft(data,itemIds,{allowMissingWork=false}={}){
 if(!data||typeof data!=="object"||Array.isArray(data)||
  typeof data.name!=="string"||!data.name.trim()||data.name.trim().length>120)
  throw Error("Invalid calendar draft name");
 const rules=normalizedCalendarRules(data);
 const modeByWork=data.modeByWork??{};
 if(!modeByWork||typeof modeByWork!=="object"||Array.isArray(modeByWork)||
  Object.keys(modeByWork).length>5000)
  throw Error("Invalid calendar draft work modes");
 const modes=Object.entries(modeByWork);
 if(modes.some(([id,mode])=>(!allowMissingWork&&!itemIds.has(id))||
  !["elapsed_days","working_days"].includes(mode)))
  throw Error("Invalid calendar draft work modes");
 return {name:data.name.trim(),...rules,
  modeByWork:Object.fromEntries(modes.sort(([a],[b])=>a.localeCompare(b))),
  ...(data.calendarBasis===undefined?{}:{calendarBasis:calendarBasis(data.calendarBasis)})};
}
function checkCalendarLibrary(s){
 const library=s.calendarLibrary;
 if(library===undefined)return;
 if(!Array.isArray(library)||library.length>256)
  throw Error("Invalid calendar library");
 const last=new Map(),latestNames=new Set();
 for(const def of library){
  if(!def||typeof def.id!=="string"||!def.id||def.id.length>128||
   !Number.isSafeInteger(def.version)||def.version<1||def.version>8||
   typeof def.name!=="string"||!def.name.trim()||def.name!==def.name.trim()||
   def.name.length>120||
   typeof def.recordedAt!=="string"||!Number.isFinite(Date.parse(def.recordedAt)))
   throw Error("Invalid calendar library entry");
  const normalized=normalizedCalendarRules(def);
  for(const key of ["weekdays","excludedDates","additionalWorkingDates"]){
   if(JSON.stringify(normalized[key])!==JSON.stringify(def[key]))
    throw Error("Non-canonical calendar library "+key);
  }
  const source=normalizedCalendarSource(def.source);
  if(JSON.stringify(source)!==JSON.stringify(def.source))
   throw Error("Non-canonical calendar library source");
  const previous=last.get(def.id);
  if(def.version!==(previous?.version??0)+1)
   throw Error("Invalid calendar version history");
  last.set(def.id,def);
 }
 if(last.size>32)throw Error("Calendar library limit: 32");
 for(const latest of last.values()){
  const name=latest.name.toLocaleLowerCase("ru-RU");
  if(latestNames.has(name))throw Error("Duplicate calendar library name");
  latestNames.add(name);
 }
}
/** Return exact immutable revision (not the latest by accident). */
export function workCalendarRevision(s,id,version){
 validate(s);
 return (s.calendarLibrary??[]).find(def=>def.id===id&&def.version===version)??null;
}
/** Latest revision of each locally recorded calendar, for UI projections. */
export function latestWorkCalendars(s){
 validate(s);
 const latest=new Map();
 for(const def of s.calendarLibrary??[])latest.set(def.id,def);
 return [...latest.values()].sort((a,b)=>
  a.name.localeCompare(b.name,"ru")||a.id.localeCompare(b.id));
}

function checkCalendarDrafts(project){
 const drafts=project.calendarDrafts;
 if(drafts===undefined)return;
 if(!Array.isArray(drafts)||drafts.length>12)
  throw Error("Invalid project calendar drafts");
 const ids=new Set(),names=new Set(),workIds=new Set(project.items.map(w=>w.id));
 for(const d of drafts){
  if(!d||typeof d.id!=="string"||!d.id||d.id.length>128||
   ids.has(d.id)||!Number.isSafeInteger(d.version)||d.version<1||
   !Number.isSafeInteger(d.baseRevision)||d.baseRevision<0||
   typeof d.createdAt!=="string"||!Number.isFinite(Date.parse(d.createdAt))||
   typeof d.updatedAt!=="string"||!Number.isFinite(Date.parse(d.updatedAt)))
   throw Error("Invalid calendar draft identity");
  // Old Atlas 0.8 did not know calendar drafts: it can delete a Work while
  // preserving the unknown scenario field. Keep such historical links on
  // import, otherwise the complete native project would become unreadable.
  // New scenario writes still reject unknown Work IDs.
  const normalized=normalizedCalendarDraft(d,workIds,{allowMissingWork:true});
  const key=normalized.name.toLocaleLowerCase("ru-RU");
  if(names.has(key))throw Error("Duplicate calendar draft name");
  names.add(key);ids.add(d.id);
  for(const key of ["weekdays","excludedDates","additionalWorkingDates"]){
   if(JSON.stringify(d[key])!==JSON.stringify(normalized[key]))
    throw Error("Non-canonical calendar draft "+key);
  }
 }
}


// Historical control plans are retained in their original calendar dates.
// They never point at live Work objects: deleting or editing a Work cannot
// silently rewrite an earlier human-recorded project baseline.
function checkPlanBaselines(p){
 const plans=p.planBaselines;
 if(plans===undefined)return 0;
 if(!Array.isArray(plans)||plans.length>8)throw Error("Invalid project plan baselines");
 const ids=new Set(),names=new Set();
 let count=0;
 for(let index=0;index<plans.length;index++){
  const b=plans[index];
  if(!b||typeof b.id!=="string"||!b.id||b.id.length>128||ids.has(b.id)||
   typeof b.name!=="string"||!b.name.trim()||b.name!==b.name.trim()||b.name.length>120||
   !Number.isSafeInteger(b.version)||b.version!==index+1||
   !Number.isSafeInteger(b.sourceRevision)||b.sourceRevision<0||
   typeof b.recordedAt!=="string"||!Number.isFinite(Date.parse(b.recordedAt))||
   new Date(b.recordedAt).toISOString()!==b.recordedAt)
   throw Error("Invalid plan baseline identity");
  const name=b.name.toLocaleLowerCase("ru-RU");
  if(names.has(name))throw Error("Duplicate plan baseline name");
  names.add(name);ids.add(b.id);
  if(!validDate(b.projectStart)||!validDate(b.deadline)||
   !validDate(b.forecastStart)||!b.forecastStart||
   !validDate(b.forecastFinish)||!b.forecastFinish||
   b.forecastStart>b.forecastFinish)
   throw Error("Invalid plan baseline dates");
  if(!Array.isArray(b.work)||!b.work.length||b.work.length>5000)
   throw Error("Invalid plan baseline work");
  count+=b.work.length;
  const workIds=new Set();
  for(const w of b.work){
   if(!w||typeof w.id!=="string"||!w.id||workIds.has(w.id)||
    typeof w.title!=="string"||!w.title.trim()||
    !Number.isSafeInteger(w.estimateDays)||w.estimateDays<0||w.estimateDays>36500||
    !durationUnits.has(w.durationUnit)||typeof w.critical!=="boolean"||
    !validDate(w.startDate)||!w.startDate||!validDate(w.finishDate)||!w.finishDate||
    w.startDate>w.finishDate||!validDate(w.dueDate)||
    !Array.isArray(w.predecessors)||new Set(w.predecessors).size!==w.predecessors.length)
    throw Error("Invalid plan baseline work");
   // The original baseline schema remains readable. New control points
   // retain the actually recorded reserve and assignment, never live links.
   if(w.floatDays!==undefined&&(!Number.isSafeInteger(w.floatDays)||w.floatDays<0||
      w.critical!==(w.floatDays===0)))throw Error("Invalid plan baseline reserve");
   if(w.assignment!==undefined){
    const a=w.assignment;
    if(!a||typeof a!=="object"||Array.isArray(a)||typeof a.assignee!=="string"||
       !Number.isSafeInteger(a.allocationPct)||a.allocationPct<1||a.allocationPct>100||
       !(a.resourceId===null&&a.resourceLabel===null||
         typeof a.resourceId==="string"&&a.resourceId.length>0&&
         typeof a.resourceLabel==="string"&&a.resourceLabel.trim().length>0&&a.resourceLabel.length<=160))
     throw Error("Invalid plan baseline assignment");
   }
   if(w.durationUnit==="working_days")calendarBasis(w.calendarBasis);
   else if(w.calendarBasis!==null)throw Error("Invalid plan baseline calendar basis");
   workIds.add(w.id);
  }
  for(const w of b.work)
   if(w.predecessors.some(id=>!workIds.has(id)||id===w.id))
    throw Error("Invalid plan baseline dependencies");
 }
 return count;
}

export const empty=()=>({schema:SCHEMA,revision:0,projects:[]});
export function validate(s){
 if(s?.schema!==SCHEMA||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.projects))throw Error("Invalid Atlas snapshot");
 checkCalendarLibrary(s);
 const resources=s.resources??[];
 if(!Array.isArray(resources)||resources.length>2000)throw Error("Invalid planning resources");
 const resourceIds=new Set(),resourceLabels=new Set();
 for(const resource of resources){
  if(!resource||typeof resource.id!=="string"||!resource.id||resourceIds.has(resource.id)||
   typeof resource.label!=="string"||!resource.label.trim()||resource.label.length>160||
   !Number.isSafeInteger(resource.capacityPct)||resource.capacityPct<1||resource.capacityPct>1000||
   !validDate(resource.availableFrom)||!validDate(resource.availableUntil)||
   resource.availableFrom&&resource.availableUntil&&resource.availableFrom>resource.availableUntil)
   throw Error("Invalid planning resource");
  const normalized=resource.label.trim().replace(/\s+/g," ").toLocaleLowerCase("ru-RU");
  if(resourceLabels.has(normalized))throw Error("Duplicate planning resource name");
  resourceLabels.add(normalized);resourceIds.add(resource.id);
 }
 const validAllocation = value=>value===undefined||Number.isSafeInteger(value)&&value>=1&&value<=100;
 const validResource = value=>value==null||resourceIds.has(value);
 const ids=new Set();
 let baselineRows=0;
 for(const p of s.projects){
  if(!p||typeof p.id!=="string"||!p.id||ids.has(p.id)||!types.has(p.type)||!statuses.has(p.status)||
     typeof p.name!=="string"||!p.name.trim()||
     (p.goal!==undefined&&typeof p.goal!=="string")||
     (p.owner!==undefined&&typeof p.owner!=="string")||
     (p.description!==undefined&&typeof p.description!=="string"))
   throw Error("Invalid project");
  ids.add(p.id);
  for(const k of ["stages","items","dependencies","sources","risks","decisions"])if(!Array.isArray(p[k]))throw Error("Invalid "+k);
  if(!validDate(p.startDate)||!validDate(p.dueDate)||p.startDate&&p.dueDate&&p.startDate>p.dueDate)throw Error("Invalid project dates");
  checkCalendarDrafts(p);
  baselineRows+=checkPlanBaselines(p);
  if(baselineRows>250000)throw Error("Portfolio plan baseline row limit: 250000");
  for(const stage of p.stages)if(!stage||typeof stage.id!=="string"||!stage.id||
   typeof stage.name!=="string"||!stage.name.trim()||!statuses.has(stage.status)||!validDate(stage.dueDate))throw Error("Invalid stage");
  for(const risk of p.risks)if(!risk||typeof risk.id!=="string"||!risk.id||
   typeof risk.title!=="string"||!risk.title.trim()||!["open","closed"].includes(risk.status))throw Error("Invalid risk");
  const itemIds=new Set(p.items.map(x=>x.id)),stageIds=new Set(p.stages.map(x=>x.id)),sourceIds=new Set(p.sources.map(x=>x.id)),targetIds=new Set((p.targets||[]).map(x=>x.id)),changeIds=new Set((p.changes||[]).map(x=>x.id));
  if(itemIds.size!==p.items.length||stageIds.size!==p.stages.length||sourceIds.size!==p.sources.length)throw Error("Duplicate ID");
  for(const x of p.items){if(!x||typeof x.id!=="string"||!x.id||typeof x.title!=="string"||!x.title.trim()||
    !workStates.has(x.state)||!priorities.has(x.priority)||x.stageId&&!stageIds.has(x.stageId)||x.sourceId&&!sourceIds.has(x.sourceId))throw Error("Invalid work item");if(x.estimateDays!==undefined&&(!Number.isSafeInteger(x.estimateDays)||x.estimateDays<0||x.estimateDays>36500))throw Error("Invalid work estimateDays");
   const unit=x.durationUnit??"elapsed_days";
   if(!durationUnits.has(unit))throw Error("Invalid work duration unit");
   if(unit==="working_days"){
    const basis=calendarBasis(x.calendarBasis);
    if(!p.startDate)throw Error("Для рабочих дней установите дату начала проекта");
    if(!(s.calendarLibrary??[]).some(d=>d.id===basis.id&&d.version===basis.version))
     throw Error("Указанная редакция рабочего календаря недоступна");
   }else if(x.calendarBasis!==undefined&&x.calendarBasis!==null)
    throw Error("Calendar source is allowed only for working-day work");
   if(!validDate(x.actualStartDate)||!validDate(x.actualFinishDate)||
    x.actualStartDate&&x.actualFinishDate&&x.actualStartDate>x.actualFinishDate)
    throw Error("Invalid work actual dates");
   if(!validDate(x.dueDate))throw Error("Invalid work dueDate");if(!validResource(x.resourceId)||!validAllocation(x.allocationPct))throw Error("Invalid work resource commitment");if(x.targetIds!==undefined&&(!Array.isArray(x.targetIds)||new Set(x.targetIds).size!==x.targetIds.length||x.targetIds.some(id=>!targetIds.has(id))))throw Error("Invalid work targetIds");if(x.changeId!=null&&!changeIds.has(x.changeId))throw Error("Invalid work changeId");
   if(x.sourcePath!==undefined||x.sourceRevision!==undefined){
    if(!x.sourceId||!validSourcePath(x.sourcePath)||
      typeof x.sourceRevision!=="string"||!/^[a-f0-9]{40}$/i.test(x.sourceRevision))
     throw Error("Invalid work source location");
   }
  }
  for(const x of p.sources)if(!kinds.has(x.kind)||!x.locator||
   (x.branch!==undefined&&(x.kind!=="github"||typeof x.branch!=="string"||
    !x.branch.trim()||x.branch.length>200)))throw Error("Invalid source");
  for(const k of ["targets","findings","changes"])if(p[k]!==undefined&&!Array.isArray(p[k]))throw Error("Invalid "+k);
  const targets=p.targets||[],findings=p.findings||[],changes=p.changes||[];
  const findingIds=new Set(findings.map(x=>x.id));
  if(targetIds.size!==targets.length||findingIds.size!==findings.length||changeIds.size!==changes.length)throw Error("Duplicate trace record");
  for(const t of targets)if(typeof t.title!=="string"||!t.title||typeof t.desired!=="string"||!t.desired||!["committed","candidate"].includes(t.intent))throw Error("Invalid target record");
  for(const [position,e] of findings.entries()){
   if(!targetIds.has(e.targetId)||!["present","partial","absent"].includes(e.result)||!["implementation","test","acceptance"].includes(e.level)||e.sourceId&&!sourceIds.has(e.sourceId)||!Number.isFinite(Date.parse(e.observedAt||"")))throw Error("Invalid finding record");
   // Legacy archives have no workId; explicit links must name a local work.
   if(e.workId!=null&&(typeof e.workId!=="string"||!itemIds.has(e.workId)))
    throw Error("Invalid finding workId");
   if(e.reviewOfFindingId!=null){
    const prior=findings.slice(0,position).find(x=>x.id===e.reviewOfFindingId);
    if(!prior||prior.targetId!==e.targetId||prior.sourceId!==e.sourceId||prior.ref!==e.ref||
       !e.revision||e.revision===prior.revision||!String(e.note||"").trim())
     throw Error("Invalid finding revision review");
   }
  }
  for(const c of changes)if(!Array.isArray(c.targetIds)||!c.targetIds.every(id=>targetIds.has(id))||!["proposed","approved","in_progress","implemented","deferred","rejected"].includes(c.status)||typeof c.title!=="string"||!c.title||(c.causeKey!==undefined&&!validCauseKey(p,c.causeKey)))throw Error("Invalid change record");
  for(const c of changes){
   if(c.planAmendments===undefined&&c.planAppliedAt===undefined)continue;
   if(!Array.isArray(c.planAmendments)||c.planAmendments.length>60)throw Error("Invalid plan amendments");
   if(c.planAppliedAt!==undefined&&(!["approved","in_progress","implemented"].includes(c.status)||!Number.isFinite(Date.parse(c.planAppliedAt))||!c.planAmendments.length))
    throw Error("Invalid plan application");
   const amendmentKeys=new Set(),newIds=new Set();
   for(const a of c.planAmendments){
    if(!a||!["dates","work","new_work","dependency"].includes(a.kind))throw Error("Invalid plan amendment");
    const key=planAmendmentKey(a);
    if(amendmentKeys.has(key))throw Error("Duplicate plan amendment");
    amendmentKeys.add(key);
    if(a.kind==="dates"){
     if(!a.before||!a.after||!validDate(a.before.startDate)||!validDate(a.before.dueDate)||
        !validDate(a.after.startDate)||!validDate(a.after.dueDate)||
        a.after.startDate&&a.after.dueDate&&a.after.startDate>a.after.dueDate)throw Error("Invalid amendment dates");
    } else if(a.kind==="work"){
     if(!itemIds.has(a.itemId)||!a.before||!a.after)throw Error("Invalid amendment work");
     for(const v of [a.before,a.after])if(!Number.isSafeInteger(v.estimateDays)||v.estimateDays<0||v.estimateDays>36500||
      typeof v.assignee!=="string"||!validDate(v.dueDate)||!validResource(v.resourceId)||!validAllocation(v.allocationPct))throw Error("Invalid amendment work fields");
    } else if(a.kind==="dependency"){
     if(typeof a.from!=="string"||typeof a.to!=="string"||a.from===a.to||
        !itemIds.has(a.from)||!itemIds.has(a.to)||typeof a.before!=="boolean"||
        typeof a.after!=="boolean"||a.before===a.after)
      throw Error("Invalid amendment dependency");
    } else {
     if(typeof a.id!=="string"||!a.id||newIds.has(a.id)||typeof a.title!=="string"||!a.title.trim()||
       !Number.isSafeInteger(a.estimateDays)||a.estimateDays<0||a.estimateDays>36500||
       typeof a.assignee!=="string"||!validDate(a.dueDate)||!validResource(a.resourceId)||!validAllocation(a.allocationPct)||
       a.stageId&&!stageIds.has(a.stageId)||!Array.isArray(a.targetIds)||a.targetIds.some(id=>!targetIds.has(id)))
      throw Error("Invalid new plan work");
     newIds.add(a.id);
     if(c.planAppliedAt!==undefined&&!itemIds.has(a.id))throw Error("Applied plan work missing");
     if(c.planAppliedAt===undefined&&itemIds.has(a.id))throw Error("Unapplied plan work already exists");
    }
   }
  }
  for(const d of p.decisions)if(d.changeId!=null&&!changeIds.has(d.changeId))throw Error("Invalid decision changeId");

  const edges=new Set(),workEdges=[];
  for(const x of p.dependencies){
   const key=JSON.stringify([x.from,x.to]);
   if(!itemIds.has(x.from)||!itemIds.has(x.to)||edges.has(key)||x.from===x.to)
    throw Error("Invalid dependency");
   edges.add(key);workEdges.push([x.from,x.to]);
  }
  // Use the SAME iterative topological implementation as CPM, not a separate
  // exponential walk over every path for every node during import/save/edit.
  try{toposort.array([...itemIds],workEdges);}
  catch(e){if(e instanceof Error&&e.message.startsWith("Cyclic dependency"))
   throw Error("Dependency cycle");throw e;}
 }
 // Optional plan-review references must remain inside the same Atlas portfolio.
 // Older snapshots have no such records and are unaffected.
 const projectById=new Map(s.projects.map(p=>[p.id,p]));
 for(const project of s.projects){
  for(const decision of project.decisions){
   if(decision.kind!=="plan_review")continue;
   const upstream=projectById.get(decision.upstreamProjectId);
   const finding=upstream?.findings?.find(x=>x.id===decision.reviewOfFindingId);
   if(!finding||!["keep","revise","defer"].includes(decision.outcome)||
      typeof decision.text!=="string"||decision.text.trim().length<8||
      typeof decision.reviewRevision!=="string"||decision.reviewRevision!==finding.revision||
      finding.targetId!==decision.reviewTargetId)
    throw Error("Invalid plan review decision");
  }
  for(const proposal of project.changes||[]){
   if(proposal.planReviewDecisionId==null)continue;
   const linked=project.decisions.find(d=>d.id===proposal.planReviewDecisionId&&d.kind==="plan_review"&&d.outcome==="revise");
   if(!linked)throw Error("Invalid plan review proposal");
  }
 }
 validatePortfolioLinks(s);
 return true;
}
function change(s,fn){validate(s);const next=structuredClone(s);fn(next);next.revision++;validate(next);return next}
function project(s,id){const p=s.projects.find(x=>x.id===id);if(!p)throw Error("Unknown project");return p}
export function removeProject(s,id){return change(s,x=>{
 if(!x.projects.some(p=>p.id===id))throw Error("Unknown project");
 // Retained plan-review decisions and proposals can refer across projects.
 // Reject instead of silently erasing another project's decision history.
 if(x.projects.some(p=>p.id!==id&&(p.decisions||[]).some(d=>
    d.kind==="plan_review"&&d.upstreamProjectId===id)))
   throw Error("Проект упоминается в решениях других проектов. Сначала разрешите связанные решения.");
 x.portfolioLinks=(x.portfolioLinks||[]).filter(l=>l.from!==id&&l.to!==id);
 x.projects=x.projects.filter(p=>p.id!==id);
})}
export function createProject(s,data){
 const name=nonempty(data.name,"Project name");
 if((data.goal!==undefined&&typeof data.goal!=="string")||
    (data.owner!==undefined&&typeof data.owner!=="string"))
   throw Error("Invalid project text fields");
 if(!types.has(data.type||"personal"))throw Error("Invalid project type");
 const id=uid(),now=new Date().toISOString();
 return {id,state:change(s,x=>x.projects.push({id,name,type:data.type||"personal",goal:data.goal??"",owner:data.owner??"",status:"planned",startDate:null,dueDate:null,budget:null,currency:"USD",stages:[],items:[],dependencies:[],risks:[],decisions:[],sources:[],createdAt:now}))};
}
export function editProject(s,id,patch){return change(s,x=>{const p=project(x,id);
 for(const key of ["name","goal","owner","startDate","dueDate","currency"]){if(key in patch)p[key]=patch[key]}
 if("status" in patch){if(!statuses.has(patch.status))throw Error("Invalid project status");p.status=patch.status;}
 if("budget" in patch){const b=patch.budget;if(b!==null&&(!Number.isFinite(Number(b))||Number(b)<0))throw Error("Invalid budget");p.budget=b===null?null:Number(b);}
 if(typeof p.name!=="string"||!p.name.trim())throw Error("Project name required");
 if(p.startDate&&p.dueDate&&p.startDate>p.dueDate)throw Error("Invalid project dates");
})}

/**
 * Save a named, versioned scenario in the same Atlas project draft.
 * Human must explicitly invoke native Save afterward. This function never
 * changes Work durations, portfolio links, an approved plan or T3 evidence.
 */
/**
 * A scenario may refer to a removed Work after an older Atlas 0.8 edits it.
 * Report these historical references, do not discard them during validation.
 * This is a diagnosis, not a second store or an automatic repair.
 */
export function missingCalendarDraftWorkIds(p,id){
 if(!p||!Array.isArray(p.items))throw Error("Invalid project calendar drafts");
 const draft=p.calendarDrafts?.find(d=>d.id===id);
 if(!draft)throw Error("Unknown project calendar draft");
 const known=new Set(p.items.map(w=>w.id));
 return Object.keys(draft.modeByWork).filter(workId=>!known.has(workId)).sort();
}

/** Human-confirmed repair of only unresolved Work references in a draft. */
export function resolveCalendarDraftMissingWorkRefs(s,pid,id){
 const p=project(s,pid);
 const missing=missingCalendarDraftWorkIds(p,id);
 if(!missing.length)return {state:s,removed:[]};
 const state=change(s,x=>{
  const owner=project(x,pid);
  const draft=owner.calendarDrafts.find(d=>d.id===id);
  for(const workId of missing)delete draft.modeByWork[workId];
  draft.version++;
  draft.baseRevision=s.revision;
  draft.updatedAt=new Date().toISOString();
 });
 return {state,removed:missing};
}

export function upsertCalendarDraft(s,pid,input){
 const p=project(s,pid),known=new Set(p.items.map(w=>w.id));
 const existingId=input?.id??null;
 if(existingId!==null&&
   (typeof existingId!=="string"||!p.calendarDrafts?.some(d=>d.id===existingId)))
  throw Error("Unknown project calendar draft");
 if(existingId!==null&&missingCalendarDraftWorkIds(p,existingId).length)
  throw Error("В календарном варианте есть ссылки на удалённые работы. Сначала подтвердите очистку ссылок.");
 const normalized=normalizedCalendarDraft(input,known);
 if(normalized.calendarBasis){
  const basis=workCalendarRevision(s,normalized.calendarBasis.id,normalized.calendarBasis.version);
  if(!basis)throw Error("Calendar source revision unavailable");
  const snapshot=normalizedCalendarRules(normalized);
  for(const key of ["weekdays","excludedDates","additionalWorkingDates"]){
   if(JSON.stringify(snapshot[key])!==JSON.stringify(basis[key]))
    throw Error("Calendar source rules have changed; use an independent scenario");
  }
 }
 const duplicate=(p.calendarDrafts||[]).find(d=>
  d.id!==existingId&&d.name.trim().toLocaleLowerCase("ru-RU")===
  normalized.name.toLocaleLowerCase("ru-RU"));
 if(duplicate)throw Error("Duplicate calendar draft name");
 if(!existingId&&(p.calendarDrafts||[]).length>=12)
  throw Error("Project calendar draft limit: 12");
 const id=existingId||uid(),now=new Date().toISOString();
 const state=change(s,x=>{
  const owner=project(x,pid);
  const drafts=owner.calendarDrafts??[];
  const existing=drafts.find(d=>d.id===id);
  const record={
   ...normalized,id,version:existing?existing.version+1:1,
   baseRevision:s.revision,createdAt:existing?.createdAt??now,updatedAt:now
  };
  if(existing)drafts[drafts.findIndex(d=>d.id===id)]=record;
  else drafts.push(record);
  owner.calendarDrafts=drafts;
 });
 return {id,state};
}
/** Explicitly remove one saved what-if calendar draft, not Work or history. */
export function removeCalendarDraft(s,pid,id){
 if(!project(s,pid).calendarDrafts?.some(d=>d.id===id))
  throw Error("Unknown project calendar draft");
 return change(s,x=>{
  const p=project(x,pid);
  p.calendarDrafts=p.calendarDrafts.filter(d=>d.id!==id);
 });
}


/** New independent LOCAL calendar; not an Admin-approved schedule. */
export function createWorkCalendar(s,input){
 validate(s);
 const name=nonempty(input?.name,"Calendar name");
 if(name.length>120)throw Error("Invalid calendar name");
 const rules=normalizedCalendarRules(input);
 const source=normalizedCalendarSource(input.source);
 const names=new Set(latestWorkCalendars(s).map(d=>d.name.toLocaleLowerCase("ru-RU")));
 if(names.has(name.toLocaleLowerCase("ru-RU")))throw Error("Duplicate calendar library name");
 if(latestWorkCalendars(s).length>=32)throw Error("Calendar library limit: 32");
 const id=uid(),now=new Date().toISOString();
 const state=change(s,x=>{
  x.calendarLibrary??=[];
  x.calendarLibrary.push({id,version:1,name,...rules,source,recordedAt:now});
 });
 return {id,version:1,state};
}
/** Append a new immutable revision. A stale selection cannot silently win. */
export function reviseWorkCalendar(s,id,expectedVersion,input){
 validate(s);
 if(typeof id!=="string"||!id)throw Error("Unknown calendar library item");
 const last=latestWorkCalendars(s).find(d=>d.id===id);
 if(!last)throw Error("Unknown calendar library item");
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion!==last.version)
  throw Error("Stale calendar version");
 if(last.version>=8)throw Error("Calendar revision limit: 8");
 const name=nonempty(input?.name,"Calendar name");
 if(name.length>120)throw Error("Invalid calendar name");
 if(latestWorkCalendars(s).some(d=>d.id!==id&&
  d.name.toLocaleLowerCase("ru-RU")===name.toLocaleLowerCase("ru-RU")))
  throw Error("Duplicate calendar library name");
 const rules=normalizedCalendarRules(input);
 const source=normalizedCalendarSource(input.source);
 const now=new Date().toISOString();
 const state=change(s,x=>x.calendarLibrary.push({
  id,version:last.version+1,name,...rules,source,recordedAt:now
 }));
 return {id,version:last.version+1,state};
}

export function createStage(s,pid,name){const id=uid();return {id,state:change(s,x=>project(x,pid).stages.push({id,name:nonempty(name,"Stage name"),status:"planned",dueDate:null}))}}
export function editStage(s,pid,id,patch){return change(s,x=>{
 const stage=project(x,pid).stages.find(t=>t.id===id);if(!stage)throw Error("Unknown stage");
 if("name" in patch)stage.name=nonempty(patch.name,"Stage name");
 if("status" in patch){if(!statuses.has(patch.status))throw Error("Invalid stage status");stage.status=patch.status;}
 if("dueDate" in patch)stage.dueDate=patch.dueDate||null;
})}
export function removeStage(s,pid,id){return change(s,x=>{
 const p=project(x,pid);if(!p.stages.some(t=>t.id===id))throw Error("Unknown stage");
 if(p.items.some(w=>w.stageId===id)||(p.changes||[]).some(c=>(c.planAmendments||[]).some(a=>a.kind==="new_work"&&a.stageId===id)))
  throw Error("Этап связан с работами. Сначала переназначьте работы.");
 p.stages=p.stages.filter(t=>t.id!==id);
})}
export function createItem(s,pid,data){const id=uid();return{id,state:change(s,x=>{const p=project(x,pid);
 if(data.stageId&&!p.stages.some(st=>st.id===data.stageId))throw Error("Unknown stage");
 p.items.push({id,title:nonempty(data.title,"Work title"),state:"todo",stageId:data.stageId||null,priority:"normal",assignee:String(data.assignee||""),dueDate:data.dueDate||null,resourceId:data.resourceId||null,allocationPct:data.allocationPct??100,executor:null,sourceId:null,estimateDays:1,targetIds:data.targetIds===undefined?[]:Array.isArray(data.targetIds)?[...data.targetIds]:data.targetIds,...(data.changeId?{changeId:String(data.changeId)}:{})});
})}}
export function editItem(s,pid,id,patch){return change(s,x=>{const item=project(x,pid).items.find(t=>t.id===id);if(!item)throw Error("Unknown item");
 if("title" in patch)item.title=nonempty(patch.title,"Work title");
 if("stageId" in patch)item.stageId=patch.stageId||null;
 if("state" in patch){if(!workStates.has(patch.state))throw Error("Invalid work state");item.state=patch.state;}
 if("priority" in patch){if(!priorities.has(patch.priority))throw Error("Invalid priority");item.priority=patch.priority;}
 if("assignee" in patch)item.assignee=String(patch.assignee);
 if("dueDate" in patch)item.dueDate=patch.dueDate||null;
 if("actualStartDate" in patch)item.actualStartDate=patch.actualStartDate||null;
 if("actualFinishDate" in patch)item.actualFinishDate=patch.actualFinishDate||null;
 if("resourceId" in patch)item.resourceId=patch.resourceId||null;
 if("sourceId" in patch){
  const sourceId=patch.sourceId||null;
  if(sourceId&&!project(x,pid).sources.some(source=>source.id===sourceId))
   throw Error("Unknown source for work");
  item.sourceId=sourceId;
  // A removed source must not leave an unusable folder or revision.
  if(!sourceId){delete item.sourcePath;delete item.sourceRevision;}
 }
 if("sourcePath" in patch||"sourceRevision" in patch){
  if(!("sourcePath" in patch&&"sourceRevision" in patch)||
     !item.sourceId||!validSourcePath(patch.sourcePath)||
     typeof patch.sourceRevision!=="string"||!/^[a-f0-9]{40}$/i.test(patch.sourceRevision))
   throw Error("Invalid work source location");
  item.sourcePath=patch.sourcePath;
  item.sourceRevision=patch.sourceRevision.toLowerCase();
 }
 if("allocationPct" in patch)item.allocationPct=patch.allocationPct;
 if("estimateDays" in patch){if(!Number.isSafeInteger(patch.estimateDays)||patch.estimateDays<0||patch.estimateDays>36500)throw Error("Invalid work estimateDays");item.estimateDays=patch.estimateDays;}
 if("durationUnit" in patch){
  if(!durationUnits.has(patch.durationUnit))throw Error("Invalid work duration unit");
  item.durationUnit=patch.durationUnit;
  if(patch.durationUnit==="elapsed_days")delete item.calendarBasis;
 }
 if("calendarBasis" in patch){
  if(patch.calendarBasis===null){delete item.calendarBasis;}
  else item.calendarBasis=calendarBasis(patch.calendarBasis);
 }

 if("targetIds" in patch){if(!Array.isArray(patch.targetIds))throw Error("Invalid work targetIds");item.targetIds=[...patch.targetIds];}
 if("changeId" in patch)item.changeId=patch.changeId||null;
 if("executor" in patch){const e=patch.executor;if(e&&(!["human","external-agent","iwxa-agent"].includes(e.kind)||!e.ref))throw Error("Invalid executor");item.executor=e;}
})}
export function removeItem(s,pid,id){return change(s,x=>{
 const p=project(x,pid);if(!p.items.some(w=>w.id===id))throw Error("Unknown item");
 if(p.dependencies.some(d=>d.from===id||d.to===id))throw Error("Работа связана зависимостями. Сначала удалите связи.");
 if((p.findings||[]).some(f=>f.workId===id))
  throw Error("Работа связана с сохранённым наблюдением. История фактов должна сохранять источник.");
 if((p.changes||[]).some(c=>(c.planAmendments||[]).some(a=>a.kind==="work"&&a.itemId===id||a.kind==="new_work"&&a.id===id||
  a.kind==="dependency"&&(a.from===id||a.to===id))))
  throw Error("Работа связана с предложением изменения.");
 p.items=p.items.filter(w=>w.id!==id);
 // A deliberate work deletion also removes the scenario-only override.
 // Existing project history before this revision retains that work.
 for(const draft of p.calendarDrafts||[]){
  if(Object.hasOwn(draft.modeByWork,id)){
   delete draft.modeByWork[id];
   draft.version++;
   draft.baseRevision=s.revision;
   draft.updatedAt=new Date().toISOString();
  }
 }
})}
export function connect(s,pid,from,to){return change(s,x=>{const p=project(x,pid);if(!p.items.some(t=>t.id===from)||!p.items.some(t=>t.id===to))throw Error("Unknown work item");p.dependencies.push({from,to})})}
export function disconnect(s,pid,from,to){return change(s,x=>{
 const p=project(x,pid);if(!p.dependencies.some(d=>d.from===from&&d.to===to))throw Error("Unknown dependency");
 p.dependencies=p.dependencies.filter(d=>d.from!==from||d.to!==to);
})}
export function createRisk(s,pid,desc){return change(s,x=>project(x,pid).risks.push({id:uid(),title:nonempty(desc,"Risk"),status:"open"}))}
export function editRisk(s,pid,id,patch){return change(s,x=>{
 const risk=project(x,pid).risks.find(t=>t.id===id);if(!risk)throw Error("Unknown risk");
 if("title" in patch)risk.title=nonempty(patch.title,"Risk");
 if("status" in patch){if(!["open","closed"].includes(patch.status))throw Error("Invalid risk status");risk.status=patch.status;}
})}
export function createDecision(s,pid,desc){return change(s,x=>project(x,pid).decisions.push({id:uid(),text:nonempty(desc,"Decision"),at:new Date().toISOString()}))}
export function attach(s,pid,kind,locator,{branch=null}={}){if(!kinds.has(kind))throw Error("Invalid source kind");
 if(branch!==null&&(kind!=="github"||typeof branch!=="string"||!branch.trim()||branch.length>200))
  throw Error("Invalid source branch");
 const id=uid();return{id,state:change(s,x=>project(x,pid).sources.push({id,kind,locator:nonempty(locator,"Source"),
  ...(branch===null?{}:{branch}),status:"never",observedAt:null,summary:null,error:null}))};
}
// A source may track a different GitHub branch without changing its identity.
// Old branch observations must never be presented as evidence for the new branch.
export function setSourceBranch(s,pid,id,branch=null){
 if(branch!==null&&(typeof branch!=="string"||!branch.trim()||branch.length>200))
  throw Error("Invalid source branch");
 const current=project(s,pid).sources.find(v=>v.id===id);
 if(!current||current.kind!=="github")throw Error("Unknown GitHub repository source");
 if((current.branch??null)===branch)return s;
 return change(s,x=>{
  const source=project(x,pid).sources.find(v=>v.id===id);
  if(branch===null)delete source.branch;else source.branch=branch;
  source.status="never";source.observedAt=null;source.summary=null;source.error=null;
 });
}
export function observe(s,pid,id,status,summary=null,error=null){return change(s,x=>{const src=project(x,pid).sources.find(v=>v.id===id);if(!src)throw Error("Unknown source");src.status=status;src.observedAt=new Date().toISOString();if(status==="ok")src.summary=summary;src.error=status==="ok"?null:String(error||"Unavailable");})}
export function summary(p){const total=p.items.length,done=p.items.filter(x=>x.state==="done").length;return {total,done,blocked:p.items.filter(x=>x.state==="blocked").length,progress:total?Math.round(done/total*100):null,sourceCount:p.sources.length,readiness:"not_assessed"}}
export const serialize=s=>(validate(s),JSON.stringify(s,null,2));
export const deserialize=t=>{const s=JSON.parse(t);validate(s);return s};

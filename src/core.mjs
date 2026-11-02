// Atlas v0.1 project domain; never executes agent tasks or writes to external sources.
import {validatePortfolioLinks} from "./portfolio.mjs";
import {validCauseKey} from "./response.mjs";
import toposort from "./vendor/toposort.mjs";
export const SCHEMA="atlas.project/1";
const types=new Set(["personal","team","business","engineering","research","care","other"]);
const statuses=new Set(["planned","active","paused","completed","cancelled"]);
const workStates=new Set(["todo","in_progress","blocked","done"]);
const priorities=new Set(["low","normal","high","critical"]);
const kinds=new Set(["github","github_owner","gitlab","forgejo","gitea","obsidian","anytype","jira","file","other"]);
const uid=()=>crypto.randomUUID();
const nonempty=(x,label)=>{if(typeof x!=="string"||!x.trim())throw Error(label+" required");return x.trim()};
const validDate=value=>{if(value==null||value==="")return true;if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value};
export const empty=()=>({schema:SCHEMA,revision:0,projects:[]});
export function validate(s){
 if(s?.schema!==SCHEMA||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.projects))throw Error("Invalid Atlas snapshot");
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
 for(const p of s.projects){
  if(!p.id||ids.has(p.id)||!types.has(p.type)||!statuses.has(p.status))throw Error("Invalid project");
  ids.add(p.id);
  for(const k of ["stages","items","dependencies","sources","risks","decisions"])if(!Array.isArray(p[k]))throw Error("Invalid "+k);
  if(!validDate(p.startDate)||!validDate(p.dueDate)||p.startDate&&p.dueDate&&p.startDate>p.dueDate)throw Error("Invalid project dates");
  for(const stage of p.stages)if(!validDate(stage.dueDate))throw Error("Invalid stage date");
  const itemIds=new Set(p.items.map(x=>x.id)),stageIds=new Set(p.stages.map(x=>x.id)),sourceIds=new Set(p.sources.map(x=>x.id)),targetIds=new Set((p.targets||[]).map(x=>x.id)),changeIds=new Set((p.changes||[]).map(x=>x.id));
  if(itemIds.size!==p.items.length||stageIds.size!==p.stages.length||sourceIds.size!==p.sources.length)throw Error("Duplicate ID");
  for(const x of p.items){if(!workStates.has(x.state)||!priorities.has(x.priority)||x.stageId&&!stageIds.has(x.stageId)||x.sourceId&&!sourceIds.has(x.sourceId))throw Error("Invalid work item");if(x.estimateDays!==undefined&&(!Number.isSafeInteger(x.estimateDays)||x.estimateDays<0||x.estimateDays>36500))throw Error("Invalid work estimateDays");if(!validDate(x.dueDate))throw Error("Invalid work dueDate");if(!validResource(x.resourceId)||!validAllocation(x.allocationPct))throw Error("Invalid work resource commitment");if(x.targetIds!==undefined&&(!Array.isArray(x.targetIds)||new Set(x.targetIds).size!==x.targetIds.length||x.targetIds.some(id=>!targetIds.has(id))))throw Error("Invalid work targetIds");if(x.changeId!=null&&!changeIds.has(x.changeId))throw Error("Invalid work changeId");}
  for(const x of p.sources)if(!kinds.has(x.kind)||!x.locator)throw Error("Invalid source");
  for(const k of ["targets","findings","changes"])if(p[k]!==undefined&&!Array.isArray(p[k]))throw Error("Invalid "+k);
  const targets=p.targets||[],findings=p.findings||[],changes=p.changes||[];
  const findingIds=new Set(findings.map(x=>x.id));
  if(targetIds.size!==targets.length||findingIds.size!==findings.length||changeIds.size!==changes.length)throw Error("Duplicate trace record");
  for(const t of targets)if(typeof t.title!=="string"||!t.title||typeof t.desired!=="string"||!t.desired||!["committed","candidate"].includes(t.intent))throw Error("Invalid target record");
  for(const [position,e] of findings.entries()){
   if(!targetIds.has(e.targetId)||!["present","partial","absent"].includes(e.result)||!["implementation","test","acceptance"].includes(e.level)||e.sourceId&&!sourceIds.has(e.sourceId)||!Number.isFinite(Date.parse(e.observedAt||"")))throw Error("Invalid finding record");
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
    if(!a||!["dates","work","new_work"].includes(a.kind))throw Error("Invalid plan amendment");
    const key=a.kind==="dates"?"dates":a.kind==="work"?"work:"+a.itemId:"new_work:"+a.id;
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
export function createProject(s,data){
 const name=nonempty(data.name,"Project name");
 if(!types.has(data.type||"personal"))throw Error("Invalid project type");
 const id=uid(),now=new Date().toISOString();
 return {id,state:change(s,x=>x.projects.push({id,name,type:data.type||"personal",goal:String(data.goal||""),owner:String(data.owner||""),status:"planned",startDate:null,dueDate:null,budget:null,currency:"USD",stages:[],items:[],dependencies:[],risks:[],decisions:[],sources:[],createdAt:now}))};
}
export function editProject(s,id,patch){return change(s,x=>{const p=project(x,id);
 for(const key of ["name","goal","owner","startDate","dueDate","currency"]){if(key in patch)p[key]=patch[key]}
 if("status" in patch){if(!statuses.has(patch.status))throw Error("Invalid project status");p.status=patch.status;}
 if("budget" in patch){const b=patch.budget;if(b!==null&&(!Number.isFinite(Number(b))||Number(b)<0))throw Error("Invalid budget");p.budget=b===null?null:Number(b);}
 if(!p.name?.trim())throw Error("Project name required");
 if(p.startDate&&p.dueDate&&p.startDate>p.dueDate)throw Error("Invalid project dates");
})}
export function createStage(s,pid,name){const id=uid();return {id,state:change(s,x=>project(x,pid).stages.push({id,name:nonempty(name,"Stage name"),status:"planned",dueDate:null}))}}
export function createItem(s,pid,data){const id=uid();return{id,state:change(s,x=>{const p=project(x,pid);
 if(data.stageId&&!p.stages.some(st=>st.id===data.stageId))throw Error("Unknown stage");
 p.items.push({id,title:nonempty(data.title,"Work title"),state:"todo",stageId:data.stageId||null,priority:"normal",assignee:String(data.assignee||""),dueDate:data.dueDate||null,resourceId:data.resourceId||null,allocationPct:data.allocationPct??100,executor:null,sourceId:null,estimateDays:1,targetIds:data.targetIds===undefined?[]:Array.isArray(data.targetIds)?[...data.targetIds]:data.targetIds,...(data.changeId?{changeId:String(data.changeId)}:{})});
})}}
export function editItem(s,pid,id,patch){return change(s,x=>{const item=project(x,pid).items.find(t=>t.id===id);if(!item)throw Error("Unknown item");
 if("state" in patch){if(!workStates.has(patch.state))throw Error("Invalid work state");item.state=patch.state;}
 if("priority" in patch){if(!priorities.has(patch.priority))throw Error("Invalid priority");item.priority=patch.priority;}
 if("assignee" in patch)item.assignee=String(patch.assignee);
 if("dueDate" in patch)item.dueDate=patch.dueDate||null;
 if("resourceId" in patch)item.resourceId=patch.resourceId||null;
 if("allocationPct" in patch)item.allocationPct=patch.allocationPct;
 if("estimateDays" in patch){if(!Number.isSafeInteger(patch.estimateDays)||patch.estimateDays<0||patch.estimateDays>36500)throw Error("Invalid work estimateDays");item.estimateDays=patch.estimateDays;}
 if("targetIds" in patch){if(!Array.isArray(patch.targetIds))throw Error("Invalid work targetIds");item.targetIds=[...patch.targetIds];}
 if("changeId" in patch)item.changeId=patch.changeId||null;
 if("executor" in patch){const e=patch.executor;if(e&&(!["human","external-agent","iwxa-agent"].includes(e.kind)||!e.ref))throw Error("Invalid executor");item.executor=e;}
})}
export function connect(s,pid,from,to){return change(s,x=>{const p=project(x,pid);if(!p.items.some(t=>t.id===from)||!p.items.some(t=>t.id===to))throw Error("Unknown work item");p.dependencies.push({from,to})})}
export function createRisk(s,pid,desc){return change(s,x=>project(x,pid).risks.push({id:uid(),title:nonempty(desc,"Risk"),status:"open"}))}
export function createDecision(s,pid,desc){return change(s,x=>project(x,pid).decisions.push({id:uid(),text:nonempty(desc,"Decision"),at:new Date().toISOString()}))}
export function attach(s,pid,kind,locator){if(!kinds.has(kind))throw Error("Invalid source kind");
 const id=uid();return{id,state:change(s,x=>project(x,pid).sources.push({id,kind,locator:nonempty(locator,"Source"),status:"never",observedAt:null,summary:null,error:null}))};
}
export function observe(s,pid,id,status,summary=null,error=null){return change(s,x=>{const src=project(x,pid).sources.find(v=>v.id===id);if(!src)throw Error("Unknown source");src.status=status;src.observedAt=new Date().toISOString();if(status==="ok")src.summary=summary;src.error=status==="ok"?null:String(error||"Unavailable");})}
export function summary(p){const total=p.items.length,done=p.items.filter(x=>x.state==="done").length;return {total,done,blocked:p.items.filter(x=>x.state==="blocked").length,progress:total?Math.round(done/total*100):null,sourceCount:p.sources.length,readiness:"not_assessed"}}
export const serialize=s=>(validate(s),JSON.stringify(s,null,2));
export const deserialize=t=>{const s=JSON.parse(t);validate(s);return s};

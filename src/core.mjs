// Atlas v0.1 project domain; never executes agent tasks or writes to external sources.
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
 const ids=new Set();
 for(const p of s.projects){
  if(!p.id||ids.has(p.id)||!types.has(p.type)||!statuses.has(p.status))throw Error("Invalid project");
  ids.add(p.id);
  for(const k of ["stages","items","dependencies","sources","risks","decisions"])if(!Array.isArray(p[k]))throw Error("Invalid "+k);
  if(!validDate(p.startDate)||!validDate(p.dueDate)||p.startDate&&p.dueDate&&p.startDate>p.dueDate)throw Error("Invalid project dates");
  for(const stage of p.stages)if(!validDate(stage.dueDate))throw Error("Invalid stage date");
  const itemIds=new Set(p.items.map(x=>x.id)),stageIds=new Set(p.stages.map(x=>x.id)),sourceIds=new Set(p.sources.map(x=>x.id)),targetIds=new Set((p.targets||[]).map(x=>x.id));
  if(itemIds.size!==p.items.length||stageIds.size!==p.stages.length||sourceIds.size!==p.sources.length)throw Error("Duplicate ID");
  for(const x of p.items){if(!workStates.has(x.state)||!priorities.has(x.priority)||x.stageId&&!stageIds.has(x.stageId)||x.sourceId&&!sourceIds.has(x.sourceId))throw Error("Invalid work item");if(x.estimateDays!==undefined&&(!Number.isSafeInteger(x.estimateDays)||x.estimateDays<0||x.estimateDays>36500))throw Error("Invalid work estimateDays");if(x.targetIds!==undefined&&(!Array.isArray(x.targetIds)||new Set(x.targetIds).size!==x.targetIds.length||x.targetIds.some(id=>!targetIds.has(id))))throw Error("Invalid work targetIds");}
  for(const x of p.sources)if(!kinds.has(x.kind)||!x.locator)throw Error("Invalid source");
  for(const k of ["targets","findings","changes"])if(p[k]!==undefined&&!Array.isArray(p[k]))throw Error("Invalid "+k);
  const targets=p.targets||[],findings=p.findings||[],changes=p.changes||[];
  const findingIds=new Set(findings.map(x=>x.id)),changeIds=new Set(changes.map(x=>x.id));
  if(targetIds.size!==targets.length||findingIds.size!==findings.length||changeIds.size!==changes.length)throw Error("Duplicate trace record");
  for(const t of targets)if(typeof t.title!=="string"||!t.title||typeof t.desired!=="string"||!t.desired||!["committed","candidate"].includes(t.intent))throw Error("Invalid target record");
  for(const e of findings)if(!targetIds.has(e.targetId)||!["present","partial","absent"].includes(e.result)||!["implementation","test","acceptance"].includes(e.level)||e.sourceId&&!sourceIds.has(e.sourceId)||!Number.isFinite(Date.parse(e.observedAt||"")))throw Error("Invalid finding record");
  for(const c of changes)if(!Array.isArray(c.targetIds)||!c.targetIds.every(id=>targetIds.has(id))||!["proposed","approved","in_progress","implemented","deferred","rejected"].includes(c.status)||typeof c.title!=="string"||!c.title)throw Error("Invalid change record");

  const edges=new Set();
  for(const x of p.dependencies){const key=x.from+"|"+x.to;if(!itemIds.has(x.from)||!itemIds.has(x.to)||edges.has(key)||x.from===x.to)throw Error("Invalid dependency");edges.add(key);}
  const walk=(id,seen)=>{if(seen.has(id))throw Error("Dependency cycle");seen.add(id);for(const e of p.dependencies)if(e.from===id)walk(e.to,new Set(seen));};
  for(const id of itemIds)walk(id,new Set());
 }
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
 p.items.push({id,title:nonempty(data.title,"Work title"),state:"todo",stageId:data.stageId||null,priority:"normal",assignee:String(data.assignee||""),dueDate:data.dueDate||null,executor:null,sourceId:null,estimateDays:1,targetIds:data.targetIds===undefined?[]:Array.isArray(data.targetIds)?[...data.targetIds]:data.targetIds});
})}}
export function editItem(s,pid,id,patch){return change(s,x=>{const item=project(x,pid).items.find(t=>t.id===id);if(!item)throw Error("Unknown item");
 if("state" in patch){if(!workStates.has(patch.state))throw Error("Invalid work state");item.state=patch.state;}
 if("priority" in patch){if(!priorities.has(patch.priority))throw Error("Invalid priority");item.priority=patch.priority;}
 if("assignee" in patch)item.assignee=String(patch.assignee);
 if("estimateDays" in patch){if(!Number.isSafeInteger(patch.estimateDays)||patch.estimateDays<0||patch.estimateDays>36500)throw Error("Invalid work estimateDays");item.estimateDays=patch.estimateDays;}
 if("targetIds" in patch){if(!Array.isArray(patch.targetIds))throw Error("Invalid work targetIds");item.targetIds=[...patch.targetIds];}
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

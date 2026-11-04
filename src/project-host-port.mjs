// Bounded, host-neutral views over Atlas's existing project model and store.
// No Task Engine, sync registry, authority evaluator or second persistence.
import {validate,SCHEMA} from "./core.mjs";

const failure=code=>{throw Object.assign(new Error(code),{code})};
const stringId=(value,name)=>{if(typeof value!=="string"||!value.trim()||value.length>256)failure("ATLAS_"+name+"_INVALID");return value};
const normalizeRef=(ref,work=false)=>{
 if(!ref||typeof ref!=="object")failure("ATLAS_REF_INVALID");
 const projectId=stringId(ref.projectId,"PROJECT_ID");
 const revision=String(ref.revision);
 if(!/^(0|[1-9][0-9]*)$/.test(revision)||!Number.isSafeInteger(Number(revision)))failure("ATLAS_REVISION_INVALID");
 return work?{projectId,workId:stringId(ref.workId,"WORK_ID"),revision}:{projectId,revision};
};
const openCurrent=async openSnapshot=>{
 const snapshot=await openSnapshot();
 validate(snapshot);
 return snapshot;
};
const projectFrom=(snapshot,id)=>{
 const p=snapshot.projects.find(item=>item.id===id);
 if(!p)failure("ATLAS_PROJECT_NOT_FOUND");
 return p;
};
const assertRevision=(snapshot,ref)=>{
 if(String(snapshot.revision)!==ref.revision)failure("ATLAS_SOURCE_REVISION_CHANGED");
};
const permitted=async (authorize,ctx)=>{
 if(await authorize(ctx)!==true)failure("ATLAS_HOST_AUTHORIZATION_DENIED");
};
// Authorization is always delegated to the actual host. It is not a grant.
export function createAtlasProjectReadPort({openSnapshot,authorize}={}){
 if(typeof openSnapshot!=="function"||typeof authorize!=="function")failure("ATLAS_HOST_BOUNDARY_REQUIRED");
 const current=()=>openCurrent(openSnapshot);
 return Object.freeze({
  schema:SCHEMA,
  async project(ref,context){
   const r=normalizeRef(ref);
   await permitted(authorize,{context,kind:"project",ref:r});
   const snapshot=await current();assertRevision(snapshot,r);
   const p=projectFrom(snapshot,r.projectId);
   return Object.freeze({ref:r,name:p.name,status:p.status,goal:p.goal??"",owner:p.owner??"",dueDate:p.dueDate??null,
    workCount:p.items.length,blockedCount:p.items.filter(i=>i.state==="blocked").length});
  },
  async work(ref,context){
   const r=normalizeRef(ref,true);
   await permitted(authorize,{context,kind:"work",ref:r});
   const snapshot=await current();assertRevision(snapshot,r);
   const p=projectFrom(snapshot,r.projectId);
   const item=p.items.find(i=>i.id===r.workId);
   if(!item)failure("ATLAS_WORK_NOT_FOUND");
   return Object.freeze({ref:r,title:item.title,state:item.state,priority:item.priority,
    dueDate:item.dueDate??null,estimateDays:item.estimateDays??null,
    dependencies:p.dependencies.filter(d=>d.from===item.id||d.to===item.id).map(d=>({from:d.from,to:d.to}))});
  }
 });
}
// Center remains the owner of organization/T3 issuance and org decisions.
export function createAtlasCenterHostAdapter(port){
 if(!port||typeof port.project!=="function"||typeof port.work!=="function")failure("ATLAS_PROJECT_PORT_REQUIRED");
 return Object.freeze({
  async previewAssignment(workRef,organizationContext){
   if(!organizationContext||typeof organizationContext.organizationId!=="string"||!organizationContext.organizationId.trim())
    failure("ATLAS_ORGANIZATION_CONTEXT_REQUIRED");
   return port.work(workRef,organizationContext);
  }
 });
}
// Agent 0.3 owns Task/Goal/Result; Atlas only supplies a selected WorkRef.
export function createAtlasAgent03HostAdapter(port){
 if(!port||typeof port.work!=="function")failure("ATLAS_PROJECT_PORT_REQUIRED");
 return Object.freeze({
  async selectedWork(workRef,personalContext){
   if(!personalContext||typeof personalContext.workspaceId!=="string"||!personalContext.workspaceId.trim())
    failure("ATLAS_WORKSPACE_CONTEXT_REQUIRED");
   return port.work(workRef,personalContext);
  }
 });
}

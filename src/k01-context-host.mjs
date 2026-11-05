// Atlas 0.3 read-only consumer of the separately versioned K01 module.
// The application owns authorization, native readback, project identity and sources.
// K01 owns selection, evidence tracing and revalidation; neither module writes here.
import {validate} from "./core.mjs";

const fail=code=>{throw Object.assign(new Error(code),{code})};
const id=value=>typeof value==="string"&&value.length>0&&value.length<=256&&value.trim()===value;
const numericRevision=value=>typeof value==="string"&&/^(0|[1-9][0-9]*)$/.test(value)&&
  Number.isSafeInteger(Number(value));

export function createAtlasK01ContextHost({
  k01,openSavedSnapshot,authorize,observationPort
}={}){
 if(!k01||typeof k01.selectContext!=="function"||
    typeof k01.revalidateProjection!=="function"||
    typeof k01.atlasProjectSourceRef!=="function"||
    typeof openSavedSnapshot!=="function"||
    typeof authorize!=="function"||typeof observationPort!=="function")
   fail("ATLAS_K01_BOUNDARY_REQUIRED");
 async function read(ref,context){
  if(!ref||!id(ref.projectId)||!id(ref.sourceId)||!numericRevision(ref.revision))
   fail("ATLAS_K01_REF_INVALID");
  if(await authorize({kind:"context",ref,context})!==true)
   fail("ATLAS_HOST_AUTHORIZATION_DENIED");
  // Must use the saved and reread head supplied by the existing native Atlas store.
  const snapshot=await openSavedSnapshot();
  validate(snapshot);
  if(String(snapshot.revision)!==ref.revision)
   fail("ATLAS_SOURCE_REVISION_CHANGED");
  const project=snapshot.projects.find(p=>p.id===ref.projectId);
  if(!project)fail("ATLAS_PROJECT_NOT_FOUND");
  const source=project.sources.find(s=>s.id===ref.sourceId);
  if(!source||source.kind!=="github"||source.status!=="ok"||
    source.summary?.complete!==true||source.summary?.scope!=="repository")
   fail("ATLAS_K01_SOURCE_UNAVAILABLE");
  return {snapshot,project,source,sourceRef:k01.atlasProjectSourceRef(ref.projectId,ref.sourceId)};
 }
 function requestFor(request,ref,sourceRef){
  if(!request||!id(request.taskId)||!Array.isArray(request.terms)||
      !Number.isSafeInteger(request.maxTokens)||request.maxTokens<0)
    fail("ATLAS_K01_TASK_INVALID");
  if(request.allowedSources!==undefined &&
      (request.allowedSources.length!==1 || request.allowedSources[0]!==sourceRef))
    fail("ATLAS_K01_SOURCE_SCOPE_INVALID");
  if(request.scopeRevision!==undefined&&String(request.scopeRevision)!==ref.revision)
    fail("ATLAS_SOURCE_REVISION_CHANGED");
  return {taskId:request.taskId,terms:request.terms,
    allowedSources:[sourceRef],maxTokens:request.maxTokens,
    profile:request.profile,allowInferred:request.allowInferred===true,
    scopeRevision:Number(ref.revision)};
 }
 async function checkedPort(ref,context){
  const current=await read(ref,context);
  const port=await observationPort({snapshot:current.snapshot,
    projectId:ref.projectId,sourceId:ref.sourceId,
    source:current.source,sourceRef:current.sourceRef});
  if(!port||typeof port.query!=="function"||typeof port.observe!=="function")
    fail("ATLAS_K01_SOURCE_PORT_INVALID");
  return {...current,port};
 }
 return Object.freeze({
  async select(ref,context,request){
   const selected=await checkedPort(ref,context);
   const prepared=requestFor(request,ref,selected.sourceRef);
   const projection=await k01.selectContext(prepared,selected.port);
   // Reject an outdated or revoked project after any external source reads.
   await read(ref,context);
   return projection;
  },
  async revalidate(ref,context,request,projection){
   const selected=await checkedPort(ref,context);
   const prepared=requestFor(request,ref,selected.sourceRef);
   const result=await k01.revalidateProjection(projection,selected.port,
     {...prepared,requireRequestMatch:true});
   await read(ref,context);
   return result;
  }
 });
}

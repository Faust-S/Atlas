import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,attach,observe,editProject,serialize,deserialize} from "../src/core.mjs";
import {createAtlasK01ContextHost} from "../src/k01-context-host.mjs";

function fixture(){
 const p=createProject(empty(),{name:"K01 consumer",type:"research"});
 const a=attach(p.state,p.id,"github","Faust-S/knowledge");
 let stored=serialize(observe(a.state,p.id,a.id,"ok",
   {scope:"repository",repository:"Faust-S/knowledge",complete:true,
    branchHeads:{main:"a".repeat(40)},branches:["main"]}));
 const ref=()=>({projectId:p.id,sourceId:a.id,
   revision:String(deserialize(stored).revision)});
 const scope=()=>`atlas-project:${p.id}:${a.id}`;
 let reads=0,selections=0,validations=0;
 const k01={
  atlasProjectSourceRef:(projectId,sourceId)=>`atlas-project:${projectId}:${sourceId}`,
  selectContext:async (request,port)=>{selections++;return {request,port:!!port}},
  revalidateProjection:async (projection,port,request)=>{
    validations++;return {allCurrent:projection.request.scopeRevision===request.scopeRevision,port:!!port};
  }
 };
 const make=(authorize=async()=>true,behavior={})=>createAtlasK01ContextHost({
   k01,authorize,
   openSavedSnapshot:async()=>{reads++;return deserialize(stored)},
   observationPort:async()=>({query:async()=>[],observe:async()=>({})}),
   ...behavior
 });
 const request=()=>({taskId:"task:readback",terms:["task"],maxTokens:100});
 return {p,a,ref,scope,make,request,k01,edit:()=>{
   stored=serialize(editProject(deserialize(stored),p.id,{goal:"Updated goal"}));
 },get reads(){return reads},get selections(){return selections},get validations(){return validations}};
}
test("Atlas K01 consumer reuses native ProjectRef and canonical project revision",async()=>{
 const f=fixture(),port=f.make(),ref=f.ref();
 const result=await port.select(ref,{workspaceId:"w"},f.request());
 assert.equal(result.request.scopeRevision,Number(ref.revision));
 assert.deepEqual(result.request.allowedSources,[f.scope()]);
 assert.equal(f.selections,1);
 assert.equal((await port.revalidate(ref,{workspaceId:"w"},f.request(),result)).allCurrent,true);
 assert.equal(f.validations,1);
});
test("stale Atlas project revision is rejected before calling K01",async()=>{
 const f=fixture(),port=f.make(),ref=f.ref();
 const first=await port.select(ref,null,f.request());
 f.edit();
 await assert.rejects(port.revalidate(ref,null,f.request(),first),/ATLAS_SOURCE_REVISION_CHANGED/);
 assert.equal(f.validations,0);
});
test("denied authorization is fail-closed before native snapshot and source queries",async()=>{
 const f=fixture(),port=f.make(async()=>false);
 await assert.rejects(port.select(f.ref(),null,f.request()),/ATLAS_HOST_AUTHORIZATION_DENIED/);
 assert.equal(f.reads,0);assert.equal(f.selections,0);
});
test("no ProjectRef, unknown source, wrong task scope and missing port fail closed",async()=>{
 const f=fixture(),port=f.make();
 await assert.rejects(port.select({projectId:f.p.id,sourceId:"",revision:"1"},null,f.request()),/ATLAS_K01_REF_INVALID/);
 await assert.rejects(port.select(f.ref(),null,{...f.request(),allowedSources:["doc:unattached"]}),/ATLAS_K01_SOURCE_SCOPE_INVALID/);
 await assert.rejects(port.select(f.ref(),null,{...f.request(),scopeRevision:-1}),/ATLAS_SOURCE_REVISION_CHANGED/);
 const invalid=f.make(async()=>true,{observationPort:async()=>({})});
 await assert.rejects(invalid.select(f.ref(),null,f.request()),/ATLAS_K01_SOURCE_PORT_INVALID/);
});
test("mutating native snapshot during selection rejects result after selection",async()=>{
 const f=fixture(),ref=f.ref();
 const k01={...f.k01,selectContext:async()=>{f.edit();return {selected:[{excerpt:"Private: synthetic"}]}}};
 const host=f.make(async()=>true,{k01});
 await assert.rejects(host.select(ref,null,f.request()),/ATLAS_SOURCE_REVISION_CHANGED/);
});
test("no host store is introduced; independent context is never added to Atlas snapshot",async()=>{
 const f=fixture(),host=f.make();
 const before=f.ref();
 const result=await host.select(before,null,f.request());
 assert.ok(result.request);
 assert.equal(f.ref().revision,before.revision);
 assert.equal(f.scope(),result.request.allowedSources[0]);
});

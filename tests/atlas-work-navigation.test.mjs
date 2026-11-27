import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editItem,serialize} from "../src/core.mjs";
import {createAtlasSavedRef,resolveAtlasWorkNavigation} from "../src/project-host-port.mjs";
test("saved WorkRef navigates to exact selected work without changing its portfolio",()=>{
 const p=createProject(empty(),{name:"Assembly"});
 const a=createItem(p.state,p.id,{title:"Same title"});
 const b=createItem(a.state,p.id,{title:"Same title"});
 const ref=createAtlasSavedRef(b.state,{projectId:p.id,workId:b.id},{persisted:true,dirty:false});
 const before=serialize(b.state);
 assert.deepEqual(resolveAtlasWorkNavigation(b.state,JSON.stringify(ref)),{
  ref,projectName:"Assembly",workTitle:"Same title"
 });
 assert.equal(resolveAtlasWorkNavigation(b.state,ref).ref.workId,b.id);
 assert.equal(serialize(b.state),before);
 assert.throws(()=>resolveAtlasWorkNavigation(editItem(b.state,p.id,b.id,{state:"done"}),ref),/ATLAS_SOURCE_REVISION_CHANGED/);
 assert.throws(()=>resolveAtlasWorkNavigation(b.state,{...ref,workId:"missing"}),/ATLAS_WORK_NOT_FOUND/);
 for(const bad of [{...ref,revision:Number(ref.revision)},{...ref,grant:true},[ref],"{broken"])
  assert.throws(()=>resolveAtlasWorkNavigation(b.state,bad),/ATLAS_WORK_REFERENCE_INVALID/);
});

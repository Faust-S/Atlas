import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,createItem,editProject,serialize,deserialize} from "../src/core.mjs";
import {createAtlasProjectReadPort,createAtlasCenterHostAdapter,createAtlasAgent03HostAdapter} from "../src/project-host-port.mjs";

const fixture=()=>{
 const first=createProject(empty(),{name:"Project Alpha",type:"engineering"});
 const projectId=first.id;
 const work=createItem(first.state,projectId,{title:"Deliver work",priority:"high"});
 return {state:work.state,projectId,workId:work.id};
};
test("host-neutral project and work refs preserve canonical data, no separate store",async()=>{
 const f=fixture();
 const before=serialize(f.state);
 let reads=0;
 const port=createAtlasProjectReadPort({openSnapshot:async()=>{reads++;return f.state},authorize:async()=>true});
 const project=await port.project({projectId:f.projectId,revision:String(f.state.revision)},{workspaceId:"w"});
 const work=await port.work({projectId:f.projectId,workId:f.workId,revision:String(f.state.revision)},{workspaceId:"w"});
 assert.equal(project.ref.projectId,f.projectId);
 assert.equal(project.workCount,1);
 assert.equal(work.title,"Deliver work");
 assert.equal(reads,2);
 assert.equal(serialize(f.state),before);
 assert.equal(deserialize(before).revision,f.state.revision);
 assert.ok(!("snapshot" in project)&&!("snapshot" in work));
});
test("Center adapter needs host organization context, Agent needs workspace context",async()=>{
 const f=fixture(),ref={projectId:f.projectId,workId:f.workId,revision:String(f.state.revision)};
 const port=createAtlasProjectReadPort({openSnapshot:()=>f.state,authorize:({context})=>Boolean(context?.organizationId||context?.workspaceId)});
 const center=createAtlasCenterHostAdapter(port),agent=createAtlasAgent03HostAdapter(port);
 assert.equal((await center.previewAssignment(ref,{organizationId:"org-a"})).ref.workId,f.workId);
 assert.equal((await agent.selectedWork(ref,{workspaceId:"personal-a"})).ref.workId,f.workId);
 await assert.rejects(center.previewAssignment(ref,{}),/ATLAS_ORGANIZATION_CONTEXT_REQUIRED/);
 await assert.rejects(agent.selectedWork(ref,{}),/ATLAS_WORKSPACE_CONTEXT_REQUIRED/);
});
test("stale revision, missing work and denied host are fail-closed",async()=>{
 const f=fixture(),rev=String(f.state.revision),ref={projectId:f.projectId,workId:f.workId,revision:rev};
 const port=createAtlasProjectReadPort({openSnapshot:()=>f.state,authorize:()=>true});
 const denied=createAtlasProjectReadPort({openSnapshot:()=>f.state,authorize:()=>false});
 await assert.rejects(denied.work(ref,{workspaceId:"personal"}),/ATLAS_HOST_AUTHORIZATION_DENIED/);
 await assert.rejects(port.work({...ref,workId:"other"},{workspaceId:"personal"}),/ATLAS_WORK_NOT_FOUND/);
 f.state=editProject(f.state,f.projectId,{name:"Project Beta"});
 await assert.rejects(port.work(ref,{workspaceId:"personal"}),/ATLAS_SOURCE_REVISION_CHANGED/);
 assert.equal((await port.project({projectId:f.projectId,revision:String(f.state.revision)},{workspaceId:"personal"})).name,"Project Beta");
});
test("unavailable optional Agent/Center does not affect offline Atlas snapshot",async()=>{
 const f=fixture(),persisted=serialize(f.state);
 assert.equal(deserialize(persisted).projects[0].items.length,1);
 assert.throws(()=>createAtlasProjectReadPort({openSnapshot:()=>f.state}),/ATLAS_HOST_BOUNDARY_REQUIRED/);
 assert.equal(serialize(f.state),persisted);
});

test("P04 observes current Atlas revision without rewriting old ProjectRef/WorkRef",async()=>{
 const f=fixture(),reference=Object.freeze({projectId:f.projectId,workId:f.workId,revision:String(f.state.revision)});
 const port=createAtlasProjectReadPort({openSnapshot:()=>f.state,authorize:()=>true});
 const original=await port.observeRevision(reference,{workspaceId:"personal"});
 assert.equal(original.status,"SOURCE_REVISION_MATCHES");
 f.state=editProject(f.state,f.projectId,{name:"Changed in canonical Atlas"});
 const outdated=await port.observeRevision(reference,{workspaceId:"personal"});
 assert.equal(outdated.status,"SOURCE_REVISION_CHANGED");
 assert.equal(outdated.currentRevision,String(f.state.revision));
 assert.equal(reference.revision,original.ref.revision);
 assert.equal((await port.observeRevision({...reference,workId:"removed"},{workspaceId:"personal"})).status,"WORK_MISSING_IN_SOURCE");
 assert.equal((await port.observeRevision({...reference,projectId:"missing"},{workspaceId:"personal"})).status,"PROJECT_MISSING_IN_SOURCE");
 const blocked=createAtlasProjectReadPort({openSnapshot:()=>f.state,authorize:()=>false});
 await assert.rejects(blocked.observeRevision(reference,{workspaceId:"personal"}),/ATLAS_HOST_AUTHORIZATION_DENIED/);
});

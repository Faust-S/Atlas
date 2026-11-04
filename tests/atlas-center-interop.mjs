// Cross-product contract qualification using the actual public Center source.
// Run only when CI checks out the pinned Center repo to ./center-public.
// This test never creates another Atlas store or corporate T3 authority.
import assert from "node:assert/strict";
import {empty,createProject,createItem,connect,editItem,serialize} from "../src/core.mjs";
import {readAtlasPortfolio,linkableAtlasProject,linkableAtlasWork,atlasWorkReadback,atlasLinkReadback} from "../center-public/src/atlas-integration.mjs";
import {emptyDraft,applyDraftCommand,encodeDraft,decodeDraft} from "../center-public/src/organization.mjs";

const next=(()=>{let value=0;return ()=>"atlas-center-interop-"+(++value);})();
const at="2026-11-05T00:00:00.000Z";
const commandOpts={id:next,now:()=>at};
let snapshot=empty();
const project=createProject(snapshot,{name:"Atlas Center contract",type:"engineering"});
snapshot=project.state;
const workA=createItem(snapshot,project.id,{title:"Assemble documentation"});
snapshot=workA.state;
const workB=createItem(snapshot,project.id,{title:"Review acceptance evidence"});
snapshot=connect(workB.state,project.id,workA.id,workB.id);
const original=serialize(snapshot);
const view=readAtlasPortfolio(original);
assert.equal(view.source,"atlas.project/1");
assert.equal(view.authorization,"NOT_CHECKED");
assert.equal(view.mode,"READ_ONLY_USER_SELECTED_FILE");
assert.equal(view.projects.length,1);
assert.equal(view.projects[0].workItems.length,2);
assert.equal(snapshot.projects[0].dependencies.length,1);

const projectRef=linkableAtlasProject(view,project.id);
const workRef=linkableAtlasWork(view,project.id,workB.id);
assert.deepEqual(workRef,{projectId:project.id,workId:workB.id,revision:String(snapshot.revision)});
assert.equal(atlasLinkReadback(view,projectRef),"SOURCE_REVISION_MATCHES");
assert.equal(atlasWorkReadback(view,workRef),"SOURCE_REVISION_MATCHES");

let center=applyDraftCommand(emptyDraft(at),{type:"CREATE_ORGANIZATION",name:"Qualification organization"},commandOpts);
const organizationId=center.activeOrganizationId;
center=applyDraftCommand(center,{type:"ADD_WORKSPACE",organizationId,name:"Engineering"},commandOpts);
const workspaceId=center.organizations[0].workspaces[0].id;
center=applyDraftCommand(center,{type:"LINK_ATLAS_WORKSPACE",organizationId,workspaceId,atlasRef:projectRef},commandOpts);
center=applyDraftCommand(center,{type:"SAVE_ASSIGNMENT",organizationId,workspaceId,
  title:"Review acceptance evidence",description:"Atlas WorkRef",criteria:"Validated review",
  atlasRef:workRef},commandOpts);
const restarted=decodeDraft(encodeDraft(center));
assert.deepEqual(restarted.organizations[0].workspaces[0].atlasRef,projectRef);
assert.deepEqual(restarted.organizations[0].assignments[0].atlasRef,workRef);
assert.equal(restarted.organizations[0].assignments[0].status,"DRAFT");
assert.equal("projects" in restarted.organizations[0],false);
assert.equal("items" in restarted.organizations[0],false);
assert.equal(serialize(snapshot),original);

const changed=editItem(snapshot,project.id,workA.id,{state:"in_progress"});
const changedView=readAtlasPortfolio(serialize(changed));
assert.equal(changed.projects[0].items[1].id,workB.id);
assert.equal(changed.projects[0].dependencies.length,1);
assert.equal(atlasLinkReadback(changedView,projectRef),"SOURCE_REVISION_CHANGED");
assert.equal(atlasWorkReadback(changedView,workRef),"SOURCE_REVISION_CHANGED");
assert.deepEqual(decodeDraft(encodeDraft(restarted)),restarted);
assert.deepEqual(restarted.organizations[0].assignments[0].atlasRef,workRef);
assert.equal(atlasWorkReadback(null,workRef),"NOT_OBSERVED");

console.log("ATLAS_CENTER_REAL_SOURCE_CONTRACT_PASS",JSON.stringify({
 source:"atlas.project/1",oldRevision:view.revision,newRevision:changedView.revision,
 projectIdPreserved:true,workIdPreserved:true,dependencyPreserved:true,
 orgStoresReferencesOnly:true,staleDetected:true,t3GrantIssued:false,
 liveConnection:false
}));

// Consume only the real JSON produced by installed Atlas native GUI.
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readAtlasPortfolio,linkableAtlasProject,linkableAtlasWork,atlasLinkReadback,atlasWorkReadback}
 from "../center-public/src/atlas-integration.mjs";
import {emptyDraft,applyDraftCommand,encodeDraft,decodeDraft}
 from "../center-public/src/organization.mjs";

const path=process.env.ATLAS_GUI_CENTER_EXPORT;
assert.ok(path && path.endsWith(".json"),"Required installed GUI JSON file missing");
const raw=readFileSync(path,"utf8");
const snapshot=JSON.parse(raw);
assert.equal(snapshot.schema,"atlas.project/1");
assert.equal(snapshot.projects.length,1);
const project=snapshot.projects[0];
assert.equal(project.name,"AtlasGUIFirstSave");
assert.equal(project.items.length,2);
assert.equal(project.dependencies.length,1);
const view=readAtlasPortfolio(raw);
assert.equal(view.source,"atlas.project/1");
assert.equal(view.revision,String(snapshot.revision));
assert.equal(view.authorization,"NOT_CHECKED");
assert.equal(view.mode,"READ_ONLY_USER_SELECTED_FILE");
assert.equal(view.projects.length,1);
assert.equal(view.projects[0].workItems.length,2);
const projectRef=linkableAtlasProject(view,project.id);
const workRef=linkableAtlasWork(view,project.id,project.items[1].id);
assert.deepEqual(projectRef,{projectId:project.id,revision:String(snapshot.revision)});
assert.deepEqual(workRef,{projectId:project.id,revision:String(snapshot.revision),workId:project.items[1].id});
assert.equal(atlasLinkReadback(view,projectRef),"SOURCE_REVISION_MATCHES");
assert.equal(atlasWorkReadback(view,workRef),"SOURCE_REVISION_MATCHES");
let count=0;
const opts={id:()=>"installed-gui-center-"+(++count),now:()=>"2026-11-05T00:00:00.000Z"};
let draft=applyDraftCommand(emptyDraft(opts.now()),{type:"CREATE_ORGANIZATION",name:"Installed GUI Center import"},opts);
const organizationId=draft.activeOrganizationId;
draft=applyDraftCommand(draft,{type:"ADD_WORKSPACE",organizationId,name:"Engineering"},opts);
const workspaceId=draft.organizations[0].workspaces[0].id;
draft=applyDraftCommand(draft,{type:"LINK_ATLAS_WORKSPACE",organizationId,workspaceId,atlasRef:projectRef},opts);
draft=applyDraftCommand(draft,{type:"SAVE_ASSIGNMENT",organizationId,workspaceId,
 title:"Review saved Atlas work",description:"Imported from installed GUI JSON",criteria:"Review",
 atlasRef:workRef},opts);
const restored=decodeDraft(encodeDraft(draft));
assert.deepEqual(restored.organizations[0].workspaces[0].atlasRef,projectRef);
assert.deepEqual(restored.organizations[0].assignments[0].atlasRef,workRef);
assert.equal(restored.organizations[0].assignments[0].status,"DRAFT");
assert.equal("projects" in restored.organizations[0],false);
assert.equal("items" in restored.organizations[0],false);
assert.equal(atlasWorkReadback(view,restored.organizations[0].assignments[0].atlasRef),"SOURCE_REVISION_MATCHES");
console.log("ATLAS_INSTALLED_GUI_TO_REAL_CENTER_IMPORT_PASS",JSON.stringify({
 source:view.source,revision:view.revision,projects:view.projects.length,
 works:view.projects[0].workItems.length,workDependencies:project.dependencies.length,
 projectRefExact:true,workRefExact:true,centerDraftReadback:true,orgCopiesProjectStore:false,
 t3GrantIssued:false,centerGuiTested:false,liveConnection:false
}));

const updatedPath=process.env.ATLAS_GUI_CENTER_EXPORT_UPDATED;
assert.ok(updatedPath&&updatedPath.endsWith(".json"),"Second installed GUI export is required");
const newRaw=readFileSync(updatedPath,"utf8");
const updatedSnapshot=JSON.parse(newRaw);
assert.equal(updatedSnapshot.schema,"atlas.project/1");
assert.ok(updatedSnapshot.revision>snapshot.revision,"New GUI save must advance portfolio revision");
assert.equal(updatedSnapshot.projects.length,2);
const retained=updatedSnapshot.projects.find(p=>p.id===project.id);
assert.ok(retained,"Old project ID must survive a different portfolio edit");
assert.equal(retained.items.length,2);
assert.deepEqual(retained.dependencies,project.dependencies);
assert.deepEqual(retained.items.map(i=>i.id),project.items.map(i=>i.id));
const updatedView=readAtlasPortfolio(newRaw);
assert.equal(updatedView.revision,String(updatedSnapshot.revision));
assert.equal(atlasLinkReadback(updatedView,projectRef),"SOURCE_REVISION_CHANGED");
assert.equal(atlasWorkReadback(updatedView,workRef),"SOURCE_REVISION_CHANGED");
assert.deepEqual(restored.organizations[0].assignments[0].atlasRef,workRef);
const currentRef=linkableAtlasWork(updatedView,project.id,project.items[1].id);
assert.equal(atlasWorkReadback(updatedView,currentRef),"SOURCE_REVISION_MATCHES");
assert.equal(currentRef.revision,String(updatedSnapshot.revision));
console.log("ATLAS_INSTALLED_GUI_TO_REAL_CENTER_STALE_PASS",JSON.stringify({
 oldRevision:view.revision,newRevision:updatedView.revision,
 sameProjectId:true,sameWorkId:true,dependencyRetained:true,
 oldRefStale:true,storedDraftUnchanged:true,updatedRefCurrent:true,
 t3Issued:false,centerGuiTested:false,liveSync:false
}));

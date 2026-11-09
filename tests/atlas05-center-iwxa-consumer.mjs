// Real cross-product SOURCE consumer test, not an installed Center .iwxa picker.
// Uses the existing Atlas .iwxa parser and the exact public Center read-only
// project/WorkRef projection. No duplicate store, T3 grant, or automatic sync.
// Local fixture mode: node tests/atlas05-center-iwxa-consumer.mjs
// Installed export: node tests/atlas05-center-iwxa-consumer.mjs /path/to/installed.iwxa
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {readIwxaPortfolio,buildIwxaPortfolio,IWXA_ADOPTION} from "../desktop/src/iwxa-portfolio.mjs";
import {serialize,editItem} from "../src/core.mjs";
import {desktopLoadPortfolio} from "./fixtures/desktop-portfolio-120.mjs";
import {readAtlasPortfolio,linkableAtlasProject,linkableAtlasWork,
 atlasLinkReadback,atlasWorkReadback} from "../center-public/src/atlas-integration.mjs";
import {emptyDraft,applyDraftCommand,encodeDraft,decodeDraft} from "../center-public/src/organization.mjs";

const installedPath=process.argv[2];
const archive=installedPath
 ? new Uint8Array(readFileSync(installedPath))
 : await buildIwxaPortfolio(desktopLoadPortfolio(),{now:"2026-11-09T10:00:00.000Z"});
const imported=await readIwxaPortfolio(archive);
assert.equal(imported.adoption,IWXA_ADOPTION);
assert.equal(imported.profile,"iwxa.atlas.portfolio");
assert.equal(imported.manifest.format,"iwxa.package");

// Inter-product handoff is through the real Center projection only. The
// snapshot is an in-memory argument, never another JSON archive on disk.
const snapshot=imported.snapshot;
const original=serialize(snapshot);
const view=readAtlasPortfolio(original);
assert.equal(view.mode,"READ_ONLY_USER_SELECTED_FILE");
assert.equal(view.authorization,"NOT_CHECKED");
assert.equal(view.source,"atlas.project/1");
assert.equal(view.revision,String(snapshot.revision));
assert.equal(view.projects.length,snapshot.projects.length);
assert.ok(view.projects.length>=120,"Installed Atlas test portfolio must have 120 projects");
const actualWorkCount=snapshot.projects.reduce((sum,p)=>sum+p.items.length,0);
assert.ok(actualWorkCount>=1200,"Installed Atlas test portfolio must have 1200 works");
assert.equal(view.projects.reduce((sum,p)=>sum+p.workItems.length,0),actualWorkCount);
for(let i=0;i<snapshot.projects.length;i++){
 const source=snapshot.projects[i],destination=view.projects[i];
 assert.equal(destination.id,source.id);
 assert.equal(destination.name,source.name);
 assert.deepEqual(destination.workItems.map(w=>w.id),source.items.map(w=>w.id));
}
const project=snapshot.projects.find(p=>p.items.length>0);
assert.ok(project,"Portfolio must contain an actual work");
const work=project.items[0];
const projectRef=linkableAtlasProject(view,project.id);
const workRef=linkableAtlasWork(view,project.id,work.id);
assert.deepEqual(workRef,{projectId:project.id,workId:work.id,revision:String(snapshot.revision)});
assert.equal(atlasLinkReadback(view,projectRef),"SOURCE_REVISION_MATCHES");
assert.equal(atlasWorkReadback(view,workRef),"SOURCE_REVISION_MATCHES");

const at="2026-11-09T10:00:00.000Z";
let n=0;
const options={id:()=>"atlas05-center-import-"+(++n),now:()=>at};
let center=applyDraftCommand(emptyDraft(at),
 {type:"CREATE_ORGANIZATION",name:"Atlas IWXA consumer qualification"},options);
const organizationId=center.activeOrganizationId;
center=applyDraftCommand(center,{type:"ADD_WORKSPACE",organizationId,name:"Projects"},options);
const workspaceId=center.organizations[0].workspaces[0].id;
center=applyDraftCommand(center,{type:"LINK_ATLAS_WORKSPACE",
 organizationId,workspaceId,atlasRef:projectRef},options);
center=applyDraftCommand(center,{type:"SAVE_ASSIGNMENT",
 organizationId,workspaceId,title:"Check Atlas work",description:"Read-only WorkRef",
 criteria:"Review source before approval",atlasRef:workRef},options);
const reopened=decodeDraft(encodeDraft(center));
assert.deepEqual(reopened.organizations[0].workspaces[0].atlasRef,projectRef);
assert.deepEqual(reopened.organizations[0].assignments[0].atlasRef,workRef);
assert.equal(reopened.organizations[0].assignments[0].status,"DRAFT");
assert.equal("projects" in reopened.organizations[0],false);
assert.equal("items" in reopened.organizations[0],false);

// Source revision changes must NOT rewrite historical Center WorkRef. This
// checks Center's exact stale-gate rather than inventing a T3 acceptance.
const newState=work.state==="todo"?"in_progress":"todo";
const changed=editItem(snapshot,project.id,work.id,{state:newState});
const changedView=readAtlasPortfolio(serialize(changed));
assert.equal(atlasLinkReadback(changedView,projectRef),"SOURCE_REVISION_CHANGED");
assert.equal(atlasWorkReadback(changedView,workRef),"SOURCE_REVISION_CHANGED");
assert.deepEqual(reopened.organizations[0].assignments[0].atlasRef,workRef);
assert.equal(serialize(snapshot),original,"Source snapshot mutated during Center consumption");

console.log("ATLAS05_CENTER_IWXA_SOURCE_CONSUMER_PASS",JSON.stringify({
 archive:installedPath?"installed-atlas":"generated-from-atlas",
 projects:view.projects.length,works:actualWorkCount,revision:view.revision,
 centerProjectId:projectRef.projectId,centerWorkId:workRef.workId,
 workRefPreserved:true,centerDraftReadback:true,staleDetected:true,
 installedCenterFilePicker:"NOT_QUALIFIED",t3Authority:"NOT_GRANTED"
}));

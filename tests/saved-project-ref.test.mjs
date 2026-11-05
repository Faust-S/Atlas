import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,createItem,editProject,serialize,deserialize} from "../src/core.mjs";
import {createAtlasSavedRef} from "../src/project-host-port.mjs";

function fixture(){
 const created=createProject(empty(),{name:"Project alpha",type:"engineering"});
 const work=createItem(created.state,created.id,{title:"Complete first stage"});
 return {snapshot:work.state,projectId:created.id,workId:work.id};
}
test("saved ProjectRef and WorkRef are bounded canonical ID/revision only",()=>{
 const f=fixture(),before=serialize(f.snapshot);
 const saved={persisted:true,dirty:false};
 const project=createAtlasSavedRef(f.snapshot,{projectId:f.projectId},saved);
 const work=createAtlasSavedRef(f.snapshot,{projectId:f.projectId,workId:f.workId},saved);
 assert.deepEqual(Object.keys(project),["projectId","revision"]);
 assert.deepEqual(Object.keys(work),["projectId","workId","revision"]);
 assert.deepEqual(work,{projectId:f.projectId,workId:f.workId,revision:String(f.snapshot.revision)});
 assert.ok(Object.isFrozen(project));assert.ok(Object.isFrozen(work));
 assert.equal(serialize(f.snapshot),before);
 assert.equal(deserialize(before).revision,f.snapshot.revision);
});
test("unsaved or dirty Atlas cannot issue an authoritative current reference",()=>{
 const f=fixture(),ref={projectId:f.projectId,workId:f.workId};
 for(const flags of [{persisted:false,dirty:false},{persisted:true,dirty:true},{}]){
  assert.throws(()=>createAtlasSavedRef(f.snapshot,ref,flags),/ATLAS_REF_REQUIRES_SAVED_REVISION/);
 }
 assert.throws(()=>createAtlasSavedRef(f.snapshot,{projectId:"missing"},{persisted:true,dirty:false}),/ATLAS_PROJECT_NOT_FOUND/);
 assert.throws(()=>createAtlasSavedRef(f.snapshot,{...ref,workId:"missing"},{persisted:true,dirty:false}),/ATLAS_WORK_NOT_FOUND/);
 const changed=editProject(f.snapshot,f.projectId,{name:"Changed locally"});
 assert.notEqual(changed.revision,f.snapshot.revision);
 assert.equal(createAtlasSavedRef(changed,ref,{persisted:true,dirty:false}).revision,String(changed.revision));
});
test("desktop exposes saved references only after persistence and without false host claims",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/import \{createAtlasSavedRef\} from "\.\.\/\.\.\/src\/project-host-port\.mjs";/);
 assert.match(ui,/disabled=\{busy\|\|dirty\|\|!persisted\|\|!!editor\}/);
 assert.match(ui,/onClick=\{\(\)=>showSavedReference\(project\.id,w\.id\)\}/);
 assert.match(ui,/savedRefPreview\.revision===String\(data\.revision\)&&!dirty/);
 assert.match(ui,/не пакет \.iwxa/);
 assert.match(ui,/не подтверждение подключения Agent или Center/);
});

test("handoff GUI reopens exact native snapshot and exports existing JSON for Center",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/const showSavedReference=async\(projectId:string,workId\?:string\)=>/);
 assert.match(ui,/readSavedSnapshotForReference\(\{/);
 assert.match(ui,/expectedGeneration,snapshot:startedWith,signature:snapshotText/);
 assert.match(ui,/latestSnapshot\.current!==startedWith\|\|dirtyRef\.current/);
 assert.match(ui,/onClick=\{\(\)=>void exportJson\("center"\)\}/);
 assert.match(ui,/Admin Center откройте раздел/);
 assert.match(ui,/Это снимок, а не синхронизация/);
});

test("standalone development UI identifies 0.3 rather than the frozen release",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 assert.match(ui,/Нативный Atlas 0\.3 запускается как установленное приложение Tauri/);
 assert.doesNotMatch(ui,/Нативный Atlas 0\.2 запускается как установленное приложение Tauri/);
});

test("saved-reference modal has native title and keyboard/close protection",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const windows=readFileSync(new URL("../desktop/tests/installed-windows-keyboard.ps1",import.meta.url),"utf8");
 assert.match(ui,/const savedRefOpenRef=useRef\(false\)/);
 assert.match(ui,/if\(savedRefOpenRef\.current\)\{[\s\S]*?event\.preventDefault\(\)/);
 assert.match(ui,/const suffix=savedRefPreview\?" · "\+savedRefPreview\.label/);
 assert.match(ui,/if\(savedRefPreview!==null\)\{[\s\S]*?event\.key==="Escape"/);
 assert.match(ui,/if\(ctrl&&event\.altKey&&!event\.shiftKey&&code==="KeyP"\)/);
 // Visible button bounds from the actual installed Windows screenshot at
 // 1024x768. Reject a click in the heading (the previous false-failure).
 const target=windows.match(/Click-AtlasAt \$process (\d+) (\d+)\s*\r?\n\s*Wait-AtlasTitle \$process 'Ссылка на проект'/);
 assert.ok(target,"The ProjectRef click must be immediately followed by the native title check");
 const cssX=Number(target[1]),cssY=Number(target[2]);
 assert.ok(cssX>=693&&cssX<=822&&cssY>=267&&cssY<=301,"ProjectRef click must hit the screenshot-confirmed button");
 assert.match(windows,/installed-before-project-ref-click/);
 assert.match(windows,/ATLAS_INSTALLED_SAVED_PROJECT_REF_DIALOG_PASS/);
 assert.match(windows,/Export-AtlasSavedJsonForCenter \$process \$saved \$names\[0\]/);
 assert.match(windows,/ATLAS_INSTALLED_GUI_CENTER_JSON_EXPORT_PASS/);
 assert.match(windows,/ATLAS_INSTALLED_GUI_CENTER_UPDATED_EDITION_PASS/);
 assert.match(windows,/atlas-center-gui-export-updated\.json/);
 assert.match(windows,/Wait-AtlasTitle \$process 'Ссылка на проект'/);
 assert.match(windows,/afterReference\.generation -ne \$saved\.generation/);
});

test("two installed applications reuse the existing Center and explicit stale WorkRef refresh",()=>{
 const script=readFileSync(new URL("../desktop/tests/installed-center-e2e.ps1",import.meta.url),"utf8");
 const workflow=readFileSync(new URL("../.github/workflows/atlas-0-2-1-branding.yml",import.meta.url),"utf8");
 assert.match(script,/ATLAS_CENTER_TWO_INSTALLED_GUI_FILE_IMPORT_PASS/);
 assert.match(script,/ATLAS_CENTER_TWO_INSTALLED_GUI_STALE_WORKREF_PASS/);
 assert.match(script,/ATLAS_CENTER_TWO_INSTALLED_GUI_EXPLICIT_REFRESH_PASS/);
 assert.match(script,/ATLAS_CENTER_TWO_INSTALLED_GUI_RESTART_READBACK_PASS/);
 assert.match(script,/Import-AtlasFile \$originalPath/);
 assert.match(script,/Import-AtlasFile \$updatedPath/);
 assert.match(workflow,/run: \.\/desktop\/tests\/installed-center-e2e\.ps1/);
 assert.match(workflow,/ref: 164c67849d709f6fae2f39666d6870d37fe12670/);
 assert.match(script,/Wait-AtlasRevisionMetric \$expectedRevision/);
 assert.match(script,/ATLAS_CENTER_TWO_INSTALLED_GUI_REVISION_METRIC_PASS/);
 assert.doesNotMatch(script,/Wait-Text \('редакция '\+\$expectedRevision\)/);
});

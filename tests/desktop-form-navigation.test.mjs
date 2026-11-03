import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");

test("all project, tab and editor navigation preserves unapplied forms",()=>{
 assert.match(ui,/const requireClosedForm=\(\)=>/);
 assert.match(ui,/if\(!editorOpenRef\.current\)return true/);
 assert.match(ui,/const selectProject=\(id:string\|null,afterSubmit=false\)=>\{\s*if\(!afterSubmit&&!requireClosedForm\(\)\)return/);
 assert.match(ui,/const openEditor=\(action:string,projectId\?:string\)=>\{\s*if\(!requireClosedForm\(\)\|\|busyRef\.current\)return/);
 assert.match(ui,/const openEditorFor=\(projectId:string,action:string\)=>\{\s*if\(!requireClosedForm\(\)\|\|busyRef\.current\)return/);
 assert.match(ui,/const view=\(tabId:Tab\)=>\{\s*if\(!requireClosedForm\(\)\)return/);
 assert.match(ui,/if\(result\.projectId\)selectProject\(result\.projectId,true\)/);
 assert.match(ui,/<nav className="tabbar"[^>]*>\{tabs\.map\(t=><button key=\{t\.key\}/);
 assert.match(ui,/filtered\.slice\(0,sidebarLimit\)\.map\(\(p:any\)=><button key=\{p\.id\}/);
 assert.doesNotMatch(ui,/<button disabled=\{!!editor\} key=\{(?:t|p)\.key\}/);
});

test("native import, export and background mutations cannot discard an open form",()=>{
 assert.match(ui,/const importJson=async\(\)=>\{\s*if\(!requireClosedForm\(\)\|\|busyRef\.current\|\|!ready\)return/);
 assert.match(ui,/const exportJson=async\(\)=>\{\s*if\(!requireClosedForm\(\)\|\|busyRef\.current\|\|!ready\)return/);
 assert.match(ui,/latestSnapshot\.current!==startedWith\|\|dirtyRef\.current\|\|editorOpenRef\.current/g);
 assert.match(ui,/const syncPublic=async\(source\?:\{projectId:string;sourceId:string\}\)=>\{\s*if\(!requireClosedForm\(\)\|\|busyRef\.current\)return/);
 for(const name of ["applyAmendment","removeAmendment","quickWork"]) {
  const span=ui.slice(ui.indexOf(" const "+name+"="),ui.indexOf("};",ui.indexOf(" const "+name+"=")));
  assert.match(span,/requireClosedForm\(\)/,name+" must protect the open editor");
 }
 assert.match(ui,/disabled=\{busy\|\|!!editor\|\|pendingImport!==null\}>Открыть JSON/);
 assert.match(ui,/disabled=\{busy\|\|dirty\|\|!!editor\|\|!persisted\}>Резервная копия/);
 assert.match(ui,/disabled=\{!!editor\} className="icon-button inspector-button"/);
 assert.match(ui,/useState\(\(\)=>window\.innerWidth>1220\)/);
 assert.match(ui,/aria-label=\{inspector\?"Скрыть инспектор":"Показать инспектор"\}/);
});

test("JSON preview guards a draft until human approval and native generation recheck",()=>{
 assert.match(ui,/setPendingImport\(\{snapshot:next,originalRevision,summary,startedWith,expectedGeneration:generation\}\)/);
 assert.match(ui,/const applyPendingImport=async\(\)=>/);
 assert.match(ui,/head\.needsConfirmation\|\|head\.generation!==candidate\.expectedGeneration/);
 assert.match(ui,/latestSnapshot\.current!==candidate\.startedWith/);
 assert.match(ui,/mutate\(candidate\.snapshot/);
 assert.match(ui,/selectProject\(null,true\)/);
 assert.match(ui,/if\(pendingImportOpenRef\.current\)/);
 assert.match(ui,/if\(pendingImport!==null\)/);
 assert.match(ui,/aria-labelledby="atlas-import-preview-title"/);
 assert.match(ui,/Заменить портфель в черновике/);
 assert.match(ui,/Отменить импорт/);
 assert.doesNotMatch(ui,/confirmAction\("Заменить текущий портфель импортированным JSON/);
});


test("R3 keyboard and sidebar navigation allow untouched forms, block changed fields",()=>{
 assert.match(ui,/if\(!editorDirtyRef\.current\)\{setEditor\(null\);return true;\}/);
 const handlers=ui.slice(ui.indexOf(" const key=(event:KeyboardEvent)=>"),ui.indexOf('window.addEventListener("keydown",key)'));
 assert.equal((handlers.match(/if\(!requireClosedForm\(\)\)return/g)||[]).length,3);
 assert.doesNotMatch(handlers,/if\(editorOpenRef\.current\)\{issue\(Error\("Сначала примените или закройте/);
 assert.match(ui,/onClick=\{\(\)=>selectProject\(null\)\}/);
});

test("R3 compact Windows layout exposes an inspector drawer without covering startup workspace",()=>{
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(css,/@media\(max-width:1220px\)/);
 assert.match(css,/\.app-shell \.inspector\{display:block;position:fixed/);
 assert.doesNotMatch(css,/\.app-shell\.editor-active \.inspector\{display:block/);
 assert.match(ui,/window\.innerWidth>1220/);
 assert.match(ui,/aria-label="Скрыть инспектор"/);
});

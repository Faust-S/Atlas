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
 assert.match(ui,/disabled=\{!!editor\} key=\{t\.key\}/);
 assert.match(ui,/disabled=\{!!editor\} key=\{p\.id\}/);
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

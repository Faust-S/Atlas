import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Atlas inspector shares existing live Work, Source, Baseline records and original editor",()=>{
 const inspector=read("../desktop/src/AtlasInspectorPreview.tsx");
 const main=read("../desktop/src/main.tsx");
 const css=read("../desktop/src/style.css");
 for(const section of ["project","work","source","baseline"]){
  assert.match(inspector,new RegExp(section+':'));
 }
 assert.match(inspector,/plan\?\.rows\?\.find/);
 assert.match(inspector,/project\.dependencies\.filter/);
 assert.match(inspector,/project\?\.planBaselines/);
 assert.match(inspector,/onEditWork\(work\.id\)/);
 assert.match(inspector,/onOpenTab\("reality"\)/);
 assert.match(inspector,/dirty\?"Черновик ещё не сохранён"/);
 assert.match(main,/<AtlasInspectorPreview key=\{project\?\.id\|\|"portfolio"\}/);
 assert.match(main,/onEditWork=\{id=>openEditor\("work:"\+id\)\}/);
 assert.match(main,/onSave=\{\(\)=>void save\(\)\}/);
 assert.match(main,/onClose=\{\(\)=>setInspector\(false\)\}/);
 assert.match(css,/\.atlas-v6-dock-tabs\{/);
 assert.match(css,/\.atlas-v6-preview-body\{flex:1;min-height:0;overflow-y:auto/);
 assert.match(css,/\.app-shell\.atlas-v6-shell \.inspector\{[\s\S]*?position:relative/);
});

test("dragging Board Work changes only via existing guarded editItem and explicit Save",()=>{
 const main=read("../desktop/src/main.tsx");
 assert.match(main,/const quickWork=\(id:string,state:string\)=>\{\s*if\(!project\|\|!requireClosedForm\(\)\|\|busyRef\.current\)return/);
 assert.match(main,/mutate\(editItem\(data,project\.id,id,\{state\}\)/);
 assert.match(main,/onDragStart=\{event=>\{/);
 assert.match(main,/event\.dataTransfer\.setData\("application\/x-atlas-work",w\.id\)/);
 assert.match(main,/event\.dataTransfer\.getData\("application\/x-atlas-work"\)/);
 assert.match(main,/project\.items\.some\(\(item:any\)=>item\.id===id\)/);
 assert.match(main,/\.state!==key\)quickWork\(id,key\)/);
 assert.match(main,/onDragEnd=\{\(\)=>setDragWorkId\(null\)\}/);
 assert.match(main,/onChange=\{e=>quickWork\(w\.id,e\.target\.value\)\}/);
 assert.match(main,/aria-label=\{"Просмотреть в инспекторе "\+w\.title\}/);
});

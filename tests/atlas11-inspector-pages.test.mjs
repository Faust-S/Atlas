import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectorPagedRows,inspectorWorkContext}
 from "../desktop/src/inspector-work-context.mjs";

test("Inspector exposes every linked Work even with large CPM dependency chains",()=>{
 const items=Array.from({length:1212},(_,i)=>({id:"w"+i,title:"Work "+i}));
 const dependencies=items.slice(1).map(item=>({from:item.id,to:"w0"}));
 const project={items,dependencies};
 const before=JSON.stringify(project);
 const facts=inspectorWorkContext(project,null,"w0");
 assert.equal(facts.predecessors.length,1211);
 const first=inspectorPagedRows(facts.predecessors,0);
 assert.equal(first.total,1211);
 assert.equal(first.pages,202);
 assert.deepEqual(first.items.map(item=>item.id),["w1","w2","w3","w4","w5","w6"]);
 const last=inspectorPagedRows(facts.predecessors,201);
 assert.equal(last.items.length,5);
 assert.equal(last.items.at(-1).id,"w1211");
 assert.deepEqual(inspectorPagedRows(facts.predecessors,999),last);
 assert.equal(JSON.stringify(project),before,"Page selection must not edit the project");
});

test("Inspector history pagination handles long history and shrinking linked records",()=>{
 const records=Array.from({length:19},(_,i)=>({id:"finding-"+i}));
 const original=JSON.stringify(records);
 assert.deepEqual(inspectorPagedRows(records,2).items.map(item=>item.id),
  records.slice(12,18).map(item=>item.id));
 const last=inspectorPagedRows(records,3);
 assert.deepEqual([last.start,last.end,last.total,last.pages],[18,19,19,4]);
 assert.deepEqual(inspectorPagedRows(records.slice(0,3),3).items,records.slice(0,3));
 assert.deepEqual(inspectorPagedRows([],10),{
  items:[],page:0,pages:1,total:0,start:0,end:0
 });
 assert.equal(JSON.stringify(records),original);
 for(const args of [[records,-1,6],[records,0,0],[records,0,1.5],[null,0,6]]){
  assert.throws(()=>inspectorPagedRows(...args),/Invalid Atlas inspector page/);
 }
});

test("Both compact Work subsections page without losing navigation or editor context",()=>{
 const preview=readFileSync(new URL("../desktop/src/AtlasInspectorPreview.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(preview,/const relationWindow=inspectorPagedRows\(relationItems,relationPage\)/);
 assert.match(preview,/const historyWindow=inspectorPagedRows\(facts\?\.history\?\?\[\],historyPage\)/);
 assert.match(preview,/aria-label="Следующие связанные работы"/);
 assert.match(preview,/aria-label="Следующие записи работы"/);
 assert.match(preview,/setRelationPage\(relationWindow\.page\+1\)/);
 assert.match(preview,/setHistoryPage\(historyWindow\.page\+1\)/);
 assert.match(preview,/setRelationPage\(0\);setHistoryPage\(0\)/);
 assert.match(preview,/onClick=\{\(\)=>open\("work",linked\.id\)\}/);
 assert.match(preview,/onClick=\{\(\)=>onEditWork\(work\.id\)\}/);
 assert.match(css,/\.atlas-v6-inspector-pager\{/);
});

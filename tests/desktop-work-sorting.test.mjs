import test from "node:test";
import assert from "node:assert/strict";
import {sortWorkRows} from "../desktop/src/work-sorting.mjs";
test("R3 work ordering uses a projection and keeps the original rows unchanged",()=>{
 const input=[
  {id:"a",title:"Gamma",priority:"normal",state:"todo",estimateDays:4,dueDate:null},
  {id:"b",title:"Alpha",priority:"critical",state:"blocked",estimateDays:2,dueDate:"2026-11-09"},
  {id:"c",title:"Beta",priority:"low",state:"done",estimateDays:1,dueDate:"2026-11-01"}
 ];
 const before=JSON.stringify(input),ids=kind=>sortWorkRows(input,kind).map(x=>x.id);
 assert.deepEqual(ids("title"),["b","c","a"]);
 assert.deepEqual(ids("dueDate"),["c","b","a"]);
 assert.deepEqual(ids("priority"),["b","a","c"]);
 assert.deepEqual(ids("estimateDays"),["c","b","a"]);
 assert.deepEqual(ids("state"),["b","a","c"]);
 assert.equal(JSON.stringify(input),before);
 assert.throws(()=>sortWorkRows(input,"unsupported"),/Unknown/);
});

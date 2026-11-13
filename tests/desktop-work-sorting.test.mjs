import test from "node:test";
import assert from "node:assert/strict";
import {sortWorkRows,firstSortedMatchingWorkId,filterWorkRowsByObservation} from "../desktop/src/work-sorting.mjs";
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

test("work-list factual gap filters never infer completion or mutate source rows",()=>{
 const works=[
  {id:"todo",title:"Todo",state:"todo"},
  {id:"done",title:"Done without observation",state:"done"},
  {id:"observed",title:"Observed",state:"in_progress"},
  {id:"observed-done",title:"Observed and done",state:"done"}
 ];
 const index=new Map([["observed",[{id:"f1",workId:"observed",origin:"manual"}]],
  ["observed-done",[{id:"f2",workId:"observed-done",origin:"manual"}]]]);
 const before=JSON.stringify(works),seen=JSON.stringify([...index]);
 const ids=mode=>filterWorkRowsByObservation(works,index,mode).map(w=>w.id);
 assert.deepEqual(ids("all"),["todo","done","observed","observed-done"]);
 assert.deepEqual(ids("with"),["observed","observed-done"]);
 assert.deepEqual(ids("without"),["todo","done"]);
 assert.deepEqual(ids("done_without"),["done"]);
 assert.equal(JSON.stringify(works),before);
 assert.equal(JSON.stringify([...index]),seen);
 assert.throws(()=>filterWorkRowsByObservation(works,index,"accepted"),/Unknown/);
 assert.throws(()=>filterWorkRowsByObservation(works,{},"without"),/Expected work observation index/);
});

test("overview deadline shortcuts focus the first sorted matching work without expanding the table",()=>{
 const items=[
  {id:"late-z",title:"Январь",priority:"low",state:"todo",estimateDays:8,dueDate:"2026-11-22"},
  {id:"other",title:"Бета",priority:"normal",state:"done",estimateDays:2,dueDate:"2026-11-10"},
  {id:"late-a",title:"Апрель",priority:"critical",state:"blocked",estimateDays:1,dueDate:"2026-11-12"}
 ];
 const before=JSON.stringify(items);
 const critical=new Set(["late-z","late-a"]);
 const overdue=new Map([["late-z","2026-11-25"],["late-a","2026-11-13"]]);
 for(const ids of [critical,overdue]){
  assert.equal(firstSortedMatchingWorkId(items,ids,"title"),"late-a");
  assert.equal(firstSortedMatchingWorkId(items,ids,"priority"),"late-a");
  assert.equal(firstSortedMatchingWorkId(items,ids,"estimateDays"),"late-a");
  assert.equal(firstSortedMatchingWorkId(items,ids,"dueDate"),"late-a");
 }
 assert.equal(firstSortedMatchingWorkId(items,new Set()),null);
 assert.throws(()=>firstSortedMatchingWorkId(items,["late-a"]),/Expected matched work IDs/);
 assert.equal(JSON.stringify(items),before);
});

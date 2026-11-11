import test from "node:test";
import assert from "node:assert/strict";
import {scheduleProject,workDependencyOverview} from "../src/planning.mjs";
import {atlas06UniversalPortfolio} from "./fixtures/atlas06-universal-portfolio.mjs";

const universal=()=>atlas06UniversalPortfolio().projects[0];

test("Recorded direct predecessors and dependents work without any GitHub source",()=>{
 const project=universal();
 const hints=workDependencyOverview(project,scheduleProject(project));
 const opening=project.items.find(item=>item.title==="Открыть площадку");
 assert.deepEqual(hints.get(opening.id),{
  predecessorTotal:2,pendingTotal:2,
  pendingTitles:["Подготовить помещение","Согласовать программу"],successorTotal:0
 });
 for(const predecessor of project.items.filter(item=>item.id!==opening.id)){
  assert.equal(hints.get(predecessor.id).successorTotal,1);
  assert.equal(hints.get(predecessor.id).pendingTotal,0);
 }
 assert.equal(project.sources.length,0);
});

test("Status changes recompute unfinished names without claiming independent completion",()=>{
 const project=universal();
 const opening=project.items.find(item=>item.title==="Открыть площадку");
 const initial=workDependencyOverview(project,scheduleProject(project));
 assert.equal(initial.get(opening.id).pendingTotal,2);
 project.items[0].state="done";
 const partial=workDependencyOverview(project,scheduleProject(project));
 assert.equal(partial.get(opening.id).predecessorTotal,2);
 assert.equal(partial.get(opening.id).pendingTotal,1);
 assert.deepEqual(partial.get(opening.id).pendingTitles,["Согласовать программу"]);
 project.items[1].state="done";
 const finished=workDependencyOverview(project,scheduleProject(project));
 assert.equal(finished.get(opening.id).pendingTotal,0);
 assert.deepEqual(finished.get(opening.id).pendingTitles,[]);
 assert.equal(finished.get(opening.id).predecessorTotal,2);
});

test("Large plans with duplicate names preserve IDs and bound the preview",()=>{
 const items=Array.from({length:1200},(_,i)=>({
  id:"work-"+i,title:i%2?"Одинаковое название":"Работа "+i,
  state:i%3===0?"done":"todo",estimateDays:1
 }));
 const dependencies=items.slice(0,-1).map((work,i)=>({from:work.id,to:items[i+1].id}));
 for(const i of [2,4,5])dependencies.push({from:items[i].id,to:items[10].id});
 const project={items,dependencies};
 const before=JSON.stringify(project);
 const hints=workDependencyOverview(project,scheduleProject(project));
 assert.equal(hints.size,1200);
 const selected=hints.get(items[10].id);
 assert.equal(selected.predecessorTotal,4);
 assert.equal(selected.pendingTotal,3);
 assert.deepEqual(selected.pendingTitles,[items[2].title,items[4].title]);
 assert.equal(selected.pendingTotal-selected.pendingTitles.length,1);
 assert.equal(hints.get(items[5].id).successorTotal,2);
 assert.equal(hints.get(items[9].id).successorTotal,1);
 assert.equal(JSON.stringify(project),before);
});

test("Unlinked work remains uncluttered and invalid preview limits fail",()=>{
 const project=universal();project.dependencies=[];
 const hints=workDependencyOverview(project,scheduleProject(project));
 for(const item of project.items)assert.deepEqual(hints.get(item.id),{
  predecessorTotal:0,pendingTotal:0,pendingTitles:[],successorTotal:0
 });
 assert.throws(()=>workDependencyOverview(project,scheduleProject(project),{maxNames:0}),/preview limit/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {scheduleProject,workDependencyOverview,filterWorkRowsByDependencies} from "../src/planning.mjs";
import {atlas06UniversalPortfolio} from "./fixtures/atlas06-universal-portfolio.mjs";

const universal=()=>atlas06UniversalPortfolio().projects[0];

test("Recorded direct predecessors and dependents work without any GitHub source",()=>{
 const project=universal();
 const hints=workDependencyOverview(project,scheduleProject(project));
 const opening=project.items.find(item=>item.title==="Открыть площадку");
 assert.deepEqual(hints.get(opening.id),{
  predecessorTotal:2,pendingTotal:2,
  pendingWorks:project.items.slice(0,2).map(work=>({id:work.id,title:work.title})),successorTotal:0
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
 assert.deepEqual(partial.get(opening.id).pendingWorks,[{id:project.items[1].id,title:"Согласовать программу"}]);
 project.items[1].state="done";
 const finished=workDependencyOverview(project,scheduleProject(project));
 assert.equal(finished.get(opening.id).pendingTotal,0);
 assert.deepEqual(finished.get(opening.id).pendingWorks,[]);
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
 assert.deepEqual(selected.pendingWorks,[items[2],items[4]].map(work=>({id:work.id,title:work.title})));
 assert.notEqual(selected.pendingWorks[0].id,selected.pendingWorks[1].id);
 assert.equal(selected.pendingTotal-selected.pendingWorks.length,1);
 assert.equal(hints.get(items[5].id).successorTotal,2);
 assert.equal(hints.get(items[9].id).successorTotal,1);
 assert.equal(JSON.stringify(project),before);
});

test("Unlinked work remains uncluttered and invalid preview limits fail",()=>{
 const project=universal();project.dependencies=[];
 const hints=workDependencyOverview(project,scheduleProject(project));
 for(const item of project.items)assert.deepEqual(hints.get(item.id),{
  predecessorTotal:0,pendingTotal:0,pendingWorks:[],successorTotal:0
 });
 assert.throws(()=>workDependencyOverview(project,scheduleProject(project),{maxNames:0}),/preview limit/);
});


test("Dependency filter combines with the work search and does not change data",()=>{
 const project=universal(),before=JSON.stringify(project);
 const overview=workDependencyOverview(project,scheduleProject(project));
 assert.equal(filterWorkRowsByDependencies(project.items,overview,"all"),project.items);
 assert.deepEqual(filterWorkRowsByDependencies(project.items,overview,"has_pending").map(w=>w.title),
  ["Открыть площадку"]);
 assert.deepEqual(filterWorkRowsByDependencies(project.items,overview,"no_pending").map(w=>w.title),
  ["Подготовить помещение","Согласовать программу"]);
 const searched=project.items.filter(w=>w.title.includes("Открыть"));
 assert.equal(filterWorkRowsByDependencies(searched,overview,"has_pending").length,1);
 assert.equal(filterWorkRowsByDependencies(searched,overview,"no_pending").length,0);
 assert.equal(JSON.stringify(project),before);
});

test("Dependency filter reflects saved work states and uses IDs for equal names",()=>{
 const project=universal(),opening=project.items[2];
 project.items[0].title="Общее название";
 project.items[1].title="Общее название";
 let overview=workDependencyOverview(project,scheduleProject(project));
 assert.deepEqual(filterWorkRowsByDependencies(project.items,overview,"has_pending").map(w=>w.id),
  [opening.id]);
 project.items[0].state="done";
 overview=workDependencyOverview(project,scheduleProject(project));
 assert.deepEqual(overview.get(opening.id).pendingWorks.map(w=>w.id),[project.items[1].id]);
 assert.deepEqual(filterWorkRowsByDependencies(project.items,overview,"has_pending").map(w=>w.id),
  [opening.id]);
 project.items[1].state="done";
 overview=workDependencyOverview(project,scheduleProject(project));
 assert.deepEqual(filterWorkRowsByDependencies(project.items,overview,"has_pending"),[]);
 assert.equal(filterWorkRowsByDependencies(project.items,overview,"no_pending").length,3);
 assert.equal(overview.get(opening.id).predecessorTotal,2);
});

test("Dependency filter on 1200 works stays bounded and strictly read-only",()=>{
 const items=Array.from({length:1200},(_,i)=>({
  id:"task-"+i,title:"Работа",state:i%3===0?"done":"todo",estimateDays:1
 }));
 const project={items,dependencies:items.slice(0,-1).map((work,i)=>({from:work.id,to:items[i+1].id}))};
 const before=JSON.stringify(project);
 const overview=workDependencyOverview(project,scheduleProject(project));
 const waiting=filterWorkRowsByDependencies(items,overview,"has_pending");
 const withoutPending=filterWorkRowsByDependencies(items,overview,"no_pending");
 assert.equal(waiting.length,799);
 assert.equal(withoutPending.length,401);
 assert.equal(waiting.length+withoutPending.length,items.length);
 assert.equal(JSON.stringify(project),before);
 assert.throws(()=>filterWorkRowsByDependencies(items,overview,"invalid"),/Invalid work dependency filter/);
});

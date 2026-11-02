import test from "node:test";
import assert from "node:assert/strict";
import {empty,validate,createProject,editProject,createStage,createItem,editItem,connect,createRisk,createDecision,attach,observe,summary,serialize,deserialize} from "../src/core.mjs";
import {scheduleProject} from "../src/planning.mjs";
const make=()=>createProject(empty(),{name:"Research",type:"research",goal:"Complete study"});
test("independent project",()=>{const r=make();assert.equal(r.state.projects[0].name,"Research");assert.equal(r.state.revision,1)});
test("all standard project types",()=>{for(const type of ["personal","team","business","engineering","research","care","other"])assert.equal(createProject(empty(),{name:"Plan",type}).state.projects[0].type,type)});
test("reject blank name and unknown type",()=>{assert.throws(()=>createProject(empty(),{name:"  "}));assert.throws(()=>createProject(empty(),{name:"x",type:"bad"}))});
test("stage, work and completion",()=>{const a=make(),b=createStage(a.state,a.id,"Plan"),c=createItem(b.state,a.id,{title:"Draw",stageId:b.id});const d=editItem(c.state,a.id,c.id,{state:"done"});assert.equal(summary(d.projects[0]).progress,100);assert.equal(summary(d.projects[0]).readiness,"not_assessed")});
test("dependencies reject cycles",()=>{const p=make(),a=createItem(p.state,p.id,{title:"A"}),b=createItem(a.state,p.id,{title:"B"});const c=connect(b.state,p.id,a.id,b.id);assert.throws(()=>connect(c,p.id,b.id,a.id),/cycle/)});
test("external agents remain references",()=>{const p=make(),a=createItem(p.state,p.id,{title:"Delegate"});const b=editItem(a.state,p.id,a.id,{executor:{kind:"external-agent",ref:"hermes/task-1"}});assert.equal(b.projects[0].items[0].executor.ref,"hermes/task-1")});
test("risk and decision",()=>{const p=make(),r=createRisk(p.state,p.id,"Delay"),d=createDecision(r,p.id,"Proceed");assert.equal(d.projects[0].risks.length,1);assert.equal(d.projects[0].decisions.length,1)});
test("source observations do not certify readiness",()=>{const p=make(),a=attach(p.state,p.id,"github","example/repo"),b=observe(a.state,p.id,a.id,"ok",{branches:["main"]});assert.equal(b.projects[0].sources[0].status,"ok");assert.equal(summary(b.projects[0]).readiness,"not_assessed")});
test("source failure preserves cached summary",()=>{const p=make(),a=attach(p.state,p.id,"github","example/repo"),b=observe(a.state,p.id,a.id,"ok",{branches:["main"]}),c=observe(b,p.id,a.id,"error",null,"offline");assert.equal(c.projects[0].sources[0].summary.branches[0],"main")});
test("budget validation",()=>{const p=make();assert.throws(()=>editProject(p.state,p.id,{budget:-1}));assert.equal(editProject(p.state,p.id,{budget:123}).projects[0].budget,123)});
test("roundtrip retains project identity and revision",()=>{const p=make();assert.deepEqual(deserialize(serialize(p.state)),p.state)});
test("invalid snapshot rejected",()=>{assert.throws(()=>deserialize('{"schema":"other","revision":1,"projects":[]}'));});
test("mutations do not alter previous state",()=>{const p=make();const q=createStage(p.state,p.id,"Stage");assert.equal(p.state.projects[0].stages.length,0);assert.equal(q.state.projects[0].stages.length,1)});
test("duplicate IDs rejected",()=>{const p=make(),q=structuredClone(p.state);q.projects.push(q.projects[0]);assert.throws(()=>validate(q))});
test("unknown stage rejected",()=>{const p=make();assert.throws(()=>createItem(p.state,p.id,{title:"a",stageId:"unknown"}))});
test("repeated work state changes",()=>{const p=make(),a=createItem(p.state,p.id,{title:"A"});const b=editItem(a.state,p.id,a.id,{state:"blocked"}),c=editItem(b,p.id,a.id,{state:"done"});assert.equal(summary(c.projects[0]).blocked,0)});

test("project date edits reject impossible calendar dates before persistence",()=>{const p=make();assert.throws(()=>editProject(p.state,p.id,{startDate:"2026-02-31"}),/Invalid project dates/);assert.throws(()=>editProject(p.state,p.id,{startDate:"2026/11/01"}),/Invalid project dates/);assert.equal(editProject(p.state,p.id,{startDate:"2026-11-01"}).projects[0].startDate,"2026-11-01");});
test("invalid imported date cannot crash schedule display after accepted import",()=>{const p=make();const snapshot=structuredClone(p.state);snapshot.projects[0].startDate="not-a-date";assert.throws(()=>validate(snapshot),/Invalid project dates/);});

test("large valid work DAGs remain editable and schedulable without recursive validation",()=>{
 const s=make().state,p=s.projects[0];
 const item=id=>({id,title:id,state:"todo",priority:"normal",estimateDays:1});
 p.items=Array.from({length:5000},(_,i)=>item("chain-"+i));
 p.dependencies=p.items.slice(1).map((work,i)=>({from:"chain-"+i,to:work.id}));
 assert.equal(validate(s),true);
 const schedule=scheduleProject(p);
 assert.equal(schedule.durationDays,5000);
 assert.equal(schedule.rows.length,5000);
 const amended=editItem(s,p.id,"chain-2500",{estimateDays:2});
 assert.equal(amended.projects[0].items[2500].estimateDays,2);
 assert.equal(scheduleProject(amended.projects[0]).durationDays,5001);
 const cycle=structuredClone(s);
 cycle.projects[0].dependencies.push({from:"chain-4999",to:"chain-0"});
 assert.throws(()=>validate(cycle),/Dependency cycle/);

 // A chain of converging diamonds previously enumerated exponentially many
 // paths during validation even though it contains few work items.
 const d=make().state,q=d.projects[0];
 q.items=[item("gate-0")];q.dependencies=[];
 for(let i=0;i<45;i++){
  const left="left-"+i,right="right-"+i,next="gate-"+(i+1);
  q.items.push(item(left),item(right),item(next));
  q.dependencies.push({from:"gate-"+i,to:left},{from:"gate-"+i,to:right},
   {from:left,to:next},{from:right,to:next});
 }
 assert.equal(validate(d),true);
 assert.equal(scheduleProject(q).durationDays,91);
 assert.deepEqual(deserialize(serialize(d)),d);
});

test("work dependency identifiers containing separators do not collide",()=>{
 const s=make().state,p=s.projects[0],ids=["a|b","c","a","b|c"];
 p.items=ids.map(id=>({id,title:id,state:"todo",priority:"normal"}));
 p.dependencies=[{from:"a|b",to:"c"},{from:"a",to:"b|c"}];
 assert.equal(validate(s),true);
 assert.equal(scheduleProject(p).rows.length,4);
});

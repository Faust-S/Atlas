// Ordinary portfolio with a free and a busy alternative to the mounting crew.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {fixture as base} from "./atlas12-work-resource-leveling.mjs";
import {addPlanningResource} from "../../src/resource-planning.mjs";
import {createProject,editProject,createItem,editItem,connect,serialize} from "../../src/core.mjs";
import {capturePlanBaseline} from "../../src/plan-baseline.mjs";
import {compareResourceConflictResolution} from "../../src/resource-conflict-resolution.mjs";
export function fixture(){
 const f=base(),free=addPlanningResource(f.snapshot,{label:"Свободная бригада",capacityPct:100}),
  busy=addPlanningResource(free.state,{label:"Занятая бригада",capacityPct:100});
 const p=createProject(busy.state,{name:"Независимый заказ",type:"engineering"});
 let s=editProject(p.state,p.id,{startDate:"2026-11-23",dueDate:"2026-12-15"});
 const w=createItem(s,p.id,{title:"Работа другой бригады",resourceId:busy.id,allocationPct:100});
 s=editItem(w.state,p.id,w.id,{estimateDays:2});
 return {...f,snapshot:s,free:free.id,busy:busy.id,otherProject:p.id,otherWork:w.id};
}
export function choice(f,overrides={}){
 return {focus:{projectId:f.projectId,workId:f.a},companion:{projectId:f.projectId,workId:f.b},
  targetResourceIds:[f.free],workDelayDays:3,projectDelayDays:3,allowSequence:true,...overrides};
}
export function fourFixture(){
 const f=base({criticalDuration:10});let s=f.snapshot;const extra=[];
 for(const title of ["Монтаж В","Монтаж Г"]){
  const w=createItem(s,f.projectId,{title,resourceId:f.resourceId,allocationPct:60});
  s=editItem(w.state,f.projectId,w.id,{estimateDays:2});s=connect(s,f.projectId,w.id,f.c);extra.push(w.id);
 }
 s=capturePlanBaseline(s,f.projectId,{name:"План четырёх монтажей"}).state;
 return {...f,snapshot:s,extra};
}
export function fourChoice(f,overrides={}){
 return choice(f,{additionalWorks:f.extra.map(workId=>({projectId:f.projectId,workId})),
  targetResourceIds:[],workDelayDays:7,projectDelayDays:0,allowSequence:false,...overrides});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output?.endsWith(".iwxa"))throw Error("Expected IWXA output path");
 const four=process.argv.includes("--four");
 const f=four?fourFixture():fixture(),r=compareResourceConflictResolution(f.snapshot,f.resourceId,four?fourChoice(f):choice(f));
 if(four){
  const best=r.options.find(o=>o.id==="work-shift-capacity");
  if(!best?.canDraft||best.focus.length!==4||best.source.after.overloadDays!==0)throw Error("Four Work conflict resolution fixture mismatch");
 }else if(r.options.filter(o=>o.valid).length!==5||r.options.find(o=>o.id==="assignment")?.source.after.overloadDays!==0)
  throw Error("Conflict resolution fixture mismatch");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:"2026-11-24T13:00:00.000Z"});
 if(serialize((await readIwxaPortfolio(bytes)).snapshot)!==serialize(f.snapshot))throw Error("Independent conflict resolution archive mismatch");
 writeFileSync(output,bytes);
 console.log("ATLAS12_CONFLICT_RESOLUTION_IWXA_PASS bytes="+bytes.length);
}

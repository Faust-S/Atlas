// Ordinary portfolio with a free and a busy alternative to the mounting crew.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {fixture as base} from "./atlas12-work-resource-leveling.mjs";
import {addPlanningResource} from "../../src/resource-planning.mjs";
import {createProject,editProject,createItem,editItem,serialize} from "../../src/core.mjs";
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
  targetResourceId:f.free,workDelayDays:3,projectDelayDays:3,allowSequence:true,...overrides};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output?.endsWith(".iwxa"))throw Error("Expected IWXA output path");
 const f=fixture(),r=compareResourceConflictResolution(f.snapshot,f.resourceId,choice(f));
 if(r.options.filter(o=>o.valid).length!==5||r.options.find(o=>o.id==="assignment")?.source.after.overloadDays!==0)
  throw Error("Conflict resolution fixture mismatch");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:"2026-11-24T13:00:00.000Z"});
 if(serialize((await readIwxaPortfolio(bytes)).snapshot)!==serialize(f.snapshot))throw Error("Independent conflict resolution archive mismatch");
 writeFileSync(output,bytes);
 console.log("ATLAS12_CONFLICT_RESOLUTION_IWXA_PASS bytes="+bytes.length);
}

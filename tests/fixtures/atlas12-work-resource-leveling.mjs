// Independent ordinary Atlas case for bounded Work-level resource search.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {empty,createProject,editProject,createItem,editItem,connect,serialize} from "../../src/core.mjs";
import {addPlanningResource} from "../../src/resource-planning.mjs";
import {capturePlanBaseline} from "../../src/plan-baseline.mjs";
import {compareWorkResourceLeveling} from "../../src/work-resource-leveling.mjs";
export function fixture({start="2026-11-23",duration=2,criticalDuration=6}={}){
 const r=addPlanningResource(empty(),{label:"Монтажный участок",capacityPct:100});
 const p=createProject(r.state,{name:"Сборка заказов",type:"engineering"});
 let s=editProject(p.state,p.id,{startDate:start,dueDate:"2026-12-15",status:"active"});
 const add=(title,days,options={})=>{
  const w=createItem(s,p.id,{title,...options});s=editItem(w.state,p.id,w.id,{estimateDays:days});return w.id;
 };
 const a=add("Монтаж А",duration,{resourceId:r.id,allocationPct:60});
 const b=add("Монтаж Б",duration,{resourceId:r.id,allocationPct:60});
 const c=add("Приёмка",1);
 const critical=add("Подготовка площадки",criticalDuration);
 s=connect(s,p.id,a,c);s=connect(s,p.id,b,c);
 s=capturePlanBaseline(s,p.id,{name:"Исходный план"}).state;
 return {snapshot:s,projectId:p.id,resourceId:r.id,a,b,c,critical};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output?.endsWith(".iwxa"))throw Error("Expected IWXA output path");
 const f=fixture(),r=compareWorkResourceLeveling(f.snapshot,f.resourceId,[f.a,f.b].map(workId=>({projectId:f.projectId,workId,maxDelay:3})));
 if(r.options.length!==2||JSON.stringify(r.options[0].vector)!=="[0,2]"||r.options[0].target.overloadDays!==0)
  throw Error("Work leveling fixture mismatch");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:"2026-11-24T12:00:00.000Z"});
 const imported=await readIwxaPortfolio(bytes);
 if(serialize(imported.snapshot)!==serialize(f.snapshot))throw Error("Independent Work leveling roundtrip mismatch");
 writeFileSync(output,bytes);
 console.log("ATLAS12_WORK_LEVELING_IWXA_PASS bytes="+bytes.length);
}

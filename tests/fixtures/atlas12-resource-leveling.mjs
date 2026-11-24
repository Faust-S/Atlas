// Native and source resource-leveling qualification use the same ordinary
// Atlas projects, Work, baseline and independent IWXA carrier.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {empty,createProject,editProject,createItem,editItem,serialize} from "../../src/core.mjs";
import {addPlanningResource} from "../../src/resource-planning.mjs";
import {capturePlanBaseline} from "../../src/plan-baseline.mjs";
import {compareResourceLeveling} from "../../src/resource-leveling.mjs";

export function fixture({count=2,dueDates=["2026-11-29","2026-11-29"],starts=[],duration=3}={}){
 const r=addPlanningResource(empty(),{label:"Монтажная площадка",capacityPct:100});
 let s=r.state;const ids=[],works=[];
 for(let i=0;i<count;i++){
  const p=createProject(s,{name:"Заказ "+(i+1),type:"engineering"});
  const dueDate=dueDates[i]??"2026-12-15";
  s=editProject(p.state,p.id,{startDate:starts[i]??"2026-11-23",dueDate});
  const w=createItem(s,p.id,{title:"Монтаж",resourceId:r.id,allocationPct:60,dueDate});
  s=editItem(w.state,p.id,w.id,{estimateDays:duration});
  s=capturePlanBaseline(s,p.id,{name:"Исходный план"}).state;
  ids.push(p.id);works.push(w.id);
 }
 return {snapshot:s,resourceId:r.id,ids,works};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output?.endsWith(".iwxa"))throw Error("Expected IWXA output path");
 const f=fixture(),r=compareResourceLeveling(f.snapshot,f.resourceId,f.ids.map(projectId=>({projectId,maxDelay:7})));
 if(r.options.length!==1||JSON.stringify(r.options[0].vector)!=="[0,3]"||r.options[0].target.overloadDays!==0)
  throw Error("Native resource leveling fixture mismatch");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:"2026-11-24T12:00:00.000Z"});
 const imported=await readIwxaPortfolio(bytes);
 if(serialize(imported.snapshot)!==serialize(f.snapshot))throw Error("Independent leveling fixture roundtrip mismatch");
 writeFileSync(output,bytes);
 console.log("ATLAS12_LEVELING_IWXA_PASS projects=2 bytes="+bytes.length);
}

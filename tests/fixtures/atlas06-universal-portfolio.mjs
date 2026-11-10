// User-independent control project. All facts and dependencies are synthetic.
// The ordinary installed .iwxa preview/confirm/Save path is exercised on Windows.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {empty,createProject,createStage,createItem,connect,serialize} from "../../src/core.mjs";

export const UNIVERSAL_NAME="Городская встреча без исходников";
export function atlas06UniversalPortfolio(){
 const base=createProject(empty(),{name:UNIVERSAL_NAME,type:"other",goal:"Подготовить встречу"});
 const preparation=createStage(base.state,base.id,"Подготовка");
 const event=createStage(preparation.state,base.id,"Проведение");
 const room=createItem(event.state,base.id,
  {title:"Подготовить помещение",stageId:preparation.id});
 const agenda=createItem(room.state,base.id,
  {title:"Согласовать программу",stageId:preparation.id});
 const opening=createItem(agenda.state,base.id,
  {title:"Открыть площадку",stageId:event.id});
 const first=connect(opening.state,base.id,room.id,opening.id);
 const second=connect(first,base.id,agenda.id,opening.id);
 return second;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output||!output.toLowerCase().endsWith(".iwxa"))throw Error("Expected .iwxa output path");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const snapshot=atlas06UniversalPortfolio();
 const bytes=await buildIwxaPortfolio(snapshot,{now:"2026-11-10T09:00:00.000Z"});
 const decoded=await readIwxaPortfolio(bytes);
 if(serialize(decoded.snapshot)!==serialize(snapshot))throw Error("Universal fixture IWXA roundtrip mismatch");
 writeFileSync(output,bytes);
 process.stdout.write("ATLAS06_UNIVERSAL_FIXTURE_PASS projects=1 works=3 stages=2 sources=0 dependencies=2 bytes="+bytes.length+"\n");
}

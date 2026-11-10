// Synthetic UI qualification data only: never imported without the ordinary Atlas
// .iwxa preview and explicit approval. No fetched GitHub provenance is claimed.
// Node CLI: node tests/fixtures/atlas06-visual-portfolio.mjs <output.iwxa>
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validate,serialize} from "../../src/core.mjs";

const SHA="a".repeat(40),TREE="b".repeat(40);
const AT="2026-11-10T09:00:00.000Z";
export const LONG_FOLDER="integrations-"+("verylongunbrokendirectory".repeat(6));
export const LONG_WORK="Проверить"+"ОченьДлинноеНазваниеРаботыБезПробелов".repeat(10);
export const LONG_STAGE="Проверка этапа: "+("длинное название сложного этапа ".repeat(7));

export function atlas06VisualPortfolio(){
 const stages=Array.from({length:48},(_,i)=>({
  id:"visual-stage-"+i,
  name:i===0?LONG_STAGE:"Этап работ "+(i+1),
  status:"planned",dueDate:null
 }));
 const sources=[],items=[],dependencies=[];
 const perSource=[24,24,24,24,24,1080];
 for(let s=0;s<perSource.length;s++){
  const sourceId="visual-source-"+s;
  const repository="atlas-visual-fixture/project-"+s;
  const folders=[LONG_FOLDER,...Array.from({length:23},(_,i)=>
   "directory-"+String(i+1).padStart(2,"0"))];
  sources.push({id:sourceId,kind:"github",locator:repository,branch:"main",
   status:"ok",summary:{scope:"repository",repository,defaultBranch:"main",
    branches:["main"],branchHeads:{main:SHA},readiness:"not_assessed",
    complete:true,structure:{status:"observed",branch:"main",commitSha:SHA,
     treeSha:TREE,folders,totalFolders:folders.length,totalFiles:0,
     files:[],detected:[],truncated:false,limited:false}}
  });
  for(let i=0;i<perSource[s];i++){
   const id="visual-work-"+s+"-"+i;
   const stageIndex=i%stages.length;
   const sourcePath=folders[i%folders.length];
   items.push({id,
    title:s===5&&i===0?LONG_WORK:"Работа "+s+" / "+(i+1),
    state:"todo",stageId:stages[stageIndex].id,
    priority:"normal",assignee:"",dueDate:null,resourceId:null,
    allocationPct:100,executor:null,sourceId,sourcePath,sourceRevision:SHA,
    estimateDays:1,targetIds:[]});
   if(i>0&&i%4===0)dependencies.push({from:"visual-work-"+s+"-"+(i-1),to:id});
  }
 }
 // Explicit, synthetic predecessor links for the first long work.
 for(const index of [3,7,11,15,19]){
  dependencies.push({from:"visual-work-0-"+index,to:"visual-work-5-0"});
 }
 for(let i=0;i<12;i++){
  items.push({id:"visual-unlinked-"+i,title:"Без выбранного каталога "+i,
   state:"todo",stageId:null,priority:"normal",assignee:"",dueDate:null,
   resourceId:null,allocationPct:100,executor:null,sourceId:null,
   estimateDays:1,targetIds:[]});
 }
 const project={id:"atlas06-visual-project",name:"Контрольный большой проект",
  type:"engineering",goal:"Проверить отображение большой структуры и связей.",
  owner:"",status:"active",startDate:"2026-11-10",dueDate:"2027-02-01",
  budget:null,currency:"RUB",stages,items,dependencies,risks:[],decisions:[],
  sources,createdAt:AT,targets:[],findings:[],changes:[]};
 const snapshot={schema:"atlas.project/1",revision:0,projects:[project],portfolioLinks:[]};
 validate(snapshot);
 return snapshot;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output||!output.toLowerCase().endsWith(".iwxa"))throw Error("Expected .iwxa output path");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const snapshot=atlas06VisualPortfolio();
 const bytes=await buildIwxaPortfolio(snapshot,{now:AT});
 const loaded=await readIwxaPortfolio(bytes);
 if(serialize(loaded.snapshot)!==serialize(snapshot))throw Error("Synthetic .iwxa roundtrip mismatch");
 writeFileSync(output,bytes);
 process.stdout.write("ATLAS06_VISUAL_FIXTURE_IWXA_PASS projects=1 works="+
  snapshot.projects[0].items.length+" stages="+snapshot.projects[0].stages.length+
  " sources="+snapshot.projects[0].sources.length+" bytes="+bytes.length+"\n");
}

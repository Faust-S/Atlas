// Reproducible 0.2-R5 load portfolio for real GUI import and Node checks.
// Run: node tests/fixtures/desktop-portfolio-120.mjs > atlas-portfolio-120.json
// The JSON is a normal atlas.project/1 snapshot, not a separate test store.
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {validate,serialize} from "../../src/core.mjs";

export function desktopLoadPortfolio(){
 const state={schema:"atlas.project/1",revision:0,projects:[],portfolioLinks:[]};
 for(let i=0;i<120;i++){
  const items=Array.from({length:10},(_,j)=>({
   id:`load-work-${i}-${j}`,title:`Work ${i}-${j}`,state:"todo",stageId:null,
   priority:"normal",assignee:"",dueDate:null,resourceId:null,allocationPct:100,
   executor:null,sourceId:null,estimateDays:1,targetIds:[]
  }));
  const dependencies=Array.from({length:i<60?3:2},(_,j)=>({
   from:`load-work-${i}-${j}`,to:`load-work-${i}-${j+1}`
  }));
  const findings=Array.from({length:i<80?2:1},(_,j)=>({
   id:`load-finding-${i}-${j}`,targetId:`load-target-${i}`,result:"partial",level:"test",
   sourceId:null,ref:null,revision:null,observedAt:"2026-11-03T09:00:00.000Z",
   note:"Independent manual observation"
  }));
  const decisions=i<100?[{id:`load-decision-${i}`,text:"Human decision recorded",
   at:"2026-11-03T09:00:00.000Z"}]:[];
  state.projects.push({
   id:`load-project-${i}`,name:`Project ${i}`,type:"engineering",goal:"Manage delivery",
   owner:"",status:"active",startDate:"2026-11-03",dueDate:"2027-02-01",
   budget:null,currency:"USD",stages:[],items,dependencies,risks:[],decisions,sources:[],
   createdAt:"2026-11-03T09:00:00.000Z",targets:[{
    id:`load-target-${i}`,title:"Expected result",desired:"Verify delivery",intent:"committed"
   }],findings,changes:[]
  });
 }
 state.portfolioLinks=Array.from({length:40},(_,i)=>({
  id:`load-link-${i}`,from:`load-project-${i}`,to:`load-project-${i+1}`,
  kind:"blocks",note:"Portfolio dependency"
 }));
 validate(state);
 return state;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 process.stdout.write(serialize(desktopLoadPortfolio())+"\n");

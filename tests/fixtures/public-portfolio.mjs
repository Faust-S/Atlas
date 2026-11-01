// Reproducible public-source + synthetic domain portfolio fixture.
// No private users, IWXA repositories, secrets or claims of upstream release acceptance.
import inventory from "./public-repos-2026-11-02.json" with {type:"json"};
const stamp="2026-11-02T00:00:00.000Z";
export function makePublicPortfolio({projects=12,workPerProject=12,targetsPerProject=4}={}){
 if(!Number.isInteger(projects)||projects<1||projects>250||!Number.isInteger(workPerProject)||workPerProject<1||workPerProject>100||!Number.isInteger(targetsPerProject)||targetsPerProject<1||targetsPerProject>20)throw Error("Invalid fixture size");
 const result={schema:"atlas.project/1",revision:1,projects:[],portfolioLinks:[]};
 const testObservationAt=new Date().toISOString(); // Fixture measurement time; upstream SHA capture stays dated separately.
 for(let i=0;i<projects;i++){
  const r=inventory.repositories[i%inventory.repositories.length],id="public-"+String(i+1).padStart(3,"0");
  const sourceId=id+"-source";
  const known=i%5!==0;
  const src={id:sourceId,kind:"github",locator:r.fullName,status:known?"ok":"never",observedAt:testObservationAt,
   error:null,summary:known?{
    scope:"repository",repository:r.fullName,repositoryId:r.id,defaultBranch:r.defaultBranch,
    branches:[r.defaultBranch],branchHeads:{[r.defaultBranch]:r.defaultSha},
    complete:false,observedAt:stamp,
    provenance:{provider:"github",access:"public",endpoint:r.metadataUrl,authority:"GitHub REST API"},
    readiness:"not_assessed",
    notes:"Partial sampled public default branch only; NOT complete enumeration"
   }:null
  };
  const targets=Array.from({length:targetsPerProject},(_,n)=>({
   id:id+"-goal-"+n,title:"Synthetic outcome "+(n+1),desired:"Hypothetical public portfolio review "+(n+1),
   intent:n===targetsPerProject-1&&i%3===0?"candidate":"committed",priority:n===0?"high":"normal",
   createdAt:stamp,sourceNote:"SYNTHETIC — not a repository requirement"
  }));
  const items=Array.from({length:workPerProject},(_,n)=>({
   id:id+"-work-"+n,title:"Synthetic work "+(n+1),state:n===workPerProject-2&&i%7===0?"blocked":n%6===0?"done":"todo",
   stageId:id+"-stage",priority:n%4===0?"high":"normal",assignee:"Synthetic role",dueDate:null,
   executor:null,sourceId:null,estimateDays:1+n%4,targetIds:[targets[n%targets.length].id]
  }));
  const dependencies=items.slice(1).map((w,n)=>({from:items[n].id,to:w.id}));
  const findings=i%4===0?[]:[{
   id:id+"-finding",targetId:targets[0].id,result:i%5===1?"partial":"present",
   level:"test",sourceId:sourceId,ref:r.defaultBranch,revision:i%9===0?"0".repeat(40):r.defaultSha,
   reference:"https://github.com/"+r.fullName,observedAt:stamp,note:"SYNTHETIC claim for Atlas logic only",
   origin:"synthetic-fixture"
  }];
  const changes=i%6===0?[{
   id:id+"-change",title:"Synthetic scope revision",description:"Synthetic planned response",
   targetIds:[targets[0].id],status:"proposed",reference:null,createdAt:stamp
  }]:[];
  const p={
   id,name:"Public study "+(i+1)+" — "+r.fullName,type:i%4===0?"research":"engineering",
   goal:"Synthetic multi-project observation of public metadata; no accepted upstream result",
   owner:"Synthetic role",status:i%25===0?"paused":"active",
   startDate:"2026-11-01",dueDate:null,budget:null,currency:"USD",
   stages:[{id:id+"-stage",name:"Synthetic implementation",status:"planned",dueDate:null}],
   items,dependencies,risks:[],decisions:[],sources:[src],targets,findings,changes,createdAt:stamp
  };
  result.projects.push(p);
  if(i>0)result.portfolioLinks.push({id:"dependency-"+i,kind:"blocks",
   from:result.projects[i-1].id,to:id,note:"SYNTHETIC upstream dependency"});
 }
 return result;
}
export const publicInventory=inventory;

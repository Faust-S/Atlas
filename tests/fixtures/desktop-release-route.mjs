// Genuine 0.2 snapshot for installed user-flow qualification; not a product
// command, second datastore, or automatic planning authority.
import {empty,createProject,createItem,editItem,editProject,attach,observe,serialize} from "../../src/core.mjs";
import {addTarget,recordFinding} from "../../src/trace.mjs";
import {addPortfolioLink} from "../../src/portfolio.mjs";

const SHA_A="a".repeat(40),SHA_B="b".repeat(40);
const first=createProject(empty(),{name:"ATLAS_RELEASE_02_UPSTREAM",type:"engineering"});
const second=createProject(first.state,{name:"ATLAS_RELEASE_02_DOWNSTREAM",type:"engineering"});
let state=editProject(second.state,first.id,{startDate:"2026-11-01",dueDate:"2026-11-09"});
state=editProject(state,second.id,{startDate:"2026-11-02",dueDate:"2026-11-15"});
const firstWork=createItem(state,first.id,{title:"ATLAS_RELEASE_02_BUILD"});
state=editItem(firstWork.state,first.id,firstWork.id,{estimateDays:2});
const secondWork=createItem(state,second.id,{title:"ATLAS_RELEASE_02_VERIFY"});
state=editItem(secondWork.state,second.id,secondWork.id,{estimateDays:3});
state=addPortfolioLink(state,{from:first.id,to:second.id});
const target=addTarget(state,first.id,{title:"ATLAS_RELEASE_02_READBACK",desired:"Reliable restart after native commit"});
const source=attach(target.state,first.id,"github","openai/openai-node");
state=observe(source.state,first.id,source.id,"ok",{
 scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_A},readiness:"not_assessed"
});
const firstClaim=recordFinding(state,first.id,{targetId:target.id,result:"present",level:"test",
 sourceId:source.id,ref:"main",revision:SHA_A,note:"Earlier synthetic snapshot"});
state=observe(firstClaim.state,first.id,source.id,"ok",{
 scope:"repository",complete:true,branches:["main"],branchHeads:{main:SHA_B},readiness:"not_assessed"
});
process.stdout.write(serialize(state)+"\n");

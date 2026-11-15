// Source-only projection of an already confirmed original T3 D6 receipt.
// NOT a signer, permission decision, Exchange receipt or independent Store.
// The trusted owner must first confirm signed readback; only then may Atlas
// reconcile the result link from its ORIGINAL saved native portfolio.
import {atlasT3RecordedWorkLinks} from "./atlas-t3-native-recipient.mjs";

const OPERATION=/^atlas:t3:[0-9a-f]{64}$/;
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const PREFIX="atlas:decision:";
const fail=()=>{
 const error=new Error("ATLAS_T3_CONFIRMED_LINK_NOT_IN_NATIVE_HEAD");
 error.code="ATLAS_T3_CONFIRMED_LINK_NOT_IN_NATIVE_HEAD";
 throw error;
};
export function findConfirmedAtlasT3Decision(snapshot,{
 projectId,workId,operationId,resultRef
}={}){
 if(typeof projectId!=="string"||!ID.test(projectId)||
    typeof workId!=="string"||!ID.test(workId)||
    typeof operationId!=="string"||!OPERATION.test(operationId)||
    typeof resultRef!=="string"||!resultRef.startsWith(PREFIX)||
    !ID.test(resultRef.slice(PREFIX.length)))fail();
 if(!snapshot||!Array.isArray(snapshot.projects))fail();
 const projects=snapshot.projects.filter(project=>project.id===projectId);
 if(projects.length!==1)fail();
 const project=projects[0];
 if(!Array.isArray(project.items)||
    project.items.filter(item=>item.id===workId).length!==1)fail();
 const matches=(atlasT3RecordedWorkLinks(project).get(workId)||[])
  .filter(link=>link.decisionId===resultRef.slice(PREFIX.length)&&
   link.operationId===operationId);
 if(matches.length!==1)fail();
 const row=matches[0];
 return Object.freeze({
  projectId,workId,operationId,resultRef,
  decisionId:row.decisionId,taskId:row.taskId,resultId:row.resultId
 });
}

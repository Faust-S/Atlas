// Selection adapter between an ORIGINAL installed Agent owner and the
// ORIGINAL signed T3 D6 port. No own Kernel, signer, Store or Exchange;
// no user-supplied Object reference or implicit Result selection.
const ID=/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/;
const SOURCE_KEYS=["workspace_id","object_id","schema_id","revision"];
const fail=code=>{throw Object.assign(new Error(code),{code});};
function originalSource(selection,requested,strictRevision){
 if(!selection||selection.acceptanceKind!=="HUMAN_ACCEPTED_DRAFT"||
    selection.readOnly!==true)
  fail("ATLAS_T3_INSTALLED_ACCEPTED_SOURCE_REQUIRED");
 const work=selection.workRef,ref=selection.sourceObjectRef;
 if(!work||work.projectId!==requested.projectId||
    work.workId!==requested.workId||
    !/^(0|[1-9][0-9]*)$/.test(String(work.revision))||
    !Number.isSafeInteger(Number(work.revision))||
    (strictRevision&&String(work.revision)!==String(requested.revision)))
  fail("ATLAS_T3_INSTALLED_SOURCE_WORK_MISMATCH");
 if(!ref||!SOURCE_KEYS.slice(0,3).every(k=>ID.test(ref[k]))||
    !Number.isSafeInteger(ref.revision)||ref.revision<1)
  fail("ATLAS_T3_INSTALLED_SOURCE_REF_INVALID");
 return Object.freeze({workspace_id:ref.workspace_id,
  object_id:ref.object_id,schema_id:ref.schema_id,revision:ref.revision});
}
export function createAtlasT3OriginalSourceSelection({
 originalT3,originalAgent,isHostActive,
}={}){
 if(!["preview","continueSelected","recover"].every(k=>
   typeof originalT3?.[k]==="function")||
    typeof originalAgent?.selectAcceptedForWork!=="function"||
    typeof isHostActive!=="function")
  fail("ATLAS_T3_INSTALLED_SIGNED_SOURCE_OWNER_REQUIRED");
 const live=()=>{if(isHostActive()!==true)
  fail("ATLAS_T3_INSTALLED_HOST_DISPOSED");};
 const select=async(requested,context,strictRevision)=>{
  live();
  const selection=await originalAgent.selectAcceptedForWork({
   ...requested,context,purpose:strictRevision?"atlas.result.continue":
    "atlas.result.recover"});
  live();
  return originalSource(selection,requested,strictRevision);
 };
 return Object.freeze({
  async continueOriginalAcceptedResult({workRef,context}){
   const source=await select(workRef,context,true);
   live();
   const preview=await originalT3.preview(source);
   live();
   if(!preview||preview.recipientId!=="iwxa.atlas"||
      !SOURCE_KEYS.every(k=>preview.reference?.[k]===source[k]))
    fail("ATLAS_T3_INSTALLED_ORIGINAL_RECIPIENT_MISMATCH");
   if(preview.status==="OPERATION_IN_PROGRESS")
    return {status:"OPERATION_IN_PROGRESS"};
   if(preview.status==="RECOVER_ONLY")
    return {status:"OUTCOME_UNKNOWN"};
   if(preview.status!=="AVAILABLE")
    fail("ATLAS_T3_INSTALLED_ORIGINAL_D6_PREVIEW_INVALID");
   // After dispatch an original native Decision may already be durable.
   // If this Host closes while D6 is applying, do not report a definite
   // failure that might invite the user to send the Result a second time.
   let response;
   try{response=await originalT3.continueSelected(source);}
   catch(error){
    // Even a simultaneous Host shutdown cannot erase a signed / native
    // owner's explicit DENIED: the source owner already decided not to write.
    if(error?.outcome==="DENIED")throw error;
    if(isHostActive()!==true)
     fail("ATLAS_T3_INSTALLED_D6_OUTCOME_UNKNOWN");
    throw error; // Transport failure remains unclassified / recoverable.
   }
   if(isHostActive()!==true)
    fail("ATLAS_T3_INSTALLED_D6_OUTCOME_UNKNOWN");
   return response;
  },
  async recoverOriginalAcceptedResult({projectId,workId,context}){
   const source=await select({projectId,workId},context,false);
   live();
   const response=await originalT3.recover(source);
   live();
   return response;
  },
 });
}

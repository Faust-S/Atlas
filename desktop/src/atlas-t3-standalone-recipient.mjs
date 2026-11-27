// Standalone product composition. All cryptographic proof comes from the
// original SHA-pinned T3 Consumer bundled with the installed Atlas.
// Reuse the existing U05 native recipient, store and Human Review route.
import {invoke,isTauri} from "@tauri-apps/api/core";
import {toBase64} from "./iwxa-portfolio.mjs";
import {createInstalledAtlasT3SignedFileRecipient} from "./atlas-t3-installed-host.mjs";

const sameRef=(a,b)=>!!a&&!!b&&["workspace_id","object_id","schema_id","revision"]
 .every(k=>a[k]===b[k]);
const sameWork=(a,b)=>!!a&&!!b&&a.projectId===b.projectId&&a.workId===b.workId&&
 String(a.revision)===String(b.revision);
export async function openStandaloneAtlasSignedFileRoute({isActive=()=>true}={}){
 if(!isTauri()||isActive()!==true)return null;
 const cap=await invoke("atlas_t3_capabilities");
 if(cap?.available!==true)return null;
 if(cap.recipientId!=="iwxa.atlas"||cap.sameWindowsAccount!==true)
  throw Error("ATLAS_T3_ORIGINAL_CAPABILITY_INVALID");
 const active=()=>isTauri()&&isActive()===true;
 const readVerifiedArchive=archiveSha256=>invoke("atlas_t3_readback",{archiveSha256});
 const originalSignedRecipient={
  quarantineSignedArchive:archive=>invoke("atlas_t3_inspect",{
    archiveBase64:toBase64(archive)}),
  readVerifiedArchive
 };
 const recipient=await createInstalledAtlasT3SignedFileRecipient({
  originalSignedRecipient,
  hostLifecycle:{isActive:active},
  atlasAuthority:{
   // Native standalone Atlas already owns its local U05 read/write. The
   // additional T3 publication right is independently checked below.
   authorizeCommand:async command=>active()&&["atlas_open","atlas_commit"].includes(command),
   verifyWrite:async input=>{
    const proof=await readVerifiedArchive(input.archiveSha256);
    const saved=await invoke("atlas_open");
    const work=input.workRef;
    const allowed=active()&&proof?.status==="ORIGINAL_SIGNED_SELECTED_RESULT_VERIFIED"&&
     proof.signatureVerified===true&&proof.recipientGrantVerified===true&&
     proof.recipientId==="iwxa.atlas"&&proof.archiveSha256===input.archiveSha256&&
     proof.taskId===input.taskId&&proof.resultId===input.resultId&&
     sameRef(proof.sourceObjectRef,input.sourceObjectRef)&&sameWork(proof.workRef,work)&&
     saved?.needsConfirmation===false&&saved.generation!=="none"&&
     saved.snapshot?.projects?.find(p=>p.id===work.projectId)?.items?.some(w=>w.id===work.workId)===true;
    return {allowed,operationId:input.operationId,recipientId:"iwxa.atlas",
     projectId:work.projectId,workId:work.workId,revision:work.revision};
   }
  }
 });
 if(!active())return null;
 return Object.freeze({
  inspectSignedFile:input=>recipient.inspectArchive(input),
  receiveSignedFile:input=>recipient.receiveArchive(input),
  readbackSignedFile:operationId=>recipient.readback(operationId)
 });
}

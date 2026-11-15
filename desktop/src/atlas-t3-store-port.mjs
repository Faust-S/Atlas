// Original Atlas U05 desktop Store, exposed only to a trusted embedded Host.
// Reuses the EXISTING Tauri commands atlas_open / atlas_commit and the same
// native head, generation CAS and recovery. Not a second storage authority.
import {deserialize,serialize} from "../../src/core.mjs";

const fail=code=>{throw Object.assign(new Error(code),{code});};
export function createAtlasT3DesktopStorePort({invoke,authorizeCommand}={}){
 if(typeof invoke!=="function"||typeof authorizeCommand!=="function")
  fail("ATLAS_T3_U05_TRUSTED_HOST_REQUIRED");
 const checked=(data)=>{
  // deserialize is the original Atlas schema validator, not a T3 clone.
  try{return deserialize(serialize(data));}
  catch{fail("ATLAS_T3_U05_SNAPSHOT_INVALID");}
 };
 const open=async()=>{
  if(await authorizeCommand("atlas_open")!==true)
   fail("ATLAS_T3_U05_READ_DENIED");
  const result=await invoke("atlas_open");
  if(!result||typeof result.generation!=="string"||
     result.generation==="none"||result.needsConfirmation===true)
   fail("ATLAS_T3_U05_SAVED_HEAD_REQUIRED");
  return {generation:result.generation,snapshot:checked(result.snapshot),
   needs_confirmation:false};
 };
 const commit=async(expectedGeneration,snapshot)=>{
  if(typeof expectedGeneration!=="string"||
     expectedGeneration==="none"||!expectedGeneration.trim())
   fail("ATLAS_T3_U05_GENERATION_REQUIRED");
  const next=checked(snapshot);
  // Original native atlas_commit handles writer lock, optimistic generation
  // match and atomic revision bump. Never resend on a lost acknowledgement.
  const args={expectedGeneration,snapshot:next};
  if(await authorizeCommand("atlas_commit",args)!==true)
   fail("ATLAS_T3_U05_WRITE_DENIED");
  return await invoke("atlas_commit",args);
 };
 return Object.freeze({readSaved:open,commitSaved:commit});
}

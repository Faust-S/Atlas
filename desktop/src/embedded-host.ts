// The consuming host owns the native Atlas command gateway, authorization and
// U04 mounting. This is an adapter boundary, not a second store or Task runtime.
export type AtlasHostCommand=
 "atlas_open"|"atlas_commit"|"atlas_export_json"|"atlas_select_import"|
 "atlas_list_history"|"atlas_restore_history"|"atlas_restore_previous";
export type AtlasHostArgs=Record<string,unknown>;
export const ATLAS_HOST_COMMANDS:ReadonlySet<string>=new Set<AtlasHostCommand>([
 "atlas_open","atlas_commit","atlas_export_json","atlas_select_import",
 "atlas_list_history","atlas_restore_history","atlas_restore_previous"
]);
export interface AtlasT3SelectedTaskRoute {
 // Supplied only by the trusted installed T3/Agent owner. No UI-selected
 // identity, licence-as-grant or independent local Task creation.
 issueSelectedWork:(selection:{projectId:string;workId:string})=>
  Promise<{taskId:string;workRef:{projectId:string;workId:string;revision:string}}>;
}
export interface AtlasT3PublicationRoute {
 // Explicit publication by the ORIGINAL Agent/T3 owner. This operation
 // does not commit Atlas and requires a separate original Human consent.
 publishSelectedResult:(selection:{projectId:string;workId:string})=>
  Promise<{status:"OWNER_READBACK_CONFIRMED"|"OUTCOME_UNKNOWN"|
   "NOT_PUBLISHED_CONFIRMED"|"OPERATION_IN_PROGRESS";
   workRef:{projectId:string;workId:string;revision:string};
   operationId?:string}>;
}
export interface AtlasT3PublicationRecoveryRoute {
 // Read original publication ledger only. Never redispatch publisher.
 recoverSelectedPublication:(selection:{projectId:string;workId:string})=>
  Promise<{status:"OWNER_READBACK_CONFIRMED"|"OUTCOME_UNKNOWN"|
   "NOT_PUBLISHED_CONFIRMED"|"OPERATION_IN_PROGRESS";
   workRef:{projectId:string;workId:string;revision:string};
   operationId?:string}>;
}
export interface AtlasT3SelectedResultRoute {
 // Only the original D6 Host provides this route, not the Atlas UI.
 continueSelectedResult:(selection:{projectId:string;workId:string})=>
  Promise<{status:"OWNER_READBACK_CONFIRMED"|"USER_CANCELLED"|
   "OUTCOME_UNKNOWN"|"OPERATION_IN_PROGRESS";
   workRef:{projectId:string;workId:string;revision:string};
   operationId?:string;resultRef?:string}>;
}
export interface AtlasT3RecoveryRoute {
 // Read-only original D6 recover for an Agent Result already selected by
 // its owner. The Result WorkRef may predate a committed Atlas Decision.
 recoverSelectedResult:(selection:{projectId:string;workId:string})=>
  Promise<{status:"OWNER_READBACK_CONFIRMED"|"OUTCOME_UNKNOWN"|
   "OPERATION_IN_PROGRESS";
   workRef:{projectId:string;workId:string;revision:string};
   operationId?:string;resultRef?:string}>;
}
/** Genuine signed .iwxa delivered to an INDEPENDENT Atlas.
 * Only the installed ORIGINAL T3 recipient supplies this route after it
 * checked Ed25519, selected Result, current grant and its Reconciliation
 * quarantine. The Atlas UI provides a file, never an identity or signer.
 * It cannot replay native U05 writes after a lost acknowledgement.
 */
export interface AtlasT3SignedFilePreview {
 status:"SIGNED_FILE_READY";
 sourceKind?:"AGENT_ACCEPTED_RESULT"|"ADMIN_APPLIED_RESULT"|"ADMIN_WORKSPACE_RESULT";
 recipientId:"iwxa.atlas";
 operationId:string;
 workRef:{projectId:string;workId:string;revision:string};
 archiveSha256:string;selectedSummarySha256:string;
 selectedAcceptedSummary:string;
 originalKernelEventVerified:false;alreadyReceived:boolean;
 // Optional standalone corporate history capability. Local only.
 reviewedGeneration?:string;currentRevision?:string;
 issuedProjectName?:string;issuedWorkTitle?:string;
}
export interface AtlasT3SignedFileReceipt {
 state:"SIGNED_FILE_COMMITTED"|"SIGNED_FILE_PERSISTED";
 recipientId:"iwxa.atlas";operationId:string;
 resultRef:string;originalKernelEventVerified:false;
}
export interface AtlasT3SignedFileRoute {
 inspectSignedFile:(input:{archive:Uint8Array;recipientId:"iwxa.atlas"})=>
  Promise<AtlasT3SignedFilePreview>;
 receiveSignedFile:(input:{archive:Uint8Array;recipientId:"iwxa.atlas";
  operationId:string;archiveSha256:string;selectedSummarySha256:string;
  reviewedGeneration?:string;confirmed:true})=>Promise<void>;
 readbackSignedFile:(operationId:string)=>
  Promise<AtlasT3SignedFileReceipt|null>;
}

export interface AtlasEmbeddedHost {
 invoke:<T>(command:AtlasHostCommand,args?:AtlasHostArgs)=>Promise<T>;
 authorizeCommand:(command:AtlasHostCommand,args?:AtlasHostArgs)=>
  Promise<boolean|null|undefined>|boolean|null|undefined;
 t3?:Partial<AtlasT3SelectedTaskRoute&AtlasT3PublicationRoute&
  AtlasT3PublicationRecoveryRoute&AtlasT3SelectedResultRoute&AtlasT3RecoveryRoute&
  AtlasT3SignedFileRoute>;
 // Optional original owner routes are absent in the standalone product.
 assetUrl?:string; // Host-served Atlas logo; standalone keeps its existing public asset
 onStateChange?:(value:{ready:boolean;dirty:boolean;formOpen:boolean;busy:boolean;revision:string;generation:string})=>void;
 onSelection?:(ref:{projectId:string|null;workId:string|null;revision:string})=>void;
 onReadback?:(result:{generation:string;revision:string;projectId:string|null;dirty:boolean})=>void;
}
export function isAtlasEmbeddedHost(value:unknown):value is AtlasEmbeddedHost {
 const h=value as Partial<AtlasEmbeddedHost>|null;
 return typeof h==="object"&&h!==null&&typeof h.invoke==="function"&&
  typeof h.authorizeCommand==="function";
}
export async function invokeAtlasHost<T>(host:AtlasEmbeddedHost,command:string,args?:AtlasHostArgs):Promise<T>{
 if(!isAtlasEmbeddedHost(host))throw Error("ATLAS_HOST_REQUIRED");
 if(!ATLAS_HOST_COMMANDS.has(command))throw Error("ATLAS_HOST_COMMAND_UNSUPPORTED");
 const selected=command as AtlasHostCommand;
 const permission=await host.authorizeCommand(selected,args);
 if(permission===false)
  throw Object.assign(Error("ATLAS_HOST_OPERATION_DENIED"),
   {code:"ATLAS_HOST_OPERATION_DENIED",outcome:"DENIED"});
 if(permission!==true)
  throw Object.assign(Error("ATLAS_HOST_OPERATION_NOT_AUTHORIZED"),
   {code:"ATLAS_HOST_OPERATION_NOT_AUTHORIZED"});
 return host.invoke<T>(selected,args);
}

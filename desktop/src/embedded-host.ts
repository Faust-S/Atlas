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
export interface AtlasEmbeddedHost {
 invoke:<T>(command:AtlasHostCommand,args?:AtlasHostArgs)=>Promise<T>;
 authorizeCommand:(command:AtlasHostCommand,args?:AtlasHostArgs)=>Promise<boolean>|boolean;
 t3?:Partial<AtlasT3SelectedTaskRoute&AtlasT3SelectedResultRoute&AtlasT3RecoveryRoute>;
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
 if(await host.authorizeCommand(selected,args)!==true)throw Error("ATLAS_HOST_OPERATION_DENIED");
 return host.invoke<T>(selected,args);
}

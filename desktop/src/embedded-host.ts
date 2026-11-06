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
export interface AtlasEmbeddedHost {
 invoke:<T>(command:AtlasHostCommand,args?:AtlasHostArgs)=>Promise<T>;
 authorizeCommand:(command:AtlasHostCommand,args?:AtlasHostArgs)=>Promise<boolean>|boolean;
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

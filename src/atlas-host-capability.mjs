// Atlas owns project data and its React UI. U03 describes compatibility only;
// U04 owns launching, focusing and external-window presentation.
export const ATLAS_U03_DESCRIPTOR=Object.freeze({
 schema:"IWXA_MODULE_DESCRIPTOR/1.0.0",
 id:"iwxa.atlas",version:"0.3.0",
 provides:[
  {id:"atlas.project.read",version:"1.0.0"},
  {id:"atlas.project.revision",version:"1.0.0"},
  {id:"atlas.project.ui.react",version:"0.3.0"}
 ],
 requires:[],
 hostCompatibility:[
  {hostId:"iwxa.atlas",range:">=0.3.0"},
  {hostId:"iwxa.personal-agent",range:">=0.3.0"}
 ]
});
const support=(mode,supported,reason)=>({mode,supported,...(supported?{}:{reason})});
// Only official React mounting in the owning host can qualify EMBEDDED_VIEW.
// This says nothing about embedding a foreign OS window (I3/I4 of U04).
export function atlasU04Presentation({reactMountAvailable=false}={}){
 return Object.freeze({
  schema:"IWXA_PRESENTATION_BRIDGE/1.0.0",
  capabilities:[
   support("LAUNCH",false,"U04_NATIVE_HOST_ADAPTER_REQUIRED"),
   support("FOCUS",false,"U04_NATIVE_HOST_ADAPTER_REQUIRED"),
   support("LINKED_WINDOW",false,"U04_NATIVE_WINDOW_ADAPTER_REQUIRED"),
   support("EMBEDDED_VIEW",reactMountAvailable===true,"REACT_HOST_MOUNT_NOT_PROVIDED")
  ]
 });
}
export function atlasU03CapabilityStatus({mounted=false,hostAuthorized=false,observationRef}={}){
 const ready=mounted===true&&hostAuthorized===true&&
  typeof observationRef==="string"&&observationRef.trim().length>0;
 return Object.freeze({
  schema:"IWXA_CAPABILITY_STATUS/1.0.0",id:"atlas.project.ui.react",
  version:"0.3.0",available:ready,
  ...(ready?{observationRef}:{reason:mounted?"HOST_AUTHORIZATION_REQUIRED":"HOST_REACT_SURFACE_NOT_MOUNTED"})
 });
}

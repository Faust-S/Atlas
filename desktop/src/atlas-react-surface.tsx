// The full Atlas UI is rendered inside the host's central React surface.
// U04 owns lifecycle and the consuming Agent supplies an approved Atlas port.
import React from "react";
import {createRoot,type Root} from "react-dom/client";
import {AtlasRenderBoundary,AtlasWorkspace} from "./main";
import {isAtlasEmbeddedHost,type AtlasEmbeddedHost} from "./embedded-host";
import css from "./style.css?inline";
// A ShadowRoot persists after unmount. Reuse only the one created by Atlas;
 // an unrelated host's existing shadow surface must remain untouched.
const ownedTargets=new WeakSet<HTMLElement>();
const activeTargets=new WeakSet<HTMLElement>();
export function mountAtlasSurface(target:HTMLElement,host:AtlasEmbeddedHost):()=>void {
 if(!isAtlasEmbeddedHost(host))throw Error("ATLAS_EMBEDDED_HOST_REQUIRED");
 if(activeTargets.has(target))throw Error("ATLAS_SURFACE_ALREADY_MOUNTED");
 if(target.shadowRoot&&!ownedTargets.has(target))
  throw Error("ATLAS_SURFACE_TARGET_OWNED_BY_HOST");
 if(!target.shadowRoot&&target.childElementCount>0)
  throw Error("ATLAS_SURFACE_TARGET_NOT_EMPTY");
 const shadow=target.shadowRoot??target.attachShadow({mode:"open"});
 ownedTargets.add(target);
 const style=document.createElement("style");
 style.textContent=css;shadow.append(style);
 const region=document.createElement("div");
 region.className="atlas-host-root";shadow.append(region);
 const root:Root=createRoot(region);
 activeTargets.add(target);
 root.render(<AtlasRenderBoundary logoUrl={host.assetUrl}><AtlasWorkspace host={host}/></AtlasRenderBoundary>);
 let detached=false;
 return ()=>{
  if(detached)return;
  detached=true;
  root.unmount();region.remove();style.remove();activeTargets.delete(target);
 };
}

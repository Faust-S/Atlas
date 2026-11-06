// The full Atlas UI is rendered inside the host's central React surface.
// U04 owns lifecycle and the consuming Agent supplies an approved Atlas port.
import React from "react";
import {createRoot,type Root} from "react-dom/client";
import {AtlasRenderBoundary,AtlasWorkspace} from "./main";
import {isAtlasEmbeddedHost,type AtlasEmbeddedHost} from "./embedded-host";
import css from "./style.css?inline";
export function mountAtlasSurface(target:HTMLElement,host:AtlasEmbeddedHost):()=>void {
 if(!isAtlasEmbeddedHost(host))throw Error("ATLAS_EMBEDDED_HOST_REQUIRED");
 if(target.shadowRoot)throw Error("ATLAS_SURFACE_ALREADY_MOUNTED");
 const shadow=target.attachShadow({mode:"open"});
 const style=document.createElement("style");
 style.textContent=css;shadow.append(style);
 const region=document.createElement("div");
 region.className="atlas-host-root";shadow.append(region);
 const root:Root=createRoot(region);
 root.render(<AtlasRenderBoundary logoUrl={host.assetUrl}><AtlasWorkspace host={host}/></AtlasRenderBoundary>);
 return ()=>{root.unmount();region.remove();style.remove();};
}

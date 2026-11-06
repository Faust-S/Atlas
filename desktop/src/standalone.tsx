// Standalone Atlas owns its native Tauri window; the host-mounted version
// imports AtlasWorkspace without creating another React or native root.
import React from "react";
import {createRoot} from "react-dom/client";
import {AtlasRenderBoundary,AtlasWorkspace} from "./main";
import "./style.css";
const root=document.getElementById("root");
if(!root)throw Error("ATLAS_STANDALONE_ROOT_MISSING");
createRoot(root).render(<AtlasRenderBoundary><AtlasWorkspace/></AtlasRenderBoundary>);

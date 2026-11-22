// Pure presentation-only constraints for the original one-window Atlas.
 // At compact width keep the Gantt/table usable beside the inspector.
 // The editor may take more room for its fields, but never overlays Workspace.
/**
 * @param {number} viewport
 * @param {boolean} [editing]
 */
export function atlasInspectorMaxWidth(viewport,editing=false){
 if(!Number.isFinite(viewport)||viewport<=0)throw Error("Invalid Atlas viewport");
 const margin=editing?380:520;
 const minimum=editing?300:270;
 return Math.max(minimum,Math.min(760,Math.floor(viewport)-margin));
}
/**
 * @param {number} preferred
 * @param {number} viewport
 * @param {boolean} [editing]
 */
export function atlasInspectorDisplayedWidth(preferred,viewport,editing=false){
 const limit=atlasInspectorMaxWidth(viewport,editing);
 const chosen=Number.isFinite(preferred)?Math.round(preferred):390;
 return Math.max(editing?300:270,Math.min(limit,chosen));
}
/**
 * @param {number} currentDisplayed
 * @param {number} viewport
 * @param {number} delta
 * @param {boolean} [editing]
 */
export function atlasInspectorResize(currentDisplayed,viewport,delta,editing=false){
 if(!Number.isFinite(delta))throw Error("Invalid Atlas inspector resize");
 return atlasInspectorDisplayedWidth(currentDisplayed+delta,viewport,editing);
}

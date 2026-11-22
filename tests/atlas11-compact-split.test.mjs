import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {atlasInspectorMaxWidth,atlasInspectorDisplayedWidth,atlasInspectorResize}
 from "../src/desktop-inspector-layout.mjs";

test("Atlas 0.11 inspector stays beside a usable Gantt at compact native widths",()=>{
 assert.equal(atlasInspectorMaxWidth(820),300);
 assert.equal(atlasInspectorDisplayedWidth(390,820),300);
 assert.equal(atlasInspectorDisplayedWidth(390,760),270);
 assert.equal(atlasInspectorDisplayedWidth(390,1024),390);
 assert.equal(atlasInspectorDisplayedWidth(390,1320),390);
 assert.equal(atlasInspectorDisplayedWidth(760,820),300);
 assert.equal(atlasInspectorDisplayedWidth(270,820),270);
 assert.equal(atlasInspectorDisplayedWidth(390,820,true),390,
  "Open Work editor gets enough width for its fields");
 assert.equal(atlasInspectorDisplayedWidth(760,820,true),440);
 assert.ok(820-60-atlasInspectorDisplayedWidth(390,820)>=450,
  "Compact 820x650 Gantt must retain a useful center width");
 assert.ok(760-60-atlasInspectorDisplayedWidth(390,760)>=420,
  "Minimum Tauri viewport must keep a usable workspace");
});
test("Atlas 0.11 resizes inspector immediately by pointer and keyboard, with valid a11y bounds",()=>{
 assert.equal(atlasInspectorResize(300,820,-20),280);
 assert.equal(atlasInspectorResize(280,820,20),300);
 assert.equal(atlasInspectorResize(300,820,20),300);
 assert.equal(atlasInspectorResize(270,820,-20),270);
 assert.equal(atlasInspectorResize(390,1024,-20),370);
 assert.equal(atlasInspectorResize(390,820,-20,true),370);
 assert.throws(()=>atlasInspectorMaxWidth(NaN),/Invalid Atlas viewport/);
 assert.throws(()=>atlasInspectorResize(300,820,NaN),/Invalid Atlas inspector resize/);
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(main,/--atlas-v6-dock-width":inspectorDockWidth\+"px"/);
 assert.match(main,/aria-valuemax=\{inspectorMaxWidth\} aria-valuenow=\{inspectorDockWidth\}/);
 assert.match(main,/const start=event.clientX,initial=inspectorDockWidth/);
 assert.match(main,/atlasInspectorResize\(initial,viewportWidth/);
 assert.match(css,/\.app-shell\.atlas-v6-shell \.inspector\{[\s\S]*?min-width:270px/);
});

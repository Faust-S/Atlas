import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
test("R3 tracks changed fields and asks before discarding unsaved form input",()=>{
 assert.match(ui,/onDirtyChange\(false\)/);
 assert.match(ui,/onDirtyChange\(editor\.spec\.fields\.some/);
 assert.match(ui,/if\(!editorDirtyRef\.current\)\{\s*setEditor\(null\);\s*if\(embedded\|\|window\.innerWidth<=1220\)setInspector\(false\);\s*return true;/);
 assert.match(ui,/if\(editorDirtyRef\.current&&!confirmAction\("Отказаться от введённых изменений формы\?"\)\)return/);
 assert.match(ui,/if\(event\.key==="Escape"&&editorOpenRef\.current\)\{event\.preventDefault\(\);cancelEditor\(\);return\}/);
 assert.match(ui,/onCancel=\{cancelEditor\} onDirtyChange=/);
});

test("R3 compact inspector releases Save after form completion or cancellation",()=>{
 const submit=ui.slice(ui.indexOf(" const submit=(event:React.FormEvent<HTMLFormElement>)=>"),ui.indexOf(" const save=async()"));
 assert.match(submit,/editorDirtyRef\.current=false;setEditor\(null\);\s*if\(embedded\|\|window\.innerWidth<=1220\)setInspector\(false\)/);
 const cancel=ui.slice(ui.indexOf(" const cancelEditor=()=>"),ui.indexOf(" const submit="));
 assert.match(cancel,/if\(embedded\|\|window\.innerWidth<=1220\)setInspector\(false\)/);
});

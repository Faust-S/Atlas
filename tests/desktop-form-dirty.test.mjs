import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
test("R3 tracks changed fields and asks before discarding unsaved form input",()=>{
 assert.match(ui,/onDirtyChange\(false\)/);
 assert.match(ui,/onDirtyChange\(editor\.spec\.fields\.some/);
 assert.match(ui,/if\(!editorDirtyRef\.current\)\{setEditor\(null\);return true;\}/);
 assert.match(ui,/if\(editorDirtyRef\.current&&!confirmAction\("Отказаться от введённых изменений формы\?"\)\)return/);
 assert.match(ui,/if\(event\.key==="Escape"\)\{event\.preventDefault\(\);cancelEditor\(\);return\}/);
 assert.match(ui,/onCancel=\{cancelEditor\} onDirtyChange=/);
});

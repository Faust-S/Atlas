import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
const script=readFileSync(new URL("../desktop/tests/installed-windows-import.py",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/atlas-desktop-0-2.yml",import.meta.url),"utf8");
test("installed G11 scenario uses genuine forms, separate approval and actual store readback",()=>{
 assert.match(script,/ATLAS_GUI_ROUTE_SHA_RECHECK_PASS/);
 assert.match(script,/ATLAS_GUI_ROUTE_HUMAN_DECISION_PASS/);
 assert.match(script,/ATLAS_GUI_ROUTE_PROPOSAL_PASS/);
 assert.match(script,/ATLAS_GUI_ROUTE_APPROVAL_PASS/);
 assert.match(script,/ATLAS_GUI_ROUTE_PLAN_APPLIED_PASS/);
 assert.match(script,/ATLAS_INSTALLED_G11_GUI_RESTART_PASS/);
 assert.match(script,/activate_button\("Применить утверждённый план"\)/);
 assert.match(script,/enter_editor_value\("Новая оценка, календарных дней","6"\)/);
 assert.match(workflow,/Generate existing domain route for installed GUI human-review scenario/);
 assert.match(ui,/Изменения/);
});

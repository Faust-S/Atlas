import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const script=readFileSync(new URL("../desktop/tests/installed-atlas05-github.py",import.meta.url),"utf8");
const workflow=readFileSync(new URL("../.github/workflows/atlas-0-2-1-branding.yml",import.meta.url),"utf8");

test("installed GitHub acceptance uses real native GUI, remote public receipt and saved Atlas store",()=>{
 assert.match(script,/Desktop\(backend="uia"\)/);
 assert.match(script,/Проверить код и сборку/);
 assert.match(script,/Ветка GitHub для проверок/);
 assert.match(script,/urllib\.request\.urlopen\(request, timeout=30\)/);
 assert.match(script,/STORE \/ "head\.json"/);
 assert.match(script,/source\["summary"\]/);
 assert.match(script,/ATLAS05_GITHUB_RESTART_READBACK_PASS/);
 assert.doesNotMatch(script,/CDP|chromium\.launch|fake_fetch|write_text\(/i);
 assert.match(workflow,/Exercise installed Atlas 0\.5 GitHub Actions selected-branch roundtrip/);
 assert.match(workflow,/python desktop\/tests\/installed-atlas05-github\.py/);
});

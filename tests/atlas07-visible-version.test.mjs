import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("Atlas displayed version follows the packaged standalone version, not the previous 0.6 release",()=>{
 const pkg=JSON.parse(read("../desktop/package.json"));
 const tauri=JSON.parse(read("../desktop/src-tauri/tauri.conf.json"));
 const ui=read("../desktop/src/main.tsx");
 assert.equal(pkg.version,tauri.version);
 assert.match(ui,/import atlasPackage from "\.\.\/package\.json"/);
 assert.match(ui,/const atlasVersionLabel=atlasPackage\.version\.split\("-"\)\[0\]\+/);
 assert.match(ui,/atlasPackage\.version\.includes\("-"\)\?" \(разработка\)":""/);
 assert.match(ui,/<h1>IWXA Atlas <em>\{atlasVersionLabel\}<\/em><\/h1>/);
 assert.match(ui,/<strong>Atlas<\/strong><small>IWXA · \{atlasVersionLabel\}<\/small>/);
 assert.match(ui,/<footer className="workspace-footer"><span>IWXA Atlas \{atlasVersionLabel\}/);
 assert.doesNotMatch(ui,/0\.6\.0-dev\.1|IWXA Atlas 0\.6 · проекты хранятся/);
});
test("Catalog results announce a real accessibility group and Windows checks visible folder text",()=>{
 const ui=read("../desktop/src/ProjectVisuals.tsx");
 const driver=read("../desktop/tests/installed-atlas07-hidden-source-search.py");
 assert.match(ui,/role="group" aria-label="Найденные каталоги исходников"/);
 assert.match(driver,/d\.wait_text\("atlas-visual-fixture\/project-0 \/ directory-01",20\)/);
});

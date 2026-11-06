import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../desktop/src/",import.meta.url);
const file=p=>readFileSync(new URL(p,base),"utf8");
const main=file("main.tsx"),standalone=file("standalone.tsx"),surface=file("atlas-react-surface.tsx"),css=file("style.css");
const html=readFileSync(new URL("../desktop/index.html",import.meta.url),"utf8");
test("existing full UI remains one React workspace mounted by native or host entry",()=>{
 assert.match(main,/export function AtlasWorkspace\(/);
 assert.match(standalone,/createRoot\(root\)\.render\(<AtlasRenderBoundary><AtlasWorkspace\/>/);
 assert.match(html,/src="\/src\/standalone\.tsx"/);
 assert.doesNotMatch(main,/createRoot\(/);
 for(const screen of ['"overview"','"work"','"board"','"timeline"','"graph"','"reality"','"changes"','"resources"','"history"','"sources"'])
  assert.ok(main.includes(screen),screen);
});
test("host uses isolated CSS and cannot mutate host window title or close it",()=>{
 assert.match(surface,/attachShadow\(\{mode:"open"\}\)/);
 assert.match(surface,/style\.css\?inline/);
 assert.doesNotMatch(main,/import "\.\/style\.css"/);
 assert.match(main,/if\(embedded\)return;/);
 assert.match(main,/if\(!native\|\|!ready\|\|embedded\)return;/);
 assert.match(main,/if\(embedded\)\{issue\(Error\("Закрытие встроенной поверхности/);
 assert.match(css,/\.atlas-host-root \.app-shell\.atlas-embedded/);
});

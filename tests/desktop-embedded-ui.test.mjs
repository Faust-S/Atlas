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

test("host supplies Atlas logo asset URL without changing standalone branding",()=>{
 assert.match(main,/const logoUrl=host\?\.assetUrl\?\?"\/atlas-mark\.svg"/);
 assert.equal((main.match(/src=\{logoUrl\}/g)||[]).length,2);
 assert.match(surface,/AtlasRenderBoundary logoUrl=\{host\.assetUrl\}/);
});

test("embedded keyboard events are scoped to the Atlas Shadow DOM; Agent shortcuts remain outside",()=>{
 assert.match(main,/event\.composedPath\(\)\.includes\(rootRef\.current\)/);
 assert.match(main,/rootRef\.current\?\.querySelector<HTMLInputElement>\("#atlas-search"\)/);
 assert.match(main,/useState\(\(\)=>!host&&window\.innerWidth>1220\)/);
});
test("same host surface can remount without overriding a foreign ShadowRoot",()=>{
 assert.match(surface,/ownedTargets=new WeakSet<HTMLElement>/);
 assert.match(surface,/activeTargets=new WeakSet<HTMLElement>/);
 assert.match(surface,/target\.shadowRoot&&!ownedTargets\.has\(target\)/);
 assert.match(surface,/if\(detached\)return;/);
 assert.match(main,/host\?\.onStateChange\?\./);
 assert.match(css,/@container atlas-panel \(max-width: 650px\)/);
});

test("portfolio attention and project next step navigate in existing views without automatic execution",()=>{
 assert.match(main,/projectNextStep\(project,impact\)/);
 assert.match(main,/onClick=\{\(\)=>openProjectTab\(p\.id,"reality"\)\}/);
 assert.match(main,/onClick=\{\(\)=>openProjectTab\(p\.id,"sources"\)\}/);
 assert.match(main,/nextStep\.action\?openEditor\(nextStep\.action\):view\(nextStep\.tab as Tab\)/);
 assert.match(main,/Факты и решения автоматически не изменяются/);
 assert.match(css,/\.atlas-next-step/);
});

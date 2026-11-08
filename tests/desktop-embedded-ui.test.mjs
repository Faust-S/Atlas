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
 assert.match(main,/Требования не заданы/);
 assert.match(main,/onClick=\{\(\)=>openProjectTab\(p\.id,"overview"\)\}/);
 assert.match(main,/onClick=\{\(\)=>openProjectTab\(p\.id,"reality"\)\}/);
 assert.match(main,/onClick=\{\(\)=>openProjectTab\(p\.id,"sources"\)\}/);
 assert.match(main,/nextStep\.action\?openEditor\(nextStep\.action\):view\(nextStep\.tab as Tab\)/);
 assert.match(main,/Факты и решения автоматически не изменяются/);
 assert.match(css,/\.atlas-next-step/);
});

test("secondary file operations are grouped without losing existing native guards",()=>{
 assert.match(main,/<details ref=\{fileMenuRef\} className="atlas-file-menu"/);
 assert.match(main,/<summary>Файлы и версии<\/summary>/);
 assert.match(main,/disabled=\{busy\|\|!!editor\|\|pendingImport!==null\}>Открыть JSON/);
 assert.match(main,/disabled=\{busy\|\|dirty\|\|!!editor\|\|!persisted\}>Резервная копия/);
 assert.match(main,/disabled=\{busy\|\|dirty\|\|!!editor\|\|!persisted\|\|savedVersions!==null\}>Версии на диске/);
 assert.match(main,/fileMenuRef\.current\?\.removeAttribute\("open"\)/);
 assert.match(css,/@media\(min-width:761px\) and \(max-width:1220px\)/);
 assert.match(css,/\.atlas-file-menu-actions\{position:absolute/);
});

test("overview presents the same Atlas facts, evidence provenance, linked decisions and paging",()=>{
 assert.match(main,/realityOverview\(project,reality,impact\)/);
 assert.match(main,/aria-label="Сопоставление цели, фактов и решений"/);
 assert.match(main,/r\.source\.revision\.slice\(0,12\)/);
 assert.match(main,/r\.change\.planApplied\?" · План применён локально":""/);
 assert.match(main,/openProjectTab\(project\.id,"changes",r\.change\.id\)/);
 assert.match(main,/setRealityLimit\(n=>Math\.min\(realityMap\?\.count\?\?n,n\+8\)\)/);
 assert.match(main,/setRealityLimit\(8\)/);
 assert.match(main,/Уточнить факт/);
 assert.match(css,/\.atlas-reality-grid\{display:grid/);
 assert.match(css,/@container atlas-panel \(max-width:850px\)/);
});

test("four primary and six secondary views remain reachable with native keyboard support",()=>{
 assert.match(main,/const primaryTabKeys:Tab\[\]=\["overview","work","timeline","reality"\]/);
 assert.match(main,/tabs\.filter\(t=>primaryTabKeys\.includes\(t\.key\)\)/);
 assert.match(main,/tabs\.filter\(t=>!primaryTabKeys\.includes\(t\.key\)\)/);
 assert.match(main,/aria-label="Дополнительные представления проекта"/);
 assert.match(main,/viewMenuRef\.current\?\.removeAttribute\("open"\);view\(t\.key\)/);
 assert.match(main,/title=\{t\.key==="graph"\?"Ctrl\+3":undefined\}/);
 assert.match(main,/aria-current=\{tab===t\.key\?"page":undefined\}/);
 assert.match(css,/\.atlas-compact-tabs\{flex-wrap:wrap/);
 assert.match(css,/\.atlas-view-menu-actions\{position:absolute/);
});

test("portfolio search reuses per-project impact across text, filters and tabs",()=>{
 assert.match(main,/const impactByProject=useMemo\(\(\)=>\{/);
 assert.match(main,/new Map<string,ReturnType<typeof projectImpact>>\(\)/);
 assert.match(main,/for\(const p of data\.projects\)indexed\.set\(p\.id,projectImpact\(p\)\)/);
 assert.match(main,/\},\[data\.projects\]\)/);
 assert.match(main,/const impact=project\?impactByProject\.get\(project\.id\)\|\|null:null/);
 assert.match(main,/const imp=impactByProject\.get\(p\.id\)!/);
 assert.doesNotMatch(main,/const imp=projectImpact\(p\),row=/);
});

test("standalone 1024px overview uses compact one-row metrics without changing hosted layout",()=>{
 assert.match(css,/@media \(min-width:900px\) and \(max-width:1220px\)/);
 assert.match(css,/\.app-shell:not\(\.atlas-embedded\) \.metric-grid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/\.app-shell:not\(\.atlas-embedded\) \.metric\{padding:10px 11px;min-height:76px\}/);
 assert.match(css,/@container atlas-panel \(max-width: 650px\)/);
});

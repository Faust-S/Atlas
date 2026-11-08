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

test("project and tab navigation reset the viewport while cause inspection keeps explicit focus",()=>{
 assert.match(main,/const resetWorkspaceScroll=\(\)=>\{/);
 assert.match(main,/if\(workspace\)workspace\.scrollTop=0/);
 const project=main.match(/const selectProject=\([\s\S]*?const openProjectTab=/)?.[0]||"";
 const view=main.match(/const view=\(tabId:Tab\)=>\{[\s\S]*?\n \};/)?.[0]||"";
 const decision=main.match(/const openEditorFor=\([\s\S]*?const cancelEditor=/)?.[0]||"";
 assert.match(project,/resetWorkspaceScroll\(\)/);
 assert.match(view,/resetWorkspaceScroll\(\)/);
 assert.match(decision,/resetWorkspaceScroll\(\)/);
 assert.match(main,/element\.scrollIntoView\(\{block:"start",behavior:"auto"\}\)/);
 assert.match(main,/element\.focus\(\{preventScroll:true\}\)/);
});

test("deep inherited causes show short keyboard path with explicit full-chain disclosure",()=>{
 assert.match(main,/cause\.path\.length>5/);
 assert.match(main,/cause\.path\.slice\(-2\)/);
 assert.match(main,/cause\.path\.length-3\} промежуточных/);
 assert.match(main,/className="atlas-relation-fullpath"/);
 assert.match(main,/Полная цепочка \(\{cause\.path\.length\} проектов\)/);
 assert.match(css,/\.atlas-relation-fullpath>summary:focus-visible/);
});

test("source-bound portfolio cause focuses the exact existing fact card",()=>{
 assert.ok(main.includes('signal.panel==="evidence"?"overview"'));
 assert.ok(main.includes('if(validTarget)setRequirementJump({projectId,targetId:signal.ref!});'));
 assert.ok(main.includes('if(index>=realityLimit){setRealityLimit(index+1);return;}'));
 assert.ok(main.includes('card.scrollIntoView({block:"center",behavior:"auto"});'));
 assert.ok(main.includes('card.focus({preventScroll:true});'));
 assert.ok(main.includes('ref={r.id===requirementJump?.targetId?requirementCardRef:undefined}'));
 assert.ok(main.includes('aria-label={"Требование: "+r.title+" — "+project.name}'));
 assert.ok(main.includes('ariaLabel={"Разобрать причину: "+row.name+" — "+row.primary.label}'));
 assert.ok(main.includes('setRequirementJump(null);'));
 assert.ok(css.includes('.atlas-reality-card:focus{outline:3px solid'));
});

test("source-bound fact links to the existing response editor, exact change and human decision",()=>{
 assert.match(main,/r\.cause\?\.needsProposal&&<Action onClick=\{\(\)=>openEditor\("respond:"\+encodeURIComponent\(r\.cause\.key\)\)\}/);
 assert.match(main,/r\.cause\?\.activeChange&&<Action onClick=\{\(\)=>openProjectTab\(project\.id,"changes",r\.cause\.activeChange\.id\)\}/);
 assert.match(main,/r\.cause\?\.approvedWithoutWork&&r\.cause\.activeChange/);
 assert.match(main,/openEditor\("work-change:"\+r\.cause\.activeChange\.id\)/);
 assert.match(main,/setChangeJump\(\{projectId:id,changeId\}\)/);
 assert.match(main,/aria-label=\{"Изменение: "\+c\.title\+" — "\+project\.name\}/);
 assert.match(main,/aria-label="Открыть портфель проектов"/);
 assert.match(css,/\.change-card:focus\{outline:3px solid/);
});

test("linked work offers explicit requirement-specific fact entry without inferred acceptance",()=>{
 assert.match(main,/const targetById=useMemo\(\(\)=>new Map<string,any>/);
 assert.match(main,/r\.work\.slice\(0,3\)\.map/);
 assert.match(main,/Работы отмечены выполненными\. Это не подтверждает результат или его приёмку/);
 assert.match(main,/Завершение работы заявлено; факт результата вносится отдельно/);
 assert.match(main,/ariaLabel=\{"Зафиксировать факт по работе: "\+w\.title/);
 assert.match(main,/onClick=\{\(\)=>openEditor\("finding-target:"\+w\.targetIds\[0\]\)\}/);
 assert.match(main,/w\.targetIds\.map\(\(id:string\)=>targetById\.get\(id\)/);
 assert.match(main,/onClick=\{\(\)=>openEditor\("finding-target:"\+id\)\}/);
 assert.match(css,/\.atlas-work-fact-menu>summary:focus-visible/);
});

test("deep requirement work navigation filters the existing work table by target ID",()=>{
 assert.match(main,/const \[workTargetFilter,setWorkTargetFilter\]=useState\("all"\)/);
 assert.match(main,/\(workTargetFilter==="all"\|\|\(item\.targetIds\|\|\[\]\)\.includes\(workTargetFilter\)\)/);
 assert.match(main,/setWorkTargetFilter\("all"\);setWorkQuery/);
 assert.match(main,/view\("work"\);setWorkTargetFilter\(r\.id\);setWorkLimit\(200\)/);
 assert.match(main,/aria-label="Фильтр работ по требованию"/);
 assert.match(main,/<option value="all">Все требования<\/option>/);
 assert.match(main,/\(project\.targets\|\|\[\]\)\.map\(\(t:any\)=>/);
});

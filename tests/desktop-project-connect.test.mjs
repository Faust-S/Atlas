import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty,createProject,attach,observe,serialize,deserialize} from "../src/core.mjs";
import {reconcilePublicSources,planPublicRefresh} from "../src/public-refresh.mjs";
const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const ui=source("../desktop/src/main.tsx");
const connect=source("../desktop/src/ProjectConnect.tsx");
const css=source("../desktop/src/style.css");
test("Atlas opens a single progressively disclosed connection wizard, also on first start",()=>{
 assert.match(ui,/import \{ProjectConnect\} from "\.\/ProjectConnect"/);
 assert.match(ui,/applyPublicProjectPreview\(before,preview,options\)/);
 assert.match(ui,/aria-label="Подключить существующий проект"/);
 assert.match(ui,/data\.projects\.length===0&&<section className="surface atlas-first-start"/);
 assert.match(ui,/onClick=\{startConnection\}>Подключить проект/);
 assert.match(ui,/connectOpen&&<ProjectConnect snapshot=\{data\} onApply=\{completeConnection\}/);
 assert.match(ui,/Сохраните портфель на диск/);
 assert.match(connect,/1\. Источник/);
 assert.match(connect,/2\. Предпросмотр и выбор/);
 assert.match(connect,/3\. Сохранение в Atlas/);
 assert.match(connect,/onSubmit=\{event=>void inspect\(event\)\}/);
 assert.match(connect,/inspectPublicProject\(address,globalThis\.fetch/);
 assert.match(connect,/ongoing\.current\?\.abort\(\)/);
});
test("Wizard never guesses work or edits GitHub while previewing a repository",()=>{
 assert.match(connect,/Корневая структура/);
 assert.match(connect,/Каталоги/);
 assert.match(connect,/Файлы/);
 assert.match(connect,/Показана только часть структуры/);
 assert.match(connect,/не становятся задачами автоматически/);
 assert.match(connect,/Не удалось получить|Структуру файлов не удалось получить/);
 assert.match(connect,/Открыть существующий проект/);
 assert.match(connect,/onApply\(preview,\{name:name\.trim\(\),selectedRepositories:selected\}\)/);
 assert.match(connect,/disabled=\{disabled\|\|loading\|\|preview\.kind==="owner"&&!selected\.length\|\|/);
 assert.match(connect,/Отметьте хотя бы один репозиторий/);
 assert.match(connect,/Приватные источники требуют отдельного разрешённого подключения/);
 assert.match(connect,/Во внешнем GitHub никакие действия не выполняются/);
 assert.match(ui,/atlas-connected-structure/);
 assert.match(css,/\.atlas-connect-selection/);
});
test("Structure is retained only when an independent GitHub refresh sees the exact same branch SHA",async()=>{
 const shaA="a".repeat(40),shaB="b".repeat(40),treeSha="c".repeat(40);
 let p=createProject(empty(),{name:"Product",type:"engineering"});
 let sourceLink=attach(p.state,p.id,"github","example/demo",{branch:"main"});
 const structure={status:"observed",branch:"main",commitSha:shaA,treeSha,
  truncated:false,folders:["src"],files:["package.json"],detected:["package.json"],
  totalFolders:1,totalFiles:1,limited:false};
 const observed={scope:"repository",repository:"example/demo",complete:true,
  defaultBranch:"main",branches:["main"],branchHeads:{main:shaA},structure};
 const state=observe(sourceLink.state,p.id,sourceLink.id,"ok",observed);
 const original=serialize(state);
 const observer=async(name)=>({...observed,repository:name,structure:undefined});
 const plan=planPublicRefresh(state,{maxAgeMs:0});
 const stable=await reconcilePublicSources(state,{plan,repoObserver:observer});
 const stored=stable.state.projects[0].sources[0].summary;
 assert.deepEqual(stored.structure,structure);
 assert.deepEqual(deserialize(serialize(stable.state)),stable.state);
 const drift=await reconcilePublicSources(stable.state,{
  plan:planPublicRefresh(stable.state,{maxAgeMs:0}),
  repoObserver:async name=>({...observed,repository:name,branchHeads:{main:shaB},structure:undefined})
 });
 const after=drift.state.projects[0].sources[0].summary;
 assert.equal(after.branchHeads.main,shaB);
 assert.equal(after.structure,undefined);
 assert.equal(serialize(state),original);
});

test("Atlas connection wizard stays focused: no duplicate portfolio dashboards, compact root preview, early confirmation",()=>{
 assert.match(ui,/connectOpen\?" atlas-connect-focused":""/);
 assert.match(css,/\.atlas-connect-focused \.workspace > \.page-heading/);
 assert.match(css,/\.atlas-connect-focused \.workspace > \.metric-grid/);
 assert.match(css,/\.atlas-connect-focused \.workspace > \.surface:not\(\.atlas-project-connect\)/);
 assert.match(connect,/<details className="atlas-connect-root-preview">/);
 assert.match(connect,/<summary>Корневая структура/);
 assert.match(connect,/const confirmActions=preview\?/);
 assert.match(connect,/\{existing&&<p[\s\S]*\{confirmActions\}[\s\S]*\{structure\?\.status==="observed"/);
 assert.match(connect,/\{preview\.kind==="owner"&&confirmActions\}/);
 assert.match(connect,/Исходники: \{preview\.branch\|\|"не определена"\}/);
 assert.match(connect,/Основная ветка: \{preview\.summary\.defaultBranch/);
});

test("Project confirmation stays before the long branch and file details, visible at ordinary Windows height",()=>{
 const branch=connect.indexOf('className="atlas-connect-branch button-row"');
 const approve=connect.indexOf('    {confirmActions}',branch);
 const summary=connect.indexOf('    <div className="summary-line">',branch);
 const tree=connect.indexOf('<details className="atlas-connect-root-preview">',branch);
 assert.ok(branch>=0 && branch<approve && approve<summary && summary<tree);
});

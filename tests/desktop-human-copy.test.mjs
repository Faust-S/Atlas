import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
const source=readFileSync(new URL("../src/github-public.mjs",import.meta.url),"utf8");
const refresh=readFileSync(new URL("../src/public-refresh.mjs",import.meta.url),"utf8");

test("Atlas 0.5 shows human-first copy without leaking project schema",()=>{
 assert.doesNotMatch(ui,/Схема:\s*atlas\.project\/1/);
 assert.doesNotMatch(ui,/локальный черновик\s*→\s*нативная запись\s*→\s*readback/);
 assert.match(ui,/<h2>План, факты и решения<\/h2>/);
 assert.match(ui,/<small>Ожидаемый результат<\/small>/);
 assert.match(ui,/<small>Что известно сейчас<\/small>/);
 assert.match(ui,/<small>Что требует внимания<\/small>/);
 assert.match(ui,/<small>Как поступить<\/small>/);
 assert.match(ui,/Проекты хранятся на этом компьютере/);
});

test("portable IWXA archives are primary, legacy JSON remains visibly separate",()=>{
 assert.match(ui,/<summary>Сохранение и копии<\/summary>/);
 assert.match(ui,/>Открыть архив \.iwxa<\/Action>/);
 assert.match(ui,/>Открыть копию JSON<\/Action>/);
 assert.match(ui,/>Сохранить архив \.iwxa<\/Action>/);
 assert.match(ui,/>Сохранить копию JSON<\/Action>/);
 assert.match(ui,/Архив \.iwxa переносит проекты между копиями Atlas/);
 assert.match(ui,/В совместимом Admin Center архив открывается для просмотра и подготовки поручений/);
 assert.match(ui,/Для прежних версий остаётся копия JSON/);
 assert.doesNotMatch(ui,/Обмен с другими программами IWXA пока не подключён/);
 assert.match(ui,/>История сохранений<\/Action>/);
 assert.match(css,/\.atlas-file-menu-note\{/);
 assert.match(ui,/invoke<string>\("atlas_export_json"/);
 assert.match(ui,/invoke<Atlas\|null>\("atlas_select_import"\)/);
});

test("project source review describes only actual read-only, manually initiated public GitHub scope",()=>{
 assert.match(ui,/Проверяйте изменения и сборки открытых репозиториев GitHub по своему запросу/);
 assert.match(ui,/Ничего в них не меняет/);
 assert.match(ui,/const syncPublic=async/);
 assert.match(source,/Public GitHub REST observation only; never accepts tokens or writes to source/);
 assert.match(refresh,/const supported=new Set\(\["github","github_owner"\]\)/);
});


test("technical source revisions are opt-in, not permanent UI columns",()=>{
 assert.match(ui,/<h2>Что известно о результате<\/h2>/);
 assert.doesNotMatch(ui,/<th>Предыдущий SHA<\/th>/);
 assert.doesNotMatch(ui,/<th>Новый SHA<\/th>/);
 assert.match(ui,/className="atlas-technical-details"/);
 assert.match(ui,/<summary>Версия источника<\/summary>/);
 assert.match(ui,/<summary>Данные для ручного подключения<\/summary>/);
 assert.match(css,/\.atlas-technical-details>summary:focus-visible/);
});


test("installed Windows Save clicks the visible button, never its adjacent file menu",()=>{
 const driver=readFileSync(new URL("../desktop/tests/installed-windows-keyboard.ps1",import.meta.url),"utf8");
 const fn=driver.match(/function Click-AtlasSave\([\s\S]*?\n\}/)?.[0];
 assert.ok(fn,"Windows native Save interaction is present");
 const offset=Number(fn.match(/\$rect\.Right - \[int\]\[Math\]::Round\((\d+) \* \$scale\)/)?.[1]);
 assert.ok(offset>0,"Windows Save offset must be explicit");
 const clickedX=1024-offset;
 assert.ok(clickedX>=696&&clickedX<=786,"Save must hit the screenshot-confirmed button, not the adjacent file menu");
 assert.match(fn,/SetCursorPos/);
 assert.match(fn,/mouse_event/);
});

test("selected GitHub branch is an ordinary project source option, not a separate subsystem",()=>{
 const editor=readFileSync(new URL("../src/editor.mjs",import.meta.url),"utf8");
 assert.match(editor,/Ветка GitHub для проверок/);
 assert.match(ui,/Ветка проверок:/);
 assert.match(ui,/выбранной ветки/);
 assert.doesNotMatch(ui,/Выбор маршрутизатора GitHub Actions/);
});

test("saved project and work links export a real IWXA portfolio for Center",()=>{
 assert.match(ui,/<Action primary autoFocus onClick=\{\(\)=>void exportIwxa\(\)\} disabled=\{busy\}>Сохранить портфель \.iwxa<\/Action>/);
 assert.match(ui,/В архив попадут все проекты портфеля, а не только выбранная работа/);
 assert.match(ui,/Center сможет читать копию и готовить поручения/);
 assert.match(ui,/синхронизация и права не передаются/);
 assert.match(ui,/Сохранить копию JSON<\/Action>/);
 assert.doesNotMatch(ui,/>Сохранить копию JSON для старой версии Center<\/Action>/);
});

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

test("backup UI does not mislabel legacy JSON as unified IWXA exchange",()=>{
 assert.match(ui,/<summary>Сохранение и копии<\/summary>/);
 assert.match(ui,/>Открыть резервную копию<\/Action>/);
 assert.match(ui,/>Сохранить резервную копию<\/Action>/);
 assert.match(ui,/Копии пока сохраняются в JSON\. Обмен файлами \.iwxa здесь ещё не подключён/);
 assert.match(ui,/>История сохранений<\/Action>/);
 assert.match(css,/\.atlas-file-menu-note\{/);
 assert.match(ui,/invoke<string>\("atlas_export_json"/);
 assert.match(ui,/invoke<Atlas\|null>\("atlas_select_import"\)/);
});

test("project source review describes only actual read-only, manually initiated public GitHub scope",()=>{
 assert.match(ui,/Проверка открытых репозиториев GitHub запускается вручную/);
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
 assert.match(ui,/<summary>Версии источника<\/summary>/);
 assert.match(ui,/<summary>Данные для ручного подключения<\/summary>/);
 assert.match(css,/\.atlas-technical-details>summary:focus-visible/);
});

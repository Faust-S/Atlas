import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
test("Atlas 0.6 has a portfolio-wide development map from existing projects and sources",()=>{
 assert.match(ui,/Карта разработки/);
 assert.match(ui,/githubPortfolioOverview\(data\)/);
 assert.match(ui,/filterGithubPortfolioOverview\(ecosystem/);
 assert.match(ui,/Владелец источников на карте разработки/);
 assert.match(ui,/Продукты и связанные репозитории/);
 assert.match(ui,/Зелёная сборка не означает принятую поставку/);
 assert.match(ui,/onClick=\{\(\)=>openProjectTab\(r\.id,r\.sourcesMissing\?"sources":"overview"\)\}/);
});
test("Observed GitHub owner catalog creates editable projects without a second store",()=>{
 assert.match(ui,/githubPortfolioCatalog\(data,project\.id,s\.id/);
 assert.match(ui,/createProjectFromGitHubCatalog\(latestSnapshot\.current/);
 assert.match(ui,/Каталог владельца/);
 assert.match(ui,/Создать проект/);
 assert.match(ui,/Приватные репозитории не перечисляются/);
 assert.match(ui,/Сохраните портфель на диск/);
 assert.match(ui,/includeDiscoveredProject\(project\.id,s\.id,repo\.name\)/);
});

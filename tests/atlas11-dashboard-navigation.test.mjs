import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Atlas 0.11 dashboard opens the real matching portfolio section, not the portfolio top",()=>{
 const ui=source("../desktop/src/main.tsx");
 const home=source("../desktop/src/AtlasDashboard.tsx");
 assert.match(ui,/const goPortfolioSection=\(section:"resources"\|"ecosystem"\|"review"\)=>\{/);
 assert.match(ui,/if\(!requireClosedForm\(\)\)return;\s*selectProject\(null\);setHomeOpen\(false\);setSettingsOpen\(false\);setPortfolioJump\(section\)/);
 assert.match(ui,/const destination=rootRef\.current\?\.querySelector<HTMLElement>\("#atlas-portfolio-"\+portfolioJump\)/);
 assert.match(ui,/destination\.scrollIntoView\(\{block:"start",behavior:"auto"\}\)/);
 assert.match(ui,/destination\.focus\(\{preventScroll:true\}\)/);
 assert.match(ui,/<section id="atlas-portfolio-resources" tabIndex=\{-1\}/);
 assert.match(ui,/<section id="atlas-portfolio-ecosystem" tabIndex=\{-1\}/);
 assert.match(ui,/<section id="atlas-portfolio-review" tabIndex=\{-1\}/);
 assert.match(ui,/onResources=\{goResources\}/);
 assert.match(ui,/onEcosystem=\{\(\)=>goPortfolioSection\("ecosystem"\)\}/);
 assert.match(ui,/onReview=\{\(\)=>reviewRows\.length\?openProjectTab\(reviewRows\[0\]\.projectId,"changes"\):goPortfolioSection\("review"\)\}/);
 assert.match(ui,/if\(project\)goProjectTab\("resources"\);else goPortfolioSection\("resources"\)/);
 assert.match(home,/<button className="atlas-dash-secondary" onClick=\{onResources\}>Все ресурсы<\/button>/);
 assert.match(home,/<button onClick=\{onResources\}>Настроить ресурсы<\/button>/);
 assert.match(home,/<button className="atlas-dash-secondary" onClick=\{onEcosystem\}>Карта портфеля<\/button>/);
});

test("Atlas 0.11 portfolio section focus remains UI-only and respects the editor guard",()=>{
 const ui=source("../desktop/src/main.tsx");
 const start=ui.indexOf('const goPortfolioSection=(section:"resources"|"ecosystem"|"review")');
 const end=ui.indexOf("const goSettings=()=>",start);
 assert.ok(start>=0&&end>start);
 const route=ui.slice(start,end);
 assert.match(route,/requireClosedForm\(\)/);
 assert.doesNotMatch(route,/mutate\(|save\(|editItem\(|nativeInvoke\(/);
 const effect=ui.slice(ui.indexOf('if(embedded||active!==null||homeOpen||settingsOpen||!portfolioJump)return;'),
  ui.indexOf('},[embedded,active,homeOpen,settingsOpen,portfolioJump]);'));
 assert.match(effect,/setPortfolioJump\(null\)/);
 assert.doesNotMatch(effect,/mutate\(|save\(|nativeInvoke\(/);
});

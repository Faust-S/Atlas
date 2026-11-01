// CI-only actual Chromium qualification, no application dependency on Playwright.
// Run from repository root after: npm install --no-save --package-lock=false playwright@1.56.1
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:4173";
const server = spawn("python3", ["-m", "http.server", "4173", "--bind", "127.0.0.1"], {
 stdio: "ignore"
});
let browser;
const events=[];
const attachErrors=page=>{
 page.on("pageerror",error=>events.push("PAGEERROR: "+error.message));
 page.on("console",message=>{if(message.type()==="error")events.push("CONSOLE: "+message.text())});
};
async function waitForServer(){
 for(let attempt=0;attempt<60;attempt++){
  if(server.exitCode!==null)throw Error("Local HTTP server exited: "+server.exitCode);
  try{const response=await fetch(origin+"/index.html");if(response.ok)return}
  catch{}
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw Error("Timed out waiting for local HTTP server");
}
async function storageQualification(){
 const page=await browser.newPage();
 attachErrors(page);
 try{
  await page.goto(origin+"/tests/storage-browser.html",{waitUntil:"load"});
  await page.waitForFunction(()=>["PASS","FAIL"].includes(document.documentElement.dataset.status),{timeout:60000});
  const status=await page.locator("html").getAttribute("data-status");
  const result=await page.locator("#results").innerText();
  if(status!=="PASS")throw Error("Real IndexedDB recovery test: "+result);
  console.log("REAL_BROWSER_IDB "+result);
 }finally{await page.close()}
}
async function userJourney(){
 const context=await browser.newContext({viewport:{width:1320,height:900}});
 const page=await context.newPage();
 attachErrors(page);
 try{
  await page.goto(origin+"/index.html",{waitUntil:"load"});
  await page.locator("#storage-status").getByText("IndexedDB").waitFor({timeout:30000});
  assert.match(await page.locator("#app").innerText(),/Портфель проектов/);
  await page.locator('[data-action="new"]').click();
  await page.locator('#atlas-editor-form [name="name"]').fill("Chromium qualification");
  await page.locator('#atlas-editor-form [name="goal"]').fill("Evidence and dependencies survive reload");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.getByRole("heading",{name:"Chromium qualification"}).waitFor();
  await page.locator('[data-action="target"]').click();
  await page.locator('#atlas-editor-form [name="title"]').fill("Offline result");
  await page.locator('#atlas-editor-form [name="desired"]').fill("Restore the recorded state");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator("#atlas-impact").getByText("Offline result").waitFor();
  await page.locator('[data-action="item"]').click();
  await page.locator('#atlas-editor-form [name="title"]').fill("Implement");
  await page.locator('#atlas-editor-form [name="targetId"]').selectOption({label:"Offline result"});
  await page.locator('#atlas-editor-form [name="estimateDays"]').fill("2");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator('[data-action="item"]').click();
  await page.locator('#atlas-editor-form [name="title"]').fill("Validate");
  await page.locator('#atlas-editor-form [name="targetId"]').selectOption({label:"Offline result"});
  await page.locator('#atlas-editor-form [name="estimateDays"]').fill("1");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator('[data-action="dep"]').click();
  await page.locator('#atlas-editor-form [name="from"]').selectOption({label:"Implement"});
  await page.locator('#atlas-editor-form [name="to"]').selectOption({label:"Validate"});
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator("#atlas-relations svg").waitFor();
  const graph=await page.locator("#atlas-relations").innerText();
  assert.match(graph,/Временная шкала/);
  assert.match(await page.locator("#app").innerText(),/Implement → Validate/);
  await page.locator('[data-action="finding"]').click();
  await page.locator('#atlas-editor-form [name="result"]').selectOption("partial");
  await page.locator('#atlas-editor-form [name="note"]').fill("Observed partial implementation");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator("#atlas-trace").getByText("Реализовано частично",{exact:false}).first().waitFor();
  // Read through the real browser's authoritative IndexedDB store.
  const saved=await page.evaluate(async()=>{
   return new Promise((resolve,reject)=>{
    const open=indexedDB.open("iwxa-atlas-standalone",1);
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
     const db=open.result,tx=db.transaction("snapshots","readonly"),req=tx.objectStore("snapshots").get("head");
     req.onsuccess=()=>resolve(JSON.parse(req.result.json));
     req.onerror=()=>reject(req.error);
     tx.oncomplete=()=>db.close();
    };
   });
  });
  assert.equal(saved.projects.length,1);
  assert.equal(saved.projects[0].dependencies.length,1);
  assert.equal(saved.projects[0].items.length,2);
  assert.equal(saved.projects[0].targets.length,1);
  assert.equal(saved.projects[0].findings.length,1);
  assert.deepEqual(saved.projects[0].items.map(x=>x.targetIds.length),[1,1]);
  await page.reload({waitUntil:"load"});
  await page.locator("#storage-status").getByText("IndexedDB").waitFor({timeout:30000});
  await page.locator('[data-action^="open:"]').first().click();
  assert.match(await page.locator("#atlas-trace").innerText(),/Реализовано частично/);
  assert.match(await page.locator("#app").innerText(),/Implement → Validate/);
  assert.equal(await page.locator("#atlas-relations svg").count(),1);
  await page.locator('[data-action="back"]').click();
  await page.locator("#atlas-command").waitFor();
  await page.locator("#atlas-command-filter").selectOption("evidence");
  await page.locator('#atlas-command-rows [data-action^="inspect:"]').first().click();
  await page.locator("#atlas-trace").waitFor();
  assert.match(await page.locator("#atlas-trace").innerText(),/Offline result/);
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="new"]').click();
  await page.locator('#atlas-editor-form [name="name"]').fill("Consumer project");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="portfolio-link"]').click();
  await page.locator('#atlas-editor-form [name="from"]').selectOption({label:"Chromium qualification"});
  await page.locator('#atlas-editor-form [name="to"]').selectOption({label:"Consumer project"});
  await page.locator('#atlas-editor-form [name="note"]').fill("Requires validated offline result");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.getByRole("heading",{name:"Зависимости между проектами"}).waitFor();
  await page.locator('svg[aria-label="Граф зависимостей портфеля"]').waitFor();
  const portfolio = await page.evaluate(async()=>{
   return new Promise((resolve,reject)=>{
    const request=indexedDB.open("iwxa-atlas-standalone",1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
     const db=request.result,tx=db.transaction("snapshots","readonly"),get=tx.objectStore("snapshots").get("head");
     get.onsuccess=()=>resolve(JSON.parse(get.result.json));
     get.onerror=()=>reject(get.error);
     tx.oncomplete=()=>db.close();
    };
   });
  });
  assert.equal(portfolio.projects.length,2);
  assert.equal(portfolio.portfolioLinks.length,1);
  await page.reload({waitUntil:"load"});
  await page.locator('[data-action="portfolio-link"]').waitFor();
  assert.match(await page.locator("#app").innerText(),/Requires validated offline result/);
  console.log("REAL_BROWSER_USER_JOURNEY PASS: project → target → linked tasks → dependency graph → finding → IndexedDB restart → portfolio dependency → restart");
  if(events.length)throw Error(events.join("\n"));
 }catch(error){
  await page.screenshot({path:"atlas-ci-screenshot.png",fullPage:true}).catch(()=>{});
  throw error;
 }finally{await context.close()}
}
try{
 await waitForServer();
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 await storageQualification();
 await userJourney();
 console.log("REAL_BROWSER_CHROMIUM PASS");
}catch(error){
 console.error("REAL_BROWSER_CHROMIUM FAIL:",error.stack||error);
 process.exitCode=1;
}finally{
 await browser?.close();
 server.kill("SIGTERM");
}

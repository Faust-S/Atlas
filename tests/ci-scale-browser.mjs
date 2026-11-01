// Real Chromium stress over synthetic projects linked to verified public repository metadata.
// Linux-only one-shot acceptance, no permanent CI browser schedule and no network credentials.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";
import {makePublicPortfolio} from "./fixtures/public-portfolio.mjs";
const base=process.cwd(),errors=[];
const types={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",
 ".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",
 ".css":"text/css; charset=utf-8",".png":"image/png",".svg":"image/svg+xml"};
const http=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);
  if(pathname==="/favicon.ico"){res.writeHead(204);res.end();return}
  const name=resolve(base,"."+(pathname==="/"?"/index.html":pathname));
  if(!name.startsWith(base+sep)){res.writeHead(403);res.end();return}
  res.writeHead(200,{"content-type":types[extname(name)]||"application/octet-stream","cache-control":"no-store"});
  res.end(await readFile(name));
 }catch(e){res.writeHead(404);res.end("Not found")}
});
const open=()=>new Promise((resolve,reject)=>{http.once("error",reject);http.listen(0,"127.0.0.1",resolve)});
const stop=()=>new Promise(resolve=>http.close(resolve));
async function readSnapshot(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open("iwxa-atlas-standalone",1);
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction("snapshots","readonly"),head=tx.objectStore("snapshots").get("head");
   head.onsuccess=()=>resolve(head.result?.json||null);
   head.onerror=()=>reject(head.error);
   tx.oncomplete=()=>db.close();
  };
 }));
}
async function waitRows(page,n){
 await page.waitForFunction(count=>document.querySelectorAll(".atlas-command-row").length===count,n,{timeout:80000});
}
async function testTier(browser,origin,n){
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage(),errorsThis=[];
 page.on("pageerror",e=>errorsThis.push("PAGE "+e.message));
 page.on("console",m=>{if(m.type()==="error")errorsThis.push("CONSOLE "+m.text())});
 // No real API writes, no private credentials, no uncontrolled public API polling.
 await page.route("https://api.github.com/**",r=>r.fulfill({status:429,contentType:"application/json",
  headers:{"access-control-allow-origin":"*"},body:'{"message":"Synthetic stress mode: live API disabled"}'}));
 const data=makePublicPortfolio({projects:n,workPerProject:12,targetsPerProject:4});
 const exported=Buffer.from(JSON.stringify(data,null,2));
 const expected=createHash("sha256").update(exported).digest("hex");
 let stage="initial";
 try{
  await page.goto(origin,{waitUntil:"load"});
  await page.locator("#atlas-command").waitFor();
  page.once("dialog",dialog=>dialog.accept());
  stage="import";
  const start=Date.now();
  await page.locator("#file").setInputFiles({name:"atlas-synthetic-public.json",mimeType:"application/json",buffer:exported});
  await waitRows(page,n);
  const importMs=Date.now()-start;
  const stored=await readSnapshot(page);
  assert.ok(stored);
  const saved=JSON.parse(stored);
  assert.equal(saved.projects.length,n);
  assert.equal(saved.portfolioLinks.length,n-1);
  assert.equal(saved.projects[0].sources[0].status,"never");
  assert.equal(saved.projects[0].sources[0].summary,null);
  assert.equal(saved.projects[1].sources[0].summary?.readiness,"not_assessed");
  assert.equal(saved.projects[0].targets.length,4);
  assert.equal(saved.projects[0].items.length,12);
  stage="search and filtering";
  await page.locator("#atlas-command-search").fill("python/cpython");
  await page.waitForFunction(()=>document.querySelectorAll(".atlas-command-row").length>0);
  assert.ok(await page.locator(".atlas-command-row").count()<n);
  await page.locator("#atlas-command-search").fill("");
  await waitRows(page,n);
  await page.locator("#atlas-command-filter").selectOption("blocked");
  assert.ok(await page.locator(".atlas-command-row").count()>0);
  await page.locator("#atlas-command-filter").selectOption("all");
  await waitRows(page,n);
  stage="detailed portfolio";
  const detailStart=Date.now();
  await page.locator('[data-action="portfolio-view:details"]').click();
  await page.getByRole("heading",{name:"Зависимости между проектами"}).waitFor({timeout:80000});
  const detailMs=Date.now()-detailStart;
  await page.locator('[data-action="portfolio-view:focus"]').click();
  stage="reopen identical IndexedDB";
  let worstReloadMs=0;
  const reloads=n===120?6:2;
  for(let i=0;i<reloads;i++){
   const t=Date.now();
   await page.reload({waitUntil:"load"});
   await waitRows(page,n);
   worstReloadMs=Math.max(worstReloadMs,Date.now()-t);
   const fromDb=await readSnapshot(page);
   assert.ok(fromDb);
   const restored=JSON.parse(fromDb);
   assert.equal(restored.projects.length,n);
   assert.equal(restored.portfolioLinks.length,n-1);
   assert.equal(restored.projects[0].sources[0].locator,data.projects[0].sources[0].locator);
  }
  stage="edit large snapshot";
  await page.locator('[data-action="new"]').first().click();
  await page.locator('#atlas-editor-form [name="name"]').fill("Synthetic extra");
  await page.locator('#atlas-editor-form button[type="submit"]').click();
  await page.waitForFunction(count=>document.querySelectorAll(".atlas-command-row").length===count,n+1,{timeout:80000}).catch(()=>{});
  const current=JSON.parse(await readSnapshot(page));
  assert.equal(current.projects.length,n+1);
  assert.equal(current.portfolioLinks.length,n-1);
  const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize||null);
  assert.deepEqual(errorsThis,[],"Chromium runtime error");
  const metrics={projects:n,works:n*12,targets:n*4,portfolioLinks:n-1,
   capturedRepositories:12,fixtureSha256:expected,fixtureBytes:exported.length,
   importAndRenderMs:importMs,expandedDetailsMs:detailMs,worstReloadMs,reloads,
   chromiumJsHeapBytes:heap};
  console.log("ATLAS_SCALE_CHROMIUM "+JSON.stringify(metrics));
 }catch(e){
  console.error("ATLAS_SCALE_BROWSER_FAILURE tier="+n+" stage="+stage);
  await page.screenshot({path:"atlas-scale-browser-failure.png",fullPage:true}).catch(()=>{});
  throw e;
 }finally{errors.push(...errorsThis);await context.close()}
}
let browser;
try{
 await open();
 browser=await chromium.launch({headless:true});
 const origin="http://127.0.0.1:"+http.address().port;
 for(const n of [12,60,120])await testTier(browser,origin,n);
 assert.deepEqual(errors,[]);
 console.log("ATLAS_SCALE_CHROMIUM_ALL_TIERS PASS");
}catch(e){console.error("ATLAS_SCALE_CHROMIUM FAIL "+(e.stack||e));process.exitCode=1}
finally{await browser?.close();await stop()}

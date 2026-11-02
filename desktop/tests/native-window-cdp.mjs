// Native Windows acceptance: connect to the WebView2 renderer of the actual Tauri EXE.
// CDP is enabled only on the temporary CI process, never in the shipped application.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright-core";

const exe=resolve("desktop/src-tauri/target/release/iwxa-atlas-desktop.exe");
if(!existsSync(exe))throw Error("Native Windows Atlas executable missing");
mkdirSync("desktop/test-artifacts",{recursive:true});
const projectName="Atlas native readback 0.2";
let child=null,browser=null,page=null;
async function launch(port){
 child=spawn(exe,[],{env:{...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port="+port},stdio:"ignore"});
 let lastError;
 for(let n=0;n<50;n++){
  if(child.exitCode!==null)throw Error("Atlas exited during native UI bootstrap: "+child.exitCode);
  try{
   browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,{timeout:1100});
   break;
  }catch(error){lastError=error;await delay(350)}
 }
 if(!browser)throw Error("Native WebView2 CDP endpoint unavailable: "+lastError);
 for(let n=0;n<60;n++){
  for(const context of browser.contexts())for(const candidate of context.pages()){
   if(await candidate.locator(".app-shell").count()){
    page=candidate;return;
   }
   if(await candidate.locator(".entry .error").count()){
    throw Error("Native Atlas refused local store: "+await candidate.locator(".entry .error").innerText());
   }
  }
  await delay(350);
 }
 throw Error("Native Atlas workbench did not become ready");
}
async function stop(){
 try{await page?.close({runBeforeUnload:true})}catch{}
 try{await browser?.close()}catch{}
 if(child&&!child.killed)child.kill();
 await delay(1200);
 page=null;browser=null;child=null;
}
async function edit(action,values){
 await page.getByRole("button",{name:action,exact:typeof action==="string"}).first().click();
 await page.locator(".editor-panel form").waitFor();
 for(const [key,value] of Object.entries(values)){
  const input=page.locator('.editor-panel [name="'+key+'"]');
  await input.fill(value);
 }
 await page.getByRole("button",{name:"Применить к черновику"}).click();
 await page.locator(".editor-panel form").waitFor({state:"detached"});
}
async function save(){
 await page.getByRole("button",{name:"Сохранить",exact:true}).click();
 await page.getByText("Сохранено и перечитано с диска.",{exact:false}).waitFor({timeout:16000});
 assert.match(await page.locator(".commandbar .status-chip").innerText(),/Сохранено/);
}
try{
 await launch(9281);
 assert.doesNotMatch(page.url(),/127\.0\.0\.1:1420/,"Release must not use the Vite dev server");
 await edit(/Создать проект/,{name:projectName,goal:"Native Windows persistence and reopening"});
 assert.equal(await page.locator(".page-heading h1").innerText(),projectName);
 assert.match(await page.locator(".commandbar .status-chip").innerText(),/Не сохранено/);
 await save();
 await page.screenshot({path:"desktop/test-artifacts/atlas-created.png"});
 await stop();
 await launch(9282);
 assert.equal(await page.locator(".page-heading h1").innerText(),"Портфель проектов");
 await page.locator(".project-nav button").filter({hasText:projectName}).click();
 assert.equal(await page.locator(".page-heading h1").innerText(),projectName);
 await page.getByRole("button",{name:"Таблица",exact:true}).click();
 await edit("＋ Работа",{title:"Readback persisted work",estimateDays:"3"});
 await save();
 await stop();
 await launch(9283);
 await page.locator(".project-nav button").filter({hasText:projectName}).click();
 await page.getByRole("button",{name:"Таблица",exact:true}).click();
 assert.match(await page.locator("table").innerText(),/Readback persisted work/);
 await page.screenshot({path:"desktop/test-artifacts/atlas-reopened.png"});
 console.log("ATLAS_NATIVE_WEBVIEW2_CREATE_SAVE_RESTART_READBACK_PASS");
}finally{
 if(page)try{await page.screenshot({path:"desktop/test-artifacts/atlas-last-state.png"})}catch{}
 await stop();
}

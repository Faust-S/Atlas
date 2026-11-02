// Release acceptance against the REAL installed Atlas Windows EXE.
// CDP is enabled only by test-process environment; shipped app has no debug listener.
// Each launch gets a distinct WebView2 profile so old processes cannot reuse its flags.
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright-core";

const installedExe=process.env.ATLAS_INSTALLED_EXE;
if(!installedExe||!existsSync(installedExe))throw Error("Installed executable missing; run the NSIS installer first");
const artifacts=resolve("desktop/test-artifacts");
mkdirSync(artifacts,{recursive:true});
const projectName="Installed Atlas lifecycle "+process.pid+" "+Date.now();
const itemTitle="Persist after full process termination";
let current=null;
let browser=null;
let page=null;
let phase="startup";
const errors=[];

function debugProcess(port,profile,reason){
 console.error("ATLAS_WINDOWS_DIAGNOSTIC",JSON.stringify({
  phase,reason,port,profile,installedExe,childPid:current?.pid,
  exitCode:current?.exitCode,webErrors:errors.slice(-6)
 }));
 try{
  const output=execFileSync("powershell.exe",["-NoProfile","-Command",
   "Get-CimInstance Win32_Process -Filter \"name='msedgewebview2.exe'\" | "+
   "Select-Object -First 8 ProcessId,CommandLine | Format-List | Out-String -Width 300"],{encoding:"utf8",timeout:5000});
  console.error("ATLAS_WEBVIEW2_PROCESSES",output.slice(0,5500));
 }catch(e){console.error("Process diagnostics unavailable:",String(e).slice(0,200))}
}
async function boot(port){
 phase="launch "+port;
 const profile=mkdtempSync(join(tmpdir(),"atlas-wv2-e2e-"));
 const env={...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:"--remote-debugging-port="+port,
  WEBVIEW2_USER_DATA_FOLDER:profile};
 const child=spawn(installedExe,[],{env,windowsHide:false,stdio:["ignore","pipe","pipe"]});
 current=child;
 child.on("error",e=>errors.push("spawn: "+String(e)));
 for(const stream of [child.stdout,child.stderr])stream?.on("data",b=>{
  const info=b.toString().trim();if(info)errors.push(info.slice(0,350))
 });
 let lastError="";
 for(let attempt=0;attempt<85;attempt++){
  if(child.exitCode!==null){debugProcess(port,profile,"native program exited");throw Error("Atlas exited at startup "+child.exitCode)}
  try{
   const response=await fetch("http://127.0.0.1:"+port+"/json/version",{signal:AbortSignal.timeout(750)});
   if(response.ok){
    browser=await chromium.connectOverCDP("http://127.0.0.1:"+port,{timeout:2500});
    break;
   }
   lastError="HTTP "+response.status;
  }catch(e){lastError=String(e).slice(0,220)}
  await delay(350);
 }
 if(!browser){debugProcess(port,profile,lastError);throw Error("WebView2 CDP was not available on isolated user-data profile: "+lastError)}
 let saw=[];
 for(let attempt=0;attempt<55;attempt++){
  for(const context of browser.contexts())for(const candidate of context.pages()){
   if(!saw.includes(candidate.url()))saw.push(candidate.url());
   candidate.on("pageerror",e=>errors.push("pageerror: "+String(e)));
   const bad=candidate.locator(".entry .error");
   if(await bad.count()){
    const err=await bad.innerText();
    debugProcess(port,profile,err);throw Error("Atlas displayed startup error: "+err)
   }
   if(await candidate.locator(".app-shell").count()){
    page=candidate;console.log("ATLAS_NATIVE_WEBVIEW2_READY",JSON.stringify({port,url:page.url(),pid:child.pid}));
    assert.doesNotMatch(page.url(),/127\.0\.0\.1:1420/,"Production must not rely on Vite server");
    return;
   }
  }
  await delay(350);
 }
 debugProcess(port,profile,"app shell absent; pages "+saw.join(", "));
 throw Error("Standalone window exists but Atlas workbench never rendered");
}
async function shutDown(){
 if(page){try{await page.screenshot({path:join(artifacts,"atlas-"+phase.replace(/\W+/g,"-")+".png")})}catch{}}
 try{await browser?.close()}catch{}
 if(current?.pid){
  try{execFileSync("taskkill",["/PID",String(current.pid),"/T","/F"],{timeout:6000,stdio:"ignore"})}
  catch{try{current.kill()}catch{}}
 }
 browser=null;page=null;current=null;
 await delay(900);
}
async function fillEditor(button,values){
 await page.getByRole("button",{name:button,exact:typeof button==="string"}).first().click();
 const form=page.locator(".editor-panel form");
 await form.waitFor({timeout:10000});
 for(const [name,value] of Object.entries(values)){
  const field=form.locator("[name="+JSON.stringify(name)+"]");
  await field.fill(value);
 }
 await form.locator('button[type="submit"]').click();
 await form.waitFor({state:"detached",timeout:10000});
 const alert=page.locator(".alert.error");
 if(await alert.count())throw Error("Editor rejected data: "+await alert.innerText());
}
async function save(){
 const button=page.locator(".commandbar").getByRole("button",{name:"Сохранить",exact:true});
 await button.click();
 const notice=page.locator(".alert.notice");
 await notice.getByText("Сохранено и перечитано с диска.",{exact:false}).waitFor({timeout:15000});
 assert.match(await page.locator(".commandbar .status-chip").innerText(),/Сохранено/);
}
async function openProject(){
 await page.locator(".project-nav button").filter({hasText:projectName}).first().click();
 assert.equal((await page.locator(".page-heading h1").innerText()).trim(),projectName);
}
try{
 await boot(14611);
 phase="create-project";
 await fillEditor(/Создать проект/,{name:projectName,goal:"Verified installed Windows storage"});
 assert.equal((await page.locator(".page-heading h1").innerText()).trim(),projectName);
 assert.match(await page.locator(".commandbar .status-chip").innerText(),/Не сохранено/);
 await save();
 console.log("ATLAS_WINDOWS_PROJECT_SAVED_PASS");
 await shutDown();

 await boot(14612);
 phase="reopen-project";
 await openProject();
 await page.getByRole("button",{name:"Таблица",exact:true}).click();
 await fillEditor("＋ Работа",{title:itemTitle,estimateDays:"3"});
 await save();
 console.log("ATLAS_WINDOWS_REOPEN_ADD_WORK_SAVE_PASS");
 await shutDown();

 await boot(14613);
 phase="reopen-work";
 await openProject();
 await page.getByRole("button",{name:"Таблица",exact:true}).click();
 assert.match(await page.locator("table").innerText(),/Persist after full process termination/);
 await page.getByRole("button",{name:"График",exact:true}).click();
 assert.match(await page.locator(".surface").last().innerText(),/Persist after full process termination/);
 await page.screenshot({path:join(artifacts,"atlas-installed-readback.png")});
 console.log("ATLAS_WINDOWS_INSTALLED_CREATE_SAVE_STOP_RESTART_READBACK_PASS");
}finally{await shutDown()}

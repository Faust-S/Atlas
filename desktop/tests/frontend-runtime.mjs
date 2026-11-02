// Frontend asset/runtime smoke. NOT equivalent to Windows native WebView2 acceptance.
// Starts compiled Vite preview; no dev-server source transforms.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
import {chromium} from "playwright-core";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const port=1421;
const errors=[];
const exe=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(x=>existsSync(x));
if(!exe)throw Error("No browser executable available for compiled frontend runtime acceptance");
const server=spawn("npm",["run","preview","--","--host","127.0.0.1","--port",String(port),"--strictPort"],{cwd:root,stdio:["ignore","pipe","pipe"]});
let browser=null;
let page=null;
for(const stream of [server.stdout,server.stderr])stream.on("data",b=>errors.push(String(b).trim().slice(0,350)));
try{
 let online=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error("Vite preview exited "+server.exitCode);
  try{
   const result=await fetch("http://127.0.0.1:"+port+"/",{signal:AbortSignal.timeout(750)});
   if(result.ok){online=true;break}
  }catch{}
  await delay(180);
 }
 if(!online)throw Error("Compiled frontend preview unavailable: "+errors.slice(-3).join("; "));
 browser=await chromium.launch({executablePath:exe,headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 page=await browser.newPage({viewport:{width:1280,height:800}});
 page.on("pageerror",error=>errors.push("runtime error: "+String(error)));
 page.on("console",msg=>{if(msg.type()==="error")errors.push("console: "+msg.text())});
 page.on("requestfailed",req=>errors.push("request failed: "+req.url()+" "+req.failure()?.errorText));
 await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"networkidle",timeout:15000});
 await page.locator(".entry-card").waitFor({timeout:12000});
 assert.match(await page.locator(".entry-card h1").innerText(),/IWXA Atlas/);
 assert.match(await page.locator(".entry-card").innerText(),/Tauri/);
 assert.equal(await page.locator("#atlas-bootstrap").isHidden(),true);
 assert.ok(!(await page.locator("body").evaluate(e=>e.getBoundingClientRect().height<200)),
  "App should occupy a usable viewport");
 assert.equal(errors.filter(s=>s.startsWith("runtime error:")||s.startsWith("request failed:")).length,0,
  "Production frontend has uncaught JavaScript or asset errors");
 await page.screenshot({path:"desktop-frontend-runtime.png"});
 console.log("ATLAS_DESKTOP_PRODUCTION_FRONTEND_RUNTIME_RENDER_PASS");
}finally{
 try{await page?.close()}catch{}
 try{await browser?.close()}catch{}
 if(server.pid){server.kill("SIGTERM");await delay(400)}
 if(errors.length)console.log("ATLAS_DESKTOP_FRONTEND_DIAGNOSTICS",JSON.stringify(errors.slice(-12)));
}

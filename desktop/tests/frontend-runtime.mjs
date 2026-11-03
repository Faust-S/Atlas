// Production frontend smoke using the runner's installed Chrome, without test dependencies.
// Not a substitute for installed Windows WebView2 validation.
import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const exe=["/usr/bin/google-chrome","/usr/bin/google-chrome-stable","/usr/bin/chromium","/usr/bin/chromium-browser"].find(x=>existsSync(x));
if(!exe)throw Error("Chrome/Chromium unavailable for frontend runtime acceptance");
const url="http://127.0.0.1:1421/";
const server=spawn("npm",["run","preview","--","--host","127.0.0.1","--port","1421","--strictPort"],{cwd:root,stdio:"ignore"});
try{
 let ready=false;
 for(let i=0;i<90;i++){
  if(server.exitCode!==null)throw Error("Frontend preview exited "+server.exitCode);
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(600)});
   if(response.ok){ready=true;break}
  }catch{}
  await delay(180);
 }
 if(!ready)throw Error("Compiled Vite preview did not start");
 const dom=execFileSync(exe,[
  "--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
  "--no-first-run","--disable-background-networking","--virtual-time-budget=7000",
  "--dump-dom",url
 ],{timeout:65000,maxBuffer:8*1024*1024,encoding:"utf8",stdio:["ignore","pipe","ignore"]});
 assert.match(dom,/class="entry-card"/,"React failed to render the standalone startup card");
 assert.match(dom,/IWXA Atlas/);
 assert.match(dom,/Tauri/,"Non-Tauri browser must explicitly explain the native-only data store");
 assert.match(dom,/id="atlas-bootstrap"[^>]*hidden(?:="")?/,"Bootstrap placeholder was not hidden after React mounted");
 assert.match(dom,/id="root"[^>]*>\s*<main/,"React did not populate the root");
 console.log("ATLAS_PRODUCTION_FRONTEND_RUNTIME_DOM_PASS");
}finally{
 if(server.pid)server.kill("SIGTERM");
}

// Original native Atlas U05 Store authority contract. This is a source
// test, not a substitute for the installed Tauri/Agent/Exchange acceptance.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {empty} from "../src/core.mjs";
import {createAtlasT3DesktopStorePort}
 from "../desktop/src/atlas-t3-store-port.mjs";

function originalPort(permission,invoke){
 return createAtlasT3DesktopStorePort({
  authorizeCommand:async(command,args)=>permission(command,args),
  invoke:async(command,args)=>invoke(command,args)
 });
}
const snapshot=empty();
const opened={generation:"atlas:original:1",snapshot,needsConfirmation:false};
const attempt=port=>port.commitSaved("atlas:original:1",snapshot);
test("An exact original pre-command refusal is DENIED, never dispatched",async()=>{
 for(const command of ["atlas_open","atlas_commit"]){
  const calls=[];
  const port=originalPort(async actual=>actual===command?false:true,
   async actual=>{calls.push(actual);return opened;});
  const action=command==="atlas_open"?()=>port.readSaved():()=>attempt(port);
  await assert.rejects(action,{code:command==="atlas_open"?
   "ATLAS_T3_U05_READ_DENIED":"ATLAS_T3_U05_WRITE_DENIED",
   outcome:"DENIED"});
  assert.deepEqual(calls,[],"The denied original Tauri operation cannot execute");
 }
});
test("Missing/stale original command evidence never becomes DENIED",async()=>{
 for(const absent of [null,undefined,{},0,"false"]){
  for(const command of ["atlas_open","atlas_commit"]){
   let calls=0;
   const port=originalPort(async actual=>actual===command?absent:true,
    async()=>{calls++;return opened;});
   const action=command==="atlas_open"?()=>port.readSaved():()=>attempt(port);
   await assert.rejects(action,error=>
    error?.code===(command==="atlas_open"?"ATLAS_T3_U05_READ_DENIED":
     "ATLAS_T3_U05_WRITE_DENIED")&&!Object.hasOwn(error,"outcome"));
   assert.equal(calls,0);
  }
 }
});
test("Native command IPC/CAS failures are not authoritative denials",async()=>{
 for(const failure of ["ATLAS_NATIVE_ACK_LOST","ATLAS_NATIVE_GENERATION_STALE"]){
  let invokes=0;
  const port=originalPort(async()=>true,async command=>{
   invokes++;
   if(command==="atlas_commit")throw Object.assign(Error(failure),{code:failure});
   return opened;
  });
  await assert.rejects(()=>attempt(port),error=>
   error?.code===failure&&!Object.hasOwn(error,"outcome"));
  assert.equal(invokes,1,"A failed commit acknowledgement cannot be retried");
 }
});
test("The original owner-supplied DENIED is never replaced by a wrapper",async()=>{
 const error=Object.assign(Error("Native installed Atlas denied"),
  {code:"ORIGINAL_U05_WRITE_DENIED",outcome:"DENIED"});
 const port=originalPort(async c=>{if(c==="atlas_commit")throw error;return true;},
  async()=>{throw Error("Native write must not run");});
 await assert.rejects(()=>attempt(port),caught=>caught===error);
});
test("Installed Atlas passes the three-valued authorization result intact",()=>{
 const src=readFileSync(new URL("../desktop/src/atlas-t3-installed-host.mjs",
  import.meta.url),"utf8");
 const store=readFileSync(new URL("../desktop/src/atlas-t3-store-port.mjs",
  import.meta.url),"utf8");
 assert.equal(src.includes("return result===true;"),false);
 assert.equal(src.includes("return ok===true;"),false);
 assert.match(src,/return result;/);
 assert.match(src,/active\(\);return ok;/);
 assert.match(store,/if\(permission===false\)deny\("ATLAS_T3_U05_WRITE_DENIED"\)/);
 assert.match(store,/if\(permission!==true\)fail\("ATLAS_T3_U05_WRITE_DENIED"\)/);
});

test("One-shot installed Atlas permission is consumed once per original U05 command",async()=>{
 const decisions=[],native=[];
 const port=createAtlasT3DesktopStorePort({
  authorizeCommand:async(command,args)=>{
   decisions.push(command);
   return true;
  },
  invoke:async(command,args)=>{
   native.push(command);
   return command==="atlas_open"?opened:{
    generation:"atlas:original:2",revision:snapshot.revision+1
   };
  }
 });
 assert.equal((await port.readSaved()).generation,opened.generation);
 assert.equal((await attempt(port)).generation,"atlas:original:2");
 assert.deepEqual(decisions,["atlas_open","atlas_commit"]);
 assert.deepEqual(native,["atlas_open","atlas_commit"]);
});

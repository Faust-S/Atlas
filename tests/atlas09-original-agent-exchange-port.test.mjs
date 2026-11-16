import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createOriginalAgentExchangeReceiptPort}
 from "../desktop/src/atlas-t3-original-agent-exchange.mjs";

const ref={workspace_id:"ws:original",object_id:"accepted:result",
 schema_id:"iwxa.result",revision:2};
const request=Object.freeze({
 sourceObjectRef:ref,taskId:"TASK:original-agent",
 resultId:"RESULT:human-accepted",
 archiveSha256:"a".repeat(64),recipientId:"iwxa.atlas"
});
const verified=Object.freeze({
 status:"VERIFIED",recipientId:"iwxa.atlas",taskId:request.taskId,
 resultId:request.resultId,archiveSha256:request.archiveSha256
});
test("Trusted installed Agent delegates exact original Exchange request and untouched receipt",async()=>{
 const inputs=[];
 const port=createOriginalAgentExchangeReceiptPort({
  async readOriginalExchangeReceipt(input){
   inputs.push(input);
   return verified;
  }
 });
 assert.ok(Object.isFrozen(port));
 const receipt=await port.readReceipt(request);
 assert.equal(receipt,verified,"No replacement, new signer or forged receipt");
 assert.deepEqual(inputs,[request]);
});
test("Original D6 Exchange refusal preserves exact owner error and DENIED",async()=>{
 const original=Object.assign(Error("Original signed grant revoked"),
  {code:"T3_AGENT_ATLAS_ORIGINAL_EXCHANGE_RECEIPT_UNVERIFIED",
   outcome:"DENIED"});
 const port=createOriginalAgentExchangeReceiptPort({
  readOriginalExchangeReceipt:async()=>{throw original;}
 });
 await assert.rejects(()=>port.readReceipt(request),e=>e===original);
});
test("Missing installed source owner, foreign recipient and no signed result fail closed",async()=>{
 assert.throws(()=>createOriginalAgentExchangeReceiptPort(),
  {code:"ATLAS_T3_ORIGINAL_AGENT_EXCHANGE_OWNER_REQUIRED"});
 let calls=0;
 const port=createOriginalAgentExchangeReceiptPort({
  readOriginalExchangeReceipt:async()=>{calls++;return null;}
 });
 await assert.rejects(()=>port.readReceipt({...request,recipientId:"other.product"}),
  {code:"ATLAS_T3_ORIGINAL_EXCHANGE_RECIPIENT_REQUIRED"});
 assert.equal(calls,0);
 assert.equal(await port.readReceipt(request),null,
  "An unavailable original receipt must never be replaced with VERIFIED");
 assert.equal(calls,1);
});
test("Compiled Atlas 0.9 Host reexports exact original installed Agent adapter",()=>{
 const source=readFileSync(new URL("../desktop/src/atlas-react-surface.tsx",
  import.meta.url),"utf8");
 assert.match(source,/export \{createOriginalAgentExchangeReceiptPort\}/);
 assert.doesNotMatch(source,/from ".*fake.*"/);
});

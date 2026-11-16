import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createOriginalAgentExchangeReceiptPort}
 from "../desktop/src/atlas-t3-original-agent-exchange.mjs";
import {empty,createProject,createItem,validate} from "../src/core.mjs";
import {createAtlasT3NativeRecipient} from "../src/atlas-t3-native-recipient.mjs";

const ref={workspace_id:"ws:original",object_id:"accepted:result",
 schema_id:"iwxa.result",revision:2};
const request=Object.freeze({
 sourceObjectRef:ref,taskId:"TASK:original-agent",
 resultId:"RESULT:human-accepted",
 archiveSha256:"a".repeat(64),recipientId:"iwxa.atlas"
});
const verified=Object.freeze({
 status:"VERIFIED",recipientId:"iwxa.atlas",taskId:request.taskId,
 resultId:request.resultId,archiveSha256:request.archiveSha256,
 originalSignatureVerified:true,archiveBytesVerified:true,
 originalManifestVerified:true,disclosureScope:"ORIGINAL_RESULT_ONLY",
 selectedSourceObjectRef:ref
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

test("Original Agent Exchange adapter feeds the existing Atlas D6 recipient and two cold store reads",async()=>{
 let saved=empty(),generation="native:0",writes=0,agentReads=0;
 const project=createProject(saved,{name:"Trusted Agent result"});saved=project.state;
 const work=createItem(saved,project.id,{title:"Read original accepted Result"});
 saved=work.state;
 const originalRef={projectId:project.id,workId:work.id,revision:String(saved.revision)};
 const accepted={acceptanceKind:"HUMAN_ACCEPTED_DRAFT",readOnly:true,
  sourceObjectRef:ref,workRef:originalRef,taskId:request.taskId,
  resultId:request.resultId,acceptedDigest:"c".repeat(64),
  archiveSha256:request.archiveSha256};
 const signedAgent={readOriginalExchangeReceipt:async exact=>{
  agentReads++;
  assert.equal(exact.recipientId,"iwxa.atlas");
  assert.equal(exact.taskId,request.taskId);
  assert.equal(exact.resultId,request.resultId);
  assert.equal(exact.archiveSha256,request.archiveSha256);
  assert.deepEqual(exact.sourceObjectRef,ref);
  return verified;
 }};
 const originalExchange=createOriginalAgentExchangeReceiptPort(signedAgent);
 const make=()=>createAtlasT3NativeRecipient({
  readSaved:async()=>({generation,snapshot:structuredClone(saved),
   needs_confirmation:false}),
  commitSaved:async(expected,snapshot)=>{
   assert.equal(expected,generation);
   validate(snapshot);saved=structuredClone(snapshot);
   generation="native:"+(++writes);return {generation,revision:saved.revision};
  },
  readOriginalAgentAccepted:async source=>{
   assert.deepEqual(source,ref);return accepted;
  },
  readOriginalExchangeReceipt:originalExchange.readReceipt,
  verifyAtlasWrite:async({operationId,recipientId,workRef})=>({
   allowed:true,operationId,recipientId,projectId:workRef.projectId,
   workId:workRef.workId,revision:workRef.revision
  }),
  isHostActive:()=>true
 });
 const before=make();
 const inspected=await before.inspect({reference:ref,recipientId:"iwxa.atlas"});
 assert.equal(inspected.status,"READY");
 await before.receive({operationId:inspected.operationId,recipientId:"iwxa.atlas",
  reference:ref,object:{...ref,deleted:false}});
 assert.equal(writes,1);
 const firstCold=make(),receipt=await firstCold.receipt(inspected.operationId);
 assert.equal(receipt.state,"COMMITTED");
 const secondCold=make(),readback=await secondCold.readback(inspected.operationId);
 assert.equal(readback.state,"PERSISTED");
 assert.equal(receipt.resultRef,readback.resultRef);
 assert.equal(writes,1,"No second Atlas commit during readback");
 assert.ok(agentReads>=3,"The original Agent Exchange owner is consulted on each read");
});

test("Installed Atlas uses already verified Agent Exchange reader when no separate original port is provided",()=>{
 const installed=readFileSync(new URL("../desktop/src/atlas-t3-installed-host.mjs",
  import.meta.url),"utf8");
 assert.equal(installed.split(
  "originalExchange??createOriginalAgentExchangeReceiptPort(originalAgent)"
 ).length-1,2,"Both trusted recipient and UI Host must use the same original delegate");
 assert.equal(installed.split(
  "readOriginalExchangeReceipt:input=>exchange.readReceipt(input)"
 ).length-1,2);
 assert.doesNotMatch(installed,/originalExchange\.readReceipt\(input\)/);
 assert.match(installed,/\[exchange,\["readReceipt"\]\]/);
});

// Cross-repo contract qualification against EXACT original public T3 sender.
// The upstream publisher uses fixtures for original crypto/Kernel owners;
// this is SOURCE integration, NOT evidence of installed signed transfer.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createTrustedAgentAtlasSourcePublisher}
 from "../t3-original/packages/t3-core/src/t3/native-agent-atlas-source-publisher.mjs";
import {createAtlasT3OriginalPublicationPort}
 from "../desktop/src/atlas-t3-original-publication.mjs";
const original=readFileSync(new URL(
 "../t3-original/packages/t3-core/src/t3/native-agent-atlas-source-publisher.mjs",
 import.meta.url),"utf8");
const atlas=readFileSync(new URL(
 "../desktop/src/atlas-t3-original-publication.mjs",import.meta.url),"utf8");
const installed=readFileSync(new URL(
 "../desktop/src/atlas-t3-installed-host.mjs",import.meta.url),"utf8");
const recipient=readFileSync(new URL(
 "../src/atlas-t3-native-recipient.mjs",import.meta.url),"utf8");

test("Atlas production routes use exact public original T3 publisher schema and recipient",()=>{
 assert.match(original,/IWXA_AGENT_T3_ORIGINAL_ATLAS_PUBLICATION\/1/);
 assert.match(original,/agent:t3:atlas:/);
 assert.match(original,/recipientId==="iwxa\.atlas"/);
 assert.match(original,/read_publication,publish_accepted/);
 assert.match(original,/read_published_for,read_published,read_receipt,read_latest_for_work/);
 assert.match(atlas,/recipientId:"iwxa\.atlas",purpose:"atlas\.result\.publish"/);
 assert.match(atlas,/publishAcceptedForWork/);
 assert.match(atlas,/recoverPublicationForWork/);
 assert.match(installed,/createOriginalAgentExchangeReceiptPort/);
 assert.doesNotMatch(atlas,/node:crypto|new WebSocket|fetch\(/);
});

test("Original publisher and Atlas consumer reject uninstalled signer/receipt owners",()=>{
 assert.throws(()=>createTrustedAgentAtlasSourcePublisher(),{
  code:"T3_D6_INSTALLED_ORIGINAL_PUBLISHER_REQUIRED",outcome:"DENIED"
 });
 assert.throws(()=>createAtlasT3OriginalPublicationPort(),{
  code:"ATLAS_T3_INSTALLED_PUBLICATION_OWNER_REQUIRED"
 });
});

test("Original T3 requires an isolated selected Result before original Kernel, Exchange and Atlas receive",()=>{
 assert.match(original,/inspectSelectedDisclosure\(/);
 assert.match(original,/status==="ORIGINAL_RESULT_ONLY"/);
 assert.match(original,/workspaceDisclosureIsolated===true/);
 assert.match(original,/originalRecipientGrantVerified===true/);
 assert.match(original,/disclosureScope==="ORIGINAL_RESULT_ONLY"/);
 assert.match(original,/originalSignatureVerified===true/);
 assert.match(original,/archiveBytesVerified===true/);
 assert.match(original,/originalManifestVerified===true/);
 assert.match(original,/selectedSourceObjectRef/);
 // Atlas does not assemble a second Exchange or let a browser supply the
 // signed publication. It delegates exact bytes to the original Agent owner.
 assert.doesNotMatch(atlas,/commitObjectGraph|publishSelectedResult|exportPackage/);
 assert.match(atlas,/originalExchange\.readReceipt\(/);
 for(const source of [atlas,recipient]){
  assert.match(source,/originalSignatureVerified!==true/);
  assert.match(source,/archiveBytesVerified!==true/);
  assert.match(source,/originalManifestVerified!==true/);
  assert.match(source,/disclosureScope!=="ORIGINAL_RESULT_ONLY"/);
  assert.match(source,/selectedSourceObjectRef/);
 }
});

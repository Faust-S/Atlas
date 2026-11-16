// Explicit adapter for the ORIGINAL installed Agent 0.6 Result owner's
// readOriginalExchangeReceipt() method. It delegates to the existing
// installed T3 Kernel/Exchange owner; Atlas does not issue, cache, sign,
// reconstruct, or validate a fake original Exchange receipt.
//
// Production use:
//  const originalExchange=createOriginalAgentExchangeReceiptPort(originalAgent);
//  const recipient=await createInstalledAtlasT3NativeRecipient({
//    originalAgent,originalExchange,atlasAuthority,hostLifecycle});
// The trusted installed Host supplies originalAgent, never the browser UI.
const fail=code=>{throw Object.assign(Error(code),{code});};
export function createOriginalAgentExchangeReceiptPort(originalAgent){
 if(typeof originalAgent?.readOriginalExchangeReceipt!=="function")
  fail("ATLAS_T3_ORIGINAL_AGENT_EXCHANGE_OWNER_REQUIRED");
 return Object.freeze({
  async readReceipt(request){
   // An original Agent reader is already bound to recipient iwxa.atlas.
   // Refuse UI or foreign-recipient queries before they reach that owner.
   if(!request||typeof request!=="object"||
      Array.isArray(request)||request.recipientId!=="iwxa.atlas")
    fail("ATLAS_T3_ORIGINAL_EXCHANGE_RECIPIENT_REQUIRED");
   // Preserve the EXACT original exception, especially outcome:"DENIED".
   // The native recipient independently verifies status, digest, Task ID,
   // Result ID, and exact addressee. Do not manufacture a VERIFIED receipt.
   return await originalAgent.readOriginalExchangeReceipt(request);
  }
 });
}

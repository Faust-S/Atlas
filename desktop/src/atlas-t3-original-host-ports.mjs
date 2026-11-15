// Trusted HOST composition for original Atlas + original Agent + original T3.
// This is an adapter over installed owner ports, never a network gateway,
// second Store, Task Engine, Publisher issuer, Kernel or Exchange.
import {createAtlasT3DesktopStorePort} from "./atlas-t3-store-port.mjs";
import {createAtlasT3NativeRecipient,createAtlasT3AgentTaskSelection}
 from "../../src/atlas-t3-native-recipient.mjs";

export function createAtlasT3OriginalHostPorts({
 invoke,authorizeCommand,
 authorizeAtlasProjectRead,issueOriginalAgentTask,readOriginalAgentTask,
 readOriginalAgentAccepted,readOriginalExchangeReceipt,verifyAtlasWrite,
 isHostActive
}={}){
 // Every external owner is mandatory; no fallback to a licence check or
 // direct receipt of unverified Task/Result text from a user interface.
 const store=createAtlasT3DesktopStorePort({invoke,authorizeCommand});
 const agent=createAtlasT3AgentTaskSelection({
  readSaved:store.readSaved,authorizeProjectRead:authorizeAtlasProjectRead,
  issueOriginalAgentTask,readOriginalAgentTask,isHostActive
 });
 const atlas=createAtlasT3NativeRecipient({
  readSaved:store.readSaved,commitSaved:store.commitSaved,
  readOriginalAgentAccepted,readOriginalExchangeReceipt,
  verifyAtlasWrite,isHostActive
 });
 return Object.freeze({issueTask:agent.issue,recipient:atlas});
}

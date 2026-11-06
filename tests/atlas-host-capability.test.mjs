import test from "node:test";
import assert from "node:assert/strict";
import {ATLAS_U03_DESCRIPTOR,atlasU04Presentation,atlasU03CapabilityStatus} from "../src/atlas-host-capability.mjs";

test("U03 descriptor declares one Atlas model and a React UI, not a second Task Store",()=>{
 const d=ATLAS_U03_DESCRIPTOR;
 assert.equal(d.schema,"IWXA_MODULE_DESCRIPTOR/1.0.0");
 assert.deepEqual(d.hostCompatibility.map(x=>x.hostId),["iwxa.atlas","iwxa.personal-agent"]);
 assert.equal(d.provides.find(x=>x.id==="atlas.project.read").version,"1.0.0");
 assert.equal(Object.keys(d).includes("registry"),false);
});
test("U04 embedding is not falsely promised for foreign windows",()=>{
 const unavailable=atlasU04Presentation().capabilities;
 assert.equal(unavailable.find(x=>x.mode==="EMBEDDED_VIEW").supported,false);
 assert.equal(unavailable.find(x=>x.mode==="LINKED_WINDOW").supported,false);
 const mounted=atlasU04Presentation({reactMountAvailable:true}).capabilities;
 assert.equal(mounted.find(x=>x.mode==="EMBEDDED_VIEW").supported,true);
 assert.equal(mounted.find(x=>x.mode==="LAUNCH").supported,false);
});
test("U03 UI status needs a mounted React surface AND a host-granted binding",()=>{
 const missing=atlasU03CapabilityStatus({mounted:true,hostAuthorized:false,observationRef:"session-1"});
 assert.equal(missing.available,false);
 assert.equal(missing.reason,"HOST_AUTHORIZATION_REQUIRED");
 assert.equal(atlasU03CapabilityStatus({mounted:true,hostAuthorized:true}).available,false);
 const verified=atlasU03CapabilityStatus({mounted:true,hostAuthorized:true,observationRef:"session-1"});
 assert.equal(verified.available,true);
 assert.equal(verified.observationRef,"session-1");
});

// Live public GitHub metadata qualification of the 12 preselected repositories.
// No private repository endpoints, no content download, no acceptance claims.
import assert from "node:assert/strict";
import {publicInventory} from "./fixtures/public-portfolio.mjs";
const token=process.env.GITHUB_TOKEN||"";
const headers={"accept":"application/vnd.github+json","user-agent":"iwxa-atlas-public-scale-qualification"};
if(token)headers.authorization="Bearer "+token;
async function get(url){
 const r=await fetch(url,{headers,signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error("Public GitHub HTTP "+r.status+" at "+new URL(url).pathname);
 return r.json();
}
const verified=[];
let pending=[...publicInventory.repositories];
async function worker(){
 while(pending.length){
  const r=pending.shift();
  const repo=await get(r.metadataUrl);
  assert.equal(repo.full_name?.toLowerCase(),r.fullName.toLowerCase());
  assert.equal(repo.id,r.id);
  assert.equal(repo.private,false);
  const branch=repo.default_branch;
  const b=await get("https://api.github.com/repos/"+r.fullName+"/branches/"+encodeURIComponent(branch));
  assert.match(b.commit?.sha||"",/^[0-9a-f]{40}$/i);
  verified.push({repo:r.fullName,id:r.id,defaultBranch:branch,liveHead:b.commit.sha,
   changedSinceCapture:branch!==r.defaultBranch||b.commit.sha!==r.defaultSha});
 }
}
try{
 await Promise.all(Array.from({length:3},()=>worker()));
 assert.equal(verified.length,12);
 const drift=verified.filter(x=>x.changedSinceCapture).length;
 for(const x of verified.sort((a,b)=>a.repo.localeCompare(b.repo)))
  console.log("ATLAS_PUBLIC_LIVE "+JSON.stringify(x));
 console.log("ATLAS_PUBLIC_LIVE_PASS "+JSON.stringify({repositories:verified.length,headDrift:drift,
  scope:"public default-branch metadata only",source:"GitHub REST API",noCompletenessClaim:true}));
}catch(e){console.error("ATLAS_PUBLIC_LIVE_HOLD "+(e.stack||e));process.exitCode=1}

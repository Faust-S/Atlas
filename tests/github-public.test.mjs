import test from "node:test";import assert from "node:assert/strict";import{repoName,observePublicRepo}from"../src/github-public.mjs";
test("normalizes plain names and urls",()=>{assert.equal(repoName("owner/repo"),"owner/repo");assert.equal(repoName("https://github.com/owner/repo.git"),"owner/repo")});
test("rejects invalid path",()=>{assert.throws(()=>repoName("https://evil.org/o/r"));assert.throws(()=>repoName("owner/../repo"))});
test("discovers working branches",async()=>{const f=async url=>({ok:true,json:async()=>url.includes("branches?")?[{name:"main"},{name:"work/feature"}]:{visibility:"public",default_branch:"main"}});const r=await observePublicRepo("o/r",f);assert.deepEqual(r.branches,["main","work/feature"]);assert.equal(r.readiness,"not_assessed")});
test("private source rejected",async()=>{await assert.rejects(observePublicRepo("o/r",async()=>({ok:true,json:async()=>({private:true})})),/Private/)});
test("errors surface",async()=>{await assert.rejects(observePublicRepo("o/r",async()=>({ok:false,status:403})),/403/)});

test("branch revision IDs and completeness are preserved",async()=>{const f=async url=>({ok:true,json:async()=>url.includes("branches?")?[{name:"main",commit:{sha:"abc123"}},{name:"work/fix",commit:{sha:"def456"}}]:{visibility:"public",default_branch:"main"}});const r=await observePublicRepo("o/r",f);assert.equal(r.branchHeads.main,"abc123");assert.equal(r.branchHeads["work/fix"],"def456");assert.equal(r.complete,true)});

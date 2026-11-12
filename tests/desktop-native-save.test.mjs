import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deserialize} from '../src/core.mjs';
import {commitWithReadback,readSavedSnapshotForReference} from '../desktop/src/native-save.mjs';

const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?
 Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;
const signature=v=>JSON.stringify(sort(v));
const snapshot={schema:'atlas.project/1',revision:2,projects:[]};
const prior={schema:'atlas.project/1',revision:1,projects:[]};
const base={expectedGeneration:'old',snapshot,signature,
 readValidated:v=>deserialize(JSON.stringify(v))};

test('native save verified by exact-generation readback without duplicate writes',async()=>{
 const calls=[];
 const result=await commitWithReadback({...base,invoke:async(command)=>{
  calls.push(command);
  return command==='atlas_commit'?{generation:'new',projectBlocksWritten:1}:
   {generation:'new',snapshot:{projects:snapshot.projects,revision:2,schema:'atlas.project/1'}};
 }});
 assert.deepEqual(calls,['atlas_commit','atlas_open']);
 assert.deepEqual(result,{generation:'new',projectBlocksWritten:1,reconciled:false});
});
test('lost commit reply reconciles persisted content using native open, not a second commit',async()=>{
 let writes=0;
 const result=await commitWithReadback({...base,invoke:async command=>{
  if(command==='atlas_commit'){writes++;throw Error('IPC acknowledgement lost');}
  return {generation:'new',snapshot};
 }});
 assert.equal(writes,1);
 assert.equal(result.reconciled,true);
 assert.equal(result.generation,'new');
});
test('real failed commit with unchanged head is not reported saved',async()=>{
 await assert.rejects(commitWithReadback({...base,invoke:async command=>{
  if(command==='atlas_commit')throw Error('write refused');
  return {generation:'old',snapshot:prior};
 }}),/write refused/);
});
test('readback mismatch or competing generation rejects a false save receipt',async()=>{
 await assert.rejects(commitWithReadback({...base,invoke:async command=>
  command==='atlas_commit'?{generation:'new'}:{generation:'new',snapshot:prior}
 }),/другой портфель/);
 await assert.rejects(commitWithReadback({...base,invoke:async command=>
  command==='atlas_commit'?{generation:'new'}:{generation:'other',snapshot}
 }),/другая редакция/);
});
test('one transient readback failure retries read, never repeats native write',async()=>{
 let writes=0,reads=0;
 const result=await commitWithReadback({...base,invoke:async command=>{
  if(command==='atlas_commit'){writes++;return {generation:'new',projectBlocksWritten:1};}
  if(++reads===1)throw Error('temporary open failure');
  return {generation:'new',snapshot};
 }});
 assert.equal(writes,1);assert.equal(reads,2);assert.equal(result.reconciled,false);
});
test('unverifiable save fails closed instead of blindly retrying commit',async()=>{
 let writes=0,reads=0;
 await assert.rejects(commitWithReadback({...base,invoke:async command=>{
  if(command==='atlas_commit'){writes++;return {generation:'new'};}
  reads++;throw Error('Disk unavailable');
 }}),/перезапустите Atlas/);
 assert.equal(writes,1);assert.equal(reads,2);
});
test('recovery-required native store is never reported as a successful save',async()=>{
 await assert.rejects(commitWithReadback({...base,invoke:async command=>
  command==='atlas_commit'?{generation:'new'}:
  {generation:'new',snapshot,needsConfirmation:true}
 }),/требует восстановления/);
});
test('React signature is memoized by domain data, not by tab or input renders',()=>{
 const ui=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 assert.match(ui,/const dataSignature=useMemo\(\(\)=>snapshotText\(data\),\[data\]\)/);
 assert.match(ui,/const dirty=ready&&dataSignature!==saved\.current/);
 assert.match(ui,/latestSnapshot\.current!==startedWith/);
 assert.match(ui,/const startedWith=latestSnapshot\.current/);
 assert.match(ui,/const startedSignature=snapshotText\(startedWith\)/);
 assert.match(ui,/saved\.current=startedSignature/);
});

test('saved WorkRef native recheck only reads, accepts value-preserving Rust key ordering',async()=>{
 let reads=0;
 const checked=await readSavedSnapshotForReference({...base,expectedGeneration:'generation-2',
  invoke:async command=>{assert.equal(command,'atlas_open');reads++;return {
   generation:'generation-2',needsConfirmation:false,
   snapshot:{projects:[],revision:2,schema:'atlas.project/1'}};
  }});
 assert.equal(reads,1);
 assert.deepEqual(checked,snapshot);
});
test('saved WorkRef refuses stale disk head, corrupt readback and recovery',async()=>{
 await assert.rejects(readSavedSnapshotForReference({...base,expectedGeneration:'generation-2',
  invoke:async()=>({generation:'generation-3',needsConfirmation:false,snapshot})}),/Портфель на диске изменился/);
 await assert.rejects(readSavedSnapshotForReference({...base,expectedGeneration:'generation-2',
  invoke:async()=>({generation:'generation-2',needsConfirmation:false,snapshot:prior})}),/Данные на диске отличаются/);
 await assert.rejects(readSavedSnapshotForReference({...base,expectedGeneration:'generation-2',
  invoke:async()=>({generation:'generation-2',needsConfirmation:true,snapshot})}),/требует восстановления/);
 await assert.rejects(readSavedSnapshotForReference({...base,expectedGeneration:'none',
  invoke:async()=>{throw Error('Should never call native');}}),/Сначала сохраните/);
});

test('Windows atomic head publication retries only temporary file sharing, preserving generation and old head',()=>{
 const rust=readFileSync(new URL('../desktop/src-tauri/src/lib.rs',import.meta.url),'utf8');
 assert.match(rust,/for attempt in 0\.\.40/);
 assert.match(rust,/matches!\(failure\.raw_os_error\(\), Some\(32 \| 33\)\)/);
 assert.match(rust,/attempt == 39/);
 assert.match(rust,/std::thread::sleep\(std::time::Duration::from_millis\(75\)\)/);
 assert.match(rust,/win32_transient_sharing_violation_keeps_atomic_commit_and_readback/);
 assert.match(rust,/win32_persistent_sharing_violation_preserves_original_head/);
 assert.match(rust,/assert_eq!\(fs::read\(&head\)\.unwrap\(\),bytes_before\)/);
 assert.match(rust,/let _guard=lock\(root\)\?/);
 assert.match(rust,/publish\(&root,&root\.join\("head\.json"\),&manifest_bytes\)\?/);
});

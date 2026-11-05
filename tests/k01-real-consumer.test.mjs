import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { empty,createProject,attach,observe,editProject,serialize,deserialize } from '../src/core.mjs';
import { createAtlasK01ContextHost } from '../src/k01-context-host.mjs';

const k01Url = new URL('../k01-public/modules/k01-context/index.mjs', import.meta.url);
const atlasPortUrl = new URL('../k01-public/modules/k01-context/integrations/atlas-project-source.mjs', import.meta.url);
const available=existsSync(fileURLToPath(k01Url))&&existsSync(fileURLToPath(atlasPortUrl));
const revision='a'.repeat(40),repository='Faust-S/knowledge',branch='main';
const observation={scope:'repository',repository,complete:true,branchHeads:{main:revision},branches:['main']};

test('pinned public K01 integrates with Atlas saved project snapshot and rejects stale ref',
{skip:!available&&!process.env.CI},async()=>{
 assert.ok(available,'K01 checkout required in integration CI');
 const source=await import(k01Url.href),adapter=await import(atlasPortUrl.href);
 assert.equal(source.CONTRACT_VERSION,'0.2.9');
 const created=createProject(empty(),{name:'K01 ESM integration',type:'research'});
 const attached=attach(created.state,created.id,'github',repository);
 let persisted=serialize(observe(attached.state,created.id,attached.id,'ok',observation));
 const get=()=>deserialize(persisted);
 const projectRef=()=>({projectId:created.id,sourceId:attached.id,revision:String(get().revision)});
 const k01={...source,atlasProjectSourceRef:adapter.atlasProjectSourceRef};
 const contextHost=createAtlasK01ContextHost({
   k01,
   openSavedSnapshot:async()=>get(),
   authorize:async({context})=>context?.workspaceId==='test',
   observationPort:async({projectId,sourceId,sourceRef})=>adapter.createAtlasProjectObservationPort({
     projectId,sourceId,repository,branch,
     pinnedItems:[{id:'one',type:'task',sourceRef,revision,
       estimatedTokens:6,epistemic:'observed',keywords:['task']}],
     getSnapshot:async()=>get(),
     observeRepository:async()=>observation,
     readEvidence:async()=>({observedRevision:revision,evidenceRef:'line:1',excerpt:'Task: verified.'})
   })
 });
 const spec={taskId:'task:k01',terms:['task'],maxTokens:100};
 const oldRef=projectRef();
 const projection=await contextHost.select(oldRef,{workspaceId:'test'},spec);
 assert.equal(projection.selected.length,1);
 assert.equal(projection.selected[0].excerpt,'Task: verified.');
 assert.match(projection.requestBinding,/^[a-f0-9]{64}$/);
 assert.equal((await contextHost.revalidate(oldRef,{workspaceId:'test'},spec,
    JSON.parse(JSON.stringify(projection)))).allCurrent,true);
 await assert.rejects(contextHost.select(oldRef,{workspaceId:'denied'},spec),/ATLAS_HOST_AUTHORIZATION_DENIED/);
 persisted=serialize(editProject(get(),created.id,{goal:'Revised goal'}));
 await assert.rejects(contextHost.revalidate(oldRef,{workspaceId:'test'},spec,projection),/ATLAS_SOURCE_REVISION_CHANGED/);
 const newRef=projectRef();
 const renewed=await contextHost.select(newRef,{workspaceId:'test'},spec);
 assert.equal(renewed.selected.length,1);
 assert.notEqual(renewed.requestBinding,projection.requestBinding);
 assert.equal((await contextHost.revalidate(newRef,{workspaceId:'test'},spec,renewed)).allCurrent,true);
 const tampered={...renewed,selected:[{...renewed.selected[0],excerpt:'Tampered'}]};
 const invalid=await contextHost.revalidate(newRef,{workspaceId:'test'},spec,tampered);
 assert.equal(invalid.allCurrent,false);
 assert.deepEqual(invalid.failures.map(x=>x.reason),['projection_modified']);
});

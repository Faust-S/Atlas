import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,attach,observe,editProject,serialize,deserialize} from '../src/core.mjs';
import {createAtlasK01DesktopService} from '../desktop/src/k01-desktop-source.mjs';

const repository='Faust-S/knowledge',branch='main',old='a'.repeat(40),fresh='b'.repeat(40);
const phrase='Delivery';
const document='Delivery: 8 working days.\nUnrelated: synthetic private marker.\n';
const data=Buffer.from(document).toString('base64');
function create(){
 const p=createProject(empty(),{name:'K01 demo',type:'research'});
 const a=attach(p.state,p.id,'github',repository);
 let head=old,stored=serialize(observe(a.state,p.id,a.id,'ok',{
   scope:'repository',repository,complete:true,branchHeads:{main:old},branches:[branch]
 }));
 let reads=0;
 const fetcher=async (url)=>{
   reads++;
   if(url.endsWith('/repos/'+repository))return {ok:true,json:async()=>({id:1,private:false,default_branch:branch})};
   if(url.includes('/branches?'))return {ok:true,json:async()=>[{name:branch,commit:{sha:head}}]};
   if(url.includes('/contents/'))return {ok:true,json:async()=>({type:'file',encoding:'base64',content:data})};
   throw Error('unexpected path');
 };
 const service=createAtlasK01DesktopService({
   openSavedSnapshot:async()=>deserialize(stored),
   authorize:async({context})=>context?.workspaceId==='allowed',
   fetcher
 });
 const args={projectId:p.id,sourceId:a.id,branch,path:'docs/example.md',phrase,
   context:{workspaceId:'allowed'}};
 return {service,args,get reads(){return reads},setHead:v=>{head=v},
   mutate:()=>{stored=serialize(editProject(deserialize(stored),p.id,{goal:'Changed goal'}))}};
}
test('desktop WebView-capable adapter selects line and revalidates current source',async()=>{
 const f=create();const saved=await f.service.select(f.args);
 assert.equal(saved.projection.selected[0].excerpt,'Delivery: 8 working days.');
 assert.equal(saved.projection.selected[0].evidenceRef,'line:1');
 assert.equal(saved.projection.selected[0].revision,old);
 assert.equal((await f.service.revalidate(saved,{context:f.args.context})).allCurrent,true);
 assert.equal(JSON.stringify(saved).includes('synthetic private marker'),false);
});
test('live GitHub head moves after selection: stored context becomes stale',async()=>{
 const f=create(),saved=await f.service.select(f.args);
 f.setHead(fresh);
 const result=await f.service.revalidate(saved,{context:f.args.context});
 assert.equal(result.allCurrent,false);
 assert.deepEqual(result.failures.map(x=>x.reason),['stale']);
});
test('host project edits invalidate selection even when document is unchanged',async()=>{
 const f=create(),saved=await f.service.select(f.args);
 f.mutate();
 await assert.rejects(f.service.revalidate(saved,{context:f.args.context}),/ATLAS_SOURCE_REVISION_CHANGED/);
});
test('deny source permission before reading GitHub data',async()=>{
 const f=create();
 const initial=f.reads;
 await assert.rejects(f.service.select({...f.args,context:{workspaceId:'denied'}}),/ATLAS_HOST_AUTHORIZATION_DENIED/);
 assert.equal(f.reads,initial);
});
test('reject ambiguous/unavailable source, invalid path and bad query',async()=>{
 const f=create();
 await assert.rejects(f.service.select({...f.args,path:'../secret.txt'}),/укажите путь/);
 await assert.rejects(f.service.select({...f.args,phrase:''}),/точную фразу/);
 await assert.rejects(f.service.select({...f.args,branch:'missing'}),/проверенную редакцию/);
});

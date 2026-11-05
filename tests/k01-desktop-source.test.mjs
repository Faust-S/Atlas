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

test('actual Atlas-style complete GitHub summary produces one K01 candidate', async () => {
 const project=createProject(empty(),{name:'Source completeness',type:'research'});
 const attached=attach(project.state,project.id,'github',repository);
 const fullSummary={
  scope:'repository',repository,repositoryId:456,defaultBranch:branch,
  complete:true,branches:[branch],branchHeads:{[branch]:old},
  observedAt:'2026-11-05T11:00:00.000Z',
  provenance:{provider:'github',access:'public',endpoint:'https://api.github.com/repos/'+repository},
  readiness:'not_assessed'
 };
 const saved=serialize(observe(attached.state,project.id,attached.id,'ok',fullSummary));
 let nativeReads=0,publicReads=0,evidenceReads=0;
 const fetcher=async url=>{
  publicReads++;
  if(url.endsWith('/repos/'+repository))
   return {ok:true,json:async()=>({id:456,private:false,default_branch:branch})};
  if(url.includes('/branches?'))
   return {ok:true,json:async()=>[{name:branch,commit:{sha:old}}]};
  if(url.includes('/contents/')){
   evidenceReads++;
   return {ok:true,json:async()=>({type:'file',encoding:'base64',content:data})};
  }
  throw Error('Unexpected Github route');
 };
 const service=createAtlasK01DesktopService({
  openSavedSnapshot:async()=>{nativeReads++;return deserialize(saved)},
  authorize:async()=>true,fetcher
 });
 const selected=await service.select({
  projectId:project.id,sourceId:attached.id,branch,
  path:'AGENTS.md',phrase,context:{workspaceId:'atlas-local'}
 });
 assert.equal(selected.projection.selected.length,1);
 assert.equal(selected.projection.omissions.length,0);
 assert.equal(selected.projection.selected[0].excerpt,'Delivery: 8 working days.');
 assert.ok(nativeReads>=2);
 assert.ok(publicReads>=2);
 assert.equal(evidenceReads,1);
});

test('exact live-style branch and unique phrase select by source type, not user phrase metadata',async()=>{
 const project=createProject(empty(),{name:'Live-shaped source',type:'research'});
 const attached=attach(project.state,project.id,'github',repository);
 const liveBranch='work/2026-11-04-k01-knowledge-context-kit';
 const liveRevision='217debaad8a17b19b7ef883eca07dccc045ec9a8';
 const unique='Task Discovery / Activity Research / U1 / Cross-Lab';
 const line='1. **Task Discovery / Activity Research / U1 / Cross-Lab:** synthetic context.';
 const snapshot=serialize(observe(attached.state,project.id,attached.id,'ok',{
  scope:'repository',repository,complete:true,branches:[liveBranch],
  branchHeads:{[liveBranch]:liveRevision},readiness:'not_assessed',
  provenance:{provider:'github',access:'public'},repositoryId:99
 }));
 let calls=0;
 const fetcher=async url=>{
  calls++;
  if(url.endsWith('/repos/'+repository))
   return {ok:true,json:async()=>({id:99,private:false,default_branch:'main'})};
  if(url.includes('/branches?'))
   return {ok:true,json:async()=>[{name:liveBranch,commit:{sha:liveRevision}}]};
  if(url.includes('/contents/')){
   assert.ok(url.includes('AGENTS.md?ref='+liveRevision));
   return {ok:true,json:async()=>({type:'file',encoding:'base64',
    content:Buffer.from(line+'\nOther line.').toString('base64')})};
  }
  throw Error('Unexpected public GitHub route');
 };
 const service=createAtlasK01DesktopService({
  openSavedSnapshot:async()=>deserialize(snapshot),authorize:async()=>true,fetcher
 });
 const selected=await service.select({projectId:project.id,sourceId:attached.id,
  branch:liveBranch,path:'AGENTS.md',phrase:unique,context:{workspaceId:'atlas-local'}});
 assert.deepEqual(selected.request.terms,['github-file']);
 assert.ok(selected.request.profile.includes(unique));
 assert.equal(selected.projection.selected.length,1);
 assert.equal(selected.projection.selected[0].excerpt,line);
 assert.ok(calls>=3);
 assert.equal((await service.revalidate(selected,{context:{workspaceId:'atlas-local'}})).allCurrent,true);
});

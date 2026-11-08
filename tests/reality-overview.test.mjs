import test from 'node:test';
import assert from 'node:assert/strict';
import {realityOverview} from '../src/reality-overview.mjs';
import {empty,createProject,createItem,editItem,serialize,deserialize} from '../src/core.mjs';
import {addTarget,recordFinding,planChange,decideChange,compareProject} from '../src/trace.mjs';
import {projectImpact} from '../src/impact.mjs';
const project=()=>({id:'p',items:[],sources:[],decisions:[],changes:[]});
const trace=rows=>({projectId:'p',rows});
const impact=rows=>({projectId:'p',rows});
const target=(id,overrides={})=>({id,title:id,desired:'expected',intent:'committed',assessment:'unknown',latest:null,freshness:{state:'never',note:'No evidence'},relatedChanges:[],...overrides});
const impactRow=(targetId,overrides={})=>({targetId,priority:true,reasons:['Missing evidence'],work:[],openWork:0,...overrides});
test('no targets: zero inferred completion and no writes',()=>{
 const p=project(),before=JSON.stringify(p);
 assert.deepEqual(realityOverview(p,trace([]),impact([])), {projectId:'p',rows:[],count:0,attention:0,unlinkedChanges:0,independentAcceptance:false});
 assert.equal(JSON.stringify(p),before);
});
test('claims carry provenance without turning manual acceptance into verified evidence',()=>{
 const p=project();p.sources=[{id:'s',locator:'example/eng'}];
 const r=target('release',{assessment:'acceptance_claim',latest:{sourceId:'s',result:'present',level:'acceptance',ref:'main',revision:'abc',observedAt:'2026-11-08T00:00:00Z',note:'manual review'},freshness:{state:'current_revision',note:'SHA matches'}});
 const o=realityOverview(p,trace([r]),impact([impactRow('release',{priority:false})]));
 assert.equal(o.rows[0].source.locator,'example/eng');
 assert.equal(o.rows[0].source.revision,'abc');
 assert.equal(o.rows[0].assessment,'acceptance_claim');
 assert.equal(o.rows[0].observation.level,'acceptance');
 assert.equal(o.independentAcceptance,false);
});
test('stale and affected requirements take priority, actual plan apply and linked decision remain distinct',()=>{
 const p=project();
 p.changes=[{id:'c',title:'Revise release',targetIds:['release'],status:'approved',planAppliedAt:'2026-11-08T00:00:00Z'}, {id:'unlinked',targetIds:[],status:'proposed'}];
 p.decisions=[{changeId:'c',text:'Approved after review',at:'2026-11-08T00:00:00Z'}];
 const candidate=target('candidate',{intent:'candidate'});
 const stale=target('release',{assessment:'stale',relatedChanges:[{id:'c',title:'Revise release',status:'approved'}]});
 const o=realityOverview(p,trace([candidate,stale]),impact([impactRow('candidate',{priority:false}),impactRow('release',{priority:true,openWork:2,work:[{id:'one'},{id:'two'}],reasons:['SHA changed','Blocked work']})]));
 assert.equal(o.rows[0].id,'release');
 assert.equal(o.rows[0].openWork,2);
 assert.deepEqual(o.rows[0].reasons,['SHA changed','Blocked work']);
 assert.equal(o.rows[0].change.status,'approved');
 assert.equal(o.rows[0].change.planApplied,true);
 assert.equal(o.rows[0].change.decision,'Approved after review');
 assert.equal(o.unlinkedChanges,1);
});
test('missing/incorrect projections are rejected rather than silently joined across projects',()=>{
 assert.throws(()=>realityOverview(project(),{projectId:'foreign',rows:[]},impact([])),/Invalid Atlas/);
 assert.throws(()=>realityOverview(project(),trace([]),{projectId:'foreign',rows:[]}),/Invalid Atlas/);
});
test('real Atlas core facts, linked work and change survive read-only overview without a new store',()=>{
 const created=createProject(empty(),{name:'Delivery',type:'engineering'});
 let s=addTarget(created.state,created.id,{title:'Work completed',desired:'Accepted output'}).state;
 const existingId=s.projects[0].targets[0].id;
 const item=createItem(s,created.id,{title:'Prepare result'});
 s=editItem(item.state,created.id,item.id,{targetIds:[existingId]});
 s=recordFinding(s,created.id,{targetId:existingId,result:'present',level:'acceptance',note:'Manually claimed'}).state;
 const change=planChange(s,created.id,{title:'Review delivery',targetIds:[existingId]});
 s=decideChange(change.state,created.id,change.id,{status:'approved',rationale:'Human approved the change'}).state;
 const before=JSON.stringify(s);
 const out=realityOverview(s.projects[0],compareProject(s.projects[0]),projectImpact(s.projects[0]));
 assert.equal(out.rows[0].id,existingId);
 assert.equal(out.rows[0].assessment,'acceptance_claim');
 assert.equal(out.rows[0].workCount,1);
 assert.equal(out.rows[0].change.status,'approved');
 assert.equal(out.rows[0].change.planApplied,false);
 assert.equal(out.independentAcceptance,false);
 assert.equal(JSON.stringify(s),before);
});

test("a deep-linked requirement beyond initial page remains source-bound and non-mutating",()=>{
 const created=createProject(empty(),{name:'Twelve criteria',type:'engineering'});
 let state=created.state;
 const ids=[];
 for(let i=0;i<12;i++){
  const record=addTarget(state,created.id,{title:'Criterion '+i,desired:'Verified '+i});
  state=record.state;ids.push(record.id);
 }
 const before=JSON.stringify(state),project=state.projects[0];
 const overview=realityOverview(project,compareProject(project),projectImpact(project));
 assert.equal(overview.count,12);
 assert.equal(overview.rows.findIndex(row=>row.id===ids[10]),10);
 assert.equal(Math.max(8,10+1),11);
 assert.equal(overview.independentAcceptance,false);
 assert.equal(JSON.stringify(state),before);
});

test('one observed cause follows the existing proposal, decision, and work requirement without mutation',()=>{
 const made=createProject(empty(),{name:'Cause demo',type:'engineering'});
 let snapshot=addTarget(made.state,made.id,{title:'Release criterion',desired:'Approval'}).state;
 const targetId=snapshot.projects[0].targets[0].id;
 const show=()=>realityOverview(snapshot.projects[0],compareProject(snapshot.projects[0]),projectImpact(snapshot.projects[0]));
 const first=show().rows[0];
 assert.equal(first.cause.key,'target-review:'+targetId);
 assert.equal(first.cause.needsProposal,true);
 assert.equal(first.cause.activeChange,null);
 const before=JSON.stringify(snapshot);
 show();assert.equal(JSON.stringify(snapshot),before);
 const proposal=planChange(snapshot,made.id,{title:'Close release gap',description:'Require evidence',
  targetIds:[targetId],causeKey:first.cause.key});
 snapshot=proposal.state;
 const open=show().rows[0];
 assert.equal(open.cause.needsProposal,false);
 assert.equal(open.cause.activeChange.id,proposal.id);
 assert.equal(open.cause.activeChange.status,'proposed');
 snapshot=decideChange(snapshot,made.id,proposal.id,{status:'approved',rationale:'Human rationale'}).state;
 const final=show().rows[0];
 assert.equal(final.cause.activeChange.status,'approved');
 assert.equal(final.cause.approvedWithoutWork,true);
 assert.equal(final.change.decision,'Human rationale');
 assert.equal(show().independentAcceptance,false);
});

test('active cause-bound decision takes priority over a newer unrelated proposal on the same target',()=>{
 const made=createProject(empty(),{name:'Mixed changes',type:'engineering'});
 let state=addTarget(made.state,made.id,{title:'Release',desired:'Approved evidence'}).state;
 const targetId=state.projects[0].targets[0].id;
 const active=planChange(state,made.id,{title:'Resolve observed cause',description:'Evidence audit',
  targetIds:[targetId],causeKey:'target-review:'+targetId});
 state=decideChange(active.state,made.id,active.id,{status:'approved',
  rationale:'Approve audited corrective action'}).state;
 const generic=planChange(state,made.id,{title:'Unrelated later proposal',
  description:'Other work',targetIds:[targetId]});
 state=generic.state;
 const before=JSON.stringify(state);
 const overview=realityOverview(state.projects[0],compareProject(state.projects[0]),projectImpact(state.projects[0]));
 const row=overview.rows[0];
 assert.equal(row.cause.activeChange.id,active.id);
 assert.equal(row.change.id,active.id,'An unrelated newer proposal must not mask active root-cause work');
 assert.equal(row.change.status,'approved');
 assert.equal(row.change.decision,'Approve audited corrective action');
 assert.equal(overview.independentAcceptance,false);
 assert.equal(JSON.stringify(state),before);
});

test('approved observed cause acquires linked work only by explicit separate creation',()=>{
 const made=createProject(empty(),{name:'Approved without automatic work',type:'engineering'});
 let s=addTarget(made.state,made.id,{title:'Expected output',desired:'Verified delivery'}).state;
 const id=s.projects[0].targets[0].id, causeKey='target-review:'+id;
 const change=planChange(s,made.id,{title:'Correct evidence gap',description:'Review',
  targetIds:[id],causeKey});
 s=decideChange(change.state,made.id,change.id,{status:'approved',rationale:'Reviewed'}).state;
 const overview=()=>realityOverview(s.projects[0],compareProject(s.projects[0]),projectImpact(s.projects[0]));
 assert.equal(overview().rows[0].cause.approvedWithoutWork,true);
 assert.equal(s.projects[0].items.length,0,'Approval alone must not create work');
 const work=createItem(s,made.id,{title:'Verify linked output',targetIds:[id],changeId:change.id});
 s=work.state;
 const linked=s.projects[0].items.find(item=>item.id===work.id);
 assert.equal(linked.changeId,change.id);
 assert.deepEqual(linked.targetIds,[id]);
 assert.equal(linked.state,'todo');
 assert.equal(linked.executor,null);
 assert.equal(overview().rows[0].cause.approvedWithoutWork,false);
 assert.equal(overview().independentAcceptance,false);
});

test('completed linked work remains a claim until separately recorded target evidence',()=>{
 const made=createProject(empty(),{name:'Delivery facts',type:'engineering'});
 let state=addTarget(made.state,made.id,{title:'Deliver application',desired:'Audited output'}).state;
 const targetId=state.projects[0].targets[0].id;
 const produced=createItem(state,made.id,{title:'Implement and test',targetIds:[targetId]});
 state=editItem(produced.state,made.id,produced.id,{state:'done'});
 const before=JSON.stringify(state);
 const report=()=>realityOverview(state.projects[0],compareProject(state.projects[0]),projectImpact(state.projects[0]));
 const missing=report().rows[0];
 assert.equal(missing.workCount,1);
 assert.equal(missing.openWork,0);
 assert.deepEqual(missing.work,[{id:produced.id,title:'Implement and test',state:'done'}]);
 assert.equal(missing.assessment,'unknown');
 assert.equal(missing.observation,null);
 assert.equal(report().independentAcceptance,false);
 assert.equal(JSON.stringify(state),before);
 state=recordFinding(state,made.id,{targetId,result:'present',level:'implementation',note:'User-reported result'}).state;
 const claimed=report().rows[0];
 assert.equal(claimed.assessment,'implemented_claim');
 assert.equal(claimed.observation.result,'present');
 assert.equal(report().independentAcceptance,false);
});

test('a manual observation after human approval survives roundtrip without completing linked work',()=>{
 const made=createProject(empty(),{name:'Native observation',type:'engineering'});
 let state=addTarget(made.state,made.id,{title:'Output',desired:'Reviewed delivery'}).state;
 const targetId=state.projects[0].targets[0].id;
 const change=planChange(state,made.id,{title:'Recheck output',targetIds:[targetId],
  causeKey:'target-review:'+targetId});
 state=decideChange(change.state,made.id,change.id,{status:'approved',rationale:'Human review'}).state;
 const created=createItem(state,made.id,{title:'Collect evidence',targetIds:[targetId],changeId:change.id});
 state=recordFinding(created.state,made.id,{targetId,result:'partial',level:'implementation',
  note:'Manual observation; independent review pending'}).state;
 const after=deserialize(serialize(state));
 const p=after.projects[0],view=realityOverview(p,compareProject(p),projectImpact(p));
 assert.equal(p.items.find(i=>i.id===created.id).state,'todo');
 assert.equal(p.items.find(i=>i.id===created.id).changeId,change.id);
 assert.equal(p.changes.find(c=>c.id===change.id).status,'approved');
 assert.equal(p.findings.length,1);
 assert.equal(p.findings[0].origin,'manual');
 assert.equal(p.findings[0].sourceId,null);
 assert.equal(view.rows[0].observation.result,'partial');
 assert.equal(view.rows[0].assessment,'partial_reported');
 assert.equal(view.rows[0].work[0].state,'todo');
 assert.equal(view.independentAcceptance,false);
 assert.equal(serialize(after),serialize(state));
});

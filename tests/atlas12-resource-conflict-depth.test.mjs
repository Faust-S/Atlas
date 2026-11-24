import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,createProject,editProject,createItem,editItem,serialize} from '../src/core.mjs';
import {addPlanningResource} from '../src/resource-planning.mjs';
import {portfolioResources,resourceConflictDifference,projectResourceReassignment} from '../src/portfolio-resources.mjs';
import {previewWorkResourceReassignment} from '../src/resource-alternatives.mjs';
import {portfolioSchedule} from '../src/portfolio-schedule.mjs';

function fixture(){
 const p=createProject(empty(),{name:'Assembly',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23'});
 const a=addPlanningResource(s,{label:'A',capacityPct:100});
 const b=addPlanningResource(a.state,{label:'B',capacityPct:100});
 s=b.state;
 const works=[];
 for(const [resourceId,allocationPct] of [[a.id,70],[a.id,60],[a.id,60],[b.id,70],[b.id,50]]){
  const w=createItem(s,p.id,{title:'W'+works.length,resourceId,allocationPct});
  s=editItem(w.state,p.id,w.id,{estimateDays:3});works.push(w.id);
 }
 return {s,pid:p.id,a:a.id,b:b.id,w:works[1]};
}
test('Equal conflict-day totals do not conceal changed overload depth or a tradeoff',()=>{
 const f=fixture(),saved=serialize(f.s);
 const forecast=portfolioSchedule(f.s),view=portfolioResources(f.s,{schedule:forecast});
 const result=previewWorkResourceReassignment(f.s,{projectId:f.pid,workId:f.w,targetResourceId:f.b},{schedule:forecast,resources:view});
 assert.equal(result.overloadDaysDelta,0);
 assert.equal(result.overloadPctDaysDelta,0);
 assert.equal(result.original.overloadResourceDays,6);
 assert.equal(result.source.overloadPctDays,270);
 assert.equal(result.proposedSource.overloadPctDays,90);
 assert.equal(result.target.overloadPctDays,60);
 assert.equal(result.proposedTarget.overloadPctDays,240);
 assert.equal(result.constraints.classification,'TRADEOFF');
 assert.equal(result.constraints.severity.find(x=>x.resourceId===f.a).delta,-180);
 assert.equal(result.constraints.severity.find(x=>x.resourceId===f.b).delta,180);
 const projection=projectResourceReassignment(view,{projectId:f.pid,workId:f.w,targetResourceId:f.b});
 const a=resourceConflictDifference(projection.source,projection.sourceAfter);
 const b=resourceConflictDifference(projection.target,projection.targetAfter);
 assert.equal(a.count,1);assert.equal(a.totals.RELIEVED,3);
 assert.equal(b.count,1);assert.equal(b.totals.WORSENED,3);
 assert.equal(a.rows[0].beforeExcessPct,90);assert.equal(a.rows[0].afterExcessPct,30);
 assert.equal(b.rows[0].beforeExcessPct,20);assert.equal(b.rows[0].afterExcessPct,80);
 const changed=editItem(f.s,f.pid,f.w,{resourceId:f.b});
 const actual=portfolioResources(changed,{schedule:forecast});
 assert.equal(result.alternative.overloadPctDays,actual.people.reduce((n,x)=>n+x.overloadPctDays,0));
 assert.equal(serialize(f.s),saved);
});

test('Equal aggregate overload depth and days may hide exact cleared and newly affected dates',()=>{
 const f=fixture(),a=portfolioResources(f.s).byId.get(f.a);
 const shifted=editProject(f.s,f.pid,{startDate:'2026-11-25'});
 const b=portfolioResources(shifted).byId.get(f.a);
 assert.equal(a.overloadDays,b.overloadDays);
 assert.equal(a.overloadPctDays,b.overloadPctDays);
 const all=resourceConflictDifference(a,b);
 assert.equal(all.count,2);
 assert.deepEqual(all.totals,{NEW:2,CLEARED:2,WORSENED:0,RELIEVED:0,CHANGED_KIND:0});
 assert.equal(all.rows[0].kind,'CLEARED');assert.equal(all.rows[0].startDate,'2026-11-23');
 assert.equal(all.rows[0].endDate,'2026-11-24');
 assert.equal(all.rows[1].kind,'NEW');assert.equal(all.rows[1].startDate,'2026-11-26');
 assert.equal(all.rows[1].endDate,'2026-11-27');
 assert.deepEqual(resourceConflictDifference(a,b,{offset:1,limit:1}).rows,[all.rows[1]]);
 assert.equal(resourceConflictDifference(a,a).count,0);
});

test('Availability has priority and uses occupied load rather than fabricated excess capacity',()=>{
 const f=fixture();f.s.resources[0].availableUntil='2026-11-23';
 const original=portfolioResources(f.s).byId.get(f.a);
 assert.equal(original.overloadDays,1);
 assert.equal(original.overloadPctDays,90);
 assert.equal(original.unavailableDays,2);
 assert.equal(original.unavailablePctDays,380);
 assert.equal(original.peakExcessPct,90);
 const p=projectResourceReassignment(portfolioResources(f.s),{projectId:f.pid,workId:f.w,targetResourceId:f.b});
 const changed=resourceConflictDifference(p.source,p.sourceAfter);
 assert.equal(changed.count,2);
 assert.equal(changed.rows[0].beforeKind,'overload');
 assert.equal(changed.rows[1].beforeKind,'availability');
 assert.equal(changed.rows[1].beforeExcessPct,190);
 assert.equal(changed.rows[1].afterExcessPct,130);
 assert.equal(p.sourceAfter.unavailablePctDays,260);
 assert.throws(()=>resourceConflictDifference(p.source,p.target),/Invalid/);
});

// Both downstream works move together. Their resource totals stay equal,
// but the old and new conflict dates must not be called unchanged.
test('Sequence reports relocated downstream overload with equal aggregate metrics',async()=>{
 const {addPortfolioLink}=await import('../src/portfolio.mjs');
 const {compareResourceSequenceAlternatives}=await import('../src/resource-sequence-alternatives.mjs');
 const p=createProject(empty(),{name:'Source',type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23'});
 const a=addPlanningResource(s,{label:'Crane',capacityPct:100});
 const b=addPlanningResource(a.state,{label:'Team',capacityPct:100});s=b.state;
 const w=[];
 for(const allocationPct of [70,60]){
  const item=createItem(s,p.id,{title:'A'+w.length,resourceId:a.id,allocationPct});
  s=editItem(item.state,p.id,item.id,{estimateDays:3});w.push(item.id);
 }
 const q=createProject(s,{name:'Downstream',type:'engineering'});
 s=editProject(q.state,q.id,{startDate:'2026-11-23'});
 for(const title of ['B1','B2']){
  const item=createItem(s,q.id,{title,resourceId:b.id,allocationPct:70});
  s=editItem(item.state,q.id,item.id,{estimateDays:2});
 }
 s=addPortfolioLink(s,{from:p.id,to:q.id});
 const before=serialize(s);
 const r=compareResourceSequenceAlternatives(s,{projectId:p.id,firstWorkId:w[0],secondWorkId:w[1]});
 for(const o of r.alternatives){
  assert.equal(o.valid,true);
  const t=o.resourceExamples.find(x=>x.id===b.id);
  assert.equal(t.overloadDelta,0);assert.equal(t.overloadDepthDelta,0);
  assert.equal(t.peakDelta,0);assert.equal(t.worsened,true);assert.equal(t.improved,true);
  assert.equal(t.periodChanges.totals.NEW,2);assert.equal(t.periodChanges.totals.CLEARED,2);
  assert.equal(t.periodChanges.rows[0].startDate,'2026-11-26');
  assert.equal(t.periodChanges.rows[1].startDate,'2026-11-29');
 }
 assert.equal(serialize(s),before);
});

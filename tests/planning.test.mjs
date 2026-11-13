import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleProject,scheduleChangeSummary,scheduleDeadlineExplanations,criticalPathFocus,forecastDependencyRemoval } from '../src/planning.mjs';
import toposort from '../src/vendor/toposort.mjs';
const project=(items,dependencies=[],startDate='2026-11-01')=>({items:items.map(([id,estimateDays=1,state='todo'])=>({id,title:id,estimateDays,state})),dependencies:dependencies.map(([from,to])=>({from,to})),startDate});
test('upstream topological core orders dependencies including isolated items',()=>{const order=toposort.array(['a','b','c','d'],[['a','b'],['b','c']]);assert(order.indexOf('a')<order.indexOf('b'));assert(order.indexOf('b')<order.indexOf('c'));assert(order.includes('d'));});
test('upstream core refuses cycles and unknown nodes',()=>{assert.throws(()=>toposort.array(['a','b'],[['a','b'],['b','a']]),/Cyclic/);assert.throws(()=>toposort.array(['a'],[['a','z']]),/Unknown/)});
test('linear critical path',()=>{const r=scheduleProject(project([['a',3],['b',2],['c',1]],[['a','b'],['b','c']]));assert.equal(r.durationDays,6);assert.deepEqual(r.criticalIds,['a','b','c']);assert.equal(r.estimatedFinish,'2026-11-07');});
test('parallel paths and float',()=>{const r=scheduleProject(project([['a',3],['b',1],['c',4],['d',2]],[['a','c'],['b','c'],['c','d']]));assert.equal(r.durationDays,9);assert.equal(r.rows.find(x=>x.id==='b').floatDays,2);assert.deepEqual(r.criticalIds,['a','c','d']);});
test('independent branch float',()=>{const r=scheduleProject(project([['a',5],['b',2],['c',1]],[['b','c']]));assert.equal(r.durationDays,5);assert.equal(r.rows.find(x=>x.id==='b').floatDays,2)});
test('empty project',()=>{const r=scheduleProject(project([]));assert.equal(r.durationDays,0);assert.equal(r.rows.length,0)});
test('zero-day milestone',()=>{const r=scheduleProject(project([['a',2],['m',0]],[['a','m']]));assert.deepEqual(r.criticalIds,['a','m'])});
test('blocked predecessors do not certify acceptance',()=>{const r=scheduleProject(project([['a',1,'todo'],['b',2,'todo']],[['a','b']]));assert.deepEqual(r.rows.find(x=>x.id==='b').blockedBy,['a']);assert.match(r.warning,/not release acceptance/)});
test('completed predecessor unblocks',()=>{const r=scheduleProject(project([['a',1,'done'],['b',2,'todo']],[['a','b']]));assert.deepEqual(r.rows.find(x=>x.id==='b').blockedBy,[])});
test('invalid estimates',()=>{for(const n of [-1,1.5,36600,NaN])assert.throws(()=>scheduleProject(project([['a',n]])),/estimateDays/)});
test('cycle and missing endpoint',()=>{assert.throws(()=>scheduleProject(project([['a'],['b']],[['a','b'],['b','a']])),/Cyclic/);assert.throws(()=>scheduleProject(project([['a']],[['a','unknown']])),/missing item/)});
test('invalid starting date',()=>{assert.throws(()=>scheduleProject(project([['a',1]],[],'2026-02-31')),/Invalid project start date/)});
test('CPM year overflow never produces a malformed calendar date',()=>{
 const result=scheduleProject(project([['a',120]],[],'9999-11-01'));
 assert.equal(result.durationDays,120);
 assert.equal(result.rows[0].startDate,'9999-11-01');
 assert.equal(result.rows[0].finishDate,null);
 assert.equal(result.estimatedFinish,null);
});
test('compatible dependency edge shapes',()=>{const p=project([['a',2],['b',3]]);p.dependencies=[{fromId:'a',toId:'b'}];assert.equal(scheduleProject(p).durationDays,5)});

test('comparison reports shifted existing work but excludes newly created work',()=>{
 const original=project([['a',3],['b',2],['c',2],['d',1]],[['b','c']]);
 const addedLink=project([['a',3],['b',2],['c',2],['d',1]],[['a','b'],['b','c']]);
 const before=scheduleProject(original),after=scheduleProject(addedLink);
 const oldText=JSON.stringify(before),newText=JSON.stringify(after);
 const changed=scheduleChangeSummary(before,after);
 assert.equal(changed.durationBefore,4);
 assert.equal(changed.durationAfter,7);
 assert.equal(changed.movedTotal,2);
 assert.equal(changed.delayedTotal,2);
 assert.equal(changed.earlierTotal,0);
 assert.deepEqual(new Set(changed.affectedIds),new Set(['a','b','c']));
 assert.deepEqual(changed.examples.map(x=>x.shiftDays),[0,3,3]);
 assert.equal(changed.examples[0].newCritical,true);
 assert.equal(changed.criticalChangedTotal,1);
 assert.equal(JSON.stringify(before),oldText);
 assert.equal(JSON.stringify(after),newText);
 const newItem=project([['a',3],['b',2],['c',2],['d',1],['e',9]],[['b','c']]);
 const adding=scheduleChangeSummary(before,scheduleProject(newItem));
 assert.equal(adding.movedTotal,0);
 assert.equal(adding.durationAfter,9);
});
test('comparison handles neutral dependencies and limits large previews',()=>{
 const source=project([['a',1],['b',4],['c',1]],[['b','c']],null);
 const extra=project([['a',1],['b',4],['c',1]],[['b','c'],['a','c']],null);
 const neutral=scheduleChangeSummary(scheduleProject(source),scheduleProject(extra));
 assert.equal(neutral.movedTotal,0);
 assert.equal(neutral.durationAfter,5);
 const base=project([['a',1],['b',1],['c',1],['d',1]],[],null);
 const linear=project([['a',1],['b',1],['c',1],['d',1]],[['a','b'],['b','c'],['c','d']],null);
 const limited=scheduleChangeSummary(scheduleProject(base),scheduleProject(linear),{limit:1});
 assert.equal(limited.movedTotal,3);
 assert.equal(limited.examples.length,1);
 assert.equal(limited.examples[0].finishDate,null);
 assert.throws(()=>scheduleChangeSummary(null,scheduleProject(linear)),/Invalid schedule comparison/);
 assert.throws(()=>scheduleChangeSummary(scheduleProject(base),scheduleProject(linear),{limit:0}),/Invalid schedule comparison limit/);
});

test('schedule impact lists largest delayed works first and retains before/after dates',()=>{
 const before={durationDays:10,rows:[
  {id:'small',title:'Небольшой сдвиг',earlyFinish:2,finishDate:'2026-11-03',critical:false},
  {id:'earlier',title:'Раньше',earlyFinish:8,finishDate:'2026-11-09',critical:true},
  {id:'big',title:'Большой сдвиг',earlyFinish:3,finishDate:'2026-11-04',critical:false}
 ]};
 const after={durationDays:12,rows:[
  {id:'small',title:'Небольшой сдвиг',earlyFinish:3,finishDate:'2026-11-04',critical:false},
  {id:'earlier',title:'Раньше',earlyFinish:6,finishDate:'2026-11-07',critical:false},
  {id:'big',title:'Большой сдвиг',earlyFinish:7,finishDate:'2026-11-08',critical:true}
 ]};
 const oldText=JSON.stringify(before),newText=JSON.stringify(after);
 const impact=scheduleChangeSummary(before,after,{limit:2});
 assert.equal(impact.movedTotal,3);
 assert.equal(impact.delayedTotal,2);
 assert.equal(impact.earlierTotal,1);
 assert.equal(impact.criticalChangedTotal,2);
 assert.deepEqual(impact.examples.map(x=>x.id),['big','small']);
 assert.deepEqual(impact.examples.map(x=>x.shiftDays),[4,1]);
 assert.equal(impact.examples[0].previousFinishOffset,3);
 assert.equal(impact.examples[0].finishOffset,7);
 assert.equal(impact.examples[0].previousFinishDate,'2026-11-04');
 assert.equal(impact.examples[0].finishDate,'2026-11-08');
 assert.equal(impact.examples[0].critical,true);
 assert.equal(JSON.stringify(before),oldText);
 assert.equal(JSON.stringify(after),newText);
});

test('correcting an affected work duration recalculates its downstream chain',()=>{
 const original=project([['a',1],['b',1],['c',1]],[['a','b'],['b','c']],null);
 const corrected=project([['a',1],['b',2],['c',1]],[['a','b'],['b','c']],null);
 const before=scheduleProject(original),after=scheduleProject(corrected);
 const effect=scheduleChangeSummary(before,after);
 assert.equal(effect.durationBefore,3);
 assert.equal(effect.durationAfter,4);
 assert.equal(effect.delayedTotal,2);
 assert.deepEqual(effect.examples.map(x=>x.id),['b','c']);
 assert.deepEqual(effect.examples.map(x=>x.shiftDays),[1,1]);
});

test('affected work exposes a missed control date without changing planned values',()=>{
 const original=project([['a',2],['b',2],['c',1],['d',3]],[['b','c']],'2026-11-01');
 original.items.find(w=>w.id==='b').dueDate='2026-11-04';
 original.items.find(w=>w.id==='c').dueDate='2026-11-07';
 original.items.find(w=>w.id==='d').dueDate='2026-11-01';
 const changed={...original,dependencies:[...original.dependencies,{from:'a',to:'b'}]};
 const before=scheduleProject(original),after=scheduleProject(changed);
 const oldText=JSON.stringify(original),newText=JSON.stringify(changed);
 const delta=scheduleChangeSummary(before,after);
 assert.equal(delta.movedTotal,2);
 assert.equal(delta.deadlineMissedTotal,2);
 assert.deepEqual(new Set(delta.affectedIds),new Set(['a','b','c','d']));
 const missed=delta.examples.find(x=>x.id==='b');
 assert.equal(missed.dueDate,'2026-11-04');
 assert.equal(missed.finishDate,'2026-11-05');
 assert.equal(missed.missedDeadline,true);
 assert.equal(delta.examples.find(x=>x.id==='c').missedDeadline,false);
 const earlierCritical=delta.examples.find(x=>x.id==='d');
 assert.ok(earlierCritical,"Previously critical work must remain reviewable");
 assert.equal(earlierCritical.shiftDays,0);
 assert.equal(earlierCritical.criticalChanged,true);
 assert.equal(earlierCritical.critical,false);
 assert.equal(JSON.stringify(original),oldText);
 assert.equal(JSON.stringify(changed),newText);
 const undated=project([['a',2],['b',2],['c',1]],[['b','c']],null);
 undated.items.find(x=>x.id==='b').dueDate='2026-11-04';
 const undatedAfter={...undated,dependencies:[...undated.dependencies,{from:'a',to:'b'}]};
 const withoutStart=scheduleChangeSummary(scheduleProject(undated),scheduleProject(undatedAfter));
 assert.equal(withoutStart.deadlineMissedTotal,0);
 assert.equal(withoutStart.examples.find(x=>x.id==='b').finishDate,null);
});

test('a missed work deadline stays actionable in a limited schedule impact preview',()=>{
 const baseline=project([['big',5],['small',1],['x',1],['y',1],['z',1],['w',1],['late',1]],[],'2026-11-01');
 baseline.items.find(item=>item.id==='late').dueDate='2026-11-02';
 const revised={...baseline,dependencies:[
  ...['x','y','z','w'].map(to=>({from:'big',to})),
  {from:'small',to:'late'}
 ]};
 const result=scheduleChangeSummary(scheduleProject(baseline),scheduleProject(revised),{limit:4});
 assert.equal(result.movedTotal,5);
 assert.equal(result.deadlineMissedTotal,1);
 assert.equal(result.examples.length,4);
 assert.equal(result.examples[0].id,'late');
 assert.equal(result.examples[0].shiftDays,1);
 assert.equal(result.examples[0].missedDeadline,true);
 assert.equal(result.examples[0].dueDate,'2026-11-02');
});

test('work-table deadline risk is grounded in a real dated CPM finish only',()=>{
 const dated=project([['step',2],['finish',2]],[['step','finish']],'2026-11-01');
 dated.items.find(w=>w.id==='finish').dueDate='2026-11-04';
 const before=JSON.stringify(dated);
 const rows=scheduleProject(dated).rows;
 assert.deepEqual(rows.filter(r=>r.dueDate&&r.finishDate&&r.finishDate>r.dueDate).map(r=>r.id),['finish']);
 assert.equal(rows.find(r=>r.id==='finish').finishDate,'2026-11-05');
 const withoutStart={...dated,startDate:null};
 assert.deepEqual(scheduleProject(withoutStart).rows.filter(r=>r.dueDate&&r.finishDate&&r.finishDate>r.dueDate),[]);
 assert.equal(JSON.stringify(dated),before);
});

test('changing only a control date reports a resolved violation without inventing a schedule shift',()=>{
 const original=project([['work',3]],[],'2026-11-10');
 original.items[0].dueDate='2026-11-12';
 const revised={...original,items:[{...original.items[0],dueDate:'2026-11-15'}]};
 const oldText=JSON.stringify(original),newText=JSON.stringify(revised);
 const before=scheduleProject(original),after=scheduleProject(revised);
 const effect=scheduleChangeSummary(before,after);
 assert.equal(effect.durationBefore,3);
 assert.equal(effect.durationAfter,3);
 assert.equal(effect.movedTotal,0);
 assert.equal(effect.deadlineChangedTotal,1);
 assert.equal(effect.deadlineResolvedTotal,1);
 assert.equal(effect.deadlineNewMissedTotal,0);
 assert.equal(effect.deadlineMissedTotal,0);
 assert.equal(effect.affectedTotal,1);
 assert.deepEqual(effect.examples.map(x=>x.id),['work']);
 assert.equal(effect.examples[0].shiftDays,0);
 assert.equal(effect.examples[0].previousDueDate,'2026-11-12');
 assert.equal(effect.examples[0].dueDate,'2026-11-15');
 assert.equal(effect.examples[0].dueDateChanged,true);
 assert.equal(effect.examples[0].deadlineResolved,true);
 assert.equal(effect.examples[0].missedDeadline,false);
 assert.equal(effect.examples[0].finishDate,'2026-11-13');
 assert.equal(JSON.stringify(original),oldText);
 assert.equal(JSON.stringify(revised),newText);
});
test('tightening a control date reveals a newly missed deadline, even without changing CPM',()=>{
 const baseline=project([['work',3]],[],'2026-11-10');
 baseline.items[0].dueDate='2026-11-15';
 const strict={...baseline,items:[{...baseline.items[0],dueDate:'2026-11-12'}]};
 const effect=scheduleChangeSummary(scheduleProject(baseline),scheduleProject(strict));
 assert.equal(effect.movedTotal,0);
 assert.equal(effect.deadlineChangedTotal,1);
 assert.equal(effect.deadlineResolvedTotal,0);
 assert.equal(effect.deadlineNewMissedTotal,1);
 assert.equal(effect.deadlineMissedTotal,1);
 assert.equal(effect.affectedTotal,1);
 assert.equal(effect.examples[0].missedDeadline,true);
});
test('without a project start, changing a control date reports the edit but never a fictional violation',()=>{
 const projectWithoutStart=project([['work',3]],[],null);
 projectWithoutStart.items[0].dueDate='2026-11-12';
 const later={...projectWithoutStart,items:[{...projectWithoutStart.items[0],dueDate:'2026-11-15'}]};
 const effect=scheduleChangeSummary(scheduleProject(projectWithoutStart),scheduleProject(later));
 assert.equal(effect.movedTotal,0);
 assert.equal(effect.deadlineChangedTotal,1);
 assert.equal(effect.deadlineMissedTotal,0);
 assert.equal(effect.deadlineResolvedTotal,0);
 assert.equal(effect.deadlineNewMissedTotal,0);
 assert.equal(effect.examples[0].finishDate,null);
 assert.equal(effect.examples[0].previousFinishDate,null);
});

test('removing a violated control date does not masquerade as an eliminated delay',()=>{
 const baseline=project([['work',3]],[],'2026-11-10');
 baseline.items[0].dueDate='2026-11-12';
 const removed={...baseline,items:[{...baseline.items[0],dueDate:null}]};
 const original=JSON.stringify(baseline);
 const change=scheduleChangeSummary(scheduleProject(baseline),scheduleProject(removed));
 assert.equal(change.movedTotal,0);
 assert.equal(change.deadlineChangedTotal,1);
 assert.equal(change.deadlineRemovedTotal,1);
 assert.equal(change.deadlineResolvedTotal,0);
 assert.equal(change.deadlineMissedTotal,0);
 assert.equal(change.affectedTotal,1);
 assert.equal(change.examples[0].previousDueDate,'2026-11-12');
 assert.equal(change.examples[0].dueDate,null);
 assert.equal(change.examples[0].deadlineRemoved,true);
 assert.equal(change.examples[0].deadlineResolved,false);
 assert.equal(change.examples[0].finishDate,'2026-11-13');
 assert.equal(JSON.stringify(baseline),original);
});
test('editing a deadline rather than deleting it can genuinely resolve an overrun',()=>{
 const baseline=project([['work',3]],[],'2026-11-10');
 baseline.items[0].dueDate='2026-11-12';
 const corrected={...baseline,items:[{...baseline.items[0],dueDate:'2026-11-15'}]};
 const effect=scheduleChangeSummary(scheduleProject(baseline),scheduleProject(corrected));
 assert.equal(effect.deadlineRemovedTotal,0);
 assert.equal(effect.deadlineResolvedTotal,1);
 assert.equal(effect.examples[0].deadlineRemoved,false);
 assert.equal(effect.examples[0].deadlineResolved,true);
});

test('all affected work IDs survive a bounded impact preview without duplicate or added works',()=>{
 const original={durationDays:12,rows:Array.from({length:10},(_,i)=>({
  id:'work-'+i,title:'Работа '+i,earlyFinish:i+1,finishDate:null,dueDate:null,critical:i===0
 }))};
 const updated={durationDays:17,rows:original.rows.map((row,i)=>({
  ...row,earlyFinish:row.earlyFinish+(i<7?5:0),
  dueDate:i===8?'2026-12-01':null
 }))};
 const beforeText=JSON.stringify(original),afterText=JSON.stringify(updated);
 const result=scheduleChangeSummary(original,updated,{limit:2});
 assert.equal(result.movedTotal,7);
 assert.equal(result.affectedTotal,8);
 assert.equal(result.examples.length,2);
 assert.equal(result.affectedIds.length,8);
 assert.deepEqual(result.affectedIds.slice(0,2),result.examples.map(row=>row.id));
 assert.deepEqual(new Set(result.affectedIds),new Set([
  'work-0','work-1','work-2','work-3','work-4','work-5','work-6','work-8'
 ]));
 assert.equal(new Set(result.affectedIds).size,result.affectedIds.length);
 assert.equal(JSON.stringify(original),beforeText);
 assert.equal(JSON.stringify(updated),afterText);
});

test('a work entering the critical path is actionable even when its finish does not move',()=>{
 const baseline=project([['steady',5],['longer',6]],[],null);
 const changed=project([['steady',5],['longer',5]],[],null);
 const before=scheduleProject(baseline),after=scheduleProject(changed);
 const beforeSnapshot=JSON.stringify(before),afterSnapshot=JSON.stringify(after);
 const delta=scheduleChangeSummary(before,after,{limit:1});
 assert.equal(delta.movedTotal,1);
 assert.equal(delta.criticalChangedTotal,1);
 assert.equal(delta.affectedTotal,2);
 assert.deepEqual(new Set(delta.affectedIds),new Set(['steady','longer']));
 assert.equal(delta.examples[0].id,'steady',
  'A newly critical work must be visible before a merely shortened work');
 assert.equal(delta.examples[0].shiftDays,0);
 assert.equal(delta.examples[0].criticalChanged,true);
 assert.equal(delta.examples[0].previousCritical,false);
 assert.equal(delta.examples[0].newCritical,true);
 assert.equal(delta.examples[0].critical,true);
 assert.equal(JSON.stringify(before),beforeSnapshot);
 assert.equal(JSON.stringify(after),afterSnapshot);
});

test('a work leaving the critical path remains visible without a finish-date shift',()=>{
 const baseline=project([['steady',5],['peer',5]],[],null);
 const changed=project([['steady',5],['peer',6]],[],null);
 const delta=scheduleChangeSummary(scheduleProject(baseline),scheduleProject(changed));
 const steady=delta.examples.find(x=>x.id==='steady');
 assert.equal(delta.criticalChangedTotal,1);
 assert.equal(delta.movedTotal,1);
 assert.equal(delta.affectedTotal,2);
 assert.ok(steady);
 assert.equal(steady.shiftDays,0);
 assert.equal(steady.criticalChanged,true);
 assert.equal(steady.previousCritical,true);
 assert.equal(steady.critical,false);
 assert.equal(steady.newCritical,false);
});

test('adding a longer independent work changes the original critical path without moving it',()=>{
 const original=project([['existing',5]],[],null);
 const extended=project([['existing',5],['new',8]],[],null);
 const result=scheduleChangeSummary(scheduleProject(original),scheduleProject(extended));
 assert.equal(result.durationBefore,5);
 assert.equal(result.durationAfter,8);
 assert.equal(result.movedTotal,0);
 assert.equal(result.criticalChangedTotal,1);
 assert.equal(result.affectedTotal,1);
 assert.deepEqual(result.affectedIds,['existing']);
 assert.equal(result.examples[0].shiftDays,0);
 assert.equal(result.examples[0].criticalChanged,true);
 assert.equal(result.examples[0].critical,false);
 assert.equal(result.examples.some(x=>x.id==='new'),false);
});

test('dated schedule explains exact calendar lateness and limiting predecessor work',()=>{
 const p=project([['a',2],['b',2],['target',3]],[['a','target'],['b','target']],'2026-11-10');
 p.items.find(item=>item.id==='target').dueDate='2026-11-13';
 const schedule=scheduleProject(p),original=JSON.stringify(schedule);
 const risks=scheduleDeadlineExplanations(schedule);
 assert.equal(risks.size,1);
 const risk=risks.get('target');
 assert.equal(risk.finishDate,'2026-11-15');
 assert.equal(risk.daysLate,2);
 assert.equal(risk.durationDays,3);
 assert.equal(risk.driverTotal,2);
 assert.deepEqual(risk.drivers.map(x=>x.id),['a','b']);
 assert.equal(risk.critical,true);
 const limited=scheduleDeadlineExplanations(schedule,{limit:1}).get('target');
 assert.equal(limited.drivers.length,1);
 assert.equal(limited.hiddenDrivers,1);
 assert.equal(JSON.stringify(schedule),original);
});
test('deadline explanation counts leap-day lateness in UTC and ignores undated projects',()=>{
 const p=project([['late',3]],[],'2028-02-28');
 p.items[0].dueDate='2028-02-29';
 const schedule=scheduleProject(p),risk=scheduleDeadlineExplanations(schedule).get('late');
 assert.equal(risk.finishDate,'2028-03-02');
 assert.equal(risk.daysLate,2);
 assert.equal(risk.driverTotal,0);
 const undated={...p,startDate:null};
 assert.equal(scheduleDeadlineExplanations(scheduleProject(undated)).size,0);
 const onTime={...p,items:[{...p.items[0],dueDate:'2028-03-02'}]};
 assert.equal(scheduleDeadlineExplanations(scheduleProject(onTime)).size,0);
 assert.throws(()=>scheduleDeadlineExplanations(null),/Invalid deadline schedule/);
 assert.throws(()=>scheduleDeadlineExplanations(schedule,{limit:0}),/Invalid deadline explanation limit/);
});

test('critical path example follows a real limiting link; independent equal finish stays visible',()=>{
 const p=project([['a',3],['b',4],['c',7]],[['a','b']]);
 const src=JSON.stringify(p),schedule=scheduleProject(p),scheduled=JSON.stringify(schedule);
 const focus=criticalPathFocus(schedule);
 assert.equal(focus.workId,'b');assert.equal(focus.predecessorId,'a');
 assert.equal(focus.durationDays,7);
 const after=scheduleProject(project([['a',3],['b',4],['c',7]]));
 const delta=scheduleChangeSummary(schedule,after);
 assert.equal(after.durationDays,7);
 assert.equal(criticalPathFocus(after),null,'No invented link among isolated terminal work');
 assert.equal(delta.criticalChangedTotal,2);
 assert.equal(delta.movedTotal,1);
 assert.equal(JSON.stringify(p),src);assert.equal(JSON.stringify(schedule),scheduled);
 assert.throws(()=>criticalPathFocus({durationDays:7}),/Invalid critical path/);
});

test("hypothetical link removal preserves an equal-length critical alternative",()=>{
 const p=project([["a",3],["b",3],["finish",2]],[["a","finish"],["b","finish"]]);
 const original=JSON.stringify(p),before=scheduleProject(p),scheduleText=JSON.stringify(before);
 const preview=forecastDependencyRemoval(p,before,"a","finish");
 assert.equal(preview.beforeDays,5);
 assert.equal(preview.afterDays,5);
 assert.equal(preview.deltaDays,0);
 assert.ok(preview.criticalChanges>=1,"Removed predecessor leaves the critical route");
 assert.equal(preview.beforeFinish,preview.afterFinish);
 assert.equal(preview.from,"a");
 assert.equal(preview.to,"finish");
 assert.equal(JSON.stringify(p),original);
 assert.equal(JSON.stringify(before),scheduleText);
 assert.throws(()=>forecastDependencyRemoval(p,before,"missing","finish"),/existing link/);
});
test("hypothetical removal exposes a genuinely shorter schedule without modifying the project",()=>{
 const p=project([["a",4],["finish",3],["other",2]],[["a","finish"]]);
 const saved=JSON.stringify(p),before=scheduleProject(p);
 const predicted=forecastDependencyRemoval(p,before,"a","finish");
 const actual=scheduleProject({...p,dependencies:[]});
 assert.equal(before.durationDays,7);
 assert.equal(predicted.afterDays,actual.durationDays);
 assert.equal(predicted.deltaDays,-3);
 assert.ok(predicted.affectedWorks>0);
 assert.equal(predicted.afterFinish,actual.estimatedFinish);
 assert.equal(JSON.stringify(p),saved);
});

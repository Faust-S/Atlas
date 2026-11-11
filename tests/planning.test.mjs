import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleProject,scheduleChangeSummary } from '../src/planning.mjs';
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
 assert.deepEqual(new Set(changed.examples.map(x=>x.id)),new Set(['b','c']));
 assert.deepEqual(changed.examples.map(x=>x.shiftDays),[3,3]);
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

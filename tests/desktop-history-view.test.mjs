import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectHistoryRows} from '../desktop/src/history-view.mjs';

test('complete decision and finding history can be browsed, searched and filtered without mutation',()=>{
 const project={decisions:Array.from({length:175},(_,i)=>({
  id:'decision-'+i,at:new Date(Date.UTC(2026,9,1,0,i)).toISOString(),text:'Decision '+i
 })),findings:Array.from({length:155},(_,i)=>({
  id:'fact-'+i,observedAt:new Date(Date.UTC(2026,9,2,0,i)).toISOString(),
  note:'Finding '+i,result:'partial',sourceId:'repo',revision:'a'.repeat(40)
 })),sources:[{id:'repo',locator:'public/example'}]};
 const original=JSON.stringify(project),rows=projectHistoryRows(project);
 assert.equal(rows.length,330);
 assert.equal(new Set(rows.map(x=>x.id)).size,330);
 assert.equal(rows[0].id,'fact-154');
 assert.equal(rows.at(-1).id,'decision-0');
 assert.equal(projectHistoryRows(project,{kind:'decision'}).length,175);
 assert.equal(projectHistoryRows(project,{kind:'finding'}).length,155);
 assert.equal(projectHistoryRows(project,{query:'public/example'}).length,155);
 assert.equal(projectHistoryRows(project,{query:'AAA'}).length,155);
 assert.equal(projectHistoryRows(project,{query:'decision 130'}).length,1);
 assert.equal(JSON.stringify(project),original);
});
test('equal and missing timestamps remain stable',()=>{
 const p={decisions:[{id:'d1',at:null,text:'A'},{id:'d2',at:null,text:'B'}],
 findings:[{id:'f',observedAt:'bad',result:'present',revision:'abcdef'}]};
 assert.deepEqual(projectHistoryRows(p).map(x=>x.id),['f','d2','d1']);
 assert.deepEqual(projectHistoryRows(p,{query:'ABCDEF'}).map(x=>x.id),['f']);
 assert.throws(()=>projectHistoryRows(p,{kind:'untrusted'}),/history filter/);
});
test('desktop presents complete history and progressive resource list',()=>{
 const ui=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 assert.match(ui,/history\.slice\(0,historyLimit\)/);
 assert.match(ui,/setHistoryLimit\(n=>Math\.min\(history\.length,n\+120\)\)/);
 assert.match(ui,/setResourceLimit\(n=>Math\.min\(resources\.people\.length,n\+40\)\)/);
});

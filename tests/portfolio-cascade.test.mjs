import test from 'node:test';
import assert from 'node:assert/strict';
import {addPortfolioLink} from '../src/portfolio.mjs';
import {portfolioCascade,renderPortfolioCascade,renderProjectCascade} from '../src/portfolio-cascade.mjs';
const project = (id,name,status='active',opts={}) => ({id,name,status,targets:opts.targets||[],items:opts.items||[],sources:opts.sources||[]});
const target = (id) => ({id,intent:'committed',title:id,desired:'Expected'});
const emptyImpact = p=>({rows:(p.targets||[]).map(t=>({intent:t.intent,assessment:'implemented_claim'}))});
const link = (snap,from,to) => addPortfolioLink(snap,{from,to},()=>from+'-'+to);

test('propagates explicit blocker through a chain; counts downstream requirements exactly once',()=>{
 const base={schema:'atlas.project/1',revision:0,projects:[project('a','API','active',{items:[{id:'block',state:'blocked'}]}),project('b','UI','active',{targets:[target('ui1')]}),project('c','Launch','planned',{targets:[target('launch1'),target('launch2')]})]};
 const snap=link(link(base,'a','b'),'b','c');const result=portfolioCascade(snap,emptyImpact);
 assert.equal(result.totals.explicitBlockers,1);
 assert.equal(result.byId.get('a').level,'blocked');
 assert.equal(result.byId.get('c').level,'blocked');
 assert.deepEqual(result.byId.get('a').downstreamAll,['b','c']);
 assert.equal(result.byId.get('a').affectedRequirements,3);
 assert.ok(result.byId.get('c').inherited.some(x=>x.kind==='blocked'&&x.path.join('-')==='a-b-c'));
 assert.match(renderProjectCascade(snap,'a',emptyImpact),/3 обязательных результатов/);
});

test('diamond topology deduplicates affected downstream and direct cause traces',()=>{
 const base={revision:0,projects:[project('a','Root'),project('b','Branch B'),project('c','Branch C'),project('d','Delivery','active',{targets:[target('one')]})]};
 const snap=link(link(link(link(base,'a','b'),'a','c'),'b','d'),'c','d');
 const impact=portfolioCascade(snap,emptyImpact);
 assert.equal(impact.byId.get('a').downstreamAll.length,3);
 assert.equal(impact.byId.get('a').affectedRequirements,1);
 assert.equal(impact.byId.get('d').level,'review');
});

test('claimed completion requires review instead of clearing dependent project',()=>{
 const base={revision:0,projects:[project('a','Claimed complete','completed'),project('b','Consumer','planned',{targets:[target('delivered')]})]};
 const snap=link(base,'a','b');const impact=portfolioCascade(snap,emptyImpact);
 assert.equal(impact.byId.get('b').level,'review');
 assert.match(renderPortfolioCascade(snap,emptyImpact),/Завершение предшественника заявлено/);
 assert.doesNotMatch(renderPortfolioCascade(snap,emptyImpact),/Подтверждена готовность/);
});

test('escaped names, source failures and linked evidence uncertainty stay visible',()=>{
 const base={revision:0,projects:[project('a','<img onerror=alert(1)>','active',{sources:[{status:'error'}]}),project('b','UI','active',{targets:[target('new')]})]};
 const snap=link(base,'a','b');const assessment=p=>({rows:p.id==='b'?[{intent:'committed',assessment:'stale'}]:[]});
 const html=renderPortfolioCascade(snap,assessment,{mode:'all'});
 assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img/);
 assert.equal(portfolioCascade(snap,assessment).byId.get('b').level,'review');
 assert.throws(()=>renderPortfolioCascade(snap,assessment,{mode:'bad'}),/filter/);
});

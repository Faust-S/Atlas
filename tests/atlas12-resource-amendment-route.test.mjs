import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {editItem,serialize,deserialize} from '../src/core.mjs';
import {planChange,decideChange} from '../src/trace.mjs';
import {editorSpec,applyEditor} from '../src/editor.mjs';
import {addResourcePlanChoice,setPlanWork,setPlanDates,previewPlanAmendment,applyPlanAmendment} from '../src/plan-amendment.mjs';
import {previewWorkResourceReassignment,prepareResourceEditorChoice,assertResourceEditorChoiceCurrent} from '../src/resource-alternatives.mjs';
import {atlas12ResourceAlternativesPortfolio} from './fixtures/atlas12-resource-alternatives.mjs';
const input=o=>({get:k=>o[k]??''});
function fixture(){
 const f=atlas12ResourceAlternativesPortfolio(),p=f.snapshot.projects[0];
 return {...f,first:p.items[0],second:p.items[1],loose:p.items[3],
  lift:f.snapshot.resources.find(r=>r.label==='Подъёмник').id,
  free:f.snapshot.resources.find(r=>r.label==='Свободная площадка').id};
}
test('Selected resource goes through ordinary editor into new proposal without editing Work',()=>{
 const f=fixture(),before=serialize(f.snapshot);
 const comparison=previewWorkResourceReassignment(f.snapshot,{projectId:f.projectId,workId:f.first.id,targetResourceId:f.lift});
 const choice=prepareResourceEditorChoice(f.snapshot,comparison);
 const action='resource-amendment:'+encodeURIComponent(f.first.id);
 const spec=editorSpec(f.snapshot.projects[0],action,f.snapshot);
 assert.ok(spec.fields.find(x=>x.name==='resourceId').options.some(o=>o.value===choice.targetResourceId));
 const result=applyEditor(f.snapshot,f.projectId,action,input({resourceId:choice.targetResourceId,title:'Разделение ресурсов',description:'Выбранный вариант'}));
 const p=result.state.projects[0],c=p.changes[0];
 assert.equal(c.id,result.changeId);assert.equal(c.status,'proposed');
 assert.equal(c.planAmendments.length,1);
 assert.equal(c.planAmendments[0].before.resourceId,f.first.resourceId);
 assert.equal(c.planAmendments[0].after.resourceId,f.lift);
 assert.equal(c.planAmendments[0].after.dueDate,f.first.dueDate);
 assert.deepEqual(p.items,f.snapshot.projects[0].items);
 assert.equal(previewPlanAmendment(result.state,f.projectId,c.id).resourceAfter.overloadDays,0);
 assert.throws(()=>assertResourceEditorChoiceCurrent(result.state,choice),/устарел/);
 assert.throws(()=>applyPlanAmendment(result.state,f.projectId,c.id),/утверждение/);
 assert.deepEqual(deserialize(serialize(result.state)),result.state);
 assert.equal(serialize(f.snapshot),before);
});
test('Add to existing proposal preserves other pending Work parameters and other actions',()=>{
 const f=fixture();
 const c=planChange(f.snapshot,f.projectId,{title:'Комплексное изменение'});
 let s=setPlanWork(c.state,f.projectId,c.id,{itemId:f.first.id,estimateDays:5,assignee:'Бригада',dueDate:'2026-11-30',allocationPct:50}).state;
 s=setPlanDates(s,f.projectId,c.id,{startDate:'2026-11-24',dueDate:'2026-12-01'}).state;
 const before=serialize(s);
 let a=addResourcePlanChoice(s,f.projectId,f.first.id,{changeId:c.id,resourceId:f.lift});
 a=addResourcePlanChoice(a.state,f.projectId,f.loose.id,{changeId:c.id,resourceId:f.free});
 const p=a.state.projects[0],record=p.changes[0];
 assert.equal(record.planAmendments.length,3);
 const work=record.planAmendments.find(x=>x.itemId===f.first.id);
 assert.equal(work.after.estimateDays,5);assert.equal(work.after.assignee,'Бригада');
 assert.equal(work.after.dueDate,'2026-11-30');assert.equal(work.after.allocationPct,50);
 assert.equal(work.after.resourceId,f.lift);
 assert.deepEqual(p.items,s.projects[0].items);
 assert.equal(p.startDate,s.projects[0].startDate);
 assert.equal(previewPlanAmendment(a.state,f.projectId,c.id).resourceAfter.unlinked,0);
 assert.equal(serialize(s),before);
 assert.throws(()=>addResourcePlanChoice(a.state,f.projectId,f.first.id,{changeId:c.id,resourceId:f.lift}),/уже указан/);
 const approved=decideChange(a.state,f.projectId,c.id,{status:'approved',rationale:'Проверены все изменения'}).state;
 const applied=applyPlanAmendment(approved,f.projectId,c.id).state;
 assert.equal(applied.projects[0].items[0].estimateDays,5);
 assert.equal(applied.projects[0].items[0].resourceId,f.lift);
 assert.equal(applied.projects[0].items[3].resourceId,f.free);
 assert.equal(applied.projects[0].startDate,'2026-11-24');
 assert.equal(applied.projects[0].decisions.at(-1).kind,'plan_application');
});
test('Stale or approved proposal is never rebased or modified by resource transfer',()=>{
 const f=fixture(),c=planChange(f.snapshot,f.projectId,{title:'Изменение'});
 const s=setPlanWork(c.state,f.projectId,c.id,{itemId:f.first.id,estimateDays:4}).state;
 const changed=editItem(s,f.projectId,f.first.id,{estimateDays:6}),before=serialize(changed);
 assert.throws(()=>addResourcePlanChoice(changed,f.projectId,f.first.id,{changeId:c.id,resourceId:f.lift}),/изменилась/);
 assert.equal(serialize(changed),before);
 const approved=decideChange(s,f.projectId,c.id,{status:'approved',rationale:'Решение человека'}).state;
 assert.throws(()=>addResourcePlanChoice(approved,f.projectId,f.loose.id,{changeId:c.id,resourceId:f.free}),/после утверждения/);
 assert.throws(()=>addResourcePlanChoice(s,f.projectId,f.first.id,{changeId:c.id,resourceId:f.first.resourceId}),/другой/);
 assert.throws(()=>addResourcePlanChoice(s,f.projectId,f.first.id,{changeId:c.id,resourceId:'unknown'}),/другой/);
 assert.throws(()=>addResourcePlanChoice(s,f.projectId,f.first.id,{resourceId:f.lift,title:''}),/название заявки/);
});
test('Desktop reuses the guarded resource proposal and ordinary change forecast',()=>{
 const ui=readFileSync(new URL('../desktop/src/ResourceAlternatives.tsx',import.meta.url),'utf8');
 const main=readFileSync(new URL('../desktop/src/main.tsx',import.meta.url),'utf8');
 const native=readFileSync(new URL('../desktop/tests/installed-atlas12-resource-alternatives.py',import.meta.url),'utf8');
 assert.match(ui,/onOpenAmendment\(preview.projectId,preview.workId,preview\)/);
 assert.match(main,/openEditorFor\(pid,"resource-amendment:"\+encodeURIComponent\(wid\),comparison\)/);
 assert.match(main,/form.get\("resourceId"\)!==editor.resourceProposal.targetResourceId/);
 assert.match(main,/setForecastId\(result.changeId\)/);
 assert.match(native,/ATLAS12_NATIVE_RESOURCE_TO_AMENDMENT_PASS/);
 assert.doesNotMatch(ui,/applyEditor\(|commitWithReadback\(/);
});

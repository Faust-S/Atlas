import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {serialize,deserialize} from "../src/core.mjs";
import {editorSpec,applyEditor,filterWorkPickerOptions} from "../src/editor.mjs";
import {folderLinkAction} from "../src/project-organization.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";

const SHA="a".repeat(40);
function fixture(){
 const state=atlas06VisualPortfolio();
 const project=state.projects[0];
 const action=folderLinkAction("visual-source-0",SHA,"directory-01");
 const spec=editorSpec(project,action,state);
 return {state,project,action,spec,options:spec.fields[0].options};
}
test("The work picker searches all 1212 works, including those beyond the 12 visible options",()=>{
 const f=fixture(),saved=serialize(f.state);
 assert.equal(f.spec.fields[0].searchable,true);
 assert.equal(f.options.length,1213);
 const initial=filterWorkPickerOptions(f.options,"");
 assert.equal(initial.total,1212);
 assert.equal(initial.shown,12);
 assert.equal(initial.options.length,13);
 assert.equal(initial.options[0].value,"");
 assert.equal(initial.options.some(o=>o.value==="visual-work-5-1079"),false);
 const found=filterWorkPickerOptions(f.options,"5 / 1080");
 assert.equal(found.total,1);
 assert.equal(found.options[1].value,"visual-work-5-1079");
 assert.equal(found.hidden,0);
 assert.match(found.options[1].label,/Этап работ/);
 assert.ok(filterWorkPickerOptions(f.options,"эТАП РАБОТ 24").total>0);
 assert.equal(filterWorkPickerOptions(f.options,"НЕТ ТАКОЙ РАБОТЫ").total,0);
 assert.equal(serialize(f.state),saved);
});
test("Selected work remains stable across search changes; search alone does not select",()=>{
 const f=fixture(),selected="visual-work-5-1079";
 const results=filterWorkPickerOptions(f.options,"ПроверитьОченьДлинное",selected);
 assert.equal(results.total,1);
 assert.equal(results.options.some(row=>row.value===selected),true);
 assert.equal(results.options.length,3);
 const reset=filterWorkPickerOptions(f.options,"",selected);
 assert.equal(reset.options.some(row=>row.value===selected),true);
 assert.equal(reset.options.length,14);
 const noMatch=filterWorkPickerOptions(f.options,"несуществующее",selected);
 assert.deepEqual(noMatch.options.map(row=>row.value),["",selected]);
 assert.throws(()=>filterWorkPickerOptions(f.options,"",selected,0),/Некорректный поиск/);
 assert.throws(()=>applyEditor(f.state,f.project.id,f.action,new FormData()),/Выберите существующую работу/);
});
test("A work found beyond the preview survives source linking, serialization and reload",()=>{
 const f=fixture(),original=serialize(f.state),id="visual-work-5-1079";
 const selected=f.project.items.find(w=>w.id===id);
 const before=structuredClone(selected);
 const form=new FormData();form.set("workId",id);
 const result=applyEditor(f.state,f.project.id,f.action,form).state;
 const updated=result.projects[0].items.find(w=>w.id===id);
 assert.equal(updated.sourceId,"visual-source-0");
 assert.equal(updated.sourcePath,"directory-01");
 assert.equal(updated.sourceRevision,SHA);
 assert.deepEqual({...updated,sourceId:before.sourceId,sourcePath:before.sourcePath,
  sourceRevision:before.sourceRevision},before);
 assert.equal(result.projects[0].items.length,1212);
 assert.deepEqual(result.projects[0].dependencies,f.project.dependencies);
 assert.deepEqual(deserialize(serialize(result)),result);
 assert.equal(serialize(f.state),original);
});
test("Identical titles in one stage stay distinguishable without exposing source IDs",()=>{
 const f=fixture(),p=structuredClone(f.project);
 const one=p.items.find(w=>w.id==="visual-work-0-0");
 const two=p.items.find(w=>w.id==="visual-work-0-1");
 two.title=one.title;
 two.stageId=one.stageId;
 const snapshot=structuredClone(f.state);
 snapshot.projects[0]=p;
 const spec=editorSpec(p,f.action,snapshot),choices=spec.fields[0].options;
 assert.match(choices.find(row=>row.value===one.id).label,/№1/);
 assert.match(choices.find(row=>row.value===two.id).label,/№2/);
 assert.notEqual(choices.find(row=>row.value===one.id).label,
  choices.find(row=>row.value===two.id).label);
});
test("The searchable work picker uses the existing form with bounded DOM options",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const style=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/filterWorkPickerOptions\(searchableField\.options\|\|\[\],workQuery/);
 assert.match(ui,/role="group" aria-label=\{f\.label\}/);
 assert.match(ui,/name=\{f\.name\} aria-label=\{f\.label\}/);
 assert.match(ui,/Найти существующую работу/);
 assert.match(style,/\.atlas-work-picker-status/);
});

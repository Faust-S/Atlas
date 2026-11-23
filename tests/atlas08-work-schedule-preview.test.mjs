import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scheduleProject,scheduleChangeSummary} from "../src/planning.mjs";
import {editorSpec,applyEditor} from "../src/editor.mjs";
import {serialize} from "../src/core.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {previewWorkScheduleEdit} from "../src/work-schedule-preview.mjs";

const fixture=()=>({
 id:"project-1",startDate:"2026-12-01",
 items:[
  {id:"a",title:"Первый шаг",state:"todo",priority:"normal",estimateDays:2,dueDate:"2026-12-02"},
  {id:"b",title:"Завершение",state:"todo",priority:"normal",estimateDays:3,dueDate:null},
  {id:"c",title:"Независимая работа",state:"todo",priority:"normal",estimateDays:4,dueDate:null}
 ],dependencies:[{from:"a",to:"b"}]
});

test("The proposed duration shifts dependent works without changing the saved project or CPM",()=>{
 const project=fixture(),original=structuredClone(project);
 const baseline=scheduleProject(project),baselineText=JSON.stringify(baseline);
 const preview=previewWorkScheduleEdit(project,"a",{estimateDays:"4",dueDate:"2026-12-02"},baseline);
 assert.equal(preview.kind,"changed");
 assert.deepEqual([preview.beforeDays,preview.afterDays],[5,7]);
 assert.deepEqual([preview.oldFinishOffset,preview.newFinishOffset],[2,4]);
 assert.deepEqual([preview.movedTotal,preview.delayedTotal,preview.affectedTotal],[2,2,2]);
 assert.equal(preview.willBeLate,true);
 assert.deepEqual(project,original);
 assert.equal(JSON.stringify(baseline),baselineText);
});

test("Changing only a control date does not invent a schedule shift or accepted completion",()=>{
 const project=fixture(),original=structuredClone(project);
 const preview=previewWorkScheduleEdit(project,"a",{estimateDays:"2",dueDate:"2026-12-05"});
 assert.equal(preview.kind,"changed");
 assert.equal(preview.movedTotal,0);
 assert.equal(preview.deadlineChangedTotal,1);
 assert.equal(preview.deadlineResolvedTotal,1);
 assert.equal(preview.wasLate,true);
 assert.equal(preview.willBeLate,false);
 assert.equal(preview.beforeDays,preview.afterDays);
 assert.deepEqual(project,original);
});

test("A removed or undated control date is not interpreted as a resolved deadline",()=>{
 const project=fixture();project.startDate=null;
 const previous=JSON.stringify(project);
 const preview=previewWorkScheduleEdit(project,"a",{estimateDays:"2",dueDate:""});
 assert.equal(preview.kind,"changed");
 assert.equal(preview.deadlineRemovedTotal,1);
 assert.equal(preview.deadlineResolvedTotal,0);
 assert.equal(preview.dueDate,null);
 assert.equal(preview.wasLate,null);
 assert.equal(preview.willBeLate,null);
 assert.equal(JSON.stringify(project),previous);
});

test("Invalid, incomplete and unchanged work fields never create a hypothetical plan",()=>{
 const project=fixture(),before=JSON.stringify(project);
 for(const invalid of ["","-2","4.5","36501","Infinity","1e8"]){
  assert.equal(previewWorkScheduleEdit(project,"a",{estimateDays:invalid}).kind,"invalid");
 }
 for(const invalidDate of ["2026-02-30","2026-13-01","2026/12/12"]){
  assert.equal(previewWorkScheduleEdit(project,"a",{estimateDays:"2",dueDate:invalidDate}).kind,"invalid");
 }
 assert.equal(previewWorkScheduleEdit(project,"a",{estimateDays:"2",dueDate:"2026-12-02"}).kind,"unchanged");
 assert.throws(()=>previewWorkScheduleEdit(project,"missing",{estimateDays:"2"}),/не найдена/);
 assert.equal(JSON.stringify(project),before);
});

test("The original inspector shows the preview before apply, with accessible compact controls",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(ui,/import \{previewWorkScheduleEdit\} from "\.\.\/\.\.\/src\/work-schedule-preview\.mjs"/);
 assert.match(ui,/return previewWorkScheduleEdit\(project,editor\.action\.slice\(5\),/);
 assert.match(ui,/\[editor\.action,project,plan,fields\.estimateDays,fields\.dueDate,/);
 assert.match(ui,/fields\.durationUnit,fields\.calendarBasis,correctionBaseline,calendarLibrary,/);
 assert.match(ui,/aria-label="Предварительный расчёт изменения работы"/);
 assert.match(ui,/Изменения ещё не применены к черновику и не сохранены на диск/);
 const section=ui.indexOf("className=\"atlas-work-draft-preview\"");
 const footer=ui.indexOf('className="form-footer"',section);
 assert.ok(section>0&&footer>section);
 assert.match(ui,/busy=\{busy\} project=\{project\} plan=\{plannedPlan\}/);
 assert.match(css,/\.editor-panel \.atlas-work-draft-preview\{/);
 assert.match(css,/max-height:min\(29vh,190px\)/);
 assert.match(css,/\.editor-panel \.form-footer\{flex:0 0 auto/);
 assert.match(ui,/aria-label="Общий итог последовательных исправлений"/);
 assert.match(ui,/correctionBaseline=\{correctionBaseline\}/);
 assert.match(css,/max-height:min\(16vh,108px\)/);
});

test("The preview and actual work editor produce identical effects on a large project",()=>{
 const snapshot=atlas06VisualPortfolio(),beforeState=serialize(snapshot);
 const project=snapshot.projects[0],work=project.items.find(w=>w.id==="visual-work-5-1079");
 assert.ok(work,"Large fixture work must exist");
 const action="work:"+work.id,fields=editorSpec(project,action,snapshot).fields;
 const form=new FormData();
 for(const field of fields)form.set(field.name,String(field.value??""));
 const draft={estimateDays:String((work.estimateDays??1)+2),dueDate:work.dueDate??""};
 form.set("estimateDays",draft.estimateDays);
 form.set("dueDate",draft.dueDate);
 const before=scheduleProject(project);
 const projected=previewWorkScheduleEdit(project,work.id,draft,before);
 assert.equal(projected.kind,"changed");
 const applied=applyEditor(snapshot,project.id,action,form).state;
 const after=scheduleProject(applied.projects.find(p=>p.id===project.id));
 const comparison=scheduleChangeSummary(before,after,{limit:3});
 assert.equal(projected.afterDays,after.durationDays);
 assert.equal(projected.beforeDays,before.durationDays);
 for(const key of ["affectedTotal","movedTotal","criticalChangedTotal",
  "deadlineChangedTotal","deadlineResolvedTotal","deadlineRemovedTotal"]){
  assert.equal(projected[key],comparison[key],key);
 }
 assert.deepEqual(projected.affectedIds,comparison.affectedIds);
 assert.deepEqual(projected.examples,comparison.examples);
 assert.equal(serialize(snapshot),beforeState);
});

test("Two successive work changes show immediate and cumulative forecasts separately",()=>{
 const original=fixture(),baseline=scheduleProject(original),snapshot=JSON.stringify(original);
 const first={...original,items:original.items.map(w=>w.id==="a"?{...w,estimateDays:4}:w)};
 const current=scheduleProject(first);
 const draft={estimateDays:"2",dueDate:""};
 const preview=previewWorkScheduleEdit(first,"b",draft,current,baseline);
 assert.equal(preview.kind,"changed");
 assert.deepEqual([preview.beforeDays,preview.afterDays],[7,6]);
 assert.deepEqual([preview.cumulative.beforeDays,preview.cumulative.afterDays],[5,6]);
 assert.equal(preview.movedTotal,1);
 assert.equal(preview.cumulative.movedTotal,2);
 const projected={...first,items:first.items.map(w=>w.id==="b"?{...w,estimateDays:2}:w)};
 assert.deepEqual(preview.cumulative.affectedIds,
  scheduleChangeSummary(baseline,scheduleProject(projected),{limit:3}).affectedIds);
 const unmodified=previewWorkScheduleEdit(first,"b",
  {estimateDays:"3",dueDate:""},current,baseline);
 assert.equal(unmodified.kind,"unchanged");
 assert.equal(unmodified.cumulative.afterDays,7);
 assert.equal(JSON.stringify(original),snapshot);
});

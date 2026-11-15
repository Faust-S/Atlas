import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scheduleProject} from "../src/planning.mjs";
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
 assert.match(ui,/\[editor\.action,project,plan,fields\.estimateDays,fields\.dueDate\]/);
 assert.match(ui,/aria-label="Предварительный расчёт изменения работы"/);
 assert.match(ui,/Изменения ещё не применены к черновику и не сохранены на диск/);
 const section=ui.indexOf("className=\"atlas-work-draft-preview\"");
 const footer=ui.indexOf('className="form-footer"',section);
 assert.ok(section>0&&footer>section);
 assert.match(ui,/busy=\{busy\} project=\{project\} plan=\{plan\}/);
 assert.match(css,/\.editor-panel \.atlas-work-draft-preview\{/);
 assert.match(css,/max-height:min\(29vh,190px\)/);
 assert.match(css,/\.editor-panel \.form-footer\{flex:0 0 auto/);
});

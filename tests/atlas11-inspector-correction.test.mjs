import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scheduleProject} from "../src/planning.mjs";
import {startWorkCorrection,continueWorkCorrection} from "../src/work-correction-flow.mjs";
import {inspectorRecentCorrection} from "../desktop/src/inspector-work-context.mjs";

const project=()=>({
 id:"project-1",startDate:"2026-12-01",
 items:[
  {id:"a",title:"Подготовка",state:"todo",priority:"normal",estimateDays:2,dueDate:null},
  {id:"b",title:"Монтаж",state:"todo",priority:"normal",estimateDays:3,dueDate:null},
  {id:"c",title:"Независимая работа",state:"todo",priority:"normal",estimateDays:4,dueDate:null}
 ],
 dependencies:[{from:"a",to:"b"}]
});
const changed=(p,id,days)=>({...p,items:p.items.map(w=>w.id===id?
 {...w,estimateDays:days}:w)});

test("Inspector consumes canonical Work correction, shows affected works and local CPM",()=>{
 const p0=project(),before=scheduleProject(p0);
 const p1=changed(p0,"a",4),after=scheduleProject(p1);
 const correction=startWorkCorrection({projectId:p1.id,workId:"a",revision:17,
  beforePlan:before,afterPlan:after});
 const original=JSON.stringify(correction),snapshot=JSON.stringify(p1);
 const root=inspectorRecentCorrection(p1,17,"a",correction,after);
 const affected=inspectorRecentCorrection(p1,17,"b",correction,after);
 assert.equal(root.beforeDays,5);
 assert.equal(root.afterDays,7);
 assert.equal(root.change.movedTotal,2);
 assert.equal(root.change.affectedTotal,2);
 assert.deepEqual(root.change.affectedIds,["a","b"]);
 assert.equal(root.rootTitle,"Подготовка");
 assert.equal(affected.rootId,"a");
 assert.equal(affected.change.examples.length,2);
 assert.equal(inspectorRecentCorrection(p1,17,"c",correction,after),null);
 assert.equal(inspectorRecentCorrection(p1,18,"a",correction,after),null);
 assert.equal(inspectorRecentCorrection({...p1,id:"other"},17,"a",correction,after),null);
 assert.equal(inspectorRecentCorrection(p1,17,"deleted",correction,after),null);
 assert.equal(inspectorRecentCorrection(p1,17,"a",null,after),null);
 assert.equal(JSON.stringify(correction),original);
 assert.equal(JSON.stringify(p1),snapshot);
});

test("Successive correction compares against the first plan, never an intermediate revision",()=>{
 const p0=project(),original=scheduleProject(p0);
 const p1=changed(p0,"a",4),first=startWorkCorrection({projectId:p0.id,
  workId:"a",revision:40,beforePlan:original,afterPlan:scheduleProject(p1)});
 const p2=changed(p1,"b",1),second=continueWorkCorrection(first,{
  projectId:p0.id,workId:"b",revision:40,nextRevision:41,afterPlan:scheduleProject(p2)
 });
 const result=inspectorRecentCorrection(p2,41,"a",second,scheduleProject(p2));
 assert.equal(result.followupCount,1);
 assert.equal(result.beforeDays,5);
 assert.equal(result.afterDays,5);
 assert.deepEqual(result.change.affectedIds,["a"]);
 assert.equal(inspectorRecentCorrection(p2,40,"a",second,scheduleProject(p2)),null);
 assert.equal(inspectorRecentCorrection(p2,41,"b",second,scheduleProject(p2)).followupCount,1,
  "A corrected Work retains the cumulative result even when its own shift disappears");
});

test("Compact native inspector includes impact tab, direct Work edit and separate Save",()=>{
 const main=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const preview=readFileSync(new URL("../desktop/src/AtlasInspectorPreview.tsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../desktop/src/style.css",import.meta.url),"utf8");
 assert.match(main,/localPlan=\{plannedPlan\}/);
 assert.match(main,/correctionContext=\{recentWorkKind!=="created"\?recentPlanBefore:null\}/);
 assert.match(main,/onShowAffected=\{showAffectedWorks\}/);
 assert.match(preview,/inspectorRecentCorrection\(project,snapshot.revision,shown.id,correctionContext,localPlan\)/);
 assert.match(preview,/setWorkSection\("impact"\)/);
 assert.match(preview,/correction\.followupIds\.includes\(shown\.id\)/);
 assert.match(preview,/Вернуться к исходной работе/);
 assert.match(main,/if\(tab!=="work"\)\{resetWorkspaceScroll\(\);setTab\("work"\)/);
 assert.match(preview,/aria-label="Инспектор: итог"/);
 assert.match(preview,/aria-label="Последствия корректировки работы"/);
 assert.match(preview,/onClick=\{\(\)=>\{open\("work",affected.id\);onEditWork\(affected.id\)\}\}/);
 assert.match(preview,/onClick=\{onShowAffected\}/);
 assert.match(preview,/Для записи на диск нажмите «Сохранить»/);
 assert.match(css,/\.atlas-v6-work-sections\.has-impact\{grid-template-columns:repeat\(5/);
 assert.match(css,/\.atlas-v6-impact-row\{/);
 assert.doesNotMatch(preview,/scheduleProject\(|scheduleChangeSummary\(|editItem\(/);
});

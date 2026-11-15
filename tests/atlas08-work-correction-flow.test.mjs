import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {scheduleProject,scheduleChangeSummary} from "../src/planning.mjs";
import {startWorkCorrection,continueWorkCorrection} from "../src/work-correction-flow.mjs";
import {editItem,serialize} from "../src/core.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";

const project=()=>({
 id:"p",startDate:"2026-12-01",items:[
  {id:"a",title:"Первый этап",state:"todo",priority:"normal",estimateDays:2,dueDate:null},
  {id:"b",title:"Зависимая работа",state:"todo",priority:"normal",estimateDays:3,dueDate:null},
  {id:"c",title:"Независимая работа",state:"todo",priority:"normal",estimateDays:4,dueDate:null}
 ],dependencies:[{from:"a",to:"b"}]
});
const revised=(p,id,days)=>({...p,items:p.items.map(w=>w.id===id?{...w,estimateDays:days}:w)});

test("After correcting a dependent work, show effects from the original plan, not only the last edit",()=>{
 const p0=project(),original=JSON.stringify(p0),base=scheduleProject(p0);
 const p1=revised(p0,"a",4),step1=scheduleProject(p1);
 const first=startWorkCorrection({projectId:"p",workId:"a",revision:1,beforePlan:base,afterPlan:step1});
 assert.equal(first.change.affectedTotal,2);
 assert.equal(first.days,5);
 const p2=revised(p1,"b",1),step2=scheduleProject(p2);
 const second=continueWorkCorrection(first,{
  projectId:"p",workId:"b",revision:1,nextRevision:2,afterPlan:step2
 });
 assert.ok(second);
 assert.equal(second.workId,"a");
 assert.equal(second.baseline,base);
 assert.equal(second.days,5);
 assert.equal(second.change.affectedTotal,1);
 assert.deepEqual(second.change.affectedIds,["a"]);
 assert.deepEqual(second.followups,["b"]);
 assert.equal(second.change.durationAfter,5);
 assert.equal(first.change.durationAfter,7);
 assert.deepEqual(second.change,scheduleChangeSummary(base,step2));
 assert.equal(JSON.stringify(p0),original);
});

test("Only a current, affected work in the same project can extend the correction context",()=>{
 const p=project(),before=scheduleProject(p);
 const changed=revised(p,"a",4);
 const current=startWorkCorrection({projectId:"p",workId:"a",revision:8,
  beforePlan:before,afterPlan:scheduleProject(changed)});
 const input={projectId:"p",workId:"b",revision:8,nextRevision:9,afterPlan:scheduleProject(changed)};
 assert.equal(continueWorkCorrection(null,input),null);
 assert.equal(continueWorkCorrection(current,{...input,projectId:"another"}),null);
 assert.equal(continueWorkCorrection(current,{...input,revision:9}),null);
 assert.equal(continueWorkCorrection(current,{...input,workId:"missing"}),null);
 assert.equal(continueWorkCorrection(current,{...input,nextRevision:8}),null);
 const allowed=continueWorkCorrection(current,input);
 assert.ok(allowed);
 assert.deepEqual(current.followups,[]);
 assert.equal(current.revision,8);
});

test("Large-project follow-up stays a read-only comparison with the original revision",()=>{
 const state=atlas06VisualPortfolio(),original=serialize(state),p0=state.projects[0];
 const base=scheduleProject(p0);
 const start=p0.items.find(w=>w.id==="visual-work-5-1079");
 assert.ok(start);
 const changed=editItem(state,p0.id,start.id,{estimateDays:(start.estimateDays??1)+3});
 const p1=changed.projects.find(p=>p.id===p0.id);
 const first=startWorkCorrection({projectId:p0.id,workId:start.id,
  revision:changed.revision,beforePlan:base,afterPlan:scheduleProject(p1)});
 const affected=first.change.affectedIds.find(id=>id!==start.id);
 assert.ok(affected,"A downstream work must be affected");
 const chosen=p1.items.find(w=>w.id===affected);
 const follow=editItem(changed,p0.id,affected,{estimateDays:(chosen.estimateDays??1)+1});
 const nextPlan=scheduleProject(follow.projects.find(p=>p.id===p0.id));
 const second=continueWorkCorrection(first,{projectId:p0.id,workId:affected,
  revision:changed.revision,nextRevision:follow.revision,afterPlan:nextPlan});
 assert.ok(second);
 assert.equal(second.workId,start.id);
 assert.equal(second.revision,follow.revision);
 assert.deepEqual(second.change,scheduleChangeSummary(base,nextPlan));
 assert.equal(serialize(state),original);
});

test("The existing work editor returns to remaining affected works without saving",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const start=ui.indexOf('const submit=(event:React.FormEvent<HTMLFormElement>)=>');
 const end=ui.indexOf("const save=async()",start);
 assert.ok(start>0&&end>start);
 const submit=ui.slice(start,end);
 assert.match(submit,/continueWorkCorrection\(/);
 assert.match(submit,/setRecentWorkId\(nextContext\?\.workId\|\|correctedId\)/);
 assert.match(submit,/setWorkImpactOnly\(continued\.change\.affectedTotal>0\)/);
 assert.match(submit,/setWorkSort\("impact"\)/);
 assert.match(ui,/Сравнение ведётся с планом до первого изменения/);
});

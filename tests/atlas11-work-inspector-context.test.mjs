import test from "node:test";
import assert from "node:assert/strict";
import {inspectorWorkContext} from "../desktop/src/inspector-work-context.mjs";
import {empty,createProject,editProject,createItem,editItem,serialize} from "../src/core.mjs";
import {capturePlanBaseline,comparePlanBaseline} from "../src/plan-baseline.mjs";
import {scheduleProject,scheduleDeadlineExplanations} from "../src/planning.mjs";
import {readFileSync} from "node:fs";

test("Atlas 0.11 inspector reuses one canonical baseline and CPM without changing snapshot",()=>{
 const made=createProject(empty(),{name:"Construction"});
 let state=editProject(made.state,made.id,{startDate:"2026-11-20"});
 const created=createItem(state,made.id,{title:"Finish structure"});
 state=editItem(created.state,made.id,created.id,{estimateDays:2});
 const captured=capturePlanBaseline(state,made.id,{
  recordedAt:"2026-11-21T00:00:00.000Z"
 });
 state=editItem(captured.state,made.id,created.id,{estimateDays:5});
 const comparison=comparePlanBaseline(state,made.id,captured.id);
 const project=state.projects.find(p=>p.id===made.id);
 const plan=scheduleProject(project);
 const before=serialize(state),beforePlan=JSON.stringify(plan);
 const facts=inspectorWorkContext(project,plan,created.id,{
  comparison,deadlineRisks:scheduleDeadlineExplanations(plan),resources:state.resources
 });
 assert.equal(facts.work.id,created.id);
 assert.equal(facts.row.finishDate,"2026-11-25");
 assert.equal(facts.baseline.id,captured.id);
 assert.equal(facts.baselineRow.referenceFinish,"2026-11-22");
 assert.equal(facts.baselineRow.forecastFinish,"2026-11-25");
 assert.equal(facts.baselineRow.shiftDays,3);
 assert.deepEqual(facts.baselineRow.reasons,["Изменена длительность"]);
 assert.equal(facts.row.critical,true);
 assert.equal(facts.history.length,0);
 assert.equal(serialize(state),before);
 assert.equal(JSON.stringify(plan),beforePlan);
});

test("Only exact Work, shared-target and change references appear in inspector history",()=>{
 const project={
  items:[
   {id:"w1",title:"Installation",targetIds:["target"],changeId:"c1",sourceId:"s1",resourceId:"r1"},
   {id:"w2",title:"Testing",targetIds:["target"],changeId:"c2"}
  ],dependencies:[{from:"w2",to:"w1"}],
  sources:[{id:"s1",locator:"repo:path"}],
  changes:[{id:"c1",title:"Accepted proposal",status:"approved"}],
  decisions:[
   {id:"d1",at:"2026-11-22T08:00:00Z",changeId:"c1",text:"Revise installation sequence"},
   {id:"d2",at:"2026-11-22T09:00:00Z",changeId:"c2",text:"Testing result belongs elsewhere"},
   {id:"d3",at:"2026-11-22T10:00:00Z",text:"Generic portfolio decision"}
  ],
  findings:[
   {id:"f1",observedAt:"2026-11-22T10:00:00Z",workId:"w1",targetId:"target",note:"Work-specific observation"},
   {id:"f2",observedAt:"2026-11-22T11:00:00Z",workId:"w2",targetId:"target",note:"Other Work observation"},
   {id:"f3",observedAt:"2026-11-22T12:00:00Z",targetId:"target",note:"Shared target observation"},
   {id:"f4",observedAt:"2026-11-22T13:00:00Z",targetId:"another",note:"Unrelated observation"}
  ]
 };
 const before=JSON.stringify(project);
 const facts=inspectorWorkContext(project,null,"w1",{
  resources:[{id:"r1",label:"Field team"}],deadlineRisks:new Map([["w1",{daysLate:2}]])
 });
 assert.deepEqual(facts.history.map(x=>x.id),["f3","f1","d1"]);
 assert.deepEqual(facts.history.map(x=>x.scope),["shared_target","work","change"]);
 assert.equal(facts.relatedChange.id,"c1");
 assert.deepEqual(facts.predecessors.map(x=>x.id),["w2"]);
 assert.equal(facts.successors.length,0);
 assert.equal(facts.resource.label,"Field team");
 assert.equal(facts.source.locator,"repo:path");
 assert.equal(facts.deadline.daysLate,2);
 assert.equal(facts.baselineRow,null);
 assert.equal(JSON.stringify(project),before);
 assert.equal(inspectorWorkContext(project,null,"missing"),null);
});

test("Inspector keeps large Work selection ID-based without fabricating a current forecast",()=>{
 const items=Array.from({length:1212},(_,i)=>({id:"work-"+i,title:"Work"}));
 const project={items,dependencies:[],decisions:[],findings:[]};
 const data=JSON.stringify(project);
 const facts=inspectorWorkContext(project,null,"work-1211",{
  comparison:{baseline:{id:"control"},rows:[{id:"work-1211",
   forecastFinish:null,referenceFinish:"2026-11-25",shiftDays:null,reasons:["Изменился расчётный старт проекта"]}]}
 });
 assert.equal(facts.work.id,"work-1211");
 assert.equal(facts.row,null);
 assert.equal(facts.baselineRow.shiftDays,null);
 assert.deepEqual(facts.history,[]);
 assert.equal(JSON.stringify(project),data);
});

test("Existing Atlas Work screen projects authoritative baseline and deadline context into dock",()=>{
 const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
 const preview=readFileSync(new URL("../desktop/src/AtlasInspectorPreview.tsx",import.meta.url),"utf8");
 assert.match(ui,/comparison=\{controlPlanComparison\} deadlineRisks=\{deadlineRiskDetails\}/);
 assert.match(ui,/onSelectBaseline=\{setControlPlanId\}/);
 assert.match(preview,/inspectorWorkContext\(project,plan,shown\.id/);
 assert.match(preview,/aria-label="Контрольный план выбранной работы"/);
 assert.match(preview,/aria-label="Факторы расчётной просрочки"/);
 assert.match(preview,/aria-label="Связанные решения и наблюдения"/);
 assert.match(preview,/onClick=\{\(\)=>open\("work",linked\.id\)\}/);
 assert.match(preview,/onClick=\{\(\)=>onOpenTab\("history"\)\}/);
 assert.doesNotMatch(preview,/scheduleProject\(|portfolioSchedule\(/);
});

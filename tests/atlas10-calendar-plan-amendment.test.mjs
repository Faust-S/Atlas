import test from "node:test";
import assert from "node:assert/strict";
import {empty,createProject,editProject,createItem,editItem,createWorkCalendar,
 serialize} from "../src/core.mjs";
import {planChange,decideChange} from "../src/trace.mjs";
import {setPlanWork,previewPlanAmendment,applyPlanAmendment,
 renderProjectPlanAmendments} from "../src/plan-amendment.mjs";
import {editorSpec} from "../src/editor.mjs";

test("approved Work amendment keeps pinned calendar semantics and requires new review on a unit change",()=>{
 const project=createProject(empty(),{name:"Construction",type:"engineering"});
 const started=editProject(project.state,project.id,{startDate:"2026-11-20"});
 const c=createWorkCalendar(started,{name:"Factory calendar",
  weekdays:[1,2,3,4,5],excludedDates:["2026-11-23"],
  additionalWorkingDates:[],source:{kind:"entered_by_user",reference:null}});
 const created=createItem(c.state,project.id,{title:"Installation"});
 const pinned={id:c.id,version:c.version};
 const typed=editItem(created.state,project.id,created.id,{
  estimateDays:2,durationUnit:"working_days",calendarBasis:pinned});
 const proposed=planChange(typed,project.id,{title:"Extended installation",
  description:"Owner reviews increased installation duration"});
 const before=serialize(proposed.state);
 const staged=setPlanWork(proposed.state,project.id,proposed.id,{
  itemId:created.id,estimateDays:3,assignee:"Crew",
  dueDate:null,resourceId:null,allocationPct:100});
 const action=staged.state.projects[0].changes[0].planAmendments[0];
 assert.equal(action.before.durationUnit,"working_days");
 assert.deepEqual(action.before.calendarBasis,pinned);
 assert.equal(action.after.estimateDays,3);
 assert.equal("calendarBasis" in action.after,false,
  "Applying a duration amendment must not secretly reassign the Work calendar");
 assert.equal(serialize(proposed.state),before,"Draft must not change saved Work");
 const preview=previewPlanAmendment(staged.state,project.id,proposed.id);
 assert.equal(preview.rows[0].beforeFinish,"2026-11-25");
 assert.equal(preview.rows[0].afterFinish,"2026-11-26");
 assert.match(renderProjectPlanAmendments(staged.state,project.id),/раб. дн./);
 const spec=editorSpec(staged.state.projects[0],"amend-work:"+proposed.id,staged.state);
 assert.match(spec.fields.find(x=>x.name==="estimateDays").label,/единицах выбранной работы/);
 const approved=decideChange(staged.state,project.id,proposed.id,{
  status:"approved",rationale:"Crew duration approved against this pinned working calendar"});
 const changed=editItem(approved.state,project.id,created.id,{
  durationUnit:"elapsed_days",calendarBasis:null});
 assert.throws(()=>applyPlanAmendment(changed,project.id,proposed.id),/изменилась/);
 const approvedBefore=serialize(approved.state);
 const applied=applyPlanAmendment(approved.state,project.id,proposed.id);
 const result=applied.state.projects[0].items.find(w=>w.id===created.id);
 assert.equal(result.estimateDays,3);
 assert.equal(result.durationUnit,"working_days");
 assert.deepEqual(result.calendarBasis,pinned);
 assert.equal(serialize(approved.state),approvedBefore,
  "Applying the approved amendment must not mutate the input snapshot");
});

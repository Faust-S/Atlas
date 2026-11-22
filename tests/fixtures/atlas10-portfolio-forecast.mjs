// Native Windows test fixture built with the original Atlas project model and
// its real .iwxa carrier. This is a proposed plan, not observed delivery.
// An upstream two-calendar-day operation moves a downstream two-working-day
// operation from Wed-Thu to Fri-Mon, changing its finish from Nov 20 to Nov 24.
import {writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {empty,createProject,editProject,createItem,editItem,createWorkCalendar,
 validate,serialize} from "../../src/core.mjs";
import {addPortfolioLink} from "../../src/portfolio.mjs";
import {portfolioSchedule} from "../../src/portfolio-schedule.mjs";
import {projectScreenSchedule} from "../../src/project-schedule-view.mjs";

const AT="2026-11-22T14:00:00.000Z";
export const INSTALL_NAME="Монтаж после поставки";
export const DOWNSTREAM_NAME="Монтаж конвейера";
export function atlas10ShiftedPortfolio(){
 const upstream=createProject(empty(),{name:"Комплектующие конвейера",type:"engineering"});
 const downstream=createProject(upstream.state,{name:DOWNSTREAM_NAME,type:"engineering"});
 let snapshot=editProject(downstream.state,upstream.id,{startDate:"2026-11-18"});
 snapshot=editProject(snapshot,downstream.id,{startDate:"2026-11-18"});
 const supply=createItem(snapshot,upstream.id,{title:"Двухдневная поставка"});
 snapshot=editItem(supply.state,upstream.id,supply.id,{estimateDays:2});
 const calendar=createWorkCalendar(snapshot,{name:"Рабочая неделя монтажа",
  weekdays:[1,2,3,4,5],excludedDates:[],additionalWorkingDates:[],
  source:{kind:"entered_by_user",reference:null}});
 const install=createItem(calendar.state,downstream.id,{title:INSTALL_NAME});
 snapshot=editItem(install.state,downstream.id,install.id,{
  estimateDays:2,durationUnit:"working_days",
  calendarBasis:{id:calendar.id,version:calendar.version},
  dueDate:"2026-11-24"});
 snapshot=addPortfolioLink(snapshot,{from:upstream.id,to:downstream.id});
 validate(snapshot);
 const expected=portfolioSchedule(snapshot).byId.get(downstream.id);
 const view=projectScreenSchedule(snapshot.projects.find(p=>p.id===downstream.id),expected,{
  calendarLibrary:snapshot.calendarLibrary});
 if(expected.projectedStart!=="2026-11-20"||
    expected.plannedFinish!=="2026-11-20"||
    expected.projectedFinish!=="2026-11-24"||
    view.display.rows.find(w=>w.id===install.id)?.finishDate!=="2026-11-24"||
    view.baseline.rows.find(w=>w.id===install.id)?.finishDate!=="2026-11-20")
  throw Error("Atlas 0.10 fixture and original CPM have diverged");
 return {snapshot,workId:install.id,projectId:downstream.id};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output||!output.toLowerCase().endsWith(".iwxa"))
  throw Error("Expected .iwxa output path");
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import("../../desktop/src/iwxa-portfolio.mjs");
 const {snapshot}=atlas10ShiftedPortfolio();
 const bytes=await buildIwxaPortfolio(snapshot,{now:AT});
 const reread=await readIwxaPortfolio(bytes);
 if(serialize(reread.snapshot)!==serialize(snapshot))
  throw Error("Atlas 0.10 native forecast fixture fails IWXA roundtrip");
 writeFileSync(output,bytes);
 process.stdout.write("ATLAS10_PORTFOLIO_FORECAST_FIXTURE_PASS projects=2 working_days=2 forecast_finish=2026-11-24\n");
}

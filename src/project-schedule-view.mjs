// Read-only choice of the one canonical CPM for the current project screen.
// The original Work data and approved project start are never rewritten.
// A portfolio dependency can move the forecast start across a weekend, which
// changes a working-day Work's finish even when its entered duration stays 2.
import {scheduleProject} from "./planning.mjs";

export function projectScreenSchedule(project,portfolioRow,{calendarLibrary=[],plannedPlan=/** @type {any} */(null)}={}){
 if(!project||!Array.isArray(project.items)||!Array.isArray(project.dependencies))
  throw Error("Invalid project for screen schedule");
 const baseline=plannedPlan??scheduleProject(project,{calendarLibrary});
 const projectedStart=portfolioRow?.projectedStart??null;
 const unavailable=project.status==="cancelled"||project.status==="paused"||
  (portfolioRow?.unavailableOrigins?.length??0)>0;
 if(unavailable||!projectedStart||projectedStart===(project.startDate??null)){
  return {baseline,display:baseline,mode:"planned",displayStart:project.startDate??null};
 }
 // This is exactly the original CPM evaluated at the start selected by the
 // original portfolio dependency DAG. No independent scheduling engine.
 const display=scheduleProject(project,{calendarLibrary,startDate:projectedStart});
 if(project.items.length&&portfolioRow?.projectedFinish!=null&&
    display.estimatedFinish!==portfolioRow.projectedFinish)
  throw Error("Проектный график и прогноз портфеля рассчитаны по разным датам");
 return {baseline,display,mode:"portfolio_forecast",displayStart:projectedStart};
}

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Source contract for UI-only return paths. Full WebView2 qualification is
// reserved for the release candidate, not implied by these checks.
const ui=readFileSync(new URL("../desktop/src/main.tsx",import.meta.url),"utf8");
const portion=(start,end)=>{
 const a=ui.indexOf(start),b=ui.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,"Navigation route must exist in the desktop UI");
 return ui.slice(a,b);
};

test("A work table return remembers every active filter and the scroll batch",()=>{
 const save=portion("const rememberWorkTable=","const returnToWorkTable=");
 for(const field of ["projectId:project.id","workId","revision:data.revision",
  "query:workQuery","filter:workFilter","targetFilter:workTargetFilter",
  "observationFilter:workObservationFilter","dependencyFilter:workDependencyFilter",
  "deadlineFilter:workDeadlineFilter","criticalOnly:workCriticalOnly",
  "impactOnly:workImpactOnly","sort:workSort","limit:workLimit"]){
  assert.ok(save.includes(field),"Missing saved table context: "+field);
 }
 assert.match(save,/if\(!project\|\|tab!=="work"\)return/);
 const restore=portion("const returnToWorkTable=","const openLinkedSource=");
 for(const line of ["setWorkQuery(context.query)","setWorkFilter(context.filter)",
  "setWorkTargetFilter(context.targetFilter)",
  "setWorkObservationFilter(context.observationFilter)",
  "setWorkDependencyFilter(context.dependencyFilter)",
  "setWorkDeadlineFilter(context.deadlineFilter)",
  "setWorkCriticalOnly(context.criticalOnly)","setWorkImpactOnly(context.impactOnly)",
  "setWorkSort(context.sort)","setWorkLimit(context.limit)","setWorkReturnId(workId)"]){
  assert.ok(restore.includes(line),"Missing restored work field: "+line);
 }
 assert.match(restore,/context\.projectId===project\.id&&context\.workId===workId&&/);
 assert.match(restore,/context\.revision===data\.revision/);
 assert.match(restore,/else setWorkQuery\(fallbackQuery\)/);
 assert.match(restore,/workNavigationContext\.current=null/);
 assert.doesNotMatch(restore,/\b(?:mutate|invoke|save|applyEditor|setData)\s*\(/);
});

test("Table to source and graph navigation returns to the exact previous search",()=>{
 const source=portion("const openLinkedSource=","const returnToLinkedWork=");
 const sourceBack=portion("const returnToLinkedWork=","const openWorkGraph=");
 const graph=portion("const openWorkGraph=","const returnToLinkedGraph=");
 const graphBack=portion("const returnFromWorkGraph=","useEffect(()=>{\n   const key=");
 assert.match(source,/if\(origin==="work"\)rememberWorkTable\(workId\)/);
 assert.match(sourceBack,/returnToWorkTable\(sourceJump\.workId,sourceJump\.query\)/);
 assert.match(graph,/if\(origin==="work"&&work\)rememberWorkTable\(work\.id\)/);
 assert.match(graphBack,/returnToWorkTable\(graphJump\.workId,graphJump\.query\)/);
 // Graph to source to graph starts from the Sources tab; it cannot overwrite
 // the Work table context retained by the original departure.
 assert.match(ui,/openWorkGraph\(sourceJump\.workId,sourceJump\.query,sourceJump\.graphOrigin\|\|"overview"\)/);
 assert.match(ui,/if\(!project\|\|tab!=="work"\)return/);
 assert.match(ui,/setWorkReturnId\(workId\)/);
});

test("Changing the project or draft invalidates the old navigation context",()=>{
 const select=portion("const selectProject=","const openProjectTab=");
 const mutate=portion("const mutate=","const issue=");
 assert.match(select,/workNavigationContext\.current=null/);
 assert.match(mutate,/workNavigationContext\.current=null/);
 const restore=portion("const returnToWorkTable=","const openLinkedSource=");
 assert.match(restore,/if\(!project\|\|!requireClosedForm\(\)\)return/);
 assert.match(restore,/view\("work"\)/);
});

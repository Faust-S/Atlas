// Pure desktop import adapter over the existing atlas.project/1 validator.
// No second persistence engine or new project model.
import {deserialize} from "../../src/core.mjs";

// Read-only comparison of the snapshots already validated by deserialize.
function importImpact(base,incoming){
 const prior=new Set(base.projects.map(p=>p.id));
 const next=new Set(incoming.projects.map(p=>p.id));
 const removed=base.projects.filter(p=>!next.has(p.id));
 const added=incoming.projects.filter(p=>!prior.has(p.id));
 const counts=snapshot=>({
  projects:snapshot.projects.length,
  works:snapshot.projects.reduce((n,p)=>n+p.items.length,0),
  findings:snapshot.projects.reduce((n,p)=>n+(p.findings?.length||0),0),
  decisions:snapshot.projects.reduce((n,p)=>n+p.decisions.length,0),
  changes:snapshot.projects.reduce((n,p)=>n+(p.changes?.length||0),0),
  sources:snapshot.projects.reduce((n,p)=>n+p.sources.length,0),
  links:snapshot.portfolioLinks?.length||0
 });
 return {
  current:counts(base),incoming:counts(incoming),removed:removed.length,added:added.length,
  matchingIds:incoming.projects.length-added.length,
  removedExamples:removed.slice(0,6).map(p=>p.name),
  addedExamples:added.slice(0,6).map(p=>p.name)
 };
}
export function prepareImportedSnapshot(current,raw,importedAt=new Date().toISOString(),sourceLabel="atlas.project/1 JSON"){
 if(!["atlas.project/1 JSON","iwxa.atlas.portfolio/1.0.0"].includes(sourceLabel))throw Error("Недопустимый источник импорта");
 const incoming=deserialize(JSON.stringify(raw));
 const base=deserialize(JSON.stringify(current));
 const originalRevision=incoming.revision;
 const nextRevision=Math.max(base.revision,originalRevision)+1;
 if(!Number.isSafeInteger(nextRevision))
  throw Error("Исчерпан допустимый номер редакции портфеля");
 const snapshot=structuredClone(incoming);
 const previous=snapshot.importProvenance;
 snapshot.revision=nextRevision;
 snapshot.importProvenance={
  source:sourceLabel,originalRevision,importedAt,
  ...(previous===undefined?{}:{previous})
 };
 deserialize(JSON.stringify(snapshot));
 return {snapshot,originalRevision,summary:importImpact(base,incoming)};
}


// Add an independent portfolio without replacing the current owner data.
// Only root fields whose meaning Atlas knows can be merged. Identifiers
// remain canonical; conflicting definitions are never overwritten.
const canonical=value=>Array.isArray(value)?value.map(canonical):
 value&&typeof value==="object"?Object.fromEntries(
  Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function mergeDefinitions(current,incoming,key,label){
 const rows=structuredClone(current),byKey=new Map(rows.map(row=>[key(row),row]));
 for(const row of incoming){
  const id=key(row),existing=byKey.get(id);
  if(existing){
   if(JSON.stringify(canonical(existing))!==JSON.stringify(canonical(row)))
    throw Error("Несовместимое определение: "+label+" "+id);
  }else{
   const copy=structuredClone(row);rows.push(copy);byKey.set(id,copy);
  }
 }
 return rows;
}
/** Add-only path for a verified, independent .iwxa portfolio. Original
 * projects, IDs, dependencies, resources and calendar revisions are kept.
 * The existing native Save remains the only way to persist the result. */
export function prepareAddedSnapshot(current,raw,importedAt=new Date().toISOString()){
 const base=deserialize(JSON.stringify(current));
 const incoming=deserialize(JSON.stringify(raw));
 const known=new Set(["schema","revision","projects","portfolioLinks","resources","calendarLibrary","importProvenance"]);
 if(Object.keys(incoming).some(key=>!known.has(key)))
  throw Error("В архиве есть дополнительные сведения, которые нельзя безопасно объединить.");
 if(!incoming.projects.length)throw Error("В архиве нет проектов для добавления.");
 const ids=new Set(base.projects.map(project=>project.id));
 const conflicts=incoming.projects.filter(project=>ids.has(project.id));
 if(conflicts.length)
  throw Error("Проекты с такими идентификаторами уже существуют: "+conflicts.slice(0,3).map(p=>p.name).join(", ")+". Изменять их нужно в действующем Atlas.");
 const nextRevision=Math.max(base.revision,incoming.revision)+1;
 if(!Number.isSafeInteger(nextRevision))
  throw Error("Исчерпан допустимый номер редакции портфеля");
 const snapshot=structuredClone(base);
 snapshot.projects.push(...structuredClone(incoming.projects));
 if(base.resources!==undefined||incoming.resources!==undefined)
  snapshot.resources=mergeDefinitions(base.resources??[],incoming.resources??[],row=>row.id,"ресурс");
 if(base.calendarLibrary!==undefined||incoming.calendarLibrary!==undefined)
  snapshot.calendarLibrary=mergeDefinitions(base.calendarLibrary??[],incoming.calendarLibrary??[],
   row=>JSON.stringify([row.id,row.version]),"календарь");
 if(base.portfolioLinks!==undefined||incoming.portfolioLinks!==undefined)
  snapshot.portfolioLinks=mergeDefinitions(base.portfolioLinks??[],incoming.portfolioLinks??[],row=>row.id,"связь проектов");
 snapshot.revision=nextRevision;
 snapshot.importProvenance={source:"iwxa.atlas.portfolio/1.0.0",originalRevision:incoming.revision,
  importedAt,mode:"add",
  ...(base.importProvenance===undefined?{}:{previous:base.importProvenance}),
  ...(incoming.importProvenance===undefined?{}:{incoming:incoming.importProvenance})};
 // Reuse the full Atlas validator, including calendars, resources, Work
 // and cross-project dependencies. No partial candidate reaches the editor.
 deserialize(JSON.stringify(snapshot));
 return {snapshot,originalRevision:incoming.revision,addedProjects:incoming.projects.length,
  addedWorks:incoming.projects.reduce((n,p)=>n+p.items.length,0)};
}

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
export function prepareImportedSnapshot(current,raw,importedAt=new Date().toISOString()){
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
  source:"atlas.project/1 JSON",originalRevision,importedAt,
  ...(previous===undefined?{}:{previous})
 };
 deserialize(JSON.stringify(snapshot));
 return {snapshot,originalRevision,summary:importImpact(base,incoming)};
}

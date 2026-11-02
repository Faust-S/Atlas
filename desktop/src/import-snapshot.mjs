// Pure desktop import adapter over the existing atlas.project/1 validator.
// No second persistence engine or new project model.
import {deserialize} from "../../src/core.mjs";

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
 return {snapshot,originalRevision};
}

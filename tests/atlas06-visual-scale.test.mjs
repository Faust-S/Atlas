import test from "node:test";
import assert from "node:assert/strict";
import {serialize} from "../src/core.mjs";
import {projectSourcePlanProjection} from "../src/project-organization.mjs";
import {atlas06VisualPortfolio,LONG_FOLDER,LONG_WORK,LONG_STAGE} from "./fixtures/atlas06-visual-portfolio.mjs";

test("Large multi-source diagram highlights the confirmed work rather than the oldest source",()=>{
 const snapshot=atlas06VisualPortfolio(),before=serialize(snapshot);
 const project=snapshot.projects[0];
 const preview=projectSourcePlanProjection(snapshot,project.id,{
  maxSources:2,maxFoldersPerSource:4,maxWorksPerFolder:3,maxOtherWorks:6
 });
 assert.equal(project.sources.length,6);
 assert.equal(project.items.length,1212);
 assert.equal(project.stages.length,48);
 assert.equal(project.dependencies.length,299);
 assert.equal(preview.sources.length,2);
 assert.equal(preview.hiddenSources,4);
 assert.equal(preview.sources[0].sourceId,"visual-source-5");
 assert.equal(preview.sources[0].folders[0].name,LONG_FOLDER);
 assert.equal(preview.sources[0].folders[0].works[0].title,LONG_WORK);
 assert.equal(preview.sources[0].folders[0].works[0].stageName,LONG_STAGE);
 assert.equal(preview.sources[0].folders[0].works[0].predecessorTotal,5);
 assert.equal(preview.sources[0].folders[0].works[0].predecessors.length,3);
 assert.equal(preview.sources[0].folders[0].hiddenWorks,42);
 assert.deepEqual(preview.otherWorks.map(w=>w.id),Array.from({length:6},
  (_,i)=>"visual-unlinked-"+i));
 assert.equal(preview.hiddenOtherWorks,preview.workTotal-preview.mappedTotal-6);
 assert.equal(serialize(snapshot),before);
});

test("Larger map remains bounded and preserves long titles, stages and dependency links",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0];
 const before=serialize(snapshot);
 const more=projectSourcePlanProjection(snapshot,project.id,{
  maxSources:8,maxFoldersPerSource:16,maxWorksPerFolder:8,maxOtherWorks:20
 });
 assert.equal(more.sources.length,6);
 assert.equal(more.hiddenSources,0);
 assert.equal(more.sources[0].folders.length,16);
 assert.equal(more.sources[0].folders[0].works.length,8);
 assert.equal(more.sources[0].folders[0].hiddenWorks,37);
 assert.equal(more.sources[0].folders[0].works[0].stageName,LONG_STAGE);
 assert.equal(more.sources[0].folders[0].works[0].title,LONG_WORK);
 assert.equal(more.sources[0].folders[0].works[0].predecessorTotal,5);
 assert.equal(more.dependencyTotal,299);
 assert.equal(serialize(snapshot),before);
});

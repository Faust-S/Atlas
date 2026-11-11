import test from "node:test";
import assert from "node:assert/strict";
import {serialize} from "../src/core.mjs";
import {projectSourcePlanProjection,projectSourcePlanSearch} from "../src/project-organization.mjs";
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


test("Quick search finds a saved work hidden beyond bounded source folders",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0];
 const before=serialize(snapshot);
 const initial=projectSourcePlanProjection(snapshot,project.id,{
  maxSources:2,maxFoldersPerSource:4,maxWorksPerFolder:3,maxOtherWorks:6
 });
 const target="visual-work-5-1079";
 assert.equal(initial.sources.some(source=>source.folders.some(folder=>
  folder.works.some(work=>work.id===target))),false);
 assert.equal(initial.otherWorks.some(work=>work.id===target),false);
 const found=projectSourcePlanSearch(project,"  РАБОТА   5 / 1080  ");
 assert.deepEqual(found.matches.map(row=>row.id),[target]);
 assert.equal(found.matches[0].kind,"work");
 assert.equal(found.matches[0].stageName,"Этап работ 24");
 assert.equal(found.total,1);
 assert.equal(found.hidden,0);
 assert.equal(serialize(snapshot),before);
});
test("Quick search locates a saved stage omitted from the compact map",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0],before=serialize(snapshot);
 const found=projectSourcePlanSearch(project,"  ЭТАП РАБОТ 48 ");
 assert.deepEqual(found.matches.map(row=>row.id),["visual-stage-47"]);
 assert.equal(found.matches[0].kind,"stage");
 assert.equal(found.total,1);
 assert.equal(serialize(snapshot),before);
});
test("Search stays bounded for common queries and preserves the full long name",()=>{
 const snapshot=atlas06VisualPortfolio(),project=snapshot.projects[0],before=serialize(snapshot);
 const many=projectSourcePlanSearch(project,"работа",{limit:8});
 assert.equal(many.total,1200);
 assert.equal(many.matches.length,8);
 assert.equal(many.hidden,1192);
 const full=projectSourcePlanSearch(project,LONG_WORK);
 assert.equal(full.total,1);
 assert.equal(full.matches[0].title,LONG_WORK);
 assert.deepEqual(projectSourcePlanSearch(project,"  "),{matches:[],total:0,hidden:0});
 assert.deepEqual(projectSourcePlanSearch(project,"несуществующее название"),
  {matches:[],total:0,hidden:0});
 assert.throws(()=>projectSourcePlanSearch(project,"работа",{limit:0}),/предел/);
 assert.equal(serialize(snapshot),before);
});

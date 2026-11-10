import test from "node:test";
import assert from "node:assert/strict";
import {serialize} from "../src/core.mjs";
import {projectSourcePlanProjection} from "../src/project-organization.mjs";
import {atlas06UniversalPortfolio,UNIVERSAL_NAME} from "./fixtures/atlas06-universal-portfolio.mjs";

test("Universal saved plan has no source and retains actual stage/dependency links",()=>{
 const snapshot=atlas06UniversalPortfolio(),before=serialize(snapshot);
 const project=snapshot.projects[0];
 assert.equal(project.name,UNIVERSAL_NAME);
 assert.equal(project.type,"other");
 assert.equal(project.sources.length,0);
 assert.equal(project.items.length,3);
 assert.equal(project.stages.length,2);
 assert.equal(project.dependencies.length,2);
 const initial=projectSourcePlanProjection(snapshot,project.id,{maxOtherWorks:2});
 assert.equal(initial.sources.length,0);
 assert.equal(initial.hiddenSources,0);
 assert.equal(initial.otherWorks.length,2);
 assert.equal(initial.hiddenOtherWorks,1);
 const full=projectSourcePlanProjection(snapshot,project.id,{maxOtherWorks:6});
 assert.equal(full.otherWorks[2].title,"Открыть площадку");
 assert.equal(full.otherWorks[2].stageName,"Проведение");
 assert.equal(full.otherWorks[2].predecessorTotal,2);
 assert.deepEqual(full.otherWorks[2].predecessors.map(p=>p.title),
  ["Подготовить помещение","Согласовать программу"]);
 assert.equal(serialize(snapshot),before);
});

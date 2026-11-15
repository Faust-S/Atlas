import test from "node:test";
import assert from "node:assert/strict";
import {serialize} from "../src/core.mjs";
import {atlas06VisualPortfolio} from "./fixtures/atlas06-visual-portfolio.mjs";
import {buildPortfolioSearchIndex,filterPortfolioSearch,portfolioSearchReason,portfolioSearchWorkTarget} from "../src/portfolio-search.mjs";
import {projectWorkTableSearch,projectSourcePlanSearch} from "../src/project-organization.mjs";

const fixture=()=>atlas06VisualPortfolio();
const found=(index,query)=>filterPortfolioSearch(index,{query}).map(project=>project.id);

test("Portfolio finds reordered words in one work, stage or source context",()=>{
 const state=fixture(),before=serialize(state),project=state.projects[0];
 const index=buildPortfolioSearchIndex(state.projects);
 assert.deepEqual(found(index,"1080 работа 5"),[project.id]);
 assert.deepEqual(found(index,"48 работ этап"),[project.id]);
 assert.deepEqual(found(index,"23 directory project-5"),[project.id]);
 assert.equal(portfolioSearchReason(project,"1080 работа 5"),"Работа: Работа 5 / 1080");
 assert.equal(portfolioSearchReason(project,"48 работ этап"),"Этап: Этап работ 48");
 assert.deepEqual(portfolioSearchWorkTarget(project,"1080 работа 5"),
  {id:"visual-work-5-1079",title:"Работа 5 / 1080"});
 assert.deepEqual(found(index,"1080 работа 5 этап 48"),[]);
 assert.equal(portfolioSearchWorkTarget(project,"1080 работа 5 этап 48"),null);
 assert.equal(serialize(state),before);
});

test("Work table and diagram find reordered words without cross-field matching",()=>{
 const state=fixture(),before=serialize(state),project=state.projects[0];
 assert.deepEqual(projectWorkTableSearch(project,"1080 работа 5").map(w=>w.id),
  ["visual-work-5-1079"]);
 const result=projectSourcePlanSearch(project,"1080 работа 5");
 assert.equal(result.total,1);
 assert.deepEqual(result.matches.map(row=>row.id),["visual-work-5-1079"]);
 assert.equal(projectSourcePlanSearch(project,"48 работ этап").matches[0]?.kind,"stage");
 assert.deepEqual(projectWorkTableSearch(project,"1080 работа 5 этап 48"),[]);
 assert.equal(projectSourcePlanSearch(project,"1080 работа 5 этап 48").total,0);
 assert.equal(serialize(state),before);
});

test("Ambiguous work name never creates an automatic direct jump",()=>{
 const state=fixture(),project=state.projects[0],before=serialize(state);
 assert.equal(portfolioSearchWorkTarget(project,"работа 5"),null);
 assert.equal(portfolioSearchWorkTarget(project,"этап 48"),null);
 assert.equal(portfolioSearchReason(project,"это не существует"),"");
 assert.equal(serialize(state),before);
});

test("An exact saved work title beats fuzzy substring collisions across hundreds of works",()=>{
 const state=fixture(),project=state.projects[0],before=serialize(state);
 // Searching for source 0 and item 20 also matches other source titles
 // through partial tokens. The fully typed title is nonetheless unique.
 assert.deepEqual(portfolioSearchWorkTarget(project,"Работа 0 / 20"),
  {id:"visual-work-0-19",title:"Работа 0 / 20"});
 assert.deepEqual(portfolioSearchWorkTarget(project,"Работа 0 / 4"),
  {id:"visual-work-0-3",title:"Работа 0 / 4"});
 assert.equal(portfolioSearchWorkTarget(project,"работа 0"),null);
 const withDuplicate={...project,items:[...project.items,
  {...project.items.find(item=>item.id==="visual-work-0-19"),id:"duplicate-work-20"}]};
 assert.equal(portfolioSearchWorkTarget(withDuplicate,"Работа 0 / 20"),null);
 assert.equal(serialize(state),before);
});

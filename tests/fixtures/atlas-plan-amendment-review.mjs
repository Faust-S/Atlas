// Independent carrier for the installed stale-proposal review route.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {empty,createProject,editProject,createItem,editItem,serialize} from '../../src/core.mjs';
import {planChange} from '../../src/trace.mjs';
import {addPlanningResource} from '../../src/resource-planning.mjs';
import {addPortfolioLink} from '../../src/portfolio.mjs';
import {capturePlanBaseline} from '../../src/plan-baseline.mjs';
import {setPlanWork,inspectPlanAmendment,reviewPlanAmendmentAction,previewPlanAmendment} from '../../src/plan-amendment.mjs';
export const PROJECT='Подготовка монтажной площадки';
export const WORK='Установка оборудования';
export const PROPOSAL='Уточнение длительности монтажа';
export function atlasPlanAmendmentReviewPortfolio(){
 const p=createProject(empty(),{name:PROJECT,type:'engineering'});
 let s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:'2026-12-04'});
 const crane=addPlanningResource(s,{label:'Кран',capacityPct:100});
 const lift=addPlanningResource(crane.state,{label:'Подъёмник',capacityPct:100});
 const w=createItem(lift.state,p.id,{title:WORK,assignee:'Бригада A',resourceId:crane.id,allocationPct:70,dueDate:'2026-11-30'});
 s=editItem(w.state,p.id,w.id,{estimateDays:3});
 const child=createProject(s,{name:'Пусконаладка',type:'engineering'});
 s=editProject(child.state,child.id,{startDate:'2026-11-23',dueDate:'2026-12-04'});
 const test=createItem(s,child.id,{title:'Проверить работу линии'});
 s=editItem(test.state,child.id,test.id,{estimateDays:2});
 s=addPortfolioLink(s,{from:p.id,to:child.id});
 s=capturePlanBaseline(s,p.id,{name:'Первоначальный план монтажа',recordedAt:'2026-11-23T08:00:00.000Z'}).state;
 const c=planChange(s,p.id,{title:PROPOSAL,description:'Увеличить первоначальную длительность с трёх до пяти дней.'});
 s=setPlanWork(c.state,p.id,c.id,{itemId:w.id,estimateDays:5}).state;
 s=editItem(s,p.id,w.id,{estimateDays:7,assignee:'Бригада B',resourceId:lift.id,allocationPct:60,dueDate:'2026-12-01'});
 const inspection=inspectPlanAmendment(s,p.id,c.id);
 if(inspection.rows.length!==1||inspection.rows[0].fields.find(f=>f.name==='estimateDays')?.state!=='CONFLICT')throw Error('Missing stale Work conflict');
 const revised=reviewPlanAmendmentAction(s,p.id,{changeId:c.id,actionKey:'work:'+w.id,revision:s.revision},{estimateDays:'proposed'}).state;
 const forecast=previewPlanAmendment(revised,p.id,c.id);
 if(forecast.rows.find(r=>r.id===p.id)?.afterFinish!=='2026-11-28'||forecast.rows.find(r=>r.id===child.id)?.afterFinish!=='2026-11-30')throw Error('Review fixture dates differ');
 return {snapshot:s,projectId:p.id,workId:w.id,changeId:c.id,childId:child.id};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];if(!file||!file.toLowerCase().endsWith('.iwxa'))throw Error('Expected .iwxa path');
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import('../../desktop/src/iwxa-portfolio.mjs');
 const f=atlasPlanAmendmentReviewPortfolio(),bytes=await buildIwxaPortfolio(f.snapshot,{now:'2026-11-24T12:00:00.000Z'});
 if(serialize((await readIwxaPortfolio(bytes)).snapshot)!==serialize(f.snapshot))throw Error('Review fixture roundtrip mismatch');
 writeFileSync(file,bytes);console.log('ATLAS_PLAN_REVIEW_IWXA_PASS bytes='+bytes.length);
}

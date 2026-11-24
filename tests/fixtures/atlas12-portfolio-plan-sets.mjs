// Four-project manufacturing plan, normal Atlas Project/Work/Change records.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {empty,createProject,editProject,createItem,editItem,serialize} from '../../src/core.mjs';
import {addPlanningResource} from '../../src/resource-planning.mjs';
import {addPortfolioLink} from '../../src/portfolio.mjs';
import {capturePlanBaseline} from '../../src/plan-baseline.mjs';
import {planChange,decideChange} from '../../src/trace.mjs';
import {setPlanWork,setPlanDates,comparePortfolioPlanSets} from '../../src/plan-amendment.mjs';

export function coordinatedPortfolio({approveThird=true}={}){
 const crane=addPlanningResource(empty(),{label:'Кран 25 т',capacityPct:100});
 const lift=addPlanningResource(crane.state,{label:'Подъёмник',capacityPct:100});
 const pad=addPlanningResource(lift.state,{label:'Вторая монтажная площадка',capacityPct:100});
 let s=pad.state;
 const make=(name,title,resource,days,due,load=70)=>{
  const p=createProject(s,{name,type:'engineering'});
  s=editProject(p.state,p.id,{startDate:'2026-11-23',dueDate:due});
  const w=createItem(s,p.id,{title,resourceId:resource,allocationPct:load,dueDate:due});
  s=editItem(w.state,p.id,w.id,{estimateDays:days});
  return {projectId:p.id,workId:w.id};
 };
 const a=make('Монтаж линии А','Установить силовой модуль',crane.id,4,'2026-11-26');
 const b=make('Монтаж линии Б','Установить технологический модуль',crane.id,4,'2026-11-26');
 const c=make('Независимый заказ В','Собрать узел на подъёмнике',lift.id,4,'2026-11-27');
 const d=make('Пусконаладка линии А','Проверить линию',pad.id,2,'2026-11-28',30);
 s=addPortfolioLink(s,{from:a.projectId,to:d.projectId});
 for(const ref of [a,b,c,d])s=capturePlanBaseline(s,ref.projectId,{name:'Исходные обязательства',recordedAt:'2026-11-23T08:00:00.000Z'}).state;
 const proposal=(ref,title,estimateDays,resourceId,approved=true)=>{
  const change=planChange(s,ref.projectId,{title,description:'Технологические условия уточнены для планирования.'});
  s=setPlanWork(change.state,ref.projectId,change.id,{itemId:ref.workId,estimateDays,resourceId}).state;
  if(approved)s=decideChange(s,ref.projectId,change.id,{status:'approved',rationale:'Условия выполнения работы подтверждены ответственным за план.'}).state;
  return {projectId:ref.projectId,changeId:change.id};
 };
 const pa=proposal(a,'Ускорить монтаж А и использовать подъёмник',3,lift.id);
 const pb=proposal(b,'Ускорить монтаж Б',3,crane.id);
 const pc=proposal(c,'Перенести независимый заказ на площадку',4,pad.id,approveThird);
 const deadline=planChange(s,a.projectId,{title:'Перенести контрольный срок А'});
 s=setPlanDates(deadline.state,a.projectId,deadline.id,{startDate:'2026-11-23',dueDate:'2026-11-27'}).state;
 return {snapshot:s,a,b,c,d,pa,pb,pc,deadline:{projectId:a.projectId,changeId:deadline.id},
  craneId:crane.id,liftId:lift.id,padId:pad.id,first:[pa,pb],second:[pa,pb,pc]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];
 if(!output||!output.endsWith('.iwxa'))throw Error('Expected .iwxa path');
 const f=coordinatedPortfolio({approveThird:false}),r=comparePortfolioPlanSets(f.snapshot,f.first,f.second);
 if(!r.options.every(o=>o.valid)||!r.options[0].canApply||r.options[1].canApply||
  r.options[0].preview.resourceAfter.overloadDays!==3||r.options[1].preview.resourceAfter.overloadDays!==0)
  throw Error('Coordinated fixture mismatch');
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import('../../desktop/src/iwxa-portfolio.mjs');
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:'2026-11-23T14:00:00.000Z'});
 const imported=await readIwxaPortfolio(bytes);
 if(serialize(imported.snapshot)!==serialize(f.snapshot))throw Error('Coordinated fixture roundtrip mismatch');
 writeFileSync(output,bytes);
 console.log('ATLAS_PORTFOLIO_PLAN_SET_IWXA_PASS projects=4 options=2 bytes='+bytes.length);
}

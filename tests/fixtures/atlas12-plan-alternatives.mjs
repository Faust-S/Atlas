// Genuine Atlas .iwxa with two independent, explicit multi-Work amendments.
// Existing snapshots, control plans, resource IDs and approval mechanism only.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createProject,editProject,createItem,editItem,serialize} from '../../src/core.mjs';
import {addPortfolioLink} from '../../src/portfolio.mjs';
import {planChange,decideChange} from '../../src/trace.mjs';
import {capturePlanBaseline} from '../../src/plan-baseline.mjs';
import {setPlanWork,setPlanDependency,comparePlanAmendments} from '../../src/plan-amendment.mjs';
import {atlas12ResourceAlternativesPortfolio} from './atlas12-resource-alternatives.mjs';

export const A='Вариант A: разделить ресурсы';
export const B='Вариант B: уменьшить доли';
export const DOWNSTREAM='Подключение оборудования';
export function atlas12PlanAlternativesPortfolio({approved=false,includeSequence=false}={}){
 const f=atlas12ResourceAlternativesPortfolio();
 let s=f.snapshot;
 const p=s.projects[0],first=p.items[0],second=p.items[1],loose=p.items[3];
 const lift=s.resources.find(r=>r.label==='Подъёмник');
 const free=s.resources.find(r=>r.label==='Свободная площадка');
 const dependent=createProject(s,{name:DOWNSTREAM,type:'engineering'});
 s=editProject(dependent.state,dependent.id,{startDate:'2026-11-23',dueDate:'2026-11-28'});
 const next=createItem(s,dependent.id,{title:'Подключить линию',dueDate:'2026-11-28',
  resourceId:lift.id,allocationPct:100});
 s=editItem(next.state,dependent.id,next.id,{estimateDays:2});
 s=addPortfolioLink(s,{from:p.id,to:dependent.id});
 s=capturePlanBaseline(s,p.id,{name:'Контрольная редакция оборудования',recordedAt:'2026-11-23T08:00:00.000Z'}).state;
 s=capturePlanBaseline(s,dependent.id,{name:'Контрольная редакция подключения',recordedAt:'2026-11-23T08:00:00.000Z'}).state;
 const a=planChange(s,p.id,{title:A,description:'Использовать имеющийся подъёмник и выделенную площадку.'});
 s=setPlanWork(a.state,p.id,a.id,{itemId:first.id,estimateDays:3,resourceId:lift.id}).state;
 s=setPlanWork(s,p.id,a.id,{itemId:loose.id,estimateDays:2,resourceId:free.id}).state;
 if(includeSequence)s=setPlanDependency(s,p.id,a.id,{from:first.id,to:second.id,present:true}).state;
 const b=planChange(s,p.id,{title:B,description:'Снизить две доли ресурса и отдельно оценить увеличенную длительность.'});
 s=setPlanWork(b.state,p.id,b.id,{itemId:first.id,estimateDays:5,allocationPct:50}).state;
 s=setPlanWork(s,p.id,b.id,{itemId:second.id,estimateDays:3,allocationPct:50}).state;
 if(approved)s=decideChange(s,p.id,a.id,{status:'approved',rationale:'Утверждение планирующим пользователем для независимой проверки применения.'}).state;
 return {snapshot:s,projectId:p.id,dependentId:dependent.id,dependentWorkId:next.id,
  firstId:first.id,secondId:second.id,looseId:loose.id,liftId:lift.id,freeId:free.id,a:a.id,b:b.id};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];
 if(!file||!file.toLowerCase().endsWith('.iwxa'))throw Error('Expected .iwxa output path');
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import('../../desktop/src/iwxa-portfolio.mjs');
 const f=atlas12PlanAlternativesPortfolio({approved:true,includeSequence:true});
 const [a,b]=comparePlanAmendments(f.snapshot,f.projectId,f.a,f.b).options;
 if(!a.valid||!b.valid||a.preview.resourceAfter.overloadDays!==0||
    a.preview.rows.find(r=>r.id===f.projectId).afterFinish!=='2026-11-29'||
    a.preview.dependencyRows.length!==1||
    b.preview.rows.find(r=>r.id===f.projectId).afterFinish!=='2026-11-28')
  throw Error('Plan alternatives fixture mismatch');
 const bytes=await buildIwxaPortfolio(f.snapshot,{now:'2026-11-23T14:00:00.000Z'});
 const loaded=await readIwxaPortfolio(bytes);
 if(serialize(loaded.snapshot)!==serialize(f.snapshot))throw Error('Plan alternatives IWXA roundtrip mismatch');
 writeFileSync(file,bytes);
 console.log('ATLAS12_PLAN_ALTERNATIVES_IWXA_PASS projects=2 alternatives=2 amendments=5 bytes='+bytes.length);
}

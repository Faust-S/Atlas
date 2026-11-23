// Native IWXA qualification fixture: explicit competing planning resources.
// Uses original Atlas core, portfolio resource engine and .iwxa carrier.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {empty,createProject,editProject,createItem,editItem,serialize,validate} from '../../src/core.mjs';
import {addPlanningResource} from '../../src/resource-planning.mjs';
import {previewWorkResourceReassignment} from '../../src/resource-alternatives.mjs';

const AT='2026-11-23T14:00:00.000Z';
export const PROJECT='Плановая загрузка оборудования';
export const FIRST='Разгрузка материала';
export const SECOND='Подготовка монтажа';
export const SOURCE='Кран';
export const TARGET='Подъёмник';
export const TRADEOFF='Резервный кран';
export const FREE='Свободная площадка';
export function atlas12ResourceAlternativesPortfolio(){
 const p=createProject(empty(),{name:PROJECT,type:'engineering'});
 let state=editProject(p.state,p.id,{startDate:'2026-11-23'});
 const firstResource=addPlanningResource(state,{label:SOURCE,capacityPct:100});
 const otherResource=addPlanningResource(firstResource.state,{label:TARGET,capacityPct:100});
 const shared=addPlanningResource(otherResource.state,{label:TRADEOFF,capacityPct:100});
 const free=addPlanningResource(shared.state,{label:FREE,capacityPct:100});
 const a=createItem(free.state,p.id,{title:FIRST,resourceId:firstResource.id,allocationPct:70});
 state=editItem(a.state,p.id,a.id,{estimateDays:3});
 const b=createItem(state,p.id,{title:SECOND,resourceId:firstResource.id,allocationPct:60});
 state=editItem(b.state,p.id,b.id,{estimateDays:3});
 const c=createItem(state,p.id,{title:'Подача оборудования',
  resourceId:shared.id,allocationPct:70});
 state=editItem(c.state,p.id,c.id,{estimateDays:3});
 validate(state);
 const compare=previewWorkResourceReassignment(state,{projectId:p.id,workId:b.id,
  targetResourceId:otherResource.id});

 if(compare.original.overloadResourceDays!==3||compare.alternative.overloadResourceDays!==0||
    compare.overloadDaysDelta!==-3)throw Error('Original resource comparison changed');
 const tradeoff=previewWorkResourceReassignment(state,{projectId:p.id,workId:b.id,
  targetResourceId:shared.id});
 if(tradeoff.constraints.classification!=='TRADEOFF'||tradeoff.overloadDaysDelta!==0)
  throw Error('Transferred conflict was not detected');
 return {snapshot:state,projectId:p.id,workId:b.id};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2];
 if(!file||!file.toLowerCase().endsWith('.iwxa'))throw Error('Expected .iwxa output path');
 const {buildIwxaPortfolio,readIwxaPortfolio}=await import('../../desktop/src/iwxa-portfolio.mjs');
 const {snapshot}=atlas12ResourceAlternativesPortfolio();
 const bytes=await buildIwxaPortfolio(snapshot,{now:AT});
 const loaded=await readIwxaPortfolio(bytes);
 if(serialize(snapshot)!==serialize(loaded.snapshot))throw Error('IWXA resource roundtrip mismatch');
 writeFileSync(file,bytes);
 process.stdout.write('ATLAS12_RESOURCE_ALTERNATIVES_IWXA_PASS projects=1 works=3 resources=4 overload_days=3 bytes='+bytes.length+'\n');
}

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
export function atlas12ResourceAlternativesPortfolio(){
 const p=createProject(empty(),{name:PROJECT,type:'engineering'});
 let state=editProject(p.state,p.id,{startDate:'2026-11-23'});
 const firstResource=addPlanningResource(state,{label:SOURCE,capacityPct:100});
 const otherResource=addPlanningResource(firstResource.state,{label:TARGET,capacityPct:100});
 const a=createItem(otherResource.state,p.id,{title:FIRST,resourceId:firstResource.id,allocationPct:70});
 state=editItem(a.state,p.id,a.id,{estimateDays:3});
 const b=createItem(state,p.id,{title:SECOND,resourceId:firstResource.id,allocationPct:60});
 state=editItem(b.state,p.id,b.id,{estimateDays:3});
 validate(state);
 const compare=previewWorkResourceReassignment(state,{projectId:p.id,workId:b.id,
  targetResourceId:otherResource.id});
 if(compare.original.overloadResourceDays!==3||compare.alternative.overloadResourceDays!==0||
    compare.overloadDaysDelta!==-3)throw Error('Original resource comparison changed');
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
 process.stdout.write('ATLAS12_RESOURCE_ALTERNATIVES_IWXA_PASS projects=1 works=2 resources=2 overload_days=3 bytes='+bytes.length+'\n');
}

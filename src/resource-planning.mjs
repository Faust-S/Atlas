// Optional resource commitments live in the single Atlas portfolio snapshot.
// Resource IDs are local planning references, NOT identities, grants or employees.
import {validate} from "./core.mjs";

const validPercent=value=>Number.isSafeInteger(value)&&value>=1&&value<=1000;
const text=(value,name)=>{if(typeof value!=="string"||!value.trim()||value.length>160)throw Error("Некорректное название "+name);return value.trim()};
export function addPlanningResource(snapshot,{label,capacityPct=100,availableFrom=null,availableUntil=null}){
 validate(snapshot);
 if(!validPercent(capacityPct))throw Error("Мощность должна быть от 1 до 1000%");
 const id=crypto.randomUUID();
 const state=structuredClone(snapshot);
 state.resources??=[];
 state.resources.push({id,label:text(label,"ресурса"),capacityPct,
  availableFrom:availableFrom||null,availableUntil:availableUntil||null});
 state.revision++;
 validate(state);
 return {id,state};
}
export function editPlanningResource(snapshot,id,{label,capacityPct,availableFrom,availableUntil}){
 validate(snapshot);
 if(!validPercent(capacityPct))throw Error("Мощность должна быть от 1 до 1000%");
 const state=structuredClone(snapshot);
 const resource=(state.resources||[]).find(x=>x.id===id);
 if(!resource)throw Error("Ресурс для изменения не найден");
 resource.label=text(label,"ресурса");
 resource.capacityPct=capacityPct;
 resource.availableFrom=availableFrom||null;
 resource.availableUntil=availableUntil||null;
 state.revision++;
 validate(state);
 return {state};
}
export function resourceChoiceOptions(snapshot){
 return [{value:"",label:"Без привязки к плановому ресурсу"},...(snapshot?.resources||[]).map(x=>({value:x.id,label:x.label+" (до "+x.capacityPct+"%)"}))];
}

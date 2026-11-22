// UI preference only: layout never enters the Atlas Native Store or .iwxa.
export const ATLAS_DASHBOARD_WIDGETS=Object.freeze([
 {id:"metrics",title:"Состояние портфеля",span:"wide"},
 {id:"schedule",title:"Ближайшие сроки",span:"wide"},
 {id:"attention",title:"Требуют внимания",span:"normal"},
 {id:"portfolio",title:"Проекты",span:"normal"},
 {id:"review",title:"Решения по плану",span:"normal"},
 {id:"resources",title:"Плановые ресурсы",span:"normal"},
 {id:"sources",title:"Источники",span:"normal"},
 {id:"calendar",title:"Рабочие календари",span:"normal"}
]);
export const DEFAULT_ATLAS_DASHBOARD=Object.freeze(
 ["metrics","schedule","attention","portfolio","review","resources","sources"]);
const known=new Set(ATLAS_DASHBOARD_WIDGETS.map(w=>w.id));
export function normalizeAtlasDashboardLayout(input){
 if(!Array.isArray(input))return [...DEFAULT_ATLAS_DASHBOARD];
 const seen=new Set(),out=[];
 for(const id of input){
  if(typeof id!=="string"||!known.has(id)||seen.has(id))continue;
  seen.add(id);out.push(id);
 }
 return out;
}
export function toggleAtlasDashboardWidget(input,id,checked){
 const layout=normalizeAtlasDashboardLayout(input);
 if(!known.has(id))return layout;
 return checked?(layout.includes(id)?layout:[...layout,id]):layout.filter(item=>item!==id);
}
export function moveAtlasDashboardWidget(input,id,destination){
 const layout=normalizeAtlasDashboardLayout(input);
 if(!layout.includes(id)||!layout.includes(destination)||id===destination)return layout;
 const next=layout.filter(x=>x!==id),position=next.indexOf(destination);
 next.splice(position,0,id);
 return next;
}
export function shiftAtlasDashboardWidget(input,id,delta){
 const layout=normalizeAtlasDashboardLayout(input),position=layout.indexOf(id);
 if(position<0||![-1,1].includes(delta)||position+delta<0||position+delta>=layout.length)return layout;
 const next=[...layout];[next[position],next[position+delta]]=[next[position+delta],next[position]];
 return next;
}

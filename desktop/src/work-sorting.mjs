// View-only work table ordering. Never changes the Atlas domain snapshot.
const priorityOrder={critical:0,high:1,normal:2,low:3};
const stateOrder={blocked:0,in_progress:1,todo:2,done:3};
export function sortWorkRows(items,kind="title"){
 const values=new Set(["title","dueDate","priority","estimateDays","state"]);
 if(!values.has(kind))throw Error("Unknown work table ordering");
 const text=value=>String(value??"").toLocaleLowerCase("ru-RU");
 const weight=(item)=>{
  if(kind==="priority")return priorityOrder[item.priority]??4;
  if(kind==="state")return stateOrder[item.state]??4;
  if(kind==="estimateDays")return item.estimateDays??1;
  if(kind==="dueDate")return item.dueDate||"9999-12-31";
  return text(item.title);
 };
 return [...items].sort((a,b)=>{
  const x=weight(a),y=weight(b);
  const result=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),"ru");
  return result||text(a.title).localeCompare(text(b.title),"ru");
 });
}


/** Pure work-list filter, based only on explicitly originating observations.
 * Neither completion nor a manual finding grants independent acceptance.
 */
export function filterWorkRowsByObservation(items,findingsByWork,mode="all"){
 if(!new Set(["all","with","without","done_without"]).has(mode))throw Error("Unknown work observation filter");
 if(!(findingsByWork instanceof Map))throw Error("Expected work observation index");
 return items.filter(item=>{
  const observed=(findingsByWork.get(item.id)?.length||0)>0;
  return mode==="all"||mode==="with"&&observed||
   mode==="without"&&!observed||mode==="done_without"&&item.state==="done"&&!observed;
 });
}

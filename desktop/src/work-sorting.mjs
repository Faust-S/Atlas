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

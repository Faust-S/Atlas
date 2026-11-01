// Named, accessible in-page editors. Never expose internal IDs as editable text.
import {createProject,editProject,createStage,createItem,editItem,connect,createRisk,createDecision,attach} from "./core.mjs";
import {addTarget,recordFinding,planChange,updateChange} from "./trace.mjs";

const option=(value,label)=>({value:String(value),label});
const choice=(name,label,items,value="",required=true)=>({name,label,type:"select",options:items,value,required});
const field=(name,label,type="text",value="",required=true)=>({name,label,type,value:value??"",required});
const statusOptions=[option("planned","Запланирован"),option("active","В работе"),option("paused","Приостановлен"),option("completed","Завершён (заявлено)"),option("cancelled","Отменён")];
const workOptions=[option("todo","Запланирована"),option("in_progress","В работе"),option("blocked","Заблокирована"),option("done","Выполнена (заявлено)")];
const changeOptions=[option("proposed","Предложено"),option("approved","Утверждено"),option("in_progress","В работе"),option("implemented","Реализовано (заявлено)"),option("deferred","Отложено"),option("rejected","Отклонено")];
const targetOptions=p=>(p.targets||[]).map(t=>option(t.id,t.title));
const workItems=p=>p.items.map(t=>option(t.id,t.title));
const stageOptions=p=>[option("","Без этапа"),...p.stages.map(t=>option(t.id,t.name))];
const optionalTargets=p=>[option("","Весь проект"),...targetOptions(p)];
const sourceOptions=p=>{
 const all=[option("","Заявление без внешней привязки")];
 for(const source of p.sources){
  if(source.kind==="github_owner")continue; // Catalog discovery does not attest a revision.
  const branches=source.summary?.branches?.length?source.summary.branches:[source.summary?.defaultBranch||""];
  for(const branch of branches)all.push(option(source.id+"::"+branch,source.kind+" · "+source.locator+(branch?" / "+branch:"")+" ("+source.status+")"));
 }
 return all;
};
export function editorSpec(project,action){
 if(action==="new")return {title:"Новый проект",fields:[
  field("name","Название проекта"),
  choice("type","Тип проекта",["personal:Личный","team:Команда","business:Бизнес","engineering:Разработка","research:Исследование","care:Здоровье (без медицинских записей)","other:Другое"].map(s=>option(...s.split(":"))),"personal"),
  {...field("goal","Цель и ожидаемый результат","textarea","",false)}
 ]};
 if(!project)throw Error("Сначала выберите проект");
 if(action==="stage")return {title:"Новый этап",fields:[field("name","Название этапа")]};
 if(action==="item"||action.startsWith("item-target:")){
  const targetId=action.startsWith("item-target:")?action.slice("item-target:".length):"";
  const target=(project.targets||[]).find(t=>t.id===targetId);
  if(targetId&&!target)throw Error("Связанное требование не найдено");
  return {title:target?"Работа по требованию: "+target.title:"Новая работа",fields:[
   field("title","Что нужно сделать?", "text",target?"Проверить: "+target.title:""),
   choice("targetId","Связать с ожидаемым результатом",optionalTargets(project),targetId,false),
   choice("stageId","Этап",stageOptions(project),"",false),
   field("assignee","Ответственный (имя или роль)","text","",false),
   field("estimateDays","Оценка длительности, календарных дней","number","1")
  ]};
 }
 if(action==="dep")return {title:"Добавить зависимость",hint:"Следующая работа начнётся после предыдущей. Циклы запрещены.",fields:[choice("from","Предшествующая работа",workItems(project)),choice("to","Зависимая работа",workItems(project))]};
 if(action==="target")return {title:"Ожидаемый результат",fields:[field("title","Название требования"),field("desired","Критерий выполнения","textarea"),choice("intent","Статус цели",[option("committed","Обязательно (принято в план)"),option("candidate","Предложение")],"committed")]};
 if(action==="finding"||action.startsWith("finding-target:"))return {title:"Фактическое состояние — заявление",hint:"Это запись сведений, а не независимая приёмка. Для подтверждения выберите источник и версию.",fields:[choice("targetId","К какому требованию относится",targetOptions(project),action.startsWith("finding-target:")?action.slice("finding-target:".length):targetOptions(project)[0]?.value),choice("result","Что известно",[option("present","Реализовано (заявлено)"),option("partial","Частично"),option("absent","Отсутствует")],"partial"),choice("level","Уровень заявления",[option("implementation","Реализация"),option("test","Тестирование"),option("acceptance","Приёмка")],"implementation"),choice("sourceRef","Внешний источник и ветка",sourceOptions(project),"",false),field("reference","Ссылка на документ или проверку","text","",false),field("note","Что именно наблюдалось","textarea","",false)]};
 if(action==="proposal")return {title:"Предложить изменение",fields:[field("title","Название изменения"),field("description","Суть и причина","textarea","",false),choice("targetId","На что влияет",optionalTargets(project),"",false)]};
 if(action.startsWith("change:")){const c=(project.changes||[]).find(x=>x.id===action.slice(7));if(!c)throw Error("Изменение не найдено");return {title:"Статус изменения: "+c.title,fields:[choice("status","Решение",changeOptions,c.status)]}}
 if(action==="status")return {title:"Статус проекта",fields:[choice("status","Текущий статус",statusOptions,project.status)]};
 if(action==="start")return {title:"Дата начала планирования",fields:[field("startDate","Дата начала","date",project.startDate||"",false)]};
 if(action.startsWith("duration:")){const item=project.items.find(x=>x.id===action.slice(9));if(!item)throw Error("Работа не найдена");return {title:"Продолжительность: "+item.title,fields:[field("estimateDays","Календарных дней (0–36500)","number",String(item.estimateDays??1))]}};
 if(action.startsWith("work:")){const item=project.items.find(x=>x.id===action.slice(5));if(!item)throw Error("Работа не найдена");return {title:"Работа: "+item.title,fields:[choice("state","Состояние",workOptions,item.state),choice("priority","Приоритет",[option("low","Низкий"),option("normal","Обычный"),option("high","Высокий"),option("critical","Критический")],item.priority),field("assignee","Ответственный","text",item.assignee,false),field("estimateDays","Плановая длительность, дней","number",String(item.estimateDays??1)),choice("targetId","Связать с ожидаемым результатом",optionalTargets(project),item.targetIds?.[0]||"",false)]}};
 if(action==="risk")return {title:"Новый риск",fields:[field("text","Что может помешать?","textarea")]};
 if(action==="decision")return {title:"Зафиксировать решение",fields:[field("text","Решение и основание","textarea")]};
 if(action==="source")return {title:"Подключить ссылку на источник",hint:"github_owner — публичный владелец GitHub (имя пользователя или организации); github — отдельный публичный owner/repository. Остальные источники пока только ссылки. Приватные данные не запрашиваются.",fields:[choice("kind","Тип источника",["github","github_owner","gitlab","forgejo","gitea","obsidian","anytype","jira","file","other"].map(x=>option(x,x)),"github"),field("locator","Ссылка или идентификатор источника")]};
 throw Error("Неизвестная форма: "+action);
}
export function renderEditor(spec,esc){
 const fields=spec.fields.map(x=>{
  const id="atlas-field-"+x.name;
  const attrs=' id="'+id+'" name="'+esc(x.name)+'"'+(x.required?' required':'');
  let control;
  if(x.type==="select")control='<select'+attrs+'>'+x.options.map(o=>'<option value="'+esc(o.value)+'"'+(o.value===x.value?' selected':'')+'>'+esc(o.label)+'</option>').join("")+'</select>';
  else if(x.type==="textarea")control='<textarea'+attrs+' rows="3">'+esc(x.value)+'</textarea>';
  else control='<input'+attrs+' type="'+esc(x.type)+'" value="'+esc(x.value)+'"'+(x.type==="number"?' min="0" max="36500" step="1"':'')+'>';
  return '<label class="atlas-field" for="'+id+'"><span>'+esc(x.label)+'</span>'+control+'</label>';
 }).join("");
 return '<section class="card atlas-editor" aria-labelledby="atlas-editor-title"><h2 id="atlas-editor-title">'+esc(spec.title)+'</h2>'+(spec.hint?'<p class="muted">'+esc(spec.hint)+'</p>':"")+'<form id="atlas-editor-form"><div class="atlas-form-grid">'+fields+'</div><div class="row"><button type="submit" class="primary">Сохранить</button><button type="button" data-action="cancel-editor">Отмена</button></div></form></section>';
}
export function applyEditor(snapshot,projectId,action,input){
 const get=k=>String(input.get(k)??"").trim();
 const integer=k=>{const raw=get(k);if(!/^\d+$/.test(raw))throw Error("Введите неотрицательное целое число");return Number(raw)};
 if(action==="new"){const r=createProject(snapshot,{name:get("name"),type:get("type"),goal:get("goal")});return {state:r.state,projectId:r.id}}
 const p=snapshot.projects.find(x=>x.id===projectId);
 if(!p)throw Error("Проект не найден");
 if(action==="stage")return {state:createStage(snapshot,projectId,get("name")).state};
 if(action==="item"||action.startsWith("item-target:")){const r=createItem(snapshot,projectId,{title:get("title"),stageId:get("stageId"),assignee:get("assignee"),targetIds:get("targetId")?[get("targetId")]:[]});return {state:editItem(r.state,projectId,r.id,{estimateDays:integer("estimateDays")})}};
 if(action==="dep")return {state:connect(snapshot,projectId,get("from"),get("to"))};
 if(action==="target")return {state:addTarget(snapshot,projectId,{title:get("title"),desired:get("desired"),intent:get("intent")}).state};
 if(action==="finding"||action.startsWith("finding-target:")){
  const sourceRef=get("sourceRef");
  const marker=sourceRef.indexOf("::");
  const sourceId=marker>=0?sourceRef.slice(0,marker):null;
  const ref=marker>=0?sourceRef.slice(marker+2)||null:null;
  const source=p.sources.find(s=>s.id===sourceId);
  if(sourceId&&!source)throw Error("Источник не найден");
  const revision=source&&source.status==="ok"&&ref?source.summary?.branchHeads?.[ref]||null:null;
  return {state:recordFinding(snapshot,projectId,{targetId:get("targetId"),result:get("result"),level:get("level"),sourceId,ref,revision,reference:get("reference"),note:get("note")}).state};
 }
 if(action==="proposal")return {state:planChange(snapshot,projectId,{title:get("title"),description:get("description"),targetIds:get("targetId")?[get("targetId")]:[]}).state};
 if(action.startsWith("change:"))return {state:updateChange(snapshot,projectId,action.slice(7),get("status")).state};
 if(action==="status")return {state:editProject(snapshot,projectId,{status:get("status")})};
 if(action==="start")return {state:editProject(snapshot,projectId,{startDate:get("startDate")||null})};
 if(action.startsWith("duration:"))return {state:editItem(snapshot,projectId,action.slice(9),{estimateDays:integer("estimateDays")})};
 if(action.startsWith("work:"))return {state:editItem(snapshot,projectId,action.slice(5),{state:get("state"),priority:get("priority"),assignee:get("assignee"),estimateDays:integer("estimateDays"),targetIds:get("targetId")?[get("targetId")]:[]})};
 if(action==="risk")return {state:createRisk(snapshot,projectId,get("text"))};
 if(action==="decision")return {state:createDecision(snapshot,projectId,get("text"))};
 if(action==="source")return {state:attach(snapshot,projectId,get("kind"),get("locator")).state};
 throw Error("Неизвестное действие");
}

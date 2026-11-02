// Named, accessible in-page editors. Never expose internal IDs as editable text.
import {validate as validateLinkedPlan,createProject,editProject,createStage,createItem,editItem,connect,createRisk,createDecision,attach} from "./core.mjs";
import {addTarget,recordFinding,planChange,updateChange,decideChange} from "./trace.mjs";
import {projectSignals,validCauseKey} from "./response.mjs";
import {projectImpact} from "./impact.mjs";
import {parseRecheckAction,recheckCandidate} from "./revision-review.mjs";
import {addPortfolioLink} from "./portfolio.mjs";
import {parsePlanReviewAction,parsePlanProposalAction,planReviewContext,decidePlanReview,planProposalContext} from "./plan-review.mjs";
import {setPlanDates,setPlanWork,addPlanWork,checkPlanAmendment} from "./plan-amendment.mjs";

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
export function editorSpec(project,action,snapshot=null){
 if(action==="portfolio-link"){
  const projects=snapshot?.projects||[];
  if(projects.length<2)throw Error("Для связи нужны минимум два проекта");
  const options=projects.map(p=>option(p.id,p.name));
  return {title:"Межпроектная зависимость",hint:"Первый проект предоставляет результат, необходимый второму. Связь плановая, а не подтверждение релиза.",fields:[choice("from","Предшествующий проект",options),choice("to","Зависимый проект",options,projects[1].id),field("note","Условие или результат зависимости","textarea","",false)]};
 }

 if(action.startsWith("plan-review:")){
  if(!snapshot)throw Error("Для решения требуется снимок портфеля");
  const request=parsePlanReviewAction(action),row=planReviewContext(snapshot,request);
  return {title:"Решение по плану: "+row.projectName,
   hint:"Перепроверка "+row.rootProjectName+" · "+row.targetTitle+" · "+row.oldSha+" → "+row.revision+
   ". Влияние по зависимостям потенциальное; решение не меняет существующий план.",
   fields:[
    choice("outcome","Что делать с текущим планом?",[
     option("keep","Сохранить действующий план"),
     option("revise","Предложить изменение плана"),
     option("defer","Отложить рассмотрение")],"defer"),
    field("rationale","Основание решения (не менее восьми символов)","textarea","",true)
   ]};
 }
 if(action.startsWith("plan-proposal:")){
  if(!snapshot)throw Error("Для заявки требуется снимок портфеля");
  const request=parsePlanProposalAction(action),ctx=planProposalContext(snapshot,request.projectId,request.decisionId);
  return {title:"Изменение плана: "+ctx.project.name,
   hint:"Предложение по решению о перепроверке "+ctx.row.targetTitle+
    ". Заявка не изменяет работы, сроки и обязательства до отдельного утверждения.",
   fields:[
    field("title","Что изменить в плане?","text","Пересмотреть план: "+ctx.row.targetTitle),
    field("description","Предлагаемое изменение и причины","textarea",ctx.decision.text,true)
   ]};
 }
 if(action.startsWith("amend-dates:")||action.startsWith("amend-work:")||action.startsWith("amend-new:")){
  if(!snapshot||!project)throw Error("Для корректировки требуется снимок проекта");
  const kind=action.split(":")[0],id=action.slice(kind.length+1);
  const change=(project.changes||[]).find(x=>x.id===id);
  if(!change||!["proposed","deferred"].includes(change.status)||change.planAppliedAt)
   throw Error("Изменение нельзя уточнить после утверждения");
  const dateAction=(change.planAmendments||[]).find(a=>a.kind==="dates");
  const context="Корректировки фиксируются в заявке до утверждения; текущий план пока не меняется.";
  if(kind==="amend-dates")return {title:"Изменить плановые даты: "+change.title,hint:context,fields:[
   field("startDate","Плановое начало","date",dateAction?.after.startDate??project.startDate??"",false),
   field("dueDate","Контрольный срок","date",dateAction?.after.dueDate??project.dueDate??"",false)
  ]};
  if(kind==="amend-work"){
   if(!project.items.length)throw Error("В проекте пока нет работ");
   return {title:"Изменить работу: "+change.title,hint:context,fields:[
    choice("itemId","Работа",workItems(project)),
    field("estimateDays","Новая оценка, календарных дней","number","1"),
    field("assignee","Ответственный (имя или роль)","text","",false),
    field("dueDate","Срок работы","date","",false)
   ]};
  }
  return {title:"Предложить новую работу: "+change.title,hint:context,fields:[
   field("title","Название обязательства / работы"),
   choice("stageId","Этап",stageOptions(project),"",false),
   choice("targetId","Связанное требование",optionalTargets(project),"",false),
   field("estimateDays","Длительность, календарных дней","number","1"),
   field("assignee","Ответственный (имя или роль)","text","",false),
   field("dueDate","Срок работы","date","",false)
  ]};
 }
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
 if(action.startsWith("recheck:")){
  const {projectId,findingId,expectedSha}=parseRecheckAction(action);
  if(projectId!==project.id)throw Error("Revision review project mismatch");
  const candidate=recheckCandidate(project,findingId,expectedSha);
  if(!candidate)throw Error("Сначала обновите источник: ревизия или активный факт изменились");
  return {title:"Повторная проверка: "+candidate.target.title,
   hint:"Было: "+candidate.previousSha+" · Сейчас: "+candidate.observedSha+
    ". Это новое заявление о проверке, а не автоматическая приёмка. Старая запись останется в истории.",
   fields:[
    choice("result","Что установлено после повторной проверки?",[
     option("present","Реализовано (заявлено)"),option("partial","Частично"),option("absent","Отсутствует")],"partial"),
    choice("level","Уровень проверки",[option("implementation","Реализация"),option("test","Тестирование"),option("acceptance","Приёмка")],"test"),
    field("reference","Ссылка на подтверждающий материал","text","",false),
    field("note","Что именно перепроверено на этой ревизии?","textarea","",true)
   ]};
 }
 if(action==="finding"||action.startsWith("finding-target:"))return {title:"Фактическое состояние — заявление",hint:"Это запись сведений, а не независимая приёмка. Для подтверждения выберите источник и версию.",fields:[choice("targetId","К какому требованию относится",targetOptions(project),action.startsWith("finding-target:")?action.slice("finding-target:".length):targetOptions(project)[0]?.value),choice("result","Что известно",[option("present","Реализовано (заявлено)"),option("partial","Частично"),option("absent","Отсутствует")],"partial"),choice("level","Уровень заявления",[option("implementation","Реализация"),option("test","Тестирование"),option("acceptance","Приёмка")],"implementation"),choice("sourceRef","Внешний источник и ветка",sourceOptions(project),"",false),field("reference","Ссылка на документ или проверку","text","",false),field("note","Что именно наблюдалось","textarea","",false)]};
 if(action.startsWith("respond:")){
  const key=decodeURIComponent(action.slice(8));
  const signal=projectSignals(project,projectImpact(project)).find(s=>s.key===key);
  if(!signal)throw Error("Причина больше не наблюдается");
  return {title:"Изменение для устранения: "+signal.title,fields:[
   field("title","Что предлагается изменить?","text","Устранить: "+signal.title),
   field("description","Обоснование и ожидаемый результат","textarea",signal.detail,true)
  ]};
 }
 if(action.startsWith("work-change:")){
  const id=action.slice(12),change=(project.changes||[]).find(c=>c.id===id);
  if(!change||!["approved","in_progress"].includes(change.status))throw Error("Изменение не утверждено");
  return {title:"Работа по утверждённому изменению",fields:[
   field("title","Конкретная работа","text",change.title),
   choice("stageId","Этап",stageOptions(project),"",false),
   field("assignee","Ответственный","text","",false),
   field("estimateDays","Оценка, дней","number","1")
  ]};
 }
 if(action==="proposal")return {title:"Предложить изменение",fields:[field("title","Название изменения"),field("description","Суть и причина","textarea","",false),choice("targetId","На что влияет",optionalTargets(project),"",false)]};
 if(action.startsWith("change:")){
  const c=(project.changes||[]).find(x=>x.id===action.slice(7));if(!c)throw Error("Изменение не найдено");
  const choices={proposed:["approved","rejected","deferred"],deferred:["approved","rejected"],approved:["in_progress","deferred"],in_progress:["implemented","deferred"]};
  const allowed=choices[c.status]||[];
  if(!allowed.length)throw Error("Изменение завершено или отклонено");
  return {title:"Решение: "+c.title,hint:"Решение и обоснование останутся в истории. Если заявка содержит конкретную корректировку, утверждение не применяет её автоматически.",fields:[
   choice("status","Новый статус",changeOptions.filter(o=>allowed.includes(o.value)),allowed[0]),
   field("rationale","Почему принято это решение?","textarea")
  ]};
 }
 if(action==="status")return {title:"Статус проекта",fields:[choice("status","Текущий статус",statusOptions,project.status)]};
 if(action==="start"||action==="dates")return {title:"Плановые даты проекта",hint:"Указанные даты остаются исходным планом. Расчёт межпроектных зависимостей не меняет их автоматически.",fields:[
 field("startDate","Дата начала","date",project.startDate||"",false),
 field("dueDate","Контрольный срок","date",project.dueDate||"",false)
 ]};
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
 if(action.startsWith("plan-review:")){
  const request=parsePlanReviewAction(action);
  if(request.projectId!==projectId)throw Error("Неверный проект решения");
  return {state:decidePlanReview(snapshot,request,{outcome:get("outcome"),rationale:get("rationale")}).state};
 }
 if(action.startsWith("plan-proposal:")){
  const request=parsePlanProposalAction(action);
  if(request.projectId!==projectId)throw Error("Неверный проект заявки");
  const ctx=planProposalContext(snapshot,request.projectId,request.decisionId);
  const targetIds=ctx.row.rootProjectId===projectId?[ctx.row.targetId]:[];
  const result=planChange(snapshot,projectId,{title:get("title"),description:get("description"),targetIds});
  const next=result.state,change=next.projects.find(p=>p.id===projectId).changes.find(c=>c.id===result.id);
  change.planReviewDecisionId=ctx.decision.id;
  validateLinkedPlan(next);
  return {state:next};
 }
 if(action.startsWith("amend-dates:"))return {state:setPlanDates(snapshot,projectId,action.slice(12),{
  startDate:get("startDate"),dueDate:get("dueDate")}).state};
 if(action.startsWith("amend-work:"))return {state:setPlanWork(snapshot,projectId,action.slice(11),{
  itemId:get("itemId"),estimateDays:integer("estimateDays"),assignee:get("assignee"),dueDate:get("dueDate")}).state};
 if(action.startsWith("amend-new:"))return {state:addPlanWork(snapshot,projectId,action.slice(10),{
  title:get("title"),stageId:get("stageId"),targetId:get("targetId"),estimateDays:integer("estimateDays"),
  assignee:get("assignee"),dueDate:get("dueDate")}).state};
 if(action==="new"){const r=createProject(snapshot,{name:get("name"),type:get("type"),goal:get("goal")});return {state:r.state,projectId:r.id}}
 if(action==="portfolio-link")return {state:addPortfolioLink(snapshot,{from:get("from"),to:get("to"),note:get("note")})};
 const p=snapshot.projects.find(x=>x.id===projectId);
 if(!p)throw Error("Проект не найден");
 if(action==="stage")return {state:createStage(snapshot,projectId,get("name")).state};
 if(action==="item"||action.startsWith("item-target:")){const r=createItem(snapshot,projectId,{title:get("title"),stageId:get("stageId"),assignee:get("assignee"),targetIds:get("targetId")?[get("targetId")]:[]});return {state:editItem(r.state,projectId,r.id,{estimateDays:integer("estimateDays")})}};
 if(action==="dep")return {state:connect(snapshot,projectId,get("from"),get("to"))};
 if(action==="target")return {state:addTarget(snapshot,projectId,{title:get("title"),desired:get("desired"),intent:get("intent")}).state};
 if(action.startsWith("recheck:")){
  const {projectId:requestProject,findingId,expectedSha}=parseRecheckAction(action);
  if(requestProject!==projectId)throw Error("Revision review project mismatch");
  const candidate=recheckCandidate(p,findingId,expectedSha);
  if(!candidate)throw Error("Повторная проверка отклонена: исходная ревизия или актуальный факт изменились");
  return {state:recordFinding(snapshot,projectId,{
   targetId:candidate.target.id,result:get("result"),level:get("level"),
   sourceId:candidate.source.id,ref:candidate.claim.ref,revision:candidate.observedSha,
   reference:get("reference"),note:get("note"),reviewOfFindingId:candidate.claim.id
  }).state};
 }
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
 if(action.startsWith("respond:")){
  const key=decodeURIComponent(action.slice(8));
  const signal=projectSignals(p,projectImpact(p)).find(s=>s.key===key);
  if(!signal||!validCauseKey(p,key))throw Error("Причина больше не наблюдается");
  if((p.changes||[]).some(c=>c.causeKey===key&&["proposed","approved","in_progress"].includes(c.status)))throw Error("Активное изменение для причины уже существует");
  return {state:planChange(snapshot,projectId,{title:get("title"),description:get("description"),targetIds:signal.targetIds,causeKey:key}).state};
 }
 if(action.startsWith("work-change:")){
  const changeId=action.slice(12),change=(p.changes||[]).find(c=>c.id===changeId);
  if(!change||!["approved","in_progress"].includes(change.status))throw Error("Изменение не утверждено");
  const created=createItem(snapshot,projectId,{title:get("title"),stageId:get("stageId"),assignee:get("assignee"),targetIds:change.targetIds,changeId});
  return {state:editItem(created.state,projectId,created.id,{estimateDays:integer("estimateDays")})};
 }
 if(action==="proposal")return {state:planChange(snapshot,projectId,{title:get("title"),description:get("description"),targetIds:get("targetId")?[get("targetId")]:[]}).state};
 if(action.startsWith("change:")){
  const id=action.slice(7),status=get("status");
  const current=p.changes?.find(c=>c.id===id);
  if(["approved","in_progress"].includes(status)&&current?.planAmendments?.length)
   checkPlanAmendment(snapshot,projectId,id);
  return {state:decideChange(snapshot,projectId,id,{status,rationale:get("rationale")}).state};
 }
 if(action==="status")return {state:editProject(snapshot,projectId,{status:get("status")})};
 if(action==="start"||action==="dates")return {state:editProject(snapshot,projectId,{startDate:get("startDate")||null,dueDate:get("dueDate")||null})};
 if(action.startsWith("duration:"))return {state:editItem(snapshot,projectId,action.slice(9),{estimateDays:integer("estimateDays")})};
 if(action.startsWith("work:"))return {state:editItem(snapshot,projectId,action.slice(5),{state:get("state"),priority:get("priority"),assignee:get("assignee"),estimateDays:integer("estimateDays"),targetIds:get("targetId")?[get("targetId")]:[]})};
 if(action==="risk")return {state:createRisk(snapshot,projectId,get("text"))};
 if(action==="decision")return {state:createDecision(snapshot,projectId,get("text"))};
 if(action==="source")return {state:attach(snapshot,projectId,get("kind"),get("locator")).state};
 throw Error("Неизвестное действие");
}

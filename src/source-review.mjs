// Human-readable rendering model for the existing Atlas source observation.
// No additional fetching, source cache, project writes or readiness verdicts.
const asArray=value=>Array.isArray(value)?value:[];
const isString=value=>typeof value==="string"&&value.length>0;
const isSupported=kind=>kind==="github"||kind==="github_owner";
const clipSha=value=>isString(value)?value.slice(0,12):null;
import {repoName,ownerName} from "./github-public.mjs";

function sourceWebUrl(source){
 try{
  if(source.kind==="github")return "https://github.com/"+repoName(source.locator);
  if(source.kind==="github_owner")return "https://github.com/"+ownerName(source.locator);
 }catch{}
 return null;
}
function checkReview(source){
 if(source.kind!=="github"||source.status==="never")return null;
 const check=source.summary?.ci;
 if(!check)return {state:"unobserved",label:"Проверки GitHub Actions ещё не запрашивались",
  url:null,branch:source.branch??source.summary?.defaultBranch??null,headCurrent:"unknown"};
 let label="Сведения о проверках пока недоступны";
 if(check.state==="none")label="На выбранной ветке нет запусков GitHub Actions";
 if(check.state==="invalid")label="GitHub вернул неполные сведения о проверке";
 if(check.state==="unavailable")label=check.reason==="BRANCH_NOT_FOUND"?
  "Выбранная ветка не найдена в открытом репозитории":"Не удалось получить состояние GitHub Actions";
 if(check.state==="observed"){
  if(check.status==="in_progress")label="Проверка GitHub выполняется";
  else if(["queued","waiting","pending","requested"].includes(check.status))label="Проверка GitHub ожидает запуска";
  else if(check.status==="completed"&&check.conclusion==="success")
   label=check.headCurrent==="current"?"Проверка этой версии успешно завершена":
    check.headCurrent==="previous"?"Успешная проверка относится к предыдущей версии":"Проверка завершилась успешно, но версия не сопоставлена";
  else if(check.status==="completed"&&["failure","timed_out","action_required","stale"].includes(check.conclusion))
   label="Последняя проверка GitHub завершилась с ошибкой";
  else if(check.status==="completed")label="Последняя проверка не подтвердила успех";
  else label="Состояние проверки GitHub не определено";
  if(check.headCurrent==="previous"&&!label.includes("предыдущей версии"))
   label+=". Для текущей версии результата нет";
 }
 let url=null;
 if(check.state==="observed"&&Number.isSafeInteger(check.runId)&&check.runId>0){
  try{url="https://github.com/"+repoName(source.locator)+"/actions/runs/"+check.runId}
  catch{url=null}
 }
 if(source.status==="error")label="Предыдущее наблюдение: "+label;
 return {state:check.state,label,url,branch:check.branch??null,headCurrent:check.headCurrent||"unknown",
  // No workflow state can authorize a readiness or acceptance verdict.
  authority:"OBSERVATION_ONLY"};
}
export function sourceReview(source,{limit=12}={}){
 if(!source||typeof source!=="object")throw Error("SOURCE_REVIEW_INVALID");
 if(!Number.isInteger(limit)||limit<1||limit>2000)throw Error("SOURCE_REVIEW_LIMIT_INVALID");
 const supported=isSupported(source.kind);
 const lastAttempt=isString(source.observedAt)?source.observedAt:null;
 const lastSuccess=isString(source.summary?.observedAt)?source.summary.observedAt:
   source.status==="ok"?lastAttempt:null;
 const hasError=source.status==="error";
 let status="Ссылка; автоматическое наблюдение не подключено";
 if(supported){
  if(hasError)status="Последняя сверка завершилась ошибкой";
  else if(source.status==="never"||!lastAttempt)status="Ещё не наблюдался";
  else if(source.status==="ok"&&source.summary?.complete===false)status="Неполное наблюдение";
  else if(source.status==="ok"&&source.summary?.complete===true)status="Получены сведения GitHub";
  else status="Состояние источника не установлено";
 }
 const change=source.summary?.changes;
 const comparable=change?.comparable===true;
 const revisions=new Map(asArray(change?.revisions).filter(x=>isString(x?.ref)).map(x=>[x.ref,x]));
 const totals={
  changed:comparable?asArray(change.changed).length:0,
  added:comparable?asArray(change.added).length:0,
  removed:comparable?asArray(change.removed).length:0,
  renamed:comparable?asArray(change.renamed).length:0
 };
 const total=Object.values(totals).reduce((a,b)=>a+b,0);
 const rows=[];
 const push=(kind,title,before=null,after=null)=>{
  if(rows.length>=limit)return;
  rows.push({kind,title:String(title??""),before:clipSha(before),after:clipSha(after)});
 };
 if(comparable){
  for(const name of asArray(change.changed)){
   if(rows.length>=limit)break;
   const ref=revisions.get(name);
   push("Изменена",name,ref?.previousSha,ref?.currentSha);
  }
  for(const name of asArray(change.added)){if(rows.length>=limit)break;push("Добавлена",name)}
  for(const name of asArray(change.removed)){if(rows.length>=limit)break;push("Удалена",name)}
  for(const item of asArray(change.renamed)){
   if(rows.length>=limit)break;
   push("Переименована",isString(item?.from)&&isString(item?.to)?item.from+" → "+item.to:item);
  }
 }
 return Object.freeze({
  supported,status,lastAttempt,lastSuccess,
  sourceUrl:supported?sourceWebUrl(source):null,
  error:hasError?String(source.error||"Источник недоступен"):null,
  comparison:comparable?"COMPARABLE":change?.baseline?"BASELINE":"NOT_COMPARABLE",
  totals,total,rows,
  remaining:Math.max(0,total-rows.length),
  previousObservation:hasError&&!!source.summary,
  ci:checkReview(source),
  // A GitHub observation is only evidence of a source version; never a
  // declaration that requirements, tests, releases or work are accepted.
  authority:"OBSERVATION_ONLY"
 });
}

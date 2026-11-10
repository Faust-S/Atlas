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
function observedCommit(source){
 if(source.kind!=="github"||!source.summary||source.status==="never")return null;
 // The selected branch and SHA belong to the previously saved observation,
 // not a live repository state or an assertion about completion.
 const branch=source.branch||source.summary.ci?.branch||source.summary.defaultBranch;
 const sha=typeof branch==="string"?source.summary.branchHeads?.[branch]:null;
 if(typeof branch!=="string"||!branch||typeof sha!=="string"||
    !/^[a-f0-9]{40}$/i.test(sha))return null;
 try{
  const name=repoName(source.locator),revision=sha.toLowerCase();
  return {branch,sha:revision,url:"https://github.com/"+name+"/commit/"+revision};
 }catch{return null}
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
  "Выбранная ветка не найдена в открытом репозитории":
  ["BRANCH_LOOKUP_UNAVAILABLE","BRANCH_LOOKUP_INVALID"].includes(check.reason)?
  "Не удалось проверить выбранную ветку GitHub":
  check.reason==="RATE_LIMITED"?"GitHub временно ограничил количество запросов":
  "Не удалось получить состояние GitHub Actions";
 if(check.state==="observed"){
  if(check.status==="in_progress")label="Проверка GitHub выполняется";
  else if(["queued","waiting","pending","requested"].includes(check.status))label="Проверка GitHub ожидает запуска";
  else if(check.status==="completed"&&check.conclusion==="success")
   label=check.headCurrent==="current"?"Проверка этой версии успешно завершена":
    check.headCurrent==="previous"?"Успешная проверка относится к другой редакции":"Проверка завершилась успешно, но версия не сопоставлена";
  else if(check.status==="completed"&&["failure","timed_out","action_required","stale"].includes(check.conclusion))
   label="Последняя проверка GitHub завершилась с ошибкой";
  else if(check.status==="completed")label="Последняя проверка не подтвердила успех";
  else label="Состояние проверки GitHub не определено";
  if(check.headCurrent==="previous"&&!label.includes("другой редакции"))
   label+=". Для редакции, наблюдавшейся при сверке, результат не подтверждён";
 }
 let checkedCommit=null;
 if(check.state==="observed"&&typeof check.headSha==="string"&&/^[a-f0-9]{40}$/i.test(check.headSha)){
  try{
   const sha=check.headSha.toLowerCase();
   checkedCommit={sha,url:"https://github.com/"+repoName(source.locator)+"/commit/"+sha};
  }catch{checkedCommit=null}
 }
 let url=null;
 if(check.state==="observed"&&Number.isSafeInteger(check.runId)&&check.runId>0){
  try{url="https://github.com/"+repoName(source.locator)+"/actions/runs/"+check.runId}
  catch{url=null}
 }
 if(source.status==="error")label="Предыдущее наблюдение: "+label;
 return {state:check.state,label,url,branch:check.branch??null,checkedCommit,
  headCurrent:check.headCurrent||"unknown",
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
  else if(source.status==="ok"&&source.summary?.complete===false)
   status=source.kind==="github"&&observedCommit(source)
    ?"Выбранная ветка проверена; список остальных веток неполон":"Неполное наблюдение";
  else if(source.status==="ok"&&source.summary?.complete===true)status="Получены сведения GitHub";
  else status="Состояние источника не установлено";
 }
 const change=source.summary?.changes;
 const comparable=change?.comparable===true;
 const branchDelta=change?.selectedRevision;
 const rootDelta=change?.structureDelta;
 // The root comparison is independent of incomplete branch pagination.
 // Never report folder/file removals based on a truncated root listing.
 const structureDelta=source.kind==="github"&&source.status==="ok"&&
  rootDelta&&Array.isArray(rootDelta.addedFolders)&&
  Array.isArray(rootDelta.removedFolders)&&Array.isArray(rootDelta.addedFiles)&&
  Array.isArray(rootDelta.removedFiles)?
  {...rootDelta,total:rootDelta.addedFolders.length+rootDelta.removedFolders.length+
   rootDelta.addedFiles.length+rootDelta.removedFiles.length}:null;
 let selectedRevision=null;
 if(source.kind==="github"&&source.status==="ok"&&!comparable&&
    source.summary?.scope==="repository"&&isString(branchDelta?.branch)&&
    typeof branchDelta?.previousSha==="string"&&typeof branchDelta?.currentSha==="string"&&
    /^[a-f0-9]{40}$/i.test(branchDelta.previousSha)&&/^[a-f0-9]{40}$/i.test(branchDelta.currentSha)&&
    branchDelta.previousSha.toLowerCase()!==branchDelta.currentSha.toLowerCase()){
  const base=sourceWebUrl(source);
  if(base){
   const previousSha=branchDelta.previousSha.toLowerCase(),currentSha=branchDelta.currentSha.toLowerCase();
   selectedRevision={branch:branchDelta.branch,previousSha,currentSha,
    previousUrl:base+"/commit/"+previousSha,currentUrl:base+"/commit/"+currentSha};
  }
 }
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
  selectedRevision,structureDelta,
  observedCommit:supported?observedCommit(source):null,
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

const freshnessCopy=Object.freeze({
 never:"Факт ещё не записан",
 unlinked:"Факт без внешнего источника",
 missing_source:"Источник больше не подключён",
 unavailable:"Источник недоступен",
 outdated:"Сведения об источнике устарели",
 incomplete:"Недостаточно сведений о ветке",
 revision_changed:"Редакция источника изменилась",
 ref_not_found:"Ветка не найдена при полной сверке",
 current_revision:"Редакция совпадает; факт остаётся заявлением",
 source_fresh:"Источник наблюдался; результат не подтверждён"
});
// Source-status codes stay in the existing model; people see explanatory text.
export function sourceFreshnessLabel(state){
 return typeof state==="string"&&Object.hasOwn(freshnessCopy,state)
  ?freshnessCopy[state]:"Состояние источника не установлено";
}

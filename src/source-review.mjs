// Human-readable rendering model for the existing Atlas source observation.
// No additional fetching, source cache, project writes or readiness verdicts.
const asArray=value=>Array.isArray(value)?value:[];
const isString=value=>typeof value==="string"&&value.length>0;
const isSupported=kind=>kind==="github"||kind==="github_owner";
const clipSha=value=>isString(value)?value.slice(0,12):null;
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
  error:hasError?String(source.error||"Источник недоступен"):null,
  comparison:comparable?"COMPARABLE":change?.baseline?"BASELINE":"NOT_COMPARABLE",
  totals,total,rows,
  remaining:Math.max(0,total-rows.length),
  previousObservation:hasError&&!!source.summary,
  // A GitHub observation is only evidence of a source version; never a
  // declaration that requirements, tests, releases or work are accepted.
  authority:"OBSERVATION_ONLY"
 });
}

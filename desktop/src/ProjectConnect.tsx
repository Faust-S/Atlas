import React,{useEffect,useMemo,useRef,useState} from "react";
import {inspectPublicProject} from "../../src/project-onboarding.mjs";
import {repoName} from "../../src/github-public.mjs";

// One progressive surface: URL -> read-only inspection -> selection -> Atlas
// draft. This component never writes to GitHub or bypasses Atlas's native Save.
export function ProjectConnect({snapshot,onApply,onCancel,disabled=false}:{
 snapshot:any;
 onApply:(preview:any,options:{name:string;selectedRepositories:string[]})=>void;
 onCancel:()=>void;
 disabled?:boolean;
}){
 const [address,setAddress]=useState("");
 const [name,setName]=useState("");
 const [preview,setPreview]=useState<any|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [selected,setSelected]=useState<string[]>([]);
 const [filter,setFilter]=useState("");
 const [limit,setLimit]=useState(45);
 const [branchChoice,setBranchChoice]=useState("");
 const ongoing=useRef<AbortController|null>(null);
 useEffect(()=>()=>{ongoing.current?.abort()},[]);
 const connected=useMemo(()=>{
  const lookup=new Map<string,{id:string;name:string}>();
  for(const project of snapshot.projects||[])for(const source of project.sources||[]){
   if(source.kind!=="github")continue;
   try{
    const key=repoName(source.locator).toLowerCase();
    if(!lookup.has(key))lookup.set(key,{id:project.id,name:project.name});
   }catch{}
  }
  return lookup;
 },[snapshot]);
 const existing=preview?.kind==="repository"?connected.get(preview.locator.toLowerCase()):null;
 const list=useMemo(()=>{
  if(preview?.kind!=="owner")return [];
  const query=filter.trim().toLocaleLowerCase("ru-RU");
  return preview.summary.repositories.filter((row:any)=>typeof row.name==="string"&&
   (!query||row.name.toLocaleLowerCase("ru-RU").includes(query)));
 },[preview,filter]);
 const updateAddress=(value:string)=>{
  ongoing.current?.abort();setAddress(value.slice(0,250));setPreview(null);
  setError("");setSelected([]);setName("");setBranchChoice("");
 };
 const inspect=async(event:React.FormEvent|null=null,requestedBranch:string|null=null)=>{
  event?.preventDefault();
  if(disabled||loading||!address.trim())return;
  ongoing.current?.abort();
  const controller=new AbortController();ongoing.current=controller;
  const previousName=name;
  setError("");setPreview(null);setLoading(true);setSelected([]);setFilter("");setLimit(45);
  try{
   const found=await inspectPublicProject(address,globalThis.fetch,{
    signal:controller.signal,branch:requestedBranch?.trim()||null});
   if(controller.signal.aborted)return;
   setPreview(found);setName(previousName|| (found.kind==="owner"?found.locator+" · проекты":found.name));
   setBranchChoice(found.kind==="repository"?found.branch||"":"");
  }catch(e){
   if(!controller.signal.aborted)setError(String((e as Error)?.message||e));
  }finally{
   if(ongoing.current===controller){ongoing.current=null;setLoading(false);}
  }
 };
 const toggle=(locator:string)=>{
  setError("");
  setSelected(previous=>{
   if(previous.includes(locator))return previous.filter(s=>s!==locator);
   if(previous.length>=20){setError("За один раз можно включить до 20 репозиториев.");return previous}
   return [...previous,locator];
  });
 };
 const apply=()=>{
  if(!preview||disabled||loading)return;
  if(preview.kind==="repository"&&branchChoice.trim()!==(preview.branch||"")){
   setError("Изучите выбранную ветку перед подключением.");return;
  }
  if(preview.kind==="owner"&&!selected.length){
   setError("Отметьте хотя бы один репозиторий для подключения.");return;
  }
  if(!name.trim()){setError("Укажите название проекта.");return;}
  try{
   onApply(preview,{name:name.trim(),selectedRepositories:selected});
  }catch(e){setError(String((e as Error)?.message||e))}
 };
 const close=()=>{ongoing.current?.abort();onCancel()};
 const structure=preview?.kind==="repository"?preview.structure:null;
 const ci=preview?.kind==="repository"?preview.summary.ci:null;
 const ciLabel=ci?.state==="observed"?
   ci.status==="completed"?ci.conclusion==="success"?"Проверка GitHub прошла":
    ci.conclusion==="failure"?"Проверка GitHub не прошла":"Проверка завершена с другим результатом":
    "Проверка GitHub выполняется":
   ci?.state==="none"?"Запусков GitHub Actions пока нет":
   ci?.state==="unavailable"?"Результат проверки недоступен":
   "Состояние проверок не определено";
 const confirmActions=preview?<div className="button-row atlas-connect-confirm-actions">
  <button type="button" className="action-button primary" onClick={apply}
   disabled={disabled||loading||preview.kind==="owner"&&!selected.length||
    preview.kind==="repository"&&branchChoice.trim()!==(preview.branch||"")}>
   {existing?"Открыть существующий проект":
    preview.kind==="owner"?"Включить выбранные проекты":"Добавить в Atlas"}
  </button>
  <button type="button" className="action-button" onClick={()=>{setPreview(null);setError("")}}>
   Изменить источник
  </button>
 </div>:null;
 return <section className="surface atlas-project-connect" aria-label="Подключение существующего проекта">
  <div className="section-heading"><div>
   <h2>Подключить существующий проект</h2>
   <p>Укажите адрес — Atlas сначала покажет, что удалось обнаружить. Решение о включении остаётся за вами.</p>
  </div><button type="button" className="action-button" onClick={close}>Закрыть</button></div>
  <div className="atlas-connect-steps" aria-label="Этапы подключения">
   <span className={!preview?"active":""}>1. Источник</span>
   <span className={preview?"active":""}>2. Предпросмотр и выбор</span>
   <span>3. Сохранение в Atlas</span>
  </div>
  <form className="atlas-connect-form" onSubmit={event=>void inspect(event)}>
   <label>Адрес проекта или организации на GitHub
    <input type="text" value={address} autoComplete="off"
     placeholder="https://github.com/владелец/репозиторий"
     aria-label="Адрес подключаемого проекта GitHub"
     onChange={e=>updateAddress(e.target.value)} disabled={loading||disabled}/>
   </label>
   <button className="action-button primary" type="submit"
    disabled={loading||disabled||!address.trim()}>
    {loading?"Изучаем источник…":"Посмотреть структуру"}
   </button>
  </form>
  <p className="minor">Первый маршрут поддерживает публичные GitHub-репозитории и страницы их владельцев.
   Приватные источники требуют отдельного разрешённого подключения. Файлы проекта не загружаются на сторонний сервер Atlas.</p>
  {error&&<p role="alert" className="alert error">{error}</p>}
  {loading&&<p role="status" className="minor">Читаем доступные сведения GitHub, ветку и структуру проекта. Ничего не изменяем.</p>}
  {preview&&<div className="atlas-connect-preview" aria-label="Предпросмотр перед подключением">
   <div className="section-heading"><div>
    <h3>{preview.kind==="repository"?"Обнаружен репозиторий":"Обнаружен владелец GitHub"}</h3>
    <p><a href={preview.url} target="_blank" rel="noopener noreferrer">{preview.locator}</a></p>
   </div><small>Только публичные сведения · не приёмка</small></div>
   <label>Название в Atlas
    <input type="text" maxLength={160} value={name} aria-label="Название подключаемого проекта"
     onChange={e=>{setName(e.target.value);setError("")}} disabled={disabled}/>
   </label>
   {preview.kind==="repository"?<>
    <div className="atlas-connect-branch button-row">
     <label>Ветка исходников
      <input type="text" list="atlas-connect-branches" maxLength={200}
       aria-label="Ветка исходников для подключения"
       value={branchChoice} onChange={e=>{setBranchChoice(e.target.value);setError("")}}/>
      <datalist id="atlas-connect-branches">{preview.summary.branches.slice(0,100).map((value:string)=>
       <option value={value} key={value}/>)}</datalist>
     </label>
     <button className="action-button" type="button" disabled={loading||disabled||!branchChoice.trim()}
      onClick={()=>void inspect(null,branchChoice)}>Изучить выбранную ветку</button>
    </div>
    {branchChoice!==preview.branch&&<p className="minor">Выбрана другая ветка. Нажмите «Изучить выбранную ветку», чтобы обновить предпросмотр.</p>}
    <div className="summary-line">
     <span>Исходники: {preview.branch||"не определена"}</span>
     {preview.summary.defaultBranch!==preview.branch&&<span>Основная ветка: {preview.summary.defaultBranch||"не определена"}</span>}
     <span>{ciLabel}</span>
     <span>{preview.summary.complete?"Перечень веток получен":"Перечень веток неполный"}</span>
    </div>
    {existing&&<p className="minor">Уже включён в проект «{existing.name}».
     Повторного проекта не будет: откроется существующий.</p>}
    {confirmActions}
    {structure?.status==="observed"?<details className="atlas-connect-root-preview">
     <summary>Корневая структура · {structure.totalFolders} каталогов · {structure.totalFiles} файлов</summary>
     <div className="atlas-connect-root">
      <div><strong>Каталоги · {structure.totalFolders}</strong>
       {structure.folders.slice(0,16).length?<ul>{structure.folders.slice(0,16).map((folder:string)=>
        <li key={folder}><span aria-hidden="true">▣ </span>{folder}</li>)}</ul>:
        <p className="minor">Каталогов на верхнем уровне нет.</p>}</div>
      <div><strong>Файлы · {structure.totalFiles}</strong>
       {structure.files.slice(0,16).length?<ul>{structure.files.slice(0,16).map((file:string)=>
        <li key={file}><span aria-hidden="true">▤ </span>{file}</li>)}</ul>:
        <p className="minor">Файлов на верхнем уровне нет.</p>}</div>
     </div>
     {structure.detected?.length>0&&<p className="minor">Найдены файлы настройки и документации:
      {" "}{structure.detected.join(", ")}</p>}
     {(structure.truncated||structure.limited||structure.totalFolders>16||structure.totalFiles>16)&&
      <p className="minor">Показана только часть структуры. Вложенные каталоги не исследованы.</p>}
    </details>:<p className="minor">Структуру файлов не удалось получить:
     {structure?.reason||"основная ветка не определена"}.
     Репозиторий можно подключить без файлового предпросмотра.</p>}
    <p className="minor">Найденные каталоги не становятся задачами автоматически.
     План и критерии результата задаются отдельно.</p>
   </>:<>
    <p className="minor">{preview.summary.complete?
     "Доступные публичные репозитории обнаружены.":
     "Получена только часть публичных репозиториев; отсутствующие здесь могут существовать."}
     {" "}Отметьте те, с которыми собираетесь работать. Общая группа не создаёт искусственных зависимостей.</p>
    <label>Найти репозиторий
     <input type="search" placeholder="Название репозитория" value={filter}
      aria-label="Поиск репозиториев перед подключением"
      onChange={e=>{setFilter(e.target.value.slice(0,160));setLimit(45)}}/>
    </label>
    <div className="atlas-connect-selection" role="group" aria-label="Репозитории для подключения">
     {list.slice(0,limit).map((row:any)=>{
      const linked=connected.get(row.name.toLowerCase());
      return <label key={row.name} className="atlas-connect-option">
       <input type="checkbox" checked={selected.includes(row.name)}
        onChange={()=>toggle(row.name)} disabled={disabled||loading}/>
       <span><strong>{row.name}</strong><small>
        {linked?"Уже в Atlas: "+linked.name:
         (row.defaultBranch?"Основная ветка: "+row.defaultBranch:"Ветка не определена")}
        {row.archived?" · Архивный":""}</small></span>
      </label>;
     })}
     {!list.length&&<p className="minor">По запросу репозитории не найдены.</p>}
    </div>
    {list.length>limit&&<button type="button" className="action-button"
      onClick={()=>setLimit(n=>Math.min(list.length,n+45))}>Показать ещё ({list.length-limit})</button>}
    <p className="minor">Выбрано {selected.length} из {list.length} показанных по фильтру.
     За одно подключение — до 20 репозиториев.</p>
   </>}
   {preview.kind==="owner"&&confirmActions}
   <p className="minor">Добавление изменяет только локальный черновик Atlas. Запишите его кнопкой «Сохранить».
    Во внешнем GitHub никакие действия не выполняются.</p>
  </div>}
 </section>;
}

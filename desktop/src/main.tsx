import React,{useEffect,useMemo,useRef,useState} from "react";
import {createRoot} from "react-dom/client";
import {invoke,isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {empty,deserialize,serialize,editItem} from "../../src/core.mjs";
import {editorSpec,applyEditor} from "../../src/editor.mjs";
import {compareProject,decideChange} from "../../src/trace.mjs";
import {projectImpact} from "../../src/impact.mjs";
import {scheduleProject} from "../../src/planning.mjs";
import {portfolioSchedule} from "../../src/portfolio-schedule.mjs";
import {portfolioResources} from "../../src/portfolio-resources.mjs";
import {planReviewQueue,planReviewAction,planProposalAction} from "../../src/plan-review.mjs";
import {revisionReview,recheckAction} from "../../src/revision-review.mjs";
import {previewPlanAmendment,applyPlanAmendment,removePlanAmendment} from "../../src/plan-amendment.mjs";
import {planPublicRefresh,reconcilePublicSources,publicSourceQueue} from "../../src/public-refresh.mjs";
import "./style.css";

type Atlas = any;
type OpenResult = {generation:string;snapshot:Atlas;restoredFromBackup:boolean;needsConfirmation:boolean};
type CommitResult = {generation:string;revision:number;projectBlocksWritten:number};
type Field = {name:string;label:string;value?:string;required?:boolean;type:string;options?:{value:string;label:string}[]};
type Editor = {action:string;spec:{title:string;hint?:string;fields:Field[]}};
type Tab = "overview"|"work"|"board"|"timeline"|"graph"|"reality"|"changes"|"resources"|"history"|"sources";
const tabs:{key:Tab;title:string}[]=[
 {key:"overview",title:"Обзор"},{key:"work",title:"Таблица"},{key:"board",title:"Доска"},
 {key:"timeline",title:"График"},{key:"graph",title:"Зависимости"},
 {key:"reality",title:"План / факт"},{key:"changes",title:"Изменения"},
 {key:"resources",title:"Ресурсы"},{key:"history",title:"История"},{key:"sources",title:"Источники"},
];
const statuses:any={planned:"Запланирован",active:"В работе",paused:"Приостановлен",
 completed:"Завершён (заявлено)",cancelled:"Отменён"};
const workStatuses:any={todo:"Запланирована",in_progress:"В работе",blocked:"Заблокирована",done:"Выполнена (заявлено)"};
const evidence:any={unknown:"Не установлено",conflict:"Противоречия",stale:"Требует сверки",gap_reported:"Заявлено отсутствие",
 partial_reported:"Заявлено частично",implemented_claim:"Заявлена реализация",test_claim:"Заявлено тестирование",
 acceptance_claim:"Заявлена приёмка"};
const decisionStatus:any={proposed:"Предложено",approved:"Утверждено",in_progress:"В работе",
 implemented:"Реализовано (заявлено)",deferred:"Отложено",rejected:"Отклонено"};
function readable(date?:string|null){return date?date.slice(0,10):"Не задано"}
const confirmAction=(question:string)=>window.confirm(question);
// Rust serde_json normalizes object key order; compare structural content on readback.
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):
 value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const snapshotText=(v:Atlas)=>JSON.stringify(stable(v));
const deepFreezeError=(e:unknown)=>e instanceof Error?e.message:String(e);
function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:string}){
 return <span className={"status-chip "+tone}>{children}</span>;
}
function Action({children,onClick,primary=false,disabled=false,title}:{children:React.ReactNode;onClick:()=>void;primary?:boolean;disabled?:boolean;title?:string}){
 return <button type="button" disabled={disabled} title={title} className={"action-button"+(primary?" primary":"")} onClick={onClick}>{children}</button>;
}
function Metric({value,label,note}:{value:number|string;label:string;note?:string}){
 return <div className="metric"><small>{label}</small><strong>{value}</strong>{note&&<small>{note}</small>}</div>;
}
function Fallback({message}:{message:string}){return <div className="empty">{message}</div>}
function EditorPanel({editor,onSubmit,onCancel,busy}:{editor:Editor;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;onCancel:()=>void;busy:boolean}){
 const [fields,setFields]=useState<Record<string,string>>({});
 useEffect(()=>{
  setFields(Object.fromEntries(editor.spec.fields.map(f=>[f.name,String(f.value??"")])));
 },[editor.action,editor.spec]);
 return <section className="editor-panel" aria-label="Редактирование">
  <div className="section-heading"><div><small>Изменение данных</small><h2>{editor.spec.title}</h2></div>
   <button className="icon-button" onClick={onCancel} aria-label="Закрыть редактор">×</button></div>
  {editor.spec.hint&&<p className="minor">{editor.spec.hint}</p>}
  <form onSubmit={onSubmit}>
   {editor.spec.fields.map(f=><label className="field" key={f.name}>{f.label}
    {f.type==="select"?
      <select name={f.name} required={f.required!==false}
       value={fields[f.name]??""} onChange={event=>setFields({...fields,[f.name]:event.target.value})}>
       {(f.options||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      :f.type==="textarea"?
      <textarea rows={3} name={f.name} required={f.required!==false}
       value={fields[f.name]??""} onChange={event=>setFields({...fields,[f.name]:event.target.value})}/>
      :<input type={f.type||"text"} name={f.name} required={f.required!==false}
       min={f.type==="number"?(f.name==="allocationPct"||f.name==="capacityPct"?1:0):undefined}
       max={f.type==="number"?(f.name==="allocationPct"?100:f.name==="capacityPct"?1000:36500):undefined}
       step={f.type==="number"?"1":undefined}
       value={fields[f.name]??""} onChange={event=>setFields({...fields,[f.name]:event.target.value})}/>
    }
   </label>)}
   <div className="form-footer"><Action onClick={onCancel}>Отмена</Action><button className="action-button primary" disabled={busy} type="submit">Применить к черновику</button></div>
  </form>
 </section>
}
function App(){
 const [data,setData]=useState<Atlas>(()=>empty());
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [generation,setGeneration]=useState("none");
 const [active,setActive]=useState<string|null>(null),[tab,setTab]=useState<Tab>("overview");
 const [search,setSearch]=useState(""),[editor,setEditor]=useState<Editor|null>(null);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [inspector,setInspector]=useState(true),[recovery,setRecovery]=useState(false);
 const saved=useRef<string>(snapshotText(empty()));
 const [refreshReport,setRefreshReport]=useState<any>(null);
 const [forecastId,setForecastId]=useState<string|null>(null);
 const [workFilter,setWorkFilter]=useState("all");
 const [showDetails,setShowDetails]=useState(false);
 const project=data.projects.find((p:any)=>p.id===active)||null;
 const dirty=ready&&snapshotText(data)!==saved.current;
 const persisted=generation!=="none";
 const dirtyRef=useRef(false),busyRef=useRef(false);
 dirtyRef.current=dirty;busyRef.current=busy;
 const native=isTauri();
 const dates=useMemo(()=>portfolioSchedule(data),[data]);
 const resources=useMemo(()=>portfolioResources(data,{schedule:dates} as any),[data,dates]);
 const reviews=useMemo(()=>planReviewQueue(data),[data]);
 const sourceQueue=useMemo(()=>publicSourceQueue(data),[data]);
 const rechecks=useMemo(()=>revisionReview(data),[data]);
 const plan=useMemo(()=>project?scheduleProject(project):null,[project]);
 const reality=useMemo(()=>project?compareProject(project):null,[project]);
 const impact=useMemo(()=>project?projectImpact(project):null,[project]);
 const projected=active?dates.byId.get(active):null;
 const filtered=useMemo(()=>data.projects.filter((p:any)=>p.name.toLowerCase().includes(search.toLowerCase())||
  p.goal?.toLowerCase().includes(search.toLowerCase())),[data,search]);
 const mutate=(next:Atlas,notice:string)=>{setData(next);setMessage(notice);setError("");};
 const issue=(e:unknown)=>{setError(deepFreezeError(e));setMessage("");};
 useEffect(()=>{
  if(!native){setError("Нативный Atlas 0.2 запускается как установленное приложение Tauri. Для работы с данными откройте его через собственное окно Windows.");return}
  invoke<OpenResult>("atlas_open").then(result=>{
   if(result.needsConfirmation){setRecovery(true);setError("Обнаружена повреждённая текущая редакция. Предыдущая версия доступна для явного восстановления.");return}
   const snapshot=deserialize(JSON.stringify(result.snapshot));
   setData(snapshot);saved.current=snapshotText(snapshot);setGeneration(result.generation);setReady(true);
  }).catch(issue);
  let unlisten:undefined|(()=>void);
  getCurrentWindow().onCloseRequested(event=>{
   if(dirtyRef.current||busyRef.current){
    if(busyRef.current||!confirmAction("Есть несохранённые изменения. Закрыть Atlas без сохранения?"))
     event.preventDefault();
   }
  }).then(fn=>{unlisten=fn}).catch(issue);
  return ()=>{unlisten?.()};
 },[native]);
 const selectProject=(id:string|null)=>{
  setActive(id);setTab("overview");setEditor(null);setForecastId(null);setMessage("");
 };
 const openEditor=(action:string,projectId?:string)=>{
  try{
   const p=data.projects.find((x:any)=>x.id===(projectId??active))||null;
   const spec=editorSpec(p,action,data);
   setEditor({action,spec});setInspector(true);setError("");
  }catch(e){issue(e)}
 };
 const openEditorFor=(projectId:string,action:string)=>{
  try{
   const p=data.projects.find((x:any)=>x.id===projectId);
   if(!p)throw Error("Проект для решения не найден");
   setActive(projectId);setTab(action.startsWith("plan-")?"changes":"reality");
   setEditor({action,spec:editorSpec(p,action,data)});setInspector(true);setError("");
  }catch(e){issue(e)}
 };
 const submit=(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();
  if(!editor||busy)return;
  try{
   const form=new FormData(event.currentTarget);
   const formProject=editor.action.startsWith("plan-review:")?
   decodeURIComponent(editor.action.split(":")[3]||""):editor.action.startsWith("plan-proposal:")?
   decodeURIComponent(editor.action.split(":")[1]||""):active;
   const result=applyEditor(data,formProject,editor.action,form);
   mutate(result.state,"Изменение внесено в черновик. Для записи на диск нажмите «Сохранить».");
   if(result.projectId)selectProject(result.projectId);
   setEditor(null);
  }catch(e){issue(e)}
 };
 const save=async()=>{
  if(busyRef.current||!ready||!dirty)return;
  setBusy(true);
  try{
   const source=snapshotText(data);
   const committed=await invoke<CommitResult>("atlas_commit",{expectedGeneration:generation,snapshot:data});
   const readback=await invoke<OpenResult>("atlas_open");
   const checked=deserialize(JSON.stringify(readback.snapshot));
   if(readback.generation!==committed.generation||snapshotText(checked)!==source){
    throw Error("Данные записаны, но повторное чтение не совпало. Не закрывайте программу; проверьте хранилище.");
   }
   setGeneration(committed.generation);
   saved.current=source;
   setMessage("Сохранено и перечитано с диска. Новых файлов проектов: "+committed.projectBlocksWritten+".");
   setError("");
  }catch(e){issue(e)}finally{setBusy(false)}
 };
 const exportJson=async()=>{
  if(busyRef.current||!ready)return;
  if(dirty){issue(Error("Сначала сохраните изменения, затем создайте резервную копию."));return}
  setBusy(true);
  try{
   const result=await invoke<string>("atlas_export_json",{expectedGeneration:generation});
   setMessage(result);setError("");
  }catch(e){issue(e)}finally{setBusy(false)}
 };
 const importJson=async()=>{
  if(busyRef.current||!ready)return;
  if(dirty){issue(Error("Сначала сохраните изменения или отмените их перед импортом."));return}
  setBusy(true);
  try{
   const imported=await invoke<Atlas|null>("atlas_select_import");
   if(!imported)return;
   const checked=deserialize(JSON.stringify(imported));
   if(!confirmAction("Заменить текущий портфель импортированным JSON? Предыдущая сохранённая редакция останется в истории Atlas."))return;
   const next=structuredClone(checked);
   const previousRevision=next.revision;
   next.revision=Math.max(data.revision,previousRevision)+1;
   next.importProvenance={source:"atlas.project/1 JSON",originalRevision:previousRevision,
    importedAt:new Date().toISOString()};
   deserialize(JSON.stringify(next));
   mutate(next,"Архив загружен в черновик (исходная редакция "+previousRevision+"). Нажмите «Сохранить» для переноса в нативное хранилище.");
   selectProject(null);
  }catch(e){issue(e)}finally{setBusy(false)}
 };
 const restore=async()=>{
  if(!confirmAction("Восстановить предыдущую исправную редакцию? Повреждённый индекс будет сохранён в карантине."))return;
  setBusy(true);
  try{
   const result=await invoke<OpenResult>("atlas_restore_previous");
   const checked=deserialize(JSON.stringify(result.snapshot));
   saved.current=snapshotText(checked);setData(checked);setGeneration(result.generation);
   setReady(true);setRecovery(false);setMessage("Предыдущая редакция восстановлена и перечитана.");setError("");
  }catch(e){issue(e)}finally{setBusy(false)}
 };
 const syncPublic=async(source?:{projectId:string;sourceId:string})=>{
  if(busyRef.current)return;
  if(!confirmAction("Запросить публичные сведения GitHub? Наблюдение не подтверждает готовность проекта."))return;
  setBusy(true);
  try{
   const plan=planPublicRefresh(data,{maxAgeMs:0,only:source?[source]:null} as any);
   if(!plan.selected){setMessage("Нет источников для наблюдения.");return}
   const result=await reconcilePublicSources(data,{plan});
   if(result.state!==data)mutate(result.state,"Публичные наблюдения обновлены в черновике. Сохраните результат на диск.");
   setRefreshReport(result.report);
  }catch(e){issue(e)}finally{setBusy(false)}
 };
 const applyAmendment=(changeId:string)=>{
  if(!project)return;
  if(!confirmAction("Применить утверждённые корректировки плана? Действие будет записано в историю решений."))return;
  try{mutate(applyPlanAmendment(data,project.id,changeId).state,"План изменён в черновике. Сохраните новую редакцию.");setForecastId(null)}
  catch(e){issue(e)}
 };
 const removeAmendment=(changeId:string,key:string)=>{
  if(!project)return;
  try{mutate(removePlanAmendment(data,project.id,changeId,key).state,"Корректировка удалена из черновика.")}
  catch(e){issue(e)}
 };
 const quickWork=(id:string,state:string)=>{
  if(!project)return;
  try{mutate(editItem(data,project.id,id,{state}),"Состояние работы изменено в черновике.")}
  catch(e){issue(e)}
 };
 const view=(tabId:Tab)=>{
  setTab(tabId);setEditor(null);setForecastId(null);
 };
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="s"){event.preventDefault();void save()}
   if(event.key==="Escape"){setEditor(null)}
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();document.getElementById("atlas-search")?.focus()}
  };
  window.addEventListener("keydown",key);return ()=>window.removeEventListener("keydown",key);
 });
 if(!ready)return <main className="entry">
  <div className="entry-card"><span className="logo-symbol">A</span><h1>IWXA Atlas <em>0.2</em></h1>
   <p>{recovery?"Найдена предыдущая исправная версия портфеля. Восстановление выполняется только по вашему решению.":"Самостоятельное локальное приложение для Windows. Данные принадлежат пользователю."}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   {recovery&&<Action onClick={()=>void restore()} primary disabled={busy}>Восстановить сохранённую версию</Action>}
   {!native&&<p className="minor">Браузерный просмотр не подключается к локальным данным Atlas. Для разработки используется Tauri.</p>}
   {native&&!recovery&&!error&&<p className="minor">Открытие нативного хранилища…</p>}
  </div>
 </main>;
 return <div className={"app-shell"+(inspector?"":" no-inspector")}>
  <aside className="sidebar">
   <div className="brand"><span className="logo-symbol">A</span><div><strong>Atlas</strong><small>IWXA · 0.2 Desktop</small></div></div>
   <nav className="main-nav" aria-label="Основная навигация">
    <button className={!active?"nav-current":""} onClick={()=>selectProject(null)}>▦ <span>Портфель проектов</span><b>{data.projects.length}</b></button>
    <button onClick={()=>{selectProject(null);openEditor("new")}}>＋ <span>Создать проект</span></button>
   </nav>
   <div className="sidebar-label">Мои проекты</div>
   <div className="project-nav" aria-label="Проекты">
    {filtered.slice(0,120).map((p:any)=><button key={p.id} className={active===p.id?"nav-current":""}
      onClick={()=>selectProject(p.id)}><span className="project-indicator"/><span className="project-name">{p.name}</span></button>)}
    {filtered.length>120&&<small className="nav-hint">Показаны первые 120. Уточните поиск.</small>}
    {!filtered.length&&<small className="nav-hint">Проекты не найдены</small>}
   </div>
   <div className="sidebar-foot"><div className="foot-title">Локальная работа</div><p>Без Agent и сервера. Данные сохраняются по вашей команде.</p><small>Схема: atlas.project/1</small></div>
  </aside>
  <main className="workspace">
   <header className="commandbar">
    <label className="search"><span>⌕</span><input id="atlas-search" placeholder="Найти проект · Ctrl+K"
      value={search} onChange={e=>setSearch(e.target.value)}/><kbd>Ctrl K</kbd></label>
    <div className="toolbar-actions">
     <Badge tone={dirty?"warning":persisted?"good":"neutral"}>{dirty?"Не сохранено":persisted?"Сохранено":"Новый портфель"}</Badge>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy}>Сохранить</Action>
     <Action onClick={()=>void importJson()} disabled={busy}>Открыть JSON</Action>
     <Action onClick={()=>void exportJson()} disabled={busy||dirty}>Резервная копия</Action>
     <button className="icon-button inspector-button" title="Инспектор" onClick={()=>setInspector(!inspector)}>◧</button>
    </div>
   </header>
   {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Закрыть сообщение">×</button></div>}
   {message&&<div className="alert notice" role="status">{message}<button onClick={()=>setMessage("")} aria-label="Закрыть сообщение">×</button></div>}
   {!project?<>
    <div className="page-heading"><div><small>Ваше рабочее пространство</small><h1>Портфель проектов</h1>
      <p>Что должно быть, что известно и какие решения влияют на планы.</p></div>
      <Action onClick={()=>openEditor("new")} primary>＋ Новый проект</Action></div>
    <div className="metric-grid">
     <Metric value={data.projects.length} label="Проектов"/>
     <Metric value={data.projects.filter((p:any)=>p.status==="active").length} label="В работе"/>
     <Metric value={resources.totals.potentialConflicts} label="Плановые перегрузки"/>
     <Metric value={reviews.totals?.needsDecision??0} label="Решений по плану"/>
    </div>
    <section className="surface">
     <div className="section-heading"><div><h2>Проекты и последствия</h2><p>Перейдите к проекту, чтобы увидеть точные причины и объекты.</p></div>
      {data.projects.length>1&&<Action onClick={()=>openEditor("portfolio-link")}>Связать проекты</Action>}</div>
     {filtered.length?<div className="table-scroll"><table><thead><tr><th>Проект</th><th>Состояние</th><th>Требует внимания</th><th>Расчётный срок</th><th>Риск срока</th></tr></thead>
      <tbody>{filtered.slice(0,150).map((p:any)=>{
       const imp=projectImpact(p),row=dates.byId.get(p.id);
       return <tr key={p.id}><td><button className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button><small>{p.goal||"Цель не задана"}</small></td>
        <td><Badge>{statuses[p.status]||p.status}</Badge></td><td>{imp.attention} требований · {imp.sourceIssues.length} источников</td>
        <td>{readable(row?.projectedFinish)}</td><td>{row?.deadlineSlipDays==null?"Неизвестно":row.deadlineSlipDays+" дн."}</td></tr>;
      })}</tbody></table></div>:<Fallback message="Здесь появятся проекты. Создайте первый проект, определите результат и сохраните его на диск."/>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Решения после изменения фактов</h2><p>Новые факты не меняют план автоматически.</p></div></div>
     {(reviews.rows||[]).filter((r:any)=>["needs_decision","deferred","needs_proposal","source_hold"].includes(r.state)).slice(0,20).map((r:any,i:number)=>
      <div className="attention-row" key={r.projectId+"-"+i}><div><strong>{r.projectName}</strong><small>{r.targetTitle||"Пересмотр плана"} · {r.state}</small></div>
       <div className="button-row">
        {["needs_decision","deferred"].includes(r.state)&&<Action onClick={()=>openEditorFor(r.projectId,planReviewAction(r.rootProjectId,r.findingId,r.projectId,r.revision))}>Рассмотреть план</Action>}
        {r.state==="needs_proposal"&&r.decision&&<Action onClick={()=>openEditorFor(r.projectId,planProposalAction(r.projectId,r.decision.id))}>Предложить изменение</Action>}
        <Action onClick={()=>selectProject(r.projectId)}>Открыть</Action>
       </div></div>)}
     {reviews.totals?.needsDecision===0&&<p className="minor">Сейчас нет отмеченных новых решений. Это не подтверждение завершения проектов.</p>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Плановые ресурсы</h2><p>Ресурсы объединяются только по явному назначению, не по имени человека.</p></div>
      <Action onClick={()=>openEditor("resource-new")}>＋ Плановый ресурс</Action></div>
     {resources.people.length?<div className="table-scroll"><table><thead><tr><th>Ресурс</th><th>Мощность</th><th>Максимум</th><th>Выше мощности</th><th>Вне доступности</th><th></th></tr></thead><tbody>
      {resources.people.slice(0,40).map((r:any)=><tr key={r.id}><td>{r.label}</td><td>{r.capacityPct}%</td><td>{r.maxLoadPct}%</td>
       <td>{r.overloadDays} дн.</td><td>{r.unavailableDays} дн.</td><td><Action onClick={()=>openEditor("resource-edit:"+r.id)}>Настроить</Action></td></tr>)}</tbody></table></div>:
      <Fallback message="Плановые ресурсы пока не добавлены. Назначения ответственных в текстовых полях не считаются подтверждёнными ресурсами."/>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Публичные источники</h2><p>Read-only наблюдения GitHub, без доступа к приватным репозиториям.</p></div>
      <Action onClick={()=>void syncPublic()} disabled={busy||!sourceQueue.bindings}>Сверить источники</Action></div>
     {refreshReport&&<p className="minor">Последняя попытка: {refreshReport.updated} обновлено · {refreshReport.failed} ошибок · {refreshReport.remaining} отложено.</p>}
     <div className="summary-line"><span>Всего привязок: {sourceQueue.bindings}</span><span>Требуют проверки: {sourceQueue.pending}</span><span>Ошибки: {sourceQueue.errors}</span></div>
     {sourceQueue.rows.slice(0,15).map((r:any,i:number)=><div key={i} className="attention-row"><div><strong>{r.locator}</strong><small>{r.error?"Ошибка":r.stale?"Требует обновления":"Наблюдался"} · {r.count} привязок</small></div>
      <Action onClick={()=>selectProject(r.projectId)}>Открыть</Action></div>)}
    </section>
    <section className="surface">
     <button className="text-link" onClick={()=>setShowDetails(!showDetails)}>{showDetails?"Скрыть":"Показать"} межпроектные зависимости</button>
     {showDetails&&<div className="table-scroll"><table><thead><tr><th>От проекта</th><th>К проекту</th><th>Условие</th></tr></thead><tbody>
      {(data.portfolioLinks||[]).map((l:any)=><tr key={l.id}><td>{data.projects.find((p:any)=>p.id===l.from)?.name}</td>
       <td>{data.projects.find((p:any)=>p.id===l.to)?.name}</td><td>{l.note||"Зависимость"}</td></tr>)}</tbody></table></div>}
    </section>
   </>:<>
    <div className="page-heading"><div><small><button className="breadcrumb" onClick={()=>selectProject(null)}>Портфель</button> / {project.type}</small>
     <h1>{project.name}</h1><p>{project.goal||"Цель пока не определена"}</p></div>
     <div className="button-row"><Badge>{statuses[project.status]||project.status}</Badge><Action onClick={()=>openEditor("status")}>Изменить статус</Action></div>
    </div>
    <nav className="tabbar" aria-label="Представления проекта">{tabs.map(t=><button key={t.key} className={tab===t.key?"selected":""} onClick={()=>view(t.key)}>{t.title}</button>)}</nav>
    {tab==="overview"&&<>
     <div className="metric-grid"><Metric value={project.targets?.length||0} label="Ожидаемых результатов"/><Metric value={impact?.attention??0} label="Требуют внимания"/>
      <Metric value={project.items.length} label="Работ"/><Metric value={projected?.deadlineSlipDays??"?"} label="Дней риска срока"/></div>
     <section className="surface"><div className="section-heading"><div><h2>Цель, план и факты</h2>
      <p>План и наблюдения разделены. Ни один источник не подтверждает приёмку автоматически.</p></div>
      <Action onClick={()=>openEditor("target")} primary>Добавить требование</Action></div>
      {(reality?.rows||[]).slice(0,15).map((r:any)=><div key={r.id} className="attention-row"><div><strong>{r.title}</strong><small>{r.desired}</small></div>
       <Badge tone={r.assessment==="unknown"||r.assessment==="stale"?"warning":"neutral"}>{evidence[r.assessment]||r.assessment}</Badge></div>)}
      {!project.targets?.length&&<Fallback message="Сформулируйте ожидаемый результат. После этого его можно связать с работами и доказательствами."/>}
     </section>
     <section className="surface"><div className="section-heading"><div><h2>Сроки и зависимости</h2>
      <p>CPM по календарным дням, без автоматического распределения ресурсов.</p></div>
      <Action onClick={()=>openEditor("dates")}>Изменить даты</Action></div>
      <div className="summary-line"><span>Начало: {readable(project.startDate)}</span><span>Контрольный срок: {readable(project.dueDate)}</span>
       <span>Прогноз финиша: {readable(projected?.projectedFinish)}</span><span>Критический путь: {plan?.durationDays??0} дн.</span></div>
     </section>
     <section className="surface"><div className="section-heading"><div><h2>Риски и решения</h2></div></div>
      <div className="button-row"><Action onClick={()=>openEditor("risk")}>＋ Риск</Action><Action onClick={()=>openEditor("decision")}>＋ Решение</Action>
       <Action onClick={()=>view("changes")}>Предложения изменений</Action></div>
      <div className="summary-line"><span>Рисков: {project.risks.length}</span><span>Решений: {project.decisions.length}</span><span>Предложений: {project.changes?.length||0}</span></div>
     </section>
    </>}
    {tab==="work"&&<section className="surface">
     <div className="section-heading"><div><h2>Работы проекта</h2><p>Изменения отражаются в доске, графике и зависимостях.</p></div>
      <div className="button-row"><Action onClick={()=>openEditor("item")} primary>＋ Работа</Action><Action onClick={()=>openEditor("dep")}>Связь работ</Action></div></div>
     <div className="filter-row"><label>Состояние <select value={workFilter} onChange={e=>setWorkFilter(e.target.value)}>
      <option value="all">Все</option>{Object.entries(workStatuses).map(([v,k])=><option value={v} key={v}>{String(k)}</option>)}</select></label></div>
     <div className="table-scroll"><table><thead><tr><th>Работа</th><th>Состояние</th><th>Длительность</th><th>Ответственный</th><th>Срок</th><th>Изменить</th></tr></thead>
      <tbody>{project.items.filter((w:any)=>workFilter==="all"||w.state===workFilter).slice(0,200).map((w:any)=><tr key={w.id}>
       <td><strong>{w.title}</strong><small>{project.stages.find((s:any)=>s.id===w.stageId)?.name||"Без этапа"}</small></td>
       <td><Badge>{workStatuses[w.state]}</Badge></td><td>{w.estimateDays??1} дн.</td><td>{w.assignee||"Не назначен"}</td><td>{readable(w.dueDate)}</td>
       <td><Action onClick={()=>openEditor("work:"+w.id)}>Открыть</Action></td></tr>)}</tbody></table></div>
     {project.items.length>200&&<p className="minor">Первые 200 работ. Уточните состояние или используйте график.</p>}
     {!project.items.length&&<Fallback message="Пока нет работ. Добавьте первую работу и сохраните проект."/>}
    </section>}
    {tab==="board"&&<div className="board">
     {Object.entries(workStatuses).map(([key,title])=><section className="board-column" key={key}><h3>{String(title)} <small>{project.items.filter((w:any)=>w.state===key).length}</small></h3>
      {project.items.filter((w:any)=>w.state===key).slice(0,60).map((w:any)=><div className="board-card" key={w.id}><strong>{w.title}</strong><small>{w.assignee||"Нет ответственного"} · {w.estimateDays??1} дн.</small>
       <div className="board-actions"><select aria-label={"Состояние "+w.title} value={w.state} onChange={e=>quickWork(w.id,e.target.value)}>
        {Object.entries(workStatuses).map(([v,title])=><option key={v} value={v}>{String(title)}</option>)}</select>
        <button onClick={()=>openEditor("work:"+w.id)}>Детали</button></div></div>)}
      </section>)}
    </div>}
    {tab==="timeline"&&<section className="surface"><div className="section-heading"><div><h2>План-график CPM</h2><p>Оценка по календарным дням. Красные отрезки образуют критический путь.</p></div>
     <Action onClick={()=>openEditor("dates")}>Плановые даты</Action></div>
     <div className="timeline">{(plan?.rows||[]).slice(0,150).map((r:any)=>{
      const range=Math.max(1,plan?.durationDays||1);
      return <div className="timeline-line" key={r.id}><button onClick={()=>openEditor("work:"+r.id)} title={r.title}>{r.title}</button>
       <div className="timeline-track" title={"Начало: "+r.earlyStart+" дн.; длительность: "+r.durationDays+" дн."}>
        <span className={r.critical?"timeline-bar critical":"timeline-bar"} style={{left:(r.earlyStart/range*100)+"%",
          width:Math.max(.5,r.durationDays/range*100)+"%"}}/></div><small>{r.durationDays} дн.</small></div>
     })}</div>
     {!plan?.rows.length&&<Fallback message="График появится после добавления работ."/>}
     <p className="minor">Базовый план не переписывается прогнозом. Для сценарного изменения используйте «Изменения».</p>
    </section>}
    {tab==="graph"&&<section className="surface"><div className="section-heading"><div><h2>Зависимости работ</h2><p>Ориентированный граф на основе существующей модели; кликом открывается точная работа.</p></div>
     <Action onClick={()=>openEditor("dep")}>＋ Зависимость</Action></div>
     {project.items.length>80?<Fallback message="Для крупного проекта используйте таблицу зависимостей: полный граф ограничен 80 работами, чтобы сохранить отзывчивость."/>:
      <div className="graph-list">{(plan?.rows||[]).map((w:any)=><div className="graph-node" key={w.id}>
       <button onClick={()=>openEditor("work:"+w.id)}>{w.title}</button><Badge tone={w.critical?"warning":"neutral"}>{w.critical?"Критический":"Резерв "+w.floatDays+" дн."}</Badge>
       <small>Зависит от: {w.predecessors.map((id:string)=>project.items.find((t:any)=>t.id===id)?.title||id).join(", ")||"нет"}</small></div>)}</div>}
     <div className="table-scroll"><table><thead><tr><th>Предшествующая</th><th>Зависимая</th></tr></thead><tbody>
      {project.dependencies.map((d:any,i:number)=><tr key={i}><td>{project.items.find((w:any)=>w.id===d.from)?.title}</td>
       <td>{project.items.find((w:any)=>w.id===d.to)?.title}</td></tr>)}</tbody></table></div>
    </section>}
    {tab==="reality"&&<section className="surface"><div className="section-heading"><div><h2>Матрица «должно быть / известно»</h2>
     <p>Показывает заявления, происхождение, свежесть, но не выдумывает процент подтверждённой готовности.</p></div>
     <div className="button-row"><Action onClick={()=>openEditor("target")}>＋ Требование</Action><Action onClick={()=>openEditor("finding")} disabled={!project.targets?.length}>＋ Наблюдение</Action></div></div>
     <div className="table-scroll"><table><thead><tr><th>Ожидаемый результат</th><th>Фактическое заявление</th><th>Свежесть</th><th>Редакция источника</th><th></th></tr></thead>
      <tbody>{(reality?.rows||[]).map((r:any)=><tr key={r.id}><td><strong>{r.title}</strong><small>{r.desired}</small></td>
       <td><Badge tone={["unknown","stale","conflict"].includes(r.assessment)?"warning":"neutral"}>{evidence[r.assessment]||r.assessment}</Badge></td>
       <td>{r.freshness?.state||"Неизвестно"}</td><td className="mono">{r.latest?.revision?.slice(0,12)||"—"}</td>
       <td><Action onClick={()=>openEditor("finding-target:"+r.id)}>Новый факт</Action></td></tr>)}</tbody></table></div>
     <div className="section-heading"><h3>Факты на изменившихся исходных ревизиях</h3></div>
     {rechecks.rows.filter((r:any)=>r.projectId===project.id).slice(0,25).map((r:any)=>
      <div className="attention-row" key={r.id}><div><strong>{r.targetTitle}</strong>
       <small>{r.locator} / {r.ref} · {r.claimedSha?.slice(0,12)} → {r.observedSha?.slice(0,12)||"неизвестно"}</small></div>
       {r.canRecheck?<Action onClick={()=>openEditor(recheckAction(project.id,r.claimId,r.observedSha))}>Повторно проверить</Action>:
        <Badge tone="warning">Обновите источник</Badge>}</div>)}
     </section>}
    {tab==="changes"&&<section className="surface"><div className="section-heading"><div><h2>Предложения и утверждённые изменения</h2>
     <p>Утверждение - отдельное решение человека. Применение конкретного плана также требует подтверждения.</p></div>
     <Action onClick={()=>openEditor("proposal")} primary>＋ Предложение</Action></div>
     {(project.changes||[]).slice().reverse().map((c:any)=><div className="change-card" key={c.id}>
      <div className="section-heading"><div><h3>{c.title}</h3><p>{c.description}</p></div><Badge>{decisionStatus[c.status]||c.status}</Badge></div>
      <div className="button-row">
       {["proposed","deferred","approved","in_progress"].includes(c.status)&&<Action onClick={()=>openEditor("change:"+c.id)}>Решение</Action>}
       {["proposed","deferred"].includes(c.status)&&<>
        <Action onClick={()=>openEditor("amend-dates:"+c.id)}>Даты</Action>
        {project.items.length>0&&<Action onClick={()=>openEditor("amend-work:"+c.id)}>Изменить работу</Action>}
        <Action onClick={()=>openEditor("amend-new:"+c.id)}>Добавить работу</Action></>}
       {["approved","in_progress"].includes(c.status)&&<Action onClick={()=>openEditor("work-change:"+c.id)}>Связанная работа</Action>}
       {!!c.planAmendments?.length&&!c.planAppliedAt&&<Action onClick={()=>setForecastId(forecastId===c.id?null:c.id)}>Сценарий до / после</Action>}
      </div>
      {!!c.planAmendments?.length&&<div className="minor">Корректировок: {c.planAmendments.length} · {c.planAppliedAt?"Применено "+c.planAppliedAt:"Пока не применено"}</div>}
      {forecastId===c.id&&<AmendmentForecast state={data} projectId={project.id} changeId={c.id} onApply={()=>applyAmendment(c.id)}
       canApply={["approved","in_progress"].includes(c.status)} onError={issue}/>}
     </div>)}
     {!(project.changes||[]).length&&<Fallback message="Предложений пока нет. Вы можете создать изменение, затем подготовить сценарий и принять решение."/>}
    </section>}
    {tab==="resources"&&<section className="surface"><div className="section-heading"><div><h2>Ресурсы проекта</h2><p>Явно назначенные плановые ресурсы не равны учётным записям сотрудников.</p></div>
     <Action onClick={()=>openEditor("resource-new")}>＋ Ресурс</Action></div>
     <div className="table-scroll"><table><thead><tr><th>Работа</th><th>Назначение</th><th>Доля</th><th>Начало</th><th>Завершение</th><th>Ограничение</th></tr></thead><tbody>
      {resources.work.filter((r:any)=>r.projectId===project.id).map((r:any)=>{
       const usage=resources.byId.get(r.resourceId);
       return <tr key={r.id}><td><button className="text-link" onClick={()=>openEditor("work:"+r.id)}>{r.title}</button></td>
        <td>{usage?.label||"Не привязан"}</td><td>{r.allocationPct}%</td><td>{readable(r.startDate)}</td><td>{readable(r.finishDate)}</td>
        <td>{!usage?"Требует назначения":usage.overloadDays?"Превышение мощности: "+usage.overloadDays+" дн.":"Не подтверждена фактическая доступность"}</td></tr>})}</tbody></table></div>
    </section>}
    {tab==="history"&&<section className="surface"><div className="section-heading"><div><h2>История решений и фактов</h2><p>История проекта не равна независимой приёмке результата.</p></div>
     <Action onClick={()=>openEditor("decision")}>＋ Решение</Action></div>
     {[...project.decisions.map((d:any)=>({...d,_kind:"Решение",_date:d.at})),
       ...(project.findings||[]).map((f:any)=>({...f,_kind:"Заявление",_date:f.observedAt,text:f.note||f.result}))]
      .sort((a:any,b:any)=>Date.parse(b._date||"")-Date.parse(a._date||"")).slice(0,120).map((d:any,i:number)=>
       <div className="history-entry" key={d.id||i}><small>{readable(d._date)} · {d._kind}</small><p>{d.text}</p>
        {d.reviewRevision&&<small className="mono">SHA: {d.reviewRevision}</small>}</div>)}
    </section>}
    {tab==="sources"&&<section className="surface"><div className="section-heading"><div><h2>Связанные источники</h2>
     <p>Только публичные сведения GitHub доступны напрямую. Иные источники остаются ссылками до подключения разрешённого адаптера.</p></div>
     <Action onClick={()=>openEditor("source")} primary>＋ Источник</Action></div>
     {(project.sources||[]).map((s:any)=><div className="attention-row" key={s.id}><div><strong>{s.kind}: {s.locator}</strong>
      <small>{s.status==="ok"?"Наблюдался":"Не подтверждён"} · {s.observedAt||"Дата неизвестна"} · {s.error||""}</small></div>
      {["github","github_owner"].includes(s.kind)&&<Action onClick={()=>void syncPublic({projectId:project.id,sourceId:s.id})} disabled={busy}>Сверить</Action>}</div>)}
     {!project.sources.length&&<Fallback message="Источников нет. Добавьте публичный репозиторий или ссылку на внешний источник."/>}
    </section>}
   </>}
   <footer className="workspace-footer"><span>IWXA Atlas 0.2 · локальный черновик → нативная запись → readback</span>
    <span>Готовность определяется доказательствами и решениями, не количеством коммитов.</span></footer>
  </main>
  {inspector&&<aside className="inspector">
   {editor?<EditorPanel key={editor.action} editor={editor} onSubmit={submit} onCancel={()=>setEditor(null)} busy={busy}/>:
   <section><div className="section-heading"><h2>Инспектор</h2><button className="icon-button" aria-label="Скрыть инспектор" onClick={()=>setInspector(false)}>×</button></div>
    <div className="inspector-block"><small>Текущий контекст</small><strong>{project?.name||"Портфель проектов"}</strong>
     <p>{project?.goal||"Выберите проект для работы с планом, доказательствами и изменениями."}</p></div>
    <div className="inspector-block"><small>Состояние данных</small><Badge tone={dirty?"warning":persisted?"good":"neutral"}>{dirty?"Только в памяти":persisted?"Сохранено на диск":"Ещё не сохранялся"}</Badge>
     <p>Редакция: {data.revision}</p><p>Хранилище: нативное Atlas</p>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy}>Сохранить редакцию</Action></div>
    {project&&<div className="inspector-block"><small>План проекта</small><p>Начало: {readable(project.startDate)}</p>
     <p>Контрольный срок: {readable(project.dueDate)}</p>
     <p>Расчётный финиш: {readable(projected?.projectedFinish)}</p>
     <Action onClick={()=>openEditor("dates")}>Изменить даты</Action></div>}
    <div className="inspector-block"><small>Дополнительные сведения</small>
     <p>Источник и результат не получают статус «подтверждено» только из-за успешной сборки или заявления исполнителя.</p></div>
   </section>}
  </aside>}
 </div>;
}
function AmendmentForecast({state,projectId,changeId,onApply,canApply,onError}:{
 state:Atlas;projectId:string;changeId:string;onApply:()=>void;canApply:boolean;onError:(e:unknown)=>void
}){
 let result:any;
 try{result=previewPlanAmendment(state,projectId,changeId)}catch(e){
  return <p className="error" role="alert">Сценарий не может быть применён: {deepFreezeError(e)}</p>
 }
 return <div className="forecast">
  <h4>Последствия относительно текущего плана</h4>
  <p className="minor">Это предварительная оценка, не разрешение на изменение. Проектов по цепочке: {result.affected}.</p>
  <div className="table-scroll"><table><thead><tr><th>Проект</th><th>Финиш до</th><th>Финиш после</th><th>Риск срока до/после</th></tr></thead>
   <tbody>{result.rows.slice(0,40).map((r:any)=><tr key={r.id}><td>{r.name}</td>
    <td>{readable(r.beforeFinish)}</td><td>{readable(r.afterFinish)}</td>
    <td>{r.beforeSlip??"?"} / {r.afterSlip??"?"}</td></tr>)}</tbody></table></div>
  {result.resourceRows.length>0&&<div className="table-scroll"><h4>Последствия для ресурсов</h4>
   <table><thead><tr><th>Ресурс</th><th>Максимум до / после</th><th>Дни перегрузки</th></tr></thead><tbody>
    {result.resourceRows.slice(0,30).map((r:any)=><tr key={r.id}><td>{r.label}</td><td>{r.beforeMaxLoad}% / {r.afterMaxLoad}%</td>
     <td>{r.beforeOverload} / {r.afterOverload}</td></tr>)}</tbody></table></div>}
  {canApply&&<Action onClick={onApply} primary>Применить утверждённый план</Action>}
 </div>;
}
createRoot(document.getElementById("root")!).render(<App/>);

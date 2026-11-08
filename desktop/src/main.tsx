import React,{useEffect,useMemo,useRef,useState} from "react";
import {invoke as nativeInvoke,isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {empty,deserialize,serialize,editItem,removeStage,removeItem,disconnect,removeProject as dropProject} from "../../src/core.mjs";
import {removePortfolioLink} from "../../src/portfolio.mjs";
import {editorSpec,applyEditor,editorSelectionFields} from "../../src/editor.mjs";
import {compareProject,decideChange} from "../../src/trace.mjs";
import {projectImpact} from "../../src/impact.mjs";
import {scheduleProject} from "../../src/planning.mjs";
import {portfolioSchedule,projectedFinishLabel} from "../../src/portfolio-schedule.mjs";
import {portfolioResources} from "../../src/portfolio-resources.mjs";
import {planReviewQueue,planReviewAction,planProposalAction} from "../../src/plan-review.mjs";
import {revisionReview,recheckAction} from "../../src/revision-review.mjs";
import {previewPlanAmendment,applyPlanAmendment,removePlanAmendment} from "../../src/plan-amendment.mjs";
import {planPublicRefresh,reconcilePublicSources,publicSourceQueue} from "../../src/public-refresh.mjs";
import {sourceReview} from "../../src/source-review.mjs";
import {ProjectGantt,ProjectDependencyDiagram} from "./ProjectVisuals";
import {prepareImportedSnapshot} from "./import-snapshot.mjs";
import {commitWithReadback,readSavedSnapshotForReference} from "./native-save.mjs";
import {projectHistoryRows} from "./history-view.mjs";
import {sortWorkRows} from "./work-sorting.mjs";
import {createAtlasSavedRef} from "../../src/project-host-port.mjs";
import {invokeAtlasHost,type AtlasEmbeddedHost} from "./embedded-host";

type Atlas = any;
type HistoryEntry = {generation:string;revision:number;projects:number};
type ImportPreview = {snapshot:Atlas;originalRevision:number;expectedGeneration:string;startedWith:Atlas;summary:any};
type OpenResult = {generation:string;snapshot:Atlas;restoredFromBackup:boolean;needsConfirmation:boolean};
type Field = {name:string;label:string;value?:string;required?:boolean;type:string;options?:{value:string;label:string}[]};
type Editor = {action:string;spec:{title:string;hint?:string;fields:Field[]}};
type SavedRefPreview = {label:string;json:string;revision:string;generation:string};
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
const planReviewStatus:Record<string,string>={
 needs_decision:"Ожидает решения",deferred:"Решение отложено",
 needs_proposal:"Нужно новое предложение",source_hold:"Обновить Git-источник",
 proposal_open:"Предложение на рассмотрении",plan_pending:"План утверждён, требуется применение"
};
function readable(date?:string|null){return date?date.slice(0,10):"Не задано"}
const confirmAction=(question:string)=>window.confirm(question);
// Rust serde_json normalizes object key order; compare structural content on readback.
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):
 value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const snapshotText=(v:Atlas)=>JSON.stringify(stable(v));
const deepFreezeError=(e:unknown)=>e instanceof Error?e.message:String(e);
class AtlasRenderBoundary extends React.Component<{children:React.ReactNode;logoUrl?:string},{failure:string|null}>{
 state:{failure:string|null}={failure:null};
 static getDerivedStateFromError(error:unknown){
  return {failure:error instanceof Error?error.message:String(error)};
 }
 componentDidCatch(error:unknown){
  console.error("Atlas desktop renderer failed:",error);
 }
 render(){
  if(this.state.failure){
   return <main className="entry"><div className="entry-card">
    <img className="logo-symbol" src={this.props.logoUrl??"/atlas-mark.svg"} alt="" aria-hidden="true" /><h1>Atlas: ошибка интерфейса</h1>
    <p role="alert" className="error">Ошибка при отображении: {this.state.failure}</p>
    <p>Сохранённые данные не изменены. Закройте и повторно откройте программу; при повторении ошибки сохраните это сообщение для диагностики.</p>
   </div></main>;
  }
  return this.props.children;
 }
}
function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:string}){
 return <span className={"status-chip "+tone}>{children}</span>;
}
function Action({children,onClick,primary=false,disabled=false,title,autoFocus=false}:{children:React.ReactNode;onClick:()=>void;primary?:boolean;disabled?:boolean;title?:string;autoFocus?:boolean}){
 return <button type="button" disabled={disabled} title={title} autoFocus={autoFocus} className={"action-button"+(primary?" primary":"")} onClick={onClick}>{children}</button>;
}
function Metric({value,label,note}:{value:number|string;label:string;note?:string}){
 return <div className="metric"><small>{label}</small><strong>{value}</strong>{note&&<small>{note}</small>}</div>;
}
function Fallback({message}:{message:string}){return <div className="empty">{message}</div>}
function EditorPanel({editor,onSubmit,onCancel,onDirtyChange,busy}:{
 editor:Editor;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;
 onCancel:()=>void;onDirtyChange:(changed:boolean)=>void;busy:boolean
}){
 const [fields,setFields]=useState<Record<string,string>>({});
 useEffect(()=>{
  setFields(Object.fromEntries(editor.spec.fields.map(f=>[f.name,String(f.value??"")])));
  onDirtyChange(false);
 },[editor.action,editor.spec]);
 const updateFields=(next:Record<string,string>)=>{
  onDirtyChange(editor.spec.fields.some(f=>String(f.value??"")!==(next[f.name]??"")));
  setFields(next);
 };
 return <section className="editor-panel" aria-label="Редактирование">
  <div className="section-heading"><div><small>Изменение данных</small><h2>{editor.spec.title}</h2></div>
   <button className="icon-button" onClick={onCancel} aria-label="Закрыть редактор">×</button></div>
  {editor.spec.hint&&<p className="minor">{editor.spec.hint}</p>}
  <form onSubmit={onSubmit} onKeyDown={event=>{
   if((event.ctrlKey||event.metaKey)&&event.key==="Enter"){
    event.preventDefault();
    event.currentTarget.requestSubmit();
   }
  }}>
   {editor.spec.fields.map((f,index)=><label className="field" key={f.name}>{f.label}
    {f.type==="select"?
      <select name={f.name} aria-label={f.label} autoFocus={index===0} required={f.required!==false}
       value={fields[f.name]??""}
        onChange={event=>updateFields(editorSelectionFields(editor.spec,fields,f.name,event.target.value))}>
       {(f.options||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      :f.type==="textarea"?
      <textarea rows={3} name={f.name} aria-label={f.label} autoFocus={index===0} required={f.required!==false}
       value={fields[f.name]??""} onChange={event=>updateFields({...fields,[f.name]:event.target.value})}/>
      :<input type={f.type||"text"} name={f.name} aria-label={f.label} autoFocus={index===0} required={f.required!==false}
       min={f.type==="number"?(f.name==="allocationPct"||f.name==="capacityPct"?1:0):undefined}
       max={f.type==="number"?(f.name==="allocationPct"?100:f.name==="capacityPct"?1000:36500):undefined}
       step={f.type==="number"?"1":undefined}
       value={fields[f.name]??""} onChange={event=>updateFields({...fields,[f.name]:event.target.value})}/>
    }
   </label>)}
   <div className="form-footer"><Action onClick={onCancel}>Отмена</Action><button className="action-button primary" disabled={busy} type="submit" title="Ctrl+Enter">Применить к черновику</button></div>
  </form>
 </section>
}
export function AtlasWorkspace({host}:{host?:AtlasEmbeddedHost}){
 const invoke=<T,>(command:string,args?:Record<string,unknown>):Promise<T>=>host
  ? invokeAtlasHost<T>(host,command,args)
  : nativeInvoke<T>(command,args);
 const embedded=Boolean(host);
 const rootRef=useRef<HTMLDivElement|null>(null);
 const logoUrl=host?.assetUrl??"/atlas-mark.svg";
 const [data,setData]=useState<Atlas>(()=>empty());
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [generation,setGeneration]=useState("none");
 const [active,setActive]=useState<string|null>(null),[tab,setTab]=useState<Tab>("overview");
 const [search,setSearch]=useState(""),[editor,setEditor]=useState<Editor|null>(null);
 const [portfolioStatus,setPortfolioStatus]=useState("all");
 const [boardLimits,setBoardLimits]=useState<Record<string,number>>({});
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [inspector,setInspector]=useState(()=>!host&&window.innerWidth>1220),[recovery,setRecovery]=useState(false);
 const [closeGuard,setCloseGuard]=useState(false);
 const allowCloseRef=useRef(false);
 const saved=useRef<string>(snapshotText(empty()));
 const latestSnapshot=useRef<Atlas>(data);latestSnapshot.current=data;
 const [refreshReport,setRefreshReport]=useState<any>(null);
 const [forecastId,setForecastId]=useState<string|null>(null);
 const [workFilter,setWorkFilter]=useState("all"),[workQuery,setWorkQuery]=useState("");
 const [workSort,setWorkSort]=useState("title");
 const [portfolioLimit,setPortfolioLimit]=useState(150);
 const [sidebarLimit,setSidebarLimit]=useState(120);
 const [workLimit,setWorkLimit]=useState(200);
 const [showDetails,setShowDetails]=useState(false);
 const [historyQuery,setHistoryQuery]=useState("");
 const [historyType,setHistoryType]=useState("all");
 const [historyLimit,setHistoryLimit]=useState(120);
 const [savedVersions,setSavedVersions]=useState<HistoryEntry[]|null>(null);
 const [nativeHistoryLimit,setNativeHistoryLimit]=useState(40);
 const [selectedHistory,setSelectedHistory]=useState<HistoryEntry|null>(null);
 const [pendingImport,setPendingImport]=useState<ImportPreview|null>(null);
 const [savedRefPreview,setSavedRefPreview]=useState<SavedRefPreview|null>(null);
 const savedRefOpenRef=useRef(false);savedRefOpenRef.current=savedRefPreview!==null;
 const savedVersionsOpenRef=useRef(false);savedVersionsOpenRef.current=savedVersions!==null;
 const pendingImportOpenRef=useRef(false);pendingImportOpenRef.current=pendingImport!==null;
 const [resourceLimit,setResourceLimit]=useState(40);
 const [reviewLimit,setReviewLimit]=useState(20);
 const [sourceLimit,setSourceLimit]=useState(15);
 const [sourceRowLimits,setSourceRowLimits]=useState<Record<string,number>>({});
 const [recheckLimit,setRecheckLimit]=useState(25);
 const project=data.projects.find((p:any)=>p.id===active)||null;
 // Canonical snapshot text is expensive for large portfolios: compute only
 // when domain data change, not for typing, scrolling, or tab switches.
 const dataSignature=useMemo(()=>snapshotText(data),[data]);
 const dirty=ready&&dataSignature!==saved.current;
 const persisted=generation!=="none";
 const dirtyRef=useRef(false),busyRef=useRef(false),editorOpenRef=useRef(false);
 const editorDirtyRef=useRef(false);
 dirtyRef.current=dirty;busyRef.current=busy;editorOpenRef.current=!!editor;
 // The host can prevent U04 detachment while the Atlas draft is unsaved.
 useEffect(()=>{
  host?.onStateChange?.({ready,dirty,formOpen:!!editor,busy,revision:String(data.revision),generation});
 },[host,ready,dirty,editor,busy,data.revision,generation]);
 const native=embedded||isTauri();
 const dates=useMemo(()=>portfolioSchedule(data),[data]);
 const resources=useMemo(()=>portfolioResources(data,{schedule:dates} as any),[data,dates]);
 const reviews=useMemo(()=>planReviewQueue(data),[data]);
 const sourceQueue=useMemo(()=>publicSourceQueue(data),[data]);
 const rechecks=useMemo(()=>revisionReview(data),[data]);
 // The full review queue remains available in large portfolios. Rendering
 // is paged; records never disappear silently after an arbitrary first page.
 const reviewRows=useMemo(()=>reviews.rows.filter((r:any)=>
  ["needs_decision","deferred","needs_proposal","source_hold","proposal_open","plan_pending"].includes(r.state)),[reviews]);
 const recheckRows=useMemo(()=>active?rechecks.rows.filter((r:any)=>r.projectId===active):[],[rechecks,active]);
 const history=useMemo(()=>project?projectHistoryRows(project,{kind:historyType,query:historyQuery}):[],
  [project,historyType,historyQuery]);
 const plan=useMemo(()=>project?scheduleProject(project):null,[project]);
 const reality=useMemo(()=>project?compareProject(project):null,[project]);
 const impact=useMemo(()=>project?projectImpact(project):null,[project]);
 const projected=active?dates.byId.get(active):null;
 const filtered=useMemo(()=>data.projects.filter((p:any)=>
  (portfolioStatus==="all"||portfolioStatus==="active"&&["active","planned","paused"].includes(p.status)||
   portfolioStatus==="finished"&&["completed","cancelled"].includes(p.status))&&
  (p.name.toLowerCase().includes(search.toLowerCase())||p.goal?.toLowerCase().includes(search.toLowerCase()))),
  [data,search,portfolioStatus]);
 const filteredWork=useMemo(()=>{
  if(!project)return [];
  const query=workQuery.trim().toLocaleLowerCase("ru-RU");
  return sortWorkRows(project.items.filter((item:any)=>
   (workFilter==="all"||item.state===workFilter)&&
   (!query||item.title.toLocaleLowerCase("ru-RU").includes(query)||
    String(item.assignee||"").toLocaleLowerCase("ru-RU").includes(query))),workSort);
 },[project,workFilter,workQuery,workSort]);
 const mutate=(next:Atlas,notice:string)=>{setSavedRefPreview(null);latestSnapshot.current=next;setData(next);setMessage(notice);setError("");};
 const issue=(e:unknown)=>{setError(deepFreezeError(e));setMessage("");};
 const showSavedReference=async(projectId:string,workId?:string)=>{
  if(busyRef.current||!ready||!requireClosedForm())return;
  const startedWith=latestSnapshot.current,expectedGeneration=generation;
  // Ref previews cannot silently use a changed native head from a second
  // instance, even when React's local draft still says "Сохранено".
  if(!persisted||dirty){issue(Error("Сначала сохраните текущую редакцию."));return;}
  busyRef.current=true;setBusy(true);
  try{
   const checked=await readSavedSnapshotForReference({
    invoke,expectedGeneration,snapshot:startedWith,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))
   });
   if(latestSnapshot.current!==startedWith||dirtyRef.current||editorOpenRef.current)
    throw Error("Черновик изменился во время проверки. Ссылка не сформирована.");
   const ref=createAtlasSavedRef(checked,{projectId,...(workId?{workId}:{})},{persisted:true,dirty:false});
   host?.onSelection?.({projectId,workId:workId??null,revision:ref.revision});
   setSavedRefPreview({label:workId?"Ссылка на работу":"Ссылка на проект",
    json:JSON.stringify(ref,null,2),revision:ref.revision,generation:expectedGeneration});
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 // Open forms keep local, unapplied input state. A project/tab change or
 // competing action must never unmount that form without explicit cancellation.
 const requireClosedForm=()=>{
  if(pendingImport!==null){
   issue(Error("Закройте предпросмотр импорта перед продолжением работы."));
   return false;
  }
  if(savedVersions!==null){
   issue(Error("Закройте просмотр сохранённых редакций перед продолжением работы."));
   return false;
  }
  if(!editorOpenRef.current)return true;
  if(!editorDirtyRef.current){
   setEditor(null);
   if(embedded||window.innerWidth<=1220)setInspector(false);
   return true;
  }
  issue(Error("Открытая форма содержит неприменённые данные. Примените её (Ctrl+Enter) или нажмите «Отмена» перед переходом."));
  return false;
 };
 useEffect(()=>{
  if(!native){setError("Нативный Atlas 0.3 запускается как установленное приложение Tauri. Для работы с данными откройте его через собственное окно Windows.");return}
  invoke<OpenResult>("atlas_open").then(result=>{
   if(result.needsConfirmation){setRecovery(true);setError("Обнаружена повреждённая текущая редакция. Предыдущая версия доступна для явного восстановления.");return}
   const snapshot=deserialize(JSON.stringify(result.snapshot));
   setData(snapshot);saved.current=snapshotText(snapshot);setGeneration(result.generation);setReady(true);
  }).catch(issue);
  let unlisten:undefined|(()=>void);
  if(embedded)return;
  getCurrentWindow().onCloseRequested(event=>{
   if(allowCloseRef.current)return;
   if(savedRefOpenRef.current){
    // Alt+F4 dismisses a reference preview before closing the app.
    event.preventDefault();
    if(!busyRef.current)setSavedRefPreview(null);
    return;
   }
   if(pendingImportOpenRef.current){
    event.preventDefault();
    if(!busyRef.current)setPendingImport(null);
    return;
   }
   if(savedVersionsOpenRef.current){
    // Alt+F4 first closes the history modal, never dismisses the app while
    // a selected generation is being read or restored.
    event.preventDefault();
    if(!busyRef.current)setSavedVersions(null);
    return;
   }
   if(dirtyRef.current||busyRef.current||editorDirtyRef.current){
    event.preventDefault();
    setCloseGuard(true);
   }
  }).then(fn=>{unlisten=fn}).catch(issue);
  return ()=>{unlisten?.()};
 },[native,embedded]);
 // Keep the system window title synchronized with the React project/view.
 useEffect(()=>{
  if(!native||!ready||embedded)return;
  const subject=String(project?.name||"Портфель").replace(/\s+/g," ").trim().slice(0,84);
  const display=project?(tabs.find(t=>t.key===tab)?.title||"Обзор"):"Обзор";
  // Show an open form and an unsaved draft in the native taskbar/title bar.
  // Also lets installed-Windows acceptance distinguish a rendered React form
  // from the earlier Rust atlas_open receipt without UIA or CDP.
  const editTitle=editor?.spec.title;
  const suffix=savedRefPreview?" · "+savedRefPreview.label:
   editTitle?" · Форма: "+String(editTitle).replace(/\s+/g," ").trim().slice(0,70):
   dirty?" · Не сохранено":"";
  void getCurrentWindow().setTitle("IWXA Atlas — "+subject+" — "+display+suffix)
   .catch(error=>console.warn("Atlas native window title unavailable",error));
 },[native,embedded,ready,project?.name,tab,editor?.spec.title,dirty,savedRefPreview?.label]);
 const selectProject=(id:string|null,afterSubmit=false)=>{
  if(!afterSubmit&&!requireClosedForm())return;
  host?.onSelection?.({projectId:id,workId:null,revision:String(latestSnapshot.current.revision)});
  setActive(id);setTab("overview");setEditor(null);setForecastId(null);
  if(!afterSubmit)setMessage("");
  setWorkFilter("all");setWorkQuery("");setWorkSort("title");setWorkLimit(200);
  setHistoryQuery("");setHistoryType("all");setHistoryLimit(120);setRecheckLimit(25);
 };
 const openProjectTab=(id:string,tabId:Tab,changeId:string|null=null)=>{
  if(!requireClosedForm())return;
  selectProject(id);setTab(tabId);
  // Jump straight to the concrete, still-unapplied planning forecast.
  // This is navigation only; human approval and application stay separate.
  if(tabId==="changes"&&changeId)setForecastId(changeId);
 };
 const openEditor=(action:string,projectId?:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  try{
   const p=data.projects.find((x:any)=>x.id===(projectId??active))||null;
   const spec=editorSpec(p,action,data);
   setEditor({action,spec});setInspector(true);setError("");
  }catch(e){issue(e)}
 };
 const openEditorFor=(projectId:string,action:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  try{
   const p=data.projects.find((x:any)=>x.id===projectId);
   if(!p)throw Error("Проект для решения не найден");
   setActive(projectId);setTab(action.startsWith("plan-")?"changes":"reality");
   setEditor({action,spec:editorSpec(p,action,data)});setInspector(true);setError("");
  }catch(e){issue(e)}
 };
 const cancelEditor=()=>{
  if(editorDirtyRef.current&&!confirmAction("Отказаться от введённых изменений формы?"))return;
  editorDirtyRef.current=false;setEditor(null);
  if(embedded||window.innerWidth<=1220)setInspector(false);
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
   if(result.projectId)selectProject(result.projectId,true);
   editorDirtyRef.current=false;setEditor(null);
   if(embedded||window.innerWidth<=1220)setInspector(false);
  }catch(e){issue(e)}
 };
 const save=async():Promise<boolean>=>{
  if(pendingImportOpenRef.current||savedVersionsOpenRef.current){
   issue(Error("Закройте диалог импорта или истории прежде чем сохранять портфель."));
   return false;
  }
  if(editorOpenRef.current){
   issue(Error("Открытая форма ещё не применена. Нажмите Ctrl+Enter, затем Ctrl+S для записи на диск."));
   return false;
  }
  if(busyRef.current||!ready)return false;
  // A Ctrl+S can arrive before React has re-rendered after a submitted
  // form. Save the latest applied domain draft, not a stale render closure.
  const startedWith=latestSnapshot.current;
  const startedSignature=snapshotText(startedWith);
  if(startedSignature===saved.current)return true;
  busyRef.current=true;setBusy(true);
  try{
   const result=await commitWithReadback({
    invoke,expectedGeneration:generation,snapshot:startedWith,
    signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))
   });
   // A user may have changed the in-memory draft while the native IPC was
   // pending. Only the exact snapshot verified on disk is marked as saved.
   saved.current=startedSignature;
   setGeneration(result.generation);
   const changedWhileSaving=latestSnapshot.current!==startedWith;
   const notice=result.reconciled?
    "Запись найдена и сверена с диском после потери ответа нативной команды.":
    "Сохранено и перечитано с диска. Новых файлов проектов: "+result.projectBlocksWritten+".";
   setMessage(notice+(changedWhileSaving?" Изменения, внесённые во время записи, ещё не сохранены.":""));
   host?.onReadback?.({generation:result.generation,revision:String(startedWith.revision),
    projectId:active,dirty:changedWhileSaving});
   setError("");
   return !changedWhileSaving;
  }catch(e){issue(e);return false}finally{busyRef.current=false;setBusy(false)}
 };
 const closeWindow=async()=>{
  if(embedded){issue(Error("Закрытие встроенной поверхности выполняет Personal Agent через U04."));return}
  // Existing allow-close capability; explicit user intent bypasses only the
  // close warning, not any native write or permission boundary.
  allowCloseRef.current=true;
  try{await getCurrentWindow().close()}
  catch(e){allowCloseRef.current=false;issue(e)}
 };
 const saveAndClose=async()=>{
  const done=await save();
  if(done&&latestSnapshot.current===data&&!editorOpenRef.current)await closeWindow();
 };
 const exportJson=async(mode:"backup"|"center"="backup")=>{
  if(!requireClosedForm()||busyRef.current||!ready)return;
  if(dirty){issue(Error("Сначала сохраните изменения, затем экспортируйте портфель."));return}
  busyRef.current=true;setBusy(true);
  try{
   // Use the same native atomic Atlas JSON export already accepted in 0.2.
   // Center imports a user-selected snapshot, not a live connection or grant.
   const result=await invoke<string>("atlas_export_json",{expectedGeneration:generation});
   if(mode==="center"){
    setSavedRefPreview(null);
    setMessage(result+" В Admin Center откройте раздел «Планы Atlas» → «Открыть портфель Atlas» и выберите этот JSON. Это снимок, а не синхронизация.");
   }else setMessage(result);
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const importJson=async()=>{
  if(!requireClosedForm()||busyRef.current||!ready)return;
  if(dirty){issue(Error("Сначала сохраните изменения или отмените их перед импортом."));return}
  busyRef.current=true;setBusy(true);
  try{
   const startedWith=latestSnapshot.current;
   const imported=await invoke<Atlas|null>("atlas_select_import");
   if(!imported)return;
   // The file chooser can outlive the local draft from which it was opened.
   if(latestSnapshot.current!==startedWith||dirtyRef.current||editorOpenRef.current)
    throw Error("Портфель или открытая форма изменились во время выбора файла. Импорт отменён, текущие данные не заменены.");
   const head=await invoke<OpenResult>("atlas_open");
   if(head.needsConfirmation||head.generation!==generation)
    throw Error("Нативный портфель изменился во время импорта. Сначала откройте актуальную редакцию.");
   const {snapshot:next,originalRevision,summary}=prepareImportedSnapshot(startedWith,imported);
   // A chosen file is not permission to replace the user's portfolio.
   // Keep the fully validated candidate separate until explicit approval.
   setPendingImport({snapshot:next,originalRevision,summary,startedWith,expectedGeneration:generation});
   setMessage("");setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const applyPendingImport=async()=>{
  const candidate=pendingImport;
  if(!candidate)return;
  if(busyRef.current||dirtyRef.current||editorOpenRef.current){
   issue(Error("Импорт пока нельзя применить: завершите текущее действие или закройте открытую форму."));
   return;
  }
  busyRef.current=true;setBusy(true);
  try{
   const head=await invoke<OpenResult>("atlas_open");
   // The chooser and preview may outlive a competing native write.
   if(head.needsConfirmation||head.generation!==candidate.expectedGeneration)
    throw Error("Портфель на диске изменился. Импорт отменён; закройте предпросмотр и откройте актуальные данные.");
   if(latestSnapshot.current!==candidate.startedWith||dirtyRef.current||editorOpenRef.current)
    throw Error("Черновик изменился после предпросмотра. Импорт не применён.");
   setPendingImport(null);
   mutate(candidate.snapshot,"Импортированная редакция "+candidate.originalRevision+
    " применена к черновику. Для записи на диск нажмите «Сохранить».");
   selectProject(null,true);
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const showNativeHistory=async()=>{
  if(!requireClosedForm()||busyRef.current||!ready||dirty||!persisted)return;
  busyRef.current=true;setBusy(true);
  try{
   const entries=await invoke<HistoryEntry[]>("atlas_list_history",{expectedGeneration:generation});
   setSelectedHistory(null);setNativeHistoryLimit(40);setSavedVersions(entries);setMessage("");setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const restoreHistoricalVersion=async(item:HistoryEntry)=>{
  if(savedVersions===null||!savedVersions.some(row=>row.generation===item.generation)||
   selectedHistory?.generation!==item.generation||
   busyRef.current||dirtyRef.current||editorOpenRef.current)return;
  // The selected revision is reviewed and explicitly confirmed inside the
  // version dialog; no blocking WebView2 JavaScript confirm is required.
  busyRef.current=true;setBusy(true);
  try{
   const result=await invoke<OpenResult>("atlas_restore_history",{
    expectedGeneration:generation,historyGeneration:item.generation
   });
   if(result.needsConfirmation)throw Error("Нативное хранилище требует отдельного восстановления");
   const checked=deserialize(JSON.stringify(result.snapshot));
   latestSnapshot.current=checked;
   saved.current=snapshotText(checked);
   setData(checked);setGeneration(result.generation);setSavedVersions(null);
   // React state updates asynchronously. Navigation after an explicitly
   // confirmed restore must not use the prior modal-guard render closure.
   selectProject(null,true);setSelectedHistory(null);
   setMessage("Архивная редакция "+item.revision+" восстановлена, сохранена новым поколением и перечитана.");
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const restore=async()=>{
  if(!confirmAction("Восстановить предыдущую исправную редакцию? Повреждённый индекс будет сохранён в карантине."))return;
  busyRef.current=true;setBusy(true);
  try{
   const result=await invoke<OpenResult>("atlas_restore_previous");
   const checked=deserialize(JSON.stringify(result.snapshot));
   saved.current=snapshotText(checked);setData(checked);setGeneration(result.generation);
   setReady(true);setRecovery(false);setMessage("Предыдущая редакция восстановлена и перечитана.");setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const syncPublic=async(source?:{projectId:string;sourceId:string})=>{
  if(!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Запросить публичные сведения GitHub? Наблюдение не подтверждает готовность проекта."))return;
  busyRef.current=true;setBusy(true);
  try{
   const startedWith=data;
   const plan=planPublicRefresh(data,{maxAgeMs:0,only:source?[source]:null} as any);
   if(!plan.selected){setMessage("Нет источников для наблюдения.");return}
   const result=await reconcilePublicSources(data,{plan});
   if(latestSnapshot.current!==startedWith)throw Error("Портфель изменён во время обращения к источнику. Наблюдения не применены; повторите сверку.");
   if(result.state!==data)mutate(result.state,"Публичные наблюдения обновлены в черновике. Сохраните результат на диск.");
   setRefreshReport(result.report);
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const applyAmendment=(changeId:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Применить утверждённые корректировки плана? Действие будет записано в историю решений."))return;
  try{mutate(applyPlanAmendment(data,project.id,changeId).state,"План изменён в черновике. Сохраните новую редакцию.");setForecastId(null)}
  catch(e){issue(e)}
 };
 const removeAmendment=(changeId:string,key:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Убрать выбранную корректировку из ещё не утверждённой заявки?"))return;
  try{
   mutate(removePlanAmendment(data,project.id,changeId,key).state,
    "Корректировка удалена из черновика заявки. Сохраните изменение.");
   setForecastId(null);
  }catch(e){issue(e)}
 };
 const removeDependency=(from:string,to:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Удалить направленную связь работ? CPM будет пересчитан."))return;
  try{mutate(disconnect(data,project.id,from,to),"Зависимость удалена. Сохраните изменение.");}catch(e){issue(e)}
 };
 const removeEmptyStage=(id:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Удалить пустой этап?"))return;
  try{mutate(removeStage(data,project.id,id),"Этап удалён. Сохраните изменение.");}catch(e){issue(e)}
 };
 const removeWork=(id:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Удалить работу? Сначала удалите связи и плановые корректировки."))return;
  try{mutate(removeItem(data,project.id,id),"Работа удалена. Сохраните изменение.");}catch(e){issue(e)}
 };
 const removePortfolioDependency=(id:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  if(!confirmAction("Удалить межпроектную зависимость? План будет пересчитан."))return;
  try{mutate(removePortfolioLink(data,id),"Связь проектов удалена. Сохраните изменение.");}catch(e){issue(e)}
 };
 const removeProject=(id:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  const subject=data.projects.find((p:any)=>p.id===id);if(!subject)return;
  const linked=(data.portfolioLinks||[]).filter((l:any)=>l.from===id||l.to===id).length;
  if(!confirmAction("Удалить «"+subject.name+"» с "+subject.items.length+" работами, "+
   subject.stages.length+" этапами, "+subject.risks.length+" рисками и историей? "+
   "Связей с другими проектами: "+linked+". Они будут удалены. "+
   "В прежнюю сохранённую редакцию можно вернуться через историю."))return;
  try{mutate(dropProject(data,id),"Проект удалён из черновика. Сохраните изменение.");
   if(active===id)selectProject(null,true);
  }catch(e){issue(e)}
 };
 const quickWork=(id:string,state:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  try{mutate(editItem(data,project.id,id,{state}),"Состояние работы изменено в черновике.")}
  catch(e){issue(e)}
 };
 const view=(tabId:Tab)=>{
  if(!requireClosedForm())return;
  setTab(tabId);setEditor(null);setForecastId(null);
 };
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   // Agent retains its own shortcuts unless keyboard focus is inside Atlas.
   // composedPath sees Shadow DOM descendants even after event retargeting.
   if(embedded && (!rootRef.current || !event.composedPath().includes(rootRef.current)))return;
   const ctrl=event.ctrlKey||event.metaKey,code=event.code;
   // Both the import preview and native history are modal.
   if(pendingImport!==null){
    if(event.key==="Escape"&&!busyRef.current){
     event.preventDefault();setPendingImport(null);return;
    }
    if(ctrl||event.key==="Escape")event.preventDefault();
    return;
   }
   if(savedVersions!==null){
    if(event.key==="Escape"&&!busyRef.current){
     event.preventDefault();setSavedVersions(null);return;
    }
    if(ctrl||event.key==="Escape")event.preventDefault();
    return;
   }
   if(savedRefPreview!==null){
    if(event.key==="Escape"&&!busyRef.current){
     event.preventDefault();setSavedRefPreview(null);return;
    }
    if(ctrl||event.key==="Escape"){event.preventDefault();return}
   }
   // Physical keys retain shortcuts when the UI keyboard layout is changed.
   if(ctrl&&event.altKey&&!event.shiftKey&&code==="KeyP"){
    event.preventDefault();
    if(!ready||busyRef.current||!project)return;
    void showSavedReference(project.id);
    return;
   }
   if(ctrl&&!event.shiftKey&&code==="KeyS"){event.preventDefault();void save();return}
   if(ctrl&&event.shiftKey&&(code==="KeyN"||code==="KeyL")){
    event.preventDefault();
    if(!ready||busyRef.current)return;
    if(!requireClosedForm())return
    if(!project){issue(Error("Сначала откройте проект."));return}
    if(code==="KeyL"&&project.items.length<2){issue(Error("Для зависимости нужны минимум две работы."));return}
    openEditor(code==="KeyN"?"item":"dep");return;
   }
   if(ctrl&&!event.shiftKey&&["Digit1","Digit2","Digit3"].includes(code)){
    event.preventDefault();
    if(!ready||busyRef.current)return;
    if(!requireClosedForm())return
    if(!project){issue(Error("Сначала откройте проект."));return}
    view(({Digit1:"work",Digit2:"timeline",Digit3:"graph"} as Record<string,Tab>)[code]);
    return;
   }
   if(ctrl&&!event.shiftKey&&code==="KeyN"){
    event.preventDefault();
    if(!ready||busyRef.current)return;
    if(!requireClosedForm())return
    openEditor("new");return;
   }
   if(event.key==="Escape"&&editorOpenRef.current){event.preventDefault();cancelEditor();return}
   if(ctrl&&!event.shiftKey&&code==="KeyK"){event.preventDefault();rootRef.current?.querySelector<HTMLInputElement>("#atlas-search")?.focus()}
  };
  window.addEventListener("keydown",key);return ()=>window.removeEventListener("keydown",key);
 });
 if(!ready)return <main className="entry">
  <div className="entry-card"><img className="logo-symbol" src={logoUrl} alt="" aria-hidden="true" /><h1>IWXA Atlas <em>0.3.0</em></h1>
   <p>{recovery?"Найдена предыдущая исправная версия портфеля. Восстановление выполняется только по вашему решению.":"Самостоятельное локальное приложение для Windows. Данные принадлежат пользователю."}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   {recovery&&<Action onClick={()=>void restore()} primary disabled={busy}>Восстановить сохранённую версию</Action>}
   {!native&&<p className="minor">Браузерный просмотр не подключается к локальным данным Atlas. Для разработки используется Tauri.</p>}
   {native&&!recovery&&!error&&<p className="minor">Открытие нативного хранилища…</p>}
  </div>
 </main>;
 return <div ref={rootRef} className={"app-shell"+(inspector?"":" no-inspector")+(editor?" editor-active":"")+(embedded?" atlas-embedded":"")}>
  <aside className="sidebar">
   <div className="brand"><img className="logo-symbol" src={logoUrl} alt="" aria-hidden="true" /><div><strong>Atlas</strong><small>IWXA · 0.3.0</small></div></div>
   <nav className="main-nav" aria-label="Основная навигация">
    <button className={!active?"nav-current":""} onClick={()=>selectProject(null)}>▦ <span>Портфель проектов</span><b>{data.projects.length}</b></button>
    <button aria-label="Создать проект" onClick={()=>{selectProject(null);openEditor("new")}}>＋ <span>Создать проект</span></button>
   </nav>
   <div className="sidebar-label">Мои проекты</div>
   <div className="project-nav" aria-label="Проекты">
    {filtered.slice(0,sidebarLimit).map((p:any)=><button key={p.id} className={active===p.id?"nav-current":""}
      onClick={()=>selectProject(p.id)}><span className="project-indicator"/><span className="project-name">{p.name}</span></button>)}
    {filtered.length>sidebarLimit&&<button type="button"
     onClick={()=>setSidebarLimit(n=>Math.min(filtered.length,n+120))}>
     Показать ещё проекты ({filtered.length-sidebarLimit})
    </button>}
    {!filtered.length&&<small className="nav-hint">Проекты не найдены</small>}
   </div>
   <div className="sidebar-foot"><div className="foot-title">{embedded?"Atlas в Personal Agent":"Локальная работа"}</div><p>{embedded?"Полный интерфейс Atlas. Хранилище принадлежит Atlas; команды разрешает host.":"Без Agent и сервера. Данные сохраняются по вашей команде."}</p><small>Схема: atlas.project/1</small></div>
  </aside>
  <main className="workspace">
   <header className="commandbar">
    <label className="search"><span>⌕</span><input id="atlas-search" placeholder="Найти проект · Ctrl+K"
      value={search} onChange={e=>{setSearch(e.target.value);setPortfolioLimit(150);setSidebarLimit(120)}}/><kbd>Ctrl K</kbd></label>
    <div className="toolbar-actions">
     <Badge tone={editor||dirty?"warning":persisted?"good":"neutral"}>{editor?"Форма не применена":dirty?"Не сохранено":persisted?"Сохранено":"Новый портфель"}</Badge>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy||!!editor} title={editor?"Сначала примените открытую форму":"Ctrl+S"}>Сохранить</Action>
     <Action onClick={()=>void importJson()} disabled={busy||!!editor||pendingImport!==null}>Открыть JSON</Action>
     <Action onClick={()=>void exportJson()} disabled={busy||dirty||!!editor||!persisted}>Резервная копия</Action>
     <Action onClick={()=>void showNativeHistory()} disabled={busy||dirty||!!editor||!persisted||savedVersions!==null}>Версии на диске</Action>
     <button disabled={!!editor} className="icon-button inspector-button" aria-label={inspector?"Скрыть инспектор":"Показать инспектор"}
      title="Инспектор" onClick={()=>setInspector(!inspector)}>◧</button>
    </div>
   </header>
   {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Закрыть сообщение">×</button></div>}
   {message&&<div className="alert notice" role="status">{message}<button onClick={()=>setMessage("")} aria-label="Закрыть сообщение">×</button></div>}
   {!project?<>
    <div className="page-heading"><div><small>Ваше рабочее пространство</small><h1>Портфель проектов</h1>
      <p>Что должно быть, что известно и какие решения влияют на планы.</p></div>
      <Action onClick={()=>openEditor("new")} primary title="Ctrl+N">＋ Новый проект</Action></div>
    <div className="metric-grid">
     <Metric value={data.projects.length} label="Проектов"/>
     <Metric value={data.projects.filter((p:any)=>p.status==="active").length} label="В работе"/>
     <Metric value={resources.totals.potentialConflicts} label="Плановые перегрузки"/>
     <Metric value={reviews.totals?.needsDecision??0} label="Решений по плану"/>
    </div>
    <section className="surface">
     <div className="section-heading"><div><h2>Проекты и последствия</h2><p>Перейдите к проекту, чтобы увидеть точные причины и объекты.</p></div>
      {data.projects.length>1&&<Action onClick={()=>openEditor("portfolio-link")}>Связать проекты</Action>}</div>
     <div className="filter-row"><label>Показывать <select value={portfolioStatus} onChange={ev=>{setPortfolioStatus(ev.target.value);setPortfolioLimit(150)}}>
      <option value="active">Активные и запланированные</option><option value="all">Все проекты</option>
      <option value="finished">Завершённые и отменённые</option>
     </select></label></div>
     {filtered.length?<div className="table-scroll"><table><thead><tr><th>Проект</th><th>Состояние</th><th>Требует внимания</th><th>Расчётный срок</th><th>Риск срока</th><th>Действия</th></tr></thead>
      <tbody>{filtered.slice(0,portfolioLimit).map((p:any)=>{
       const imp=projectImpact(p),row=dates.byId.get(p.id);
       return <tr key={p.id}><td><button className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button><small>{p.goal||"Цель не задана"}</small></td>
        <td><Badge>{statuses[p.status]||p.status}</Badge></td><td>{imp.attention} требований · {imp.sourceIssues.length} источников</td>
        <td title={row?.notes?.join("; ")||""}>{projectedFinishLabel(row)}</td><td>{row?.deadlineSlipDays==null?"Неизвестно":row.deadlineSlipDays+" дн."}</td>
        <td><Action onClick={()=>removeProject(p.id)}>Удалить</Action></td></tr>;
      })}</tbody></table></div>:<Fallback message={data.projects.length?"По запросу проекты не найдены. Измените поиск, чтобы увидеть остальные.":"Здесь появятся проекты. Создайте первый проект, определите результат и сохраните его на диск."}/>}
     {filtered.length>0&&<p className="minor">Показано {Math.min(filtered.length,portfolioLimit)} из {filtered.length} проектов по текущему поиску.</p>}
     {filtered.length>portfolioLimit&&<Action onClick={()=>setPortfolioLimit(n=>Math.min(filtered.length,n+150))}>Показать ещё проекты</Action>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Решения и изменения по новым фактам</h2><p>От перепроверки Git SHA до предложения и отдельного применения утверждённого плана. Новые факты сами план не меняют.</p></div></div>
     {reviewRows.slice(0,reviewLimit).map((r:any,i:number)=>
      <div className="attention-row" key={r.projectId+"-"+i}><div><strong>{r.projectName}</strong><small>{r.targetTitle||"Пересмотр плана"} · {planReviewStatus[r.state]||r.state}{r.proposal?" · «"+r.proposal.title+"»":""}</small></div>
       <div className="button-row">
        {["needs_decision","deferred"].includes(r.state)&&<Action onClick={()=>openEditorFor(r.projectId,planReviewAction(r.rootProjectId,r.findingId,r.projectId,r.revision))}>Рассмотреть план</Action>}
        {r.state==="needs_proposal"&&r.decision&&<Action onClick={()=>openEditorFor(r.projectId,planProposalAction(r.projectId,r.decision.id))}>Предложить изменение</Action>}
        {["proposal_open","plan_pending"].includes(r.state)&&<Action onClick={()=>openProjectTab(r.projectId,"changes",r.proposal?.id||null)}>{r.state==="plan_pending"?"Показать сценарий плана":"Открыть заявку"}</Action>}
        {r.state==="source_hold"&&<Action onClick={()=>openProjectTab(r.rootProjectId,"sources")}>Сверить Git-источник</Action>}
        <Action onClick={()=>selectProject(r.projectId)}>Открыть</Action>
       </div></div>)}
     {reviewRows.length>0&&<p className="minor">Показано {Math.min(reviewLimit,reviewRows.length)} из {reviewRows.length} записей, требующих внимания.</p>}
     {reviewRows.length>reviewLimit&&<Action onClick={()=>setReviewLimit(n=>Math.min(reviewRows.length,n+20))}>Показать ещё решения ({reviewRows.length-reviewLimit})</Action>}
     {!reviewRows.length&&<p className="minor">Сейчас нет открытых пересмотров и заявок по перепроверенным Git-ревизиям. Это не подтверждение завершения проектов.</p>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Плановые ресурсы</h2><p>Ресурсы объединяются только по явному назначению, не по имени человека.</p></div>
      <Action onClick={()=>openEditor("resource-new")}>＋ Плановый ресурс</Action></div>
     {resources.people.length?<div className="table-scroll"><table><thead><tr><th>Ресурс</th><th>Мощность</th><th>Максимум</th><th>Выше мощности</th><th>Вне доступности</th><th></th></tr></thead><tbody>
      {resources.people.slice(0,resourceLimit).map((r:any)=><tr key={r.id}><td>{r.label}</td><td>{r.capacityPct}%</td><td>{r.maxLoadPct}%</td>
       <td>{r.overloadDays} дн.</td><td>{r.unavailableDays} дн.</td><td><Action onClick={()=>openEditor("resource-edit:"+r.id)}>Настроить</Action></td></tr>)}</tbody></table></div>:
      <Fallback message="Плановые ресурсы пока не добавлены. Назначения ответственных в текстовых полях не считаются подтверждёнными ресурсами."/>}
     {resources.people.length>0&&<p className="minor">Показано {Math.min(resourceLimit,resources.people.length)} из {resources.people.length} ресурсов.</p>}
     {resources.people.length>resourceLimit&&<Action onClick={()=>setResourceLimit(n=>Math.min(resources.people.length,n+40))}>Показать ещё ресурсы</Action>}
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Публичные источники</h2><p>Read-only наблюдения GitHub, без доступа к приватным репозиториям.</p></div>
      <Action onClick={()=>void syncPublic()} disabled={busy||!sourceQueue.bindings}>Сверить источники</Action></div>
     {refreshReport&&<p className="minor">Последняя попытка: {refreshReport.updated} обновлено · {refreshReport.failed} ошибок · {refreshReport.remaining} отложено.</p>}
     <div className="summary-line"><span>Всего привязок: {sourceQueue.bindings}</span><span>Требуют проверки: {sourceQueue.pending}</span><span>Ошибки: {sourceQueue.errors}</span></div>
     {sourceQueue.rows.slice(0,sourceLimit).map((r:any,i:number)=><div key={i} className="attention-row"><div><strong>{r.locator}</strong><small>{r.error?"Ошибка":r.stale?"Требует обновления":"Наблюдался"} · {r.count} привязок</small></div>
      <Action onClick={()=>selectProject(r.projectId)}>Открыть</Action></div>)}
     {sourceQueue.rows.length>0&&<p className="minor">Показано {Math.min(sourceLimit,sourceQueue.rows.length)} из {sourceQueue.rows.length} источников.</p>}
     {sourceQueue.rows.length>sourceLimit&&<Action onClick={()=>setSourceLimit(n=>Math.min(sourceQueue.rows.length,n+15))}>Показать ещё источники ({sourceQueue.rows.length-sourceLimit})</Action>}
    </section>
    <section className="surface">
     <button className="text-link" onClick={()=>setShowDetails(!showDetails)}>{showDetails?"Скрыть":"Показать"} межпроектные зависимости</button>
     {showDetails&&<div className="table-scroll"><table><thead><tr><th>От проекта</th><th>К проекту</th><th>Условие</th><th>Действие</th></tr></thead><tbody>
      {(data.portfolioLinks||[]).map((l:any)=><tr key={l.id}><td>{data.projects.find((p:any)=>p.id===l.from)?.name}</td>
       <td>{data.projects.find((p:any)=>p.id===l.to)?.name}</td><td>{l.note||"Зависимость"}</td><td><Action onClick={()=>removePortfolioDependency(l.id)}>Удалить связь</Action></td></tr>)}</tbody></table></div>}
    </section>
   </>:<>
    <div className="page-heading"><div><small><button className="breadcrumb" onClick={()=>selectProject(null)}>Портфель</button> / {project.type}</small>
     <h1>{project.name}</h1><p>{project.goal||"Цель пока не определена"}</p></div>
     <div className="button-row"><Badge>{statuses[project.status]||project.status}</Badge><Action disabled={busy||dirty||!persisted||!!editor} onClick={()=>showSavedReference(project.id)} title="Ctrl+Alt+P · Только сохранённая редакция">Ссылка на проект</Action><Action onClick={()=>openEditor("project-edit")}>Редактировать проект</Action></div>
    </div>
    <nav className="tabbar" aria-label="Представления проекта">{tabs.map(t=><button key={t.key}
      title={t.key==="work"?"Ctrl+1":t.key==="timeline"?"Ctrl+2":t.key==="graph"?"Ctrl+3":undefined}
      className={tab===t.key?"selected":""} onClick={()=>view(t.key)}>{t.title}</button>)}</nav>
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
       <span>Прогноз финиша: {projectedFinishLabel(projected)}</span><span>Критический путь: {plan?.durationDays??0} дн.</span></div>
       {!!projected?.unavailableOrigins?.length&&<p className="atlas-schedule-warning">
        Поставка заблокирована: {projected.unavailableOrigins.map((o:any)=>o.name+" ("+(o.status==="cancelled"?"отменён":"приостановлен")+")").join(", ")}. Корректировка зависимостей требует решения человека.
       </p>}
     </section>
     <section className="surface"><div className="section-heading"><div><h2>Этапы проекта</h2>
      <p>Этапы связывают работы с принятым планом; завершение этапа не означает приёмку результата.</p></div>
      <Action onClick={()=>openEditor("stage")}>＋ Этап</Action></div>
      {project.stages.length?<div className="table-scroll"><table><thead><tr><th>Этап</th><th>Состояние</th><th>Срок</th><th>Работ</th><th>Действия</th></tr></thead>
       <tbody>{project.stages.map((stage:any)=><tr key={stage.id}><td>{stage.name}</td><td>{statuses[stage.status]||stage.status}</td>
        <td>{readable(stage.dueDate)}</td><td>{project.items.filter((w:any)=>w.stageId===stage.id).length}</td><td><Action onClick={()=>openEditor("stage-edit:"+stage.id)}>Изменить</Action><Action onClick={()=>removeEmptyStage(stage.id)}>Удалить пустой</Action></td></tr>)}</tbody></table></div>:
       <Fallback message="Добавьте этап, чтобы организовать работу проекта."/>}
     </section>
     <section className="surface"><div className="section-heading"><div><h2>Риски и решения</h2></div></div>
      <div className="button-row"><Action onClick={()=>openEditor("risk")}>＋ Риск</Action><Action onClick={()=>openEditor("decision")}>＋ Решение</Action>
       <Action onClick={()=>view("changes")}>Предложения изменений</Action></div>
      <div className="summary-line"><span>Рисков: {project.risks.length}</span><span>Решений: {project.decisions.length}</span><span>Предложений: {project.changes?.length||0}</span></div>
      <div className="split-details">
       <div><h3>Заявленные риски</h3>{project.risks.length?project.risks.slice(0,30).map((risk:any)=>
        <div className="detail-row" key={risk.id}><span>{risk.title}</span><Badge tone={risk.status==="open"?"warning":"neutral"}>{risk.status==="open"?"Открыт":"Закрыт"}</Badge><Action onClick={()=>openEditor("risk-edit:"+risk.id)}>Изменить</Action></div>):
        <p className="minor">Риски ещё не внесены.</p>}
        {project.risks.length>30&&<p className="minor">Показаны 30 из {project.risks.length} рисков.</p>}</div>
       <div><h3>Последние решения</h3>{project.decisions.length?project.decisions.slice(-15).reverse().map((decision:any)=>
        <div className="detail-row" key={decision.id}><span>{decision.text}</span><small>{readable(decision.at)}</small></div>):
        <p className="minor">Решений пока нет.</p>}
        {project.decisions.length>15&&<Action onClick={()=>view("history")}>Вся история</Action>}</div>
      </div>
     </section>
    </>}
    {tab==="work"&&<section className="surface">
     <div className="section-heading"><div><h2>Работы проекта</h2><p>Изменения отражаются в доске, графике и зависимостях.</p></div>
      <div className="button-row"><Action onClick={()=>openEditor("item")} primary title="Ctrl+Shift+N">＋ Работа</Action><Action onClick={()=>openEditor("stage")}>＋ Этап</Action><Action onClick={()=>openEditor("dep")} title="Ctrl+Shift+L">Связь работ</Action></div></div>
     <div className="filter-row"><label>Состояние <select value={workFilter} onChange={e=>{setWorkFilter(e.target.value);setWorkLimit(200)}}>
      <option value="all">Все</option>{Object.entries(workStatuses).map(([v,k])=><option value={v} key={v}>{String(k)}</option>)}</select></label>
      <label>Найти работу <input type="search" value={workQuery} aria-label="Найти работу"
       placeholder="Название или ответственный" onChange={e=>{setWorkQuery(e.target.value);setWorkLimit(200)}}/></label>
      <label>Сортировка <select aria-label="Сортировка работ" value={workSort} onChange={e=>{setWorkSort(e.target.value);setWorkLimit(200)}}>
       <option value="title">По названию</option><option value="dueDate">По сроку</option>
       <option value="priority">По приоритету</option><option value="estimateDays">По длительности</option>
       <option value="state">По состоянию</option>
      </select></label></div>
     <div className="table-scroll"><table><thead><tr><th>Работа</th><th>Состояние</th><th>Длительность</th><th>Ответственный</th><th>Срок</th><th>Изменить</th></tr></thead>
      <tbody>{filteredWork.slice(0,workLimit).map((w:any)=><tr key={w.id}>
       <td><strong>{w.title}</strong><small>{project.stages.find((s:any)=>s.id===w.stageId)?.name||"Без этапа"}</small></td>
       <td><Badge>{workStatuses[w.state]}</Badge></td><td>{w.estimateDays??1} дн.</td><td>{w.assignee||"Не назначен"}</td><td>{readable(w.dueDate)}</td>
       <td><Action onClick={()=>openEditor("work:"+w.id)}>Открыть</Action><Action disabled={busy||dirty||!persisted||!!editor} onClick={()=>showSavedReference(project.id,w.id)} title="Только сохранённая редакция">Ссылка</Action><Action onClick={()=>removeWork(w.id)}>Удалить</Action></td></tr>)}</tbody></table></div>
     {project.items.length>0&&<p className="minor">Показано {Math.min(filteredWork.length,workLimit)} из {filteredWork.length} работ по фильтру; всего в проекте: {project.items.length}.</p>}
     {filteredWork.length>workLimit&&<Action onClick={()=>setWorkLimit(n=>Math.min(filteredWork.length,n+200))}>Показать ещё работы</Action>}
     {project.items.length>0&&!filteredWork.length&&<Fallback message="По фильтру работ нет. Очистите поиск или измените состояние."/>}
     {!project.items.length&&<Fallback message="Пока нет работ. Добавьте первую работу и сохраните проект."/>}
    </section>}
    {tab==="board"&&<div className="board">
     {Object.entries(workStatuses).map(([key,title])=><section className="board-column" key={key}><h3>{String(title)} <small>{project.items.filter((w:any)=>w.state===key).length}</small></h3>
      {project.items.filter((w:any)=>w.state===key).slice(0,boardLimits[key]||60).map((w:any)=><div className="board-card" key={w.id}><strong>{w.title}</strong><small>{w.assignee||"Нет ответственного"} · {w.estimateDays??1} дн.</small>
       <div className="board-actions"><select aria-label={"Состояние "+w.title} value={w.state} onChange={e=>quickWork(w.id,e.target.value)}>
        {Object.entries(workStatuses).map(([v,title])=><option key={v} value={v}>{String(title)}</option>)}</select>
        <button onClick={()=>openEditor("work:"+w.id)}>Детали</button></div></div>)}
       {project.items.filter((w:any)=>w.state===key).length>(boardLimits[key]||60)&&
        <Action onClick={()=>setBoardLimits(prev=>({...prev,[key]:(prev[key]||60)+60}))}>
         Показать ещё карточки ({project.items.filter((w:any)=>w.state===key).length-(boardLimits[key]||60)})
        </Action>}
      </section>)}
    </div>}
    {tab==="timeline"&&(plan?
      <ProjectGantt key={project.id} schedule={plan}
       projectStatus={project.status} projectStart={project.startDate||null} projectDue={project.dueDate||null}
       portfolioStart={projected?.projectedStart||null} shiftDays={projected?.shiftDays??null}
       unavailableOrigins={projected?.unavailableOrigins||[]}
       onOpenProject={id=>selectProject(id)}
       onEditDates={()=>openEditor("dates")} onOpenWork={id=>openEditor("work:"+id)}/>:
      <section className="surface"><Fallback message="План пока не рассчитан. Добавьте работы или проверьте зависимости."/></section>)}
    {tab==="graph"&&<section className="surface"><div className="section-heading">
      <div><h2>Зависимости работ</h2><p>Интерактивный DAG существующего CPM; выделенный путь не означает подтверждение исполнения.</p></div>
      <Action onClick={()=>openEditor("dep")}>＋ Зависимость</Action></div>
      {plan&&<ProjectDependencyDiagram key={project.id} schedule={plan} onOpenWork={id=>openEditor("work:"+id)}/>}
      <div className="table-scroll"><table><thead><tr><th>Предшествующая работа</th><th>Зависимая работа</th><th>Переход</th></tr></thead>
       <tbody>{project.dependencies.map((d:any,i:number)=><tr key={d.from+"-"+d.to+"-"+i}>
        <td>{project.items.find((w:any)=>w.id===d.from)?.title||d.from}</td>
        <td>{project.items.find((w:any)=>w.id===d.to)?.title||d.to}</td>
        <td><Action onClick={()=>openEditor("work:"+d.to)}>Открыть работу</Action><Action onClick={()=>removeDependency(d.from,d.to)}>Удалить связь</Action></td>
       </tr>)}</tbody></table></div>
      {project.dependencies.length===0&&<p className="minor">Связей пока нет. Добавьте зависимости между работами для расчёта критического пути.</p>}
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
     {recheckRows.slice(0,recheckLimit).map((r:any)=>
      <div className="attention-row" key={r.id}><div><strong>{r.targetTitle}</strong>
       <small>{r.locator} / {r.ref} · {r.claimedSha?.slice(0,12)} → {r.observedSha?.slice(0,12)||"неизвестно"}</small></div>
       {r.canRecheck?<Action onClick={()=>openEditor(recheckAction(project.id,r.claimId,r.observedSha))}>Повторно проверить</Action>:
        <Badge tone="warning">Обновите источник</Badge>}</div>)}
     {recheckRows.length>0&&<p className="minor">Показано {Math.min(recheckLimit,recheckRows.length)} из {recheckRows.length} повторных проверок.</p>}
     {recheckRows.length>recheckLimit&&<Action onClick={()=>setRecheckLimit(n=>Math.min(recheckRows.length,n+25))}>Показать ещё проверки ({recheckRows.length-recheckLimit})</Action>}
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
      {!!c.planAmendments?.length&&<div className="table-scroll"><table>
       <thead><tr><th>Корректировка</th><th>Было</th><th>Предлагается</th><th>Действие</th></tr></thead>
       <tbody>{c.planAmendments.map((a:any,i:number)=>{
        const key=a.kind==="dates"?"dates":a.kind==="work"?"work:"+a.itemId:"new_work:"+a.id;
        const item=a.kind==="work"?project.items.find((w:any)=>w.id===a.itemId):null;
        const before=a.kind==="dates"?
         "Начало: "+readable(a.before.startDate)+" · срок: "+readable(a.before.dueDate):
         a.kind==="work"?
         (a.before.estimateDays??1)+" дн. · срок: "+readable(a.before.dueDate):
         "Работа отсутствует";
        const after=a.kind==="dates"?
         "Начало: "+readable(a.after.startDate)+" · срок: "+readable(a.after.dueDate):
         a.kind==="work"?
         (a.after.estimateDays??1)+" дн. · срок: "+readable(a.after.dueDate):
         (a.estimateDays??1)+" дн. · срок: "+readable(a.dueDate);
        return <tr key={key+"-"+i}>
         <td>{a.kind==="dates"?"Даты проекта":a.kind==="work"?"Работа: "+(item?.title||"Не найдена"):"Новая работа: "+a.title}</td>
         <td>{before}</td><td>{after}</td>
         <td>{["proposed","deferred"].includes(c.status)&&!c.planAppliedAt?
          <Action onClick={()=>removeAmendment(c.id,key)}>Убрать</Action>:"—"}</td>
        </tr>;
       })}</tbody></table></div>}
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
    {tab==="history"&&<section className="surface"><div className="section-heading"><div><h2>История решений и фактов</h2>
      <p>История не равна независимой приёмке результата. Все записи доступны без ограничения первыми 120.</p></div>
     <Action onClick={()=>openEditor("decision")}>＋ Решение</Action></div>
     <div className="filter-row">
      <label>Тип записей <select value={historyType} onChange={e=>{setHistoryType(e.target.value);setHistoryLimit(120)}}>
       <option value="all">Все</option><option value="decision">Решения</option><option value="finding">Факты</option>
      </select></label>
      <label>Поиск в истории <input type="search" value={historyQuery} aria-label="Поиск в истории"
       placeholder="Текст, источник или SHA" onChange={e=>{setHistoryQuery(e.target.value);setHistoryLimit(120)}}/></label>
     </div>
     {history.slice(0,historyLimit).map((entry:any)=><div className="history-entry" key={entry.kind+"-"+entry.id}>
      <small>{readable(entry.at)} · {entry.kind==="decision"?"Решение":"Заявление"}{entry.source?" · "+entry.source:""}</small>
      <p>{entry.text||"Без пояснения"}</p>
      {entry.revision&&<small className="mono" title={entry.revision}>SHA: {entry.revision}</small>}
     </div>)}
     {!history.length&&<Fallback message={(project.decisions.length+(project.findings||[]).length)>0?
      "По фильтру записей нет. Измените параметры, чтобы увидеть историю.":"История пуста. Добавьте решение или наблюдение."}/>}
     {history.length>0&&<p className="minor">Показано {Math.min(historyLimit,history.length)} из {history.length} записей. Всего в проекте: {project.decisions.length+(project.findings||[]).length}.</p>}
     {history.length>historyLimit&&<Action onClick={()=>setHistoryLimit(n=>Math.min(history.length,n+120))}>Показать ещё записи</Action>}
    </section>}
    {tab==="sources"&&<section className="surface"><div className="section-heading"><div><h2>Связанные источники</h2>
     <p>Только публичные сведения GitHub доступны напрямую. Иные источники остаются ссылками до подключения разрешённого адаптера.</p></div>
     <Action onClick={()=>openEditor("source")} primary>＋ Источник</Action></div>
     {(project.sources||[]).map((s:any)=>{
      const review=sourceReview(s,{limit:sourceRowLimits[s.id]||12});
      return <div className="atlas-source-review" key={s.id}>
       <div className="attention-row"><div><strong>{s.kind}: {s.locator}</strong>
        <small>{review.status} · Попытка: {review.lastAttempt||"не выполнялась"}</small>
        {review.lastSuccess&&<small>Последнее успешное наблюдение: {review.lastSuccess}</small>}
        {review.error&&<small className="atlas-source-error">{review.error}</small>}
       </div>
       {review.supported&&<Action onClick={()=>void syncPublic({projectId:project.id,sourceId:s.id})} disabled={busy}>Сверить</Action>}
       </div>
       {review.supported&&<div className="atlas-source-details">
        <p className="minor">{review.comparison==="COMPARABLE"
          ?`Изменения GitHub: ${review.total}. Изменено: ${review.totals.changed} · Добавлено: ${review.totals.added} · Удалено: ${review.totals.removed} · Переименовано: ${review.totals.renamed}.`
          :review.comparison==="BASELINE"?"Первое наблюдение: сравнение с предыдущей редакцией отсутствует."
          :"Сравнение редакций недоступно: отсутствуют два полных наблюдения."}
        </p>
        {review.previousObservation&&<p className="minor">Предыдущее наблюдение сохранено, но последняя сверка завершилась ошибкой.</p>}
        {review.rows.length>0&&<div className="table-scroll"><table className="atlas-source-table"><thead><tr>
         <th>Изменение</th><th>Объект</th><th>Предыдущий SHA</th><th>Новый SHA</th>
        </tr></thead><tbody>{review.rows.map((row:any,i:number)=><tr key={i}>
         <td>{row.kind}</td><td>{row.title}</td><td className="mono">{row.before||"—"}</td>
         <td className="mono">{row.after||"—"}</td>
        </tr>)}</tbody></table></div>}
        {review.remaining>0&&<Action onClick={()=>setSourceRowLimits(prev=>({...prev,[s.id]:Math.min(review.total,(prev[s.id]||12)+24)}))}>
         Показать ещё изменения ({review.remaining})
        </Action>}
        <p className="minor">Наблюдение источника не подтверждает готовность проекта, выполнение работы или приёмку результата.</p>
       </div>}
      </div>
     })}
     {!project.sources.length&&<Fallback message="Источников нет. Добавьте публичный репозиторий или ссылку на внешний источник."/>}
    </section>}
   </>}
   {savedRefPreview!==null&&savedRefPreview.generation===generation&&savedRefPreview.revision===String(data.revision)&&!dirty&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-saved-ref-title">
     <h2 id="atlas-saved-ref-title">{savedRefPreview.label}</h2>
     <p>Ссылка на сохранённую редакцию {savedRefPreview.revision} локального Atlas. Это не пакет .iwxa,
      не поручение и не подтверждение подключения Agent или Center.</p>
     <label className="atlas-ref-label">Скопируйте выбранный объект ProjectRef / WorkRef
      <textarea className="atlas-ref-text" aria-label="Сохранённая ссылка Atlas" readOnly
       rows={5} value={savedRefPreview.json} onFocus={event=>event.currentTarget.select()}/>
     </label>
     <p className="minor">Для привязки в Admin Center откройте тот же сохранённый JSON-портфель. Центр сверяет ID и редакцию файла; самостоятельный Atlas не подключается к организации автоматически.</p>
     <div className="button-row">
      <Action onClick={()=>void exportJson("center")} disabled={busy}>JSON для Admin Center</Action>
      <Action autoFocus onClick={()=>setSavedRefPreview(null)}>Закрыть</Action>
     </div>
    </section>
   </div>}
   {pendingImport!==null&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog atlas-import-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-import-preview-title">
     <div className="atlas-import-body">
      <h2 id="atlas-import-preview-title">Проверка импорта JSON 0.1</h2>
     <p>Это полная замена портфеля, не объединение. JSON проверен Atlas и ещё не изменил текущие данные.</p>
     <p className="minor">Редакция архива: {pendingImport.originalRevision}. Подтверждение изменит только черновик.</p>
     <div className="table-scroll"><table><thead><tr><th>Показатель</th><th>Сейчас</th><th>После импорта</th></tr></thead><tbody>
      {([["projects","Проекты"],["works","Работы"],["findings","Факты"],["decisions","Решения"],["changes","Предложения"],["sources","Источники"],["links","Связи проектов"]] as const).map(([key,label])=>
       <tr key={key}><td>{label}</td><td>{pendingImport.summary.current[key]}</td><td>{pendingImport.summary.incoming[key]}</td></tr>)}
     </tbody></table></div>
     <p><strong>Исключено:</strong> {pendingImport.summary.removed} проектов.
      <strong> Добавлено:</strong> {pendingImport.summary.added}.
      <strong> Совпадают по ID:</strong> {pendingImport.summary.matchingIds} (их данные заменятся содержимым архива).</p>
     {pendingImport.summary.removed>0&&<p className="atlas-schedule-warning">Будут исключены:
      {pendingImport.summary.removedExamples.join(", ")}
      {pendingImport.summary.removed>pendingImport.summary.removedExamples.length?" и другие.":"."}
     </p>}
     {pendingImport.summary.added>0&&<p className="minor">Новые проекты: {pendingImport.summary.addedExamples.join(", ")}
      {pendingImport.summary.added>pendingImport.summary.addedExamples.length?" и другие.":"."}</p>}
     {pendingImport.summary.incoming.projects===0&&<p className="atlas-schedule-warning">
      Внимание: архив пуст. После сохранения все текущие проекты исчезнут из активного портфеля.
     </p>}
     <p className="minor">После нативного сохранения прежняя редакция останется в разделе «Версии на диске».</p>
     {error&&<p className="alert error" role="alert">Не удалось подтвердить импорт: {error}</p>}
     </div>
     <div className="button-row atlas-import-actions">
      <Action autoFocus disabled={busy} onClick={()=>setPendingImport(null)}>Отменить импорт</Action>
      <Action primary disabled={busy} onClick={()=>void applyPendingImport()}>Заменить портфель в черновике</Action>
     </div>
    </section>
   </div>}
   {savedVersions!==null&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog atlas-history-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-versions-title">
     <div className="atlas-history-body">
      <h2 id="atlas-versions-title">Предыдущие редакции Atlas</h2>
      <p>Версии получены из нативного хранилища. Восстановление создаёт новую сохранённую редакцию,
       не изменяет архивный оригинал и сохраняет текущий портфель в истории.</p>
      {savedVersions.length?<div className="table-scroll"><table><thead><tr><th>Редакция</th><th>Проекты</th><th>Действие</th></tr></thead><tbody>
       {savedVersions.slice(0,nativeHistoryLimit).map(item=><tr key={item.generation}><td>{item.revision}</td><td>{item.projects}</td><td>
        <Action disabled={busy} onClick={()=>{setSelectedHistory(item);setError("")}}>
         {selectedHistory?.generation===item.generation?"Выбрано":"Выбрать редакцию"}</Action>
       </td></tr>)}
      </tbody></table></div>:<p className="minor">Предыдущих редакций ещё нет. Они появляются после повторных сохранений.</p>}
      {savedVersions.length>0&&<p className="minor">Показано {Math.min(savedVersions.length,nativeHistoryLimit)} из {savedVersions.length} сохранённых редакций.</p>}
      {savedVersions.length>nativeHistoryLimit&&<Action disabled={busy} onClick={()=>setNativeHistoryLimit(n=>Math.min(savedVersions.length,n+40))}>
       Показать ещё редакции ({savedVersions.length-nativeHistoryLimit})</Action>}
      {error&&<p className="alert error" role="alert">Не удалось восстановить: {error}</p>}
     </div>
     <div className="atlas-history-actions">
      {selectedHistory&&<p role="status">Выбрана редакция <strong>{selectedHistory.revision}</strong>
       ({selectedHistory.projects} проектов). Текущая редакция {data.revision}
       ({data.projects.length} проектов) останется в истории. Это замена портфеля, не объединение.</p>}
      <div className="button-row">
       <Action autoFocus disabled={busy} onClick={()=>{setSavedVersions(null);setSelectedHistory(null)}}>Закрыть</Action>
       {selectedHistory&&<Action primary disabled={busy} onClick={()=>void restoreHistoricalVersion(selectedHistory)}>
        Восстановить выбранную редакцию</Action>}
      </div>
     </div>
    </section>
   </div>}
   {closeGuard&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-close-title">
     <h2 id="atlas-close-title">Закрыть IWXA Atlas?</h2>
     <p>{busy?"Завершается запись или чтение. Закрытие пока недоступно.":
      editor?"Открытая форма ещё не применена. Вернитесь, примените её к черновику и сохраните.":
      dirty?"В портфеле есть изменения, которые пока не записаны на диск.":
      "Все изменения портфеля сохранены."}</p>
     <div className="button-row">
      <Action onClick={()=>setCloseGuard(false)} primary>Вернуться в Atlas</Action>
      {dirty&&!editor&&<Action onClick={()=>void saveAndClose()} disabled={busy}>Сохранить и закрыть</Action>}
      <Action onClick={()=>void closeWindow()} disabled={busy} title="Несохранённые изменения и открытая форма будут потеряны">Закрыть без сохранения</Action>
     </div>
    </section>
   </div>}
   <footer className="workspace-footer"><span>IWXA Atlas 0.3 · локальный черновик → нативная запись → readback</span>
    <span>Готовность определяется доказательствами и решениями, не количеством коммитов.</span></footer>
  </main>
  {inspector&&<aside className="inspector">
   {editor?<EditorPanel key={editor.action} editor={editor} onSubmit={submit}
    onCancel={cancelEditor} onDirtyChange={changed=>{editorDirtyRef.current=changed}} busy={busy}/>:
   <section><div className="section-heading"><h2>Инспектор</h2><button className="icon-button" aria-label="Скрыть инспектор" onClick={()=>setInspector(false)}>×</button></div>
    <div className="inspector-block"><small>Текущий контекст</small><strong>{project?.name||"Портфель проектов"}</strong>
     <p>{project?.goal||"Выберите проект для работы с планом, доказательствами и изменениями."}</p></div>
    <div className="inspector-block"><small>Состояние данных</small><Badge tone={editor||dirty?"warning":persisted?"good":"neutral"}>{editor?"Форма не применена":dirty?"Только в памяти":persisted?"Сохранено на диск":"Ещё не сохранялся"}</Badge>
     <p>Редакция: {data.revision}</p><p>Хранилище: нативное Atlas</p>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy||!!editor}>Сохранить редакцию</Action></div>
    {project&&<div className="inspector-block"><small>План проекта</small><p>Начало: {readable(project.startDate)}</p>
     <p>Контрольный срок: {readable(project.dueDate)}</p>
     <p>Расчётный финиш: {projectedFinishLabel(projected)}</p>
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
 const [projectLimit,setProjectLimit]=useState(40);
 const [resourceLimit,setResourceLimit]=useState(30);
 let result:any;
 try{result=previewPlanAmendment(state,projectId,changeId)}catch(e){
  return <p className="error" role="alert">Сценарий не может быть применён: {deepFreezeError(e)}</p>
 }
 return <div className="forecast">
  <h4>Последствия относительно текущего плана</h4>
  <p className="minor">Это предварительная оценка, не разрешение на изменение. Проектов по цепочке: {result.affected}.
   Строк последствий: {result.rows.length}. Ресурсов: {result.resourceRows.length}.</p>
  <div className="table-scroll"><table><thead><tr><th>Проект</th><th>Финиш до</th><th>Финиш после</th><th>Риск срока до/после</th></tr></thead>
   <tbody>{result.rows.slice(0,projectLimit).map((r:any)=><tr key={r.id}><td>{r.name}</td>
    <td>{readable(r.beforeFinish)}</td><td>{readable(r.afterFinish)}</td>
    <td>{r.beforeSlip??"?"} / {r.afterSlip??"?"}</td></tr>)}</tbody></table></div>
  <p className="minor">Показано {Math.min(projectLimit,result.rows.length)} из {result.rows.length} проектов.</p>
  {result.rows.length>projectLimit&&<Action onClick={()=>setProjectLimit(n=>Math.min(result.rows.length,n+40))}>
   Показать ещё проекты ({result.rows.length-projectLimit})</Action>}
  {result.resourceRows.length>0&&<div className="table-scroll"><h4>Последствия для ресурсов</h4>
   <table><thead><tr><th>Ресурс</th><th>Максимум до / после</th><th>Дни перегрузки</th></tr></thead><tbody>
    {result.resourceRows.slice(0,resourceLimit).map((r:any)=><tr key={r.id}><td>{r.label}</td><td>{r.beforeMaxLoad}% / {r.afterMaxLoad}%</td>
     <td>{r.beforeOverload} / {r.afterOverload}</td></tr>)}</tbody></table>
   <p className="minor">Показано {Math.min(resourceLimit,result.resourceRows.length)} из {result.resourceRows.length} ресурсов.</p>
   {result.resourceRows.length>resourceLimit&&<Action onClick={()=>setResourceLimit(n=>Math.min(result.resourceRows.length,n+30))}>
    Показать ещё ресурсы ({result.resourceRows.length-resourceLimit})</Action>}
  </div>}
  {canApply&&<Action onClick={onApply} primary>Применить утверждённый план</Action>}
 </div>;
}
export {AtlasRenderBoundary};

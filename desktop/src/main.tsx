import React,{useEffect,useMemo,useRef,useState} from "react";
import atlasPackage from "../package.json";
import {invoke as nativeInvoke,isTauri} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {empty,deserialize,serialize,editItem,removeStage,removeItem,disconnect,
 upsertCalendarDraft,removeCalendarDraft,resolveCalendarDraftMissingWorkRefs,
 createWorkCalendar,reviseWorkCalendar,removeProject as dropProject} from "../../src/core.mjs";
import {removePortfolioLink} from "../../src/portfolio.mjs";
import {editorSpec,applyEditor,editorSelectionFields,filterWorkPickerOptions,PROJECT_TYPE_LABELS} from "../../src/editor.mjs";
import {compareProject,decideChange} from "../../src/trace.mjs";
import {projectImpact,projectNextStep} from "../../src/impact.mjs";
import {buildPortfolioCommand,filterPortfolioCommand} from "../../src/portfolio-command.mjs";
import {buildPortfolioSearchIndex,filterPortfolioSearch,portfolioSearchReason,portfolioSearchWorkTarget} from "../../src/portfolio-search.mjs";
import {realityOverview,workObservationIndex} from "../../src/reality-overview.mjs";
import {responseState} from "../../src/response.mjs";
import {scheduleProject,scheduleChangeSummary,scheduleDeadlineExplanations,criticalPathFocus,forecastDependencyRemoval,workDependencyOverview,filterWorkRowsByDependencies} from "../../src/planning.mjs";
import {previewWorkScheduleEdit} from "../../src/work-schedule-preview.mjs";
import {startWorkCorrection,continueWorkCorrection} from "../../src/work-correction-flow.mjs";
import {portfolioSchedule,projectedFinishLabel} from "../../src/portfolio-schedule.mjs";
import {capturePlanBaseline,comparePlanBaseline} from "../../src/plan-baseline.mjs";
import {projectScreenSchedule} from "../../src/project-schedule-view.mjs";
import {portfolioResources} from "../../src/portfolio-resources.mjs";
import {planReviewQueue,planReviewAction,planProposalAction} from "../../src/plan-review.mjs";
import {revisionReview,recheckAction} from "../../src/revision-review.mjs";
import {previewPlanAmendment,applyPlanAmendment,removePlanAmendment} from "../../src/plan-amendment.mjs";
import {planPublicRefresh,reconcilePublicSources,publicSourceQueue} from "../../src/public-refresh.mjs";
import {sourceReview,sourceFreshnessLabel} from "../../src/source-review.mjs";
import {githubPortfolioCatalog,createProjectFromGitHubCatalog,githubPortfolioOverview,
 filterGithubPortfolioOverview} from "../../src/ecosystem.mjs";
import {ProjectGantt,ProjectDependencyDiagram,PortfolioNetworkMap} from "./ProjectVisuals";
import {AtlasDashboard} from "./AtlasDashboard";
import {AtlasSettings} from "./AtlasSettings";
import {AtlasInspectorPreview} from "./AtlasInspectorPreview";
import {AtlasChromeTopbar,AtlasChromeRail,AtlasGlyph} from "./AtlasChrome";
import {ProjectConnect} from "./ProjectConnect";
import {ProjectOrganizationGuide} from "./ProjectOrganizationGuide";
import {projectSourcePlanWorkContext,projectWorkTableSearch} from "../../src/project-organization.mjs";
import {repoName} from "../../src/github-public.mjs";
import {applyPublicProjectPreview} from "../../src/project-onboarding.mjs";
import {prepareImportedSnapshot} from "./import-snapshot.mjs";
import {buildIwxaPortfolio,readIwxaPortfolio,toBase64,fromBase64} from "./iwxa-portfolio.mjs";
import {commitWithReadback,readSavedSnapshotForReference,readExternalAtlasUpdate} from "./native-save.mjs";
import {projectHistoryRows} from "./history-view.mjs";
import {sortWorkRows,firstSortedMatchingWorkId,deadlineFocusRows,filterWorkRowsByObservation} from "./work-sorting.mjs";
import {createAtlasSavedRef} from "../../src/project-host-port.mjs";
import {atlasT3DecisionSummary,atlasT3RecordedWorkLinks,
 atlasT3PortableResultText,verifiedAtlasSignedFilePreview}
 from "../../src/atlas-t3-native-recipient.mjs";
import {findConfirmedAtlasT3Decision} from "../../src/atlas-t3-confirmed-projection.mjs";
import {invokeAtlasHost,type AtlasEmbeddedHost,
 type AtlasT3SignedFilePreview} from "./embedded-host";

// Show the same product version that was packaged in Tauri, without leaking
// a previous release's branding into a development installation.
const atlasVersionLabel=atlasPackage.version.split("-")[0]+
 (atlasPackage.version.includes("-")?" (разработка)":"");
const workDurationLabel=(work:{estimateDays?:number;durationUnit?:string})=>
 String(work.estimateDays??1)+(work.durationUnit==="working_days"?" раб. дн.":" кал. дн.");
type Atlas = any;
type HistoryEntry = {generation:string;revision:number;projects:number};
type ImportPreview = {snapshot:Atlas;originalRevision:number;expectedGeneration:string;startedWith:Atlas;summary:any;format:"json"|"iwxa"};
type OpenResult = {generation:string;snapshot:Atlas;restoredFromBackup:boolean;needsConfirmation:boolean};
type Field = {name:string;label:string;value?:string;required?:boolean;type:string;searchable?:boolean;options?:{value:string;label:string}[]};
type Editor = {action:string;spec:{title:string;hint?:string;fields:Field[]}};
type SavedRefPreview = {label:string;json:string;revision:string;generation:string};
type Tab = "overview"|"work"|"board"|"timeline"|"graph"|"reality"|"changes"|"resources"|"history"|"sources";
const tabs:{key:Tab;title:string}[]=[
 {key:"overview",title:"Обзор"},{key:"work",title:"Таблица"},{key:"board",title:"Доска"},
 {key:"timeline",title:"График"},{key:"graph",title:"Зависимости"},
 {key:"reality",title:"План / факт"},{key:"changes",title:"Изменения"},
 {key:"resources",title:"Ресурсы"},{key:"history",title:"История"},{key:"sources",title:"Источники"},
];
const primaryTabKeys:Tab[]=["overview","work","timeline","reality"];
const statuses:any={planned:"Запланирован",active:"В работе",paused:"Приостановлен",
 completed:"Завершён (заявлено)",cancelled:"Отменён"};
const workStatuses:any={todo:"Запланирована",in_progress:"В работе",blocked:"Заблокирована",done:"Выполнена (заявлено)"};
const evidence:any={unknown:"Не установлено",conflict:"Противоречия",stale:"Требует сверки",gap_reported:"Заявлено отсутствие",
 partial_reported:"Заявлено частично",implemented_claim:"Заявлена реализация",test_claim:"Заявлено тестирование",
 acceptance_claim:"Заявлена приёмка"};
const decisionStatus:any={proposed:"Предложено",approved:"Утверждено",in_progress:"В работе",
 implemented:"Реализовано (заявлено)",deferred:"Отложено",rejected:"Отклонено"};
const sourceNames:Record<string,string>={github:"GitHub",github_owner:"GitHub (владелец)",gitlab:"GitLab",forgejo:"Forgejo",gitea:"Gitea",obsidian:"Obsidian",anytype:"Anytype",jira:"Jira",file:"Файл",other:"Другой источник"};
const planReviewStatus:Record<string,string>={
 needs_decision:"Ожидает решения",deferred:"Решение отложено",
 needs_proposal:"Нужно новое предложение",source_hold:"Обновить Git-источник",
 proposal_open:"Предложение на рассмотрении",plan_pending:"План утверждён, требуется применение"
};
function readable(date?:string|null){return date?date.slice(0,10):"Не задано"}
function workFolderUrl(project:any,work:any){
 if(!work.sourcePath||!/^[a-f0-9]{40}$/i.test(work.sourceRevision||""))return null;
 const source=project.sources?.find((entry:any)=>entry.id===work.sourceId&&entry.kind==="github");
 if(!source)return null;
 try{
  return "https://github.com/"+repoName(source.locator)+"/tree/"+work.sourceRevision+"/"+
   work.sourcePath.split("/").map(encodeURIComponent).join("/");
 }catch{return null}
}
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
function Action({children,onClick,primary=false,disabled=false,title,autoFocus=false,ariaLabel}:{children:React.ReactNode;onClick:()=>void;primary?:boolean;disabled?:boolean;title?:string;autoFocus?:boolean;ariaLabel?:string}){
 return <button type="button" disabled={disabled} title={title} aria-label={ariaLabel} autoFocus={autoFocus} className={"action-button"+(primary?" primary":"")} onClick={onClick}>{children}</button>;
}
function Metric({value,label,note}:{value:number|string;label:string;note?:string}){
 return <div className="metric"><small>{label}</small><strong>{value}</strong>{note&&<small>{note}</small>}</div>;
}
function Fallback({message}:{message:string}){return <div className="empty">{message}</div>}
type WorkLinkPreview={predecessorTotal:number;pendingTotal:number;pendingWorks:{id:string;title:string}[];successorTotal:number};
function WorkDependencyHint({info,onOpenWork}:{info?:WorkLinkPreview|null;onOpenWork:(id:string)=>void}){
 if(!info||(!info.predecessorTotal&&!info.successorTotal))return null;
 const more=info.pendingTotal-info.pendingWorks.length;
 const first=info.pendingTotal>0?
  "Не отмечены выполненными: "+info.pendingWorks.map(work=>work.title).join(", ")+(more>0?" и ещё "+more:""):
  info.predecessorTotal>0?"Предшествующие отмечены выполненными: "+info.predecessorTotal:"";
 const later=info.successorTotal>0?"От этой работы зависят: "+info.successorTotal:"";
 return <div className="atlas-work-dependency-hint" role="group"
   aria-label={[first,later].filter(Boolean).join(". ")}>
  {info.pendingTotal>0?<span className="atlas-work-dependency-pending">
   Не отмечены выполненными:{" "}
   {info.pendingWorks.map((work,i)=><React.Fragment key={work.id}>
    {i>0?", ":null}<button type="button" className="text-link atlas-work-predecessor-link"
     aria-label={"Открыть предшествующую работу "+work.title}
     onClick={()=>onOpenWork(work.id)}>{work.title}</button>
   </React.Fragment>)}{more>0?" и ещё "+more:null}
  </span>:first&&<span>{first}</span>}
  {later&&<span>{later}</span>}
 </div>;
}
function EditorPanel({editor,onSubmit,onCancel,onDirtyChange,busy,project,plan,correctionBaseline,calendarLibrary}:{
 editor:Editor;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;
 onCancel:()=>void;onDirtyChange:(changed:boolean)=>void;busy:boolean;
 project:Atlas|null;plan:any|null;correctionBaseline:any|null;calendarLibrary:any[]
}){
 const [fields,setFields]=useState<Record<string,string>>({});
 const [workQuery,setWorkQuery]=useState("");
 const searchableField=editor.spec.fields.find((f:any)=>f.searchable);
 const workResults=useMemo(()=>searchableField?
  filterWorkPickerOptions(searchableField.options||[],workQuery,
   fields[searchableField.name]??""):null,
  [searchableField,workQuery,fields]);
 // CPM is recalculated only when the plan, selected work, duration or date
 // changes. Typing in unrelated text fields never triggers this projection.
 const workDraftPreview=useMemo(()=>{
  if(!editor.action.startsWith("work:")||!project||!plan||
     fields.estimateDays===undefined||fields.dueDate===undefined)return null;
  return previewWorkScheduleEdit(project,editor.action.slice(5),
   {estimateDays:fields.estimateDays,dueDate:fields.dueDate,
    durationUnit:fields.durationUnit,calendarBasis:fields.calendarBasis},
   plan,correctionBaseline,{calendarLibrary});
 },[editor.action,project,plan,fields.estimateDays,fields.dueDate,
    fields.durationUnit,fields.calendarBasis,correctionBaseline,calendarLibrary]);
 useEffect(()=>{
  setFields(Object.fromEntries(editor.spec.fields.map(f=>[f.name,String(f.value??"")])));
  setWorkQuery("");
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
   <div className="atlas-editor-fields" role="region" aria-label="Поля редактора" tabIndex={0}>
   {editor.spec.fields.map((f,index)=>f.searchable?
    <div className="field atlas-work-picker" role="group" aria-label={f.label} key={f.name}>
     <label htmlFor="atlas-work-picker-query">Найти работу по названию</label>
     <input id="atlas-work-picker-query" type="search"
      aria-label="Найти существующую работу" placeholder="Название или этап"
      autoFocus={index===0} value={workQuery}
      onChange={event=>setWorkQuery(event.target.value)}/>
     <label htmlFor="atlas-work-picker-select">{f.label}</label>
     <select id="atlas-work-picker-select" name={f.name} aria-label={f.label}
      required={f.required!==false} value={fields[f.name]??""}
      onChange={event=>updateFields(editorSelectionFields(editor.spec,fields,f.name,event.target.value))}>
      {(workResults?.options||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
     </select>
     <small className="atlas-work-picker-status" role="status">
      {workQuery.trim()?
       (workResults?.total?("Найдено: "+workResults.total+
        ". Показано: "+workResults.shown+"."):"Совпадений нет. Уточните название."):
       ("Показаны первые "+(workResults?.shown||0)+" из "+(workResults?.total||0)+" работ.")}
      {(workResults?.hidden||0)>0?" Уточните поиск для выбора остальных.":""}
     </small>
    </div>:
    <label className="field" key={f.name}>{f.label}
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
    {f.name==="calendarBasis"&&fields.durationUnit==="working_days"&&
     <small className="atlas-work-calendar-guidance" role="status" aria-live="polite">
      {fields.calendarBasis
       ?"Указанная редакция календаря применяется при расчёте рабочих дней."
       :"Выберите редакцию календаря. Без неё расчёт рабочих дней нельзя сохранить."}
     </small>}
   </label>)}
   </div>
   {workDraftPreview?.kind==="changed"&&
    <div className="atlas-work-draft-preview" role="status"
     aria-label="Предварительный расчёт изменения работы">
     <strong>Если применить эти значения</strong>
     <p>План проекта: было {workDraftPreview.beforeDays} дн.,
      станет {workDraftPreview.afterDays} дн.
      {workDraftPreview.afterDays!==workDraftPreview.beforeDays?
       " Сдвиг "+(workDraftPreview.afterDays>workDraftPreview.beforeDays?"+":"")+
        (workDraftPreview.afterDays-workDraftPreview.beforeDays)+" дн.":""}
     </p>
     <p>Финиш выбранной работы: было {workDraftPreview.oldFinish||
       "через "+workDraftPreview.oldFinishOffset+" дн. от начала"},
      станет {workDraftPreview.newFinish||
       "через "+workDraftPreview.newFinishOffset+" дн. от начала"}.</p>
     <p>Затронуто работ: {workDraftPreview.affectedTotal}.
      {workDraftPreview.delayedTotal>0?" Позже: "+workDraftPreview.delayedTotal+".":""}
      {workDraftPreview.earlierTotal>0?" Раньше: "+workDraftPreview.earlierTotal+".":""}
      {workDraftPreview.criticalChangedTotal>0?
       " Изменение критического пути: "+workDraftPreview.criticalChangedTotal+".":""}
     </p>
     {workDraftPreview.oldDueDate!==workDraftPreview.dueDate&&
      <p>Контрольный срок: было {workDraftPreview.oldDueDate||"не задан"},
       станет {workDraftPreview.dueDate||"не задан"}.
       {!workDraftPreview.dueDate?" Соблюдение снятого срока больше не проверяется.":""}</p>}
     {workDraftPreview.willBeLate===true&&
      <p className="atlas-schedule-warning">Расчётный финиш работы позже контрольного срока.</p>}
     {workDraftPreview.willBeLate===null&&workDraftPreview.dueDate&&
      <p className="minor">Без даты начала проекта нельзя проверить соблюдение календарного срока.</p>}
     {workDraftPreview.examples.length>0&&
      <details className="atlas-work-draft-details">
       <summary>Изменения по работам ({workDraftPreview.affectedTotal})</summary>
       <ul>{workDraftPreview.examples.map((row:any)=>
        <li key={row.id}>{row.title}: {row.shiftDays!==0?
         "сдвиг "+(row.shiftDays>0?"+":"")+row.shiftDays+" дн.":"без сдвига финиша"}
         {row.dueDateChanged?", контрольный срок изменён":""}
         {row.criticalChanged?", положение на критическом пути изменилось":""}
        </li>)}</ul>
       {workDraftPreview.affectedTotal>workDraftPreview.examples.length&&
        <small>Показаны первые {workDraftPreview.examples.length} затронутых работ.</small>}
      </details>}
     <small>Предварительный CPM учитывает календарные и рабочие дни по выбранным календарям, без выравнивания ресурсов.
      Изменения ещё не применены к черновику и не сохранены на диск.</small>
    </div>}
   {workDraftPreview?.cumulative&&
    <div className="atlas-work-cumulative-preview" role="group"
     aria-label="Общий итог последовательных исправлений">
     <strong>От плана до первой правки</strong>
     <p>Продолжительность: было {workDraftPreview.cumulative.beforeDays} дн.,
      станет {workDraftPreview.cumulative.afterDays} дн.
      {" "}Останутся изменения по {workDraftPreview.cumulative.affectedTotal} работам.
      {workDraftPreview.cumulative.criticalChangedTotal>0?
       " Изменён критический путь у "+workDraftPreview.cumulative.criticalChangedTotal+" работ.":""}
     </p>
     <small>Общий итог учитывает предыдущие исправления
      {workDraftPreview.kind==="changed"?" и предложенную правку":""}.
      Данные не записаны на диск.</small>
    </div>}
   {workDraftPreview?.kind==="invalid"&&
    <p className="atlas-work-draft-invalid" role="status">{workDraftPreview.reason}</p>}
   <div className="form-footer"><Action onClick={onCancel}>Отмена</Action><button className="action-button primary" disabled={busy} type="submit" title="Ctrl+Enter">{editor.action.startsWith("folder-work:")?"Добавить работу":"Применить к черновику"}</button></div>
  </form>
 </section>
}
export function AtlasWorkspace({host}:{host?:AtlasEmbeddedHost}){
 const invoke=<T,>(command:string,args?:Record<string,unknown>):Promise<T>=>host
  ? invokeAtlasHost<T>(host,command,args)
  : nativeInvoke<T>(command,args);
 const embedded=Boolean(host);
 const rootRef=useRef<HTMLDivElement|null>(null);
 const fileMenuRef=useRef<HTMLDetailsElement|null>(null);
 const signedResultFileInput=useRef<HTMLInputElement|null>(null);
 const viewMenuRef=useRef<HTMLDetailsElement|null>(null);
 const relationSectionRef=useRef<HTMLElement|null>(null);
 const requirementCardRef=useRef<HTMLElement|null>(null);
 const changeCardRef=useRef<HTMLDivElement|null>(null);
 const sourceJumpRef=useRef<HTMLDivElement|null>(null);
 const workReturnRef=useRef<HTMLButtonElement|null>(null);
 // UI-only return point. It is never serialized or shared with another host.
 const workNavigationContext=useRef<{
  projectId:string;workId:string;revision:number;query:string;
  filter:string;targetFilter:string;observationFilter:string;
  dependencyFilter:string;deadlineFilter:string;criticalOnly:boolean;
  impactOnly:boolean;sort:string;limit:number;
 }|null>(null);
 const logoUrl=host?.assetUrl??"/atlas-mark.svg";
 const [data,setData]=useState<Atlas>(()=>empty());
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const [generation,setGeneration]=useState("none");
 const [active,setActive]=useState<string|null>(null),[tab,setTab]=useState<Tab>("overview");
 const [search,setSearch]=useState(""),[editor,setEditor]=useState<Editor|null>(null);
 // Standalone v6 chrome; embedded T3 keeps its already-qualified host surface.
 const [homeOpen,setHomeOpen]=useState(()=>!host);
 const [settingsOpen,setSettingsOpen]=useState(false);
 const [settingsSection,setSettingsSection]=useState<"appearance"|"data">("appearance");
 const [navPanelOpen,setNavPanelOpen]=useState(()=>Boolean(host)||window.innerWidth>=1030);
 // Preserve a useful central workspace on compact Windows even after resize.
 useEffect(()=>{
  if(embedded)return;
  const compact=()=>{if(window.innerWidth<1000)setNavPanelOpen(false)};
  window.addEventListener("resize",compact);
  return ()=>window.removeEventListener("resize",compact);
 },[embedded]);
 const [inspectorWidth,setInspectorWidth]=useState(()=>{
  try{const n=Number(localStorage.getItem("iwxa.atlas.ui.inspector.width.v1"));
   return Number.isFinite(n)&&n>=300&&n<=760?n:390;}catch{return 390}
 });
 type AtlasLocation={projectId:string|null;tab:Tab;home:boolean;settings:boolean};
 const routeHistory=useRef<AtlasLocation[]>([]);
 const routeCursor=useRef(-1);
 const routeSuppress=useRef(false);
 const [routeControls,setRouteControls]=useState({back:false,forward:false});
 const [portfolioStatus,setPortfolioStatus]=useState("all");
 const [connectOpen,setConnectOpen]=useState(false);
 const [ecosystemOwner,setEcosystemOwner]=useState("all");
 const [ecosystemQuery,setEcosystemQuery]=useState("");
 const [ecosystemLimit,setEcosystemLimit]=useState(36);
 const [ownerCatalogQuery,setOwnerCatalogQuery]=useState<Record<string,string>>({});
 const [ownerCatalogLimit,setOwnerCatalogLimit]=useState<Record<string,number>>({});
 const [attentionFilter,setAttentionFilter]=useState("all");
 const [attentionQuery,setAttentionQuery]=useState("");
 const [attentionLimit,setAttentionLimit]=useState(8);
 const [showProjectRelations,setShowProjectRelations]=useState(false);
 const [relationLimit,setRelationLimit]=useState(12);
 const [relationJump,setRelationJump]=useState<string|null>(null);
 const [requirementJump,setRequirementJump]=useState<{projectId:string;targetId:string}|null>(null);
 const [changeJump,setChangeJump]=useState<{projectId:string;changeId:string}|null>(null);
 const [boardLimits,setBoardLimits]=useState<Record<string,number>>({});
 const [dragWorkId,setDragWorkId]=useState<string|null>(null);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const [inspector,setInspector]=useState(()=>!host&&window.innerWidth>1220),[recovery,setRecovery]=useState(false);
 const [closeGuard,setCloseGuard]=useState(false);
 const allowCloseRef=useRef(false);
 const saved=useRef<string>(snapshotText(empty()));
 const latestSnapshot=useRef<Atlas>(data);latestSnapshot.current=data;
 const [refreshReport,setRefreshReport]=useState<any>(null);
 const [forecastId,setForecastId]=useState<string|null>(null);
 const [workFilter,setWorkFilter]=useState("all"),[workQuery,setWorkQuery]=useState("");
 const [workTargetFilter,setWorkTargetFilter]=useState("all");
 const [workDependencyFilter,setWorkDependencyFilter]=useState("all");
 const [workDeadlineFilter,setWorkDeadlineFilter]=useState("all");
 const [workCriticalOnly,setWorkCriticalOnly]=useState(false);
 const [workObservationFilter,setWorkObservationFilter]=useState("all");
 const [workImpactOnly,setWorkImpactOnly]=useState(false);
 const [workHistoryLimits,setWorkHistoryLimits]=useState<Record<string,number>>({});
 const [workSort,setWorkSort]=useState("title");
 const [portfolioLimit,setPortfolioLimit]=useState(150);
 const [sidebarLimit,setSidebarLimit]=useState(120);
 const [workLimit,setWorkLimit]=useState(200);
 const [realityLimit,setRealityLimit]=useState(8);
 const [showDetails,setShowDetails]=useState(false);
 const [historyQuery,setHistoryQuery]=useState("");
 const [historyType,setHistoryType]=useState("all");
 const [historyLimit,setHistoryLimit]=useState(120);
 const [savedVersions,setSavedVersions]=useState<HistoryEntry[]|null>(null);
 const [nativeHistoryLimit,setNativeHistoryLimit]=useState(40);
 const [selectedHistory,setSelectedHistory]=useState<HistoryEntry|null>(null);
 const [pendingImport,setPendingImport]=useState<ImportPreview|null>(null);
 const [signedResultPreview,setSignedResultPreview]=useState<
  (AtlasT3SignedFilePreview&{archive:Uint8Array})|null>(null);
 // Never redispatch the same selected file after a possibly committed native CAS.
 // The original recipient and Atlas can still recover via readback.
 const [signedFileDispatchAttempted,setSignedFileDispatchAttempted]=useState(false);
 const signedFileDispatchAttemptedRef=useRef(false);
 const [savedRefPreview,setSavedRefPreview]=useState<SavedRefPreview|null>(null);
 const [t3AgentTask,setT3AgentTask]=useState<{projectId:string;workId:string;taskId:string}|null>(null);
 const savedRefOpenRef=useRef(false);savedRefOpenRef.current=savedRefPreview!==null;
 const savedVersionsOpenRef=useRef(false);savedVersionsOpenRef.current=savedVersions!==null;
 const pendingImportOpenRef=useRef(false);pendingImportOpenRef.current=pendingImport!==null;
 const signedResultOpenRef=useRef(false);signedResultOpenRef.current=signedResultPreview!==null;
 const signedFileOwnerAvailable=Boolean(host?.t3?.inspectSignedFile&&
  host?.t3?.receiveSignedFile&&host?.t3?.readbackSignedFile);
 const [resourceLimit,setResourceLimit]=useState(40);
 const [reviewLimit,setReviewLimit]=useState(20);
 const [sourceLimit,setSourceLimit]=useState(15);
 const [sourceRowLimits,setSourceRowLimits]=useState<Record<string,number>>({});
 const [sourceJump,setSourceJump]=useState<{projectId:string;workId:string;query:string;origin:"overview"|"work"|"graph";graphOrigin:"overview"|"work"|"board"|null}|null>(null);
 const [mapSearchReturn,setMapSearchReturn]=useState<{workId:string;query:string}|null>(null);
 const [graphJump,setGraphJump]=useState<{projectId:string;workId:string;query:string;origin:"overview"|"work"|"board"}|null>(null);
 const [graphPreviewFrom,setGraphPreviewFrom]=useState<string|null>(null);
 const [workReturnId,setWorkReturnId]=useState<string|null>(null);
 const [recentWorkId,setRecentWorkId]=useState<string|null>(null);
 const [recentWorkKind,setRecentWorkKind]=useState<"created"|"dependency"|"adjusted">("created");
 const [recentPlanBefore,setRecentPlanBefore]=useState<
  ReturnType<typeof startWorkCorrection>|null
 >(null);
 const [recheckLimit,setRecheckLimit]=useState(25);
 const [controlPlanId,setControlPlanId]=useState<string|null>(null);
 const [controlPlanLimit,setControlPlanLimit]=useState(100);
 const [controlPlanOnlyChanges,setControlPlanOnlyChanges]=useState(true);
 const [previewWorkRequest,setPreviewWorkRequest]=useState<{id:string;serial:number}|null>(null);
 const project=data.projects.find((p:any)=>p.id===active)||null;
 const t3WorkLinks=useMemo(()=>atlasT3RecordedWorkLinks(project),[project]);
 const recentWork=recentWorkId?project?.items.find((item:any)=>item.id===recentWorkId):null;
 const recentStage=recentWork?.stageId?
  project?.stages.find((stage:any)=>stage.id===recentWork.stageId):null;
 const sourceJumpContext=useMemo(()=>sourceJump&&project&&
  sourceJump.projectId===project.id?
   projectSourcePlanWorkContext(project,sourceJump.workId):null,[project,sourceJump]);
 const graphFocusWork=useMemo(()=>graphJump&&project&&graphJump.projectId===project.id?
  project.items.find((work:any)=>work.id===graphJump.workId)||null:null,[project,graphJump]);
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
 const ecosystem=useMemo(()=>githubPortfolioOverview(data),[data]);
 const ecosystemRows=useMemo(()=>filterGithubPortfolioOverview(ecosystem,{
  owner:ecosystem.owners.includes(ecosystemOwner)?ecosystemOwner:"all",query:ecosystemQuery
 }),[ecosystem,ecosystemOwner,ecosystemQuery]);
 const rechecks=useMemo(()=>revisionReview(data),[data]);
 // The full review queue remains available in large portfolios. Rendering
 // is paged; records never disappear silently after an arbitrary first page.
 const reviewRows=useMemo(()=>reviews.rows.filter((r:any)=>
  ["needs_decision","deferred","needs_proposal","source_hold","proposal_open","plan_pending"].includes(r.state)),[reviews]);
 const recheckRows=useMemo(()=>active?rechecks.rows.filter((r:any)=>r.projectId===active):[],[rechecks,active]);
 const history=useMemo(()=>project?projectHistoryRows(project,{kind:historyType,query:historyQuery}):[],
  [project,historyType,historyQuery]);
 const projected=active?dates.byId.get(active):null;
 // Preserve the local plan for Work edits and show the same forecast as the
 // portfolio on all read-only project calendar screens.
 const plannedPlan=useMemo(()=>project?scheduleProject(project,{
  calendarLibrary:data.calendarLibrary??[]
 }):null,[project,data.calendarLibrary]);
 const scheduleView=useMemo(()=>project?projectScreenSchedule(project,projected,{
  calendarLibrary:data.calendarLibrary??[],plannedPlan
 }):null,[project,projected,data.calendarLibrary,plannedPlan]);
 const plan=scheduleView?.display??null;
 const planRowsById=useMemo(()=>new Map<string,any>((plan?.rows||[]).map((row:any)=>[String(row.id),row])),[plan]);
 const criticalWorkIds=useMemo(()=>new Set<string>((plan?.criticalIds||[]).map(String)),[plan]);
 const criticalFocus=useMemo(()=>plan?criticalPathFocus(plan):null,[plan]);
 const graphFocusPredecessors=useMemo(()=>{
  if(!graphFocusWork||!project)return [];
  const byId=new Map<string,any>(project.items.map((w:any)=>[String(w.id),w]));
  const finishes=new Map<string,number>((plan?.rows||[]).map((row:any)=>[String(row.id),Number(row.earlyFinish)]));
  return project.dependencies.filter((link:any)=>link.to===graphFocusWork.id)
   .map((link:any)=>byId.get(String(link.from))).filter(Boolean)
   .sort((a:any,b:any)=>(finishes.get(b.id)??0)-(finishes.get(a.id)??0)||
    String(a.title).localeCompare(String(b.title),"ru"));
 },[project,graphFocusWork,plan]);
 const graphSelectedPredecessor=graphFocusPredecessors.find((w:any)=>
  w.id===graphPreviewFrom)||graphFocusPredecessors[0]||null;
 useEffect(()=>setGraphPreviewFrom(null),[project?.id,graphFocusWork?.id]);
 const graphRemovalPreview=useMemo(()=>{
  if(!project||!plan||!graphFocusWork||!graphSelectedPredecessor)return null;
  return forecastDependencyRemoval(project,plan,graphSelectedPredecessor.id,graphFocusWork.id,{
   calendarLibrary:data.calendarLibrary??[],
   startDate:scheduleView?.mode==="portfolio_forecast"?scheduleView.displayStart:undefined});
 },[project,plan,graphFocusWork,graphSelectedPredecessor,data.calendarLibrary,scheduleView]);
 // The table and Gantt share the canonical project schedule. Keep an indexed
 // view for large projects rather than scanning 1,200+ CPM rows per work card.
 const overdueWorkFinishes=useMemo(()=>new Map<string,string>(
  (plan?.rows||[]).filter((row:any)=>row.dueDate&&row.finishDate&&row.finishDate>row.dueDate)
   .map((row:any)=>[String(row.id),String(row.finishDate)] as [string,string])),[plan]);
 const deadlineRiskDetails=useMemo(()=>scheduleDeadlineExplanations(plan||{rows:[]}),[plan]);
 const overdueHighlights=useMemo(()=>project?
  deadlineFocusRows(project.items,deadlineRiskDetails):[],[project,deadlineRiskDetails]);
 const recentPlanRow=recentWork&&plannedPlan?plannedPlan.rows.find((row:any)=>row.id===recentWork.id):null;
 const planBeforeRecent=recentWork&&recentPlanBefore&&
  recentPlanBefore.workId===recentWork.id&&recentPlanBefore.revision===data.revision?
  recentPlanBefore.days:null;
 const recentScheduleEffect=recentWork&&recentPlanBefore&&
  recentPlanBefore.workId===recentWork.id&&recentPlanBefore.revision===data.revision?
  recentPlanBefore.change:null;
 // A cumulative forecast is valid only for an affected work from the
 // current series, project and revision.
 const correctionBaseline=useMemo(()=>{
  if(!editor?.action.startsWith("work:")||!project||!recentPlanBefore||
     recentPlanBefore.projectId!==project.id||
     recentPlanBefore.revision!==data.revision||
     recentPlanBefore.workId!==recentWorkId)return null;
  return recentPlanBefore.change.affectedIds.includes(editor.action.slice(5))?
   recentPlanBefore.baseline:null;
 },[editor?.action,project,recentPlanBefore,data.revision,recentWorkId]);
 const impactedWorkOrder=useMemo(()=>new Map<string,number>(
  (recentScheduleEffect?.affectedIds||[]).map((id:string,index:number):[string,number]=>[id,index])
 ),[recentScheduleEffect]);
 const workImpactActive=workImpactOnly&&impactedWorkOrder.size>0;
 const workLinks=useMemo(()=>project&&plan?workDependencyOverview(project,plan):new Map(),[project,plan]);
 const pendingWorkCount=useMemo(()=>Array.from(workLinks.values())
  .filter((entry:any)=>entry.pendingTotal>0).length,[workLinks]);
 const reality=useMemo(()=>project?compareProject(project):null,[project]);
 const controlPlans=project?.planBaselines??[];
 const selectedControlPlan=controlPlans.some((b:any)=>b.id===controlPlanId)?controlPlanId:null;
 const controlPlanComparison=useMemo(()=>project&&controlPlans.length?
  comparePlanBaseline(data,project.id,selectedControlPlan,{portfolio:dates}):null,
  [data,project,selectedControlPlan,dates]);
 const visibleControlPlanRows=useMemo(()=>controlPlanComparison?
  (controlPlanOnlyChanges?controlPlanComparison.rows.filter((r:any)=>r.changed):
   controlPlanComparison.rows).slice(0,controlPlanLimit):[],
  [controlPlanComparison,controlPlanOnlyChanges,controlPlanLimit]);
 // This lookup is invalidated by an actual domain snapshot change, not by
 // every typed character, search filter, inspector toggle or tab switch.
 const impactByProject=useMemo(()=>{
  const indexed=new Map<string,ReturnType<typeof projectImpact>>();
  for(const p of data.projects)indexed.set(p.id,projectImpact(p));
  return indexed;
 },[data.projects]);
 // All 120-project command rows derive only on domain snapshot changes.
 // Filtering and pagination do not recalculate sources, CPM or impact.
 const portfolioCommand=useMemo(()=>
  buildPortfolioCommand(data,{impacts:impactByProject,schedules:dates}),[data,impactByProject,dates]);
 const attentionRows=useMemo(()=>
  filterPortfolioCommand(portfolioCommand,{filter:attentionFilter,search:attentionQuery}),
  [portfolioCommand,attentionFilter,attentionQuery]);
 const projectCommand=useMemo(()=>project?portfolioCommand.rows.find((row:any)=>row.id===project.id)||null:null,
  [portfolioCommand,project]);
 useEffect(()=>{
  if(!relationJump||!ready||active!==relationJump||tab!=="overview"||!showProjectRelations)return;
  const element=relationSectionRef.current;
  if(!element)return;
  element.scrollIntoView({block:"start",behavior:"auto"});
  element.focus({preventScroll:true});
  setRelationJump(null);
 },[relationJump,ready,active,tab,showProjectRelations,projectCommand]);
 const impact=project?impactByProject.get(project.id)||null:null;
 const nextStep=useMemo(()=>project&&impact?projectNextStep(project,impact):null,[project,impact]);
 const realityMap=useMemo(()=>project&&reality&&impact?realityOverview(project,reality,impact):null,[project,reality,impact]);
 useEffect(()=>{
  if(tab!=="sources"||!ready||!sourceJumpContext?.source||!project||
     sourceJump?.projectId!==project.id)return;
  const target=sourceJumpRef.current;
  if(!target)return;
  target.scrollIntoView({behavior:"auto",block:"start"});
  target.focus({preventScroll:true});
 },[tab,ready,project,sourceJump,sourceJumpContext]);
 const sourceResponseById=useMemo(()=>{
  const relevant=project&&impact?responseState(project,impact).rows:[];
  return new Map<string,any>(relevant.filter(r=>r.key.startsWith("source-issue:"))
   .map(r=>[r.key.slice("source-issue:".length),r]));
 },[project,impact]);
 const sourceRequirementLinks=useMemo(()=>{
  const grouped=new Map<string,any[]>();
  for(const row of realityMap?.rows||[]){
   const sourceId=row.observation?.sourceId;
   if(!sourceId)continue;
   const list=grouped.get(sourceId)||[];
   list.push({id:row.id,title:row.title,assessment:row.assessment,
    freshness:row.source?.freshness||"unknown"});
   grouped.set(sourceId,list);
  }
  return grouped;
 },[realityMap]);
 const targetById=useMemo(()=>new Map<string,any>((project?.targets||[]).map((t:any)=>[t.id,t])),[project]);
 const findingsByWork=useMemo(()=>project?workObservationIndex(project):new Map<string,any[]>(),[project]);
 const workObservationCounts=useMemo(()=>{
  const without=(project?.items||[]).filter((w:any)=>!findingsByWork.has(w.id));
  return {without:without.length,doneWithout:without.filter((w:any)=>w.state==="done").length};
 },[project,findingsByWork]);
 useEffect(()=>{
  // Reveal the actual source-bound row instead of losing the target ID
  // when the user enters a project from the portfolio command queue.
  if(!requirementJump||!ready||active!==requirementJump.projectId||tab!=="overview"||!realityMap)return;
  const index=realityMap.rows.findIndex((row:any)=>row.id===requirementJump.targetId);
  if(index<0){setRequirementJump(null);return;}
  if(index>=realityLimit){setRealityLimit(index+1);return;}
  const card=requirementCardRef.current;
  if(!card)return;
  card.scrollIntoView({block:"center",behavior:"auto"});
  card.focus({preventScroll:true});
  setRequirementJump(null);
 },[requirementJump,ready,active,tab,realityMap,realityLimit]);
 useEffect(()=>{
  if(!changeJump||!ready||active!==changeJump.projectId||tab!=="changes"||!project)return;
  if(!(project.changes||[]).some((c:any)=>c.id===changeJump.changeId)){setChangeJump(null);return;}
  const card=changeCardRef.current;
  if(!card)return;
  card.scrollIntoView({block:"center",behavior:"auto"});
  card.focus({preventScroll:true});
  setChangeJump(null);
 },[changeJump,ready,active,tab,project]);

 const portfolioSearchIndex=useMemo(()=>buildPortfolioSearchIndex(data.projects),[data.projects]);
 const filtered=useMemo(()=>filterPortfolioSearch(portfolioSearchIndex,{
  query:search,status:portfolioStatus}),[portfolioSearchIndex,search,portfolioStatus]);
 // Explain matches only when there is a query. Cache alongside the
 // existing portfolio projection so unrelated panel state is cheap.
 const portfolioReasons=useMemo(()=>new Map<string,string>(
  search.trim()?filtered.map((p:any):[string,string]=>
   [p.id,portfolioSearchReason(p,search)]):[]
 ),[filtered,search]);
 const portfolioQuickWork=useMemo(()=>
  search.trim()&&filtered.length===1?portfolioSearchWorkTarget(filtered[0],search):null,
  [filtered,search]);
 // Stage and source searches may find many existing works. Use the
 // existing read-only work table filter, without duplicating search logic.
 const portfolioWorkMatches=useMemo(()=>new Map<string,number>(
  search.trim()?filtered.map((p:any):[string,number]=>
   [p.id,projectWorkTableSearch(p,search).length]):[]
 ),[filtered,search]);
 // A single accessible name and a single visible text node. Separate
 // expressions for the caption and count can create separate WebView2 UIA
 // text elements despite looking like one sentence on screen.
 const portfolioFindSummary=(search.trim()?"Найдено проектов: ":"В списке проектов: ")+filtered.length;
 const workFiltersActive=workFilter!=="all"||workTargetFilter!=="all"||
  workObservationFilter!=="all"||workDependencyFilter!=="all"||
  workDeadlineFilter!=="all"||!!workQuery.trim()||workImpactActive||workCriticalOnly;
 const clearWorkFilters=()=>{
  setWorkFilter("all");setWorkTargetFilter("all");
  setWorkObservationFilter("all");setWorkDependencyFilter("all");
  setWorkDeadlineFilter("all");setWorkQuery("");setWorkImpactOnly(false);setWorkCriticalOnly(false);
  if(workSort==="impact")setWorkSort("title");
  setWorkReturnId(null);setWorkLimit(200);
 };
 const showAffectedWorks=()=>{
  if(!recentScheduleEffect?.affectedIds.length||!requireClosedForm())return;
  setWorkFilter("all");setWorkTargetFilter("all");
  setWorkObservationFilter("all");setWorkDependencyFilter("all");
  setWorkDeadlineFilter("all");setWorkQuery("");setWorkImpactOnly(true);setWorkCriticalOnly(false);
  setWorkSort("impact");setWorkReturnId(null);setWorkLimit(200);
 };
 const filteredWork=useMemo(()=>{
  if(!project)return [];
  const textMatches=projectWorkTableSearch(project,workQuery);
  const matching=textMatches.filter((item:any)=>
   (!workImpactActive||impactedWorkOrder.has(item.id))&&
   (!workCriticalOnly||criticalWorkIds.has(item.id))&&
   (workFilter==="all"||item.state===workFilter)&&
   (workTargetFilter==="all"||(item.targetIds||[]).includes(workTargetFilter))&&
   (workDeadlineFilter==="all"||overdueWorkFinishes.has(item.id)));
  const rows=filterWorkRowsByDependencies(
    filterWorkRowsByObservation(matching,findingsByWork,workObservationFilter),workLinks,workDependencyFilter);
  if(workSort==="impact"&&workImpactActive)
   return rows.sort((a:any,b:any)=>(impactedWorkOrder.get(a.id)??Infinity)-
    (impactedWorkOrder.get(b.id)??Infinity));
  return sortWorkRows(rows,workSort==="impact"?"title":workSort);
 },[project,workFilter,workQuery,workSort,workTargetFilter,workObservationFilter,workDependencyFilter,workDeadlineFilter,overdueWorkFinishes,workLinks,findingsByWork,workImpactActive,impactedWorkOrder,workCriticalOnly,criticalWorkIds]);
 useEffect(()=>{
  if(tab!=="work"||!ready||!workReturnId||!project)return;
  const index=filteredWork.findIndex((item:any)=>item.id===workReturnId);
  if(index<0){setWorkReturnId(null);return;}
  if(index>=workLimit){setWorkLimit(index+1);return;}
  const control=workReturnRef.current;
  if(!control)return;
  control.scrollIntoView({block:"center",behavior:"auto"});
  control.focus({preventScroll:true});
  setWorkReturnId(null);
 },[tab,ready,workReturnId,project,filteredWork,workLimit]);
 useEffect(()=>{
  if(tab!=="board"||!ready||!workReturnId||!project)return;
  const selected=project.items.find((item:any)=>item.id===workReturnId);
  if(!selected){setWorkReturnId(null);return;}
  const index=project.items.filter((item:any)=>item.state===selected.state)
   .findIndex((item:any)=>item.id===selected.id);
  if(index<0){setWorkReturnId(null);return;}
  if(index>=(boardLimits[selected.state]||60)){
   setBoardLimits(previous=>({...previous,[selected.state]:index+1}));
   return;
  }
  const control=workReturnRef.current;
  if(!control)return;
  control.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
  control.focus({preventScroll:true});
  setWorkReturnId(null);
 },[tab,ready,workReturnId,project,boardLimits]);
 const mutate=(next:Atlas,notice:string)=>{workNavigationContext.current=null;setSavedRefPreview(null);latestSnapshot.current=next;setData(next);setMessage(notice);setError("");};
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
 // An installed T3/Agent Host owns context, Task creation and readback.
 // The Atlas UI supplies ONLY the exact saved work selection, never a grant.
 const issueAtlasAgentTask=async(projectId:string,workId:string)=>{
  if(!host?.t3?.issueSelectedWork){
   issue(Error("Подключённый оригинальный Agent пока недоступен."));return;
  }
  if(!ready||busyRef.current||dirtyRef.current||!persisted||
     editorOpenRef.current||pendingImportOpenRef.current||
     savedVersionsOpenRef.current||savedRefOpenRef.current){
   issue(Error("Сохраните проект и закройте формы перед поручением Agent."));return;
  }
  const started=latestSnapshot.current,expectedGeneration=generation;
  busyRef.current=true;setBusy(true);
  try{
   const actual=await readSavedSnapshotForReference({invoke,
    expectedGeneration,snapshot:started,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))});
   const ref=createAtlasSavedRef(actual,{projectId,workId},{persisted:true,dirty:false}) as
    {projectId:string;workId:string;revision:string};
   if(latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Изменения в Atlas во время подготовки поручения. Agent не запускался.");
   const received=await host.t3.issueSelectedWork({projectId,workId});
   if(received?.workRef?.projectId!==ref.projectId||
      received?.workRef?.workId!==ref.workId||
      received?.workRef?.revision!==ref.revision||
      typeof received?.taskId!=="string"||
      !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/.test(received.taskId))
    throw Error("Ответ Agent не подтверждает исходную работу. Не повторяйте поручение без проверки Task в Agent.");
   setT3AgentTask({projectId,workId,taskId:received.taskId});
   const now=await invoke<OpenResult>("atlas_open");
   if(now.needsConfirmation||now.generation!==expectedGeneration||
      latestSnapshot.current!==started||dirtyRef.current){
    setMessage("Task "+received.taskId+" найден у Agent, но Atlas изменился. Перечитайте проект перед следующими действиями.");
   }else{
    setMessage("Agent сохранил Task "+received.taskId+". Исходная работа не менялась. Ожидайте принятый Result, затем перечитайте Atlas.");
   }
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 // Once the ORIGINAL D6 confirms the receipt, display that exact
 // Decision from the ORIGINAL Atlas native head. This is read-only:
 // never merge a dirty draft or infer permission from a stored link.
 const displayConfirmedAtlasResult=async({
  projectId,workId,operationId,resultRef
 }:{projectId:string;workId:string;operationId:string;resultRef:string})=>{
  const started=latestSnapshot.current,expectedGeneration=generation;
  const unchanged=()=>{
   if(latestSnapshot.current!==started||dirtyRef.current||
      editorOpenRef.current||pendingImportOpenRef.current||
      savedVersionsOpenRef.current||savedRefOpenRef.current)
    throw Error("ATLAS_T3_LOCAL_DRAFT_CHANGED");
  };
  const reread=await readExternalAtlasUpdate({
   invoke,expectedGeneration,snapshot:started,signature:snapshotText,
   readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw)),
   assertUnchanged:unchanged
  });
  const link=findConfirmedAtlasT3Decision(reread.snapshot,{
   projectId,workId,operationId,resultRef
  });
  unchanged();
  if(reread.status==="UPDATED"){
   latestSnapshot.current=reread.snapshot;
   saved.current=snapshotText(reread.snapshot);
   setData(reread.snapshot);setGeneration(reread.generation);
   if(active&&!reread.snapshot.projects.some((p:any)=>p.id===active))setActive(null);
   setRecentWorkId(null);setRecentPlanBefore(null);
   workNavigationContext.current=null;
  }
  return Object.freeze({status:reread.status,link});
 };
 // Signed file review is a separate user decision from portfolio .iwxa
 // import. It exists ONLY when the installed ORIGINAL T3 recipient has been
 // mounted by the trusted native Atlas composition. No signer or grant in UI.
 const inspectSignedResultFile=async(file:File|null)=>{
  if(!file)return;
  const inspect=host?.t3?.inspectSignedFile;
  if(!signedFileOwnerAvailable||typeof inspect!=="function"){
   issue(Error("Оригинальный подписанный получатель T3 не подключён."));return;
  }
  if(!ready||busyRef.current||dirtyRef.current||editorOpenRef.current||
     signedResultOpenRef.current||pendingImportOpenRef.current||
     savedVersionsOpenRef.current||savedRefOpenRef.current||!persisted){
   issue(Error("Сначала сохраните портфель и закройте формы перед получением Result."));return;
  }
  if(!/\.iwxa$/i.test(file.name)||file.size<22||file.size>32*1024*1024){
   issue(Error("Выберите подписанный .iwxa размером не более 32 МБ."));return;
  }
  const started=latestSnapshot.current,expectedGeneration=generation;
  busyRef.current=true;setBusy(true);
  try{
   const archive=new Uint8Array(await file.arrayBuffer());
   if(archive.byteLength!==file.size)
    throw Error("ATLAS_T3_SELECTED_FILE_CHANGED");
   const preview=await verifiedAtlasSignedFilePreview(
    await inspect({archive,recipientId:"iwxa.atlas"})) as AtlasT3SignedFilePreview;
   const savedHead=await invoke<OpenResult>("atlas_open");
   if(savedHead.needsConfirmation||savedHead.generation!==expectedGeneration||
      latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Портфель изменился при выборе подписанного Result. Перечитайте сохранённую редакцию.");
   const p=started.projects.find((item:any)=>item.id===preview.workRef.projectId);
   if(!p||!p.items.some((item:any)=>item.id===preview.workRef.workId)||
      (!preview.alreadyReceived&&String(started.revision)!==preview.workRef.revision))
    throw Error("T3 подписал Result для другой редакции проекта. Обновите Atlas перед приёмом.");
   // The original U05 CAS advances Atlas revision after first receipt.
   // A cold readback of the SAME already-received signed Result must remain
   // possible even when the signed WorkRef predates that native commit.
   // Re-applying still requires the exact earlier preview and is not offered
   // for alreadyReceived=true.
   // A new original signature/grant check is the only path to fresh review.
   signedFileDispatchAttemptedRef.current=false;
   setSignedFileDispatchAttempted(false);
   setSignedResultPreview({...preview,archive});
   setMessage("");setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 // Only original Reconciliation and current Atlas authorization can verify
 // a received file. A persisted Decision alone is NEVER the current grant.
 const verifyReceivedSignedResult=async(p:AtlasT3SignedFilePreview)=>{
  const read=host?.t3?.readbackSignedFile;
  if(typeof read!=="function")
   throw Error("ATLAS_T3_SIGNED_RECEIPT_OWNER_UNAVAILABLE");
  const receipt=await read(p.operationId);
  if(receipt?.state!=="SIGNED_FILE_PERSISTED"||
     receipt.recipientId!=="iwxa.atlas"||
     receipt.operationId!==p.operationId||
     receipt.originalKernelEventVerified!==false||
     typeof receipt.resultRef!=="string"||
     !receipt.resultRef.startsWith("atlas:decision:"))
   throw Error("ATLAS_T3_SIGNED_RECEIPT_NOT_CONFIRMED");
  await displayConfirmedAtlasResult({
   projectId:p.workRef.projectId,workId:p.workRef.workId,
   operationId:p.operationId,resultRef:receipt.resultRef
  });
  setSignedResultPreview(null);setError("");
  setMessage("Выбранный подписанный Result сохранён в Atlas и заново прочитан из его нативного Store. "+
   "T3 подтвердил оригинальную подпись и полномочия получателя. "+
   "Событие Kernel отправителя на этом компьютере не проверялось.");
 };
 const acceptSignedResultFile=async()=>{
  const p=signedResultPreview,apply=host?.t3?.receiveSignedFile;
  if(!p||typeof apply!=="function"||busyRef.current||
     signedFileDispatchAttemptedRef.current)return;
  if(dirtyRef.current||editorOpenRef.current||pendingImportOpenRef.current){
   issue(Error("Изменения в Atlas препятствуют приёму. Сначала сохраните проект."));return;
  }
  if(p.alreadyReceived){
   issue(Error("Результат уже сохранён. Применять второй раз нельзя, выберите проверку квитанции."));return;
  }
  busyRef.current=true;setBusy(true);
  // Block repeat BEFORE native dispatch, including lost ACK and an owner deny.
  signedFileDispatchAttemptedRef.current=true;
  setSignedFileDispatchAttempted(true);
  try{
   await apply({
    archive:p.archive,recipientId:"iwxa.atlas",
    operationId:p.operationId,archiveSha256:p.archiveSha256,
    selectedSummarySha256:p.selectedSummarySha256,confirmed:true
   });
   await verifyReceivedSignedResult(p);
  }catch(e){
   if(!showOriginalT3Denial(e)){
    // The original U05 CAS may have committed before its reply was lost.
    // NEVER redispatch the same signed Result from this error handler.
    setError("Получение Result не подтверждено. Повторно применять нельзя. "+
     "Нажмите «Проверить квитанцию» для чтения оригинального T3 и Atlas.");
   }
  }finally{busyRef.current=false;setBusy(false)}
 };
 const recoverSignedResultFile=async()=>{
  const p=signedResultPreview;
  if(!p||busyRef.current)return;
  if(dirtyRef.current||editorOpenRef.current){
   issue(Error("Сначала сохраните локальные изменения."));return;
  }
  busyRef.current=true;setBusy(true);
  try{await verifyReceivedSignedResult(p)}
  catch(e){
   if(!showOriginalT3Denial(e))
    setError("Независимая квитанция пока не подтверждена. "+
     "Ничего не отправлено повторно: "+deepFreezeError(e));
  }finally{busyRef.current=false;setBusy(false)}
 };
 // A definite original owner denial is distinct from an unconfirmed
 // native write. Never downgrade it or claim a durable Atlas Decision.
 const showOriginalT3Denial=(error:unknown)=>{
  const verdict=error as {code?:string;outcome?:string}|null;
  if(verdict?.outcome!=="DENIED")return false;
  const code=typeof verdict.code==="string"?verdict.code:"ORIGINAL_T3_DENIED";
  setError("");
  setMessage("Оригинальный владелец отказал в действии: "+code+
   ". Подтверждения Result нет. Повторное применение не запускалось.");
  return true;
 };
 // Publication is a SEPARATE original Agent/T3 owner operation, not D6
 // apply. It only prepares a signed source for subsequent "Получить Result".
 // Never reissue publication after an uncertain acknowledgement.
 const runAgentResultPublication=async(projectId:string,workId:string,
  mode:"publish"|"recover")=>{
  const original=mode==="publish"?host?.t3?.publishSelectedResult:
   host?.t3?.recoverSelectedPublication;
  if(!original){
   issue(Error("Оригинальный подписанный публикатор Agent/T3 не подключён."));return;
  }
  if(!ready||busyRef.current||dirtyRef.current||!persisted||
     editorOpenRef.current||pendingImportOpenRef.current||
     savedVersionsOpenRef.current||savedRefOpenRef.current){
   issue(Error("Сохраните проект и закройте формы перед публикацией или проверкой."));return;
  }
  const started=latestSnapshot.current,expectedGeneration=generation;
  busyRef.current=true;setBusy(true);
  try{
   const actual=await readSavedSnapshotForReference({invoke,
    expectedGeneration,snapshot:started,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))});
   const workRef=createAtlasSavedRef(actual,{projectId,workId},
    {persisted:true,dirty:false}) as
    {projectId:string;workId:string;revision:string};
   if(latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Atlas изменился до обращения к Agent. Публикация не запускалась.");
   const result=await original({projectId,workId});
   if(result?.workRef?.projectId!==workRef.projectId||
      result?.workRef?.workId!==workRef.workId||
      result?.workRef?.revision!==workRef.revision)
    throw Error("Agent не подтвердил исходную работу. Не повторяйте отправку.");
   if(latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Atlas изменился во время публикации. Не повторяйте отправку, проверьте исходную квитанцию.");
   if(result.status==="OWNER_READBACK_CONFIRMED"){
    if(typeof result.operationId!=="string"||
       !/^agent:t3:atlas:[a-f0-9]{64}$/.test(result.operationId))
     throw Error("Публикатор не подтвердил оригинальную квитанцию. Проверьте её без повторной отправки.");
    setMessage("Agent подтвердил подписанную публикацию Result через оригинальный T3. "+
     "Теперь нажмите «Получить Result» для отдельного D6 и записи Atlas Decision.");
   }else if(result.status==="NOT_PUBLISHED_CONFIRMED"){
    setMessage("Оригинальный T3 подтвердил отсутствие публикации. "+
     "Можно отдельно запросить «Опубликовать Result» после проверки принятия в Agent.");
   }else if(result.status==="OUTCOME_UNKNOWN"||
            result.status==="OPERATION_IN_PROGRESS"){
    setMessage("Исход публикации Agent Result неизвестен. "+
     "Не отправляйте повторно. «Проверить публикацию» читает оригинальный реестр.");
   }else{
    throw Error("Неизвестный ответ оригинального публикатора. Запись не подтверждена.");
   }
   setError("");
  }catch(e){
   if(!showOriginalT3Denial(e)){
    setError(deepFreezeError(e));
    setMessage("Публикация Agent Result не подтверждена. Не отправляйте повторно "+
     "до проверки оригинальной квитанции через «Проверить публикацию».");
   }
  }finally{busyRef.current=false;setBusy(false)}
 };
 // An original T3 D6 Host owns signed Result selection and Human consent.
 // Atlas provides only the exact saved Project/WorkRef.
 const receiveAtlasAgentResult=async(projectId:string,workId:string)=>{
  if(!host?.t3?.continueSelectedResult){
   issue(Error("Оригинальный T3 для получения Result не подключён."));return;
  }
  if(!ready||busyRef.current||dirtyRef.current||!persisted||
     editorOpenRef.current||pendingImportOpenRef.current||
     savedVersionsOpenRef.current||savedRefOpenRef.current){
   issue(Error("Сохраните проект и закройте формы перед получением Result."));return;
  }
  const started=latestSnapshot.current,expectedGeneration=generation;
  busyRef.current=true;setBusy(true);
  try{
   const actual=await readSavedSnapshotForReference({invoke,
    expectedGeneration,snapshot:started,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))});
   const ref=createAtlasSavedRef(actual,{projectId,workId},
    {persisted:true,dirty:false}) as
    {projectId:string;workId:string;revision:string};
   if(latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Проект изменился до выбора Result. Получение не запускалось.");
   const result=await host.t3.continueSelectedResult({projectId,workId});
   if(result?.workRef?.projectId!==ref.projectId||
      result?.workRef?.workId!==ref.workId||
      result?.workRef?.revision!==ref.revision)
    throw Error("T3 вернул Result для другой редакции работы. Проверьте Agent и сохранённый Atlas.");
   if(result.status==="OWNER_READBACK_CONFIRMED"){
    if(typeof result.operationId!=="string"||!/^atlas:t3:[0-9a-f]{64}$/.test(result.operationId)||
       typeof result.resultRef!=="string"||!result.resultRef.startsWith("atlas:decision:"))
     throw Error("T3 не подтвердил исходную квитанцию Atlas.");
    try{
     const observed=await displayConfirmedAtlasResult({
      projectId,workId,operationId:result.operationId,resultRef:result.resultRef
     });
     setMessage("Ссылка на Agent Result "+observed.link.resultId+
      " подтверждена и "+(observed.status==="UPDATED"?"показана в сохранённом проекте.":"уже присутствует в проекте.")+
      " Статус работы и зависимости не менялись.");
     setError("");
    }catch(readbackError){
     setMessage("T3 подтвердил приём Result, но Atlas не смог показать сохранённую редакцию. Не повторяйте применение. Проверьте квитанцию и перечитайте проект.");
     setError("Обновление Atlas: "+String(readbackError instanceof Error?readbackError.message:readbackError));
    }
    return;
   }else if(result.status==="USER_CANCELLED"){
    setMessage("Получение Result отменено. Проект не изменён.");
   }else if(result.status==="OUTCOME_UNKNOWN"||result.status==="OPERATION_IN_PROGRESS"){
    setMessage("Исход получения Result не подтверждён. Не повторяйте применение. "+(host?.t3?.recoverSelectedResult?"Нажмите «Проверить Result» для оригинального readback.":"Проверьте квитанцию через оригинальный T3.")+" Затем перечитайте сохранённый Atlas.");
   }else{
    throw Error("Неизвестный ответ T3. Получение Result не подтверждено.");
   }
   setError("");
  }catch(e){if(!showOriginalT3Denial(e))issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 // Original T3 D6 recovery performs signed readback ONLY; it never
 // dispatches a second Agent Task or Atlas native commit. The stored Agent
 // WorkRef can be older than the current Atlas revision after a successful
 // Decision commit, so only Project/Work identity is matched here.
 const recoverAtlasAgentResult=async(projectId:string,workId:string)=>{
  if(!host?.t3?.recoverSelectedResult){
   issue(Error("Оригинальный T3 для проверки Result не подключён."));return;
  }
  if(!ready||busyRef.current||dirtyRef.current||!persisted||
     editorOpenRef.current||pendingImportOpenRef.current||
     savedVersionsOpenRef.current||savedRefOpenRef.current){
   issue(Error("Сохраните черновик и закройте формы перед проверкой Result."));return;
  }
  const started=latestSnapshot.current;
  busyRef.current=true;setBusy(true);
  try{
   // Confirm the UI selection still names a real saved Atlas Work.
   // Do NOT require the old generation: a successful D6 commit advances it.
   const ref=createAtlasSavedRef(started,{projectId,workId},
    {persisted:true,dirty:false}) as {projectId:string;workId:string;revision:string};
   const result=await host.t3.recoverSelectedResult({projectId,workId});
   if(latestSnapshot.current!==started||dirtyRef.current||editorOpenRef.current)
    throw Error("Atlas изменился во время проверки. Перечитайте сохранённый проект.");
   if(result?.workRef?.projectId!==ref.projectId||
      result?.workRef?.workId!==ref.workId)
    throw Error("Ответ T3 относится к другой работе. Результат не подтверждён.");
   if(result.status==="OWNER_READBACK_CONFIRMED"){
    if(typeof result.operationId!=="string"||!/^atlas:t3:[0-9a-f]{64}$/.test(result.operationId)||
       typeof result.resultRef!=="string"||!result.resultRef.startsWith("atlas:decision:"))
     throw Error("Квитанция оригинального T3 не подтверждена.");
    try{
     const observed=await displayConfirmedAtlasResult({
      projectId,workId,operationId:result.operationId,resultRef:result.resultRef
     });
     setMessage("Исходный T3 восстановил квитанцию Agent Result "+observed.link.resultId+
      ". "+(observed.status==="UPDATED"?"Сохранённая редакция Atlas обновлена.":"Ссылка уже показана в проекте.")+
      " Статус выполнения работы не менялся.");
     setError("");
    }catch(readbackError){
     setMessage("Оригинальный T3 подтвердил квитанцию Result, но отображение Atlas не проверено. Не отправляйте Result повторно. Перечитайте сохранённое после проверки черновика.");
     setError("Восстановление отображения: "+String(readbackError instanceof Error?readbackError.message:readbackError));
    }
    return;
   }else if(result.status==="OUTCOME_UNKNOWN"||result.status==="OPERATION_IN_PROGRESS"){
    setMessage("Квитанция Result пока не подтверждена. Повторно применять Result нельзя. Проверьте исходный Agent и оригинальный T3.");
   }else{
    throw Error("Неподтверждённый ответ T3 при проверке Result.");
   }
   setError("");
  }catch(e){if(!showOriginalT3Denial(e))issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 // Another product may have written the native Atlas head by an authorized T3
 // route. Explicit native reread only, never an implicit overwrite of a draft.
 const rereadAtlasFromNative=async()=>{
  if(!ready||busyRef.current||dirtyRef.current||editorOpenRef.current||
     pendingImportOpenRef.current||savedVersionsOpenRef.current||
     savedRefOpenRef.current||!persisted){
   issue(Error("Сначала сохраните черновик и закройте формы, затем перечитайте проект."));return;
  }
  const started=latestSnapshot.current,expectedGeneration=generation;
  const unchanged=()=>{
   if(latestSnapshot.current!==started||dirtyRef.current||
      editorOpenRef.current||pendingImportOpenRef.current||
      savedVersionsOpenRef.current||savedRefOpenRef.current)
    throw Error("Черновик или форма изменились во время чтения. Данные Atlas не заменены.");
  };
  busyRef.current=true;setBusy(true);
  try{
   const result=await readExternalAtlasUpdate({
    invoke,expectedGeneration,snapshot:started,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw)),
    assertUnchanged:unchanged
   });
   if(result.status==="UNCHANGED"){
    setMessage("Сохранённый портфель не изменился.");
   }else{
    const checked=result.snapshot;
    unchanged();
    latestSnapshot.current=checked;
    saved.current=snapshotText(checked);
    setData(checked);setGeneration(result.generation);
    if(active&&!checked.projects.some((p:any)=>p.id===active))setActive(null);
    setRecentWorkId(null);setRecentPlanBefore(null);
    workNavigationContext.current=null;
    setMessage("Перечитана новая сохранённая редакция Atlas. Ссылки на Agent Result показаны у работ; права проверяются отдельно через T3.");
   }
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 useEffect(()=>{
  if(!native){setError("Откройте установленное приложение Atlas в отдельном окне Windows, чтобы работать с проектами.");return}
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
   if(signedResultOpenRef.current){
    event.preventDefault();
    if(!busyRef.current)setSignedResultPreview(null);
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
 const resetWorkspaceScroll=()=>{
  // The React workspace persists between projects/views; do not inherit scroll.
  const workspace=rootRef.current?.querySelector<HTMLElement>(".workspace");
  if(workspace)workspace.scrollTop=0;
 };
 const selectProject=(id:string|null,afterSubmit=false)=>{
  if(!afterSubmit&&!requireClosedForm())return;
  workNavigationContext.current=null;
  resetWorkspaceScroll();
  host?.onSelection?.({projectId:id,workId:null,revision:String(latestSnapshot.current.revision)});
  setActive(id);setTab("overview");setEditor(null);setForecastId(null);setConnectOpen(false);
  if(id!==null){setHomeOpen(false);setSettingsOpen(false);}
  setSourceJump(null);setMapSearchReturn(null);setGraphJump(null);setWorkReturnId(null);
  setRecentWorkId(null);setRecentPlanBefore(null);setWorkImpactOnly(false);setWorkCriticalOnly(false);
  setPreviewWorkRequest(null);
  setShowProjectRelations(false);setRelationLimit(12);setRequirementJump(null);setChangeJump(null);
  if(!afterSubmit)setMessage("");
  setWorkDependencyFilter("all");setWorkDeadlineFilter("all");setWorkFilter("all");setWorkTargetFilter("all");setWorkObservationFilter("all");setWorkHistoryLimits({});setWorkQuery("");setWorkSort("title");setWorkLimit(200);setRealityLimit(8);
  setHistoryQuery("");setHistoryType("all");setHistoryLimit(120);setRecheckLimit(25);
 };
 // Back/forward preserve UI navigation but never bypass a pending editor.
 useEffect(()=>{
  if(embedded)return;
  const place:AtlasLocation={projectId:active,tab,home:active?false:homeOpen,settings:settingsOpen};
  if(routeSuppress.current){routeSuppress.current=false;return;}
  const current=routeHistory.current[routeCursor.current];
  if(current&&current.projectId===place.projectId&&current.tab===place.tab&&
   current.home===place.home&&current.settings===place.settings)return;
  routeHistory.current=routeHistory.current.slice(0,routeCursor.current+1);
  routeHistory.current.push(place);
  if(routeHistory.current.length>60)routeHistory.current.shift();
  routeCursor.current=routeHistory.current.length-1;
  setRouteControls({back:routeCursor.current>0,forward:false});
 },[active,tab,homeOpen,settingsOpen,embedded]);
 const moveRoute=(delta:-1|1)=>{
  if(!requireClosedForm())return;
  const next=routeCursor.current+delta;
  if(next<0||next>=routeHistory.current.length)return;
  const place=routeHistory.current[next];
  routeSuppress.current=true;routeCursor.current=next;
  selectProject(place.projectId);setTab(place.tab);
  setHomeOpen(place.home);setSettingsOpen(place.settings);
  setRouteControls({back:next>0,forward:next<routeHistory.current.length-1});
 };
 const openProjectTab=(id:string,tabId:Tab,changeId:string|null=null)=>{
  if(!requireClosedForm())return;
  selectProject(id);setTab(tabId);
  // Jump straight to the concrete, still-unapplied planning forecast.
  // This is navigation only; human approval and application stay separate.
  if(tabId==="changes"&&changeId){
   setForecastId(changeId);
   setChangeJump({projectId:id,changeId});
  }
 };
 const openPortfolioWorkResults=(id:string,query:string,focusWorkId:string|null=null)=>{
  if(busyRef.current||!requireClosedForm())return;
  // One existing project switch clears unrelated filters; the table keeps
  // exactly the user's search. Navigating never writes a saved project.
  selectProject(id,true);setTab("work");setWorkQuery(query);
  setWorkReturnId(focusWorkId);setMessage("");
 };
 const inspectPortfolioSignal=(projectId:string,signal:{kind:string;panel:string;ref?:string})=>{
  if(!requireClosedForm())return;
  // Evidence belongs to the existing rich fact/provenance cards. If an old
  // reference no longer exists, open the overview without a false selection.
  const target:Tab=signal.panel==="evidence"?"overview":
   signal.panel==="sources"?"sources":signal.panel==="schedule"?"timeline":
   signal.panel==="response"?(signal.kind==="blocked"?"work":"changes"):"overview";
  const validTarget=signal.panel==="evidence"&&Boolean(signal.ref)&&
   data.projects.find((p:any)=>p.id===projectId)?.targets?.some((t:any)=>t.id===signal.ref);
  // Read-only navigation: approval and local native Save remain explicit.
  openProjectTab(projectId,target);
  if(validTarget)setRequirementJump({projectId,targetId:signal.ref!});
  if(signal.panel==="relations"){
   setShowProjectRelations(true);
   setRelationJump(projectId);
  }
 };
 const openEditor=(action:string,projectId?:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  try{
   const p=data.projects.find((x:any)=>x.id===(projectId??active))||null;
   const spec=editorSpec(p,action,data);
   setEditor({action,spec});setInspector(true);
   if(!embedded&&window.innerWidth<1150)setNavPanelOpen(false);
   setError("");
  }catch(e){issue(e)}
 };
 const openEditorFor=(projectId:string,action:string)=>{
  if(!requireClosedForm()||busyRef.current)return;
  try{
   const p=data.projects.find((x:any)=>x.id===projectId);
   if(!p)throw Error("Проект для решения не найден");
   resetWorkspaceScroll();
   setActive(projectId);setHomeOpen(false);setSettingsOpen(false);
   setTab(action.startsWith("plan-")?"changes":"reality");
   setEditor({action,spec:editorSpec(p,action,data)});setInspector(true);
   if(!embedded&&window.innerWidth<1150)setNavPanelOpen(false);
   setError("");
  }catch(e){issue(e)}
 };
 const cancelEditor=()=>{
  if(editorDirtyRef.current&&!confirmAction("Отказаться от введённых изменений формы?"))return;
  editorDirtyRef.current=false;setEditor(null);
  if(embedded||window.innerWidth<=1220)setInspector(false);
 };
 const revealWorkInTable=(id:string,focusRow=true)=>{
  // New work: reveal its exact row, including entries beyond the preview limit.
  // Dependency change: keep the consequence summary at the top until the user
  // chooses which affected work to open. No automatic scroll past the summary.
  resetWorkspaceScroll();setTab("work");setSourceJump(null);setGraphJump(null);
  setMapSearchReturn(null);
  setWorkFilter("all");setWorkTargetFilter("all");setWorkObservationFilter("all");
  setWorkDependencyFilter("all");setWorkDeadlineFilter("all");setWorkQuery("");setWorkSort("title");setWorkLimit(200);
  setWorkImpactOnly(false);setWorkCriticalOnly(false);setWorkReturnId(focusRow?id:null);
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
   if(result.workId){
    const updatedProject=result.state.projects.find((p:any)=>p.id===formProject);
    setRecentPlanBefore(plannedPlan&&updatedProject?startWorkCorrection({
     projectId:formProject,workId:result.workId,revision:result.state.revision,
     beforePlan:plannedPlan,afterPlan:scheduleProject(updatedProject,{calendarLibrary:data.calendarLibrary??[]})
    }):null);
    const isDependencyChange=editor.action.startsWith("dep-to:");
    setRecentWorkKind(isDependencyChange?"dependency":"created");
    setRecentWorkId(result.workId);
    revealWorkInTable(result.workId,!isDependencyChange);
   }else if(editor.action.startsWith("work:")){
    const correctedId=editor.action.slice(5);
    const previousWork=project?.items.find((item:any)=>item.id===correctedId);
    const updatedProject=result.state.projects.find((p:any)=>p.id===formProject);
    const correctedWork=updatedProject?.items.find((item:any)=>item.id===correctedId);
    // Any direct duration or deadline edit deserves a fresh calculation,
    // even when opened from Gantt or ordinary table rather than an impact
    // warning. State/assignee-only edits keep their current view.
    const scheduleFieldsChanged=previousWork&&correctedWork&&(
     (previousWork.estimateDays??1)!==(correctedWork.estimateDays??1)||
     (previousWork.dueDate??null)!==(correctedWork.dueDate??null)||
     (previousWork.durationUnit??"elapsed_days")!==(correctedWork.durationUnit??"elapsed_days")||
     (previousWork.calendarBasis?.id??null)!==(correctedWork.calendarBasis?.id??null)||
     (previousWork.calendarBasis?.version??null)!==(correctedWork.calendarBasis?.version??null));
    // Consecutive corrections must be compared with the plan before the
    // original edit. A comparison with the immediate prior revision hides
    // earlier shifts and makes an unfinished correction look completed.
    const fromImpactList=Boolean(recentScheduleEffect&&
     (recentWorkKind==="dependency"||recentWorkKind==="adjusted")&&
     recentScheduleEffect.affectedIds.includes(correctedId));
    if(scheduleFieldsChanged||fromImpactList){
     const updatedPlan=updatedProject?scheduleProject(updatedProject,{calendarLibrary:data.calendarLibrary??[]}):null;
     const continued=fromImpactList&&updatedPlan?continueWorkCorrection(
      recentPlanBefore,{projectId:formProject,workId:correctedId,
       revision:data.revision,nextRevision:result.state.revision,afterPlan:updatedPlan,
       recordCorrection:Boolean(scheduleFieldsChanged)}
     ):null;
     const nextContext=continued||(plannedPlan&&updatedPlan?startWorkCorrection({
      projectId:formProject,workId:correctedId,revision:result.state.revision,
      beforePlan:plannedPlan,afterPlan:updatedPlan
     }):null);
     setRecentPlanBefore(nextContext);
     setRecentWorkKind("adjusted");
     setRecentWorkId(nextContext?.workId||correctedId);
     revealWorkInTable(nextContext?.workId||correctedId,false);
     if(continued){
      // Keep the result visible immediately on a compact Windows display.
      // The detailed comparison remains in the work card below the table
      // header, but a user must not need to scroll to confirm the series.
      setMessage("Последовательные правки: "+continued.followups.length+
       ". Сравнение с планом до первой правки. Сейчас затронуто работ: "+
       continued.change.affectedTotal+
       ". Изменения в черновике, сохраните их на диск отдельно.");
      // Show the remaining affected works, not the now-obsolete list from
      // the last change. Zero remaining differences returns to all works.
      setWorkImpactOnly(continued.change.affectedTotal>0);
      if(continued.change.affectedTotal>0)setWorkSort("impact");
     }
    }
   }
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
    "Изменения сохранены на этом компьютере.";
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
 // The portable carrier is IWXA package 1.0; the Atlas object profile is
 // consumer-local. Native Save As owns the file; the Atlas store remains owner.
 const exportIwxa=async()=>{
  if(!requireClosedForm()||busyRef.current||!ready)return;
  if(dirty||!persisted){issue(Error("Сначала сохраните текущие проекты."));return}
  busyRef.current=true;setBusy(true);
  try{
   const startedWith=latestSnapshot.current,expectedGeneration=generation;
   const checked=await readSavedSnapshotForReference({invoke,expectedGeneration,
    snapshot:startedWith,signature:snapshotText,
    readValidated:(raw:Atlas)=>deserialize(JSON.stringify(raw))});
   const archive=await buildIwxaPortfolio(checked);
   if(latestSnapshot.current!==startedWith||dirtyRef.current||editorOpenRef.current)
    throw Error("Проекты изменились во время подготовки архива. Сохранение отменено.");
   const message=await invoke<string|null>("atlas_export_iwxa",{
    expectedGeneration,archiveBase64:toBase64(archive)});
   if(message===null){setError("");return}
   setSavedRefPreview(null);
   setMessage(message+" В Admin Center откройте «Планы Atlas» → «Открыть портфель Atlas» и выберите этот файл. Это просмотр копии для подготовки поручений, без синхронизации и передачи прав.");
   setError("");
  }catch(e){issue(e)}finally{busyRef.current=false;setBusy(false)}
 };
 const importIwxa=async()=>{
  if(!requireClosedForm()||busyRef.current||!ready)return;
  if(dirty){issue(Error("Сначала сохраните изменения или отмените их перед импортом."));return}
  busyRef.current=true;setBusy(true);
  try{
   const startedWith=latestSnapshot.current,expectedGeneration=generation;
   const selected=await invoke<string|null>("atlas_select_iwxa");
   if(selected===null)return;
   const imported=await readIwxaPortfolio(fromBase64(selected));
   if(latestSnapshot.current!==startedWith||dirtyRef.current||editorOpenRef.current)
    throw Error("Проекты изменились во время выбора архива. Текущие данные не затронуты.");
   const head=await invoke<OpenResult>("atlas_open");
   if(head.needsConfirmation||head.generation!==expectedGeneration)
    throw Error("Сохранённый портфель изменился. Откройте актуальную редакцию.");
   const {snapshot:next,originalRevision,summary}=prepareImportedSnapshot(
    startedWith,imported.snapshot,undefined,"iwxa.atlas.portfolio/1.0.0");
   setPendingImport({snapshot:next,originalRevision,summary,startedWith,expectedGeneration,
    format:"iwxa"});
   setMessage("");setError("");
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
   setPendingImport({snapshot:next,originalRevision,summary,startedWith,expectedGeneration:generation,format:"json"});
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
  if(!confirmAction("Обновить открытые источники GitHub? Для репозиториев Atlas также покажет последнюю проверку выбранной ветки. На GitHub ничего не изменится."))return;
  busyRef.current=true;setBusy(true);
  try{
   const startedWith=data;
   const plan=planPublicRefresh(data,{maxAgeMs:0,only:source?[source]:null} as any);
   if(!plan.selected){setMessage("Нет источников для наблюдения.");return}
   const result=await reconcilePublicSources(data,{plan});
   if(latestSnapshot.current!==startedWith)throw Error("Портфель изменён во время обращения к источнику. Наблюдения не применены; повторите сверку.");
   const report=result.report;
   // Failed public reads change attempt/status in the draft; they are not
   // successfully refreshed GitHub observations.
   if(result.state!==data)mutate(result.state,report.failed>0?"":
    "Публичные наблюдения обновлены в черновике. Сохраните результат на диск.");
   if(report.failed>0){
    setMessage("");
    setError((report.rateLimited?
     "GitHub временно ограничил запросы. ":
     "Не удалось проверить все выбранные источники. ")+
     "Обновлено: "+report.updated+"; ошибок: "+report.failed+
     ". Ранее полученные сведения не заменены. Сохраните состояние попытки по необходимости.");
   }
   setRefreshReport(report);
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
  if(!confirmAction("Удалить связь между работами? Atlas пересчитает график. Изменение останется в черновике до сохранения."))return;
  try{
   const next=disconnect(data,project.id,from,to);
   const updatedProject=next.projects.find((item:any)=>item.id===project.id)!;
   mutate(next,"Связь удалена из черновика. Проверьте последствия и сохраните изменение.");
   setRecentPlanBefore(plannedPlan?startWorkCorrection({
    projectId:project.id,workId:to,revision:next.revision,
    beforePlan:plannedPlan,afterPlan:scheduleProject(updatedProject,{calendarLibrary:data.calendarLibrary??[]})
   }):null);
   setRecentWorkKind("dependency");setRecentWorkId(to);
   revealWorkInTable(to,false);
  }catch(e){issue(e)}
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
 const startConnection=()=>{
  if(busyRef.current||!requireClosedForm())return;
  selectProject(null,true);setConnectOpen(true);resetWorkspaceScroll();
 };
 const completeConnection=(preview:any,options:{name:string;selectedRepositories:string[]})=>{
  if(busyRef.current)throw Error("Дождитесь завершения текущего действия.");
  if(!requireClosedForm())throw Error("Сначала закройте открытую форму.");
  const before=latestSnapshot.current;
  const connected=applyPublicProjectPreview(before,preview,options);
  if(connected.state!==before){
   const count=connected.createdIds.length;
   mutate(connected.state,count?
    "Добавлено проектов: "+count+". Сохраните изменения.":
    "Источники обновлены. Сохраните изменения.");
  }else{setMessage("Проект уже подключён. Открыта его существующая карточка.");setError("");}
  selectProject(connected.primaryId,true);
 };
 const includeDiscoveredProject=(ownerProjectId:string,ownerSourceId:string,repository:string)=>{
  if(busyRef.current||!requireClosedForm())return;
  try{
   const result=createProjectFromGitHubCatalog(latestSnapshot.current,ownerProjectId,ownerSourceId,repository);
   if(result.created)
    mutate(result.state,"Проект добавлен. Сохраните изменения.");
   selectProject(result.projectId,true);
  }catch(e){issue(e)}
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
 const inspectWork=(id:string)=>{
  if(!project||!requireClosedForm())return;
  setPreviewWorkRequest(previous=>({id,serial:(previous?.serial??0)+1}));
  setInspector(true);
 };
 const quickWork=(id:string,state:string)=>{
  if(!project||!requireClosedForm()||busyRef.current)return;
  try{mutate(editItem(data,project.id,id,{state}),"Состояние работы изменено в черновике.")}
  catch(e){issue(e)}
 };
 const view=(tabId:Tab)=>{
  if(!requireClosedForm())return;
  resetWorkspaceScroll();
  // Returning from a linked source restores the selected work's search
  // context. Ordinary tab changes leave no retained search.
  setMapSearchReturn(tabId==="overview"&&tab==="sources"&&sourceJump!==null&&
   sourceJump.projectId===project?.id?
   {workId:sourceJump.workId,query:sourceJump.query}:
   tabId==="overview"&&tab==="graph"&&graphJump?.origin==="overview"&&
   graphJump.projectId===project?.id?
   {workId:graphJump.workId,query:graphJump.query}:null);
  setSourceJump(null);
  if(tabId!=="work"){setRecentWorkId(null);setWorkImpactOnly(false);setWorkCriticalOnly(false);
   if(workSort==="impact")setWorkSort("title")}
  if(tabId!=="graph")setGraphJump(null);
  setTab(tabId);setEditor(null);setForecastId(null);
 };
 const goHome=()=>{
  if(!requireClosedForm())return;selectProject(null);setHomeOpen(true);setSettingsOpen(false);
 };
 const goPortfolio=()=>{
  if(!requireClosedForm())return;selectProject(null);setHomeOpen(false);setSettingsOpen(false);
 };
 const goSettings=()=>{
  if(!requireClosedForm())return;
  setSettingsSection("appearance");setSettingsOpen(true);
 };
 const goStorage=()=>{
  if(!requireClosedForm())return;
  setSettingsSection("data");setSettingsOpen(true);
 };
 const toggleNavPanel=()=>{
  if(!navPanelOpen&&window.innerWidth<1150&&!editor)setInspector(false);
  setNavPanelOpen(x=>!x);
 };
 const toggleInspector=()=>{
  if(!inspector&&window.innerWidth<1150)setNavPanelOpen(false);
  setInspector(x=>!x);
 };
 const goProjectTab=(id:Tab)=>{
  if(!project||!requireClosedForm())return;
  setHomeOpen(false);setSettingsOpen(false);view(id);
 };
 const goResources=()=>{
  if(project)goProjectTab("resources");else goPortfolio();
 };
 const goSources=()=>{
  if(project)goProjectTab("sources");else goPortfolio();
 };
 const showPendingWorks=()=>{
  if(!project||!requireClosedForm())return;
  // Open all waiting work, not the user's last table search.
  // Navigation remains read-only and reuses the established filter.
  view("work");
  setWorkFilter("all");setWorkTargetFilter("all");setWorkObservationFilter("all");
  setWorkQuery("");setWorkDeadlineFilter("all");setWorkDependencyFilter("has_pending");
  setWorkImpactOnly(false);setWorkCriticalOnly(false);
  if(workSort==="impact")setWorkSort("title");
  setWorkLimit(200);
 };
 const showOverdueWorks=()=>{
  if(!project||!overdueWorkFinishes.size||!requireClosedForm())return;
  // Both overview and table lead to the same dated CPM result; stale table
  // queries and unrelated filters must not hide overdue work in large plans.
  view("work");
  setWorkFilter("all");setWorkTargetFilter("all");setWorkObservationFilter("all");
  setWorkDependencyFilter("all");setWorkQuery("");setWorkDeadlineFilter("overdue");
  setWorkImpactOnly(false);setWorkCriticalOnly(false);
  if(workSort==="impact")setWorkSort("title");
  setWorkLimit(200);
  // Focus the first row in the table's sort order, not a distant CPM row.
  setWorkReturnId(firstSortedMatchingWorkId(project.items,overdueWorkFinishes,
   workSort==="impact"?"title":workSort));
 };
 const showCriticalWorks=()=>{
  if(!project||!criticalWorkIds.size||!requireClosedForm())return;
  // This is the same read-only CPM that feeds the dependency map and Gantt.
  // Clear unrelated filters so the critical path cannot appear incomplete.
  view("work");
  setWorkFilter("all");setWorkTargetFilter("all");setWorkObservationFilter("all");
  setWorkDependencyFilter("all");setWorkDeadlineFilter("all");
  setWorkQuery("");setWorkImpactOnly(false);setWorkCriticalOnly(true);
  if(workSort==="impact")setWorkSort("title");
  setWorkLimit(200);
  setWorkReturnId(firstSortedMatchingWorkId(project.items,criticalWorkIds,
   workSort==="impact"?"title":workSort));
 };
 const rememberWorkTable=(workId:string)=>{
  if(!project||tab!=="work")return;
  workNavigationContext.current={
   projectId:project.id,workId,revision:data.revision,query:workQuery,
   filter:workFilter,targetFilter:workTargetFilter,
   observationFilter:workObservationFilter,dependencyFilter:workDependencyFilter,
   deadlineFilter:workDeadlineFilter,criticalOnly:workCriticalOnly,
   impactOnly:workImpactOnly,sort:workSort,limit:workLimit
  };
 };
 const returnToWorkTable=(workId:string,fallbackQuery:string)=>{
  if(!project||!requireClosedForm())return;
  const context=workNavigationContext.current;
  // A changed project revision must not revive obsolete impact or critical
  // filters. The work search is retained even when this context is stale.
  const valid=context!==null&&context.projectId===project.id&&
   context.workId===workId&&context.revision===data.revision;
  view("work");
  if(valid&&context){
   setWorkQuery(context.query);setWorkFilter(context.filter);
   setWorkTargetFilter(context.targetFilter);
   setWorkObservationFilter(context.observationFilter);
   setWorkDependencyFilter(context.dependencyFilter);
   setWorkDeadlineFilter(context.deadlineFilter);
   setWorkCriticalOnly(context.criticalOnly);
   setWorkImpactOnly(context.impactOnly);
   setWorkSort(context.sort);setWorkLimit(context.limit);
  }else setWorkQuery(fallbackQuery);
  setWorkReturnId(workId);
  workNavigationContext.current=null;
 };
 const openLinkedSource=(workId:string,query:string,origin:"overview"|"work"|"graph"="overview")=>{
  if(!project||!requireClosedForm())return;
  if(origin==="work")rememberWorkTable(workId);
  // Preserve the diagram's original return target before switching tabs.
  const graphOrigin=origin==="graph"?graphJump?.origin||"overview":null;
  view("sources");
  setSourceJump({projectId:project.id,workId,query,origin,graphOrigin});
 };
 const returnToLinkedWork=()=>{
  if(!project||sourceJump?.origin!=="work")return;
  returnToWorkTable(sourceJump.workId,sourceJump.query);
 };
 const openWorkGraph=(workId?:string,query?:string,origin:"overview"|"work"|"board"="overview")=>{
  if(!project||!requireClosedForm())return;
  const work=workId&&project.items.find((item:any)=>item.id===workId);
  if(origin==="work"&&work)rememberWorkTable(work.id);
  view("graph");
  setGraphJump(work?{projectId:project.id,workId:work.id,query:query||"",origin}:null);
 };
 const returnToLinkedGraph=()=>{
  if(!project||sourceJump?.origin!=="graph")return;
  openWorkGraph(sourceJump.workId,sourceJump.query,sourceJump.graphOrigin||"overview");
 };
 const returnFromWorkGraph=()=>{
  if(graphJump?.origin==="work")returnToWorkTable(graphJump.workId,graphJump.query);
  else if(graphJump?.origin==="board"){
   setWorkReturnId(graphJump.workId);
   view("board");
  }else view("overview");
 };
 useEffect(()=>{
  const key=(event:KeyboardEvent)=>{
   // Agent retains its own shortcuts unless keyboard focus is inside Atlas.
   // composedPath sees Shadow DOM descendants even after event retargeting.
   if(embedded && (!rootRef.current || !event.composedPath().includes(rootRef.current)))return;
   const ctrl=event.ctrlKey||event.metaKey,code=event.code;
   // All signed-file decisions and project imports are modal.
   if(signedResultPreview!==null){
    if(event.key==="Escape"&&!busyRef.current){
     event.preventDefault();setSignedResultPreview(null);return;
    }
    if(ctrl||event.key==="Escape")event.preventDefault();
    return;
   }
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
   if(ctrl&&!event.shiftKey&&code==="KeyK"){
    event.preventDefault();
    if(!embedded&&!navPanelOpen)setNavPanelOpen(true);
    requestAnimationFrame(()=>rootRef.current?.querySelector<HTMLInputElement>("#atlas-search")?.focus());
   }
  };
  window.addEventListener("keydown",key);return ()=>window.removeEventListener("keydown",key);
 });
 if(!ready)return <main className="entry">
  <div className="entry-card"><img className="logo-symbol" src={logoUrl} alt="" aria-hidden="true" /><h1>IWXA Atlas <em>{atlasVersionLabel}</em></h1>
   <p>{recovery?"Найдена предыдущая исправная версия портфеля. Восстановление выполняется только по вашему решению.":"Самостоятельное локальное приложение для Windows. Данные принадлежат пользователю."}</p>
   {error&&<p role="alert" className="error">{error}</p>}
   {recovery&&<Action onClick={()=>void restore()} primary disabled={busy}>Восстановить сохранённую версию</Action>}
   {!native&&<p className="minor">Браузерный просмотр не подключается к локальным данным Atlas. Для разработки используется Tauri.</p>}
   {native&&!recovery&&!error&&<p className="minor">Открытие нативного хранилища…</p>}
  </div>
 </main>;
 return <div ref={rootRef}
  className={"app-shell"+(inspector?"":" no-inspector")+(editor?" editor-active":"")+
   (embedded?" atlas-embedded":" atlas-v6-shell")+(connectOpen?" atlas-connect-focused":"")}
  style={!embedded?{"--atlas-v6-dock-width":inspectorWidth+"px"} as React.CSSProperties:undefined}>
  {!embedded&&<AtlasChromeTopbar logoUrl={logoUrl}
   statusLabel={editor?"Форма не применена":dirty?"Не сохранено":persisted?"Сохранено":"Новый портфель"}
   canBack={routeControls.back}
   canForward={routeControls.forward} onBack={()=>moveRoute(-1)} onForward={()=>moveRoute(1)}
   onTogglePanel={toggleNavPanel}
   onToggleInspector={toggleInspector} inspector={inspector}
   onHome={goHome} onPortfolio={goPortfolio} onGantt={()=>goProjectTab("timeline")}
   onReality={()=>goProjectTab("reality")}
   onNewProject={()=>openEditor("new")} onNewWork={()=>openEditor("item")}
   onEditProject={()=>openEditor("project-edit")}
   onSave={()=>void save()} canSave={dirty&&!busy&&!editor}
   canEdit={Boolean(project)&&!busy&&!editor}
   onExportIwxa={()=>void exportIwxa()} onImportIwxa={()=>void importIwxa()}
   onExportJson={()=>void exportJson()} onImportJson={()=>void importJson()}
   onHistory={()=>void showNativeHistory()}
   canExport={!busy&&!dirty&&!editor&&persisted}
   canImport={!busy&&!editor&&pendingImport===null}
   onSignedFile={()=>signedResultFileInput.current?.click()}
   signedFileAvailable={signedFileOwnerAvailable}
   canSignedFile={!busy&&!dirty&&!editor&&persisted&&pendingImport===null&&
    signedResultPreview===null}
   onSettings={goSettings}/>}
  <div className="atlas-v6-layout">
   {!embedded&&<AtlasChromeRail logoUrl={logoUrl}
    active={settingsOpen?(settingsSection==="data"?"store":"settings"):!project?(homeOpen?"home":"portfolio"):tab}
    hasProject={!!project} onHome={goHome} onPortfolio={goPortfolio}
    onWork={()=>goProjectTab("work")} onGantt={()=>goProjectTab("timeline")}
    onGraph={()=>goProjectTab("graph")} onReality={()=>goProjectTab("reality")}
    onChanges={()=>goProjectTab("changes")} onStore={goStorage}
    onResources={goResources} onSources={goSources} onSettings={goSettings}/>}

  <aside className={"sidebar"+(!embedded&&!navPanelOpen?" atlas-v6-sidebar-collapsed":"")}>
   {embedded&&<div className="brand"><img className="logo-symbol" src={logoUrl} alt="" aria-hidden="true" /><div><strong>Atlas</strong><small>IWXA · {atlasVersionLabel}</small></div></div>}
   {!embedded&&<label className="search atlas-v6-search"><span>⌕</span><input id="atlas-search" aria-label="Найти проект по работе, этапу или источнику"
      placeholder="Проект, работа или источник"
      value={search} onChange={e=>{setSearch(e.target.value);setPortfolioLimit(150);setSidebarLimit(120)}}/><kbd>Ctrl K</kbd></label>}
   <div className="atlas-v6-nav-scroll">
   <nav className="main-nav" aria-label="Основная навигация">
    {!embedded&&<button aria-label="Открыть главную Atlas" className={!project&&homeOpen&&!settingsOpen?"nav-current":""}
      onClick={goHome}><AtlasGlyph name="home"/><span>Главная</span></button>}
    <button aria-label="Открыть портфель проектов" className={!active?"nav-current":""}
      onClick={embedded?()=>selectProject(null):goPortfolio}><AtlasGlyph name="portfolio"/><span>Портфель проектов</span><b>{data.projects.length}</b></button>
    <button aria-label="Создать проект" onClick={()=>openEditor("new")}>＋ <span>Создать проект</span></button>
    <button aria-label="Подключить существующий проект" onClick={startConnection}>↗ <span>Подключить проект</span></button>
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
   {!embedded&&project&&<nav className="atlas-v6-subviews" aria-label="Разделы текущего проекта">
    <div className="sidebar-label">Разделы проекта</div>
    {tabs.map(item=><button key={item.key} type="button" aria-current={tab===item.key?"page":undefined}
     className={"atlas-v6-subview"+(tab===item.key&&!settingsOpen?" selected":"")}
     onClick={()=>goProjectTab(item.key)}>{item.title}</button>)}
   </nav>}
   </div>
   <div className="sidebar-foot"><div className="foot-title">{embedded?"Atlas в Personal Agent":"Локальный портфель"}</div><p>{embedded?"Работайте с проектами в своём рабочем пространстве.":"Проекты хранятся на этом компьютере. Сохраняйте изменения, когда работа завершена."}</p></div>
  </aside>
  <main className="workspace">
   <header className="commandbar">
    {embedded&&<label className="search"><span>⌕</span><input id="atlas-search" aria-label="Найти проект по работе, этапу или источнику"
      placeholder="Проект, работа или источник"
      value={search} onChange={e=>{setSearch(e.target.value);setPortfolioLimit(150);setSidebarLimit(120)}}/><kbd>Ctrl K</kbd></label>}
    <div className="toolbar-actions">
     <Badge tone={editor||dirty?"warning":persisted?"good":"neutral"}>{editor?"Форма не применена":dirty?"Не сохранено":persisted?"Сохранено":"Новый портфель"}</Badge>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy||!!editor} title={editor?"Сначала примените открытую форму":"Ctrl+S"}>Сохранить</Action>
     {signedFileOwnerAvailable&&
      <input type="file" ref={signedResultFileInput} accept=".iwxa"
       aria-label="Выбрать подписанный Result .iwxa"
       hidden onChange={event=>{
        const file=event.currentTarget.files?.[0]??null;
        event.currentTarget.value="";
        void inspectSignedResultFile(file);
       }}/>}
     <details ref={fileMenuRef} className="atlas-file-menu" onKeyDown={event=>{
      if(event.key==="Escape"){
       event.stopPropagation();fileMenuRef.current?.removeAttribute("open");
       fileMenuRef.current?.querySelector("summary")?.focus();
      }
     }}>
      <summary>Сохранение и копии</summary>
      <div className="atlas-file-menu-actions">
       {!embedded&&<>
        <Action onClick={()=>{fileMenuRef.current?.removeAttribute("open");void exportIwxa()}}
         disabled={busy||dirty||!!editor||!persisted}>Сохранить архив .iwxa</Action>
        <Action onClick={()=>{fileMenuRef.current?.removeAttribute("open");void importIwxa()}}
         disabled={busy||!!editor||pendingImport!==null}>Открыть архив .iwxa</Action>
       </>}
       <Action onClick={()=>{fileMenuRef.current?.removeAttribute("open");void exportJson()}}
        disabled={busy||dirty||!!editor||!persisted}>Сохранить копию JSON</Action>
       <Action onClick={()=>{fileMenuRef.current?.removeAttribute("open");void importJson()}}
        disabled={busy||!!editor||pendingImport!==null}>Открыть копию JSON</Action>
       {signedFileOwnerAvailable&&<Action
        onClick={()=>{fileMenuRef.current?.removeAttribute("open");signedResultFileInput.current?.click()}}
        disabled={busy||dirty||!!editor||pendingImport!==null||signedResultPreview!==null||!persisted}
        title="Только оригинальный T3 и действующие полномочия получателя">
        Принять подписанный Result .iwxa</Action>}
       <Action onClick={()=>{fileMenuRef.current?.removeAttribute("open");void showNativeHistory()}}
        disabled={busy||dirty||!!editor||!persisted||savedVersions!==null}>История сохранений</Action>
       <p className="atlas-file-menu-note">{signedFileOwnerAvailable
        ?"Подписанный Result принимает оригинальный T3: сначала проверка подписи и текста, затем отдельное подтверждение и сохранение в Atlas."
        :embedded
         ?"Файловый обмен .iwxa доступен в самостоятельном Atlas. Встроенный режим работает через разрешения своей программы."
         :"Архив .iwxa переносит проекты между копиями Atlas. История сохранений в него не входит. В совместимом Admin Center архив открывается для просмотра и подготовки поручений. "}</p>
      </div>
     </details>
     <button disabled={!!editor} className="icon-button inspector-button" aria-label={inspector?"Скрыть инспектор":"Показать инспектор"}
      title="Инспектор" onClick={toggleInspector}>◧</button>
    </div>
   </header>
   {error&&<div className="alert error" role="alert">{error}<button onClick={()=>setError("")} aria-label="Закрыть сообщение">×</button></div>}
   {message&&<div className="alert notice" role="status">{message}<button onClick={()=>setMessage("")} aria-label="Закрыть сообщение">×</button></div>}
   {settingsOpen&&!embedded?<AtlasSettings key={settingsSection} initialSection={settingsSection}
    version={atlasPackage.version}
    projectCount={data.projects.length}
    workCount={data.projects.reduce((n:number,p:any)=>n+p.items.length,0)}
    revision={data.revision} saved={persisted} dirty={dirty} native={native}
    t3Available={signedFileOwnerAvailable} onBack={()=>setSettingsOpen(false)} onHome={goHome}
    onSave={()=>void save()} canSave={dirty&&!busy&&!editor}
    onExport={()=>void exportIwxa()} onImport={()=>void importIwxa()}
    onHistory={()=>void showNativeHistory()} onPortfolio={goPortfolio}
    canImport={!busy&&!editor&&pendingImport===null}/>:
   !project?(homeOpen&&!embedded?
    <AtlasDashboard data={data} dates={dates} resources={resources}
     reviews={reviewRows} sourceQueue={sourceQueue} ecosystemRows={ecosystemRows} dirty={dirty}
     onPortfolio={goPortfolio} onNewProject={()=>openEditor("new")}
     onConnect={()=>{goPortfolio();startConnection();}}
     onOpenProject={(id,target="overview")=>openProjectTab(id,target)}
     onResources={goPortfolio}
     onCalendar={()=>project?goProjectTab("timeline"):data.projects.length?
       openProjectTab(data.projects[0].id,"timeline"):goPortfolio()}
     onReview={()=>reviewRows.length?openProjectTab(reviewRows[0].projectId,"changes"):goPortfolio()}
     onEcosystem={goPortfolio} onHistory={id=>openProjectTab(id,"history")}/>:
   <>
    <div className="page-heading"><div><small>Ваше рабочее пространство</small><h1>Портфель проектов</h1>
      <p>Что должно быть, что известно и какие решения влияют на планы.</p>
      <div className="atlas-portfolio-search-feedback">
       <p className="atlas-portfolio-find-count" role="status" aria-live="polite"
        aria-label={portfolioFindSummary}>{portfolioFindSummary}</p>
       {search.trim()&&<button type="button" className="text-link atlas-portfolio-clear"
        aria-label="Очистить поиск проектов"
        onClick={()=>{
         setSearch("");setPortfolioStatus("all");setPortfolioLimit(150);setSidebarLimit(120);
         document.getElementById("atlas-search")?.focus();
        }}>Показать все проекты</button>}
      </div>
      {search.trim()&&filtered.length===1&&<div className="atlas-portfolio-quick-hit"
       role="group" aria-label="Найденный проект">
       <strong title={filtered[0].name}>{filtered[0].name}</strong>
       {portfolioReasons.get(filtered[0].id)&&<small
        title={portfolioReasons.get(filtered[0].id)}>{portfolioReasons.get(filtered[0].id)}</small>}
       <button type="button" className="text-link"
        aria-label={"Открыть найденный проект "+filtered[0].name}
        onClick={()=>selectProject(filtered[0].id)}>Открыть проект</button>
       {portfolioQuickWork&&<button type="button" className="text-link"
        aria-label={"Перейти к найденной работе "+portfolioQuickWork.title}
        onClick={()=>openPortfolioWorkResults(filtered[0].id,portfolioQuickWork.title,portfolioQuickWork.id)}>К работе</button>}
       {!portfolioQuickWork&&(portfolioWorkMatches.get(filtered[0].id)||0)>0&&
        <button type="button" className="text-link"
         aria-label={"Показать найденные работы проекта "+filtered[0].name}
         onClick={()=>openPortfolioWorkResults(filtered[0].id,search)}>
         К работам ({portfolioWorkMatches.get(filtered[0].id)})
        </button>}
      </div>}
      {search.trim()&&filtered.length>1&&<div className="atlas-portfolio-quick-list"
       role="group" aria-label="Быстрый переход к найденным проектам">
       {filtered.slice(0,3).map((p:any,index:number)=><div key={p.id} className="atlas-portfolio-quick-hit">
        <strong title={p.name}>{p.name}</strong>
        {portfolioReasons.get(p.id)&&<small
         title={portfolioReasons.get(p.id)}>{portfolioReasons.get(p.id)}</small>}
        <button type="button" className="text-link"
         aria-label={"Открыть найденный проект "+p.name+" (результат "+(index+1)+")"}
         onClick={()=>selectProject(p.id)}>Открыть проект</button>
        {(portfolioWorkMatches.get(p.id)||0)>0&&<button type="button" className="text-link"
         aria-label={"Показать найденные работы проекта "+p.name}
         onClick={()=>openPortfolioWorkResults(p.id,search)}>
         К работам ({portfolioWorkMatches.get(p.id)})
        </button>}
       </div>)}
       {filtered.length>3&&<small className="atlas-portfolio-more">
        Ещё {filtered.length-3} проектов в списке ниже
       </small>}
      </div>}</div>
      <div className="button-row">
       <Action onClick={startConnection}>Подключить проект</Action>
       <Action onClick={()=>openEditor("new")} primary title="Ctrl+N">＋ Новый проект</Action>
      </div></div>
    {connectOpen&&<ProjectConnect snapshot={data} onApply={completeConnection}
     onCancel={()=>setConnectOpen(false)} disabled={busy||!!editor}/>}
    {!connectOpen&&data.projects.length===0&&<section className="surface atlas-first-start">
     <h2>Начать работу с Atlas</h2>
     <p>Создайте собственный проект или подключите действующую разработку. Перед подключением Atlas покажет найденные сведения.</p>
     <div className="button-row">
      <Action primary onClick={startConnection}>Подключить существующий проект</Action>
      <Action onClick={()=>openEditor("new")}>Создать новый проект</Action>
      {!embedded&&<Action onClick={()=>void importIwxa()}>Открыть архив .iwxa</Action>}
     </div>
    </section>}
    <div className="metric-grid">
     <Metric value={data.projects.length} label="Проектов"/>
     <Metric value={data.projects.filter((p:any)=>p.status==="active").length} label="В работе"/>
     <Metric value={resources.totals.potentialConflicts} label="Плановые перегрузки"/>
     <Metric value={reviews.totals?.needsDecision??0} label="Решений по плану"/>
    </div>
    <section className="surface atlas-portfolio-command" aria-label="Очередь внимания по портфелю">
     <div className="section-heading"><div><h2>Что требует внимания</h2>
      <p>Причины, сроки и зависимые проекты из существующих расчётов Atlas. Разбор не применяет изменения автоматически.</p></div></div>
     <div className="atlas-command-controls">
      <label>Причина <select aria-label="Фильтр причин портфеля" value={attentionFilter}
       onChange={event=>{setAttentionFilter(event.target.value);setAttentionLimit(8)}}>
       <option value="all">Все</option><option value="blocked">Блокировки</option>
       <option value="dates">Сроки</option><option value="evidence">Факты</option>
       <option value="decisions">Решения</option><option value="sources">Источники</option>
      </select></label>
      <label>Поиск по причинам <input type="search" aria-label="Поиск в очереди внимания"
       placeholder="Проект или проблема" value={attentionQuery}
       onChange={event=>{setAttentionQuery(event.target.value);setAttentionLimit(8)}}/></label>
      <small>Найдено {attentionRows.length} из {portfolioCommand.rows.length} проектов</small>
     </div>
     <p className="minor">Блокировки: {portfolioCommand.totals.blocked} · Риски срока: {portfolioCommand.totals.dates} ·
      Требования к проверке: {portfolioCommand.totals.evidence} · Без утверждённых критериев: {portfolioCommand.totals.missingCriteria} ·
       Предложения к решению: {portfolioCommand.totals.decisions}</p>
     {attentionRows.length?<div className="atlas-command-list">
      {attentionRows.slice(0,attentionLimit).map((row:any)=><article className="atlas-command-entry" key={row.id}>
       <div className="atlas-command-project"><button type="button" className="text-link"
        onClick={()=>selectProject(row.id)}>{row.name}</button>
        <small>{row.affected>0?"Может затронуть проектов: "+row.affected:"Нет вычисленных зависимых проектов"}</small>
       </div>
       <div className="atlas-command-reason"><strong>{row.primary.label}</strong>
        {row.primary.detail&&<p>{row.primary.detail}</p>}
        {row.signals.length>1&&<details><summary>Другие причины ({row.signals.length-1})</summary>
         <ul>{row.signals.slice(1,6).map((signal:any,i:number)=><li key={signal.kind+"-"+i}>
          <button className="text-link" type="button"
           aria-label={"Разобрать причину: "+row.name+" — "+signal.label}
           onClick={()=>inspectPortfolioSignal(row.id,signal)}>
           {signal.label}</button>{signal.detail&&<small>{signal.detail}</small>}
         </li>)}</ul>
        </details>}
       </div>
       <div className="atlas-command-due"><small>Расчётный финиш</small>
        <strong>{row.projectedFinish||"Неизвестен"}</strong>
        {row.slip>0&&<small>Риск +{row.slip} дн. к контрольной дате</small>}
       </div>
       <div className="atlas-command-actions"><Action primary
         ariaLabel={"Разобрать причину: "+row.name+" — "+row.primary.label}
         onClick={()=>inspectPortfolioSignal(row.id,row.primary)}>Разобрать</Action></div>
      </article>)}
     </div>:<Fallback message="По выбранной причине проектов не найдено. Попробуйте другой фильтр или поиск."/>}
     {attentionRows.length>attentionLimit&&<Action onClick={()=>setAttentionLimit(n=>Math.min(attentionRows.length,n+8))}>
      Показать ещё ({attentionRows.length-attentionLimit})</Action>}
     <p className="minor">Заявления о реализации, календарные оценки и отсутствие сигналов не подтверждают фактическую приёмку результата.</p>
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Проекты и последствия</h2><p>Перейдите к проекту, чтобы увидеть точные причины и объекты.</p></div>
      {data.projects.length>1&&<Action onClick={()=>openEditor("portfolio-link")}>Связать проекты</Action>}</div>
     <div className="filter-row"><label>Показывать <select value={portfolioStatus} onChange={ev=>{setPortfolioStatus(ev.target.value);setPortfolioLimit(150)}}>
      <option value="active">Активные и запланированные</option><option value="all">Все проекты</option>
      <option value="finished">Завершённые и отменённые</option>
     </select></label></div>
     {filtered.length?<div className="table-scroll"><table><thead><tr><th>Проект</th><th>Состояние</th><th>Требует внимания</th><th>Расчётный срок</th><th>Риск срока</th><th>Действия</th></tr></thead>
      <tbody>{filtered.slice(0,portfolioLimit).map((p:any)=>{
       const imp=impactByProject.get(p.id)!,row=dates.byId.get(p.id);
       return <tr key={p.id}><td><button className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button>
        <small>{p.goal||"Цель не задана"}</small>
        {portfolioReasons.get(p.id)&&<small className="atlas-portfolio-match-reason"
         title={portfolioReasons.get(p.id)}>{portfolioReasons.get(p.id)}</small>}
        {search.trim()&&(portfolioWorkMatches.get(p.id)||0)>0&&
         <button type="button" className="text-link atlas-portfolio-work-results"
          aria-label={"Показать найденные работы проекта "+p.name}
          onClick={()=>openPortfolioWorkResults(p.id,search)}>
          Работы по запросу: {portfolioWorkMatches.get(p.id)}
         </button>}</td>
        <td><Badge>{statuses[p.status]||p.status}</Badge></td><td className="atlas-portfolio-attention">
          {!(p.targets||[]).some((t:any)=>t.intent==="committed")?<button type="button" className="text-link"
           aria-label={"Уточнить утверждённые требования проекта "+p.name}
           onClick={()=>openProjectTab(p.id,"overview")}>{(p.targets||[]).length?"Нет утверждённых требований":"Требования не заданы"}</button>:
           imp.attention>0?<button type="button" className="text-link"
           aria-label={"Проверить требования проекта "+p.name}
           onClick={()=>openProjectTab(p.id,"reality")}>Проверить {imp.attention} требований</button>:
           <span>Нет замечаний по имеющимся требованиям</span>}
          {imp.sourceIssues.length>0&&<button type="button" className="text-link"
           aria-label={"Проверить источники проекта "+p.name}
           onClick={()=>openProjectTab(p.id,"sources")}>Проблемные источники: {imp.sourceIssues.length}</button>}
         </td>
        <td title={row?.notes?.join("; ")||""}>{projectedFinishLabel(row)}</td><td>{row?.deadlineSlipDays==null?"Неизвестно":row.deadlineSlipDays+" дн."}</td>
        <td><Action onClick={()=>selectProject(p.id)}>Открыть</Action><Action onClick={()=>removeProject(p.id)}>Удалить</Action></td></tr>;
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
    <section className="surface atlas-ecosystem-overview" aria-label="Карта разработки по проектам и GitHub">
     <div className="section-heading"><div><h2>Карта разработки</h2>
      <p>Продукты, источники и открытые вопросы в одном портфеле. Зелёная сборка не означает принятую поставку.</p></div></div>
     <div className="summary-line">
      <span>Проектов: {ecosystem.totals.projects}</span>
      <span>С источниками GitHub: {ecosystem.totals.connected}</span>
      <span>Заблокировано работ: {ecosystem.totals.blocked}</span>
      <span>Обязательных требований: {ecosystem.totals.requirements}</span>
      <span>Зависимостей: {ecosystem.totals.dependencies}</span>
     </div>
     <div className="filter-row">
      <label>Владелец GitHub <select aria-label="Владелец источников на карте разработки"
       value={ecosystem.owners.includes(ecosystemOwner)?ecosystemOwner:"all"}
       onChange={event=>{setEcosystemOwner(event.target.value);setEcosystemLimit(36)}}>
       <option value="all">Все проекты</option>
       {ecosystem.owners.map(owner=><option value={owner} key={owner}>{owner}</option>)}
      </select></label>
      <label>Найти продукт <input aria-label="Поиск на карте разработки" type="search"
       placeholder="Проект или репозиторий" value={ecosystemQuery}
       onChange={event=>{setEcosystemQuery(event.target.value.slice(0,240));setEcosystemLimit(36)}}/></label>
      <small>Показано {Math.min(ecosystemRows.length,ecosystemLimit)} из {ecosystemRows.length}</small>
     </div>
     {ecosystemRows.length?<div className="table-scroll"><table aria-label="Продукты и связанные репозитории">
      <thead><tr><th>Продукт или проект</th><th>Исходники</th><th>Работы</th>
       <th>Результаты и решения</th><th>Связи</th><th>Действие</th></tr></thead>
      <tbody>{ecosystemRows.slice(0,ecosystemLimit).map((r:any)=><tr key={r.id}>
       <td><button type="button" className="text-link" onClick={()=>selectProject(r.id)}>{r.name}</button>
        <small>{statuses[r.status]||r.status}</small></td>
       <td>{r.repositories.length?r.repositories.slice(0,2).map((source:any)=>
        <div key={source.id}>{source.url?
         <a className="text-link" href={source.url} target="_blank" rel="noopener noreferrer">
          {source.locator}</a>:<span>{source.locator}</span>}
         <small>{source.kind==="github_owner"?"Каталог владельца":"Репозиторий"} · {source.observation}</small>
        </div>):<small>Источник ещё не подключён</small>}
        {r.repositories.length>2&&<small>И ещё {r.repositories.length-2} источников</small>}</td>
       <td>{r.works} работ · {r.blocked} заблокированы
        <small>{r.doneClaims} отмечены выполненными, без автоматической приёмки</small></td>
       <td>{r.requirements} требований · {r.findings} фактов
        <small>{r.proposals} предложений к решению · {r.decisions} решений</small></td>
       <td>{r.predecessors} входящих · {r.downstream} исходящих</td>
       <td><Action onClick={()=>openProjectTab(r.id,r.sourcesMissing?"sources":"overview")}>Открыть</Action></td>
      </tr>)}</tbody></table></div>:
      <Fallback message="По выбранному фильтру проектов нет. Добавьте проект и подключите его источники."/>}
     {ecosystemRows.length>ecosystemLimit&&<Action onClick={()=>setEcosystemLimit(n=>Math.min(ecosystemRows.length,n+36))}>
      Показать ещё ({ecosystemRows.length-ecosystemLimit})</Action>}
     <p className="minor">Для портфеля IWXA создайте проект «IWXA», добавьте в его источниках публичного владельца GitHub и обновите список. Затем включайте нужные репозитории как отдельные проекты; приватные продукты добавляются вручную или через разрешённый host.</p>
    </section>
    <section className="surface">
     <div className="section-heading"><div><h2>Источники проектов</h2><p>Atlas проверяет открытые репозитории GitHub по вашему запросу. Ничего в них не меняет.</p></div>
      <Action onClick={()=>void syncPublic()} disabled={busy||!sourceQueue.bindings}>Проверить обновления</Action></div>
     {refreshReport&&<p className="minor">Последняя попытка: {refreshReport.updated} обновлено · {refreshReport.failed} ошибок · {refreshReport.remaining} отложено.</p>}
     <div className="summary-line"><span>Всего привязок: {sourceQueue.bindings}</span><span>Требуют проверки: {sourceQueue.pending}</span><span>Ошибки: {sourceQueue.errors}</span></div>
     {sourceQueue.rows.slice(0,sourceLimit).map((r:any,i:number)=><div key={i} className="attention-row"><div><strong>{r.locator}{r.branch?" · "+r.branch:""}</strong><small>{r.error?"Ошибка":r.stale?"Требует обновления":"Наблюдался"} · {r.count} привязок</small></div>
      <Action onClick={()=>selectProject(r.projectId)}>Открыть</Action></div>)}
     {sourceQueue.rows.length>0&&<p className="minor">Показано {Math.min(sourceLimit,sourceQueue.rows.length)} из {sourceQueue.rows.length} источников.</p>}
     {sourceQueue.rows.length>sourceLimit&&<Action onClick={()=>setSourceLimit(n=>Math.min(sourceQueue.rows.length,n+15))}>Показать ещё источники ({sourceQueue.rows.length-sourceLimit})</Action>}
    </section>
    <section className="surface">
     <button className="text-link" onClick={()=>setShowDetails(!showDetails)}>{showDetails?"Скрыть":"Показать"} межпроектные зависимости</button>
     {showDetails&&<PortfolioNetworkMap snapshot={data} onOpenProject={id=>selectProject(id)}/>}
     {showDetails&&<div className="table-scroll"><table><thead><tr><th>От проекта</th><th>К проекту</th><th>Условие</th><th>Действие</th></tr></thead><tbody>
      {(data.portfolioLinks||[]).map((l:any)=><tr key={l.id}><td>{data.projects.find((p:any)=>p.id===l.from)?.name}</td>
       <td>{data.projects.find((p:any)=>p.id===l.to)?.name}</td><td>{l.note||"Зависимость"}</td><td><Action onClick={()=>removePortfolioDependency(l.id)}>Удалить связь</Action></td></tr>)}</tbody></table></div>}
    </section>
   </>):<>
    <div className="page-heading"><div><small>{PROJECT_TYPE_LABELS[project.type]||"Другой проект"}</small>
     <h1>{project.name}</h1><p>{project.goal||"Цель пока не определена"}</p></div>
     <div className="button-row"><Badge>{statuses[project.status]||project.status}</Badge><Action disabled={busy||dirty||!persisted||!!editor} onClick={()=>showSavedReference(project.id)} title="Ctrl+Alt+P · Только сохранённая редакция">Ссылка на проект</Action><Action onClick={()=>openEditor("project-edit")}>Редактировать проект</Action></div>
    </div>
    <nav className="tabbar atlas-compact-tabs" aria-label="Представления проекта">
     {tabs.filter(t=>primaryTabKeys.includes(t.key)).map(t=><button key={t.key}
      type="button" title={t.key==="work"?"Ctrl+1":t.key==="timeline"?"Ctrl+2":undefined}
      aria-current={tab===t.key?"page":undefined} className={tab===t.key?"selected":""}
      onClick={()=>view(t.key)}>{t.title}</button>)}
     <details className="atlas-view-menu" ref={viewMenuRef} onKeyDown={event=>{
      if(event.key==="Escape"){event.stopPropagation();viewMenuRef.current?.removeAttribute("open");
       viewMenuRef.current?.querySelector("summary")?.focus()}
     }}>
      <summary className={!primaryTabKeys.includes(tab)?"selected":""} aria-label="Дополнительные представления проекта">
       {primaryTabKeys.includes(tab)?"Другие разделы":tabs.find(t=>t.key===tab)?.title||"Другие разделы"}
      </summary>
      <div className="atlas-view-menu-actions" role="group" aria-label="Другие представления">
       {tabs.filter(t=>!primaryTabKeys.includes(t.key)).map(t=><button key={t.key} type="button"
        title={t.key==="graph"?"Ctrl+3":undefined} aria-current={tab===t.key?"page":undefined}
        className={tab===t.key?"selected":""}
        onClick={()=>{viewMenuRef.current?.removeAttribute("open");view(t.key)}}>{t.title}</button>)}
      </div>
     </details>
    </nav>
    {tab==="overview"&&<>
     <ProjectOrganizationGuide snapshot={data} projectId={project.id}
      restoreSearch={mapSearchReturn}
      onEdit={openEditor}
      onRefresh={sourceId=>void syncPublic({projectId:project.id,sourceId})}
      onOpenSources={()=>view("sources")}
      onOpenLinkedSource={openLinkedSource}
      onOpenWorks={()=>view("work")}
      pendingWorkCount={pendingWorkCount} onOpenPendingWorks={showPendingWorks}
      overdueWorkCount={overdueWorkFinishes.size} onOpenOverdueWorks={showOverdueWorks}
      overdueHighlights={overdueHighlights}
      criticalFocus={criticalFocus}
      criticalWorkCount={criticalWorkIds.size} onOpenCriticalWorks={showCriticalWorks}
      onOpenStages={()=>document.getElementById("atlas-project-stages")?.scrollIntoView({behavior:"smooth",block:"start"})}
      onOpenTimeline={()=>view("timeline")}
      onOpenGraph={openWorkGraph}
      onOpenProject={id=>selectProject(id)}
      onAddRelation={()=>openEditor("portfolio-link")}
      busy={busy}/>
     <div className="metric-grid"><Metric value={project.targets?.length||0} label="Ожидаемых результатов"/><Metric value={impact?.attention??0} label="Требуют внимания"/>
      <Metric value={project.items.length} label="Работ"/><Metric value={projected?.deadlineSlipDays??"?"} label="Дней риска срока"/></div>
     {nextStep&&<section className="surface atlas-next-step" aria-label="Следующий шаг проекта">
      <div className="section-heading"><div><small>Подсказка по текущему плану</small>
       <h2>{nextStep.title}</h2><p>{nextStep.note}</p></div>
       <Action primary onClick={()=>nextStep.action?openEditor(nextStep.action):view(nextStep.tab as Tab)}>{nextStep.button}</Action>
      </div>
      <p className="minor">Переход только открывает представление или редактор. Факты и решения автоматически не изменяются.</p>
     </section>}


     <section className="surface atlas-reality-overview" aria-label="Сопоставление цели, фактов и решений">
      <div className="section-heading"><div><h2>План, факты и решения</h2>
       <p>Atlas сопоставляет требования с записанными фактами, показывает расхождения и связанные решения. Источники можно проверить отдельно.</p></div>
       <div className="button-row"><Action onClick={()=>openEditor("target")}>＋ Требование</Action>
        <Action onClick={()=>view("reality")}>Все факты</Action></div></div>
      {realityMap?.rows.length?<div className="atlas-reality-list">
       {realityMap.rows.slice(0,realityLimit).map((r:any)=><article className="atlas-reality-card" key={r.id}
        tabIndex={-1} ref={r.id===requirementJump?.targetId?requirementCardRef:undefined}
        aria-label={"Требование: "+r.title+" — "+project.name}>
        <div className="atlas-reality-grid">
         <div className="atlas-reality-col"><small>Ожидаемый результат</small>
          <strong>{r.title}</strong><p>{r.desired}</p>
          {r.intent==="candidate"&&<small>Кандидат, не утверждённое требование</small>}
         </div>
         <div className="atlas-reality-col"><small>Что известно сейчас</small>
          <Badge tone={r.observation?"neutral":"warning"}>{r.observation?
           ({present:"Заявлено наличие",partial:"Заявлено частично",absent:"Заявлено отсутствие"} as Record<string,string>)[r.observation.result]||r.observation.result:"Факт не внесён"}</Badge>
          {r.observation&&<p>Уровень: {({implementation:"Реализация",test:"Тестирование",acceptance:"Заявлена приёмка"} as Record<string,string>)[r.observation.level]||r.observation.level}
           {" · "}Дата: {readable(r.observation.observedAt)}</p>}
          {r.observation?.workId&&<p>Наблюдение по работе: <button className="text-link" type="button"
           aria-label={"Открыть работу, связанную с наблюдением: "+r.observation.workTitle}
           onClick={()=>openEditor("work:"+r.observation.workId)}>{r.observation.workTitle}</button></p>}
          {r.source?<p title={r.source.revision||""}>Источник: {r.source.locator}
           {r.source.ref?" / "+r.source.ref:""}</p>:
           <p>Источник не указан</p>}
         </div>
         <div className="atlas-reality-col"><small>Что требует внимания</small>
          <Badge tone={r.needsAttention?"warning":"neutral"}>{evidence[r.assessment]||r.assessment}</Badge>
          {r.reasons.length?<ul>{r.reasons.map((reason:string,i:number)=><li key={i}>{reason}</li>)}</ul>:
           <p>Пока недостаточно сведений, чтобы подтвердить результат.</p>}
          <p>Связанных работ: {r.workCount}; незавершённых: {r.openWork}</p>
          {r.work.length>0&&<ul className="atlas-target-work-list">
           {r.work.slice(0,3).map((w:any)=><li key={w.id}>
            <button type="button" className="text-link"
             aria-label={"Открыть работу по требованию: "+w.title}
             onClick={()=>openEditor("work:"+w.id)}>{w.title}</button>
            <small>{workStatuses[w.state]||w.state}</small>
           </li>)}
          </ul>}
          {r.work.length>3&&<Action onClick={()=>{
            if(!requireClosedForm())return;
            view("work");setWorkTargetFilter(r.id);setWorkLimit(200);
           }}>Все связанные работы ({r.workCount})</Action>}
          {r.work.length>0&&r.openWork===0&&<p className="atlas-work-evidence-note">
           Работы отмечены выполненными. Это не подтверждает результат или его приёмку.</p>}
         </div>
         <div className="atlas-reality-col"><small>Как поступить</small>
          {r.cause&&<p className="atlas-cause-basis">
           Основание для рассмотрения: {r.cause.title}. {r.cause.detail}</p>}
          {r.change?<><strong>{r.change.title}</strong>
           <p>{decisionStatus[r.change.status]||r.change.status}{r.change.planApplied?" · План применён локально":""}</p>
           {r.change.decision&&<p>Основание решения: {r.change.decision}</p>}</>:
           <p>Связанного предложения пока нет</p>}
          <div className="button-row"><Action onClick={()=>openEditor("finding-target:"+r.id)}>Уточнить факт</Action>
           {r.cause?.needsProposal&&<Action onClick={()=>openEditor("respond:"+encodeURIComponent(r.cause.key))}>
            Предложить устранение причины</Action>}
           {r.cause?.activeChange&&<Action onClick={()=>openProjectTab(project.id,"changes",r.cause.activeChange.id)}>
            Изменение по причине</Action>}
           {r.change&&r.change.id!==r.cause?.activeChange?.id&&
            <Action onClick={()=>openProjectTab(project.id,"changes",r.change.id)}>Связанное изменение</Action>}
           {r.cause?.approvedWithoutWork&&r.cause.activeChange&&
            ["approved","in_progress"].includes(r.cause.activeChange.status)&&
            <Action onClick={()=>openEditor("work-change:"+r.cause.activeChange.id)}>Добавить работу по решению</Action>}
          </div>
         </div>
        </div>
       </article>)}
      </div>:<Fallback message="Сформулируйте ожидаемый результат. После этого его можно связать с работами и доказательствами."/>}
      {(realityMap?.count??0)>0&&<p className="minor">Показано {Math.min(realityLimit,realityMap?.count??0)} из {realityMap?.count??0} требований;
       требуют внимания: {realityMap?.attention??0}. Не показатель готовности продукта.</p>}
      {(realityMap?.count??0)>realityLimit&&<Action onClick={()=>setRealityLimit(n=>Math.min(realityMap?.count??n,n+8))}>Показать ещё требования</Action>}
      {(realityMap?.unlinkedChanges??0)>0&&<p className="minor">Есть предложения без прямой привязки к требованию: {realityMap?.unlinkedChanges}.
       <button type="button" className="text-link" onClick={()=>view("changes")}>Открыть все изменения</button></p>}
     </section>
     {projectCommand&&(projectCommand.dependencies.predecessors.length>0||
      projectCommand.dependencies.successors.length>0||projectCommand.dependencies.inheritedCount>0)
      &&<section ref={relationSectionRef} tabIndex={-1} className="surface atlas-project-relations"
       aria-label="Зависимости проекта и влияние на другие проекты">
      <div className="section-heading"><div><h2>Связи и последствия</h2>
       <p>Цепочки из действующего плана портфеля. Возможное влияние не подтверждает задержку или приёмку.</p></div>
       <button type="button" className="action-button" aria-expanded={showProjectRelations}
        aria-controls="atlas-project-relations-detail" onClick={()=>setShowProjectRelations(v=>!v)}>
        {showProjectRelations?"Скрыть цепочки":"Развернуть цепочки"}</button>
      </div>
      <div className="summary-line atlas-project-relations-summary">
       <span>Предшественников: {projectCommand.dependencies.predecessors.length}</span>
       <span>Следующих проектов: {projectCommand.dependencies.successors.length}</span>
       <span>Зависимых далее: {projectCommand.dependencies.downstreamCount}</span>
       <span>Входящих причин: {projectCommand.dependencies.inheritedCount}</span>
      </div>
      <div id="atlas-project-relations-detail" hidden={!showProjectRelations} className="atlas-project-relations-body">
       <div className="atlas-relations-column"><h3>От кого зависит</h3>
        {projectCommand.dependencies.predecessors.length?<ul>
         {projectCommand.dependencies.predecessors.slice(0,relationLimit).map((p:any)=><li key={p.id}>
          <button type="button" className="text-link"
           aria-label={"Открыть предшественника: "+p.name}
           onClick={()=>selectProject(p.id)}>{p.name}</button>
          <small>{statuses[p.status]||p.status}</small></li>)}</ul>:<p>Предшественников не задано.</p>}
       </div>
       <div className="atlas-relations-column"><h3>Кому передаётся результат</h3>
        {projectCommand.dependencies.successors.length?<ul>
         {projectCommand.dependencies.successors.slice(0,relationLimit).map((p:any)=><li key={p.id}>
          <button type="button" className="text-link"
           aria-label={"Открыть следующий проект: "+p.name}
           onClick={()=>selectProject(p.id)}>{p.name}</button>
          <small>{statuses[p.status]||p.status}</small></li>)}</ul>:<p>Непосредственных зависимых проектов нет.</p>}
       </div>
       <div className="atlas-relations-causes"><h3>Причины от предшественников</h3>
        {projectCommand.dependencies.inherited.length?<ol>
         {projectCommand.dependencies.inherited.slice(0,relationLimit).map((cause:any,i:number)=><li key={cause.originId+"-"+cause.kind+"-"+i}>
          <strong>{cause.message}</strong>
          <div className="atlas-relation-path" aria-label="Путь влияния">
           {cause.path.length>5&&<>
            <button type="button" className="text-link" onClick={()=>selectProject(cause.path[0].id)}>
             {cause.path[0].name}</button>
            <span className="atlas-relation-omitted">→ … {cause.path.length-3} промежуточных →</span>
           </>}
           {(cause.path.length>5?cause.path.slice(-2):cause.path).map((p:any,j:number)=><React.Fragment key={p.id+"-"+j}>
            {j>0&&<span aria-hidden="true"> → </span>}
            <button type="button" className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button>
           </React.Fragment>)}
           {cause.path.length>5&&<details className="atlas-relation-fullpath">
            <summary>Полная цепочка ({cause.path.length} проектов)</summary>
            <div className="atlas-relation-path">
             {cause.path.map((p:any,j:number)=><React.Fragment key={p.id+"-"+j}>
              {j>0&&<span aria-hidden="true"> → </span>}
              <button type="button" className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button>
             </React.Fragment>)}</div>
           </details>}</div></li>)}</ol>:
         <p>Переданных причин нет. Это не подтверждение завершения или приёмки.</p>}
       </div>
       {Math.max(projectCommand.dependencies.predecessors.length,projectCommand.dependencies.successors.length,
        projectCommand.dependencies.inherited.length)>relationLimit&&<Action onClick={()=>setRelationLimit(n=>n+12)}>
        Показать ещё связи и причины</Action>}
      </div>
     </section>}
     <section className="surface"><div className="section-heading"><div><h2>Сроки и зависимости</h2>
      <p>Сроки рассчитаны по связям работ. Занятость исполнителей здесь не учитывается.</p></div>
      <Action onClick={()=>openEditor("dates")}>Изменить даты</Action></div>
      <div className="summary-line"><span>Начало: {readable(project.startDate)}</span><span>Контрольный срок: {readable(project.dueDate)}</span>
       <span>Прогноз финиша: {projectedFinishLabel(projected)}</span><span>Критический путь: {plan?.durationDays??0} дн.</span></div>
       {!!projected?.unavailableOrigins?.length&&<p className="atlas-schedule-warning">
        Поставка заблокирована: {projected.unavailableOrigins.map((o:any)=>o.name+" ("+(o.status==="cancelled"?"отменён":"приостановлен")+")").join(", ")}. Корректировка зависимостей требует решения человека.
       </p>}
     </section>
     <section className="surface" id="atlas-project-stages"><div className="section-heading"><div><h2>Этапы проекта</h2>
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
        <div className="detail-row" key={decision.id}><span>{atlasT3DecisionSummary(decision.text)||decision.text}</span><small>{readable(decision.at)}</small></div>):
        <p className="minor">Решений пока нет.</p>}
        {project.decisions.length>15&&<Action onClick={()=>view("history")}>Вся история</Action>}</div>
      </div>
     </section>
    </>}
    {tab==="work"&&<section className="surface atlas-work-surface">
     <div className="section-heading"><div><h2>Работы проекта</h2><p>Изменения отражаются в доске, графике и зависимостях.
      {" "}<button type="button" className="text-link"
       disabled={busy||dirty||!!editor||!persisted}
       onClick={()=>void rereadAtlasFromNative()}
       title="Прочитать действующий Atlas Store без изменения своего черновика">
       Перечитать сохранённое</button></p></div>
      <div className="button-row"><Action onClick={()=>openEditor("item")} primary title="Ctrl+Shift+N">＋ Работа</Action><Action onClick={()=>openEditor("stage")}>＋ Этап</Action><Action onClick={()=>openEditor("dep")} title="Ctrl+Shift+L">Связь работ</Action></div></div>
     {recentWork&&<div className="atlas-work-created"
      aria-label={recentWorkKind==="dependency"?"Изменение зависимостей работы":
       recentWorkKind==="adjusted"?"Изменение работы":"Только что добавленная работа"}>
       <div><strong>{recentWork.title}</strong>
        {(recentWorkKind==="dependency"||recentWorkKind==="adjusted")&&
         recentScheduleEffect&&recentScheduleEffect.examples.length>0&&
         <button type="button" className="text-link atlas-work-effect-primary"
          aria-label={"Изменить затронутую работу "+recentScheduleEffect.examples[0].title}
          onClick={()=>openEditor("work:"+recentScheduleEffect.examples[0].id)}>
          Исправить затронутую работу: {recentScheduleEffect.examples[0].title}
         </button>}
        <p role="status">{recentWorkKind==="dependency"?
         dirty?"Связь внесена в черновик. Сохраните изменения.":"Связь сохранена.":
         recentWorkKind==="adjusted"?
         dirty?"Работа изменена в черновике. Сохраните изменения.":"Изменения работы сохранены.":
         dirty?"Работа внесена в черновик. Сохраните изменения.":"Работа сохранена."}
         {" "}{recentStage?"Этап: "+recentStage.name+".":"Этап пока не выбран."}</p>
        {(recentWorkKind==="dependency"||recentWorkKind==="adjusted")&&recentScheduleEffect&&
         <div className="atlas-work-plan-effect"
          aria-label={recentWorkKind==="adjusted"?"Последствия изменения работы":"Последствия изменения зависимости"}>
          {(recentPlanBefore?.followups?.length??0)>0&&<p className="atlas-work-correction-context"
           role="status">
           Последовательные правки: {recentPlanBefore?.followups?.length??0}.
           {" "}Сравнение ведётся с планом до первого изменения.
           {" "}Сейчас затронуто работ: {recentScheduleEffect.affectedTotal}.
          </p>}
          <p>{recentScheduleEffect.movedTotal>0?
           "Изменились расчётные сроки. Затронуто работ: "+recentScheduleEffect.movedTotal+". "+
           (recentScheduleEffect.delayedTotal?"Позже: "+recentScheduleEffect.delayedTotal+". ":"")+
           (recentScheduleEffect.earlierTotal?"Раньше: "+recentScheduleEffect.earlierTotal+".":""):
           "Расчётные сроки существующих работ не сдвинулись."}
           {recentScheduleEffect.criticalChangedTotal>0?
            " Критический путь изменился. Затронуто работ: "+recentScheduleEffect.criticalChangedTotal+".":""}
           {recentScheduleEffect.deadlineChangedTotal>0?
            " Контрольных сроков изменено: "+recentScheduleEffect.deadlineChangedTotal+".":""}
           {recentScheduleEffect.deadlineResolvedTotal>0?
            " Нарушений срока устранено: "+recentScheduleEffect.deadlineResolvedTotal+".":""}
           {recentScheduleEffect.deadlineRemovedTotal>0?
            " Контрольных сроков снято: "+recentScheduleEffect.deadlineRemovedTotal+
            ". Соблюдение этих сроков больше не проверяется.":""}
           {recentScheduleEffect.deadlineMissedTotal>0?
            " Расчётный финиш позже контрольного срока. Затронуто работ: "+
            recentScheduleEffect.deadlineMissedTotal+".":""}
          </p>
          {recentScheduleEffect.affectedTotal>0&&<div className="button-row atlas-work-impact-actions">
           {!workImpactActive?<button type="button" className="action-button"
            aria-label={"Показать все затронутые работы: "+recentScheduleEffect.affectedTotal}
            onClick={showAffectedWorks}>Все затронутые работы ({recentScheduleEffect.affectedTotal})</button>:
            <button type="button" className="action-button"
             aria-label="Вернуться ко всем работам после изменения плана"
             onClick={clearWorkFilters}>Все работы проекта</button>}
           {workImpactActive&&<small role="status">Показаны работы с изменением расчётного окончания, контрольного срока или критического пути.</small>}
          </div>}
          {dirty&&<div className="atlas-work-save-shortcut">
           <small>Новый расчёт в черновике. Сохранение выполняется только по вашему выбору.</small>
           <Action primary disabled={busy||!!editor}
            onClick={()=>void save()}>Сохранить пересчитанный план</Action>
          </div>}
          {recentScheduleEffect.examples.length>0&&<ul className="atlas-work-effect-list">
           {recentScheduleEffect.examples.map((item,index)=><li key={item.id}>
            {index===0?<strong>{item.title}</strong>:<button type="button" className="text-link"
             aria-label={"Изменить затронутую работу "+item.title}
             onClick={()=>openEditor("work:"+item.id)}>{item.title}</button>}
            <small>{item.shiftDays!==0?<>
             Расчётное окончание: {item.previousFinishDate&&item.finishDate?
              "было "+item.previousFinishDate+", стало "+item.finishDate:
              "было через "+item.previousFinishOffset+" дн., стало через "+
              item.finishOffset+" дн. от начала проекта"}.
             {" "}Сдвиг {item.shiftDays>0?"+":""}{item.shiftDays} дн.
            </>:<>
             Расчётное окончание: {item.finishDate||
              "через "+item.finishOffset+" дн. от начала проекта"}. Без сдвига графика.
            </>}
             {item.criticalChanged?(item.critical?
              " Теперь на критическом пути.":" Больше не на критическом пути."):
              item.critical?" На критическом пути.":""}</small>
            {item.dueDateChanged&&<small className="atlas-work-effect-deadline">
             Контрольный срок: было {item.previousDueDate||"не задано"},
             стало {item.dueDate||"не задано"}.
             {item.deadlineResolved?" Нарушение срока устранено.":""}
             {item.deadlineRemoved?" Срок снят. Соблюдение больше не проверяется.":""}
            </small>}
            {item.missedDeadline&&<small className="atlas-work-effect-deadline">
             Контрольный срок {item.dueDate} не выдержан. Проверьте план этой работы.
            </small>}
           </li>)}
          </ul>}
          {recentScheduleEffect.affectedTotal>recentScheduleEffect.examples.length&&
           <p className="minor">В примерах показано {recentScheduleEffect.examples.length} из
            {recentScheduleEffect.affectedTotal} затронутых работ.</p>}
         </div>}
        <p className="minor">Оценка: {workDurationLabel(recentWork)}.
         {recentWork.dueDate?" Контрольный срок: "+recentWork.dueDate+".":""}</p>
        {recentPlanRow&&<p className="minor">По записанным зависимостям: {recentPlanRow.startDate?
         "начало "+recentPlanRow.startDate+", расчётный финиш "+recentPlanRow.finishDate+".":
         "начало через "+recentPlanRow.earlyStart+" дн., финиш через "+recentPlanRow.earlyFinish+
         " дн. от начала проекта."}
         {recentPlanRow.predecessors.length?" Предшествующих работ: "+recentPlanRow.predecessors.length+".":""}
        </p>}
        {planBeforeRecent!==null&&plannedPlan&&<p className="minor">
         Продолжительность плана: было {planBeforeRecent} дн., стало {plannedPlan.durationDays} дн.
         Локальный календарный CPM до учёта межпроектного сдвига, без распределения ресурсов.</p>}
        {recentPlanRow?.finishDate&&recentWork.dueDate&&
         recentPlanRow.finishDate>recentWork.dueDate&&<p className="atlas-schedule-warning">
          Расчётный финиш позже указанного срока. Проверьте длительность и зависимости.</p>}
       </div>
       <div className="button-row">
        <Action onClick={()=>revealWorkInTable(recentWork.id)}>К работе</Action>
        {recentStage&&<Action onClick={()=>openEditor("stage-edit:"+recentStage.id)}>Открыть этап</Action>}
        {recentPlanRow?.predecessors.length>0&&<Action onClick={()=>openWorkGraph(recentWork.id,"","work")}>
         Зависимости</Action>}
        <Action onClick={()=>{view("overview");setMapSearchReturn({workId:recentWork.id,query:""})}}>
         Схема проекта</Action>
       </div>
      </div>}
      {(overdueWorkFinishes.size>0||workDeadlineFilter==="overdue"||
        criticalWorkIds.size>0||workCriticalOnly)&&
       <div className="atlas-work-overdue-actions atlas-work-risk-actions"
        role="group" aria-label="Расчётные риски работ">
        {(overdueWorkFinishes.size>0||workDeadlineFilter==="overdue")&&
         <button type="button" className="text-link" aria-label={workDeadlineFilter==="overdue"?
          "Показать все работы проекта":"Показать работы позже контрольного срока"}
          onClick={()=>{
           if(workDeadlineFilter==="overdue"){
            setWorkDeadlineFilter("all");setWorkLimit(200);
           }else showOverdueWorks();
          }}>{workDeadlineFilter==="overdue"?"Показать все работы":
           "Позже контрольного срока: "+overdueWorkFinishes.size}</button>}
        {(criticalWorkIds.size>0||workCriticalOnly)&&
         <button type="button" className="text-link"
          aria-label={workCriticalOnly?"Снять отбор критических работ":
           "Показать работы на критическом пути: "+criticalWorkIds.size}
          onClick={()=>{
           if(workCriticalOnly){setWorkCriticalOnly(false);setWorkLimit(200);}
           else showCriticalWorks();
          }}>{workCriticalOnly?"Убрать отбор критических":"Критический путь: "+criticalWorkIds.size}</button>}
        {workCriticalOnly&&<small>Критический путь рассчитан по зависимостям и длительностям.</small>}
       </div>}
      <div className="filter-row"><label>Требование <select aria-label="Фильтр работ по требованию"
      value={workTargetFilter} onChange={e=>{setWorkTargetFilter(e.target.value);setWorkLimit(200)}}>
      <option value="all">Все требования</option>
      {(project.targets||[]).map((t:any)=><option key={t.id} value={t.id}>{t.title}</option>)}
     </select></label>
     <label>Состояние <select value={workFilter} onChange={e=>{setWorkFilter(e.target.value);setWorkLimit(200)}}>
      <option value="all">Все</option>{Object.entries(workStatuses).map(([v,k])=><option value={v} key={v}>{String(k)}</option>)}</select></label>
     <label>Наблюдения <select aria-label="Фильтр работ по наблюдениям" value={workObservationFilter}
      onChange={e=>{setWorkObservationFilter(e.target.value);setWorkLimit(200)}}>
      <option value="all">Все</option><option value="with">С наблюдениями</option>
      <option value="without">Без наблюдений</option>
      <option value="done_without">Выполнены без наблюдений</option>
     </select></label>
     <label>Зависимости <select aria-label="Фильтр работ по зависимостям"
      value={workDependencyFilter} onChange={e=>{setWorkDependencyFilter(e.target.value);setWorkLimit(200)}}>
      <option value="all">Все работы</option>
      <option value="has_pending">Есть незавершённые</option>
      <option value="no_pending">Нет незавершённых</option>
     </select></label>
      <label>Найти работу <input type="search" value={workQuery} aria-label="Найти работу"
       placeholder="Название, этап, каталог или ответственный"
       title={filteredWork.length===1&&workQuery.trim()?"Enter: перейти к найденной работе":undefined}
       onChange={e=>{setWorkQuery(e.target.value);setWorkLimit(200)}}
       onKeyDown={e=>{
        if(e.key==="Enter"&&workQuery.trim()&&filteredWork.length===1){
         e.preventDefault();setWorkReturnId(filteredWork[0].id);
        }
       }}/></label>
      <label>Сортировка <select aria-label="Сортировка работ" value={workSort} onChange={e=>{setWorkSort(e.target.value);setWorkLimit(200)}}>
       <option value="title">По названию</option><option value="dueDate">По сроку</option>
       <option value="priority">По приоритету</option><option value="estimateDays">По длительности</option>
       <option value="state">По состоянию</option>
       {workImpactActive&&<option value="impact">По последствиям</option>}
      </select></label></div>
     {workFiltersActive&&<div className="atlas-work-filter-shortcut"
      role="group" aria-label="Быстрые действия с фильтрами работ">
      <small>Показано {Math.min(filteredWork.length,workLimit)} из {filteredWork.length} работ</small>
      {workQuery.trim()&&filteredWork.length===1&&<small>Enter: перейти к найденной работе</small>}
      {filteredWork.length>0&&<button type="button" className="text-link atlas-work-jump-results"
       aria-label="Перейти к первой найденной работе"
       onClick={()=>setWorkReturnId(filteredWork[0].id)}>К работам</button>}
      <button type="button" className="text-link atlas-work-return-overview"
       aria-label="Вернуться к обзору проекта"
       onClick={()=>view("overview")}>К обзору</button>
      <button type="button" className="action-button atlas-work-reset-filters"
       aria-label="Сбросить фильтры работ" onClick={clearWorkFilters}>Сбросить фильтры</button>
     </div>}
     <p className="minor atlas-work-evidence-summary" role="status">
      <output className="atlas-work-filter-count" aria-live="polite"
       aria-label={"Показано "+Math.min(filteredWork.length,workLimit)+" из "+filteredWork.length+" работ по фильтру"}>
       Показано {Math.min(filteredWork.length,workLimit)} из {filteredWork.length} работ по фильтру.
      </output>
      {" "}Без наблюдений по работе: {workObservationCounts.without}; завершены без наблюдений: {workObservationCounts.doneWithout}.
      Это поиск заявленных фактов, не независимая приёмка.
     </p>
     {scheduleView?.mode==="portfolio_forecast"&&<p className="atlas-schedule-warning" role="status">
      {"Прогноз по связям портфеля: начало "+scheduleView.displayStart+
       ", исходное начало проекта "+(project.startDate||"не задано")+
       ". Ниже показаны расчётные даты Work для прогноза. Исходный план и сохранённые Work не изменены."}
     </p>}
     <div className="table-scroll atlas-work-table-scroll"><table className="atlas-work-table" aria-label="Работы проекта"><thead><tr><th>Работа</th><th>Состояние</th><th>Длительность</th><th>Ответственный</th><th>Срок</th><th>Изменить</th></tr></thead>
      <tbody>{filteredWork.slice(0,workLimit).map((w:any)=><tr key={w.id}
        className={recentWorkId===w.id?"atlas-recent-work":undefined}>
       <td data-label="Работа">
        <button type="button" className="text-link atlas-work-row-title" title={w.title}
         aria-label={"Открыть работу "+w.title}
         ref={workReturnId===w.id?workReturnRef:undefined}
         onClick={()=>openEditor("work:"+w.id)}>{w.title}</button>
        {!embedded&&<button type="button" className="text-link atlas-v6-row-preview"
         aria-label={"Просмотреть в инспекторе "+w.title}
         onClick={()=>inspectWork(w.id)}>Просмотр</button>}
        {w.stageId&&project.stages.some((stage:any)=>stage.id===w.stageId)?
         <button type="button" className="text-link atlas-work-stage-link"
          aria-label={"Открыть этап "+project.stages.find((stage:any)=>stage.id===w.stageId)!.name+" для работы "+w.title}
          onClick={()=>openEditor("stage-edit:"+w.stageId)}>
          {project.stages.find((stage:any)=>stage.id===w.stageId)!.name}</button>:
         <small>Без этапа</small>}
        <WorkDependencyHint info={workLinks.get(w.id)} onOpenWork={id=>openEditor("work:"+id)}/>
        {workFolderUrl(project,w)&&<small>Каталог: <a className="text-link"
         href={workFolderUrl(project,w)!} target="_blank" rel="noopener noreferrer">
         {w.sourcePath}</a></small>}
        {w.sourceId&&<button type="button" className="text-link atlas-work-source-link"
         aria-label={"Показать источник работы "+w.title}
         onClick={()=>openLinkedSource(w.id,workQuery,"work")}>Сведения об источнике</button>}
        {findingsByWork.has(w.id)&&<details className="atlas-work-observation-history">
         <summary aria-label={"История наблюдений по работе: "+w.title}>
          Заявленных наблюдений: {findingsByWork.get(w.id)?.length} · Не независимая приёмка
         </summary>
         <ol>
          {findingsByWork.get(w.id)!.slice(-(workHistoryLimits[w.id]||5)).reverse().map((observation:any)=><li key={observation.id}>
           <button type="button" className="text-link"
            aria-label={"Открыть требование из наблюдения: "+w.title+" — "+(targetById.get(observation.targetId)?.title||"Требование")}
            onClick={()=>{
             if(!requireClosedForm())return;
             openProjectTab(project.id,"overview");
             setRequirementJump({projectId:project.id,targetId:observation.targetId});
            }}>{targetById.get(observation.targetId)?.title||"Требование"}</button>
           <small>{({present:"Заявлено наличие",partial:"Заявлено частично",absent:"Заявлено отсутствие"} as Record<string,string>)[observation.result]||observation.result}
            {" · "}{readable(observation.observedAt)}{" · "}
            {({implementation:"Реализация",test:"Тест",acceptance:"Заявлена приёмка"} as Record<string,string>)[observation.level]||observation.level}</small>
           {observation.note&&<p>{observation.note}</p>}
          </li>)}
         </ol>
         {findingsByWork.get(w.id)!.length>(workHistoryLimits[w.id]||5)&&
          <Action onClick={()=>setWorkHistoryLimits(prev=>({...prev,[w.id]:Math.min(findingsByWork.get(w.id)!.length,(prev[w.id]||5)+10)}))}>
           Показать ещё наблюдения ({findingsByWork.get(w.id)!.length-(workHistoryLimits[w.id]||5)})
          </Action>}
        </details>}
        {!(w.targetIds||[]).length&&<small className="atlas-work-target-hint">
         {project.targets?.length
          ?"Нет связи с ожидаемым результатом. Укажите требование в форме работы, чтобы записывать факты."
          :"В проекте ещё нет требований. Добавьте ожидаемый результат в «План / факт», затем свяжите работу."}
        </small>}
        {w.state==="done"&&(w.targetIds||[]).length>0&&<small className="atlas-work-evidence-note">
         Завершение работы заявлено; факт результата вносится отдельно.</small>}
        {t3AgentTask?.projectId===project.id&&t3AgentTask?.workId===w.id&&
         <small className="atlas-work-evidence-note">
          Task {t3AgentTask?.taskId} сохранён у Agent. Результат ещё не принят в Atlas.
         </small>}
        {(t3WorkLinks.get(w.id)||[]).slice(-2).map((link:any)=>
         <small key={link.decisionId} className="atlas-work-evidence-note">
          {link.portableSelectedSummary
           ?<>Agent Result {link.resultId}. Выбранный текст сохранён в Atlas; доступ к источнику проверяется в T3.</>
           :<>Agent Result {link.resultId}. Сохранена ссылка; доступ проверяется в T3.</>}
         </small>)}
        {(t3WorkLinks.get(w.id)||[]).length>2&&<small className="atlas-work-evidence-note">
         Ещё {(t3WorkLinks.get(w.id)||[]).length-2} ссылок в истории.</small>}</td>
       <td data-label="Состояние"><Badge>{workStatuses[w.state]}</Badge></td><td data-label="Длительность">{workDurationLabel(w)}
        {w.durationUnit==="working_days"&&w.calendarBasis&&<small className="atlas-work-plan-dates">
         {data.calendarLibrary?.find((calendar:any)=>calendar.id===w.calendarBasis.id&&calendar.version===w.calendarBasis.version)?.name||"Календарь недоступен"} · редакция {w.calendarBasis.version}
        </small>}
        {criticalWorkIds.has(w.id)&&<small className="atlas-work-critical-label">Критический путь</small>}
       </td>
       <td data-label="Ответственный">{w.assignee||"Не назначен"}</td>
       <td data-label="Срок">{readable(w.dueDate)}
        {planRowsById.has(w.id)&&<small className="atlas-work-plan-dates">
         {(scheduleView?.mode==="portfolio_forecast"?"Прогноз по портфелю":"CPM по плану")+
          ": "+(planRowsById.get(w.id).startDate||"начало не задано")+" → "+
          (planRowsById.get(w.id).finishDate||"финиш не определён")}
        </small>}
        {overdueWorkFinishes.has(w.id)&&<small className="atlas-work-overdue-label">
         Расчётное окончание: {overdueWorkFinishes.get(w.id)}. Позже указанного срока.
        </small>}
        {deadlineRiskDetails.has(w.id)&&<div className="atlas-work-deadline-context"
         role="group" aria-label={"Почему нарушается срок работы "+w.title}>
         <small>Отставание от контрольного срока: {deadlineRiskDetails.get(w.id)!.daysLate} дн.
          {" "}Оценка длительности: {deadlineRiskDetails.get(w.id)!.durationDays} {deadlineRiskDetails.get(w.id)!.durationUnit==="working_days"?"раб. дн.":"кал. дн."}</small>
         {deadlineRiskDetails.get(w.id)!.calendarWaitDays>0&&<small>
          Ожидание ближайшего рабочего дня: {deadlineRiskDetails.get(w.id)!.calendarWaitDays} кал. дн.
         </small>}
         {deadlineRiskDetails.get(w.id)!.critical&&<small>Работа на критическом пути проекта.</small>}
         {deadlineRiskDetails.get(w.id)!.drivers.length>0?
          <div className="atlas-work-deadline-drivers">
           <small>Предшественники, ограничивающие начало с учётом рабочего календаря:</small>
           {deadlineRiskDetails.get(w.id)!.drivers.map((driver:any)=>
            <button key={driver.id} type="button" className="text-link"
             aria-label={"Открыть работу, определяющую срок "+driver.title}
             onClick={()=>openEditor("work:"+driver.id)}>{driver.title}</button>)}
           {deadlineRiskDetails.get(w.id)!.hiddenDrivers>0&&
            <small>Ещё {deadlineRiskDetails.get(w.id)!.hiddenDrivers} в схеме зависимостей.</small>}
          </div>:
          <small>Предшествующих работ нет. Проверьте длительность и контрольный срок.</small>}
         <button type="button" className="text-link"
          aria-label={"Исправить план работы "+w.title+". Отставание от контрольного срока: "+
           deadlineRiskDetails.get(w.id)!.daysLate+" дн."}
          onClick={()=>openEditor("work:"+w.id)}>Изменить срок или длительность</button>
        </div>}
       </td>
       <td data-label="Действия" className="atlas-work-table-actions">
        <Action ariaLabel={!(w.targetIds||[]).length&&project.targets?.length
          ?"Указать требование для работы: "+w.title:undefined}
         onClick={()=>openEditor("work:"+w.id)}>
         {!(w.targetIds||[]).length&&project.targets?.length?"Указать требование":"Открыть"}
        </Action>
        {(w.targetIds||[]).length===1&&targetById.get(w.targetIds[0])&&
         <Action ariaLabel={"Зафиксировать факт по работе: "+w.title+" — "+targetById.get(w.targetIds[0]).title}
          onClick={()=>openEditor("finding-work:"+encodeURIComponent(w.id)+":"+encodeURIComponent(w.targetIds[0]))}>＋ Факт</Action>}
        {(w.targetIds||[]).length>1&&<details className="atlas-work-fact-menu">
         <summary>Факт по требованию ({w.targetIds.length})</summary>
         <div className="button-row">
          {w.targetIds.map((id:string)=>targetById.get(id)&&<Action key={id}
           ariaLabel={"Зафиксировать факт по работе: "+w.title+" — "+targetById.get(id).title}
           onClick={()=>openEditor("finding-work:"+encodeURIComponent(w.id)+":"+encodeURIComponent(id))}>{targetById.get(id).title}</Action>)}
         </div></details>}
        {project.items.length>1&&<Action ariaLabel={"Добавить предшественника для работы "+w.title}
         onClick={()=>openEditor("dep-to:"+encodeURIComponent(w.id))}>После работы</Action>}
        <button type="button" className="action-button"
         aria-label={"Связи работы "+w.title}
         onClick={()=>openWorkGraph(w.id,workQuery,"work")}>Связи</button>
        {host?.t3?.issueSelectedWork&&<Action
         disabled={busy||dirty||!persisted||!!editor}
         onClick={()=>void issueAtlasAgentTask(project.id,w.id)}
         title="Только оригинальный Agent и сохранённый WorkRef">Поручить Agent</Action>}
        {(host?.t3?.publishSelectedResult||host?.t3?.recoverSelectedPublication)&&
         <details className="atlas-work-fact-menu">
          <summary>Публикация</summary><div className="button-row">
           {host?.t3?.publishSelectedResult&&<Action
            disabled={busy||dirty||!persisted||!!editor}
            onClick={()=>void runAgentResultPublication(project.id,w.id,"publish")}
            title="Исходный Agent публикует принятый Result через оригинальный T3">Опубликовать Result</Action>}
           {host?.t3?.recoverSelectedPublication&&<Action
            disabled={busy||dirty||!persisted||!!editor}
            onClick={()=>void runAgentResultPublication(project.id,w.id,"recover")}
            title="Без повторной отправки: чтение оригинальной квитанции">Проверить публикацию</Action>}
          </div></details>}
        {host?.t3?.continueSelectedResult&&<Action
         disabled={busy||dirty||!persisted||!!editor}
         onClick={()=>void receiveAtlasAgentResult(project.id,w.id)}
         title="Принятый Agent Result, original signed T3 D6 и .iwxa">Получить Result</Action>}
        {host?.t3?.recoverSelectedResult&&<Action
         disabled={busy||dirty||!persisted||!!editor}
         onClick={()=>void recoverAtlasAgentResult(project.id,w.id)}
         title="Только оригинальный T3 D6 readback; без повторного применения">Проверить Result</Action>}
        <Action disabled={busy||dirty||!persisted||!!editor} onClick={()=>showSavedReference(project.id,w.id)} title="Только сохранённая редакция">Ссылка</Action>
        <Action onClick={()=>removeWork(w.id)}>Удалить</Action></td></tr>)}</tbody></table></div>
     {project.items.length>0&&<p className="minor">Показано {Math.min(filteredWork.length,workLimit)} из {filteredWork.length} работ по фильтру; всего в проекте: {project.items.length}.</p>}
     {filteredWork.length>workLimit&&<Action onClick={()=>setWorkLimit(n=>Math.min(filteredWork.length,n+200))}>Показать ещё работы</Action>}
     {project.items.length>0&&!filteredWork.length&&<Fallback message="По выбранным фильтрам работ нет. Измените требование, состояние, зависимости, наблюдения или поиск."/>}
     {!project.items.length&&<Fallback message="Пока нет работ. Добавьте первую работу и сохраните проект."/>}
    </section>}
    {tab==="board"&&<div className="board">
     {Object.entries(workStatuses).map(([key,title])=><section className={"board-column"+(dragWorkId?" atlas-v6-board-drop-target":"")} key={key}
      onDragOver={event=>{if(dragWorkId)event.preventDefault()}}
      onDrop={event=>{
       if(!dragWorkId)return;
       event.preventDefault();
       const id=event.dataTransfer.getData("application/x-atlas-work");
       if(project.items.some((item:any)=>item.id===id)&&
        project.items.find((item:any)=>item.id===id)?.state!==key)quickWork(id,key);
       setDragWorkId(null);
      }}>
      <h3>{String(title)} <small>{project.items.filter((w:any)=>w.state===key).length}</small></h3>
      {project.items.filter((w:any)=>w.state===key).slice(0,boardLimits[key]||60).map((w:any)=><div className={"board-card"+(dragWorkId===w.id?" is-dragging":"")}
       key={w.id} draggable={!busy&&!editor}
       onDragStart={event=>{
        if(busy||editor){event.preventDefault();return;}
        event.dataTransfer.setData("application/x-atlas-work",w.id);
        event.dataTransfer.effectAllowed="move";setDragWorkId(w.id);
       }}
       onDragEnd={()=>setDragWorkId(null)}>
       <strong>{w.title}</strong><small>{w.assignee||"Нет ответственного"} · {workDurationLabel(w)}</small>
        <WorkDependencyHint info={workLinks.get(w.id)} onOpenWork={id=>openEditor("work:"+id)}/>
       <div className="board-actions"><select aria-label={"Состояние "+w.title} value={w.state} onChange={e=>quickWork(w.id,e.target.value)}>
        {Object.entries(workStatuses).map(([v,title])=><option key={v} value={v}>{String(title)}</option>)}</select>
        <button onClick={()=>openEditor("work:"+w.id)}>Детали</button>
        {!embedded&&<button type="button" onClick={()=>inspectWork(w.id)}
         aria-label={"Открыть в инспекторе работу "+w.title}>Просмотр</button>}
        <button type="button" ref={workReturnId===w.id?workReturnRef:undefined}
         aria-label={"Связи работы "+w.title}
         onClick={()=>openWorkGraph(w.id,"","board")}>Связи</button></div></div>)}
       {project.items.filter((w:any)=>w.state===key).length>(boardLimits[key]||60)&&
        <Action onClick={()=>setBoardLimits(prev=>({...prev,[key]:(prev[key]||60)+60}))}>
         Показать ещё карточки ({project.items.filter((w:any)=>w.state===key).length-(boardLimits[key]||60)})
        </Action>}
      </section>)}
    </div>}
    {tab==="timeline"&&(plan?
      <ProjectGantt key={project.id} schedule={plan}
       projectStatus={project.status} projectStart={scheduleView?.displayStart??null}
       recordedStart={project.startDate||null} projectDue={project.dueDate||null}
       portfolioStart={projected?.projectedStart||null} shiftDays={projected?.shiftDays??null}
       unavailableOrigins={projected?.unavailableOrigins||[]}
       calendarDrafts={project.calendarDrafts||[]}
       calendarLibrary={data.calendarLibrary||[]}
       onRecordWorkCalendar={(record,basis)=>{
        if(busyRef.current||!ready||!requireClosedForm())return null;
        try{
         const source=latestSnapshot.current;
         const result=basis?
          reviseWorkCalendar(source,basis.id,basis.version,record):
          createWorkCalendar(source,record);
         mutate(result.state,"Календарь портфеля добавлен в черновик. "+
          "Для записи на диск нажмите «Сохранить».");
         return {id:result.id,version:result.version};
        }catch(error){issue(error);return null}
       }}
       onSaveCalendarDraft={draft=>{
        if(busyRef.current||!ready||!requireClosedForm())return null;
        try{
         const result=upsertCalendarDraft(latestSnapshot.current,project.id,draft);
         mutate(result.state,"Календарный вариант сохранён в черновике. Для записи на диск нажмите «Сохранить».");
         return result.id;
        }catch(error){issue(error);return null}
       }}
       onRemoveCalendarDraft={id=>{
        if(busyRef.current||!ready||!requireClosedForm())return false;
        if(!confirmAction("Удалить сохранённый календарный вариант из черновика проекта?"))return false;
        try{
         const result=removeCalendarDraft(latestSnapshot.current,project.id,id);
         mutate(result,"Календарный вариант удалён из черновика. Для записи на диск нажмите «Сохранить».");
         return true;
        }catch(error){issue(error);return false}
       }}
       onRepairCalendarDraft={id=>{
        if(busyRef.current||!ready||!requireClosedForm())return null;
        if(!confirmAction("Удалить только недействительные ссылки календарного варианта? "+
          "Сам вариант и существующие работы останутся на месте."))return null;
        try{
         const fixed=resolveCalendarDraftMissingWorkRefs(latestSnapshot.current,project.id,id);
         if(fixed.removed.length){
          mutate(fixed.state,"Ссылки на удалённые работы очищены в черновике. "+
           "Запишите новую редакцию штатной командой «Сохранить».");
         }
         return fixed.removed.length;
        }catch(error){issue(error);return null}
       }}
       onOpenProject={id=>selectProject(id)}
       onEditDates={()=>openEditor("dates")} onOpenWork={id=>openEditor("work:"+id)}/>:
      <section className="surface"><Fallback message="План пока не рассчитан. Добавьте работы или проверьте зависимости."/></section>)}
    {tab==="graph"&&<section className="surface"><div className="section-heading">
      <div><h2>Зависимости работ</h2><p>Посмотрите, какие работы должны завершиться раньше и какие зависят от них. Красные линии отмечают критический путь.</p></div>
      <Action onClick={()=>openEditor("dep")}>＋ Зависимость</Action></div>
      {graphFocusWork&&<div className="button-row atlas-graph-focus-actions"
       role="group" aria-label="Выбранная работа на схеме связей">
       <p className="minor" title={graphFocusWork.title} style={{overflowWrap:"anywhere"}}>Связи работы: <strong>{graphFocusWork.title}</strong></p>
       <Action onClick={returnFromWorkGraph}>{graphJump?.origin==="work"?"К работе в таблице":graphJump?.origin==="board"?"К работе на доске":"К найденной работе"}</Action>
       <div className="atlas-graph-focus-relations"
        role="group" aria-label="Управление связями выбранной работы">
        {project.items.length>graphFocusPredecessors.length+1&&<Action
         onClick={()=>openEditor("dep-to:"+encodeURIComponent(graphFocusWork.id))}>
         Добавить предшественника</Action>}
        {graphFocusPredecessors.length>0&&<>
         <span className="minor" role="status" aria-live="off"
          aria-label={"Предшественников: "+graphFocusPredecessors.length}>
          Предшественников: {graphFocusPredecessors.length}</span>
         <button type="button" className="text-link atlas-graph-unlink"
          aria-label={"Убрать связь с предшественником: "+graphSelectedPredecessor.title}
          onClick={()=>removeDependency(graphSelectedPredecessor.id,graphFocusWork.id)}>
          Убрать связь: {graphSelectedPredecessor.title}</button>
         {graphRemovalPreview&&<p className="atlas-graph-link-preview"
          role="status" aria-label={"Прогноз удаления связи с "+graphSelectedPredecessor.title+
           ", продолжительность: "+graphRemovalPreview.beforeDays+" дн., станет "+
           graphRemovalPreview.afterDays+" дн., затронуто работ: "+graphRemovalPreview.affectedWorks}>
          Если убрать связь с {graphSelectedPredecessor.title},
          расчётная продолжительность проекта{" "}
          {graphRemovalPreview.deltaDays===0?
           "не изменится: "+graphRemovalPreview.beforeDays+" дн.":
           "изменится с "+graphRemovalPreview.beforeDays+" до "+
            graphRemovalPreview.afterDays+" дн."}
          {graphRemovalPreview.afterFinish?
           ". Новый расчётный финиш: "+graphRemovalPreview.afterFinish:""}.
          {" "}Изменений по работам: {graphRemovalPreview.affectedWorks};
          {" "}на критическом пути: {graphRemovalPreview.criticalChanges}.
          {" "}Это предварительный расчёт, ничего не сохранено.
         </p>}
         {graphFocusPredecessors.length>1&&<details className="atlas-graph-other-links">
          <summary>Другие связи ({graphFocusPredecessors.length-1})</summary>
          {graphFocusPredecessors.filter((prior:any)=>prior.id!==graphSelectedPredecessor.id)
           .map((prior:any)=>
           <button key={prior.id} type="button" className="text-link"
            aria-label={"Проверить последствия удаления связи с "+prior.title}
            onClick={()=>setGraphPreviewFrom(prior.id)}>
            Проверить связь: {prior.title}</button>)}
         </details>}
        </>}
       </div>
       {graphFocusWork.sourceId&&<button type="button" className="text-link atlas-graph-focus-source"
        aria-label={"Показать источник для связей работы "+graphFocusWork.title}
        onClick={()=>openLinkedSource(graphFocusWork.id,graphJump?.query||"","graph")}>
        К источнику работы</button>}
      </div>}
      {plan&&<ProjectDependencyDiagram key={project.id} schedule={plan}
       focusWorkId={graphFocusWork?.id||null} onOpenWork={id=>openEditor("work:"+id)}/>}
      <div className="table-scroll"><table><thead><tr><th>Предшествующая работа</th><th>Зависимая работа</th><th>Переход</th></tr></thead>
       <tbody>{project.dependencies.map((d:any,i:number)=><tr key={d.from+"-"+d.to+"-"+i}>
        <td>{project.items.find((w:any)=>w.id===d.from)?.title||d.from}</td>
        <td>{project.items.find((w:any)=>w.id===d.to)?.title||d.to}</td>
        <td><Action onClick={()=>openEditor("work:"+d.to)}>Открыть работу</Action><Action onClick={()=>removeDependency(d.from,d.to)}>Удалить связь</Action></td>
       </tr>)}</tbody></table></div>
      {project.dependencies.length===0&&<p className="minor">Связей пока нет. Добавьте зависимости между работами для расчёта критического пути.</p>}
     </section>}
    {tab==="reality"&&<section className="surface atlas-control-plans" aria-label="Контрольные планы и отклонения">
     <div className="section-heading"><div><h2>Контрольный план и исполнение</h2>
      <p>Сохраните исходную редакцию сроков и сравнивайте её с текущим календарным прогнозом и введёнными фактическими датами. Исходный план не меняется при пересчёте.</p></div>
      <Action disabled={busy||!!editor||!plan?.rows?.length||controlPlans.length>=8}
       onClick={()=>{
        if(!requireClosedForm())return;
        const name=window.prompt("Название контрольного плана",controlPlans.length?
         "Контрольная редакция "+(controlPlans.length+1):"Исходный план");
        if(name===null)return;
        try{
         const result=capturePlanBaseline(latestSnapshot.current,project.id,{name});
         mutate(result.state,"Контрольный план создан в черновике. Нажмите «Сохранить» для записи на диск.");
         setControlPlanId(result.id);setControlPlanLimit(100);setControlPlanOnlyChanges(true);
        }catch(error){issue(error)}
       }}>Зафиксировать план</Action></div>
     {controlPlans.length>0?<>
      <div className="button-row">
       <label>Редакция плана{" "}
        <select aria-label="Контрольная редакция плана" value={controlPlanComparison?.baseline.id??""}
         onChange={e=>{setControlPlanId(e.target.value);setControlPlanLimit(100)}}>
         {controlPlans.map((b:any)=><option key={b.id} value={b.id}>{b.name} · {b.recordedAt.slice(0,10)}</option>)}
        </select>
       </label>
       <label><input type="checkbox" checked={controlPlanOnlyChanges}
        onChange={e=>{setControlPlanOnlyChanges(e.target.checked);setControlPlanLimit(100)}}/> Только отклонения</label>
      </div>
      {controlPlanComparison&&<>
       <div className="metric-grid">
        <Metric label="Плановый финиш" value={controlPlanComparison.baseline.forecastFinish}/>
        <Metric label="Текущий прогноз" value={controlPlanComparison.forecastFinish??"Неизвестен"}/>
        <Metric label="Изменение срока, дн." value={controlPlanComparison.finishShiftDays===null?"?":
         (controlPlanComparison.finishShiftDays>0?"+":"")+controlPlanComparison.finishShiftDays}/>
        <Metric label="Работ с отличиями" value={controlPlanComparison.totals.changed}/>
       </div>
       <p className="minor">Исходная редакция №{controlPlanComparison.baseline.sourceRevision}.
        {" "}Отмеченное выполнение не заменяет подтверждение приёмки. Факт здесь вводится пользователем в карточке работы.</p>
       <div className="table-scroll"><table aria-label="Сравнение работ с контрольным планом">
        <thead><tr><th>Работа</th><th>Исходный финиш</th><th>Прогноз</th><th>Сдвиг</th><th>Факт завершения</th><th>Основание расхождения</th><th></th></tr></thead>
        <tbody>{visibleControlPlanRows.map((row:any)=><tr key={row.id}>
         <td><strong>{row.title}</strong></td>
         <td>{row.referenceFinish??"Не входила в план"}</td>
         <td>{row.forecastFinish??"Нет прогноза"}</td>
         <td>{row.shiftDays===null?"Не определён":(row.shiftDays>0?"+":"")+row.shiftDays+" дн."}</td>
         <td>{row.actualFinish??"Не указан"}</td>
         <td>{row.reasons.join("; ")||"Без отклонений"}</td>
         <td>{!row.removed&&<Action onClick={()=>openEditor("work:"+row.id)}>Работа</Action>}</td>
        </tr>)}</tbody>
       </table></div>
       {visibleControlPlanRows.length===0&&<p className="minor">Различий для выбранного фильтра нет.</p>}
       {(controlPlanOnlyChanges?controlPlanComparison.totals.changed:controlPlanComparison.rows.length)>visibleControlPlanRows.length&&
        <Action onClick={()=>setControlPlanLimit(n=>n+100)}>Показать ещё 100 работ</Action>}
      </>}
     </>:<p className="minor">Контрольный план ещё не зафиксирован. Создайте его перед внесением изменений в сроки, чтобы сохранить точку сравнения.</p>}
    </section>}
    {tab==="reality"&&<section className="surface"><div className="section-heading"><div><h2>Что известно о результате</h2>
     <p>Посмотрите, что подтверждено записями, какие сведения устарели и что ещё нужно проверить.</p></div>
     <div className="button-row"><Action onClick={()=>openEditor("target")}>＋ Требование</Action><Action onClick={()=>openEditor("finding")} disabled={!project.targets?.length}>＋ Наблюдение</Action></div></div>
     <div className="table-scroll"><table><thead><tr><th>Ожидаемый результат</th><th>Что известно</th><th>Состояние источника</th><th></th></tr></thead>
      <tbody>{(reality?.rows||[]).map((r:any)=><tr key={r.id}><td><strong><button type="button" className="text-link" onClick={()=>{
        if(!requireClosedForm())return;
        view("overview");setRequirementJump({projectId:project.id,targetId:r.id});
       }}>{r.title}</button></strong><small>{r.desired}</small></td>
       <td><Badge tone={["unknown","stale","conflict"].includes(r.assessment)?"warning":"neutral"}>{evidence[r.assessment]||r.assessment}</Badge></td>
       <td>{sourceFreshnessLabel(r.freshness?.state)}{r.latest?.revision&&<details className="atlas-technical-details"><summary>Версия источника</summary><code>{r.latest.revision}</code></details>}</td>
       <td><Action onClick={()=>openEditor("finding-target:"+r.id)}>Новый факт</Action></td></tr>)}</tbody></table></div>
     <div className="section-heading"><h3>Факты на изменившихся исходных ревизиях</h3></div>
     {recheckRows.slice(0,recheckLimit).map((r:any)=>
      <div className="attention-row" key={r.id}><div><strong><button type="button" className="text-link"
        aria-label={"Открыть требование для повторной проверки: "+r.targetTitle}
        onClick={()=>{
         if(!requireClosedForm())return;
         view("overview");setRequirementJump({projectId:project.id,targetId:r.targetId});
        }}>{r.targetTitle}</button></strong>
       <small>{r.locator} / {r.ref}</small><details className="atlas-technical-details"><summary>Версии для повторной проверки</summary><code>{r.claimedSha||"неизвестно"} → {r.observedSha||"неизвестно"}</code></details></div>
       {r.canRecheck?<Action onClick={()=>openEditor(recheckAction(project.id,r.claimId,r.observedSha))}>Повторно проверить</Action>:
        <Action disabled={busy} onClick={()=>void syncPublic({projectId:project.id,sourceId:r.sourceId})}>Проверить источник</Action>}</div>)}
     {recheckRows.length>0&&<p className="minor">Показано {Math.min(recheckLimit,recheckRows.length)} из {recheckRows.length} повторных проверок.</p>}
     {recheckRows.length>recheckLimit&&<Action onClick={()=>setRecheckLimit(n=>Math.min(recheckRows.length,n+25))}>Показать ещё проверки ({recheckRows.length-recheckLimit})</Action>}
     </section>}
    {tab==="changes"&&<section className="surface"><div className="section-heading"><div><h2>Предложения и утверждённые изменения</h2>
     <p>Утверждение - отдельное решение человека. Применение конкретного плана также требует подтверждения.</p></div>
     <Action onClick={()=>openEditor("proposal")} primary>＋ Предложение</Action></div>
     {(project.changes||[]).slice().reverse().map((c:any)=><div className="change-card" key={c.id}
      tabIndex={-1} ref={c.id===changeJump?.changeId?changeCardRef:undefined}
      aria-label={"Изменение: "+c.title+" — "+project.name}>
      <div className="section-heading"><div><h3>{c.title}</h3><p>{c.description}</p></div><Badge>{decisionStatus[c.status]||c.status}</Badge></div>
      <div className="button-row">
       {["proposed","deferred","approved","in_progress"].includes(c.status)&&<Action onClick={()=>openEditor("change:"+c.id)}>Решение</Action>}
       {["proposed","deferred"].includes(c.status)&&<>
        <Action onClick={()=>openEditor("amend-dates:"+c.id)}>Даты</Action>
        {project.items.length>0&&<Action onClick={()=>openEditor("amend-work:"+c.id)}>Изменить работу</Action>}
        <Action onClick={()=>openEditor("amend-new:"+c.id)}>Добавить работу</Action></>}
       {["approved","in_progress"].includes(c.status)&&<Action onClick={()=>openEditor("work-change:"+c.id)}>
        {project.items.some((w:any)=>w.changeId===c.id)?"＋ Ещё связанная работа":"＋ Создать связанную работу"}</Action>}
       {project.items.some((w:any)=>w.changeId===c.id)&&<span className="minor">
        Связано работ: {project.items.filter((w:any)=>w.changeId===c.id).length}</span>}
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
      <p>{atlasT3DecisionSummary(entry.text)||entry.text||"Без пояснения"}</p>
      {entry.kind==="decision"&&atlasT3PortableResultText(entry.text)!==null&&
       <details className="atlas-technical-details">
        <summary>Показать сохранённый текст Result</summary>
        <p style={{whiteSpace:"pre-wrap"}}>{atlasT3PortableResultText(entry.text)}</p>
        <p className="minor">Это выбранный текст, сохранённый вместе с записью Atlas.
         Наличие локальной копии не подтверждает текущие права источника.</p>
       </details>}
      {entry.kind==="decision"&&atlasT3DecisionSummary(entry.text)&&
       <details className="atlas-technical-details">
        <summary>Исходная запись связи T3</summary>
        <code>{entry.text}</code>
        <p className="minor">Связь с Agent Result не предоставляет прав доступа.
         Актуальность источника и подписанные полномочия проверяются оригинальным T3.</p>
       </details>}
      {entry.revision&&<details className="atlas-technical-details"><summary>Версия источника</summary><code>{entry.revision}</code></details>}
     </div>)}
     {!history.length&&<Fallback message={(project.decisions.length+(project.findings||[]).length)>0?
      "По фильтру записей нет. Измените параметры, чтобы увидеть историю.":"История пуста. Добавьте решение или наблюдение."}/>}
     {history.length>0&&<p className="minor">Показано {Math.min(historyLimit,history.length)} из {history.length} записей. Всего в проекте: {project.decisions.length+(project.findings||[]).length}.</p>}
     {history.length>historyLimit&&<Action onClick={()=>setHistoryLimit(n=>Math.min(history.length,n+120))}>Показать ещё записи</Action>}
    </section>}
    {tab==="sources"&&<section className="surface"><div className="section-heading"><div><h2>Источники проекта</h2>
     <p>Проверяйте изменения и сборки открытых репозиториев GitHub по своему запросу. Другие источники пока можно добавлять как ссылки.</p></div>
     <Action onClick={()=>openEditor("source")} primary>＋ Источник</Action></div>
     {sourceJumpContext?.source?.status==="missing"&&<div className="atlas-source-jump-missing"
      role="status">
      <strong>Источник больше не подключён</strong>
      <p>Работа «{sourceJumpContext.title}» хранит прежнюю привязку
       {sourceJumpContext.source.folder?" к каталогу «"+sourceJumpContext.source.folder+"»":""}.
       Посмотреть её в текущих источниках нельзя.</p>
      <div className="button-row">
       <button type="button" className="text-link" disabled={busy}
        onClick={()=>openEditor("work:"+sourceJumpContext.id)}>Открыть связанную работу</button>
       {sourceJump?.origin==="work"&&<button type="button" className="text-link"
        aria-label={"Вернуться к работе "+sourceJumpContext.title}
        onClick={returnToLinkedWork}>К работе</button>}
       {sourceJump?.origin==="graph"&&<button type="button" className="text-link"
        aria-label={"Вернуться к связям работы "+sourceJumpContext.title}
        onClick={returnToLinkedGraph}>К связям работы</button>}
       <button type="button" className="text-link"
        onClick={()=>view("overview")}>К схеме</button>
       <button type="button" className="text-link" onClick={()=>setSourceJump(null)}>
        Закрыть сведения</button>
      </div>
     </div>}
     {(project.sources||[]).map((s:any)=>{
      const review=sourceReview(s,{limit:sourceRowLimits[s.id]||12});
      const sourceIssue=sourceResponseById.get(s.id);
      const linkedRequirements=sourceRequirementLinks.get(s.id)||[];
      const ownerCatalog=s.kind==="github_owner"?githubPortfolioCatalog(data,project.id,s.id,{
       query:ownerCatalogQuery[s.id]||"",limit:ownerCatalogLimit[s.id]||24
      }):null;
      const selected=sourceJumpContext?.source?.id===s.id;
      const linkedSource=selected?sourceJumpContext?.source:null;
      return <div className={"atlas-source-review"+(selected?" atlas-source-review-focused":"")}
       key={s.id} ref={selected?sourceJumpRef:undefined} tabIndex={selected?-1:undefined}>
       {selected&&linkedSource&&<div className="atlas-source-jump-folder"
        role="group" aria-label="Каталог связанной работы">
        <strong>Связь работы с каталогом</strong>
        <p>Работа: <span>{sourceJumpContext?.title}</span></p>
        {linkedSource.folder?<p>Каталог: <span title={linkedSource.folder}>{linkedSource.folder}</span></p>:
         <p>Каталог для этой работы не указан.</p>}
        <small>{linkedSource.url?
         "Каталог указан в сохранённой структуре исходников.":
         linkedSource.status==="stale"?
         "Сведения о ветке устарели. Обновите источник перед сравнением.":
         linkedSource.status==="unavailable"?
         "Сведения об исходниках сейчас недоступны.":
         linkedSource.revisionCurrent?
         "Редакция совпадает, но каталог не подтверждён в полученной структуре.":
         "Работа связана с прежней редакцией исходников."}</small>
        <div className="button-row">
         {linkedSource.url&&<a className="text-link" href={linkedSource.url}
          target="_blank" rel="noopener noreferrer">Открыть найденный каталог на GitHub</a>}
         <button type="button" className="text-link" disabled={busy}
          onClick={()=>openEditor("work:"+sourceJumpContext!.id)}>Открыть связанную работу</button>
         {sourceJump?.origin==="work"&&<button type="button" className="text-link"
          aria-label={"Вернуться к работе "+sourceJumpContext!.title}
          onClick={returnToLinkedWork}>К работе</button>}
         {sourceJump?.origin==="graph"&&<button type="button" className="text-link"
          aria-label={"Вернуться к связям работы "+sourceJumpContext!.title}
          onClick={returnToLinkedGraph}>К связям работы</button>}
         <button type="button" className="text-link" onClick={()=>view("overview")}>
          К схеме</button>
         <button type="button" className="text-link" onClick={()=>setSourceJump(null)}>
          Закрыть связь</button>
        </div>
       </div>}
       <div className="attention-row"><div><strong>{sourceNames[s.kind]||"Источник"}: {s.locator}</strong>
        {s.kind==="github"&&<small>Ветка проверок: {s.branch||s.summary?.defaultBranch||"основная ветка репозитория"}</small>}
        <small>{review.status} · Попытка: {review.lastAttempt||"не выполнялась"}</small>
        {review.lastSuccess&&<small>Последнее успешное наблюдение: {review.lastSuccess}</small>}
        {review.observedCommit&&<small>Редакция при последней сверке: {review.observedCommit.branch} ·
          <a className="text-link" href={review.observedCommit.url} target="_blank" rel="noopener noreferrer"
            aria-label={"Открыть проверенный коммит источника "+review.observedCommit.sha}>
            {review.observedCommit.sha.slice(0,12)}
          </a>
        </small>}
        {review.error&&<small className="atlas-source-error">{review.error}</small>}
       </div>
       <div className="button-row">
        {s.kind==="github"&&<Action onClick={()=>openEditor("source-branch:"+encodeURIComponent(s.id))} disabled={busy}>Изменить ветку</Action>}
        {review.supported&&<Action onClick={()=>void syncPublic({projectId:project.id,sourceId:s.id})} disabled={busy}>{s.kind==="github"?"Проверить код и сборку":"Обновить список"}</Action>}
        {review.sourceUrl&&<a className="text-link" href={review.sourceUrl} target="_blank"
          rel="noopener noreferrer">{s.kind==="github"?"Открыть репозиторий на GitHub":"Открыть страницу на GitHub"}</a>}
       </div>
       </div>
       {review.supported&&<div className="atlas-source-details">
        {review.ci&&<div className="atlas-source-ci" aria-label="Проверки исходного кода GitHub">
         <strong>Проверки GitHub Actions · {review.ci.branch||s.branch||s.summary?.defaultBranch||"основная ветка"}</strong>
         <p>{review.ci.label}</p>
         {review.ci.url&&<a className="text-link" href={review.ci.url}
          target="_blank" rel="noopener noreferrer">Открыть проверку на GitHub</a>}
         {review.ci.checkedCommit&&review.ci.headCurrent!=="current"&&<p className="minor">
           Запуск относится к <a className="text-link" href={review.ci.checkedCommit.url}
             target="_blank" rel="noopener noreferrer">
             редакции {review.ci.checkedCommit.sha.slice(0,12)}</a>.
           Совпадение с последней наблюдавшейся редакцией ветки не подтверждено.
         </p>}
         <button type="button" className="text-link"
           onClick={()=>view("reality")}>Сверить требования и факты проекта</button>
         <p className="minor">Сборка на GitHub не подтверждает выполнение требований и приёмку проекта.</p>
        </div>}
        <p className="minor">{review.comparison==="COMPARABLE"
          ?`Изменения GitHub: ${review.total}. Изменено: ${review.totals.changed} · Добавлено: ${review.totals.added} · Удалено: ${review.totals.removed} · Переименовано: ${review.totals.renamed}.`
          :review.comparison==="BASELINE"?"Первое наблюдение: сравнение с предыдущей редакцией отсутствует."
          :"Сравнение редакций недоступно: отсутствуют два полных наблюдения."}
        </p>
        {review.selectedRevision&&<p className="minor" aria-label="Изменение выбранной ветки GitHub">
         Ветка <strong>{review.selectedRevision.branch}</strong> изменилась:{" "}
         <a className="text-link" href={review.selectedRevision.previousUrl} target="_blank" rel="noopener noreferrer">
          было {review.selectedRevision.previousSha.slice(0,12)}</a>{" → "}
         <a className="text-link" href={review.selectedRevision.currentUrl} target="_blank" rel="noopener noreferrer">
          стало {review.selectedRevision.currentSha.slice(0,12)}</a>.
         Полный список веток не сопоставлялся.{" "}
         <button type="button" className="text-link" onClick={()=>view("reality")}>Проверить связанные требования</button>
        </p>}
        {review.previousObservation&&<p className="minor">Предыдущее наблюдение сохранено, но последняя сверка завершилась ошибкой.</p>}
        {(review.structureDelta?.total||0)>0&&<p className="minor" aria-label="Изменения в составе проекта">
         В структуре источника появились изменения: добавлено каталогов {review.structureDelta.addedFolders.length},
         файлов {review.structureDelta.addedFiles.length}; удалено каталогов {review.structureDelta.removedFolders.length},
         файлов {review.structureDelta.removedFiles.length}. Это не подтверждает выполнение работ.
        </p>}
        {s.kind==="github"&&s.summary?.structure?.status==="unavailable"&&
         <p className="minor" aria-label="Структура источника недоступна">
          Ветка наблюдалась, но состав её файлов сейчас недоступен. При следующей сверке Atlas
          попробует получить структуру снова. Отсутствие сведений не означает удаление файлов.
         </p>}
        {review.rows.length>0&&<div className="table-scroll"><table className="atlas-source-table"><thead><tr>
         <th>Изменение</th><th>Объект</th><th>Данные проверки</th>
        </tr></thead><tbody>{review.rows.map((row:any,i:number)=><tr key={i}>
         <td>{row.kind}</td><td>{row.title}</td><td>{(row.before||row.after)?<details className="atlas-technical-details"><summary>Версии</summary><code>До: {row.before||"—"} · После: {row.after||"—"}</code></details>:"—"}</td>
        </tr>)}</tbody></table></div>}
        {review.remaining>0&&<Action onClick={()=>setSourceRowLimits(prev=>({...prev,[s.id]:Math.min(review.total,(prev[s.id]||12)+24)}))}>
         Показать ещё изменения ({review.remaining})
        </Action>}
        {s.kind==="github"&&s.summary?.structure?.status==="observed"&&
         <details className="atlas-connected-structure">
          <summary>Структура репозитория · {s.summary.structure.totalFolders} каталогов · {s.summary.structure.totalFiles} файлов</summary>
          <p className="minor">Структура получена из GitHub для редакции{" "}
           {s.summary.structure.commitSha?.slice(0,12)||"не установлена"}.
           Показан только верхний уровень. Каталоги и файлы не становятся работами
           или готовыми модулями без вашего решения.</p>
          {review.structureDelta&&<div className="atlas-structure-changes" aria-label="Изменения корневой структуры">
           <strong>{review.structureDelta.total>0?"Что изменилось с предыдущей сверки":
            "На верхнем уровне изменений нет"}</strong>
           {[
            ...review.structureDelta.addedFolders.map((name:string)=>"Каталог добавлен: "+name),
            ...review.structureDelta.removedFolders.map((name:string)=>"Каталог отсутствует в новой редакции: "+name),
            ...review.structureDelta.addedFiles.map((name:string)=>"Файл добавлен: "+name),
            ...review.structureDelta.removedFiles.map((name:string)=>"Файл отсутствует в новой редакции: "+name)
           ].length>0&&<ul>{[
            ...review.structureDelta.addedFolders.map((name:string)=>"Каталог добавлен: "+name),
            ...review.structureDelta.removedFolders.map((name:string)=>"Каталог отсутствует в новой редакции: "+name),
            ...review.structureDelta.addedFiles.map((name:string)=>"Файл добавлен: "+name),
            ...review.structureDelta.removedFiles.map((name:string)=>"Файл отсутствует в новой редакции: "+name)
           ].slice(0,18).map((line:string,i:number)=><li key={i}>{line}</li>)}</ul>}
           {review.structureDelta.total>18&&<p className="minor">
            Показано 18 из {review.structureDelta.total} изменений.</p>}
          </div>}
          <div className="atlas-connect-root">
           <div><strong>Каталоги</strong><ul>{s.summary.structure.folders.map((name:string)=>
            <li key={name}>{name}</li>)}</ul></div>
           <div><strong>Файлы</strong><ul>{s.summary.structure.files.map((name:string)=>
            <li key={name}>{name}</li>)}</ul></div>
          </div>
          {(s.summary.structure.truncated||s.summary.structure.limited)&&
           <p className="minor">Показана только часть корневой структуры.</p>}
         </details>}
        {s.kind==="github"&&<div className="atlas-source-related-requirements"
          aria-label="Требования со сведениями из этого GitHub-источника">
         <strong>Требования, связанные с этим источником: {linkedRequirements.length}</strong>
         {linkedRequirements.length>0?
          <><p className="minor">Показаны требования, чей последний записанный факт относится к этому репозиторию.</p>
           {linkedRequirements.slice(0,5).map((r:any)=><div key={r.id} className="atlas-source-related-row">
            <button type="button" className="text-link"
              aria-label={"Открыть требование из источника: "+r.title}
              onClick={()=>{
               if(!requireClosedForm())return;
               view("overview");
               setRequirementJump({projectId:project.id,targetId:r.id});
              }}>{r.title}</button>
            <small>{evidence[r.assessment]||r.assessment}
             {r.freshness==="revision_changed"?" · Редакция источника изменилась":
              r.freshness==="incomplete"?" · Требуется дополнительная сверка источника":""}</small>
           </div>)}
           {linkedRequirements.length>5&&<button type="button" className="text-link"
             onClick={()=>view("overview")}>Открыть полный список требований</button>}</>
          :<p className="minor">Пока нет требований с фактами из этого репозитория. Проверка кода сама по себе не подтверждает выполнение требований.</p>}
        </div>}
        {sourceIssue&&<div className="atlas-source-response" aria-label="Решение по наблюдению источника">
         <strong>Требует рассмотрения</strong>
         <p>{sourceIssue.detail}</p>
         {sourceIssue.needsProposal
          ?<Action onClick={()=>openEditor("respond:"+encodeURIComponent(sourceIssue.key))}>Предложить действие по причине</Action>
          :<Action onClick={()=>openProjectTab(project.id,"changes",sourceIssue.activeChanges.at(-1)?.id||null)}>
            Открыть связанное изменение</Action>}
         <p className="minor">Сначала предложение, затем отдельное решение. Работа и приёмка автоматически не создаются.</p>
        </div>}
        {ownerCatalog&&<details className="atlas-owner-catalog">
         <summary>Репозитории GitHub · {ownerCatalog.total} обнаружено · {ownerCatalog.connected} уже в портфеле</summary>
         <p className="minor">{ownerCatalog.observed?
          ownerCatalog.complete?"Список публичных репозиториев наблюдался полностью.":
           "Получена часть публичных репозиториев. Не найденные здесь репозитории могут существовать.":
          "Последнее наблюдение недоступно. Обновите список перед созданием проекта."}
          {" "}Приватные репозитории не перечисляются без отдельного разрешения.</p>
         <label>Найти репозиторий <input type="search" aria-label={"Поиск репозиториев "+ownerCatalog.owner}
          placeholder="Название репозитория" value={ownerCatalogQuery[s.id]||""}
          onChange={event=>{setOwnerCatalogQuery(prev=>({...prev,[s.id]:event.target.value.slice(0,240)}));
           setOwnerCatalogLimit(prev=>({...prev,[s.id]:24}))}}/></label>
         {ownerCatalog.rows.length>0?<div className="table-scroll"><table aria-label={"Репозитории "+ownerCatalog.owner}>
          <thead><tr><th>Репозиторий</th><th>В Atlas</th><th>Действие</th></tr></thead>
          <tbody>{ownerCatalog.rows.map((repo:any)=><tr key={repo.name}>
           <td><a className="text-link" href={"https://github.com/"+repo.name}
            target="_blank" rel="noopener noreferrer">{repo.repository}</a>
            <small>{repo.defaultBranch||"Основная ветка не определена"}{repo.archived?" · Архивный репозиторий":""}</small></td>
           <td>{repo.projects.length?repo.projects.map((p:any)=><div key={p.id}>
            <button type="button" className="text-link" onClick={()=>selectProject(p.id)}>{p.name}</button></div>):
            <small>Отдельного проекта ещё нет</small>}</td>
           <td>{repo.canCreate?<Action onClick={()=>includeDiscoveredProject(project.id,s.id,repo.name)}
             disabled={busy}>Создать проект</Action>:repo.projects.length?
             <Action onClick={()=>selectProject(repo.projects[0].id)}>Открыть проект</Action>:
             <small>Сначала обновите список</small>}</td>
          </tr>)}</tbody></table></div>:<p className="minor">По вашему запросу репозитории не найдены.</p>}
         <p className="minor">Показано {ownerCatalog.rows.length} из {ownerCatalog.matched} по фильтру.</p>
         {ownerCatalog.remaining>0&&<Action onClick={()=>setOwnerCatalogLimit(prev=>({...prev,
          [s.id]:Math.min(ownerCatalog.matched,(prev[s.id]||24)+24)}))}>
          Показать ещё ({ownerCatalog.remaining})</Action>}
         <p className="minor">Создание проекта добавляет GitHub-источник и плановый проект только в черновик Atlas; данные GitHub не меняются.</p>
        </details>}
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
     <p>Сохраните архив .iwxa, затем откройте его в Admin Center через «Планы Atlas» → «Открыть портфель Atlas».</p>
     <p className="minor">В архив попадут все проекты портфеля, а не только выбранная работа. Center сможет читать копию и готовить поручения; синхронизация и права не передаются.</p>
     <details className="atlas-technical-details"><summary>Данные для ручного подключения и старых версий</summary>
      <label className="atlas-ref-label">Сведения о выбранном проекте или работе
       <textarea className="atlas-ref-text" aria-label="Сохранённая ссылка Atlas" readOnly
        rows={5} value={savedRefPreview.json} onFocus={event=>event.currentTarget.select()}/>
      </label>
      <p className="minor">Для старых версий Admin Center можно отдельно сохранить копию JSON.</p>
     </details>
     {error&&<p className="error" role="alert">{error}</p>}
     <div className="button-row">
      <Action primary autoFocus onClick={()=>void exportIwxa()} disabled={busy}>Сохранить портфель .iwxa</Action>
      <Action onClick={()=>void exportJson("center")} disabled={busy}>Сохранить копию JSON</Action>
      <Action onClick={()=>setSavedRefPreview(null)} disabled={busy}>Закрыть</Action>
     </div>
    </section>
   </div>}
   {signedResultPreview!==null&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog atlas-import-dialog" role="dialog"
     aria-modal="true" aria-labelledby="atlas-t3-signed-result-title">
     <div className="atlas-import-body">
      <h2 id="atlas-t3-signed-result-title">Принять подписанный Result</h2>
      <p>Оригинальный T3 проверил подпись .iwxa, получателя, действующие полномочия и точный текст. Отдельно подтвердите запись в проект Atlas.</p>
      <p className="minor">Проект: {data.projects.find((p:any)=>p.id===signedResultPreview.workRef.projectId)?.name||signedResultPreview.workRef.projectId}.
       {" "}Работа: {data.projects.find((p:any)=>p.id===signedResultPreview.workRef.projectId)?.items.find((w:any)=>w.id===signedResultPreview.workRef.workId)?.title||signedResultPreview.workRef.workId}.
       {" "}Редакция: {signedResultPreview.workRef.revision}.</p>
      <label className="atlas-ref-label">Выбранный подписанный текст Result
       <textarea className="atlas-ref-text" rows={6} readOnly
        aria-label="Оригинальный подписанный текст Result"
        value={signedResultPreview.selectedAcceptedSummary}/>
      </label>
      <details className="atlas-technical-details">
       <summary>Точные SHA-256 и квитанция</summary>
       <p className="minor">Архив: <code>{signedResultPreview.archiveSha256}</code></p>
       <p className="minor">Текст: <code>{signedResultPreview.selectedSummarySha256}</code></p>
       <p className="minor">Операция: <code>{signedResultPreview.operationId}</code></p>
      </details>
      <p className="minor">Подпись подтверждает происхождение, но не шифрует файл. Событие Kernel отправителя здесь не проверено. Получение не меняет состояние работы и её зависимости.</p>
      {signedResultPreview.alreadyReceived&&<p>Этот Result уже сохранён в Atlas. Повторная запись не требуется.</p>}
      {signedFileDispatchAttempted&&!signedResultPreview.alreadyReceived&&
       <p role="status">Операция отправлена один раз. Повторное применение заблокировано: проверьте квитанцию без новой записи.</p>}
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="button-row">
       {!signedResultPreview.alreadyReceived&&<Action primary
        onClick={()=>void acceptSignedResultFile()} disabled={busy||dirty||!!editor||signedFileDispatchAttempted}>
        Подтвердить получение</Action>}
       <Action onClick={()=>void recoverSignedResultFile()} disabled={busy||dirty||!!editor}
        title="Только чтение квитанции, без повторной записи">
        Проверить квитанцию</Action>
       <Action autoFocus onClick={()=>{if(!busyRef.current)setSignedResultPreview(null)}} disabled={busy}>Закрыть</Action>
      </div>
     </div>
    </section>
   </div>}
   {pendingImport!==null&&<div className="atlas-close-overlay">
    <section className="atlas-close-dialog atlas-import-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-import-preview-title">
     <div className="atlas-import-body">
      <h2 id="atlas-import-preview-title">{pendingImport.format==="iwxa"?"Открыть архив .iwxa":"Открыть резервную копию JSON"}</h2>
     <p>Проверьте содержимое копии. При подтверждении она заменит текущие проекты, но пока ничего не изменено.</p>
     {pendingImport.format==="iwxa"&&<p className="minor">Этот архив можно восстановить в Atlas. В совместимом Admin Center он доступен как копия для просмотра, без синхронизации и передачи прав.</p>}
     <p className="minor">Редакция архива: {pendingImport.originalRevision}. Подтверждение изменит только черновик.</p>
     <div className="table-scroll"><table><thead><tr><th>Показатель</th><th>Сейчас</th><th>После импорта</th></tr></thead><tbody>
      {([["projects","Проекты"],["works","Работы"],["findings","Факты"],["decisions","Решения"],["changes","Предложения"],["sources","Источники"],["links","Связи проектов"]] as const).map(([key,label])=>
       <tr key={key}><td>{label}</td><td>{pendingImport.summary.current[key]}</td><td>{pendingImport.summary.incoming[key]}</td></tr>)}
     </tbody></table></div>
     <p><strong>Исключено:</strong> {pendingImport.summary.removed} проектов.
      <strong> Добавлено:</strong> {pendingImport.summary.added}.
      <strong> Найдены в обоих портфелях:</strong> {pendingImport.summary.matchingIds} (их данные будут заменены содержимым копии).</p>
     {pendingImport.summary.removed>0&&<p className="atlas-schedule-warning">Будут исключены:
      {pendingImport.summary.removedExamples.join(", ")}
      {pendingImport.summary.removed>pendingImport.summary.removedExamples.length?" и другие.":"."}
     </p>}
     {pendingImport.summary.added>0&&<p className="minor">Новые проекты: {pendingImport.summary.addedExamples.join(", ")}
      {pendingImport.summary.added>pendingImport.summary.addedExamples.length?" и другие.":"."}</p>}
     {pendingImport.summary.incoming.projects===0&&<p className="atlas-schedule-warning">
      Внимание: архив пуст. После сохранения все текущие проекты исчезнут из активного портфеля.
     </p>}
     <p className="minor">Предыдущие данные останутся в истории сохранений после того, как вы сохраните импортированный портфель.</p>
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
      <h2 id="atlas-versions-title">История сохранений</h2>
      <p>Вы можете вернуть более раннюю версию. Текущий портфель сохранится в истории, если понадобится вернуться к нему.</p>
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
   <footer className="workspace-footer"><span>Проекты хранятся на этом компьютере</span>
    <span>Вы сами решаете, какие изменения сохранить и принять.</span></footer>
  </main>
  {inspector&&<aside className={"inspector"+(editor?" atlas-inspector-editing":"")}
   aria-label={editor?"Редактирование данных":"Инспектор Atlas"}>
   {!embedded&&<div className="atlas-v6-dock-grip" role="separator" tabIndex={0}
    aria-label="Изменить ширину инспектора" aria-orientation="vertical"
    aria-valuemin={300} aria-valuemax={760} aria-valuenow={inspectorWidth}
    onKeyDown={event=>{
     if(event.key!=="ArrowLeft"&&event.key!=="ArrowRight")return;
     event.preventDefault();
     setInspectorWidth(w=>{
      const next=Math.max(300,Math.min(760,w+(event.key==="ArrowLeft"?20:-20)));
      try{localStorage.setItem("iwxa.atlas.ui.inspector.width.v1",String(next))}catch{}
      return next;
     });
    }}
    onPointerDown={event=>{
     if(event.button!==0)return;
     event.preventDefault();
     const start=event.clientX,initial=inspectorWidth;
     const drag=(move:PointerEvent)=>{
      setInspectorWidth(Math.max(300,Math.min(760,initial+start-move.clientX)));
     };
     const stop=(end:PointerEvent)=>{
      const width=Math.max(300,Math.min(760,initial+start-end.clientX));
      setInspectorWidth(width);
      try{localStorage.setItem("iwxa.atlas.ui.inspector.width.v1",String(width))}catch{}
      window.removeEventListener("pointermove",drag);
      window.removeEventListener("pointerup",stop);
      window.removeEventListener("pointercancel",stop);
     };
     window.addEventListener("pointermove",drag);
     window.addEventListener("pointerup",stop);
     window.addEventListener("pointercancel",stop);
    }}/>}

   {editor?<EditorPanel key={editor.action} editor={editor} onSubmit={submit}
    onCancel={cancelEditor} onDirtyChange={changed=>{editorDirtyRef.current=changed}}
    busy={busy} project={project} plan={plannedPlan}
    calendarLibrary={data.calendarLibrary??[]}
    correctionBaseline={correctionBaseline}/>:
   !embedded?<AtlasInspectorPreview key={project?.id||"portfolio"}
     project={project} snapshot={data} plan={plan} forecast={projected}
     dirty={dirty} saved={persisted} workRequest={previewWorkRequest}
     onClose={()=>setInspector(false)} onEditWork={id=>openEditor("work:"+id)}
     onEditProject={()=>openEditor("project-edit")} onOpenTab={goProjectTab}
     onSave={()=>void save()} canSave={dirty&&!busy&&!editor}/>:
   <section><div className="section-heading"><h2>Инспектор</h2><button className="icon-button" aria-label="Скрыть инспектор" onClick={()=>setInspector(false)}>×</button></div>
    <div className="inspector-block"><small>Текущий контекст</small><strong>{project?.name||"Портфель проектов"}</strong>
     <p>{project?.goal||"Выберите проект для работы с планом, доказательствами и изменениями."}</p></div>
    <div className="inspector-block"><small>Состояние данных</small><Badge tone={editor||dirty?"warning":persisted?"good":"neutral"}>{editor?"Форма не применена":dirty?"Только в памяти":persisted?"Сохранено на диск":"Ещё не сохранялся"}</Badge>
     <p>Данные портфеля хранятся на этом компьютере.</p>
     <Action onClick={()=>void save()} primary disabled={!dirty||busy||!!editor}>Сохранить редакцию</Action></div>
    {project&&<div className="inspector-block"><small>План проекта</small><p>Начало: {readable(project.startDate)}</p>
     <p>Контрольный срок: {readable(project.dueDate)}</p>
     <p>Расчётный финиш: {projectedFinishLabel(projected)}</p>
     <Action onClick={()=>openEditor("dates")}>Изменить даты</Action></div>}
    <div className="inspector-block"><small>Дополнительные сведения</small>
     <p>Сведения из источника помогут проверить выполненную работу. Окончательное решение остаётся за вами.</p></div>
   </section>}
  </aside>}
  </div>
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

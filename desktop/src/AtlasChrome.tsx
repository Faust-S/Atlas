import React from "react";

type Glyph="home"|"portfolio"|"work"|"gantt"|"review"|"resources"|"sources"|"panel"|"back"|"forward"|"graph"|"settings";
export function AtlasGlyph({name}:{name:Glyph}){
 const art:Record<Glyph,React.ReactNode>={
  home:<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>,
  portfolio:<><path d="M3 5h7l2 3h9v11H3z"/><path d="M3 13h18"/></>,
  work:<><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></>,
  gantt:<><path d="M3 6h18M3 12h18M3 18h18"/><path d="M6 4v4M11 10v4M17 16v4"/></>,
  review:<><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
  resources:<><path d="M5 9v10h14V9H5zM9 9V6h6v3M5 13h14M11 13v2h2v-2"/></>,
  sources:<><path d="M6 2h8l5 5v14H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM14 2v6h5M8 13h8M8 17h8"/></>,
  panel:<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
  back:<path d="M19 12H5m7-7-7 7 7 7"/>,
  forward:<path d="M5 12h14m-7-7 7 7-7 7"/>,
  graph:<><circle cx="5" cy="5" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="19" r="2"/><path d="M7 5l10 1M6 7l5 10M18 8l-5 9"/></>,
  settings:<><path d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.36-6.36-1.42 1.42M7.06 16.94l-1.42 1.42m12.72 0-1.42-1.42M7.06 7.06 5.64 5.64"/><circle cx="12" cy="12" r="5"/></>
 };
 return <svg className="atlas-v6-icon" width="19" height="19" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
  aria-hidden="true">{art[name]}</svg>;
}
type ChromeProps={
 logoUrl:string; canBack:boolean;canForward:boolean; onBack:()=>void;onForward:()=>void;
 onTogglePanel:()=>void;onToggleInspector:()=>void;inspector:boolean;
 onHome:()=>void;onPortfolio:()=>void;onGantt:()=>void;onReality:()=>void;
 onNewProject:()=>void;onNewWork:()=>void;onEditProject:()=>void;
 onSave:()=>void;canSave:boolean;canEdit:boolean;
 onExportIwxa:()=>void;onImportIwxa:()=>void;onExportJson:()=>void;onImportJson:()=>void;
 onHistory:()=>void;canExport:boolean;canImport:boolean;
 onSignedFile:()=>void;signedFileAvailable:boolean;canSignedFile:boolean;
 onSettings:()=>void;
};
export function AtlasChromeTopbar(props:ChromeProps){
 const c=(event:React.MouseEvent<HTMLButtonElement>,action:()=>void)=>{
  event.currentTarget.closest("details")?.removeAttribute("open");action();
 };
 return <header className="atlas-v6-titlebar" aria-label="Окно IWXA Atlas">
  <img className="atlas-v6-brand-logo" src={props.logoUrl} alt="Знак IWXA Atlas"/>
  <button className="atlas-v6-toolbar-icon" onClick={props.onBack}
   aria-label="Назад" title="Назад" disabled={!props.canBack}><AtlasGlyph name="back"/></button>
  <button className="atlas-v6-toolbar-icon" onClick={props.onForward}
   aria-label="Вперёд" title="Вперёд" disabled={!props.canForward}><AtlasGlyph name="forward"/></button>
  <button className="atlas-v6-toolbar-icon" onClick={props.onTogglePanel}
   aria-label="Показать или скрыть левую панель" title="Показать или скрыть левую панель">
   <AtlasGlyph name="panel"/></button>
  <span className="atlas-v6-title-divider"/>
  <strong className="atlas-v6-product-title">IWXA Atlas</strong>
  <div className="atlas-v6-top-menus">
   <details className="atlas-v6-menu"><summary>Файл</summary>
    <div className="atlas-v6-menu-items">
     <button onClick={e=>c(e,props.onNewProject)}>Новый проект</button>
     <button disabled={!props.canSave} onClick={e=>c(e,props.onSave)}>Сохранить · Ctrl+S</button>
     <div className="atlas-v6-menu-rule"/>
     <button disabled={!props.canExport} onClick={e=>c(e,props.onExportIwxa)}>Сохранить архив .iwxa</button>
     <button disabled={!props.canImport} onClick={e=>c(e,props.onImportIwxa)}>Открыть архив .iwxa</button>
     <button disabled={!props.canExport} onClick={e=>c(e,props.onExportJson)}>Сохранить копию JSON</button>
     <button disabled={!props.canImport} onClick={e=>c(e,props.onImportJson)}>Открыть копию JSON</button>
     {props.signedFileAvailable&&<button disabled={!props.canSignedFile}
      onClick={e=>c(e,props.onSignedFile)}>Принять подписанный Result .iwxa</button>}
     <div className="atlas-v6-menu-rule"/>
     <button disabled={!props.canExport} onClick={e=>c(e,props.onHistory)}>История сохранений</button>
    </div>
   </details>
   <details className="atlas-v6-menu"><summary>Правка</summary><div className="atlas-v6-menu-items">
    <button onClick={e=>c(e,props.onNewProject)}>Новый проект</button>
    <button disabled={!props.canEdit} onClick={e=>c(e,props.onNewWork)}>Новая работа · Ctrl+Shift+N</button>
    <button disabled={!props.canEdit} onClick={e=>c(e,props.onEditProject)}>Изменить проект</button>
   </div></details>
   <details className="atlas-v6-menu"><summary>Вид</summary><div className="atlas-v6-menu-items">
    <button onClick={e=>c(e,props.onHome)}>Главная</button>
    <button onClick={e=>c(e,props.onPortfolio)}>Портфель</button>
    <button disabled={!props.canEdit} onClick={e=>c(e,props.onGantt)}>График работ</button>
    <button disabled={!props.canEdit} onClick={e=>c(e,props.onReality)}>План / факт</button>
    <div className="atlas-v6-menu-rule"/>
    <button onClick={e=>c(e,props.onTogglePanel)}>Боковая панель</button>
    <button onClick={e=>c(e,props.onToggleInspector)}>{props.inspector?"Скрыть инспектор":"Открыть инспектор"}</button>
   </div></details>
   <details className="atlas-v6-menu"><summary>Справка</summary><div className="atlas-v6-menu-items">
    <button onClick={e=>c(e,props.onSettings)}>Настройки и сведения о приложении</button>
   </div></details>
  </div>
 </header>;
}
type RailProps={
 logoUrl:string;active:string;hasProject:boolean;
 onHome:()=>void;onPortfolio:()=>void;onWork:()=>void;onGantt:()=>void;onGraph:()=>void;
 onReality:()=>void;onResources:()=>void;onSources:()=>void;onSettings:()=>void;
};
export function AtlasChromeRail(p:RailProps){
 const items:{key:string;label:string;icon:Glyph;action:()=>void;disabled?:boolean}[]=[
  {key:"home",label:"Главная",icon:"home",action:p.onHome},
  {key:"portfolio",label:"Портфель",icon:"portfolio",action:p.onPortfolio},
  {key:"work",label:"Работы",icon:"work",action:p.onWork,disabled:!p.hasProject},
  {key:"timeline",label:"График работ",icon:"gantt",action:p.onGantt,disabled:!p.hasProject},
  {key:"graph",label:"Зависимости",icon:"graph",action:p.onGraph,disabled:!p.hasProject},
  {key:"reality",label:"План / факт",icon:"review",action:p.onReality,disabled:!p.hasProject},
  {key:"resources",label:"Ресурсы",icon:"resources",action:p.onResources},
  {key:"sources",label:"Источники",icon:"sources",action:p.onSources,disabled:!p.hasProject}
 ];
 return <nav className="atlas-v6-rail" aria-label="Основные разделы Atlas">
  {items.map(item=><button key={item.key} type="button"
   className={"atlas-v6-rail-btn"+(p.active===item.key?" is-active":"")}
   title={item.label} data-tip={item.label} aria-label={item.label}
   aria-current={p.active===item.key?"page":undefined}
   disabled={item.disabled} onClick={item.action}>
   <AtlasGlyph name={item.icon}/></button>)}
  <span className="atlas-v6-rail-spacer"/>
  <span className="atlas-v6-rail-separator"/>
  <button className={"atlas-v6-rail-btn atlas-v6-profile"+(p.active==="settings"?" is-active":"")}
   type="button" aria-label="Настройки Atlas" data-tip="Настройки" title="Настройки"
   onClick={p.onSettings}><img src={p.logoUrl} alt=""/></button>
 </nav>;
}

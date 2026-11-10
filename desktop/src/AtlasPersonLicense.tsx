import React,{useEffect,useRef,useState} from "react";
import {invoke} from "@tauri-apps/api/core";

type License={licenseId:string;status:"ACTIVE"|"SUSPENDED"|"REVOKED"|"EXPIRED"|"STATUS_STALE";
  sequence:number;signatureVerified:true;statusVerified:true;
  superseded:boolean;current:boolean;
  licenseExpiresAt:string;statusValidUntil:string;
  productionActivation:false};
type PersonView={schema:string;revision:number;productId:string;
  licenses:License[];productionActivation:false;activeSeats:0};
type HostResult={operation:string;productionActivation:false;activeSeats:0;
  view?:PersonView;signatureVerified?:boolean;statusVerified?:boolean;
  outcome?:string;status?:string};
type WorkspaceAccess={operation:"PERSON_AUTHORIZE";productId:string;featureId:string;
  permitted:boolean;signatureVerified:boolean;statusVerified:boolean;
  productionActivation:false;activeSeats:0};

const code=(error:unknown)=>error instanceof Error?error.message:String(error);
function describe(raw:string){
 const matches:Record<string,string>={
  ATLAS_PERSON_T3_COMPONENT_NOT_BUNDLED:"В эту установку Atlas ещё не включён проверяющий компонент T3.",
  ATLAS_PERSON_WINDOWS_REQUIRED:"Проверка персональных лицензий доступна в установленной версии для Windows.",
  PERSON_RECIPIENT_NOT_ENROLLED:"Этот компьютер ещё не привязан к получателю лицензии.",
  PERSON_CONSUMER_PREINSTALLED_TRUST_REQUIRED:"Доверие издателя ещё не установлено. Получите файл установки доверия из официального источника IWXA.",
  PERSON_CONSUMER_PREINSTALLED_TRUST_AND_KEY_REQUIRED:"Доверие издателя или локальная защита ещё не настроены.",
  PERSON_STATUS_ROLLBACK_DENIED:"Этот пакет содержит более старый статус лицензии. Сохранённые права не изменены.",
  PERSON_STATUS_STALE:"Срок подтверждения лицензии истёк. Попросите у издателя обновлённый пакет.",
  PERSON_LICENSE_NOT_CURRENT:"Срок лицензии истёк. Необходимо продление.",
  ATLAS_PERSON_WORKSPACE_LICENSE_REQUIRED:"Для изменения портфеля необходима действующая подписанная лицензия с правом WORKSPACE.",
  PERSON_RECIPIENT_SUBJECT_MISMATCH:"Лицензия предназначена другому получателю.",
  PERSON_LICENSE_PERSON_MISMATCH:"Лицензия предназначена другому получателю.",
  PERSON_LICENSE_PRODUCT_MISMATCH:"Лицензия выдана для другой программы.",
  PERSON_RECIPIENT_ALREADY_ENROLLED:"Получатель уже привязан к текущему профилю Windows.",
  PERSON_RECIPIENT_WINDOWS_BINDING_INVALID:"Не удалось подтвердить привязку к текущему компьютеру."
 };
 return matches[raw]??"Не удалось выполнить проверку: "+raw;
}
const status=(license:License)=>{
 if(license.status==="REVOKED")return "Отозвана";
 if(license.superseded)return "Заменена новым выпуском";
 if(license.status==="SUSPENDED")return "Приостановлена";
 if(license.status==="STATUS_STALE")return "Истёк подписанный срок подтверждения статуса";
 if(license.status==="EXPIRED")return "Срок лицензии истёк";
 return "Подписанный статус действителен";
};
const date=(value:string)=>new Date(value).toLocaleDateString("ru-RU");
export function AtlasPersonLicense({enabled}:{enabled:boolean}){
 const [editionEnabled,setEditionEnabled]=useState(false);
 const [opened,setOpened]=useState(false);
 const [busy,setBusy]=useState(false);
 const [needsIdentity,setNeedsIdentity]=useState(false);
 const [personId,setPersonId]=useState("");
 const [view,setView]=useState<PersonView|null>(null);
 const [workspaceAllowed,setWorkspaceAllowed]=useState(false);
 const [notice,setNotice]=useState("");
 const [failure,setFailure]=useState("");
 const closeRef=useRef<HTMLButtonElement|null>(null);
 const openRef=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{
   if(!enabled){setEditionEnabled(false);return;}
   let live=true;
   // Only the native Tauri build knows whether workspace license enforcement
   // is compiled in. This hides an unusable licensing surface in regular Atlas;
   // it never substitutes for the separate native authorization check.
   void invoke<boolean>("atlas_person_license_edition")
     .then(value=>{if(live)setEditionEnabled(value===true);})
     .catch(()=>{if(live)setEditionEnabled(false);});
   return()=>{live=false;};
 },[enabled]);
 async function refresh(){
  setBusy(true);setFailure("");setNeedsIdentity(false);
  try{
    const capabilities=await invoke<HostResult>("atlas_person_license_capabilities");
    if(capabilities?.operation!=="PERSON_CAPABILITIES"||
       capabilities.productionActivation!==false||capabilities.activeSeats!==0)
      throw Error("ATLAS_PERSON_CAPABILITIES_INVALID");
    const result=await invoke<HostResult>("atlas_person_license_read");
    if(result?.operation!=="PERSON_READ"||!result.view||
       result.productionActivation!==false||result.activeSeats!==0||
       result.view.productId!=="IWXA_ATLAS"||
       result.view.productionActivation!==false||
       result.view.activeSeats!==0||!Array.isArray(result.view.licenses))
      throw Error("ATLAS_PERSON_LICENSE_VIEW_INVALID");
    if(result.view.licenses.some(l=>!l.signatureVerified||!l.statusVerified||
       l.productionActivation!==false||typeof l.superseded!=="boolean"||
       typeof l.current!=="boolean"||
       !Number.isFinite(Date.parse(l.licenseExpiresAt))||
       !Number.isFinite(Date.parse(l.statusValidUntil))||
       !["ACTIVE","SUSPENDED","REVOKED","EXPIRED","STATUS_STALE"].includes(l.status)))
      throw Error("ATLAS_PERSON_LICENSE_ENTRY_INVALID");
    const access=await invoke<WorkspaceAccess>("atlas_person_license_workspace_access");
    if(access?.operation!=="PERSON_AUTHORIZE"||access.productId!=="IWXA_ATLAS"||
       access.featureId!=="WORKSPACE"||typeof access.permitted!=="boolean"||
       access.productionActivation!==false||access.activeSeats!==0||
       (access.permitted&&(!access.signatureVerified||!access.statusVerified)))
      throw Error("ATLAS_PERSON_WORKSPACE_ADMISSION_INVALID");
    setWorkspaceAllowed(access.permitted);
    setView(result.view);
  }catch(e){
    setView(null);
    setWorkspaceAllowed(false);
    const raw=code(e);
    setNeedsIdentity(raw.includes("PERSON_RECIPIENT_NOT_ENROLLED"));
    setFailure(describe(raw));
  }finally{setBusy(false);}
 }
 useEffect(()=>{
   if(!opened)return;
   closeRef.current?.focus();
   void refresh();
 },[opened]);
 useEffect(()=>{
   if(!opened)return;
   const esc=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!busy){
     setOpened(false);openRef.current?.focus();
   }};
   window.addEventListener("keydown",esc);
   return()=>window.removeEventListener("keydown",esc);
 },[opened,busy]);
 async function enroll(){
   if(busy||!personId||personId.startsWith("holder:")||
      !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/.test(personId))return;
   setBusy(true);setFailure("");setNotice("");
   try{
     const result=await invoke<HostResult>("atlas_person_license_enroll",{personId});
     if(result?.operation!=="PERSON_ENROLLED"||
        result.productionActivation!==false||result.activeSeats!==0)
       throw Error("ATLAS_PERSON_ENROLLMENT_RECEIPT_INVALID");
     setNeedsIdentity(false);
     setNotice("Получатель привязан к текущему профилю Windows. Теперь можно открыть подписанный пакет.");
     await refresh();
   }catch(e){setFailure(describe(code(e)));}
   finally{setBusy(false);}
 }
 async function receive(){
   if(busy)return;
   setBusy(true);setFailure("");setNotice("");
   try{
     const receipt=await invoke<HostResult|null>("atlas_person_license_import");
     if(receipt===null)return;
     if(receipt?.operation!=="PERSON_RECEIVE"||
       receipt.productionActivation!==false||receipt.activeSeats!==0||
       receipt.signatureVerified!==true||receipt.statusVerified!==true)
       throw Error("ATLAS_PERSON_IMPORT_RECEIPT_INVALID");
     setNotice("Подпись и статус проверены T3. Лицензия сохранена на этом компьютере.");
     await refresh();
   }catch(e){setFailure(describe(code(e)));}
   finally{setBusy(false);}
 }
 if(!enabled||!editionEnabled)return null;
 return <>
   <button ref={openRef} type="button" className="action-button"
     data-testid="atlas-person-license-open" onClick={()=>setOpened(true)}>
     Моя лицензия
   </button>
   {opened&&<div className="atlas-person-license-backdrop">
     <section className="atlas-person-license-dialog" role="dialog"
       aria-modal="true" aria-label="Моя лицензия">
       <header className="atlas-person-license-header">
         <div><small>Atlas</small><h2>Моя лицензия</h2></div>
         <button ref={closeRef} type="button" className="icon-button"
           aria-label="Закрыть окно лицензии" disabled={busy}
           onClick={()=>{setOpened(false);openRef.current?.focus();}}>×</button>
       </header>
       <p>Лицензия передаётся офлайн. Atlas проверяет подпись и статус через T3,
         используя ранее установленное доверие издателя.</p>
       {busy&&<p role="status">Проверяем данные лицензии…</p>}
       {failure&&<p className="alert error" role="alert">{failure}</p>}
       {notice&&<p className="alert notice" role="status">{notice}</p>}
       {needsIdentity&&<form className="atlas-person-license-enroll" onSubmit={e=>{
         e.preventDefault();void enroll();
       }}>
         <h3>Привязать получателя</h3>
         <p>Введите идентификатор получателя, указанный издателем. Он будет
           привязан к текущему профилю Windows и не изменяется при импорте пакета.</p>
         <label>Идентификатор получателя
           <input type="text" autoComplete="off" required
             minLength={1} maxLength={160}
             value={personId} onChange={e=>setPersonId(e.target.value)}
             placeholder="person:…" disabled={busy}/>
         </label>
         <button type="submit" className="action-button primary" disabled={busy||
           !/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/.test(personId)||
           personId.startsWith("holder:")}>
           Привязать к этому компьютеру
         </button>
       </form>}
       {view&&<div data-testid="atlas-person-license-records">
         <h3>Сохранённые лицензии</h3>
         {view.licenses.length===0?<p>Подписанных лицензий пока нет.</p>:
           view.licenses.map((l,i)=><article key={l.licenseId}
             className="atlas-person-license-entry">
             <strong>Лицензия {i+1}</strong>
             <span>{status(l)}</span>
             <small>Срок лицензии: до {date(l.licenseExpiresAt)}. Подписанное подтверждение статуса: до {date(l.statusValidUntil)}. Версия статуса: {l.sequence}.</small>
           </article>)}
         <p className="minor" data-testid="atlas-person-workspace-access">
          Право WORKSPACE: {workspaceAllowed?"подтверждено подписанной лицензией и статусом":
            "не подтверждено; лицензируемая сборка не разрешит изменения портфеля"}.
          Это локальная проверка, а не подтверждение коммерческого издателя
          или права на облачные ресурсы.</p>
       </div>}
       <footer className="atlas-person-license-footer">
         <button type="button" className="action-button"
           onClick={()=>void refresh()} disabled={busy}>Обновить</button>
         <button type="button" className="action-button primary"
           data-testid="atlas-person-license-import" onClick={()=>void receive()}
           disabled={busy||needsIdentity||!view}>
           Открыть лицензию .iwxa
         </button>
       </footer>
     </section>
   </div>}
 </>;
}

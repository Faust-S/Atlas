// User-facing diagnostics for failed asset imports/runtime startup.
// Tauri applies the only production CSP in tauri.conf.json.
const overlay=document.getElementById("atlas-bootstrap");
const message=document.getElementById("atlas-bootstrap-message");
const root=document.getElementById("root");
let ready=false;
const showFailure=(detail:string)=>{
 if(ready||!overlay||!message)return;
 message.textContent="Не удалось открыть интерфейс Atlas: "+detail+
  ". Файлы проекта не изменены. Проверьте установку приложения.";
 overlay.hidden=false;
 overlay.setAttribute("role","alert");
};
const observer=new MutationObserver(()=>{
 if(root?.childElementCount){
  ready=true;
  if(overlay)overlay.hidden=true;
  observer.disconnect();
 }
});
if(root)observer.observe(root,{childList:true});
window.addEventListener("error",event=>{
 const e=event as ErrorEvent;
 const failed=(event.target as HTMLElement | null);
 const resource=failed && "tagName" in failed && ["SCRIPT","LINK"].includes(failed.tagName);
 if(resource)showFailure("невозможно загрузить модуль или таблицу стилей");
 else if(e.message)showFailure(e.message.slice(0,300));
},true);
window.addEventListener("unhandledrejection",event=>{
 const reason=event.reason instanceof Error?event.reason.message:String(event.reason);
 showFailure(reason.slice(0,300));
});
window.setTimeout(()=>{
 if(!ready)showFailure("модуль интерфейса не запустился");
},10000);

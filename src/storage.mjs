// Standalone-only persistence. Agent hosting must use its existing Workspace store.
// A single IndexedDB authority, an atomic current/previous pair, SHA-256 integrity,
// and optimistic concurrency protect against truncated data and stale tabs.
import {empty,serialize,deserialize} from "./core.mjs";

export const LEGACY_KEY="iwxa-atlas-public/1";
export const DB_NAME="iwxa-atlas-standalone";
const STORE="snapshots";
const VERSION=1;

function same(a,b){
 if(a==null||b==null)return a==null&&b==null;
 return a.id===b.id&&a.revision===b.revision&&a.digest===b.digest&&a.json===b.json;
}
function message(error){
 return error instanceof Error?error.message:String(error||"Unknown storage error");
}
export function createStandaloneStore({
 factory=globalThis.indexedDB,
 legacy=globalThis.localStorage,
 cryptoProvider=globalThis.crypto,
 dbName=DB_NAME,
 legacyKey=LEGACY_KEY
}={}){
 let database=null,opening=null,token=undefined,recovery=null,mode="uninitialized";
 async function open(){
  if(database)return database;
  if(opening)return opening;
  if(!factory)throw Error("IndexedDB недоступен. Сохранение отключено; откройте Atlas в современном браузере.");
  opening=new Promise((resolve,reject)=>{
   let req;
   try{req=factory.open(dbName,VERSION)}catch(e){reject(e);return}
   req.onupgradeneeded=()=>{
    const db=req.result;
    if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});
   };
   req.onblocked=()=>reject(Error("База Atlas занята другой вкладкой. Закройте старую вкладку и обновите страницу."));
   req.onerror=()=>reject(req.error||Error("Не удалось открыть IndexedDB"));
   req.onsuccess=()=>{
    database=req.result;
    database.onversionchange=()=>{database.close();database=null;opening=null;mode="blocked"};
    resolve(database);
   };
  }).catch(e=>{opening=null;throw e});
  return opening;
 }
 async function hash(json){
  if(!cryptoProvider?.subtle||typeof TextEncoder==="undefined")
   throw Error("Для контроля целостности требуется Web Crypto (HTTPS или localhost).");
  const buf=await cryptoProvider.subtle.digest("SHA-256",new TextEncoder().encode(json));
  return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
 }
 async function pack(state){
  const json=serialize(state);
  return {id:"head",revision:state.revision,json,digest:await hash(json),savedAt:new Date().toISOString()};
 }
 async function unpack(rec){
  if(!rec||typeof rec.json!=="string"||typeof rec.digest!=="string")
   throw Error("Повреждена структура снимка Atlas");
  if(await hash(rec.json)!==rec.digest)
   throw Error("Контрольная сумма снимка Atlas не совпадает");
  const state=deserialize(rec.json);
  if(rec.revision!==state.revision)throw Error("Версия снимка Atlas не совпадает");
  return state;
 }
 async function readPair(){
  const db=await open();
  return new Promise((resolve,reject)=>{
   let tx,head,previous;
   try{
    tx=db.transaction(STORE,"readonly");
    const store=tx.objectStore(STORE);
    const a=store.get("head"),b=store.get("previous");
    a.onsuccess=()=>{head=a.result||null};
    b.onsuccess=()=>{previous=b.result||null};
    tx.oncomplete=()=>resolve({head:head||null,previous:previous||null});
    tx.onerror=()=>reject(tx.error||Error("Не удалось прочитать снимки Atlas"));
    tx.onabort=()=>reject(tx.error||Error("Чтение Atlas отменено"));
   }catch(e){reject(e)}
  });
 }
 // All checks and writes occur inside one IDB transaction. No awaits inside it.
 async function commit(state,{force=false,quarantine=false}={}){
  if(token===undefined)throw Error("Хранилище ещё не загружено");
  if(mode!=="ready"&&!force)throw Error("Требуется восстановление снимка перед сохранением");
  const next=await pack(state),db=await open(),expected=token;
  await new Promise((resolve,reject)=>{
   let tx,reason;
   try{
    tx=db.transaction(STORE,"readwrite");
    const store=tx.objectStore(STORE),request=store.get("head");
    request.onsuccess=()=>{
     try{
      const current=request.result||null;
      if(!same(current,expected))throw Error("Данные изменились в другой вкладке. Обновите Atlas перед повторным сохранением.");
      if(!force&&current&&state.revision<=current.revision)throw Error("Снимок не новее записанной версии");
      if(quarantine){
       if(current)store.put({...current,id:"quarantine-head"});
       const prior=store.get("previous");
       prior.onsuccess=()=>{
        if(prior.result)store.put({...prior.result,id:"quarantine-previous"});
        store.delete("previous");
        store.put(next);
       };
      }else{
       if(current)store.put({...current,id:"previous"});
       store.put(next);
      }
     }catch(e){reason=e;tx.abort()}
    };
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(reason||tx.error||Error("Транзакция сохранения Atlas отменена"));
    tx.onerror=()=>{reason??=tx.error};
   }catch(e){reject(e)}
  });
  token=next;mode="ready";recovery=null;
  return state;
 }
 async function load(){
  if(token!==undefined)throw Error("Хранилище Atlas уже открыто");
  const {head,previous}=await readPair();
  token=head; // Preserve the exact previously observed head for compare-and-swap.
  if(head){
   try{
    const state=await unpack(head);
    mode="ready";
    return {state,status:"ready"};
   }catch(error){
    if(previous){
     try{
      const state=await unpack(previous);
      recovery=previous;mode="recovery";
      return {state,status:"recovery",warning:"Текущий снимок повреждён. Показана предыдущая исправная версия. Для продолжения подтвердите восстановление."};
     }catch{}
    }
    mode="blocked";
    throw Error("Текущий снимок Atlas повреждён, исправной резервной версии нет. Автозамена запрещена: импортируйте сохранённый JSON. "+message(error));
   }
  }
  if(previous){
   try{
    const state=await unpack(previous);
    recovery=previous;mode="recovery";
    return {state,status:"recovery",warning:"Основной снимок отсутствует, доступна предыдущая версия. Подтвердите восстановление."};
   }catch{}
   mode="blocked";
   throw Error("Резервный снимок Atlas повреждён. Импортируйте сохранённый JSON.");
  }
  let legacyJson=null;
  try{legacyJson=legacy?.getItem(legacyKey)??null}
  catch(e){mode="blocked";throw Error("Не удалось прочитать прежнее хранилище: "+message(e))}
  if(legacyJson!==null){
   let state;
   try{state=deserialize(legacyJson)}
   catch(e){mode="blocked";throw Error("Прежние данные Atlas повреждены. Они не удалены и не заменены. Восстановите JSON из резервной копии. "+message(e))}
   mode="ready";
   await commit(state,{force:true});
   // Keep old localStorage as a non-destructive one-time migration fallback.
   return {state,status:"migrated",warning:"Данные перенесены из localStorage в IndexedDB; исходная копия оставлена для безопасности."};
  }
  mode="ready";
  return {state:empty(),status:"new"};
 }
 async function save(state){return commit(state)}
 async function replace(state){
  // Called only after an explicit user confirmation in the application.
  if(token===undefined)throw Error("Хранилище Atlas ещё не прочитано");
  return commit(state,{force:true,quarantine:mode!=="ready"});
 }
 async function restorePrevious(){
  if(mode!=="recovery"||!recovery)throw Error("Исправного резервного снимка для восстановления нет");
  const state=await unpack(recovery),db=await open(),expectedHead=token,expectedBackup=recovery;
  const promoted={...recovery,id:"head"};
  await new Promise((resolve,reject)=>{
   let tx,reason;
   try{
    tx=db.transaction(STORE,"readwrite");
    const store=tx.objectStore(STORE),h=store.get("head"),b=store.get("previous");
    let head,previous,seen=0;
    const finish=()=>{
     if(++seen!==2)return;
     try{
      if(!same(head||null,expectedHead)||!same(previous||null,expectedBackup))
       throw Error("Снимки изменились в другой вкладке. Сначала обновите Atlas.");
      if(head)store.put({...head,id:"quarantine-head"});
      store.put(promoted);
     }catch(e){reason=e;tx.abort()}
    };
    h.onsuccess=()=>{head=h.result;finish()};
    b.onsuccess=()=>{previous=b.result;finish()};
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(reason||tx.error||Error("Восстановление Atlas отменено"));
    tx.onerror=()=>{reason??=tx.error};
   }catch(e){reject(e)}
  });
  token=promoted;mode="ready";recovery=null;
  return state;
 }
 function close(){database?.close();database=null;opening=null;}
 return {load,save,replace,restorePrevious,close,get mode(){return mode}};
}

import React,{useState} from "react";
type SettingsProps={
 version:string;projectCount:number;workCount:number;revision:number;
 saved:boolean;dirty:boolean;native:boolean;t3Available:boolean;
 onBack:()=>void;onHome:()=>void;onSave:()=>void;onExport:()=>void;onImport:()=>void;
 onHistory:()=>void;onPortfolio:()=>void;canImport:boolean;canSave:boolean;
};
export function AtlasSettings(p:SettingsProps){
 const [section,setSection]=useState<"appearance"|"data"|"about">("appearance");
 return <section className="atlas-v6-settings" aria-label="Настройки Atlas">
  <div className="atlas-v6-settings-head"><div><h1>Настройки</h1>
   <p>Параметры интерфейса и сведения о локальном портфеле.</p></div>
   <button type="button" className="action-button" onClick={p.onBack}>Вернуться</button>
  </div>
  <div className="atlas-v6-settings-layout">
   <nav className="atlas-v6-settings-list" aria-label="Разделы настроек">
    <button className={section==="appearance"?"selected":""} onClick={()=>setSection("appearance")}>Оформление</button>
    <button className={section==="data"?"selected":""} onClick={()=>setSection("data")}>Данные и восстановление</button>
    <button className={section==="about"?"selected":""} onClick={()=>setSection("about")}>О приложении</button>
   </nav>
   <div className="atlas-v6-settings-content">
    {section==="appearance"&&<>
     <h2>Оформление</h2>
     <div className="atlas-v6-settings-card"><div className="atlas-v6-setting-row"><div><strong>Язык</strong><p>Русский интерфейс Atlas.</p></div><span>Русский</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Внешний вид</strong><p>Единая синяя тема IWXA, согласованная с Personal Agent.</p></div><span>Светлая</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Главная</strong><p>Порядок и состав блоков меняются через «Настроить дашборд» на главной. Эти параметры не меняют документы проекта.</p></div><button className="action-button" onClick={p.onHome}>Открыть главную</button></div>
     </div>
    </>}
    {section==="data"&&<>
     <h2>Данные и восстановление</h2>
     <div className="atlas-v6-settings-card">
      <div className="atlas-v6-setting-row"><div><strong>Native Store</strong><p>{p.native?"Портфель хранится локально через штатное хранилище Atlas.":"Встроенный Host управляет сохранением через свои разрешённые порты."}</p></div><span>{p.saved?"Есть сохранённая редакция":"Новый портфель"}</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Текущая редакция</strong><p>{p.projectCount} проектов, {p.workCount} работ. Редакция {p.revision}.</p></div><span>{p.dirty?"Есть изменения":"Без новых изменений"}</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Сохранение</strong><p>Запись выполняется отдельно после проверки черновика.</p></div><button disabled={!p.canSave} className="action-button" onClick={p.onSave}>Сохранить</button></div>
      <div className="atlas-v6-setting-row"><div><strong>Архив .iwxa</strong><p>Штатный экспорт и независимый импорт используют существующие форматы и подтверждения.</p></div><div className="atlas-v6-settings-actions">
       <button className="action-button" disabled={!p.saved||p.dirty} onClick={p.onExport}>Экспорт</button>
       <button className="action-button" disabled={!p.canImport} onClick={p.onImport}>Импорт</button></div></div>
      <div className="atlas-v6-setting-row"><div><strong>История сохранений</strong><p>Предыдущие записанные редакции доступны для восстановления.</p></div><button className="action-button" disabled={!p.saved||p.dirty} onClick={p.onHistory}>Открыть</button></div>
     </div>
    </>}
    {section==="about"&&<>
     <h2>Об IWXA Atlas</h2>
     <div className="atlas-v6-settings-card">
      <div className="atlas-v6-setting-row"><div><strong>Программа</strong><p>IWXA Atlas для управления проектами, календарным планированием, решениями и результатами.</p></div><span>IWXA Atlas</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Установленная версия</strong><p>Версия исполняемого приложения, не номер ветки разработки.</p></div><span>{p.version}</span></div>
      <div className="atlas-v6-setting-row"><div><strong>Оригинальный T3</strong><p>Разрешённое получение подписанного Result не зависит от выбора модели или отдельного Agent.</p></div><span>{p.t3Available?"Порт доступен":"Порт не предоставлен"}</span></div>
     </div>
    </>}
    <p className="minor">Все данные и действия на этой странице принадлежат установленной Atlas. Смена раздела не изменяет проекты и не подтверждает выполнение работ.</p>
   </div>
  </div>
 </section>;
}

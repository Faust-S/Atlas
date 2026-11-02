//! Atlas 0.2 native persistence authority.
//! Immutable per-project blocks + one atomic manifest update. No HTTP server,
//! cloud identity, Task Engine or access to arbitrary frontend-supplied paths.
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use uuid::Uuid;

const MAX_FILE: u64 = 100 * 1024 * 1024;
const MAX_PROJECTS: usize = 5000;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema: String,
    generation: String,
    revision: u64,
    root: Value,
    #[serde(default)]
    root_sha256: Option<String>,
    projects: Vec<BlockRef>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct BlockRef {
    id: String,
    sha256: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenResult {
    generation: String,
    snapshot: Value,
    restored_from_backup: bool,
    needs_confirmation: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WriteResult {
    generation: String,
    revision: u64,
    project_blocks_written: usize,
}

fn err(context: &str, e: impl std::fmt::Display) -> String {
    format!("{}: {}", context, e)
}
fn to_json<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec(value).map_err(|e| err("Сериализация", e))
}
fn checksum(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn path_for(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map(|p| p.join("atlas-store-v1"))
        .map_err(|e| err("Недоступен каталог данных Atlas", e))
}
fn ensure_dirs(root: &Path) -> Result<(), String> {
    for dir in [root.to_path_buf(), root.join("blocks"), root.join("history")] {
        fs::create_dir_all(&dir).map_err(|e| err("Создание каталога", e))?;
    }
    Ok(())
}
fn lock(root: &Path) -> Result<File, String> {
    ensure_dirs(root)?;
    let f = OpenOptions::new().create(true).read(true).write(true)
        .open(root.join("atlas.lock")).map_err(|e| err("Блокировка", e))?;
    f.lock_exclusive().map_err(|e| err("Конкурентная запись", e))?;
    Ok(f)
}
fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| err("Открытие файла", e))?;
    if file.metadata().map_err(|e| err("Размер файла", e))?.len() > MAX_FILE {
        return Err("Файл превышает лимит 100 МБ".into());
    }
    let mut buf = Vec::new();
    file.take(MAX_FILE + 1).read_to_end(&mut buf)
        .map_err(|e| err("Чтение файла", e))?;
    if buf.len() as u64 > MAX_FILE {
        return Err("Файл превышает лимит 100 МБ".into());
    }
    Ok(buf)
}
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)
        .map_err(|e| err("Создание файла", e))?;
    file.write_all(bytes).map_err(|e| err("Запись", e))?;
    file.sync_all().map_err(|e| err("Синхронизация данных", e))
}
fn temp_file(root: &Path, bytes: &[u8]) -> Result<PathBuf, String> {
    let temp = root.join(format!(".{}.pending", Uuid::new_v4()));
    write_new(&temp, bytes)?;
    Ok(temp)
}
#[cfg(windows)]
fn atomic_replace(temp: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;
    if !destination.exists() {
        return fs::rename(temp, destination).map_err(|e| err("Публикация записи", e));
    }
    let src: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let dst: Vec<u16> = destination.as_os_str().encode_wide().chain(Some(0)).collect();
    let result = unsafe {
        ReplaceFileW(dst.as_ptr(), src.as_ptr(), std::ptr::null(), 0,
            std::ptr::null_mut(), std::ptr::null_mut())
    };
    if result == 0 { return Err(err("Атомарная замена", std::io::Error::last_os_error())); }
    Ok(())
}
#[cfg(not(windows))]
fn atomic_replace(temp: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temp, destination).map_err(|e| err("Атомарная замена", e))
}
fn publish(root: &Path, destination: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = temp_file(root, bytes)?;
    if let Err(e) = atomic_replace(&temp, destination) {
        let _ = fs::remove_file(temp);
        return Err(e);
    }
    // Best effort: directory durability varies across Windows filesystems.
    #[cfg(unix)]
    if let Ok(dir) = File::open(root) { let _ = dir.sync_all(); }
    Ok(())
}
fn validate_snapshot(snapshot: &Value) -> Result<(), String> {
    let root = snapshot.as_object().ok_or("Неверный формат портфеля")?;
    if root.get("schema").and_then(Value::as_str) != Some("atlas.project/1") {
        return Err("Несовместимая схема Atlas".into());
    }
    let revision = root.get("revision").and_then(Value::as_u64)
        .ok_or("Некорректная редакция портфеля")?;
    if revision > 9_007_199_254_740_991 {return Err("Недопустимая редакция".into());}
    let projects = root.get("projects").and_then(Value::as_array)
        .ok_or("Отсутствуют проекты")?;
    if projects.len() > MAX_PROJECTS {return Err("Слишком много проектов".into());}
    let mut ids = HashSet::new();
    for p in projects {
        let id = p.get("id").and_then(Value::as_str).ok_or("Проект без ID")?;
        if id.len() > 160 || id.is_empty() || !ids.insert(id.to_owned()) {
            return Err("Повторяющийся или недопустимый ID проекта".into());
        }
        if !p.get("items").is_some_and(Value::is_array)
            || !p.get("dependencies").is_some_and(Value::is_array) {
            return Err("Повреждена структура проекта".into());
        }
    }
    Ok(())
}
fn encode(root: &Path, snapshot: Value, generation: String) -> Result<(Manifest, usize), String> {
    validate_snapshot(&snapshot)?;
    let obj = snapshot.as_object().ok_or("Некорректный портфель")?;
    let mut extras = obj.clone();
    let revision = extras.get("revision").and_then(Value::as_u64).ok_or("Нет редакции")?;
    extras.remove("projects");
    let projects = obj.get("projects").and_then(Value::as_array).ok_or("Нет проектов")?;
    let mut blocks = Vec::new();
    let mut written = 0;
    for project in projects {
        let bytes = to_json(project)?;
        let hash = checksum(&bytes);
        let filename = root.join("blocks").join(format!("{hash}.json"));
        if !filename.exists() {
            let pending = temp_file(root, &bytes)?;
            match fs::rename(&pending, &filename) {
                Ok(()) => written += 1,
                Err(_e) if filename.exists() => { let _ = fs::remove_file(pending); },
                Err(e) => { let _ = fs::remove_file(pending); return Err(err("Блок проекта", e)); }
            }
        } else if checksum(&read_limited(&filename)?) != hash {
            return Err("Повреждён существующий блок проекта".into());
        }
        blocks.push(BlockRef {
            id: project.get("id").and_then(Value::as_str).unwrap_or_default().to_owned(),
            sha256: hash,
        });
    }
    Ok((Manifest{schema:"atlas.store/1".into(),generation,revision,
        root_sha256:Some(checksum(&to_json(&extras)?)),root:Value::Object(extras),projects:blocks},written))
}
fn read_manifest(path: &Path) -> Result<Manifest, String> {
    let manifest: Manifest = serde_json::from_slice(&read_limited(path)?)
        .map_err(|e| err("Неверный индекс хранилища", e))?;
    if manifest.schema != "atlas.store/1" {return Err("Неверная версия индекса".into());}
    if Uuid::parse_str(&manifest.generation).is_err() {
        return Err("Повреждён идентификатор записи".into());
    }
    if manifest.projects.len() > MAX_PROJECTS {return Err("Превышен лимит проектов".into());}
    if let Some(expected)=&manifest.root_sha256{
        if checksum(&to_json(&manifest.root)?)!=*expected {
            return Err("Ошибка целостности индекса портфеля".into());
        }
    }
    Ok(manifest)
}
fn decode(root: &Path, m: &Manifest) -> Result<Value, String> {
    let mut data = m.root.as_object().ok_or("Некорректный индекс")?.clone();
    let mut projects = Vec::with_capacity(m.projects.len());
    for block in &m.projects {
        if block.sha256.len()!=64||!block.sha256.bytes().all(|x|x.is_ascii_hexdigit()){
            return Err("Некорректная ссылка на блок".into());
        }
        let bytes = read_limited(&root.join("blocks").join(format!("{}.json",block.sha256)))?;
        if checksum(&bytes)!=block.sha256 {return Err("Ошибка SHA-256 блока проекта".into());}
        let project: Value = serde_json::from_slice(&bytes).map_err(|e|err("Блок проекта",e))?;
        if project.get("id").and_then(Value::as_str)!=Some(block.id.as_str()) {
            return Err("ID проекта не совпал с индексом".into());
        }
        projects.push(project);
    }
    data.insert("projects".into(),Value::Array(projects));
    let snapshot = Value::Object(data);
    validate_snapshot(&snapshot)?;
    if snapshot.get("revision").and_then(Value::as_u64)!=Some(m.revision) {
        return Err("Редакция индекса не совпадает с данными".into());
    }
    Ok(snapshot)
}
fn current(root: &Path) -> Result<Option<Manifest>, String> {
    let file = root.join("head.json");
    if !file.exists() {return Ok(None);}
    read_manifest(&file).map(Some)
}
fn backup_candidates(root:&Path)->Result<Vec<PathBuf>,String>{
    let mut all = Vec::new();
    for entry in fs::read_dir(root.join("history")).map_err(|e|err("История",e))? {
        let item=entry.map_err(|e|err("История",e))?;
        let path=item.path();
        if path.extension().and_then(|s|s.to_str())==Some("json") {all.push(path);}
    }
    all.sort_by(|a,b|b.file_name().cmp(&a.file_name()));
    Ok(all)
}
fn backup_open(root:&Path)->Result<OpenResult,String>{
    for path in backup_candidates(root)? {
        if let Ok(manifest)=read_manifest(&path) {
            if let Ok(snapshot)=decode(root,&manifest) {
                return Ok(OpenResult{generation:manifest.generation,snapshot,
                    restored_from_backup:true,needs_confirmation:true});
            }
        }
    }
    Err("Основной индекс повреждён; исправная резервная редакция не найдена. Исходные файлы сохранены.".into())
}
fn load_root(root:&Path)->Result<OpenResult,String>{
    match current(root) {
        Ok(Some(m))=>match decode(&root,&m){
            Ok(snapshot)=>Ok(OpenResult{generation:m.generation,snapshot,
                restored_from_backup:false,needs_confirmation:false}),
            Err(_)=>backup_open(root),
        },
        Ok(None)=>{
            // Missing head with retained history is not an empty portfolio.
            if !backup_candidates(root)?.is_empty(){return backup_open(root);}
            Ok(OpenResult{generation:"none".into(),
                snapshot:serde_json::json!({"schema":"atlas.project/1","revision":0,"projects":[]}),
                restored_from_backup:false,needs_confirmation:false})
        },
        Err(_)=>backup_open(root),
    }
}
#[tauri::command]
fn atlas_open(app:AppHandle)->Result<OpenResult,String>{
    let root=path_for(&app)?;
    let _guard=lock(&root)?;
    let loaded=load_root(&root);
    // Observability only: the UIA Windows runner may hide WebView2 accessibility
    // nodes. A CI-only, fixed-temp receipt proves React reached the native
    // command through the packaged Tauri bridge without writing portfolio data.
    if std::env::var_os("ATLAS_CI_RENDERER_PROBE").as_deref()==Some(std::ffi::OsStr::new("1")){
        let receipt=std::env::temp_dir().join(format!("iwxa-atlas-renderer-{}.probe",std::process::id()));
        let marker=if loaded.is_ok(){"ATLAS_TAURI_JS_NATIVE_OPEN_PASS"}else{"ATLAS_TAURI_JS_NATIVE_OPEN_ERROR"};
        let _=fs::write(receipt,marker);
    }
    loaded
}
fn commit_root(root:&Path,expected_generation:&str,snapshot:Value)->Result<WriteResult,String>{
    let _guard=lock(root)?;
    let head=current(root)?;
    if head.is_none()&&!backup_candidates(root)?.is_empty(){
        return Err("Отсутствует текущий индекс, но осталась история. Сначала восстановите портфель.".into());
    }
    if let Some(old)=&head{decode(root,old)?;}
    let observed=head.as_ref().map(|m|m.generation.as_str()).unwrap_or("none");
    if observed!=expected_generation {return Err("Данные изменились в другом окне или процессе. Запись отклонена; перечитайте портфель.".into());}
    validate_snapshot(&snapshot)?;
    let revision=snapshot.get("revision").and_then(Value::as_u64).ok_or("Нет редакции")?;
    if let Some(previous)=&head {
        if revision<=previous.revision {return Err("Новая редакция должна быть выше сохранённой".into());}
        // Immutable retained index; old blocks are never deleted during a commit.
        let archived=root.join("history").join(format!("{:020}-{}.json",previous.revision,previous.generation));
        if !archived.exists() {write_new(&archived,&to_json(previous)?)?;}
    }
    let generation=Uuid::new_v4().to_string();
    let (manifest,written)=encode(&root,snapshot,generation.clone())?;
    // The first saved portfolio has no previous head to archive. Retain its
    // manifest before publication so loss of head.json cannot reopen an empty
    // portfolio while the first generation's blocks still exist.
    if head.is_none() {
        let archived=root.join("history").join(
            format!("{:020}-{}.json",manifest.revision,manifest.generation));
        write_new(&archived,&to_json(&manifest)?)?;
    }
    publish(&root,&root.join("head.json"),&to_json(&manifest)?)?;
    Ok(WriteResult{generation,revision,project_blocks_written:written})
}
#[tauri::command]
fn atlas_commit(app:AppHandle,expected_generation:String,snapshot:Value)->Result<WriteResult,String>{
    commit_root(&path_for(&app)?,&expected_generation,snapshot)
}
#[tauri::command]
fn atlas_export_json(app:AppHandle, expected_generation:String)->Result<String,String>{
    let root=path_for(&app)?;
    let (snapshot,generation)={
        let _guard=lock(&root)?;
        let head=current(&root)?.ok_or("Портфель ещё не сохранён")?;
        if head.generation!=expected_generation {return Err("Перед экспортом обновите редакцию портфеля".into());}
        (decode(&root,&head)?,head.generation)
    };
    let path=app.dialog().file()
        .set_title("Сохранить резервную копию Atlas JSON")
        .set_file_name("atlas-backup.json")
        .add_filter("Atlas JSON",&["json"])
        .blocking_save_file().ok_or("Выбор файла отменён")?;
    let selected=match path {FilePath::Path(p)=>p,_=>return Err("Требуется локальный путь к файлу".into())};
    if selected.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())!=Some("json".into()){
        return Err("Разрешён только файл .json".into());
    }
    if selected.exists() {return Err("Файл уже существует. Выберите новое имя резервной копии.".into());}
    let bytes=serde_json::to_vec_pretty(&snapshot).map_err(|e|err("Экспорт",e))?;
    write_new(&selected,&bytes)?;
    Ok(format!("Резервная копия сохранена для редакции {}",generation))
}
#[tauri::command]
fn atlas_select_import(app:AppHandle)->Result<Option<Value>,String>{
    let picked=app.dialog().file().set_title("Открыть архив Atlas JSON")
        .add_filter("Atlas JSON",&["json"]).blocking_pick_file();
    let Some(FilePath::Path(path))=picked else{return Ok(None)};
    if path.extension().and_then(|x|x.to_str()).map(|x|x.to_ascii_lowercase())!=Some("json".into()){
        return Err("Открывать можно только Atlas JSON".into());
    }
    let data:Value=serde_json::from_slice(&read_limited(&path)?)
        .map_err(|e|err("Неверный JSON",e))?;
    validate_snapshot(&data)?;
    Ok(Some(data))
}
fn restore_root(root:&Path)->Result<OpenResult,String>{
    let _guard=lock(root)?;
    // Never permit rollback through a native command when the active head is sound.
    if let Ok(Some(head))=current(root){
        if decode(root,&head).is_ok(){
            return Err("Текущий портфель исправен. Восстановление не требуется.".into());
        }
    }
    let backup=backup_open(root)?;
    // Re-publish only after explicit user confirmation. Keep damaged head in quarantine.
    if root.join("head.json").exists(){
        let quarantine=root.join(format!("head-quarantine-{}.json",Uuid::new_v4()));
        fs::copy(root.join("head.json"),quarantine).map_err(|e|err("Карантин",e))?;
    }
    let previous=read_manifest(
        &backup_candidates(&root)?.into_iter().find(|p| {
            read_manifest(p).ok().and_then(|m|decode(&root,&m).ok()).is_some()
        }).ok_or("Резервная версия не найдена")?
    )?;
    let generation=Uuid::new_v4().to_string();
    let restored=Manifest{generation:generation.clone(),..previous};
    publish(&root,&root.join("head.json"),&to_json(&restored)?)?;
    let verified=read_manifest(&root.join("head.json"))?;
    if decode(root,&verified)?!=backup.snapshot {
        return Err("Восстановленная редакция не совпала при повторном чтении".into());
    }
    Ok(OpenResult{generation,snapshot:backup.snapshot,
        restored_from_backup:true,needs_confirmation:false})
}
#[tauri::command]
fn atlas_restore_previous(app:AppHandle)->Result<OpenResult,String>{
    restore_root(&path_for(&app)?)
}

#[cfg(test)]
mod persistence_tests{
    use super::*;
    struct Scratch(PathBuf);
    impl Drop for Scratch{fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
    fn scratch()->Scratch{
        let path=std::env::temp_dir().join(format!("iwxa-atlas-{}",Uuid::new_v4()));
        ensure_dirs(&path).expect("create temporary standalone store");
        Scratch(path)
    }
    fn snapshot(rev:u64,names:&[&str])->Value{
        serde_json::json!({"schema":"atlas.project/1","revision":rev,
        "portfolioLinks":[],"projects":names.iter().enumerate().map(|(i,name)|
          serde_json::json!({"id":format!("project-{i}"),"name":name,"items":[],
          "dependencies":[],"stages":[],"risks":[],"decisions":[],"sources":[]})
        ).collect::<Vec<_>>()})
    }
    #[test]fn empty_starts_clean_without_files(){
        let root=scratch();
        let loaded=load_root(&root.0).expect("open empty Atlas");
        assert_eq!(loaded.generation,"none");
        assert!(!loaded.needs_confirmation);
        assert_eq!(loaded.snapshot["revision"],0);
        assert!(!root.0.join("head.json").exists());
    }
    #[test]fn atomic_commit_readback_immutable_blocks_and_stale_generation(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A","B"])).unwrap();
        assert_eq!(first.project_blocks_written,2);
        let opened=load_root(&root.0).unwrap();
        assert_eq!(opened.generation,first.generation);
        assert_eq!(opened.snapshot["projects"][0]["name"],"A");
        let second=commit_root(&root.0,&first.generation,snapshot(2,&["A","B updated"])).unwrap();
        assert_eq!(second.project_blocks_written,1);
        assert_ne!(first.generation,second.generation);
        let opened_again=load_root(&root.0).unwrap();
        assert_eq!(opened_again.snapshot["revision"],2);
        assert_eq!(opened_again.snapshot["projects"][1]["name"],"B updated");
        assert!(commit_root(&root.0,&first.generation,snapshot(3,&["stale"])).is_err());
        assert_eq!(load_root(&root.0).unwrap().generation,second.generation);
        assert!(restore_root(&root.0).is_err()); // healthy state cannot be rolled back silently
    }
    #[test]fn first_saved_portfolio_recovers_after_head_loss_or_damage(){
        let root=scratch();
        let saved=commit_root(&root.0,"none",snapshot(1,&["First project"])).unwrap();
        assert_eq!(backup_candidates(&root.0).unwrap().len(),1);
        fs::remove_file(root.0.join("head.json")).unwrap();
        let missing=load_root(&root.0).unwrap();
        assert!(missing.needs_confirmation&&missing.restored_from_backup);
        assert_eq!(missing.generation,saved.generation);
        assert_eq!(missing.snapshot["projects"][0]["name"],"First project");
        assert!(commit_root(&root.0,"none",snapshot(2,&["Overwrite"])).is_err());
        let restored=restore_root(&root.0).unwrap();
        assert_eq!(restored.snapshot["projects"][0]["name"],"First project");
        assert!(!restored.needs_confirmation);
        fs::write(root.0.join("head.json"),"{damaged").unwrap();
        let damaged=load_root(&root.0).unwrap();
        assert!(damaged.needs_confirmation);
        assert_eq!(restore_root(&root.0).unwrap().snapshot["revision"],1);
        assert!(fs::read_dir(&root.0).unwrap().any(|entry|
            entry.unwrap().file_name().to_string_lossy().starts_with("head-quarantine-")));
    }
    #[test]fn missing_head_does_not_erase_retained_history(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A"])).unwrap();
        commit_root(&root.0,&first.generation,snapshot(2,&["B"])).unwrap();
        fs::remove_file(root.0.join("head.json")).unwrap();
        let recovery=load_root(&root.0).unwrap();
        assert!(recovery.needs_confirmation);
        assert_eq!(recovery.snapshot["projects"][0]["name"],"A");
        assert!(commit_root(&root.0,"none",snapshot(3,&["C"])).is_err());
        assert!(!root.0.join("head.json").exists());
    }
    #[test]fn corrupted_head_requires_explicit_recovery_and_quarantine(){
        let root=scratch();
        let first=commit_root(&root.0,"none",snapshot(1,&["A"])).unwrap();
        commit_root(&root.0,&first.generation,snapshot(2,&["B"])).unwrap();
        fs::write(root.0.join("head.json"),"{not valid json").unwrap();
        let candidate=load_root(&root.0).unwrap();
        assert!(candidate.restored_from_backup&&candidate.needs_confirmation);
        assert_eq!(candidate.snapshot["revision"],1);
        assert!(commit_root(&root.0,"none",snapshot(3,&["C"])).is_err());
        let result=restore_root(&root.0).unwrap();
        assert!(!result.needs_confirmation);
        assert_eq!(load_root(&root.0).unwrap().snapshot["revision"],1);
        assert!(fs::read_dir(&root.0).unwrap().any(|item|
            item.unwrap().file_name().to_string_lossy().starts_with("head-quarantine-")));
    }
    #[test]fn invalid_root_and_missing_backup_never_return_empty_portfolio(){
        let root=scratch();
        fs::write(root.0.join("head.json"),"{broken").unwrap();
        assert!(load_root(&root.0).is_err());
        assert!(restore_root(&root.0).is_err());
        assert_eq!(fs::read(root.0.join("head.json")).unwrap(),b"{broken");
    }
}
pub fn run(){
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            atlas_open,atlas_commit,atlas_export_json,atlas_select_import,atlas_restore_previous
        ])
        .run(tauri::generate_context!())
        .expect("IWXA Atlas desktop window could not be started");
}
